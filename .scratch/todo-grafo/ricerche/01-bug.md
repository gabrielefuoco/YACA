# Ticket 01 — I tre bug e il quarto: verifica sul codice

`Status: resolved` · 14/10/2026 · esito di `01-bug.py` (log: `log/01-bug.log`, 12 s)

L'esperto ha letto `digest_2.txt`, che non è il codice aggiornato. Qui ogni accusa è verificata sul
codice vero. **Verdetto: tre accuse su tre sono fondate, una punta al posto sbagliato, e ne esiste
una quarta che nessuno aveva visto.** Il numero grosso dell'esperto — il 76,3% di `DIR` — è
**esatto al decimale**.

---

## Bug 1 — `genres` non viene letto. Fondato, e pesa più di quanto sembri

`bolle.py:476-479` — `COLS_M` e `COLS_T` non contengono `"genres"`; `bolle.py:513` lo legge da
`dd.get("genres")`, che non esiste in `dd`. Risultato:

| | |
|---|---|
| titoli con almeno un genere | **0 / 66.259** |
| con la colonna letta | 66.219 / 66.259 (27 generi distinti) |
| firme `pg:paese\|decennio\|genere` generate | **0** |
| firme `co:studio` / `rt:rete` | 109.633 / 8.934 |

Il **secondo effetto** è quello che l'esperto chiama "Effetto 2" ed è confermato: le firme
produttive `pg:` nascono in un ciclo `for g in GEN[r]` che gira a vuoto. Restano solo studio e rete.

**Ma l'effetto più grande è sulla maschera.** La maschera tiene un arco se i due titoli condividono
un genere **o** una keyword; senza generi resta solo la keyword. Sugli archi veri della cache:

| componente | archi | tenuti oggi (GEN vuoto) | tenuti con GEN vero |
|---|---|---|---|
| `DIR` | 416.154 | 98.530 (**23,7%**) | 318.038 (**76,4%**) |
| `CAST` | 35.684 | 21.606 (**60,5%**) | 33.432 (**93,7%**) |

Quindi la maschera rotta taglia il **76,3%** di `DIR` — il numero dell'esperto, identico — e il 39,5%
di `CAST`. Riparata, `DIR` terrebbe **3,2 volte** gli archi e `CAST` 1,5 volte.

⚠️ **Questo è il punto delicato.** L'esperto scrive che quel taglio "alla lettura si è rivelato
benefico". Sarà anche vero, ma era un effetto di un bug: la correzione **non va assunta migliore**,
va misurata. Il confronto V7/V8 del ticket 02 decide, e la posta è alta perché il `DIR` che entra
nella miscela passa da un quarto a tre quarti dei suoi archi.

### La correzione del report, dopo il ticket 02

La prima stesura di questo report diceva che le firme `pg:` erano 0 **perché** `GEN` era vuoto. Con
`genres` guarito sono rimaste 0: **la spiegazione era incompleta**, e il merito è del ticket 02 che
l'ha fatto notare stampando una guardia. `01c-paesi.py` ha trovato il resto — un **quinto bug**, che
sta nella sezione qui sotto — e ora le firme possibili sono **44.279**.

---

## Bug 2 — `min_sim=0.12` con shrinkage. Fondato, ma **il difetto è nel chiamante**

Il default di `bolle.py` è già `min_sim=0.02` (riga 72). Il valore 0.12 arriva da
`10-vicinanza.py` (~riga 62): `carica_componenti(con_shrinkage=True, min_sim_kw=0.12,
min_sim_cast=0.12, ricostruisci="cache", ...)`. E con `ricostruisci="cache"` carica il `.npz` già
costruito a 0.12. L'esperto aveva ragione sul fatto, non sul posto.

Lo stato di `CAST`:

| versione | archi | grado mediano | titoli con archi |
|---|---|---|---|
| in cache (shrinkage + 0.12) | 35.684 | **0** | 13.853 (20,9%) |
| vecchia, senza shrinkage (`nuovo-CAST.npz`) | 2.127.292 | 32 | 63.238 (95,4%) |

E la misura che conta, ricostruendo `CAST` con lo shrinkage e **misurando** la soglia invece di
fidarsi. I coseni del k-NN (top-30 per riga, 1.662.368 archi):

| percentile | coseno |
|---|---|
| 50° | 0,053 |
| 75° | 0,061 |
| 90° | 0,091 |
| 95° | 0,147 |
| 99° | 0,535 |

| soglia | archi | grado mediano | titoli con archi |
|---|---|---|---|
| **0,02** | 1.662.368 | **30** | 64.982 (98,1%) |
| **0,04** | 1.612.876 | **30** | 64.982 |
| 0,06 | 443.482 | 5 | 64.726 |
| 0,12 | 98.491 | **1** | 63.066 |

**Confermato in pieno.** Il coseno mediano è 0,053: la soglia del coseno grezzo non si trasferisce
allo spazio shrinkato, e 0,12 cade al **92° percentile** — butta il 94% degli archi. C'è anche una
scogliera fra 0,04 e 0,06 (da grado 30 a grado 5): la zona sicura è 0,02-0,04, come dice l'esperto.

---

## Bug 3 — `potatura_nucleo` legge metà degli archi. Fondato, e **grave**

