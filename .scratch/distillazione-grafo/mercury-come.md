# Mercury (decision model) — come lo abbiamo usato

Note raccolte dal codice e dai risultati delle run del 24-25 ottobre, per riusarlo sul reranker.

## L'API

`POST https://openrouter.ai/api/alpha/decisions`

```json
{
  "model": "inception/mercury-decide:free",
  "state": "<testo libero: scheda del titolo + le liste candidate>",
  "questions": {
    "best": {"type": "choice", "instructions": "...", "criteria": {"<label>": "<descrizione>", "...": "..."}},
    "c1":   {"type": "noul", "instructions": "..."}
  }
}
```

Risposta: `{"answers": {"best": {"choice": "...", "probabilities": {...}, "confidence": 0.99},
"c1": {"noul": 0.87}}}`

Due tipi di domanda, entrambi usati:

| tipo | forma | cosa torna | uso |
|---|---|---|---|
| `choice` | una scelta fra opzioni **mutuamente esclusive** (le chiavi di `criteria`) | `choice` + `probabilities` che **sommano a 1** + `confidence` | giudicare liste intere |
| `noul` | una domanda sì/no, anche 50 in una sola chiamata | uno scalare in [0,1] per domanda | giudicare i singoli candidati |

**È il softmax su opzioni esclusive che rende i pesi utilizzabili**: le probabilità sono una
distribuzione, quindi si possono usare direttamente come pesi di una combinazione convessa. Un
sì/no per documento (come Qwen3-Reranker) no.

**Auth**: `OPENROUTER_API_KEY`, altrimenti `~/.pi/agent/auth.json` → `["openrouter"]["key"]`.
Modello sovrascrivibile con `JEV_MODEL` (default `inception/mercury-decide:free`).
**Robustezza**: 8 tentativi, backoff `0.5+0.5t`, i 429 contati a parte, timeout 180-240 s,
checkpoint jsonl in append con ripresa per chiave. Concorrenza 8 in `rerank-mercury.py`, 50 in
`build_target.py`.

## I tre usi

### 1. Scegliere un iperparametro — `rerank-mercury.py`

33 titoli × 5 varianti di ordinamento (λ = boost comportamentale su similarità latente: 0 · 0,15 ·
0,3 · 0,6 · 1,0). Una chiamata `choice` per titolo, con le 5 liste nel `state`.

Risultato reale (media delle probabilità su 33 titoli):

| λ | prob media |
|---|---:|
| **0,0 (nessun boost)** | **0,613** |
| 0,3 | 0,166 |
| 0,15 | 0,160 |
| 0,6 | 0,044 |
| 1,0 | 0,017 |

Mercury è **netto**: confidenza 0,99 su Oppenheimer, λ=0,0 a 0,992. Non è un giudice timido, e non
si limita a pareggiare.

> **Attenzione al criterio**: qui la domanda era «la migliore lista di film **SIMILI** (tema, tono,
> stile)». Il giudizio sul boost comportamentale dipende da come si formula la domanda. Con
> «cosa guarderebbe **dopo**» la risposta può essere diversa. Il criterio deve essere lo stesso
> della promessa di prodotto, altrimenti stiamo misurando un'altra cosa.

### 2. Costruire il target dello student — `build_target.py`

Il pezzo che conta, in tre passi (una chiamata `choice` + una chiamata con 50 `noul` per titolo):

1. **Sette liste candidate**, top-8 ciascuna: `graph` (triangolo V10) · `cov` (co-visione MovieLens)
   · `trama` · `kw` · `meta` · `cont` (cosine di contenuto) · `combo`.
2. `choice` su quale lista è la migliore → probabilità sui 7 pool (+ `none`).
3. **Le probabilità diventano pesi di miscela fra i VETTORI DI PUNTEGGIO**, non fra le liste:

   ```python
   mix = Σ_x  (p_x / Σp) · (score_x / max(score_x))
   ```

   Da `mix` si prendono i **top-50** come candidati.
4. Sui 50 candidati, 50 domande `noul` («è un buon film simile?») → `p_q`.
   Peso finale: `soft = mix[cand] · (0,2 + p_q)`, riordinato e **normalizzato a somma 1**.
5. Salvato in `mercury-target.jsonl` / `.npz` come `(idx, w)` con `w` che somma a 1.

Poi `build-negatives.py` usa i **pool scartati** come negativi difficili, con peso
`(1 - p_pool)(1 - none)`, proteggendo i top-3 del pool scelto.

E infine lo student: la loss è `-(P · log_softmax(logits))` con `P` distribuzione su tutti i
66.259 titoli. **Target e modello sono entrambi distribuzioni, quindi il confronto è ben posto** —
è questo che rende il softmax di Mercury utilizzabile come target di addestramento.

### 3. Cosa ha davvero imparato lo student (dato utile, e scomodo)

Distribuzione del pool **scelto come migliore** su 66.259 titoli:

| pool | quota |
|---|---:|
| `cont` (cosine di contenuto) | **42,6%** |
| `trama` | 24,3% |
| `graph` (V10) | **11,4%** |
| `combo` | 9,9% |
| `meta` | 5,8% |
| `none` | 2,5% |
| `kw` | 2,3% |
| `cov` (co-visione) | 1,2% |

Quindi **RRFST non è una distillazione di V10**: è una distillazione del *gusto di Mercury*, in cui
la lista del grafo pesa per l'11%. Il segnale comportamentale (`cov`) è all'1,2%. Spiega perché
V13/V14 hanno una firma da «filmografia e contenuto» e non da «pubblico»: l'hanno imparata da lì,
e poi quel tipo vota in RRF con peso 1,0.

**Conferma della calibrazione**: la probabilità massima del pool vincente ha mediana **0,747**
(p10 0,434 · p90 0,951): Mercury si sbilancia. Il filtro `noul` tiene in mediana **8 candidati su
50** con `p ≥ 0,3` (min 0, max 50): seleziona, non azzera. Confronto con Qwen3-Reranker, dove la
mediana delle probabilità era **0,0008** — tre ordini di grandezza di differenza.

## Applicazione al reranker (quello che vogliamo provare)

Due protocolli, entrambi riusano il codice esistente.

**B1 — per candidato (`noul`)**: una chiamata per seme, 40 domande, `p_i` per ogni candidato.
Fusione `1/(20 + rango_grafo) + μ·(0,2 + p_i)`. È il gemello esatto dell'esperimento fatto con
Qwen3 (stessi 40 casi, stessi 40 candidati), quindi il confronto è **controllato**: a parità di
tutto, cambia solo il giudice.

**B2 — listwise (`choice`)**: generare K varianti dell'ordinamento, far scegliere Mercury, e
miscelare i **punteggi** con le probabilità (come al punto 3 di `build_target.py`). È il protocollo
«più impattante»: se una variante prende 0,9 l'ordine cambia davvero, se le varianti si dividono
0,3/0,3/0,4 la miscela è morbida. Con Qwen3 questo non si poteva fare: non c'era una distribuzione
fra alternative.

**Blocco attuale**: la chiave in `~/.pi/agent/auth.json` è un token del proxy pi ed è **scaduta**
(`401 API key expired`). Serve rifare l'autenticazione o fornire una chiave OpenRouter valida.
