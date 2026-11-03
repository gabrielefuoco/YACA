Status: resolved
Type: task
Blocked by: 01

# Gate di popolarità asimmetrico

## Il difetto

In `mixer.gate_popolarita` la penalità è simmetrica: `exp(-max(0,|log1p(v_i)-log1p(v_j)|-tau)/slope)`.
Un seme popolare non può scendere verso un film di culto (perde *Josie and the Pussycats*, *EDtv*)
esattamente come un film di nicchia non può salire verso un blockbuster (dove il filtro serve).
Misurato: allentare `tau` migliora il banco (R@10 0,090→0,101) ma alza la quota >5k (66%→73%).

## Cosa fare

Rendere il gate asimmetrico:

```
penalità applicata solo quando  v_j > v_i * K          (il candidato è più popolare del seme)
nessuna penalità quando         v_j < v_i  e  vave_j >= 6.8  e  runtime_j >= 85
penalità normale quando         v_j < v_i  ma è un direct-to-video (runtime < 85 o vave < 6.8)
```

dove `K` è da tarare (partire da 10). Le soglie su `VAVE` e `runtime` sono già in `metadati-canone.npz`.

## Criteri di accettazione

- La quota >5k in top-10 sui 200 semi popolari scende sotto il 60% **senza** perdere più di 0,005 di
  R@20 rispetto a `tau=2.0` (IC del ticket 01).
- Su *Barbie* i cartoni direct-to-video Mattel restano fuori; *Josie and the Pussycats* e *EDtv*
  rientrano nella riga se hanno un punteggio che lo giustifica.
- Il gate è documentato in `parametri.py` con il numero misurato, non con un'intuizione.

---

## Esito

`gate_popolare_asimmetrico` in `mixer.py` (`--gate-asimmetrico`, `--gate-k`, `--gate-vave`,
`--gate-runtime`), con `_runtime()` che legge la durata dai Parquet (i metadati non la hanno).
Misurato contro il gate simmetrico `tau=2,0`, stesso resto della pipeline, chiusura `log`:

| grafo | R@5 | R@10 | R@20 | MRR | >5k top-10 | SNIPS |
|---|---:|---:|---:|---:|---:|---:|
| simmetrico tau 2,0 | 0,146 | 0,204 | 0,264 | 0,1023 | 72,3% | 0,156 |
| **asimmetrico** | 0,145 | 0,205 | 0,264 | 0,1023 | **70,9%** | 0,161 |

`R@20 +0,0002 · SNIPS +0,0048 [−0,0026, +0,0145]` → entrambe **sotto l'MDE**: non si può dire che
migliori. La coda guadagna 1,4 punti (non i 12 che servivano per arrivare sotto il 60%).

**Verdetto**: il criterio di accettazione (>5k sotto il 60% senza perdere 0,005 di R@20) **non è
raggiunto**. Il gate asimmetrico è innocuo e va tenuto perché non costa niente, ma la leva per la coda
era un'altra: la COVISION temporale (ticket 03, −6,8 punti). Su *Barbie* non cambia nulla.
