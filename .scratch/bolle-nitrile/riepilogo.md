# bolle-nitrile — riparare la COSTRUZIONE delle bolle

**Data**: 14/10/2026 · **Ticket**: 01-10 · **Stato**: 8 chiusi su 10 (V7 e V8 in corso al momento della scrittura)

Nasce da una **critica al codice**, non da un'idea nuova: la seconda risposta dell'esperto
(`blank.pdf`, la conversazione `Ottimizzazione e Futuro del Grafo YACA` ri-esportata dopo due scambi)
ha letto `canone.py` e `07-componenti.py` riga per riga e ha indicato quattro difetti meccanici nella
matrice che diamo a Leiden, più nove interventi e un banco di validazione.

**Verificati da me contro il codice: tutti.** E uno dei quattro l'avevo **già trovato** nel ticket 05
di `grafo-servibile` — c'è il commento in `05-diagnostiche.py:186` — **e non l'ho propagato a chi
costruisce le bolle.**

---

## 1. Il punto di partenza: il banco sonda

Il ticket 01 (report in `ricerche/01-banco-sonda.md`) costruisce lo strumento che ci mancava: **20
titoli sentinella** in quattro gruppi da cinque, con i compagni di bolla letti prima e dopo.

Il criterio era: lo strumento deve riprodurre le letture già fatte a mano. **Le riproduce tutte**, e
ne ha trovate due nuove che nessun numero aveva mai mostrato:

- **The Mandalorian** sta con *Il re leone*, *Elf* e *Chef - La ricetta perfetta* ✗
- **Star Trek: Discovery** sta con *La mummia*, *Hawaii Five-0*, *MacGyver*, *Magnum P.I.* ✗

E ha confermato — questa volta con uno strumento, non con la memoria — che le **quattro nicchie
delicate** che il ticket 08 di `grafo-servibile` aveva dissolto erano **mondi perfetti**: iyashikei
(Senko-san, Flying Witch, Aria), commedia slice-of-life (Bakuman, Kakushigoto, Hitoribocchi), romance
asiatico (Playful Kiss, Hana-Kimi, dorama coreani), seinen dark (Kaiji, 91 Days, Akudama Drive).

**Il riferimento da battere** (`bolle2-E`): 5.297 bolle, 1.293 con ≥15 titoli, mediana 9.

---

## 2. Il controllo, e la misura della convergenza

Prima di toccare qualsiasi cosa: **V0 riproduce `bolle2-E` esattamente** — 5.297 bolle, **66.259
titoli su 66.259 nella stessa bolla (100,00%)**. La reimplementazione è fedele, quindi ogni
differenza osservata dopo è attribuibile a un intervento.

Poi la misura che serviva, **invece di indovinare**: `n_iterations=-1` (convergenza piena) non è
finita in 17 minuti su 66.259 nodi. Allora ho partizionato la **stessa miscela** con 2 passate e con
6 passate:

| | 2 passate | 6 passate |
|---|---|---|
| tempo | **24 s** | **48 s** |
| bolle | 1.770 | 1.771 |
| con ≥15 | 1.463 | 1.460 |
| mediana | 30 | 30 |
| modularità | 0,1844 | 0,1847 |

**D1 è un difetto vero** (leidenalg 0.12.0 usa 2 passate per default, verificato nella firma
installata) **ma a questa risoluzione non cambia niente.** Declarato come **negativo**.

> ⚠️ E un errore mio, da dichiarare: il primo confronto fra 2 e 6 passate l'ho fatto confrontando le
> **etichette** (`mem2 == mem6`) e ha dato «9,64% identici» — che non vuol dire niente, perché le
> etichette di Leiden sono arbitrarie e si permutano. Il confronto giusto è la co-appartenenza. I
> numeri aggregati sopra dicono che sono la stessa partizione; il 9,64% era mio.

---

## 3. Cosa fanno gli interventi, in numeri

