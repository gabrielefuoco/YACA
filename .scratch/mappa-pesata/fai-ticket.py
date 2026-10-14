"""fai-ticket.py — l'effort `mappa-pesata`: il prossimo giro, i due prototipi e la proposta.

Nasce dalla coda di `todo-grafo` (report 08, «Prossimo giro, in ordine di rapporto fra valore e
costo»):

  1. LA MAPPA PESATA. I 6+2 sono costruiti sull'adiacenza binaria, che e' satura (95,7% delle coppie,
     grado mediano 798, rapporto 6°/7° vicino 1,074). Ma la MEDIANA DEL PESO degli archi e' 0,0: le
     relazioni vere sono poche e pesanti. La mappa va rifatta sul grafo pesato, e va verificato che
     resti navigabile (il ticket 23 di `grafo-servibile` aveva misurato che il k-NN MUTUO la frammenta
     in 143 componenti, mentre il k-NN DIRETTO simmetrizzato la tiene intera).

  2. I 94 CROSS-MEDIUM. 94 serie su 600 vivono in una bolla a maggioranza film, e il vincolo di
     medium le esclude per costruzione: valgono 0% con ogni metodo, e il tetto del voto diretto e'
     84,3%. Si toglie il vincolo e si misura quanto sale.

  3. LA PROPOSTA PER `src/`. Documento, non codice: `src/` non si tocca senza chiedere.

Nessun ticket modifica il prodotto. Il ticket 04 produce solo un documento.
"""
import pathlib

E = pathlib.Path(".scratch/mappa-pesata")
(E / "issues").mkdir(parents=True, exist_ok=True)
(E / "ricerche").mkdir(exist_ok=True)
(E / "log").mkdir(exist_ok=True)

(E / "map.md").write_text("""# mappa-pesata — il grafo pesato al posto dell'adiacenza, e i 94 cross-medium

## Destination

Chiudere le due cose che `todo-grafo` ha lasciato aperte, e preparare — senza eseguirla — la
proposta per `src/`:

1. **La mappa a 6+2 sul grafo PESATO.** Il ticket 07 di `todo-grafo` ha costruito i 6+2
   sull'adiacenza binaria e ha misurato che non seleziona niente: 95,7% delle coppie adiacenti,
   grado mediano 798, rapporto fra il 6° e il 7° vicino **1,074**. Ma la mediana del **peso** degli
   archi e' **0,0**, e l'arco Star Wars <-> Mandalorian vale 22,4 (34% del massimo). Il difetto e'
   dell'adiacenza, non del peso: va rifatta sul pesato, e va verificato che resti **navigabile**.
2. **I 94 cross-medium.** 94 serie su 600 hanno la bolla vera a maggioranza **film** e valgono 0% con
   ogni metodo, perche' il vincolo di medium le esclude per costruzione. Il tetto e' 84,3%.
3. **La proposta per `src/`**, come documento. Nessuna riga di prodotto.

## Decisions so far

- **Il voto diretto sui centroidi fa 35,3%** sulle serie (212/600, lift 85x, kappa +0,351, scollegate
  0,3%), contro il 2,2% dello studente dei film e l'1,3% di quello delle serie. Sui 506 in gara:
  41,9%. Costruito su V8, 336 bolle-serie, 122.314 termini.
- **Il ponte film->serie non funziona** in nessuna delle due forme (0,8% con la ricetta esatta
  dell'esperto, 2,5% con la mia) e la fusione peggiora sempre. Non si riprova.
- **La maschera di medium**: nel voto diretto si sceglie fra le sole bolle-serie. E' una scelta di
  prodotto (film e serie sono due cataloghi) ma e' anche cio' che esclude le 94.
- **La simmetrizzazione per UNIONE** (non per sostituzione): sostituire il ponte piu' debole evince un
  ponte gia' simmetrizzato e lascia 2.264 asimmetrie; l'unione le azzera.
- **Il k-NN mutuo frammenta** (143 componenti, ticket 23 di `grafo-servibile`), il **diretto
  simmetrizzato** no (5 componenti). La strada e' il diretto simmetrizzato, ora sul peso.
- `src/` non si tocca senza chiedere. Il ticket 04 produce un documento, non un cambiamento.

## Not yet specified

- Se il grafo pesato vada reso sparso con una **soglia** o con un **top-k per bolla**, e con quale k.
- Se il voto diretto debba poter atterrare su una bolla-film **sempre**, o solo quando il punteggio
  e' alto abbastanza da superare i candidati-serie.
- Se i 94 abbiano un segnale comune (paese? rete? genere?) che li renda riconoscibili a freddo.

## Out of scope

- Il ponte film->serie: misurato e bocciato in `todo-grafo` 06.
- Rimpicciolire o rifare la partizione: V8 e' congelata.
- Toccare `src/`: la proposta si scrive, l'implementazione si decide dopo.
""", encoding="utf-8")

