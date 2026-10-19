Status: ready-for-agent
Type: task
Blocked by: 07

# 08 — Micro-cluster dei filoni

## Verifica prima

- In `motore.py` **tutti** i semi (fino a 300) finiscono in un **unico** vettore e parte **un solo** PageRank: il
  filone dominante schiaccia gli altri.
- `motore.py` genera già in coda delle liste `mondo_{b}` per le bolle secondarie, ma `src/pool/index.js` **le
  scarta del tutto**: verifica dove e perché (se è vero).

## Cosa deve uscire

1. **Mini-grafo indotto sui soli semi** (100–300 nodi). Due semi sono collegati se: stanno nella **stessa bolla**
   (`MEM[u_i] == MEM[u_j]`), o in bolle **adiacenti** (`MEM[u_j] in VICINI[MEM[u_i]]`), o hanno un arco
   `Tr[u_i, u_j] > 0`.
2. **Componenti connesse** (o Leiden/Louvain sul mini-grafo, <1 ms). Si tengono i primi **2–3** cluster con almeno
   **3 semi** o almeno il **10%** del peso totale dei semi.
3. **Una diffusione per cluster**, con i **soli** semi di quel cluster: la massa di `r_k` somma a 1.0 **dentro** il
   filone.
4. **Una riga per cluster**, con bacino appiattito e pavimento di qualità (ticket 03).
5. **Titolo parlante**: la riga porta i **2 titoli-seme più pesanti** del cluster (es. *"Perché hai amato
   Interstellar e Arrival"*) — un campo nella descrizione della lista, non un titolo inventato a caso.

## La prova

- Un profilo **costruito con due filoni netti** (es. 6 sci-fi + 20 drammi): devono uscire **due** righe distinte, e
  la riga dello sci-fi **non** deve essere fatta di drammi. Con la diffusione unica di oggi, la riga sci-fi sarebbe
  schiacciata: mostra il prima/dopo.
- Un profilo **monolitico** (un solo filone): una sola riga, e il ticket dice cosa succede alle altre (niente righe
  inventate).
- Suite alla baseline.

## Trappole

- Il mini-grafo è piccolo: **non** costruire strutture pesanti. Se la latenza del servizio sale sopra `100 ms,
  qualcosa è sbagliato e va dichiarato.
- I nomi delle righe dei cluster devono essere **stabili** fra una richiesta e l'altra (stesso cluster = stesso id),
  altrimenti Stremio vede comparire e sparire cataloghi.

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
