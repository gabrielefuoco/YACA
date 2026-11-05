# Handoff 5 — cosa è stato accettato, cosa è stato misurato

Risposta a `risp5.md` del senior. Tutte le misure sono sul dev set umano (166 casi, 3.063 link) e sul
banco curato (499 sorgenti, 3.533 link), con bootstrap appaiato per sorgente; i 40 semi di sempre
sono stati riletti a occhio.

## 1. I cinque bug dichiarati, verificati

| # | dichiarazione | esito | prova |
|---|---|---|---|
| 1 | `contesti.py` normalizza `H` in-place e compensa `W` per 1,0 | **vero** | riga 194-195. `scelta_k.py` lo faceva già bene |
| 2 | il pavimento `log(1e-9)` domina il coseno | **vero ma gonfiato** | assente −15,6 vs presente −8,6. Dopo la centratura gli zeri portano il **12,4%** dell'energia; correlazione col solo supporto binario **0,525** (non ~1) |
| 2b | `amore_res.py` stampa i primi film del canone invece dei vicini | **vero** | riga 109: `argsort(-V[i])` dà indici di **tema** (0-23), poi `B['titoli'][j]`. Idem `scelta_k.py:111` |
| 3 | il 32,6% del coseno di RRFST è `TRAMA` grezza | **aritmetica vera, conseguenza falsa** | scomposizione sotto |
| 4 | `mixer.py` legge `tipi/manifest.json` hardcoded | **vero** | riga 378, non 269 |
| 5 | `covision.py` ignora `TRAKT_CACHE`; `RELEASE==0` classifica tutto come tardivo | **metà vero** | il percorso era fisso (corretto), ma `TRAKT_CACHE` di `build_graph.py` è il **file** npz, non la cartella: usarlo azzera la fonte Trakt (misurato: 0 file). `RELEASE==0` tocca 18 titoli su 76.497 nel build → nessun effetto |

### Il bug 3, scomposto

`BlockStudent.forward` fa `cat([0.8·Bp, 0.57·Bk, 1.0·h])`: dopo la normalizzazione la trama pesa
0,64/1,9649 = **32,6%** del coseno. Vero. Ma la conseguenza che ne deduce — che RRFST reintroduca la
trama e per questo *Povere creature!* scende — **non regge**. Rango di ogni candidato usando un solo
blocco alla volta:

| blocco | Povere creature! | La sirenetta | Super Mario |
|---|---:|---:|---:|
| trama | **#17.980** | #4.056 | #416 |
| keyword | #58.425 | #9.020 | #66.453 |
| meta (attori/società) | **#187** | #98 | #678 |

