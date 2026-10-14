"""fai-ticket.py — l'effort `coerenza`: la risposta del senior, eseguita.

Il senior ha risposto su `todo grafo.md` (versione nuova, 23.789 byte) e chiede quattro cose:

  §1  spiegare perché V8 non ha la bolla «thriller psicologico» e **misurare** la coerenza dei mondi
      senza chiedere a un umano: l'Indice di Frammentazione N_eff(t) e l'Indice di Chimera (PMI)
  §2  i due livelli (macro bolla + micro titoli) sono la strada giusta, coi ruoli separati
  §3  la qualita' **semantica** senza la co-visione: la coerenza sulla TRAMA (embedding) e la
      scomposizione degli errori del banco in promozioni semantiche ed errori veri
  §4  tre contratti RELAZIONALI: `assert_loo_esatto`, `assert_universo`, `assert_allineamento_spazi`
  §5  cinque interventi: il bug geometrico dei centroidi, le bolle-continente, le chimere,
      i falsi vicini sulla mappa, e i pesi V3 dentro la costruzione delle bolle (V9)

Due cose da verificare subito, perche' il §3.1 dipende da loro:
  · l'`overview` c'e' solo per il 41% dei film e il 48% delle serie (58,8% e 51,5% vuote);
  · le trame presenti sono **in italiano**, e `bge-small-en-v1.5` e' un modello **inglese**.
"""
import pathlib

E = pathlib.Path(".scratch/coerenza")
(E / "issues").mkdir(parents=True, exist_ok=True)
(E / "ricerche").mkdir(exist_ok=True)
(E / "log").mkdir(exist_ok=True)

(E / "map.md").write_text("""# coerenza — eseguire la quarta risposta del senior

## Destination

Tradurre in misure le quattro domande di `handoff-senior-4.md`, come chiede il senior, e provare i
cinque interventi che ne derivano. In particolare: **un arbitro automatico della qualità semantica**,
che non usi la co-visione (perché per un titolo nuovo non esiste) e che non usi le feature del
collocatore (perché altrimenti si autoconferma).

## Decisions so far

- **Il limite è la partizione, non il metodo** (confermato dal senior §1): in V8 i capolavori del
  thriller psicologico sono «sequestrati» dalla bolla 820 dal pubblico generalista (l'attrattore
  comportamentale «chi guarda Fincher guarda anche Nolan» batte quello tassonomico), e gli altri
  thriller restano orfani in venti bolle.
- **I due livelli sono la soluzione strutturale** (§2), non un compromesso: una partizione globale e
  un vicinato locale risolvono problemi geometricamente incompatibili. Con un raccordo preciso:
  dentro una bolla grande, ordinare per `purezza · pct_locale` **moltiplicato** per `(1 + cos(x, j))`.
- **Il banco non è l'arbitro** (§3): la sua «bolla vera» è nata dal comportamento, quindi premiare la
  coerenza semantica *peggiora* il banco mentre migliora la qualità.
- **I contratti di non-degenerazione non bastano** (§4): il 63,7% e il 58,27% erano errori
  **relazionali** — array di output bellissimi che violavano un'identità rispetto agli input.
- **Due ostacoli al §3.1, misurati il 14/10/2026:** l'`overview` manca per il **58,8%** dei film e il
  **51,5%** delle serie; e le trame presenti sono **in italiano** mentre `bge-small-en-v1.5` è un
  modello **inglese**. La metrica va costruita tenendone conto, e il campione va dichiarato.

## Not yet specified

- Se il sub-clustering ricorsivo sulle bolle >60 titoli (senza toccare RB 100) sia praticabile nei
  tempi, o se convenga prima il top-M del centroide.
- Se il modello multilingue serva davvero, o se su un testo italiano `bge-small-en` dia comunque un
  segnale *relativo* utilizzabile (si misura, non si assume).
- Quanto costi il sub-clustering in memoria: V8 è già stato costruito al limite della macchina.

## Out of scope

- Toccare `src/`: resta la proposta, non l'implementazione.
- Rifare la partizione da zero: si parte da V8.
- Il ponte film→serie: misurato e bocciato.
""", encoding="utf-8")

