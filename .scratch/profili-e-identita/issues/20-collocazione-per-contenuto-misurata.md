Status: resolved
Type: research
Blocked by: —

# Collocare un titolo nuovo per solo contenuto: quanto somiglia a una riga servita?

## La domanda

Un titolo fuori canone non ha comportamento. Ha contenuto: trama, keyword, cast, regia, collezione,
paese, decennio. La fusione V45 pesa le fonti così (`v45/pesi.json`, totale **8,4**; RRF `k=15`):

| fonte | peso | calcolabile per un titolo nuovo? |
|---|---|---|
| `KWSEM` | 1,4 | ✅ keyword semantiche |
| `RESID` | 1,2 | ✅ |
| `DIR` | 1,0 | ✅ regia |
| `COVISION` | 0,8 | ❌ nessuno l'ha ancora guardato |
| `COLL` | 0,5 | ✅ collezione/franchise (TMDB) |
| `CAST` | 0,4 | ✅ |
| `PROD` | 0,3 | ✅ |
| `CONTESTI` | 0,2 | ✅ |
| `CREWPROP` | 0,15 | ✅ |
| `TRIBU` | 0,15 | ✅ |
| `TRAMA` | 0,15 | ✅ embedding di trama |
| `LISTSEM` | 0,15 | ✅ |
| `RRFST` | 1,0 | ❌ studente (artefatto perso) |
| `LIST` | 1,0 | ~ liste curate: un titolo nuovissimo può non essere in nessuna |

**5,6 su 8,4 (67%) calcolabile dal contenuto. 2,8 su 8,4 è comportamento.**

La domanda del ticket: le righe costruite **senza** quel 33% stanno nello stesso quartiere delle
righe servite? Non lo sappiamo, e non serve discuterne: si misura.

## L'esperimento

Nessuna GPU, nessun addestramento, nessun artefatto nuovo. Si usano i titoli **già nel canone** come
prova: hanno una riga servita *e* tutto il contenuto necessario per ricostruirla.

1. **Campione.** ~300 titoli dal canone, stratificati: film / serie / anime, popolari e di coda.
   Solo con trama e keyword presenti.
2. **Riga per solo contenuto.** Per ciascuno, ricomporre la riga usando le sole fonti `✅` con i loro
   pesi veri, e RRF `k=15` — cioè ciò che si potrebbe calcolare per un titolo appena uscito.
3. **Confronto.** Sovrapposizione fra i top-100 così ottenuti e i top-100 **serviti**
   (`vicini-top100.npz`): `overlap@10`, `@50`, `@100`. Distribuzione, non media: conta la coda.
4. **La prova che conta davvero.** Un profilo i cui semi sono collocati *per contenuto* produce
   scaffali simili a quelli che produrrebbe con le righe servite? Misurare la sovrapposizione dei
   titoli nei primi tre scaffali, per 10 profili sintetici.

## Le soglie, dichiarate PRIMA di misurare

Altrimenti il numero si legge a comodo.

| esito | lettura | conseguenza |
|---|---|---|
| `overlap@100` mediano **≥ 0,5** | il contenuto colloca nel quartiere giusto | si procede con 21 |
| **0,2 – 0,5** | colloca in un quartiere *plausibile ma diverso* | si procede, ma il 22 deve rendere reversibile l'incremento |
| **< 0,2** | due spazi diversi che si chiamano allo stesso modo | ci si ferma: o si riaddestra lo studente (23), o non si colloca |

Secondaria, ma va registrata: la coda. Se il mediano è buono e il 10° percentile è zero, il
problema non è risolto, è solo medio.

## Esito (10/11/2026) — il cancello è passato

Strumento: `.scratch/profili-e-identita/ticket20-misura.py` (parte 1) e `ticket20-ppr.py` (parte 2).
**300 righe** campionate (100 film, 100 serie, 100 anime), 14 fonti vere da `v45/tipi2-pesi/`, pesi e
`rrf_k=15` dal manifest, correzione hub su `CAST`/`PROD` come nel mixer. Nessuna GPU, nessun
addestramento, 2,3 secondi.

### 1. Righe — la ricostruzione

| | `@10` | `@50` | `@100` | p10 `@100` | p90 `@100` |
|---|---|---|---|---|---|
| **tutte le fonti** (controllo) | 0,70 | 0,74 | **0,74** | 0,60 | 0,82 |
| **solo contenuto** (5,6 di 8,4) | 0,50 | 0,58 | **0,58** | 0,32 | 0,73 |

Il controllo dice **l'errore dello strumento**: la mia ricostruzione somiglia al servito al 74%, non
al 100%, perché manca la catena successiva (damping famiglia, gate asimmetrico, chiusura, potatura).
Quella distanza è dichiarata e non si attribuisce al contenuto.

Togliere il comportamento costa **0,74 → 0,58**: si conserva il **78%** di ciò che la ricostruzione
conserva. Per classe (`@100`, solo contenuto): film 0,65 · serie 0,57 · anime 0,51.

**Cancello dichiarato prima: `@100` mediano ≥ 0,5 → passa (0,58).**

### 2. Diffusione — la prova che conta

12 gruppi di 5 semi, righe dei semi sostituite coi loro top-16 «solo contenuto», PPR sulla
transizione potata contro quella servita:

| metrica | mediana | minimo |
|---|---|---|
| `overlap@10` | **0,60** | 0,40 |
| `overlap@20` | **0,60** | 0,40 |

Cioè: **il 60% dei consigli resta lo stesso**, e il 40% cambia. Ma il confronto vero è con l'alternativa
reale, che non è «consigli diversi»: è **nessun consiglio da quel seme**. Fra 60% e 0% la scelta non è
in discussione.

### La coda, che non va nascosta

`p10` a 0,32 sulle righe: un titolo su dieci viene collocato in un quartiere **davvero** diverso. Non è
un difetto da correggere prima di procedere, è il motivo per cui il ticket 22 deve rendere l'incremento
**reversibile**: se un titolo si rivela mal collocato, si toglie la riga e si torna a prima.

## Fuori scope

Scrivere la pipeline (21), toccare gli artefatti serviti, decidere la cadenza. Qui si **misura** e si
scrive l'esito, con i numeri e i grafici che servono a decidere.
