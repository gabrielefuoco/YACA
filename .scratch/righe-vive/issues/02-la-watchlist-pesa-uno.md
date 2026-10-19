Status: ready-for-agent
Type: task
Blocked by: 01

# 02 — La watchlist pesa 1.0, è esclusa, e si ripesca al massimo due volte

## Verifica prima

1. In `services/graph/parametri.py`: `PESO_TIPO = {"loved": 3.0, "liked": 2.0, "library": 1.5, "watched": 1.0}`.
2. In `services/graph/motore.py`: `visti = {int(r_) for r_, t in zip(righe, tipi) if t != "library"}` — cioè i
   titoli in watchlist **non** sono esclusi dalle liste.
3. In `services/graph/motore.py` `pesi_semi`: un `peso` numerico esplicito **sovrascrive** `PESO_TIPO`.
4. In `src/pool/index.js`: la chiamata a `graphClient.raccomanda` manda `peso: w` per ogni seme — quindi il peso del
   **tipo** viene sovrascritto e la curva `1 + 2*(plays/NEP)` delle serie e i tetti di ri-visione dei film
   **non si applicano**.
5. `ALPHA = 0.60`: il 60% della massa resta sui semi a ogni iterazione.

## Cosa deve uscire

1. **`PESO_TIPO["library"] = 1.0`** (oggi 1.5, cioè **più di un film visto**).
2. **I titoli in watchlist entrano nei `visti`** come tutti gli altri: non rientrano nelle liste di output.
3. **Ripescaggio controllato, max 2**: per i soli semi di tipo `library` si calcola
   `r_indotta[x] = r[x] - ALPHA * e[x]` (la massa ricevuta **dagli altri** semi, non il restart su sé stessi). Un
   titolo si ripesca solo se `r_indotta[x]` sta nel **top 15%** dei candidati non visti **e** `VAVE[x] >= 7.0`.
   Massimo **2** per riga, nelle prime posizioni.
4. **Il peso del tipo deve contare**: o il pool smette di mandare `peso` esplicito, o `pesi_semi` applica il tipo
   quando il peso non è dichiarato *esplicitamente come intenzione*. Scegli **una** delle due e scrivi quale nel
   ticket — ma la curva delle serie e i tetti dei film devono tornare a valere.

## La prova

- Un test (o una sonda) che mostra: (a) un titolo in watchlist **non** compare più in `il_tuo_mondo` per il solo
  fatto di essere in watchlist; (b) il conteggio dei titoli da watchlist in uscita è **<= 2**; (c) con `library` a
  1.0 il contributo di un titolo in watchlist è **inferiore** a quello di un `watched` (prima era superiore).
- Se hai scelto la strada di `pesi_semi`: una prova che `PESO_TIPO` si applica quando il peso non c'è.
- Suite alla baseline.

## Trappole

- **Il restart è la trappola**: senza sottrarre `ALPHA * e[x]` ogni titolo in watchlist risulta caldissimo e la
  regola dei due ripescaggi non morde.
- `semiDi` restituisce una Map: non ha ordine temporale (serve al ticket 07, ma non inventarlo qui).
- Non cambiare `ALPHA`: è una scelta misurata, non un parametro da ritoccare in questo ticket.

## Regole comuni a ogni ticket di questo cantiere

- **Prima di toccare il codice, conferma le premesse** elencate in "Verifica prima". Vengono da un'analisi
  statica, non da una misura: se il codice dice altro, **fermati** e scrivi la divergenza nell'Esito invece di
  adattare il codice a una premessa sbagliata.
- **Verificare eseguendo, non leggendo.**
- Baseline suite **misurata**: `5 suite rosse / 8 test falliti / 1898 passati` (190 suite). Le sole ammesse:
  `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`, `presetBurtonOrdering`.
  Si incolla la lista `FAIL` e i totali: un sottoinsieme scelto a mano non è una prova.
- **Il frontend non si tocca.** Niente `git push`. Niente `npm run build` / `tsc`. Non si tocca la produzione.
- **La prova non vive nel prodotto**: niente flag `simulate*` nel percorso caldo. Se una sonda deve mostrare un
  difetto, lo fa dall'esterno (patch dell'istanza).
- **Ogni riga che non si riesce a riempire lo dichiara**: il difetto di `uscite_nuove` è nato da un silenzio
  (`if not titoli_raw: continue`). Nessuna lista sparisce senza dirlo.
- **Il pavimento di qualità non si abbassa per riempire.**
