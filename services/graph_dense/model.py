"""Studente gated: metadati (EmbeddingBag), trama (Linear) e set di cluster keyword (PMA)."""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

from . import config as C


class SetPool(nn.Module):
    """Pooling by multi-head attention su un set di vettori, con pesi e maschera.

    Multi-vettore in ingresso, singolo vettore in uscita: il set di cluster keyword resta
    fino all'attention, quindi il modello sceglie *quali* temi contano per quel film.
    """

    def __init__(self, d_in=384, d=C.HIDDEN, heads=4, n_levels=3, n_tags=0):
        super().__init__()
        self.proj = nn.Linear(d_in, d)
        self.lvl = nn.Embedding(n_levels, d) if n_levels else None
        self.tag = nn.Embedding(n_tags + 1, d) if n_tags else None   # +1 = pad
        self.q = nn.Parameter(torch.zeros(1, 1, d))
        self.attn = nn.MultiheadAttention(d, heads, batch_first=True, dropout=C.DROP)
        self.ln1 = nn.LayerNorm(d)
        self.ln2 = nn.LayerNorm(d)
        self.ff = nn.Sequential(
            nn.Linear(d, d * 2), nn.GELU(), nn.Dropout(C.DROP), nn.Linear(d * 2, d),
        )

    def forward(self, x, w, mask, lvl=None, tag=None):
        # x (B,K,384) · w (B,K) · mask (B,K) bool · lvl (K,) livello · tag (B,K) cluster L2
        b = x.shape[0]
        anyk = mask.any(1, keepdim=True)
        mask = mask.clone()
        mask[:, 0] |= ~anyk.squeeze(1)          # almeno una chiave valida per l'attention
        h = self.proj(x)
        if self.lvl is not None and lvl is not None:
            h = h + self.lvl(lvl).unsqueeze(0)
        if self.tag is not None and tag is not None:
            h = h + self.tag(tag.clamp(min=0))
        h = h * (w * mask.float()).unsqueeze(-1)
        q = self.q.expand(b, -1, -1)
        a, _ = self.attn(q, h, h, key_padding_mask=~mask, need_weights=False)
        h = self.ln1(q.squeeze(1) + a.squeeze(1))
        h = self.ln2(h + self.ff(h))
        return h


class GatedStudent(nn.Module):
    def __init__(self, n_meta, d_plot=1, d_emb=C.DIM, n_bolle=2922, d_kw=0, n_levels=3, n_tags=0):
        super().__init__()
        self.meta_bag = nn.EmbeddingBag(n_meta, C.HIDDEN, mode="sum", include_last_offset=False)
        self.meta_ln = nn.LayerNorm(C.HIDDEN)
        self.plot_proj = nn.Linear(d_plot, C.HIDDEN)
        self.plot_ln = nn.LayerNorm(C.HIDDEN)
        self.med = nn.Embedding(2, C.HIDDEN)
        self.d_kw = d_kw
        if d_kw:
            self.setpool = SetPool(d_kw, C.HIDDEN, n_levels=n_levels, n_tags=n_tags)
            self.kw_ln = nn.LayerNorm(C.HIDDEN)
            self.gate = nn.Sequential(nn.Linear(C.HIDDEN * 3 + 3, 3), nn.Identity())
        else:
            self.gate = nn.Sequential(nn.Linear(C.HIDDEN * 2 + 2, C.HIDDEN), nn.Sigmoid())
        self.drop = nn.Dropout(C.DROP)
        self.res = nn.Sequential(
            nn.Linear(C.HIDDEN, C.HIDDEN), nn.LayerNorm(C.HIDDEN), nn.GELU(),
            nn.Dropout(C.DROP), nn.Linear(C.HIDDEN, d_emb),
        )
        self.out_proj = nn.Linear(C.HIDDEN, d_emb, bias=False) if C.HIDDEN != d_emb else nn.Identity()
        self.proto = nn.Parameter(torch.randn(n_bolle, d_emb) * 0.05)

    def forward(self, idx, off, val, plot, has_plot, is_tv,
                kw=None, kw_w=None, kw_mask=None, kw_lvl=None, kw_tag=None):
        h_meta = self.drop(F.gelu(self.meta_ln(self.meta_bag(idx, off, per_sample_weights=val))))
        h_plot = self.drop(F.gelu(self.plot_ln(self.plot_proj(plot))))
        mask = has_plot.float().unsqueeze(1)
        h_plot = h_plot * mask
        if self.d_kw and kw is not None:
            h_kw = self.drop(F.gelu(self.kw_ln(self.setpool(kw, kw_w, kw_mask, kw_lvl, kw_tag))))
            m_kw = kw_mask.any(1).float().unsqueeze(1)
            h_kw = h_kw * m_kw
            lg = self.gate(torch.cat([h_meta, h_plot, h_kw, mask, m_kw,
                                      is_tv.float().unsqueeze(1)], dim=1))
            allow = torch.stack([torch.ones_like(has_plot), has_plot, kw_mask.any(1)], dim=1)
            lg = lg.masked_fill(~allow, -1e4)
            a = torch.softmax(lg, dim=1)
            h = a[:, 0:1] * h_meta + a[:, 1:2] * h_plot + a[:, 2:3] * h_kw + self.med(is_tv.long())
        else:
            g = self.gate(torch.cat([h_meta, h_plot, mask, is_tv.float().unsqueeze(1)], dim=1)) * mask
            h = (1.0 - 0.5 * g) * h_meta + g * h_plot + self.med(is_tv.long())
        z = self.out_proj(h) + self.res(h)
        return F.normalize(z, p=2, dim=1)

    def bolla_logits(self, z):
        return (z @ F.normalize(self.proto, p=2, dim=1).T) / C.TAU_BOLLA


