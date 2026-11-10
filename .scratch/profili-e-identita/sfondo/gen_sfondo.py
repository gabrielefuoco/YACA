"""Genera lo sfondo di YACA come immagine vera, non come gradienti CSS.

Perché un'immagine: i gradienti in `vw` dentro un contenitore diventano un colore
piatto (la sfera è più grande del riquadro, se ne vede solo il centro). Un'immagine
si guarda, si misura e si adatta con `background-size: cover`.

Regola di progetto: NIENTE FORME. La luce è un lavaggio a bassa frequenza
(seno di una finestra), il calore è un alone in basso a sinistra, la grana è
rumore fine statico. Nessun contorno riconoscibile, nessuna sfera visibile.

Uso:
    py .scratch/profili-e-identita/sfondo/gen_sfondo.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

# --- Tavolozza (dai token esistenti, nessun colore nuovo) --------------------
BEIGE = np.array([238, 217, 185], dtype=np.float64)        # --background
IVORY = np.array([253, 250, 245], dtype=np.float64)        # --background-light
CREAM = np.array([245, 226, 195], dtype=np.float64)        # --marrow-cream
TERRACOTTA = np.array([213, 62, 15], dtype=np.float64)     # --accent
MAROON = np.array([155, 15, 6], dtype=np.float64)          # --primary

W, H = 1920, 1080
RNG = np.random.default_rng(20261108)


def _falloff(w: int, h: int, cx: float, cy: float, radius: float, power: float) -> np.ndarray:
    """Campo radiale morbido normalizzato in [0,1], senza bordi visibili."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float64)
    d = np.sqrt((x - cx * w) ** 2 + (y - cy * h) ** 2) / (radius * max(w, h))
    return np.clip(1.0 - d, 0.0, 1.0) ** power


def _smooth_noise(w: int, h: int, cell: int) -> np.ndarray:
    """Rumore a bassa frequenza: poche celle casuali, poi ingrandite e sfocate."""
    small = RNG.random((max(2, h // cell), max(2, w // cell)))
    img = Image.fromarray((small * 255).astype(np.uint8), mode="L").resize((w, h), Image.BICUBIC)
    img = img.filter(ImageFilter.GaussianBlur(radius=cell * 0.8))
    a = np.asarray(img, dtype=np.float64) / 255.0
    a -= a.min()
    return a / max(a.max(), 1e-9)


def build() -> tuple[np.ndarray, dict]:
    # 1. Base beige, leggermente più chiara in alto: la pagina deve avere un "sopra".
    y_grad = np.linspace(0.0, 1.0, H)[:, None]
    base = BEIGE[None, None, :] * (1.0 - 0.06 * y_grad[..., None]) + IVORY[None, None, :] * (0.06 * y_grad[..., None])

    # 2. Luce: finestra in alto a destra, larga e senza centro percepibile.
    luce = _falloff(W, H, 0.82, 0.08, 1.15, 1.35)
    luce += 0.35 * _smooth_noise(W, H, 90)  # irregolarità: la luce non è un cerchio
    luce = np.clip(luce / luce.max(), 0.0, 1.0) ** 1.05

    # 3. Calore: terracotta in basso a sinistra, tenue, con dentro il marrone profondo.
    calore = _falloff(W, H, 0.06, 0.98, 0.85, 1.6)
    calore = np.clip(calore * (0.75 + 0.35 * _smooth_noise(W, H, 140)), 0.0, 1.0)

    img = base.copy()
    img = img * (1.0 - 0.55 * luce[..., None]) + IVORY[None, None, :] * (0.55 * luce[..., None])
    misto = TERRACOTTA * 0.45 + MAROON * 0.55
    img = img * (1.0 - 0.16 * calore[..., None]) + misto[None, None, :] * (0.16 * calore[..., None])

    # 4. Grana: rumore fine, statico, ±2 livelli. Si vede come carta, non come disturbo.
    grana = RNG.normal(0.0, 1.15, size=(H, W, 1))
    img = img + grana

    # 5. Vignettatura appena accennata agli angoli, per non lasciare il bordo "tagliato".
    vig = 1.0 - 0.10 * _falloff(W, H, 0.5, 0.5, 1.0, 3.0)
    img = img * vig[..., None]

    out = np.clip(img, 0, 255).astype(np.uint8)
    return out, {"luce": float(luce.max() * 0.55), "calore": float(calore.max() * 0.16)}


def main() -> int:
    arr, info = build()
    dest = Path(__file__).resolve().parent / "sfondo.png"
    Image.fromarray(arr, "RGB").save(dest, optimize=True)

    # Misure: una differenza invisibile è un fallimento, e qui si vede in numeri.
    lum = arr.astype(np.float64).mean(axis=2)
    p5, p95 = np.percentile(lum, 5), np.percentile(lum, 95)
    delta = p95 - p5
    varianti = np.abs(arr.astype(np.int16) - np.array([238, 217, 185], dtype=np.int16)).max(axis=2)
    print(f"file     : {dest} ({dest.stat().st_size / 1024:.1f} KB)")
    print(f"luminanza: p5={p5:.1f} p95={p95:.1f}  escursione={delta:.1f} (serve > 18)")
    print(f"delta max vs beige piatto: {varianti.max()} livelli, mediana {np.median(varianti):.0f}")
    if delta < 18:
        print("SCARTO INSUFFICIENTE: lo sfondo sarebbe invisibile.")
        return 1
    print("OK: l'escursione si vede a colpo d'occhio.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