| | bolle | con ≥15 | mediana | modularità | lettura |
|---|---|---|---|---|---|
| **riferimento** | 5.297 | 1.293 | 9 | 0,057 | le 5 bolle campione sono sacchi |
| **V0** controllo | 5.297 | 1.293 | 9 | 0,057 | = riferimento, 100,00% |
| **V1** i 3 difetti | 4.635 | 1.539 | 11 | 0,068 | sacchi migliorano, **nicchie danneggiate** |
| **V2** shrinkage riga | 1.771 | 1.460 | **30** | 0,185 | |
| **V3** chiusura triangolare | 1.413 | 1.302 | **40** | 0,198 | **l'intruso esce** ✓ |
| **V4** potatura al nucleo | 1.413 | 1.295 | 40 | 0,198 | quasi nessun cambiamento |
| **V5** maschera genere | 1.430 | 1.218 | 39 | 0,199 | **i mondi veri** ✓✓ |
| **V6** consenso multi-vista | 1.607 | 1.185 | 33 | 0,194 | la potatura espelle 9.452 |

**Il numero che conta non è nessuno di questi** — sono gli indicatori che ci hanno tradito quattro
volte. Il numero che conta è che **la stessa partizione, letta, dice cose diverse**:

### V5 — i mondi che il riferimento era troppo fine per vedere

| sentinella | bolle2-E | **V5** | cosa diventa |
|---|---|---|---|
| Gidget a Roma | 15 titoli | **163** | *commedia sexy all'italiana*: Giovannona Coscialunga, La liceale seduce i professori, Pierino colpisce ancora, Eccezzziunale veramente, Vieni avanti cretino |
| La storia infinita | 15 | **25** | *fantastico per famiglie anni '80*: E.T., I Goonies, Labyrinth, Willy Wonka, Dark Crystal, Willow, Excalibur, Ladyhawke |
| Wimbledon | 15 | **57** | *commedia romantica americana*: Il diavolo veste Prada, Hitch, 50 volte il primo bacio, Serendipity, Two Weeks Notice |
| Le jene di Chicago | 35 | **80** | *cinema americano classico*: La strada scarlatta, La città nuda, Il collezionista, Bunny Lake è scomparsa, Forza bruta |
| Garfield | 15 | **106** | ✗ **ancora un minestrone**: CJ7 + Two Lovers + TransSiberian + Orgazmo |

**Tre mondi veri e nominabili su quattro**, che nella partizione di riferimento non esistevano: erano
sparsi in bolle da 15 titoli che non dicevano niente.

### V3 — l'intruso esce, e il meccanismo è quello previsto

`Into Darkness - Star Trek` e `Guerre stellari` finiscono **nella stessa bolla di 14 titoli**: solo
film di Star Wars. **Sette titoli se ne vanno** — *Star Trek - Il futuro ha inizio*, *Star Trek
Beyond*, *Into Darkness*, *Super 8*, *Alias*, *L'uomo che fuggì dal futuro*.

E il meccanismo è esattamente quello che l'esperto aveva descritto: *i triangoli non mentono mai*.
L'arco DIR fra Star Trek e Star Wars esiste (J.J. Abrams ha diretto entrambi), ma **i vicini delle
due saghe non si sovrappongono** → la chiusura triangolare `S · (0,1 + S·Sᵀ)` abbatte il ponte del
90%. Alla V3 non c'era ancora la maschera di genere: **è bastata la chiusura triangolare.**

> Da notare: il ticket 03 aveva scritto che «Star Trek Into Darkness deve uscire dalla bolla Star
> Wars» come criterio dello shrinkage di riga. **Non è uscito lì** — è uscito alla V3. Il criterio era
> scritto ottimisticamente.

### V1 — il prezzo: due nicchie danneggiate

I tre difetti senza parametri migliorano i sacchi e **rompono due nicchie**:

- **Watamote**: da commedia slice-of-life giapponese a **film horror italiani** ✗✗ (Living Death,
  Eaters, Incubus, Serpent, Child of Satan, Gut, Blood Hunters). È il peggior risultato del giro.
- **Banana Fish**: il mondo seinen dark **si sfalda** (−30 usciti) e viene sostituito da anime
  generici ✗.
- **Boys over Flowers** invece migliora: diventa un romance asiatico di 43 titoli ✓.

