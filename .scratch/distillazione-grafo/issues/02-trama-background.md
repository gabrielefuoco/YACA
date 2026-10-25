Status: resolved
Type: task
Blocked by: 01

# 02 — Embedding trama qwen3, in background

`embed_trama.py`: payload «titolo. trama» dai Parquet TMDB (`.cache/tmdb`), output
`data/trama-qwen3b.npy` + `-idx.npy`, checkpoint ogni 500, ripresa da `.npy`/`-idx`, log e
`state.json`. Modello `Qwen/Qwen3-Embedding-0.6B` via `sentence-transformers`; `cuda` se
disponibile, altrimenti CPU. Il job parte in background e si può interrompere senza perdere i
lotti fatti. 35.829 trame attese, 1024-d, ~140 MiB.

Acceptance: il file esiste, `-idx` è ordinato e allineato al canone, il log mostra i checkpoint;
se il modello non è disponibile, il job lo dice e non corrompe i file.

## Esito (in corso)
Job avviato in background (`data/embed.pid`, log `data/embed.log`): modello qwen3 in download
(198 MB di ~1,2 GB), 0/35.891 encodate, checkpoint ogni 500, CPU (torch 2.13+cpu). Al termine:
rilanciare `train_a1` (carica `plot_embedding` se c'è).

## Esito (chiuso)
35.891/35.891 in 864 s sulla RTX 3060 (driver 565.90, CUDA 12.6, torch 2.14.1+cu126), ~42/s,
checkpoint ogni 500. Il primo tentativo CPU aveva fatto 500 in 94 min: fermato e ripreso dal
checkpoint. `data/trama-qwen3b.npy` (259 MB) + `-idx` + `state.json` (device cuda).
