"""f3 — Multi-Subspace Encoder (3 rami disgiunti, 1 vettore a inferenza).

Z_sem   (768) : MLP su Bp(1024) + Bk(512)            -> target mercury
Z_field (768) : AutoInt sui 17 campi (no trama/kw)   -> target fusion-v2
Z_beh   (512) : AutoInt sui 17 campi + centroidi LOO -> target graph + Yc

A inferenza:  Z = [sqrt(a1)*norm(Z_sem) | sqrt(a2)*norm(Z_field) | sqrt(a3)*norm(Z_beh)]
Le norme L2 sono per ramo, quindi <Z_i,Z_j> = a1*cos_sem + a2*cos_field + a3*cos_beh.
I pesi (a1,a2,a3) NON entrano nel training: si scelgono dopo, senza riaddestrare.
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class SemBranch(nn.Module):
    def __init__(self, d_bp=1024, d_bk=512, d_out=768, p=0.1):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(d_bp + d_bk, 1024), nn.LayerNorm(1024), nn.GELU(), nn.Dropout(p),
            nn.Linear(1024, 768), nn.LayerNorm(768), nn.GELU(), nn.Dropout(p),
            nn.Linear(768, d_out),
        )

    def forward(self, bp, bk):
        return F.normalize(self.net(torch.cat([bp, bk], 1)), dim=1)


class FieldBranch(nn.Module):
    """AutoInt senza collo di bottiglia 512: CLS -> 768."""

    def __init__(self, n_fields, d_meta, d_field=128, d_out=768, n_head=8, n_layer=2, p=0.1):
        super().__init__()
        self.tok = nn.Embedding(n_fields, d_field)
        self.val = nn.Linear(1, d_field)
        nn.init.normal_(self.tok.weight, std=0.02)
        self.cls = nn.Parameter(torch.randn(1, 1, d_field) * 0.02)
        layer = nn.TransformerEncoderLayer(d_field, n_head, 4 * d_field, p,
                                           batch_first=True, norm_first=True)
        self.tr = nn.TransformerEncoder(layer, n_layer)
        self.out = nn.Sequential(nn.LayerNorm(d_field), nn.Linear(d_field, d_out))

    def encode(self, idx, off, val, fld):
        e = self.tok(fld) * val.unsqueeze(1) + self.val(val.unsqueeze(2))
        lens = torch.diff(torch.cat([off, off.new_tensor([idx.numel()])]))
        rows = torch.repeat_interleave(torch.arange(len(lens), device=idx.device), lens)
        B = len(lens); L = int(lens.max()) if lens.numel() else 1
        h = torch.zeros(B, L, e.shape[1], device=idx.device, dtype=e.dtype)
        h[rows, torch.arange(idx.numel(), device=idx.device) -
          torch.repeat_interleave(off, lens)] = e
        mask = torch.arange(L, device=idx.device)[None] < lens[:, None]
        h = torch.cat([self.cls.expand(B, -1, -1), h], 1)
        mask = torch.cat([torch.ones(B, 1, dtype=torch.bool, device=idx.device), mask], 1)
        return self.tr(h, src_key_padding_mask=~mask)[:, 0]       # CLS

    def forward(self, idx, off, val, fld):
        return F.normalize(self.out(self.encode(idx, off, val, fld)), dim=1)


class BehBranch(nn.Module):
    """AutoInt (istanza dedicata) + centroidi regista/collection -> 512."""

    def __init__(self, n_fields, d_cent=64, d_field=128, d_out=512, n_head=8, n_layer=2, p=0.1):
        super().__init__()
        self.tok = nn.Embedding(n_fields, d_field)
        self.val = nn.Linear(1, d_field)
        nn.init.normal_(self.tok.weight, std=0.02)
        self.cls = nn.Parameter(torch.randn(1, 1, d_field) * 0.02)
        layer = nn.TransformerEncoderLayer(d_field, n_head, 4 * d_field, p,
                                           batch_first=True, norm_first=True)
        self.tr = nn.TransformerEncoder(layer, n_layer)
        self.cent = nn.Linear(2 * d_cent, 2 * d_field)
        self.out = nn.Sequential(nn.LayerNorm(2 * d_field), nn.Linear(2 * d_field, d_out))

    def _tokens(self, idx, off, val, fld):
        e = self.tok(fld) * val.unsqueeze(1) + self.val(val.unsqueeze(2))
        lens = torch.diff(torch.cat([off, off.new_tensor([idx.numel()])]))
        rows = torch.repeat_interleave(torch.arange(len(lens), device=idx.device), lens)
        B = len(lens); L = int(lens.max()) if lens.numel() else 1
        h = torch.zeros(B, L, e.shape[1], device=idx.device, dtype=e.dtype)
        h[rows, torch.arange(idx.numel(), device=idx.device) -
          torch.repeat_interleave(off, lens)] = e
        mask = torch.arange(L, device=idx.device)[None] < lens[:, None]
        h = torch.cat([self.cls.expand(B, -1, -1), h], 1)
        mask = torch.cat([torch.ones(B, 1, dtype=torch.bool, device=idx.device), mask], 1)
        return h, mask

    def forward(self, idx, off, val, fld, mu_dir, mu_coll):
        h, mask = self._tokens(idx, off, val, fld)
        c = self.cent(torch.cat([mu_dir, mu_coll], 1)).unsqueeze(1)
        h = torch.cat([h, c], 1)
        mask = torch.cat([mask, torch.ones(mask.shape[0], 1, dtype=torch.bool,
                                           device=mask.device)], 1)
        return F.normalize(self.out(self.tr(h, src_key_padding_mask=~mask)[:, 0]), dim=1)


class F3(nn.Module):
    def __init__(self, n_fields, d_bp=1024, d_bk=512, d_cent=64):
        super().__init__()
        self.sem = SemBranch(d_bp, d_bk, 768)
        self.field = FieldBranch(n_fields, d_bp, 128, 768)
        self.beh = BehBranch(n_fields, d_cent, 128, 512)

    def forward(self, bp, bk, idx, off, val, fld, mu_dir, mu_coll):
        zs = self.sem(bp, bk)
        zf = self.field(idx, off, val, fld)
        zb = self.beh(idx, off, val, fld, mu_dir, mu_coll)
        return zs, zf, zb

    @staticmethod
    def concat(zs, zf, zb, a=(0.35, 0.35, 0.30)):
        """Pesi a inferenza: sqrt(a) sui rami gia' L2-normalizzati."""
        import math
        return torch.cat([math.sqrt(a[0]) * zs, math.sqrt(a[1]) * zf,
                          math.sqrt(a[2]) * zb], 1)