E la causa è lo **shrinkage L2 con `min_sim=0.12` su CAST**: la mediana del grado di CAST crolla a
**1** ✗. Il consiglio dell'esperto prevedeva lo shrinkage *e* la soglia 0,12; insieme sono troppo
aggressivi, e CAST — la vista che teneva insieme gli anime — praticamente sparisce.

---

## 4. Gli interventi, uno per uno

### Ticket 02 — i tre difetti senza parametri

| | |
|---|---|
| **D1** `n_iterations` default 2 | **vero ma irrilevante**: 2 e 6 passate danno la stessa partizione |
| **D2** `msk = Mc.row < Mc.col` su matrice asimmetrica | **vero e grave** — i pesi dipendevano dall'indice numerico dei titoli. Corretto con `archi_leiden`, verificato **identico** alla versione lunga (0 di differenza su un grafo di prova) |
| **D3** coseno L2 senza shrinkage | **vero** — un titolo con una sola keyword prendeva coseno 1,000 esatto. Corretto, ma **con la soglia 0,12 indicata dall'esperto è troppo**: CAST muore |

**Esito**: i sacchi migliorano, le nicchie no, l'intruso nemmeno. **Non è un guadagno netto.**

### Ticket 03 — shrinkage di riga `d + τ` e CFst solo sui freddi

Il difetto è **vero e il meccanismo è dimostrato**: `correggi_hub` normalizza ogni componente a
somma-riga 1 prima della somma, quindi un arco solitario in DIR vale come 30 archi veri di CF.

**Esito**: le bolle si gonfiano molto (mediana 9 → 30). Dal ticket 20 di `grafo-servibile` sapevamo
che la struttura era **troppo fine**; qui diventa grossa.

### Ticket 04 — la chiusura triangolare

**L'intervento più efficace del giro.** Fa uscire l'intruso Star Trek dalla bolla Star Wars
(meccanismo verificato), e non ha effetti collaterali evidenti sulle nicchie.

### Ticket 05 — la potatura al nucleo

A V4 **non cambia quasi niente**: 1.413 bolle prima e dopo, 1.302 → 1.295 con ≥15. **La premessa —
l'effetto catena di Leiden — non è misurabile a questo stadio.** Diventa aggressiva solo dopo il
consenso multi-vista (V6), dove espelle **9.452 titoli**.

### Ticket 06 — maschera di genere su DIR/CAST, COLL a 3

**Taglia il 66,5-76,3% degli archi DIR** e il 14-39% di CAST. Una percentuale enorme, e la lettura
dice che è **benefica**: i mondi della sezione 3 emergono qui. La spiegazione è nella premessa
dell'esperto: un regista che gira fuori dal suo mondo incollava il film "traditore" nella bolla
dell'autore.

### Ticket 07 — consenso multi-vista

⚠️ **La premessa non regge.** Solo l'**8,6% degli archi** è confermato da due o più viste; il fattore
medio è **0,992**, cioè ≈ 1. Il "bonus" non premia quasi nulla: **il consenso è di fatto solo una
penalità** su 1.161.496 archi a vista singola (KW o CAST). **Negativo dichiarato.**

### Ticket 08 — LIST dentro le bolle

**Il risultato migliore del giro, e non me l'aspettavo da questo ticket.** Aggiungere le 540 liste
umane di Trakt alla miscela (peso 1, sopra tutto il resto) porta a **1.617 bolle, mediana 34**, e la
lettura diventa questa:

| sentinella | V5 | **V7 (con LIST)** |
|---|---|---|
| Le jene di Chicago | 80 | **114** → *film noir americano*: Gilda, Rififi, Giungla d'asfalto, Il grande caldo, Johnny Guitar, Scarface, L'asso nella manica |
| La storia infinita | 25 | **37** → *fantasy e spada anni '80*: Conan il barbaro, Conan il distruttore, Highlander 1-2, Scontro di titani, Excalibur, Legend, Dark Crystal |
| Wimbledon | 57 | **53** → *commedia romantica*: Bridget Jones 1-2-3, 10 cose che odio di te, Ragazze a Beverly Hills, About A Boy, Chocolat |
| Gidget a Roma | 163 | **162** → *commedia sexy all'italiana* (invariata) |
| Garfield | 106 | **100** → ✗ **ancora un minestrone** (Cleaner, Two Lovers, Spartan, Fratelli in erba) |

