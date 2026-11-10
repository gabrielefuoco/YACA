Status: ready-for-agent
Type: task
Blocked by: 20

# Collocare un titolo nuovo: la pipeline, un titolo alla volta

## Cosa deve fare

Da un id TMDB appena uscito a una riga di archi nel grafo. Sei passi, tutti già esistenti come pezzi
sparsi: il lavoro è **metterli in fila e renderli ripetibili**, non inventarli.

| # | passo | con cosa | costo |
|---|---|---|---|
| 1 | metadati: trama, keyword, cast, regia, collezione, paesi, data | cache TMDB `.cache/tmdb/*.parquet`, altrimenti API (chiave presente) | rete, secondi |
| 2 | **embedding della trama** | `Qwen3-Embedding-0.6B`, **già nella cache HF locale** (`models--Qwen--Qwen3-Embedding-0.6B`) | ~0,2–1 s su CPU |
| 3 | **blocco keyword** | `kw-tfidf/vocab.json` + proiezione casuale ±1/√k, `SEED=42`, stesse `kwcols` di `blocks.py` | millisecondi, ma vedi il punto fragile |
| 4 | feature strutturali | decennio, paese, NEP, cast/crew props, flag anime | millisecondi |
| 5 | **le fonti** con i loro pesi veri, poi RRF `k=15` | `tipi.py` sa calcolare ognuna per il canone intero: qui serve **per una riga sola** | millisecondi |
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