class TokenStudent(nn.Module):
    """Encoder a token: niente somma, self-attention sui token del film.

    Il dato e' gia' un multi-vettore (i token non-zero di `X_meta`); qui resta un set fino alla
    fine: embedding per token + peso tf-idf, un token di trama, un CLS, due layer di attention.
    Il pooling e' il CLS (multi-vettore in ingresso, singolo vettore in uscita).
    """

    def __init__(self, n_meta, d_plot=1, d_emb=C.DIM, n_bolle=2922, heads=4, layers=2):
        super().__init__()
        H = C.HIDDEN
        self.emb = nn.Embedding(n_meta, H)
        self.val = nn.Linear(1, H)
        self.cls = nn.Parameter(torch.zeros(1, 1, H))
        self.plot_proj = nn.Linear(d_plot, H)
        self.plot_flag = nn.Parameter(torch.zeros(1, 1, H))
        self.med = nn.Embedding(2, H)
        layer = nn.TransformerEncoderLayer(
            H, heads, H * 2, dropout=C.DROP, batch_first=True,
            norm_first=True, activation="gelu",
        )
        self.tr = nn.TransformerEncoder(layer, layers, enable_nested_tensor=False)
        self.ln = nn.LayerNorm(H)
        self.res = nn.Sequential(
            nn.Linear(H, H), nn.LayerNorm(H), nn.GELU(), nn.Dropout(C.DROP),
            nn.Linear(H, d_emb),
        )
        self.out_proj = nn.Linear(H, d_emb, bias=False) if H != d_emb else nn.Identity()
        self.proto = nn.Parameter(torch.randn(n_bolle, d_emb) * 0.05)

    def forward(self, ids, vals, mask, plot, has_plot, is_tv):
        h = (self.emb(ids) + self.val(vals.unsqueeze(-1))) * mask.unsqueeze(-1)
        b = h.shape[0]
        p = (self.plot_proj(plot).unsqueeze(1) + self.plot_flag) * has_plot.float().view(b, 1, 1)
        h = torch.cat([self.cls.expand(b, -1, -1), h, p], dim=1)
        m = torch.cat([torch.ones(b, 1, dtype=torch.bool, device=h.device), mask,
                       has_plot.view(b, 1)], dim=1)
        h = self.tr(h, src_key_padding_mask=~m)
        z = self.ln(h[:, 0]) + self.med(is_tv.long())
        z = self.out_proj(z) + self.res(z)
        return F.normalize(z, p=2, dim=1)

    def bolla_logits(self, z):
        return (z @ F.normalize(self.proto, p=2, dim=1).T) / C.TAU_BOLLA
