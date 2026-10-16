Status: resolved
Type: bug

# Il job notturno usa V3 per la bolla macro, e `colloca` legge ancora la partizione V8
**Prova**, due punti:
 1. `graph/pipeline.py:355` (dentro `esporta --colloca`): `S = CO.carica(v3=True)` e poi `colloca(dd,
    tipo, S)` **senza** `S_macro`. Ma in `collocator.py:244`, se `S_macro` e' `None` si usa `S` anche
    per la **macro** — scendendo dal **63,0%** (V1) al **35,3%** (V3). La stessa funzione righe 165-171
    lo fa bene (`S_v1 = C.carica(v3=False)` e `S_macro=S_v1`).
 2. `graph/pipeline.py:167` (dentro `colloca`): `mem = np.load(K.A("bolle-nitrile-V8.npy"))` — la
    partizione **superata**. `collocator.py:112` lo dice esplicitamente: la partizione e' quella
    finale. Qui e' rimasto V8, quindi i `membri` stampati vengono dalla partizione sbagliata.
**Fix**: punto 1, caricare `S_v1` e passarlo. Punto 2, `K.A("bolle-eterogeneo-subvoti.npy")`.
**Chiuso quando**: `python -m graph.pipeline colloca` stampa membri coerenti con le bolle finali, e
`esporta --colloca` usa V1 per la macro.

---

RISOLTO il 16/10/2026: `colloca` legge `bolle-eterogeneo-subvoti.npy` (era V8) e `esporta --colloca` carica `S_v1` e passa `S_macro=S_v1`. Il giro completo resta non eseguito (ticket 14 di handoff-6: oggi collocherebbe zero titoli).
