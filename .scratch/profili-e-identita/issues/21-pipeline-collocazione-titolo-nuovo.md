Status: ready-for-agent
Type: task
Blocked by: 20

# Collocare un titolo nuovo: la pipeline, un titolo alla volta

## Cosa è stato deciso prima di iniziare (grilling 10/11/2026)

- **Lo studente c'è** (ticket 23, forma B): le fonti sono **otto**, non sette. `RRFST` è calcolabile
  per un titolo nuovo perché lo studente mangia solo contenuto — è il ponte contenuto → comportamento.
- Le altre sei fonti comportamentali restano fuori (`COVISION`, `LIST`, `LISTSEM`, `RESID`,
  `CONTESTI`, `TRIBU`): peso 2,8 su 8,4 che a cold start non esiste.
- **La riga si colloca su domanda**: quando un seme dell'utente è fuori canone (ticket 19 registra
  esattamente quei casi).

## La forma vera della pipeline (dopo la prova nel grafo)

Il ticket 23 ha mostrato che il nuovo studente **non** va messo al posto di `RRFST` nel grafo servito
(peggiora il recall@20 di ~0,01 in modo stabile). Quindi il suo unico ruolo è questo, e la pipeline si
semplifica:

```
metadati TMDB → trama (Qwen3) → blocco keyword → feature meta
     → le sette righe delle fonti di contenuto (input)
     → ENCODER (forma B) → Z → top-16 → LA RIGA DEL TITOLO NUOVO
```

Le sette fonti servono **solo come ingresso dell'encoder**: non si fondono a mano, non si applicano
pesi RRF. Un solo artefatto da mantenere (lo studente), e la riga prodotta è quella che il ticket 23 ha
misurato (0,49 sulle righe, 0,625 sulla diffusione contro 0,55 del RRF fisso).

## Cosa deve fare

Da un id TMDB appena uscito a una riga di archi nel grafo. Sei passi, tutti già esistenti come pezzi
sparsi: il lavoro è **metterli in fila e renderli ripetibili**, non inventarli.

| # | passo | con cosa | costo |
|---|---|---|---|
| 1 | metadati: trama, keyword, cast, regia, collezione, paesi, data | cache TMDB `.cache/tmdb/*.parquet`, altrimenti API (chiave presente) | rete, secondi |
| 2 | **embedding della trama** | `Qwen3-Embedding-0.6B`, **già nella cache HF locale** (`models--Qwen--Qwen3-Embedding-0.6B`) | ~0,2–1 s su CPU |
| 3 | **blocco keyword** | `kw-tfidf/vocab.json` + proiezione casuale ±1/√k, `SEED=42`, stesse `kwcols` di `blocks.py` | millisecondi, ma vedi il punto fragile |
| 4 | feature strutturali | decennio, paese, NEP, cast/crew props, flag anime | millisecondi |
| 5 | **le fonti** (sette di contenuto + lo studente) con i loro pesi, poi la fusione | `tipi.py` per le fonti, `studente-addestra.py` per `RRFST` | millisecondi |
| 6 | la riga: top-100 archi uscenti | come `cmd_rrfst` ma per una riga | millisecondi |

## Il punto fragile, da chiudere subito

Il passo 3 vale solo se la proiezione casuale è **identica** a quella usata per costruire `Bk`: stesso
`SEED`, stesso ordine di `kwcols`, stesso vocabolario. Se scivola di una colonna, il blocco keyword del
titolo nuovo vive in uno spazio ruotato e i suoi vicini sono rumore — e nessun test lo direbbe, perché
i numeri restano plausibili.

**Verifica obbligatoria prima di fidarsi:** ricalcolare il blocco keyword di un titolo **esistente** con
questa pipeline e confrontarlo con la sua riga in `Bk` (differenza relativa < 1e-5). Se non torna, il
passo 3 è sbagliato e il resto non conta.

## Il secondo punto fragile: le fonti che non esistono

`COVISION`, `LIST`, `RRFST` non sono calcolabili (peso 2,8 su 8,4). Vanno **omesse**, non messe a zero:
in RRF una fonte assente non vota, una fonte a zero falsa la classifica. E la riga deve dichiarare
quali fonti l'hanno votata, perché fra sei mesi nessuno se lo ricorderà.

## La prova che conta

Chiudere il cerchio: prendere un titolo **del canone**, toglierlo, farlo passare dalla pipeline come se
fosse nuovo, e confrontare la riga prodotta con quella servita. Deve battere il risultato del ticket 20
sullo stesso titolo — se è peggio, la pipeline ha un bug che l'esperimento non aveva.

## Decisione presa (10/11/2026)

**La lista dei titoli da collocare arriva dall'evento, non da un job.** Si colloca **su domanda** il
titolo che l'utente ha guardato e che non è nel canone: pochi al giorno, e con la garanzia che ogni
seme abbia davvero la sua riga. Il daemon TMDB resta fuori da questo giro: collocare titoli che nessuno
ha ancora guardato è lavoro senza domanda, e il ticket 20 ha già mostrato che senza comportamento la
riga è debole per costruzione.

Conseguenza per il 22: la cadenza non è quotidiana ma episodica, e un incremento per volta deve poter
essere **messo e tolto**.

## Perché era `needs-info`

Manca una decisione che non è mia: **da dove arriva la lista dei titoli da collocare**. Tre possibilità,
con conseguenze diverse su 22 (che deve sapere quanto lavoro arriva e con che cadenza):

- il daemon TMDB che già aggiorna il catalogo (allora la cadenza è sua);
- l'evento «l'utente ha guardato qualcosa che non è nel canone» (collocazione **su domanda**, solo per i
  titoli che servono davvero: pochi, e con la garanzia che ogni seme abbia la sua riga);