Il file passato è triangolare al **100%** (4.960.331 archi, tutti sopra la diagonale), e `fuori =
peso.tocsr()` letto con `getrow(r)` vede solo i `j > r`. L'helper `versus` nella stessa funzione
gestisce il triangolo esplicitamente — la svista è solo nella riassegnazione.

Su V7, con la funzione replicata nelle due varianti:

| | |
|---|---|
| membri espulsi (affinità zero col nucleo) | 6.132 |
| riassegnati a una bolla **diversa** | **3.042 — il 49,6%** |

Esempi, dove si vede anche la causa meccanica — quanti vicini vengono letti:

| bolla | titolo | col triangolo | corretto | vicini letti |
|---|---|---|---|---|
| 809 | 21275 | bolla 634 | bolla 93 | 25 → 63 |
| 809 | 42099 | bolla 162 | bolla 753 | 6 → 46 |
| 1315 | 40722 | bolla 537 | bolla 484 | 5 → 54 |
| 592 | 49410 | nessuna | bolla 145 | **0 → 51** |
| 94 | 3265 | bolla 39 | bolla 1000 | 118 → 159 |

Un titolo espulso riceveva la bolla nuova leggendo **0 vicini** invece di 51. Su un titolo espulso
su due, V7 ha deciso con metà dell'evidenza.

---

## Bug 4 — il quarto: `networks`, `countries` e `companies` calcolate e non restituite

Non segnalato dall'esperto, ma è la ragione **meccanica** della sua osservazione §1.2 ("il Network,
lo Studio d'animazione, il Paese+Lingua sono pochissimo sfruttati o assenti nello spazio bersaglio
dello studente").

`costruisci_insiemi` restituisce `['CA', 'CO', 'DI', 'GEN', 'KW', 'SIG']`. Dentro costruisce anche
`RETE` (networks), `PAE` (production_countries) e `COMP` (production_companies) — e non le
restituisce. Le usa solo per le firme `co:` e `rt:` di `SIG`, e solo per gli studi con ≤ 40 titoli e
le reti con ≤ 60.

**Nota per l'esperto:** il suo timore che le serie non abbiano i `networks` è infondato — la colonna
c'è, in `COLS_T`, ed è letta. Il problema non è la mancanza del dato, è che il dato non arriva a chi
costruisce la collocazione. È una correzione di **una riga** (`return` + il consumatore), non una
migrazione di dati.

---

## Bug 5 — il quinto, trovato cercando la verifica del primo

Non era nella lista dell'esperto, non era nella mia. È il più grosso dei cinque, e l'ha fatto
emergere la **guardia** che il ticket 02 stampa in testa al suo log: le firme `pg:` restavano a 0
anche con `genres` guarito.

`production_countries` nel parquet **non è una lista di dizionari** come `genres`, `cast` o
`production_companies` — è `["US"]`, `["HK"]`: una lista di **stringhe**. E l'helper `leggi()` di
`bolle.py` fa:

```python
return [x for x in v if isinstance(x, dict)]
```

che **scarta in silenzio** tutto ciò che non è un dizionario. Quindi:

| | |
|---|---|
| titoli con un paese letto da `leggi()` | **0** |
| titoli con un paese, leggendo bene | **66.760** |
| con almeno un paese non angloamericano | **34.331 (50,1%)** |
| firme `pg:paese\|decennio\|genere` possibili | **44.279** (erano 0 su 41.268) |

I paesi più frequenti: US 33.908, GB 8.087, **JP 5.860**, FR 5.621, CA 3.545, DE 3.319, IT 2.988,
**KR 2.097**, ES 1.829, IN 1.418, CN 1.216. Le lingue originali dei non angloamericani: ja 5.411,
fr 3.424, es 2.314, **ko 1.951**, it 1.950, de 1.502, zh 1.203, ru 813, hi 773.

**È esattamente il segnale che l'esperto chiede per le serie in §1.2** — «il Paese + Lingua
(KR, JP, TR, ES, NO)» — che nello spazio bersaglio dello studente risulta «pochissimo sfruttato o
assente». Non era una scelta di progetto: era un `isinstance` di troppo. La correzione è di due righe
(`leggi` accetta anche le stringhe, e il lettore di `PAE` le gestisce), ed è un **prerequisito dei
centroidi** del ticket 04.

Nota utile: `spoken_languages` è `["en"]` — **anch'esso una lista di stringhe**, e anch'esso letto
da nessuno. Stessa forma, stesso silenzio, e per il momento innocuo perché non serve.

---

## Cosa resta da fare (ticket 02)

1. `"genres"` in `COLS_M` e `COLS_T` — una riga, ma cambia la maschera (`DIR` ×3,2 archi)
2. `min_sim = 0.02` in `10-vicinanza.py` (non in `bolle.py`, che è già giusto)
3. `fuori = (peso + peso.T).tocsr()` nella riassegnazione di `potatura_nucleo`
4. `RETE`, `PAE`, `COMP` nel `return`

E poi **rigenerare** la partizione e confrontarla con V7 su ciò che conta: le 20 sentinelle, il
banco dei 600 film, la mediana, la purezza. Senza il confronto, la correzione di un bug benefico
a lettura sarebbe un peggioramento silenzioso.