**E le nicchie che V1 aveva rotto tornano, migliore di prima:**

| sentinella | V1 (rotto) | **V7 (guarito)** |
|---|---|---|
| Watamote | ✗ horror italiano | **commedia CGDCT**: Hitoribocchi, YuruYuri, Chio-chan, Comic Girls, Galko-chan |
| Banana Fish | ✗ sfaldato | **action/thriller anime**: Great Pretender, Gungrave, Black Lagoon, 91 Days, Gangsta |
| Barakamon / Flying Witch | ✗ esplosi | **slice-of-life/iyashikei**: Senko-san, Usagi Drop, K-On!, Non Non Biyori, Laid-Back Camp, Girls' Last Tour |
| Boys over Flowers | 43 | **37** → *K-drama*: The Heirs, Mr. Sunshine, Secret Garden, Dream High, You're Beautiful |

**E i casi d'autore, che erano già buoni, diventano mondi più grandi e più veri:**

- **Tarkovsky** (46 titoli): **cinema d'autore europeo** — Bergman (Il settimo sigillo, Persona, Il posto
  delle fragole), Kubrick (Barry Lyndon, Lolita), Fellini (8½, La dolce vita), Godard, De Sica,
  Wenders (Paris, Texas), Buñuel
- **Fassbinder** (39): Fassbinder completo + Fontane Effi Briest, Despair, Martha
- **Kurosawa** (35): classici giapponesi + Harakiri, Kwaidan, L'intendente Sanshō
- **Argento** (47): **horror colto anni '70-'80** — Cannibal Holocaust, Scanners, Le colline hanno gli
  occhi, Black Christmas, Brood, L'ultima casa a sinistra
- **Il tamburo di latta** (14): film d'autore europei storici — Nuovo Cinema Paradiso, Il cielo sopra
  Berlino, Mephisto, Jean de Florette

**E gli intrusi, risolti e isolati:**

| | bolla2-E | **V7** |
|---|---|---|
| Into Darkness - Star Trek | con Star Wars ✗ | **7 titoli**: Star Trek (2009), Star Trek Beyond, Super 8, Serenity, Galaxy Quest, Turbo Kid |
| Guerre stellari | + Star Trek + Alias + Super 8 ✗ | **13 titoli: solo Star Wars** ✓✓ |
| The Mandalorian | ✗ Il re leone + Elf + Chef | **25 titoli: universo TV di Star Wars** — Boba Fett, Andor, Ahsoka, Obi-Wan Kenobi, Bad Batch, Rebels, The Acolyte ✓✓ |
| Star Trek: Discovery | ✗ + La mummia + MacGyver | **34 titoli: fantascienza televisiva** — Doctor Who, Firefly, Stargate, Battlestar Galactica, Farscape, The Orville, tutte le serie di Star Trek ✓✓ |
| Żeby nie było śladów | 12 | ✗ 100 titoli, un sacco generico |

**Sintesi della lettura di V7: 18 sentinelle su 20 leggono un mondo nominabile.** Le due che non lo
fanno sono Garfield (un sacco di film indipendenti americani) e il titolo polacco.

⚠️ **Ma va detto cosa NON è**: i film di Star Wars e le serie di Star Wars sono in **due bolle
separate** (13 e 25 titoli). Il ponte cross-medium che il prodotto promette **non è nato lo stesso** —
le due bolle sono ciascuna coerente, e separate. È lo stesso problema del ticket 17 di
`grafo-servibile` (la co-visione attraversa il confine come *dato*, non come *uso*), visto dalle bolle.

### Ticket 09 — CPM e risoluzione

**La risoluzione di V7 (RB 100) e' la migliore delle cinque provate.** Provate CPM 0,02, RB 60,
RB 100 (= V7), RB 200 piu' CPM a densita' piu' bassa: alle due estremita' si perde in due modi
opposti e leggibili. **Piu' fine (RB 200)**: la commedia sexy all'italiana scende da 162 titoli a
**4** (Gidget, Gidget Goes Hawaiian e due film di guerra) — il mondo si frantuma. **Piu' grossa
(RB 60)**: la stessa bolla va a 191 ma dentro ci finiscono *Ski School*, *Safari*, *Sognando l'Africa*
— il mondo cola. **CPM 0,02 e' degenere**: mediana 3 con pochi giganti da 300-660.