- un comando a mano, quando se ne sente il bisogno.

La seconda è la più onesta rispetto al problema («il seme non si butta»), la prima è la più semplice.

## Fatto (10/11/2026) — la parte fragile, chiusa e misurata

**La ricetta degl'ingressi è congelata** (`.scratch/profili-e-identita/congela-ingressi.py` → `.cache/ingressi/`):
vocabolario `05`, idf, pesi per prefisso (`ge 1,5 · rt 1,5 · di 0,8 · co 0,4 · ca 0,4`, keyword a 1,0),
proiezione gerarchica L1/L2/L3 (1.382/469/131 cluster), vocabolario dei token extra (13.255), colonne
keyword e proiezione casuale (`SEED=42`, `KPROJ=512`), maschera `keep` (87.846 colonne su 104.790).

**Il costruttore di riga** (`.scratch/profili-e-identita/colloca-titolo.py`) prende un id TMDB, legge i
metadati (parquet, o API se il titolo è fuori cache) e ricostruisce i tre blocchi. `--verifica` fa il
giro di controllo sui titoli **del canone**: se gl'ingressi non coincidono, il collocatore guarda un
altro spazio e nessun numero a valle avrebbe senso.

| prova | esito |
|---|---|
| 8 titoli a mano (film, serie, anime) | differenza massima **1,2e-07** |
| **300 titoli a caso** | mediana **2,98e-08** · p99 1,19e-07 · massima **1,19e-07** · nessuno oltre 1e-4 |
| trama | 3-5e-05 (float32 della matrice congelata) |

### I due bug trovati dalla verifica, che sarebbero stati invisibili

1. **Il caso delle lettere nel blocco extra.** `data._nomi` abbassa il caso (sceneggiatori, case), il
   blocco `05` no. Con i nomi come stanno nel parquet la riga sbagliava di **0,385**: due token su
   trentasette, e nessun test l'avrebbe detto.
2. **`first_air_date` per le serie, in due posti.** Il decennio (token `de:`) e l'anno strutturale
   leggono `release_date` sui film e `first_air_date` sulle serie. Sbagliarlo costava **0,129** — cioè
   esattamente `0,514 × 0,25`, il valore dell'anno normalizzato.

Sono la ragione per cui la verifica esiste: senza, il collocatore avrebbe prodotto righe plausibili e
sbagliate, e il banco avrebbe misurato la cosa sbagliata senza dirlo.

## Cosa manca, per finire il ticket

1. **Le sette righe delle fonti di contenuto** per un titolo nuovo (ingresso della forma B). Per i
   titoli del canone stanno in `v45/tipi2-pesi`; per uno nuovo vanno calcolate: `TRAMA` è un coseno
   (economico), `CAST/DIR/PROD/COLL` sono coseni IDF su insiemi d'attributi (serve congelare gli
   insiemi una volta), `KWSEM` ha bisogno del grafo keyword (da congelare), `CREWPROP` delle coorti.
   **Il modello, non la Z**: il forward richiede i pesi — `studente-addestra.py` ora salva `.pt` +
   `.config.json` accanto alla `Z`, ed è il motivo per cui lo studente è stato riaddestrato.
2. La riga finale (top-16) e il suo uso nel ticket 22.

## Secondo pezzo: le strutture delle fonti, congelate e verificate (10/11/2026)

`.scratch/profili-e-identita/congela-fonti.py` → `.cache/fonti/`. Per ognuna delle fonti a attributi
(`CAST`, `DIR`, `PROD`, `COLL`) salva la matrice **già pesata** (IDF `log(N/(1+df))` + shrinkage L2 con
`tau` mediano), esattamente come `tipi._idf_cosine`. Un titolo nuovo costa poi un coseno, non una
passata sul corpus.

**Verifica** — 40 titoli a caso, riga ricostruita dai metadati contro la riga che la build produsse
(`v45/tipi2/<fonte>.npz`):

| fonte | sovrapposizione@100 mediana | minimo |
|---|---|---|
| CAST | **1,000** | 0,929 |
| DIR | **1,000** | 0,000 |
| PROD | **1,000** | 0,000 |
| COLL | **1,000** | 1,000 |

I minimi a zero **non sono un bug**: sono titoli il cui metadato TMDB è cambiato dopo la build. Un
esempio verificato: `movie:103448` ha oggi un regista («Daoud Abdel Sayed») e nel grafo ha grado 0 su
`DIR`; la ricostruzione usa il metadato di oggi, quindi trova una somiglianza che allora non esisteva.
La stessa cosa vale per ogni fonte: **le righe del canone sono una fotografia**, non la verità corrente.

## La fonte che non si può fare: `CREWPROP`

`crewprop.py:101` legge `rrfstudent-v18.npz` — **cancellato col ticket 15**, come `RRFST`. La sua riga
non è ricostruibile: la carriera di un titolo è un centroide calcolato nei vettori di quello studente.

Peso: **0,15 su 8,4** (1,8%). Conseguenza onesta: le fonti d'ingresso della forma B scendono da sette
a **sei** (`KWSEM`, `DIR`, `COLL`, `CAST`, `PROD`, `TRAMA`), e lo studente va riaddestrato senza
`CREWPROP`, altrimenti gl'ingressi a inferenza non sarebbero quelli dell'addestramento.

Resta da congelare **`KWSEM`**: serve il grafo keyword (`G`, vocabolo×vocabolo con PPMI) e la
proiezione dei titoli su di esso. È l'ultimo pezzo.
