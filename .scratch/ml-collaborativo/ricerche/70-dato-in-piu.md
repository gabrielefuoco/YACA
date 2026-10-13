# 70 — Il dato in più non ha aiutato (e cosa vuol dire)

**Il mandato**: aumentare i dati. La diagnosi diceva che la co-visione `B` — essenziale per le serie — copriva **il 6% dei film e il 18% delle serie**: costruita sui soli 3.000 titoli più votati per medium.

**L'esito**: il `related` delle serie è passato da **2.995 a 16.999 titoli** (copertura 18% → **89%** delle serie, archi 2,2M → **4,0M**). **Non è cambiato niente.** Il collo di bottiglia non era la copertura.

Script: `rigenera-B.py` · `temporale-2.py` · `ordine-serie-temporale.py` (rilanciato).

---

## 1. Il dato in più, e il risultato

| catalogo SERIE | vecchia `B` (2.995 titoli) | **nuova `B` (16.999 titoli)** |
|---|---|---|
| camminata, temporale @10 | 1,98% | **2,07%** |
| camminata, temporale @100 | **14,06%** | 13,62% |
| camminata, temporale @500 | **39,82%** | 38,59% |
| camminata, casuale @10 | **3,01%** | 2,91% |
| camminata, casuale @100 | **18,21%** | 16,81% |
| camminata, casuale @500 | **45,58%** | 43,85% |
| **modello, temporale @10** | 3,36% | **3,41%** |
| **modello, temporale @100** | 15,08% | **15,10%** |
| **modello / popolarità @10** | 14,2× | **14,4×** |

**Tutte le differenze sono dentro il rumore, e alcune sono negative.** Triplicare la copertura della co-visione — il componente che l'ablation dice essere **essenziale** per le serie (−1,80 @100 togliendolo) — **non ha prodotto nessun guadagno**.

**Il controllo di coerenza che rende il risultato credibile**: il catalogo **film** non usa `B`, e i suoi numeri sono **identici al decimale** prima e dopo (1,52 / 10,15 / 27,09). Se fossero cambiati, qualcosa si sarebbe mosso che non doveva.

## 2. Perché non ha aiutato

**Il segnale non era limitato dalla copertura, ma dalla qualità.** Tre spiegazioni plausibili, e non le ho distinte:

1. **I titoli aggiunti sono quelli meno votati**, e le loro liste `related` sono più deboli e più rumorose: 1.500 serie su 16.999 hanno risposto **vuoto**, e le altre portano 30 titoli qualunque. Aggiungere archi deboli **diluisce** invece di arricchire.
2. **I 3.000 più votati coprivano già il segnale utile**: le serie che un utente guarda davvero sono in gran parte lì.
3. **`k`=30 e `beta`=0,25 erano tarati sulla `B` vecchia**, e con 4 milioni di archi invece di 2,2 il grafo è più denso di quanto quei parametri si aspettino. **Non li ho ritarati** — quindi il confronto non è del tutto pulito.

## 3. Cosa vuol dire per la strategia dei dati

**I fetch in coda servono a un'altra cosa, e va detto adesso.** Le cronologie complete e i follower **non migliorano le raccomandazioni** — migliorano **la misura**:

| fetch | cosa cambia |
|---|---|
| `related` delle serie ✓ fatto | **niente** (misurato) |
| cronologie senza il tetto di 300 | **niente nelle raccomandazioni**: le cronologie Trakt **non entrano nel grafo**, sono solo il banco di prova. Toglie la **troncamento** (78% al tetto), quindi riduce la distorsione verso il recente |
| follower (più utenti) | **niente nelle raccomandazioni**: più utenti = **meno rumore** nelle misure, che è quello che serve per decidere fra ricette |

**Il fatto strutturale**: **le cronologie Trakt non sono un componente del grafo.** Il grafo usa MovieLens (`CF`), il `related` (`B`), i metadati (`CFst`, `Kc`), i temi (`T`) e la curatela (tolta). Gli utenti Trakt servono **solo a misurare**.

Quindi: i fetch in coda valgono **per la qualità delle decisioni**, non per la qualità dei suggerimenti. Vanno fatti, ma senza aspettarsi un salto.

## 4. Cosa resta vero

Il report 68 e il 69 **reggono entrambi**, con la `B` nuova:

| catalogo serie, temporale | @10 | @100 |
|---|---|---|
| **popolarità** (come recuperatore) | 2,13% | 12,51% |
| camminata | 2,07% | 13,62% |
| **modello dell'ordinamento** | **3,41%** | **15,10%** |
| **modello / popolarità** | **1,6×** | **1,2×** |

**Il grafo non batte la popolarità al @10; l'ordinamento sì, di 14× dentro il cesto.** Il valore del catalogo serie è nell'ordinamento, e questo **non dipende dalla copertura della co-visione**.

## 5. Cosa fare adesso

1. **Ritarare `k` e `beta` sulla `B` nuova** — era il punto 3 del §2, ed è l'unico che può cambiare il risultato.
2. **L'ordinamento del catalogo film in temporale** — mai misurato.
3. **Rifare ablation e pesi in temporale** — sono ottimi di un mondo casuale.
4. **Smontare il divario calibrazione/verifica del modello serie (−42% al @10)**: 13 caratteristiche su 531 utenti per metà sono troppe. Meno caratteristiche è la strada più diretta, non più dati.
5. **I fetch in coda**: lasciarli finire (servono alla misura), ma **non aspettarsi un salto**.
