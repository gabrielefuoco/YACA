Status: ready-for-agent
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
