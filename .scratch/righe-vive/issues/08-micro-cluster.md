Status: claimed
Type: task
Blocked by: 07

# 08 — Micro-cluster dei filoni

## Verifica prima

- In `motore.py` **tutti** i semi (fino a 300) finiscono in un **unico** vettore e parte **un solo** PageRank: il
  filone dominante schiaccia gli altri.
- `motore.py` genera già in coda delle liste `mondo_{b}` per le bolle secondarie, ma `src/pool/index.js` **le
  scarta del tutto**: verifica dove e perché (se è vero).

### Esito della verifica (20/10/2026, integratore)

1. **Un solo PageRank: vero.** `Motore.lista` chiama `self.diffondi` **una volta** su tutti i semi
   (`services/graph/motore.py:604`); l'unica altra camminata è quella del Ticket 07 (`:898`, sui soli semi
   recenti). Con 200-300 semi il filone con più peso decide il vettore `r` per tutti.
2. **`mondo_{b}` esiste ed è scartata: vero, in due punti.** `lista` accoda una riga per ogni bolla secondaria
   (`for b in bolle[1:]`), e `src/pool/index.js:287-290` cerca **solo** i quattro ruoli storici: le righe
   `mondo_*` non hanno consumatore e spariscono senza un log. Non si tocca qui: il consumatore è il Ticket 13.
3. **Baseline aggiornata**: dopo il `07` la suite è `5 suite rosse / 8 test falliti / 1910 passati` (192 suite,
   +2 file e +12 test). Restano ammesse le stesse cinque.

**Decisioni scritte qui, prima del codice**:

- **Quanti e quali**: massimo **3** righe (`MICRO_CLUSTER_MAX`, DICHIARATO); un cluster si tiene se ha almeno
  **3 semi** (`MICRO_CLUSTER_MIN_SEMI`) **o** almeno il **10% del peso** dei semi (`MICRO_CLUSTER_MIN_PESO`). Il
  numero era un «non ancora specificato» della mappa: il ticket lo fissa a 3, non a 2, perché con 2 filoni un
  terzo filone minoritario sparirebbe di nuovo — che è il difetto che questo ticket cura.
- **Componenti connesse**, non Leiden: il mini-grafo ha <=300 nodi e il ticket ammette le componenti; un
  partizionatore aggiungerebbe dipendenze e latenza per niente. Costo O(n²) con n<=300, dichiarato.
- **Identità stabile della riga**: `tipo = micro_cluster_<i>` (i = 1..3, ordine di peso) e un campo
  `cluster_id = b<bolla_dominante>` (la bolla che porta più peso). Due cluster distinti non possono avere la
  stessa bolla dominante — semi nella stessa bolla sono connessi per definizione — quindi l'id è stabile finché
  il filone resta ancorato alla sua bolla. Lo slug definitivo per Stremio lo decide il registro (Ticket 13).
- **Titolo parlante**: `titoli_seme` con i **2 semi più pesanti** del cluster e `descrizione`
  «Perché hai amato X e Y» (campo della lista, non un titolo inventato).
- **Profilo monolitico**: un solo cluster → **una** riga, nessuna riga inventata per arrivare a 2 o 3.
- **Nessun lavoro Node**: le righe nuove non hanno consumatore fino al Ticket 13, come per `06` e `07`.
- **Bacino**: lo stesso `bacino_appiattito` del Ticket 03, con un tetto di **4** bolle-seme
  (`MICRO_CLUSTER_BOLLE_MAX`) — una riga di filone deve restare stretta.

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
