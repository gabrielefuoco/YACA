# Handoff — il sistema di raccomandazione di YACA, per la valutazione

**Quinto handoff.** I quattro precedenti raccontavano il *percorso*: il lavoro prima, i fallimenti di
una fase, il buco nell'inserimento, il disaccordo fra due misure. Questo è diverso: accompagna il
**codice finito**, perché qualcuno possa **giudicarlo** senza ricostruire la storia.

Cosa c'è da valutare, in una riga: **un grafo eterogeneo di 66.259 titoli, partizionato in 3.497
bolle coerenti, con un collocatore che mette i titoli nuovi al posto giusto in 8 millisecondi.**

---

## 1. Il sistema in una pagina

```
   GLI ARCHI            10 componenti, ognuno un tipo di relazione:
                        CF · CFst (MovieLens, il comportamento)
                        B · TV · LIST (Trakt: co-visione, liste)
                        KW · CAST · DIR · PROD (i metadati TMDB)
                        TRAMA (gli embedding delle trame — qwen3, payload «titolo. trama»)
   LA PARTIZIONE        Leiden RB 200 sulla miscela → 2.838 bolle
   LA DIVISIONE VOTI    le bolle con p90/p10 dei voti > 10 si ripartiscono → 3.497 bolle
   IL COLLOCATORE       un titolo nuovo → la sua bolla (V1) + i 10 titoli da mostrare (V3)
                        + la regola dei voti: non va dove la mediana è fuori da [V/10, V×10]
   LA MAPPA             6 vicini intra-medium + 2 ponti cross-medium, simmetrizzati
```

**I parametri e i pesi sono in `graph/pipeline.py`** (`RICETTA`), leggibili. Prima vivevano solo
sparsi nel codice.

## 2. Cosa c'è da leggere, in quest'ordine

| | |
|---|---|
| **`graph/README.md`** | la ricetta, l'inventario, le trappole, i limiti. **Comincia da qui.** |
| **`graph/fetch/README.md`** | chi scarica cosa, e la regola che separa i dati del modulo da quelli scaricati |
| **`graph/measure/README.md`** | i 10 arbitri: cosa misurano, e le sei volte in cui hanno corretto le metriche |
| **`graph/measure/*.py`** | la suite di misura — sono **da leggere**, non solo da eseguire |
| **i 5 report** nel digest | le decisioni e le loro prove (vedi §3) |

## 3. I numeri, e **come** sono misurati

| | valore | metodo |
|---|---|---|
| **coerenza intra-bolla** | **+0,942** | indice di chimera: PMI mediana fra i 5 token tematici di testa di ogni bolla, sui soli `kw:`/`ge:` con df ≥ 30. Era **+0,653** |
| **saghe spezzate** | **0 su 1.994** | collezioni TMDB (`collection_id`): in una bolla (77,6%), in bolle **adiacenti** sulla mappa (22,4%), **scollegate (0,0%)** |
| **collocazione serie** | **63,0%** | banco di 600 serie tolte dal grafo e ricollocate, leave-one-out **esatto**, sui soli metadati. Con le promozioni semantiche: 87,3% |
| **collocazione film** | **~90/100** | **lettura a occhio** di 100 uscite 2024-2026. Il banco dice 27,7% — e sbaglia lui, vedi sotto |
| **titoli collocabili** | **8,7 ms** | coseno su matrici sparse, nessun modello |

**Il banco misura il comportamento, non il significato**: chiede «il titolo atterra nella bolla che la
**co-visione** gli aveva assegnato?», domanda che per un'uscita del 2026 fuori dal grafo **non ha
risposta**. Sui titoli nuovi l'unico arbitro è l'occhio — e l'occhio, il 15/10, ha corretto le metriche
**sei volte in una sera.** È la cosa che vale più di tutte le altre in questo handoff.

## 4. Le tre decisioni non ovvie, e la loro prova

