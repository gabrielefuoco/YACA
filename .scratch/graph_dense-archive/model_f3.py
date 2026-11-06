"""f3 — Multi-Subspace Encoder (3 rami disgiunti, 1 vettore a inferenza).

Z_sem   (768) : MLP su Bp(1024) + Bk(512)             -> target mercury
Z_field (768) : AutoInt sui campi meta (pooling per 17 campi, NO kw/hc) -> target fusion-v2
Z_beh   (512) : AutoInt sui campi meta + centroidi LOO -> target graph + Yc

A inferenza:  Z = [sqrt(a1)*norm(Z_sem) | sqrt(a2)*norm(Z_field) | sqrt(a3)*norm(Z_beh)]
I pesi (a1,a2,a3) NON entrano nel training: si scelgono dopo, senza riaddestrare.
"""
from __future__ import annotations

import math

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


class _FieldTransformer(nn.Module):
    """Pooling per campo (n_fields token fissi) + transformer + CLS."""

    def __init__(self, n_meta, n_fields, d_field=128, d_out=768,
                 n_head=8, n_layer=2, p=0.1):
        super().__init__()
        self.n_fields = n_fields
        self.tok = nn.Embedding(n_meta, d_field)
        self.fld = nn.Embedding(n_fields, d_field)
        nn.init.normal_(self.tok.weight, std=0.02)
        nn.init.normal_(self.fld.weight, std=0.02)
        self.cls = nn.Parameter(torch.randn(1, 1, d_field) * 0.02)
        layer = nn.TransformerEncoderLayer(d_field, n_head, 4 * d_field, p,
                                           batch_first=True, norm_first=True,
                                           activation="gelu")
        self.tr = nn.TransformerEncoder(layer, n_layer, enable_nested_tensor=False)
        self.out = nn.Sequential(nn.LayerNorm(d_field), nn.Linear(d_field, d_out))

    def _pool_fields(self, idx, off, val, fld):
        """idx/off/val = token nonzero di X_meta; fld = campo (-1 = ignora: kw/hc)."""
        keep = fld >= 0
        e = self.tok(idx[keep]) * val[keep].unsqueeze(1)
        f = fld[keep]
        B = off.numel()
        lens = torch.diff(torch.cat([off, off.new_tensor([idx.numel()])]))
        rows_full = torch.repeat_interleave(torch.arange(B, device=idx.device), lens)
        rows = rows_full[keep]
        flat = rows * self.n_fields + f
        pooled = torch.zeros(B * self.n_fields, e.shape[1], device=e.device,
                             dtype=e.dtype).index_add_(0, flat, e)
        cnt = torch.zeros(B * self.n_fields, device=e.device, dtype=e.dtype).index_add_(
            0, flat, torch.ones_like(flat, dtype=e.dtype))
        pooled = (pooled / cnt.clamp(min=1).unsqueeze(1)).view(B, self.n_fields, e.shape[1])
        pooled = pooled + self.fld.weight.unsqueeze(0)
        return pooled, cnt.view(B, self.n_fields) > 0

    def forward_seq(self, idx, off, val, fld, extra=None):
        B = off.numel()
        pooled, mask = self._pool_fields(idx, off, val, fld)
        h = torch.cat([self.cls.expand(B, -1, -1), pooled], 1)
        pad = torch.cat([torch.zeros(B, 1, dtype=torch.bool, device=idx.device), ~mask], 1)
        if extra is not None:                        # token centroide (BehBranch)
            h = torch.cat([h, extra.unsqueeze(1)], 1)
            pad = torch.cat([pad, torch.zeros(B, 1, dtype=torch.bool, device=idx.device)], 1)
        return self.tr(h, src_key_padding_mask=pad)[:, 0]

    def forward(self, idx, off, val, fld):
        return F.normalize(self.out(self.forward_seq(idx, off, val, fld)), dim=1)


class FieldBranch(_FieldTransformer):
    pass


class BehBranch(_FieldTransformer):
    def __init__(self, n_meta, n_fields, d_cent=64, d_field=128, d_out=512,
                 n_head=8, n_layer=2, p=0.1, use_cent=True):
        super().__init__(n_meta, n_fields, d_field, d_out, n_head, n_layer, p)
        self.use_cent = use_cent
        self.cent = nn.Linear(2 * d_cent, d_field) if use_cent else None

    def forward(self, idx, off, val, fld, mu_dir, mu_coll):
        c = self.cent(torch.cat([mu_dir, mu_coll], 1)) if self.use_cent else None
        cls = self.forward_seq(idx, off, val, fld, extra=c)
        return F.normalize(self.out(cls), dim=1)


class F3(nn.Module):
    def __init__(self, n_meta, n_fields, d_bp=1024, d_bk=512, d_cent=64, use_cent=True):
        super().__init__()
        self.sem = SemBranch(d_bp, d_bk, 768)
        self.field = FieldBranch(n_meta, n_fields, d_field=128, d_out=768)
        self.beh = BehBranch(n_meta, n_fields, d_cent=d_cent, d_field=128, d_out=512,
                             use_cent=use_cent)

    def forward(self, bp, bk, idx, off, val, fld, mu_dir, mu_coll):
        return (self.sem(bp, bk),
                self.field(idx, off, val, fld),
                self.beh(idx, off, val, fld, mu_dir, mu_coll))

    @staticmethod
    def concat(zs, zf, zb, a=(0.35, 0.35, 0.30)):
        return torch.cat([math.sqrt(a[0]) * zs, math.sqrt(a[1]) * zf,
                          math.sqrt(a[2]) * zb], 1)
