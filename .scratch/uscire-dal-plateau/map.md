# Mappa — uscire dal plateau del grafo

## Destination

Un grafo che propone vicini **di tono**, non solo di pubblico; valutato con intervalli di confidenza;
con cold-start funzionante per i titoli nuovi.

Successo: *Barbie* con ≥2 affini (*Povere creature!*, *The Substance*, *Josie and the Pussycats*) e 0
falsi amici in top-10; R@20 ≥ 0,25 sul banco e quota >5k in top-10 ≤ 55%.

## Decisions so far

- **Il banco tonale è un TEST SET**: 200 semi, 3.870 link, scritti da agenti che non hanno mai visto il
  grafo. Non si usa per tarare niente. Per sviluppare serve il dev set del ticket 13.
- **Il tetto è la copertura, non il ranking**: R@500 = R@2000 = il numero di link presenti (26-30%).
  Il grafo non *ordina male* il 70% dei legami di tono, non li *contiene*.
- **V15 batte V21 di +0,0183 [0,0102, 0,0263]** (sopra l'MDE) sul banco tonale, a parità di semi e di
  pool. Le spiegazioni ovvie sono state testate e scartate: pool (0,001), chiusura a conteggio (+0,0008,
  rumore), peso COVISION (−0,0086, peggio). Resta l'ipotesi studente (ticket 16).
- **La base congelata è V19** (COVISION temporale, CREWPROP 0,35, chiusura `log`, gate asimmetrico):
  accuratezza identica a V18 (R@20 0,256 contro 0,254, sotto l'MDE) e **−10 punti di blockbuster**
  in top-10 (64,5% contro 74,5%). *Barbie*: Piccole donne #1 · Wonka · Lady Bird #3 · Oppenheimer #24.
- **Il tono deve prevalere sull'autoriale** (decisione dell'utente): il grafo non deve diventare «altra
  roba dello stesso autore». CREWPROP resta a 0,35 come appoggio, non come risposta.
- **Il residuo ortogonale al soggetto NON è il tono** (ticket 07, misurato): la riga TONE di *Barbie* è
  *Super Mario Bros. - Il Superfilm*, *V - Visitors*, *Doctor Who*. Il residuo concentra rumore
  specifico, non tono. La seconda metà (contrastivo) non si fa: addestrerebbe su rumore.
- **La chiusura è `log`, non `adamic-adar` né `conteggio`** (ticket 02): comprime la cricca da ×1211 a
  ×7,1, porta *Lady Bird* al #19 (era #61) e guadagna +0,026 SNIPS (sopra l'MDE) senza costi misurati.
- **La COVISION senza `--semplice` è la leva più forte per la coda** (ticket 03): −6,8 punti di
  blockbuster, −0,008 R@20 al limite dell'MDE, e la bolla del weekend 2023 rotta.
- **Il gate asimmetrico è innocuo ma insufficiente**: −1,4 punti di coda, tutto sotto l'MDE.
- **La maschera TRAMA è concettualmente giusta e numericamente inerte** (ticket 05): tutto dentro il
  rumore; i cartoni Mattel erano già al rango 172 grazie al damping di famiglia.
- **Togliere la chiusura non è un'opzione**: −0,012 R@20 (sopra l'MDE), blockbuster al 73,2%.
- **La valutazione ha un MDE di 0,005-0,012 su R@20** a 499 sorgenti: sotto quella soglia è rumore.
- **La configurazione `min` + k32 + spreading non si spedisce**: +0,003 R@20 e archi raddoppiati.
- **Nessun LLM-as-reranker**: il problema è la generazione dei candidati, non il riordino.
- **Le keyword TMDB 1-gram sono chiuse**: 15 varianti, nessuna produce il vicinato voluto.

## Not yet specified

- **Se `tone.py` e `critica.py` vanno cancellati o archiviati** (ticket 21): sono ipotesi falsificate,
  ma il codice documenta i numeri del perché. Proposta: `.scratch/falsificati/` con un README.
- **Il peso delle tagline** dentro LISTSEM (ticket 14): 10% di copertura ma tono puro.
- **L'equilibrio della COVISION** (ticket 19): fra 20 e 100 archi per riga, o nella forma del peso.
  Oggi solo V15 ha copertura ≥ 29% *e* precisione dentro la copertura > 30%.
- **Peso di CREWPROP**: 0,15 (deciso) — ma il ticket 21 propone di fonderlo in DIR e togliere il tipo.
- Se il prodotto debba restare a bolle o passare alla matrice sparsa (fuori da questo effort, ma
  blocca la messa in produzione di V18).
- La soglia oltre la quale un titolo nuovo ha abbastanza segnali per entrare nel grafo.

## Out of scope

- Rifare la partizione bolle sui 76.497 nodi o rimuovere le bolle dal motore di prodotto.
- Migrazione a LightGCN / GNN eterogenee (valutata e scartata dal senior: over-smoothing, cold-start
  incompatibile, nessun vantaggio atteso su dati sparsi a coda lunga).
- Attivazione del timer notturno (`ops/yaca-grafo.timer`): non prima del ticket 10.
- Interfaccia utente e qualsiasi modifica all'app.
