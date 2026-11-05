# TRIBU — ablazione e riproducibilità

Confronto appaiato sul dev set umano (166 sorgenti, 3.063 link) e sui soliti 30 film + 20 serie.
Tutti i tipi diversi da TRIBU sono **byte-identici** agli input V42 `tipi2-pesi`; il confronto isola quindi
la matrice TRIBU e il suo peso. Le liste del tonal bank non sono state usate.

## Ricetta di TRIBU

`tribu_gusto.py` crea una matrice binaria utenti Trakt × titoli. Pesa gli utenti per `1/sqrt(storia)` e i
titoli per `grado^-0,65`, fattorizza con SVD a 64 dimensioni, rimuove le quattro componenti più correlate
alla popolarità, conserva per film le tre componenti positive più forti e costruisce i top-100 per coseno.
È un segnale di **co-visione segmentata per pubblico**, non rating, keyword o cast. In V42 il suo peso è 0,15;
RESID (MovieLens residualizzato) è 1,2.

## Il bug di riproducibilità

La vecchia chiamata a `svds` non passava un seed. Ricalcolando con gli stessi input si otteneva sempre
2.767.000 archi, ma solo il **10,3%** delle coppie coincideva con la TRIBU storica V42; sulle coppie comuni
la correlazione dei pesi era 0,81. Il numero di archi da solo nascondeva quindi una matrice diversa.

Ora `profilo_svd` usa `v0` deterministico e canonizza il segno dei vettori singolari. La stessa build
ripetuta dà **0 differenze** nell'intera matrice. Conserva inoltre il profilo SVD grezzo in
`services/graph_dense/data/embeddings/tribu-svd-k64-b0p65-seed20261105.npz`, così si possono provare
`top`, `mainstrema` e il peso senza rifare la fattorizzazione.

## Ablazione a pesi 0 / 0,15 / 0,30

| variante | R@5 | R@10 | R@20 | MRR | >5k top-10 |
|---|---:|---:|---:|---:|---:|
| V42 storico | 0,0078 | 0,0165 | 0,0284 | 0,00808 | 69,0% |
| nuova TRIBU 0,15 | 0,0081 | 0,0165 | 0,0284 | 0,00811 | 68,9% |
| senza TRIBU | 0,0081 | 0,0165 | **0,0287** | 0,00810 | 68,7% |
| nuova TRIBU 0,30 | 0,0081 | 0,0168 | 0,0284 | 0,00804 | 69,1% |

Confronti appaiati su R@20:

- TRIBU 0,15 − senza TRIBU: **−0,0003**, IC95 [−0,0016; +0,0010], MDE 0,0020.
- TRIBU 0,30 − senza TRIBU: **−0,0003**, IC95 [−0,0021; +0,0017], MDE 0,0027.
- Sono tutti sotto l'MDE: nessun vantaggio di recall misurabile.

Nell'audit di 400 semi, TRIBU spiega direttamente il **2,4%** dei vicini con peso 0,15 e il 2,9% a 0,30;
RESID ne spiega il 21,3%. Sono quote sovrapposte, non esclusive.

Sui 50 semi top-6: V42→senza TRIBU cambia i candidati in 8/50 liste; senza→TRIBU 0,15 in 9/50;
0,15→0,30 non cambia nessun insieme di candidati (5 posizioni su 300 si riordinano). I cambi non sono
sistematicamente migliori: per esempio *Downhill* guadagna *Chalet Girl*; *Drive* scambia *Come un tuono*
con *Grindhouse*.

## Decisione provvisoria

TRIBU è una ragione distinta e talvolta cambia i vicini, ma con la ricetta attuale **non migliora il dev
set**. Non alzare il peso sulla base di questi numeri. Conservare l'embedding deterministico e il comando
per sweep successivi; la pipeline completa usa seed 20261105. V42 storico resta intatto.

Artefatti dell'ablazione, temporanei: `.cache/tribu-ablation-v42/`. La pipeline full V42D è
`services/graph_dense/build_graph.py`; non è stata ancora eseguita end-to-end, perché i pesi Qwen necessari
per materializzare una volta KWSEM/LISTSEM non sono nella cache locale.