TICKETS = [
(1, "I tre contratti relazionali, e il retro-test sui due incidenti", """I tre contratti di §4, e la prova che avrebbero fermato i due numeri gonfiati di questo giro:

1. **`assert_loo_esatto`** — il contratto contro il data leakage nel leave-one-out vettorizzato.
   Prende 5 item a caso, cancella davvero la loro riga, ricalcola il centroide senza di loro e
   verifica che il punteggio veloce coincida. **Il 63,7% sarebbe esploso** alla prima riga.
2. **`assert_universo`** — la copertura (quale frazione di `vero` sta fra i candidati, col tetto
   massimo stampato accanto al risultato) e il tasso base calcolato con **la stessa funzione di
   perdita**, vietando default impliciti. Il `caso 58,27%` e l'equivoco delle 94 nascono qui.
3. **`assert_allineamento_spazi`** — l'hash di `idf` e vocabolario dentro ogni `.npz`, verificato al
   caricamento, più un controllo semantico di boot: dieci bolle pure, il loro titolo archetipico
   passato a `colloca()`, e la bolla #1 deve essere la sua.

Il terzo ha un precedente concreto: l'autore di questo effort ci è **caduto dentro** scrivendo
`carica()` (idf grezzi contro corpus pesato per tipo), e se n'è accorto guardando, non per un crash.

Retro-test: rieseguire i due incidenti coi contratti attivi e mostrare quale assert li ferma.
Esito: i contratti in `canone.py`, `03-contratti.py` + `ricerche/01-contratti-relazionali.md`."""),

(2, "N_eff: quale mondo è frantumato, e quale è coeso", """L'Indice di Frammentazione del Mondo (§1.B.1): per ogni tropo tematico `t` (le ancore con
`30 ≤ df ≤ 1500`), la distribuzione `P(b | t)` dei titoli che lo portano sulle bolle, e il suo
inverso di Herfindahl `N_eff(t) = 1 / Σ_b P(b|t)²`.

Il senior prevede `N_eff(film noir) ≈ 2,1` (coeso) e `N_eff(psychological thriller) ≈ 18,5`
(polverizzato). Due numeri da **verificare**, non da citare: se non tornano, è il metodo a sbagliare.

Si stampa la classifica per intero, dalle ancore più coese alle più frantumate, con la dimensione
delle bolle che le raccolgono. È la risposta automatica alla domanda «come si misura la coerenza di
un mondo senza chiedere a un umano».

Esito: `02-neff.py` + `ricerche/02-neff.md`."""),

(3, "L'indice di chimera: PMI negativa fra i token dominanti", """L'Indice di Chimera Interna (§1.B.2): per ogni bolla si prendono i 5 token tematici (`ge:` e `kw:`)
col peso più alto nel centroide V3 e si calcola la PMI di ogni coppia **sul catalogo intero**. Una
PMI negativa fra due descrittori di testa identifica una bolla-chimera: due mondi incompatibili
incollati da un terzo fattore (paese, regista, decennio).

Le chimere che il senior nomina leggendo `bolle-esempi.md`, tutte da verificare:
- **bolla 594** (spaghetti western): `kw:spaghetti western` + `ge:horror` — con dentro *Zeder*,
  *Demoni 3*, *Dabbe*;
- **bolla 289** (supereroi) col vicino 1145 (*Emmanuelle in Space 6 e 7* insieme a *Freedom Fighters*);
- **bolla 820** (il minestrone di Verity).

Esito: `03-chimere.py` + `ricerche/03-chimere.md`, con la classifica delle bolle-chimera peggiori."""),

(4, "La coerenza sulla trama: l'arbitro che non usa la co-visione", """Il §3.1: `V3` usa generi, keyword, cast, registi, reti, case, paesi — **mai il testo della trama**.
Quindi la similarità fra le trame è una misura **indipendente** di qualità semantica, l'unica che
valga anche per un'uscita del 2026.

Da fare, tenendo conto di due ostacoli **misurati** (non ipotizzati):
- l'`overview` manca per il **58,8%** dei film e il **51,5%** delle serie → il campione va dichiarato,
  e il bias (i film senza trama sono i meno noti) va scritto;
- le trame presenti sono **in italiano** e `bge-small-en-v1.5` è un modello **inglese** → prima si
  **misura** se su un testo italiano dà comunque un segnale relativo utile (due trame simili contro
  due a caso), e solo dopo si costruisce la metrica. Se non lo dà, si dice e si propone il modello
  multilingue, invece di produrre numeri che non significano niente.

Poi: `Sim_trama` media fra ogni titolo del banco e i suoi 10 vicini micro, e fra il titolo e il
centroide di trama della bolla predetta — per V1 e per V3, così il disaccordo col banco diventa una
misura e non un sospetto.

Esito: `04-trama.py` (con l'embedding salvato) + `ricerche/04-trama.md`."""),

(5, "Promozioni semantiche o errori veri: la scomposizione del banco", """Il §3.2: sui casi in cui `bolla_predetta != bolla_vera`, calcolare la sovrapposizione di generi e
keyword **pure** (`ge:` + `kw:`) del titolo con la bolla predetta e con quella vera.

Se la bolla predetta è tematicamente più pura di quella vera, non è un errore del collocatore: è una
bolla comportamentale eterogenea che il collocatore ha evitato. Contare separatamente
`propria bolla + bolla tematicamente più pura` **toglie il falso trade-off fra V1 e V3**: il 32,0%
di V3 contro il 35,3% di V1 potrebbe diventare un vantaggio una volta contate le promozioni.

Esito: `05-promozioni.py` + `ricerche/05-promozioni.md`."""),

(6, "Il bug geometrico dei centroidi: il top-M e gli esemplari", """Il §5.1, ed è il difetto che spiega la curva 100% → 21%: la normalizzazione L2 **diluisce** i
centroidi grandi (migliaia di token non nulli) e **appuntisce** quelli piccoli. Le micro-bolle
battono sistematicamente le bolle grandi.

Due correzioni da misurare, non da scegliere a intuito:
1. **Top-M sparsification**: dalla media dei membri si tengono i soli `M ∈ [25, 35]` token più alti,
   **e solo dopo** si normalizza a L2 = 1.
2. **Scoring ibrido**: `0,5 · ⟨x, μ_b^(M)⟩ + 0,5 · (1/5) Σ_{j ∈ Top5(b,x)} ⟨x, v_j⟩`, dove i Top5
   sono i membri della bolla più simili a x. Così cinque thriller gemelli dentro una bolla da 100
   non vengono annacquati dagli altri 95.

Si misura sul banco (LOO esatto) **e** sulla curva per dimensione di bolla: la domanda è se il
ginocchio a 100 titoli si appiattisce.

Esito: `06-centroidi-geometria.py` + `ricerche/06-centroidi.md`."""),

(7, "I falsi vicini sulla mappa: peso normalizzato × coerenza", """Il §5.4. Sulla mappa pesata i vicini più forti di una nicchia sono bolle giganti: il seinen anime ha
per 3° vicino una bolla da 155 titoli di cinema italiano, il true crime ha per 1° *Concerto di Natale
con i Flintstones*. La causa: `BB = S.T @ Ws @ S` è la **somma grezza** degli archi, e una bolla da
150 titoli ha cinque volte il volume di fuoco di una normale, senza alcun filtro di coerenza fra i
due centroidi.

La correzione del senior:

    W_mappa(a, b) = BB_ab / sqrt(|a| · |b|) · max(0, cos(μ_a^V3, μ_b^V3))

Dividere toglie il vantaggio di volume, moltiplicare per il coseno fra i centroidi — che è già in
`05-centroidi.npz` — azzera i legami spuri. Da verificare: i tre casi che il senior nomina, e che la
mappa resti **una sola componente** (il vincolo del ticket 23 di `grafo-servibile`).

Esito: la mappa nuova + `ricerche/07-falsi-vicini.md`."""),

(8, "I pesi V3 dentro la costruzione delle bolle (V9)", """Il §5.5: `KW`, `CAST`, `DIR` e `PROD` che costruiscono V8 usano ancora `matrice_idf` di `bolle.py`,
**senza `df ≥ 3` e senza tetto all'IDF** — quindi le stesse keyword rare che rovinavano *Verity*
(`baffled`, `dreary`) stanno ancora dentro la partizione. V3 è applicato solo a valle, nel
collocatore.

Si porta `df ≥ 3` e il tetto IDF dentro `bolle.py:matrice_idf`, si rigenera, e si confronta con V8
sulle metriche che contano: le sentinelle, N_eff per le ancore, l'indice di chimera, e il banco.

**Non si assume che sia meglio**: la maschera di genere riparata ha già una volta cambiato la
partizione di poco e in modo non ovvio.

Esito: V9 + il confronto + `ricerche/08-v9.md`."""),

(9, "Le bolle-continente e le chimere: la maschera e la quarantena", """Il §5.2 e §5.3, i due interventi più invasivi, e vanno tenuti separati dalle misure:

1. **La maschera estesa a `CF`, `LIST`, `B`, `TV`** (oggi solo `DIR` e `CAST`), con fattore morbido
   ×0,30 quando due titoli non condividono né un genere specifico né una keyword: così *Gone Girl*
   resta con *Shutter Island* ma smette di essere incollata a *The Truman Show*.
2. **La severità di V7 ripristinata**: per non abbattere un arco `DIR`/`CAST` non basta un macro-genere
   generico — serve una keyword in comune **oppure due generi specifici**. È quello che ha fatto
   entrare *Zeder* e *Dabbe* negli spaghetti western dopo il ripristino di `genres`.
3. **La quarantena pre-Leiden**: zero archi fra un titolo NSFW e uno no (la regex di
   `build_graph.py:226`), e fra un horror senza western e un western senza horror (*via Zeder,
   Demoni 3, Dabbe*; *via Emmanuelle da DC Comics*).
4. **Il sub-clustering ricorsivo sulle sole bolle >60 titoli**, senza toccare RB 100 (che sulle
   nicchie da 15-40 titoli è perfetta). Da verificare: la bolla 820 si divide in *sci-fi
   mind-bending* e *thriller psicologico investigativo*?

Se il sub-clustering non sta nei tempi o nella memoria, va detto e si fanno i primi tre.
Esito: `09-maschera-e-subclustering.py` + `ricerche/09-continente-chimere.md`."""),

(10, "Il consolidamento: cosa cambia, cosa va rifatto, cosa resta aperto", """Chiudere l'effort con i numeri finali e le decisioni:

- quale partizione va in produzione (V8, V9, o V9 col sub-clustering), e con quale numero;
- la mappa nuova (peso normalizzato × coerenza) e la sua connettività;
- il collocatore: top-M, scoring ibrido, i due livelli, e i contratti di allineamento attivi;
- **l'arbitro**: se `Sim_trama` esiste e quanto discrimina; se no, cosa manca;
- i mondi frantumati: N_eff per le ancore, e quali si possono ricucire;
- cosa resta aperto per `src/`.

E una cosa da scrivere per forza: **quale delle cinque correzioni ha pagato e quale no.** Il senior
ne propone cinque; misurarne cinque e adottarne due è un buon risultato, purché si dica quali.
Esito: `ricerche/10-consolidamento.md` + la mappa aggiornata."""),
]

for n, titolo, corpo in TICKETS:
    slug = titolo.lower().replace(" ", "-").replace(",", "").replace(":", "").replace("`", "")[:42]
    (E / "issues" / f"{n:02d}-{slug}.md").write_text(
        f"Status: ready-for-agent\nType: task\n\n# {n:02d} — {titolo}\n\n{corpo}\n", encoding="utf-8")

print(f"creati {len(list((E/'issues').glob('*.md')))} ticket:")
for f in sorted((E / "issues").glob("*.md")):
    print("  ", f.name)
