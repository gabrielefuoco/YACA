# Handoff 2 — i FALLIMENTI della fase, e cosa non sappiamo decidere

*Per il collega senior che ci dirà come proseguire. La prima richiesta di aiuto è in
`.scratch/ml-collaborativo/handoff-senior.md`: quella fotografava il lavoro **prima**. Questa è
dopo **24 ticket chiusi**, e riguarda soprattutto **quello che non ha funzionato**.
Tutto il materiale è nel repo, branch `main`. **Niente è in produzione**: `src/` non è stato toccato.*

---

## 0. Cosa c'era in ballo, in mezza pagina

Il prodotto: un add-on per Stremio, due cataloghi serviti separatamente (film e serie), il criterio
dichiarato **sorprendente + azzeccato + agnostico fra i medium**. Il "sorprendente" è stato
ridimensionato da chi ci ha preceduto a un parametro a valle (temperatura) — **e questa fase ha
scoperto che è sbagliato anche quello**: la temperatura produce scelte sub-ottimali, non sorprendenti.

La fase doveva consegnare tre cose: **un righello onesto** (non c'era), **bolle nitide** (c'erano ma
non giudicabili), **una mappa navigabile** (non c'era). Le ha consegnate tutte e tre, e le ha usate
per smontare quasi tutto quello che aveva costruito. Di questo parla il documento.

**Lo stato finale**: 24 ticket su 24 chiusi, un nuovo ticket creato a metà strada perché due dei
ticket precedenti erano in conflitto (§2.5), e **la decisione finale ribaltata due volte** (§3.1, §3.3).

---

## 1. I FALSI POSITIVI — quattro artefatti che sembravano risultati

Sono la parte più importante di questo documento. **Ogni volta, senza il controllo accanto, il
numero sembrava un fatto.**

### 1.1 «La fusione a due stadi raddoppia il @10 sul giudizio esperto» — era l'ordine di indice

Il teacher era lo spazio del comportamento, che copre 49.041 film e **zero serie**. Le sorgenti del
banco di giudizio sono **tutte serie**. Quindi il teacher era **la matrice nulla**, e `argsort` su
valori tutti uguali restituisce **l'ordine di indice**: una permutazione fissa, non un metodo.

**Prova**: il "teacher nullo" e il controllo "ordine di indice" danno numeri **identici**; il
controllo con permutazione casuale dà **0,00%**. Il report 58 è stato ritrattato.

### 1.2 Il riferimento storico della fase precedente (18,90% @10 sul curato) era gonfiato dallo stesso artefatto

Ricostruito e decomposto: delle 249 sorgenti, **83 hanno un teacher vero e 163 un teacher nullo** —
e l'aggregato era dominato dalle seconde, dove la fusione "guadagnava" dal nulla.

### 1.3 Il numero canonico del prodotto non si riproduceva — e la causa era un file rigenerato

`canone-misure.log` (12/10 19:54) dava 5,99 / 29,61 / 63,35 / 87,86. Rifatto: 6,00 / 29,56 / 63,31 / 87,85.

**Due ipotesi, la prima sbagliata**: ho pensato a un artefatto di pari merito sul bordo della
classifica — **falso**, i titoli irraggiungibili sono zero e i due protocolli di rango scelgono gli
stessi titoli in 1000/1000 casi. **La causa vera**: `boot-B.npz` era stato **rigenerato dopo** la
misura di riferimento, e il grafo canonico contiene B a peso 1. Con la B vecchia il numero torna
**esatto**.

**Conseguenza che vale più del numero**: il "quinto controllo obbligatorio" che ci eravamo dati —
*«un componente della parte serie non deve muovere i numeri del catalogo film»* — **è falso per il
grafo canonico**. In un grafo misto non esiste un componente "della parte serie": B è serie→serie e
ha mosso i numeri film di 0,05. Il controllo vale solo per la ricetta minima.

### 1.4 La popolarità "invertita" — una falsa pista, e il modo in cui l'ho scoperta

Ho sospettato che la baseline di popolarità archiviata fosse costruita al contrario
(`argsort(argsort(voti))` dà il rango **ascendente**). **Falso**: la catena `ranghi(tile(pop))` fa la
doppia inversione ed è corretta — il numero archiviato (0,94 / 7,36 / 25,03) si riproduce **al
centesimo**.

**Ma inseguendo quel sospetto ho trovato un bug vero e mio**: i controlli di popolarità di un ticket
passavano un **rango** a una funzione che applica `K.ranghi` (che vuole un **punteggio**),
**invertendola**. Il controllo dava 0,00% dove il vero è 0,94%. E la mia "correzione" ha fatto la
stessa inversione al contrario: il secondo giro dava ancora 0,00%.

**L'ho trovato perché due strade indipendenti davano numeri diversi** e l'archivio ne indicava un
terzo. **Con un solo strumento avrei archiviato 0,00% come un fatto.**

---

## 2. I FALLIMENTI STRUTTURALI — quattro indicatori che premiano ciò che l'occhio condanna

Il più importante: **ogni indicatore strutturale che abbiamo provato ha premiato una cosa che
leggendo i titoli era palesemente peggiore.** Quattro volte, con quattro indicatori diversi.

### 2.1 La modularità (tre misure concordi)

Il grafo del contenuto ha modularità **più alta** (0,301 contro 0,205) e bolle **peggiori**.
Aggiungendo i componenti buoni la modularità **scende** da 0,205 a 0,057 e la qualità **sale**.
Togliendone uno la modularità **sale** e la qualità non cambia. **Non usatela.**

### 2.2 λ₂ e la purezza (ticket 05)

La caccia alle chimere (bassa connettività algebrica) e la purezza media **non riconoscono** le
bolle che la lettura aveva giudicato cattive. Le 5 minestrone hanno purezza **0,176 contro una
mediana di 0,168**: indistinguibili. E il criterio del ticket era **impossibile per costruzione**: la
caccia guarda le bolle con più di 35 titoli, 4 delle 5 minestrone ne hanno 15.

### 2.3 Il conteggio delle bolle (ticket 07)

Quattro interventi sui componenti: le bolle utilizzabili salgono da 1.293 a **1.550 (+19,9%)**. Il
giudice automatico dice **F 51,0% contro A 53,3%** — cioè niente. Due indicatori, due storie opposte,
e **la lettura non è stata fatta** (è rimasta aperta di proposito).

### 2.4 Il conteggio, di nuovo — e qui il meccanismo è VISIBILE (ticket 08)

La rifinitura adattiva (split delle chimere, dissoluzione delle pattumiere, assorbimento delle
briciole, film-portale): **+12,6% di bolle utilizzabili, micro-bolle dimezzate, 145 chimere su 215
divise, i portali sensati.** Tutti i criteri strutturali soddisfatti.

**Poi ho letto le bolle toccate — 14 — e sono 14 su 14 contro:**

- **4 divisioni su 4 spezzano un mondo coerente**: true crime diviso in due true crime, telenovelas
  in due telenovelas, corti Disney in due corti Disney. Le densità giustificavano il taglio
  (0,002 fra le metà contro 0,01-0,017 interna) e la conclusione semantica è sbagliata.
- **6 dissoluzioni su 6 distruggono mondi nominabili**: seinen anime (Banana Fish, Kaiji, 91 Days),
  slice-of-life comico giapponese (Watamote, Bakuman), romance asiatico live-action (Boys over
  Flowers), romance da ufficio, dorama giapponesi, e **iyashikei** (Senko-san, Barakamon, Aria,
  Flying Witch). **La purezza è bassa perché un anime ha legami con altri anime per studio, attori e
  autore ANCHE QUANDO IL MONDO È STRETTISSIMO.**

**Il meccanismo è visibile**: il +12,6% veniva dall'aver **rotto bolle buone**. Non è un'ipotesi sul
perché i due indicatori divergono — è la spiegazione, letta titolo per titolo.

**Verdetto**: tenere l'assorbimento delle briciole e i film-portale, **buttare lo split delle chimere
e la dissoluzione delle pattumiere.**

### 2.5 E questo ha generato un CONFLITTO fra due ticket, scoperto costruendo

- Il **09** sparsifica il grafo delle bolle: mediana dei vicini da **1.103 a 5** ✓
- L'**11** deve costruirci sopra una gerarchia con **25-35 macro-mondi** ✗ **impossibile**: il grafo
  sparsificato ha **117 componenti connesse**, quindi qualunque partizione ne ha almeno 117. L1 è
  uscito a 133 gruppi con mediana **1 bolla**.

**Nessuno dei due è sbagliato da solo; insieme non stanno.** Il ticket 23 (creato per questo) ha
trovato la causa: **la reciprocità**. Il k-NN **mutuo** taglia proprio i ponti asimmetrici fra
grappoli — e un ponte è asimmetrico per definizione (un mondo piccolo ha un legame forte verso uno
grande; il ritorno no). Con il k-NN **diretto**: **5 componenti**, mediana 8, zero bolle grandi
isolate, **6/6** le adjacency verificate a mano.

---

## 3. I RIMEDI CHE DOVEVANO FUNZIONARE E NON FUNZIONANO

### 3.1 Tutto ciò che aggiunge COMPORTAMENTO alza la testa e abbassa la coda

Questa è la scoperta più importante della fase, ed è anche il suo fallimento più grande. Misurato
sul banco prodotto (temporale + mascheramento, 997 utenti, 62.322 titoli d'oro):

| candidata | **coda @100** | **coda @500** | *globale @500* |
|---|---|---|---|
| + co-visione (TV) | −0,994 | −1,834 | *+1,173* |
| + liste curate (LIST) | −0,574 | −1,339 | *+0,518* |
| + co-visione + liste | −1,517 | −2,424 | *+1,556* |
| + gating condizionato | −0,341 | −0,939 | *−0,499* |
| **+ decadimento temporale** | **+0,166** | **+0,432** | *+0,436* |
| **«tutto insieme»** | **−1,612** | **−2,341** | ***+1,913*** |

**La ricetta che massimizza la recall globale è la PEGGIORE sulla coda.** E l'unica aggiunta che non
peggiora la coda è il decadimento, che **non porta comportamento nuovo**: cambia *quali* semi contano
nel profilo, non aggiunge il gusto di nessun altro.

**La spiegazione, e vale più di tutti i numeri**: il comportamento disponibile è **popolare per
costruzione**. Ogni componente che lo porta sposta la massa dove il comportamento è denso, cioè sulla
testa. **La coda non si guadagna aggiungendo un componente: va imposta** (per esempio un peso
differenziato in uscita che non si applichi ai titoli già popolari).

### 3.2 La co-visione: il guadagno più celebrato, e la sua asimmetria

Sul banco Trakt, in cross-validazione a 5 fold (TV costruito sui 4/5 degli utenti, valutato sull'1/5
mai visto): catalogo serie **da 2,86% a 5,04% al @10 (+77%)**, e **anche la coda migliora**
(+1,44 al @10, +10,01 al @500 — il 97% del guadagno globale).

**Ma sul banco MovieLens la coda PEGGIORA di −1,83 al @500.** E la spiegazione è la stessa: TV è
costruita dalle cronologie **Trakt**, quindi porta il gusto di **quella** popolazione. Su Trakt è il
gusto giusto; su MovieLens è il gusto di un'altra platea — e sulla coda, dove il vantaggio della
popolarità non esiste, si vede.

> **L'invarianza cross-dominio va dichiarata PER METRICA, non per componente.** Ce l'avevamo data
> come regola e l'avevamo applicata sulla testa: *«TV passa l'invarianza»* era **vero e falso nello
> stesso tempo**.

### 3.3 E la decisione finale è stata ribaltata dall'applicare il nostro stesso righello

Avevamo chiuso tutti i ticket e deciso la ricetta — film = CF + TV(0,5) — **misurando la recall
globale**. Poi, rispondendo alla domanda «quanto sono migliori i risultati?», ho misurato la coda.
Il segno cambia. **La ricetta era stata scelta sulla metrica che il prodotto ha dichiarato di non
volere.**

Ricetta ridecisa:

```
catalogo FILM    CF + decadimento (tau 365)            SENZA co-visione
catalogo SERIE   CFst + B + TV + decadimento           CON co-visione
                 k=30 · beta=0,25 · alfa=0,30 · tau=365
```

**I due cataloghi non la vogliono uguale**, e la ragione è l'asimmetria di §3.2. **Ma il lato serie è
misurato SOLO sulla sorgente propria** (non esiste un secondo banco di serie): lì l'invarianza **non
è verificabile**, e questa decisione poggia su una popolazione sola.

### 3.4 Gli altri rimedi falliti, in breve

| rimedio | atteso | misurato |
|---|---|---|
| **allocazione a quote multi-bolla** | combattere la monocromia del cesto | **−3,92 al @500**. La premessa non regge: con 5.297 bolle il filone dominante di un utente pesa il **2,6%**, non «3-5 filoni». Il rimedio combatteva un nemico che a questa granularità non esiste |
| **gating λ_cold per i titoli nuovi** | servire i titoli senza comportamento | la spiegazione è **verificata** («metadati ovunque» costa **−7,34 al @500** e il gating lo rimuove) ma **i titoli freddi non esistono**: `d_behav = 0` su **654 film su 49.709**. Il grafo copre il 96,3% del catalogo |
| **il decadimento temporale** | recuperare una quota del crollo temporale | **+0,13 al @100, ZERO al @10**. Il crollo è di 50-64 punti al @10 |
| **le liste curate** | +0,52 al @100 ✓ | ma **−1,34 sulla coda**, e sul banco Trakt **non sono mai state misurate** |
| **i pesi appresi dai legami curati** | +8,38 al @500 sul banco curato ✓ | **misurati su un banco solo** — e **mai sulla coda**. La stessa lacuna che ha fatto sbagliare la ricetta |
| **il test a tempo T** | confermare che i numeri temporali sono onesti | **i due livelli divergono**: il grafo ricostruito sul solo passato va **peggio** (−1,59 al @100, −5,42 al @2000), quindi il futuro **aiuta** e i numeri temporali **sono ottimistici**. Ma il grafo a T_cut copre 29.854 film contro 49.041: **copertura e futuro non sono separati** |
| **il test a tempo T (livello 1)** | idem | **il segno è invertito**: mascherando i titoli freschi la camminata va **meglio** (+0,72 al @100), e il placebo con la stessa quantità di archi a caso va **molto peggio**. Togliere i *ponti* verso l'audience delle uscite recenti aiuta; togliere *archi* no |

---

## 4. GLI ERRORI MIEI, che vanno letti come metodo

1. **Un controllo no-op scritto male** confrontava due array lavorati diversamente e dava
   «DIVERSO — la macchina distorce» su una macchina **corretta**. Se non avessi avuto un secondo modo
   di verificare (riprodurre il numero al decimale), avrei concluso che il mascheramento distorceva.
   **Un controllo sbagliato è più pericoloso di nessun controllo: produce una certezza.**
2. **λ₂ calcolato su una matrice non simmetrica** usciva **negativo** (−0,29 sulla prima bolla) e la
   classifica era rumore.
3. **Una metrica di conservazione sbagliata**: nel ticket 09 ho misurato «i vicini forti per peso sono
   conservati?» → **11,7%**, che sembrerebbe un disastro. Ma «forte per peso» e «forte per
   significato» non sono la stessa cosa: i persi hanno grado 1.919 contro 1.745 dei conservati,
   **quindi non erano hub**. Le adjacency vere (Fassbinder → *Il tamburo di latta*, Star Wars TV → i
   film, mostri anni '50 → *I Was a Teenage Werewolf*) erano tutte conservate.
4. **Ho deciso una ricetta sulla metrica sbagliata** (§3.3) e me ne sono accorto solo alla fine.
5. **Un'etichetta non riproducibile**: le keyword mostrate nei diagnostici erano `list(set(...))`, e
   Python randomizza l'hash delle stringhe → cambiavano a ogni esecuzione.
6. **Un `taskkill //IM python.exe`** per correggere due chiavi: uccide tutti i python della macchina.
   Nessun danno quella volta, ma l'azione era sproporzionata.
7. **Il «3.417 legami curati» che circolava in tre documenti non è riproducibile**: sono **1.004 di
   training + 1.002 di test = 2.006**.

**La regola che ne esce, e vale più di tutte le ricette**: *in questa fase ogni decisione va presa
con le metriche affiancate, e ogni misura va confrontata con due strade indipendenti.* Una sola
metrica, qualunque sia, ha premiato **quattro volte** la cosa sbagliata.

---

## 5. LE CONTRADDIZIONI CHE NON ABBIAMO RISOLTO

1. **Il banco del lato serie non torna.** Un ticket trova **1.535** utenti dove un altro ne trova
   **1.063** con la stessa soglia (≥20 film, ≥10 serie). Uno dei due conteggi è sbagliato e non
   abbiamo stabilito quale. Indizio: 1.535 ≈ i 1.534 del banco temporale.
2. **I banchi usano protocolli diversi** (temporale+mascheramento / split casuale / banco di
   giudizio), quindi **un minimax che li attraversa somma mele e arance**. La regola c'era; la
   materia prima no.
3. **Ogni banco premia i componenti della propria origine.** Il banco Trakt premia la co-visione
   Trakt; MovieLens premia il comportamento MovieLens. E **non esiste un banco di YACA** (decisione
   presa: gli utenti attuali "sono test casuali").
4. **Il +2,13% della popolarità sul catalogo serie** (che diceva «il grafo non batte la popolarità»)
   **non è riproducibile**: il metodo archiviato dà 0,05/1,28/9,98 sul banco che ricostruiamo. Il
   claim è **in dubbio**.
5. **La coda non è mai stata analizzata per fascia**: misuriamo "mezzo+coda" come un blocco unico che
   è il 95% del catalogo. Non sappiamo se il guadagno è nei titoli medi o in quelli rari.
6. **Il segno della direzionalità non è disponibile al recupero**: si calcola sulle bolle, la ricetta
   lavora sui titoli.

---

## 6. Cosa chiediamo: le SEI domande

**1. La coda non si guadagna con nessuno dei componenti che abbiamo.** Sei su sette la peggiorano, e
il miglioramento migliore è **+0,43 al @500** (dal decadimento). La spiegazione ci convince (il
comportamento è popolare per costruzione) — ma **è la fine del filone "aggiungi un componente"?**
Cosa fareste voi: un peso differenziato in uscita, un riscoramento *per fascia di popolarità*, o
accettare che la coda si serve con una **politica** e non con un grafo?

**2. Il banco di giudizio non ha una misurazione della coda.** Il +8,38 dei pesi appresi è una recall
globale su un banco di 1.002 legami. **Senza il banco nativo, come si valida qualcosa sulla coda?**
È la domanda che ci ha fatto sbagliare due volte.

**3. La co-visione funziona sulla propria popolazione e peggiora la coda su quella estranea.** È un
limite del dato o della nostra lettura? E il modo giusto è **dichiarare l'invarianza per metrica** e
conviverci, o costruire il componente in modo che **attraversi** (una co-occorrenza *nella stessa
cronologia* fra film e serie, che abbiamo e non abbiamo usato)?

**4. Le bolle sono troppo fini, e tre misure indipendenti lo dicono** (le bolle cattive sono piccole;
il grafo si frammenta a 117 componenti; la curatela collega bolle che sono lo stesso mondo diviso in
due). **5.297 bolle sono troppe?** E se sì, qual è la granularità giusta — e si decide leggendo, o
c'è un principio?

**5. Il righello che ci siamo dati funziona, ma ha smontato ogni nostra conclusione.** È un buon
segno o un segno che stiamo misurando troppo poco? **Quanti controlli sono abbastanza** — e come si
evita che la disciplina diventi paralisi?

**6. E la più scomoda: cosa buttereste di questa fase?** Dei 24 ticket, quali sono **complessità che
il dominio non ripaga**? Il sospetto è che la mappa (sparsificazione, quaranta parametri di
tipizzazione, gerarchia, direzionalità) sia un oggetto **bello e non necessario**, e che il prodotto
stia in due cose: il recupero e un modo di scegliere **per fascia di popolarità**.

---

## 7. Dove sta cosa (per chi legge il codice)

| | |
|---|---|
| la mappa della fase | `.scratch/grafo-servibile/map.md` — 14 sezioni, le decisioni e i loro ribaltamenti |
| la specifica | `.scratch/grafo-servibile/spec.md` — le stesse cose in forma di requisiti |
| i 24 ticket | `.scratch/grafo-servibile/issues/` — ognuno con l'esito e i criteri |
| i 24 report | `.scratch/grafo-servibile/ricerche/` — le misure, con script e limiti |
| il modulo canonico del grafo | `.scratch/ml-collaborativo/canone.py` — **l'unica implementazione valida** |
| gli script della fase | `.scratch/grafo-servibile/*.py` — uno per ticket, con i log accanto in `log/` |
| i componenti costruiti | `.cache/movielens/nuovo-*.npz` (KW, CAST, DIR, COLL, TV, KW2, CAST2, PROD, LIST) |
| le partizioni | `.cache/movielens/bolle*.npy`, `gerarchia-*.npy`, `bolle-archi*.npz` |

⚠️ **Trappola**: in giro ci sono **due varianti** del grafo. `canone.py` è quella canonica; gli
script `rrf-*.py` usano un'altra variante e i loro numeri assoluti **non sono confrontabili**.
E `21-decisione.py`/`16-gating.py` ricostruiscono i grafi da sé: **la base va sempre dichiarata**.

---

## 8. Cosa terrei, se dovessi ricominciare

**I tre guadagni verificati**: la co-visione sul catalogo serie (+77% al @10, 5 fold su 5, utenti mai
visti), la curatela come supervisione (+8,38 al @500 su legami di test, 111 vincoli per incognita), e
la leva popolare/nicchia (**mai vuota su 1.237 bolle**, dove un parametro globale ne romperebbe 259).

**Il righello**: recall stratificata e pesata per auto-informazione; il banco curato diviso in caldo e
freddo; il mascheramento temporale; e i controlli obbligatori (popolarità, ordine di indice, teacher
nullo, permutazione casuale).

**La mappa**, con le sue riserve: 8 vicini tipizzati su una sola componente connessa, la leva
popolare/nicchia, la direzionalità — e la consapevolezza che **la sua validazione finale è la
lettura, non un numero**.