TICKETS = [
(1, "La mappa pesata: cosa tiene, cosa butta, e se resta navigabile", """Rifare i 6+2 sul grafo **pesato** invece che sull'adiacenza binaria, e misurare cosa cambia.

Da misurare, non da assumere:
- la **distribuzione dei pesi** degli archi di `BB`: percentili, quanti archi hanno peso ~0, e quanta
  parte del **peso totale** sta nel top-8 di ogni bolla;
- due costruzioni a confronto — una **soglia** al percentile, un **top-k per bolla** — e per ciascuna:
  il grado risultante, il rapporto fra il 6° e il 7° vicino (il **ginocchio**: se resta 1,07 non
  seleziona ancora), e quanta parte del peso totale resta;
- la **connettività**, che e' il vincolo del ticket 23 di `grafo-servibile`: il k-NN **mutuo** frammenta
  la mappa in 143 componenti, il **diretto simmetrizzato** la tiene intera (5). La mappa pesata va
  verificata allo stesso modo: quante componenti, e qual e' la piu' grande;
- la **purezza di medium** delle relazioni: un vicino intra-medium dovrebbe restare
  intra-medium.

Esito: `01-pesata.py`, `ricerche/01-pesata.md`, e la scelta dichiarata di k o soglia con il numero
che la giustifica."""),
(2, "I 6+2 pesati, e una lettura a mano dei quartieri", """Costruire la mappa finale sul grafo pesato e **leggerla**, perche' i numeri da soli non dicono se i
vicini hanno senso.

- 6 intra-medium + 2 ponti cross-medium, simmetrizzati per **unione** (come al ticket 07 di
  `todo-grafo`: la sostituzione lascia asimmetrie);
- il controllo di §2.4 nei due versi (Guerre stellari <-> The Mandalorian), che deve continuare a
  passare;
- e la parte che conta: **leggere una decina di quartieri** e dire se sono mondi. Il test umano che
  il ticket 07 non poteva fare, perche' aveva una mappa che non selezionava.
- Verificare che nessuna bolla resti **isolata** e che le 1.625 bolle restino raggiungibili dalla
  mappa (la componente piu' grande).

Esito: `bolle-nitrile-V8-mappa-pesata.npz` + `ricerche/02-mappa-pesata.md`."""),
(3, "I 94 cross-medium: si toglie il vincolo e si misura", """Togliere il vincolo di medium dal voto diretto e misurare quanto sale, sapendo che il tetto passa da
84,3% a 100%.

Tre configurazioni, sulle stesse 600 serie e con lo stesso leave-one-out esatto del ticket 06c:
1. **solo bolle-serie** (com'e' adesso): 35,3%, tetto 84,3%;
2. **tutte le bolle** (serie e film): tetto 100% — quanto sale, e quanto sale **sulle 94**?
3. una via di mezzo da decidere: per esempio il film solo se il punteggio batte il migliore dei
   candidati-serie di un margine, oppure un peso diverso per i due medium.

E le 94 vanno **lette**: chi sono, in che bolle stanno, e se hanno un segnale comune (paese, rete,
genere, decennio) che li renda riconoscibili a freddo. Se il segnale c'e', la regola si puo' scrivere
invece di sperare nel punteggio.

Serve la stessa macchina del ticket 04/06c ma coi centroidi anche delle bolle-**film** (1.189): si
tengono **sparsi**, come al ticket 06, perche' densi sarebbero 580 MB.

Esito: `03-cross.py` + `ricerche/03-cross.md`."""),
(4, "Il collocatore in una funzione, e la proposta per `src/`", """Due cose, nessuna delle quali tocca il prodotto.

**A. Il collocatore.** Una funzione sola, documentata, che dato un titolo nuovo restituisce la bolla:
il voto diretto (coseno, pesi uniformi, leave-one-out), la regola di medium decisa al ticket 03, e il
punteggio di confidenza. Con i numeri finali per film e serie, e il costo in millisecondi per titolo.

**B. La proposta per `src/`**, come **documento**: cosa servirebbe, dove andrebbe, quali sono i rischi,
e cosa si rompe se si sbaglia. In particolare:
- il voto diretto e' un **coseno** fra due vettori: nessun modello da riaddestrare, ma servono i
  **centroidi** (336 + 1.189 vettori da 122.314 termini, sparsi) e il **vocabolario** congelato;
- i tre contratti di `canone.py` non hanno senso in produzione cosi' come sono: dire quali dei tre
  valgono la pena e in che forma;
- l'indice dei termini di un titolo nuovo lo costruisce TMDB, quindi il vocabolario va **congelato** e
  versionato: se cambia, tutti i centroidi vanno rifatti;
- cosa **non** portare: il banco, i contratti di banco, e la tentazione di rifare la partizione.

Esito: `colloca.py` + `ricerche/04-proposta-src.md`. **Nessuna riga di `src/`.**"""),
]

for n, titolo, corpo in TICKETS:
    slug = titolo.lower().replace(" ", "-").replace(",", "").replace(":", "").replace("`", "")[:42]
    (E / "issues" / f"{n:02d}-{slug}.md").write_text(
        f"Status: ready-for-agent\nType: task\n\n# {n:02d} — {titolo}\n\n{corpo}\n", encoding="utf-8")

print(f"creati {len(list((E/'issues').glob('*.md')))} ticket:")
for f in sorted((E / "issues").glob("*.md")):
    print("  ", f.name)