**a. V10 invece di V8** — aggiungere il componente di trama alla miscela costa 13 minuti di calcolo e
porta la coerenza **da +0,653 a +0,803**. Il prezzo: gli embedding delle trame si fanno una volta
(17 minuti, 140 MB) e la copertura è del **54%** del canone (non tutti i titoli hanno una trama — e
quelli che non l'hanno sono i meno votati: mediana **26** voti contro 127).

**b. RB 200 invece di RB 100** — la coerenza sale **a +0,944** e le bolle passano da 1.783 a 2.838
(mediana da 29 a 16), la più grossa da 543 a 341. Il ticket che diceva «RB 200 frantuma» è **smentito**:
lo diceva su una partizione senza il componente di trama e con le metriche vecchie.

**c. V1 per la bolla, V3 per i dieci titoli** — due pesature diverse, e non è un compromesso. Sul banco
V1 fa **63,0%** contro il 35,3% di V3; sulla similarità di trama (l'unica misura che **non usa** le
feature del collocatore, quindi non circolare) V3 recupera **+0,018** là dove V1 prende +0,002.
Sono due domande con due risposte misurate.

**d. La quarta, quella che è stata più difficile da accettare**: il **voto di trama nella collocazione
peggiora**. Provato a cinque pesi, sempre sotto la base. La spiegazione è la stessa di (c): sposta verso
la bolla *semanticamente* più vicina, e il banco misura il comportamento.

## 5. Le due trappole — leggetele prima di toccare

**a. Il triangolo non dipende dalla risoluzione.** È il grafo *prima* di Leiden. Il file
`...-r100-triangolo.npz` è **lo stesso** da cui viene la partizione `r200`: la risoluzione cambia solo
Leiden.

**b. I centroidi del collocatore sono legati a UNA partizione** (oggi V8). Le bolle **non hanno id
stabili** fra partizioni: leggere i membri su un'altra fa finire *Deadpool & Wolverine* tra *Bayside
School* e *Kenan & Kel*, **senza nessun errore**. La partizione e i centroidi sono **un artefatto
solo** — e nel modulo c'è `canon.A(nome)`, che risolve i percorsi e ha un ripiego da rimuovere.

## 6. Cosa **non** è verificato — leggerlo prima di fidarsi

1. **La rigenerazione end-to-end non è mai stata eseguita.** I 5 produttori in `graph/upstream/` sono
   stati spostati e i loro import corretti, ma eseguirli costa ore (le co-visioni Trakt, le SVD) e non
   l'abbiamo fatto. La verifica è: sintassi valida, import corretti, modulo caricabile da fuori.
2. **`ratings-puliti.parquet` non ha un generatore.** È letto da 9 script e **nessuno dei 275** lo
   scrive. O si ricostruisce documentando come, o si ammette che quell'input non è rigenerabile.
3. **Il modulo non ha una suite di test.** I contratti di `canon.py` sono assert a runtime. Il prodotto
   ha 177 file in `tests/`: il modulo ne ha zero. I 10 arbitri misurano, non verificano.
4. **La raccomandazione su V10 non è misurata.** I numeri di recall e NDCG della fase precedente sono
   sulla partizione vecchia. Il ponte esiste (`scripts/qa/simulate.js`) ma richiede V10 dentro `src/`,
   che è un lavoro complesso e **non è stato fatto**.
5. **150 script della fase 1 restano in `.scratch/`**, non verificati uno per uno: finché non lo si fa,
   archivio e modulo non sono separati davvero.

## 7. Le domande per chi valuta

1. **La coerenza è la cosa giusta da massimizzare?** `+0,942` di PMI mediana dice che le bolle
   contengono un solo mondo. Ma il 15/10/2026 ho scoperto che la bolla «peggiore» per quella metrica
   (0,086, la più grossa) era **il canone del thriller psicologico** — un mondo vero che nessun indice
   di token vedeva. Che metrica *dovrebbe* guidare la partizione?
2. **RB 200 è troppo fine?** La coerenza sale, le saghe restano collegate (0 spezzate), ma la mediana
   scende a 16 titoli. Per un carosello da 20 card, una bolla da 16 si svuota in una settimana. Il
   numero giusto dipende dal prodotto, e il prodotto qui non c'è.
3. **La separazione fra `graph/data/` e `.cache/` è corretta?** È la regola che rende possibile la
   manutenzione: i dati del modulo hanno una cartella loro, gli input scaricati stanno in cache. Ma il
   ripiego in `canon.A()` tiene ancora in vita il vecchio percorso — e finché c'è, ci sono due posti
   dove guardare.
4. **Un collocatore senza comportamento è utile?** Il voto diretto sui centroidi usa solo metadati. È
   l'unica cosa possibile per un titolo nuovo — ma è anche, per costruzione, cieco a ciò che gli utenti
   fanno davvero. Quanto vale un'indicazione che non ha mai visto un utente?

## 8. Come si lancia

```bash
python -m graph.pipeline stato       # inventario, dimensioni, hash di allineamento
python -m graph.pipeline ricetta     # i dieci pesi, la risoluzione, le soglie
python -m graph.pipeline colloca nuovi.json    # la collocazione di titoli nuovi
python graph/measure/saghe.py        # 0 saghe spezzate su 1.994
python graph/measure/contratti.py    # il retro-test dei contratti
```

Il modulo sta in `graph/`, **fuori da `src/`**: la scelta presa è job notturno offline, e `src/` non è
stato toccato in nessun momento di questo lavoro.