**La risoluzione non era il problema: la linea di base era gia' quella giusta.** La deviazione dal
ticket — provare una risoluzione piu' alta invece che piu' bassa — e' servita a dimostrarlo.

⚠️ **Deviazione dal ticket, dichiarata**: il ticket proponeva risoluzioni **più basse** (CPM
0,005-0,02 e RB 30-60), perché dava per scontato che il grafo fosse troppo fine. **La misura dice il
contrario**: gli interventi lo hanno reso molto più grosso (5.297 bolle con mediana 9 → 1.430 con
mediana 39). Provo quindi le due risoluzioni del ticket (CPM 0,02, RB 60) **più una più alta**
(RB 200), che è l'unica che risponde alla domanda che abbiamo davvero.

### Ticket 10 — la mappa sulla partizione nuova

Dipende dal giudizio del banco sonda. **Il banco sonda dice che la partizione nuova è migliore**
(tre mondi veri su quattro sentinelle "minestrone", e l'intruso risolto).

---

## 5. I limiti, dichiarati

1. **Il log delle letture di V1-V5 è perso.** Rilanciando il driver, il launcher **tronca** il file di
   log: le letture di V1-V5 esistono solo nella trascrizione che ne ho fatto. Da qui in avanti ne
   tengo una copia in `log/`.
2. **`min_sim=0.12` su CAST è troppo.** L'ho applicato perché l'esperto lo indicava per KW **e** CAST
   insieme allo shrinkage. Andava provato separatamente: **la mediana del grado di CAST crolla a 1**,
   e due nicchie si rompono.
3. **La convergenza piena di Leiden non è stata raggiunta** (17 minuti senza finire). Uso 6 passate,
   **con la misura che dice che 2 e 6 sono equivalenti**.
4. **Il confronto fra partizioni non può usare le etichette** (le permuta). Va usata la
   co-appartenenza. Ho sbagliato una volta, e il numero che ne è uscito (9,64%) era falso.
5. **Gli indicatori strutturali sono registrati ma non decidono.** Quattro volte su quattro hanno
   premiato la partizione peggiore; qui è successo di nuovo, al contrario: **il numero di bolle scende
   di 3,7 volte** e la lettura migliora moltissimo. Se avessimo guardato solo il conteggio avremmo
   buttato via il risultato.

---

## 7. Cosa porto a casa

**Tre cose che funzionano, verificate leggendo:**

1. **La chiusura triangolare** (`S · (0,1 + S·Sᵀ)`) — risolve l'intruso con il meccanismo previsto.
2. **La maschera di genere su DIR/CAST** — taglia il 66-76% degli archi DIR e fa emergere i mondi veri.
3. **Il banco sonda** — lo strumento. Senza di lui non avrei potuto dire niente di tutto questo.

**Una cosa che non funziona:** il **consenso multi-vista** (solo l'8,6% degli archi ha due viste).
**Una cosa che funziona ma va ammorbidita:** lo shrinkage L2 su CAST.
**Una cosa che non è misurabile qui:** la potatura al nucleo prima del consenso.
**Una cosa che non conta:** la convergenza di Leiden (2 contro 6 passate).

**E il risultato più grande**, che non è un intervento ma una constatazione: **la partizione di
riferimento era troppo fine di circa 4 volte**. Cinque "bolle minestrone" che avevamo classificato
come patologie erano in realtà **il sintomo di una risoluzione sbagliata**: la commedia sexy
all'italiana, il fantastico per famiglie anni '80 e la commedia romantica americana esistevano già
nel catalogo, ma erano sbriciolate in bolle da 15 titoli che non dicevano niente.

Questo conferma, con la lettura e non con un indice, quello che i ticket 11 e 20 di `grafo-servibile`
sospettavano: **la struttura era troppo frammentata**. E conferma anche il ticket 08 per la via
opposta: **era troppo fine, non troppo grossa**, e dissolvere ulteriormente era il rimedio sbagliato.