Il rango di V42D (#183) è spiegato dal blocco **meta** (#187), non dalla trama. Inoltre i tre file
studente sono tutti `(76497, 2048)` = 1024+512+512: la ricostruzione «V15 era un modello a 4 blocchi da
2560» è **smentita dagli artefatti**.

## 2. Fix accettati e applicati

| fix | file | effetto misurato |
|---|---|---|
| norma NMF salvata prima di dividere | `contesti.py` | — |
| smoothing di Dirichlet al posto del pavimento 1e-9 | `contesti_tipo.py`, `amore_res.py` | CONTESTI da solo: R@20 0,0042 → **0,0071**, tonal@10 0,209 → **0,390** |
| stampa diagnostica sui vicini veri | `amore_res.py`, `scelta_k.py` | — |
| manifest non più hardcoded | `mixer.py` | build possibile su macchina pulita |
| cartella Trakt configurabile (`TRAKT_DIR`) | `covision.py` | — |
| `RELEASE==0` allineato fra i due loader | `covision.py` | nullo (18 titoli) |
| `HOLDOUT_AUTORI` configurabile | `listsem.py` | serve ai 5 blocchi |
| `ndcg_per_sorgente` + `permutazione_segni` | `valuta.py` | strumenti nuovi |
| `--temperatura TIPO:k:tronca` (RRF con taglia) | `mixer.py` | esperimento §4 |

**V45** = i fix sopra, stessi pesi di V42, studente proprio (`rrfstudent-norrfst`).
Dev set: **+0,0001** vs V42E (rumore). Banco curato: −0,0008 (rumore). I fix sono sicuri: cambiano le
teste dei tipi, non l'aggregato.

## 3. Diagnosi per tipo (la tabella che mancava)

Ogni tipo da solo sul dev set: `r20` = recall@20; `rescue15` = fra i link che il grafo base sbaglia,
quanti il tipo mette nei primi 15; `tonal@10` = quota dei primi 10 che sono target di almeno un caso umano.

| tipo | peso in V42 | r20 | rescue15 | tonal@10 |
|---|---:|---:|---:|---:|
| LIST | 1,00 | **0,0463** | 0,014 | 0,402 |
| LISTSEM | **0,15** | **0,0469** | **0,020** | **0,485** |
| RRFST | 1,00 | 0,0316 | 0,008 | 0,312 |
| PROD | 0,30 | 0,0189 | 0,006 | 0,155 |
| CREWPROP | **0,15** | 0,0177 | 0,008 | 0,231 |
| KWSEM | **1,40** | 0,0151 | 0,007 | **0,106** |
| TRAMA | 0,15 | 0,0131 | 0,008 | 0,086 |
| COVISION | 0,80 | 0,0127 | 0,005 | 0,360 |
| CAST | 0,40 | 0,0075 | 0,002 | 0,082 |
| CONTESTI | 0,20 | 0,0071 | 0,003 | 0,390 |
| TRIBU | 0,15 | 0,0061 | 0,002 | 0,210 |
| RESID | **1,20** | 0,0059 | 0,004 | 0,316 |
| COLL | 0,50 | 0,0025 | 0,000 | 0,275 |
| DIR | **1,00** | 0,0003 | 0,000 | 0,287 |

I pesi sono quasi **inversamente** ordinati rispetto alla qualità misurata. Le teste dei singoli tipi
per Barbie, in chiaro: CONTESTI e RESID davano *speciali di stand-up comedy* (il pavimento: la testa era
decisa dagli zeri condivisi); KWSEM dà documentari sul patriarcato; TRAMA dà fantascienza di serie B;
LISTSEM dà film da premio; **CREWPROP** dà *Lady Bird, The Meyerowitz Stories, L'ufficio di Jessica
James* — la testa migliore di tutte, a peso 0,15.

## 4. Riallineare i pesi: due strumenti, due risposte opposte

| variante | dev umano (166) | banco curato (499) | >5k top-10 | *Povere creature!* in Barbie |
|---|---:|---:|---:|---:|
| V45 (base) | 0,026 | **0,267** | 70,7% | #302 |
| temperatura (k=3, taglia 15 sui tipi specialistici) | 0,025 (−0,0009, ns) | 0,260 (**−0,0068**, sopra MDE) | 68,3% | #176 |
| riallineato alla diagnosi | **0,036** (+0,0099, IC [+0,0022, +0,0189]) | 0,230 (**−0,0368**, sopra MDE) | 74,8% | **#30** |
| riallineamento mite | 0,027 (+0,0011, ns) | 0,250 (**−0,0167**, sopra MDE) | 74,3% | #92 |
| V42E | 0,026 | 0,267 | 69,4% | #192 |

**Il riallineamento vince sul dev umano e perde sul banco curato, di un fattore 3,7.** La ragione è
strutturale: il dev set è fatto di **liste Trakt**, e LIST/LISTSEM sono esattamente «liste Trakt». Il
tipo che vince è quello che ripete il generatore dell'etichetta. Non è un guadagno: è un adattamento
allo strumento.

Dall'altro lato il banco curato è scritto da LLM, e sappiamo già (V15) che può premiare un curatore
artificiale. **Nessuno dei due strumenti arbitra questa scelta.**

A occhio, però, il riallineamento dà la lista di Barbie migliore mai vista: *Lady Bird · Glass Onion ·
The Big Sick · La rivincita delle sfighe · American Fiction · The Disaster Artist · Everything
Everywhere · Wonder Woman* — satira e commedia pop, senza documentari sul tema e senza cartoni. Drive:
*Come un tuono · Prisoners · In Bruges · 7 psicopatici · Baby Driver · Fargo*. Matrix perde il
lock-in della saga (*Resurrections* esce, entrano *Terminator 2*, *Inception*, *Blade Runner*).

## 5. Il dev set a 5 blocchi (strumento nuovo)

`dev-set-kfold.py` + `strumento.py`: 5 grafi, ognuno con il proprio blocco di autori escluso da
LIST/LISTSEM, e 5 insiemi disgiunti di casi.

| blocco | casi | R@20 |
|---|---:|---:|
| 1 | 178 | 0,0299 |
| 2 | 106 | 0,0323 |
| 3 | 134 | 0,0202 |
| 4 | 120 | 0,0366 |
| 5 | 198 | 0,0224 |
| **unito** | **736** | **0,0275** |

MDE assoluto 0,0141 → **0,0067**; sulle differenze appaiate (sd 0,03-0,045) da 0,0065-0,0098 a
**0,0031-0,0046**. **2,1× di potenza in più**, gratis (5 ricostruzioni di LIST+LISTSEM, ~50 min una
volta sola).

Avvertenza: è lo **stesso** strumento del dev set da 166 casi, quindi ha lo **stesso** difetto di §4 —
premia i tipi derivati da liste. È affidabile per confronti che non toccano il peso dei tipi «umani».

## 6. Cosa resta deciso

- **V45 è la base**: stesso punteggio, teste dei tipi non più spazzatura, quattro bug in meno, pipeline
  ricostruibile. Non si promuove il riallineamento senza il giudizio dell'occhio umano.
- **La temperatura** non paga da sola (banco −0,0068) ma migliora i blockbuster (68,3%) e *Povere
  creature!* (#176): vale come componente di un mix, non da sola.
- I cinque blocchi sono lo strumento per d'ora in poi, per tutto ciò che non sposta i pesi.
