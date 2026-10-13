# Handoff — il grafo di raccomandazione di YACA: dove siamo, cosa non fidarci, cosa chiediamo

*Documento per un collega senior. Tutto il materiale è nel repo, branch `main`, commit `b14968b`.
Cartella di lavoro: `.scratch/ml-collaborativo/`. **Niente è in produzione**: `src/` non è stato toccato.*

---

## 1. Il prodotto, in due righe

YACA è un add-on per Stremio: dato ciò che un utente ha visto, propone titoli. **Serviamo due cataloghi separati — film e serie — e il prodotto punta all'agnosticismo fra i medium** (suggerire serie a chi guarda film e viceversa). Il criterio di qualità dichiarato dall'utente è: **sorprendente + azzeccato + agnostico**. Il "sorprendente" è dichiarato **non apprendibile** e va applicato a valle (temperatura sui punteggi finali); quindi il lavoro riguarda **l'azzeccato**.

## 2. La mappa: dove sta cosa

| | |
|---|---|
| **il recap canonico** | `.scratch/ml-collaborativo/riepilogo.md` — leggere questo per primo |
| **i 32 report** | `.scratch/ml-collaborativo/ricerche/43-…-74-….md` — ognuno con script, numeri e limiti |
| **l'unica implementazione valida del grafo** | `.scratch/ml-collaborativo/canone.py` |
| **la lettura delle 100 bolle** | `.scratch/ml-collaborativo/bolle-lette.md` |
| **le partizioni salvate** | `.cache/movielens/bolle*.npy` (non in git: `.cache` è ignorato) |
| **i componenti** | `.cache/movielens/` — `cf-spazio`, `cf-studente`, `spazio-pulito`, `boot-B/T/Kpari/C`, `nuovo-KW/CAST/DIR/COLL/TV` |
| **i banchi** | MovieLens 32M, le cronologie Trakt (1.200 utenti), il gold curato (499 sorgenti) |

⚠️ **Trappola nota**: in giro ci sono **due varianti** del grafo. `canone.py` è quella canonica (grado binario + normalizzazione per componente *prima* del mixing); gli script `rrf-*.py` usano un'altra variante e i loro numeri assoluti **non sono confrontabili**. I report 58-60 sono su quella variante.

---

## 3. Cosa abbiamo costruito, e cosa regge

**La contaminazione trovata.** Lo spazio chiamato "contenuto" dal sistema precedente (`Pc`) è **comportamento MovieLens travestito**: una Ridge addestrata a predire la co-occorrenza degli utenti. Correlazione coi metadati puri **0,169**. Il vantaggio che ne veniva era circolare. Questo regge.

**La ricetta, dopo una passata di sottrazione.** Da **5 componenti + curatela e ~15 parametri** a **1-2 componenti e 4 parametri**:

```
catalogo FILM    CF (comportamento) da solo
catalogo SERIE   CFst (pubblico previsto) + B (co-visione Trakt), pesi uguali
                 k-NN 30 · beta 0,25 · senza curatela
```

L'ablation dice che **i metadati SVD e la curatela peggiorano**, e che i componenti essenziali dei due cataloghi sono **disgiunti**: il film vuole il comportamento, la serie vuole il pubblico previsto e la co-visione. Questo regge ed è verificato due volte.

**Le bolle.** 5.297 cluster. Ho letto **100 bolle** e **~88 hanno un filo nominabile** — autori interi (Fassbinder, Kurosawa, Rossellini, Kazan, Carpenter, Kitano), scuole, nazionalità, franchise, formati. **E le bolle vicine sono dello stesso mondo**: Fassbinder → Wenders/Herzog/Bergman; Kurosawa → Ozu/Oshima/Imamura; Romero → Argento/Cronenberg; Lubitsch → l'espressionismo tedesco; polacca → polacche; Star Wars TV → i film di Star Wars/MCU/LEGO. **Il grafo ricostruisce il canone senza saperlo.** Questo è il risultato di cui sono più convinto.

**I componenti nuovi presi dai dati che stavamo buttando.** `KW` (le keyword TMDB: **copre il 99,6%** del catalogo), `TV` (la visione insieme dalle cronologie Trakt: copre il 53%, **le serie e la coda dei film, dove il comportamento dei film è cieco**), `CAST`, `DIR`, `COLL` (franchise). Questi cinque **migliorano molto** le bolle, e l'ablation mostra che sono **complementari, non ridondanti** (toglierne uno cambia il *tipo* di bolla, non la qualità).

---

## 4. Quello che consideriamo buono **e non è** (i falsi positivi)

Questa è la sezione più importante, perché sono errori che ho fatto io.

**1. «La fusione a due stadi raddoppia il @10 sul giudizio esperto» — era un artefatto.** Il teacher era lo spazio del comportamento, che copre **49.041 film e zero serie**. Le sorgenti del gold sono **tutte serie**: quindi il teacher era **la matrice nulla**, e `argsort` su tutti valori pari restituisce **l'ordine di indice** — una permutazione fissa. Prova: il "teacher nullo" e il controllo "ordine di indice" danno numeri **identici**, e il controllo con permutazione casuale dà **0,00%**. Il report 58 è ritrattato.

**2. Il riferimento storico del report 41 (18,90% @10 sul curato) era gonfiato dallo stesso artefatto.** Ricostruito e decomposto: delle 249 sorgenti, **83 hanno un teacher vero e 163 hanno un teacher nullo** — e l'aggregato è dominato dalle seconde, dove la fusione «guadagna» sei volte **dal nulla**.

**3. Il metro curato è rotto.** Le sorgenti di test sono **due popolazioni strutturalmente diverse**: 83 danno 28,5% @10 con la camminata, 163 danno **2,4%**. E su quel banco **l'artefatto batte qualunque metodo vero**. Quindi: **tutto ciò che è stato misurato su quel metro è sospetto** — le conclusioni sulla "qualità esperta", la frontiera volume/qualità (report 57, superato), i risultati della fusione.

**4. La modularità non è qualità.** Misurato **tre volte**: il grafo del contenuto ha modularità **più alta** (0,301 contro 0,205) e bolle **peggiori**; aggiungendo i componenti buoni la modularità **scende** da 0,205 a 0,057 e la qualità **sale**; togliendone uno la modularità sale e la qualità non cambia. Non usatela come criterio.

**5. Tutti i numeri presi con lo split casuale sono gonfiati di 2-3×.** È la misura che ha cambiato tutto: con lo **split temporale** (profilo = il 60% più vecchio, oro = il 40% più recente) **la camminata perde il 50-64% al @10** e **la popolarità non si muove di niente**. Sul catalogo serie, valutato onestamente, **il grafo non batte la popolarità** (2,07% contro 2,13% al @10). Da rileggere con questo filtro: il modello dell'ordinamento (34,62% @100 sul film — **mai misurato in temporale**), i pesi, `k`, `beta`, l'ablation.

**6. «Più dati aiutano» — no.** Ho fatto il `related` di **tutte** le serie (da 2.995 a 16.999 titoli, copertura 18% → 89%, archi 2,2M → 4,0M) sul componente che l'ablation dice essere **essenziale**. **Non è cambiato niente.** Il collo di bottiglia non era la copertura, è la qualità del segnale. Il controllo che rende il risultato credibile: il catalogo film non usa quel componente e i suoi numeri sono identici **al decimale**.

**7. La co-visione Trakt non è contaminata.** L'ho sospettato (le cronologie del banco sono degli stessi utenti). **No**: i `rel-*.json` sono l'endpoint "related" **per titolo**, non le cronologie. Verificato.

---

## 5. Quello che consideriamo inutile **e potrebbe non esserlo** (i falsi negativi)

**1. La curatela.** L'abbiamo buttata: fa male al recupero **e** alle bolle. Ma sono **3.417 legami scritti a mano da un intenditore** — e non l'abbiamo mai usata come **supervisione** (imparare dai legami per addestrare un modello), solo come **archi nel grafo**. Sono due cose diverse e la seconda non è testata.

**2. Le 1.200 cronologie Trakt.** Usate solo come **banco di prova**. La sezione `TV` le ha usate come componente **solo per le bolle**, mai per il recupero. E sono **l'unico segnale di comportamento cross-medium** che abbiamo, perché `related` è mono-medium.

**3. I `plays`** (quante volte un titolo è stato visto): binarizzati e buttati. Mai testati come peso.

**4. Le date.** Usate **solo** per lo split temporale. Mai come feature (recency, stagionalità, "cosa è uscito quando l'utente era attivo").

**5. `Pb`** — uno spazio a 256 dimensioni in `spazi-trakt.npz`. **Non so cosa sia** e non l'ho mai testato. Potrebbe essere qualcosa di utile rimasto da un effort precedente.

**6. I 540 file di liste Trakt** in `.cache/trakt/lists/`: mai usati. Sono **raccolte curate da umani** — stesso valore potenziale della curatela, ma molto più grandi.

**7. Metadati quasi mai usati**: `vote_average`, `popularity`, `runtime`, `content_rating`, `production_countries`, `spoken_languages`, `networks`, `number_of_seasons`/`number_of_episodes` per le serie.

**8. Il gold curato come addestramento.** Come *metrica* è rotto (§4.3). Ma le 499 sorgenti sono **giudizio di un intenditore**: come *training data* non l'abbiamo mai provato.

**9. Gli embedding contrastivi.** Scartati perché «memorizzavano». Ma erano addestrati a predire **il comportamento di un titolo nuovo dal metadato** — compito che il metadato non può fare. Su un compito diverso (per esempio, collocare un titolo nuovo *nello spazio delle bolle*) potrebbe funzionare. **Non l'abbiamo testato.**

**10. Le 3.238 foglie di `albero.json`.** Sono la vecchia struttura, costruita sul grafo **contaminato** con la curatela a peso 6. Le bolle nuove le rendono probabilmente obsolete — **ma il confronto non è stato fatto**, e quella struttura era **gerarchica** mentre le bolle nuove sono **piatte**.

---

## 6. I buchi che conosciamo

1. **Il grafo conosce il futuro.** `CF` è costruito su cronologie **complete** di utenti disgiunti, che arrivano allo stesso periodo dell'oro di test. I numeri temporali sono quindi **ottimistici**: il crollo vero sarebbe peggiore. Un test onesto ricostruisce il grafo **a tempo T**.
   > **Corretto il 13/10/2026** dal ticket 03 della mappa `grafo-servibile`: **il segno è invertito.** Misurato sul banco prodotto, mascherando la propagazione dei titoli usciti dopo `T − 90 giorni`: la mascherata va **meglio** del non mascherato (@100 18,94% contro 18,21%, @500 47,78% contro 46,14%), e il controllo placebo — la stessa quantità di archi tolta a caso — va **molto peggio** (15,98% e 42,03%). La conoscenza del futuro non gonfia i numeri: li **abbassa**, perché gli archi dei titoli freschi portano il gusto del pubblico delle uscite recenti, che non è quello dell'utente. I numeri temporali archiviati sono quindi **non ottimistici**. Resta vero che un grafo ricostruito a tempo T è il test giusto: ma il suo esito atteso è un miglioramento lieve, non un crollo.
2. **Il modello serie ha un divario calibrazione/verifica del 42%** al @10 (5,85% → 3,41%). **13 caratteristiche su 531 utenti per metà** sono troppe.
3. **I titoli nuovi**: si collegano **dodici volte peggio** di uno già noto (2,4% contro 28,5% al @10). L'unico rimedio misurato (`CFst`) porta +0,31 punti. **Non basta.**
4. **La navigazione non esiste.** Le bolle ci sono, i collegamenti hanno senso, ma non c'è né interfaccia né politica (bolle vicine + scelta popolare/nicchia).
5. **Il grafo delle bolle è denso**: mediana **1.103 vicini** su 5.297. I vicini *forti* sono selettivi, ma servono **soglie**, e le bolle sono **piatte** — per disegnare una mappa servirebbe una gerarchia o un embedding a 2 dimensioni.
6. **Il conflitto fra i banchi** sul catalogo film: il banco Trakt preferisce la ricetta completa (con la co-visione **Trakt** e la curatela, costruita su **Trakt**), il banco MovieLens preferisce `CF` da solo (**MovieLens**). **Ogni banco premia la propria origine**, e nessuno dei due è YACA.
7. **Nessun test end-to-end.** I 52 cataloghi serviti non sono mai stati guardati. Il passo verso la produzione non è stato fatto (ed era escluso).
8. **Il teacher/fusione** è neutro sul prodotto in casual, **mai misurato in temporale** — e sulla testa del catalogo serie dava +77% (in casual).
9. **L'ordinamento del catalogo film in temporale non è mai stato misurato.**

---

## 7. Le domande per te

**1. La metrica — è la domanda principale.**
La `recall@N` è **dominata dalla popolarità**: gli item d'oro sono in gran parte cose popolari, quindi il margine sopra la popolarità è piccolo per costruzione, e ottimizzarla spinge verso il **non**-sorprendente, cioè contro metà dell'obiettivo dichiarato. Il nostro gold curato è **rotto** (§4.3). La nostra risposta attuale è **leggere le bolle e giudicare** (fatto: 88/100 buone) — ma non scala e **non confronta** due configurazioni.
→ *Come misureresti "qualità" in questo dominio? Ha senso una recall pesata per non-popolarità, o un giudizio umano strutturato su un campione? Come renderesti confrontabili due ricette?*

**2. La navigazione.**
Abbiamo 5.297 bolle buone e un grafo di collegamenti denso con assi reali (lingua, autore, scuola, genere, epoca, franchise). Il passo successivo è l'interfaccia: bolle vicine + scelta popolare/nicchia dentro la bolla.
→ *Come passeresti da questa struttura a una mappa navigabile? Serve una gerarchia sopra le bolle? Un embedding 2D? Soglie sui pesi? E la scelta popolare/nicchia: dentro la bolla per quantile di popolarità, o come parametro globale?*

**3. L'adattamento del modello.**
13 caratteristiche, 531 utenti per metà, **42% di divario** calibrazione/verifica. Ho scritto che la strada è **meno caratteristiche** — ma non l'ho testato.
→ *Come affronteresti il problema: riduzione, regolarizzazione, più utenti, o un modello più semplice? E l'oracolo del cesto (il tetto raggiungibile) è al 12% al @10 mentre il modello ne prende il 29%: il margine è nel **cesto**, non nell'ordinamento — è lì che investiresti?*

**4. Il test onesto.**
Il grafo conosce il futuro (§6.1). Un test a tempo T richiede ricostruire `CF` dalle interazioni prima di T.
→ *Vale la pena? Come lo imposteresti senza rifare l'intera pipeline? E il conflitto fra banchi (§6.6): esiste un modo di decidere quale rappresenta il dominio, senza i dati di produzione?*

**5. La curatela come supervisione.**
3.417 legami esperti, più 540 liste curate. Come archi nel grafo **fanno male**; come **supervisione** non sono mai stati usati.
→ *Vale la pena addestrare qualcosa sopra questo segnale? O il problema è che è troppo poco (3.417 legami) per addestrare e troppo "di gusto" per generalizzare?*

**6. Cosa butteresti.**
Se dovessi rifare questo lavoro da zero, con quello che sai ora: **quale pezzo di questa pipeline non costruiresti?** Perché il sospetto è che una parte del lavoro (la fusione a due stadi, l'ordinamento con 13 caratteristiche) sia complessità che il dominio non ripaga.

---

## 8. Le cose che non rifaremmo identiche

- **La fusione (RRF)**: aveva senso dove la camminata è cieca (la testa del catalogo serie, in casual: +77%), ma è **neutra sul prodotto** e non è mai stata misurata in temporale. Prima di tenerla, va riprovata.
- **Il metro curato**: va riparato o buttato, non usato com'è.
- **I pesi tarati in casuale** (`k`, `beta`, i pesi dei componenti, i pesi della fusione): tutti ottimi di un mondo gonfiato.
- **La scelta del banco**: gli utenti Trakt sono **autori di liste pubbliche**, non un campione casuale; le stime sono ottimistiche, e **ogni banco premia i componenti della propria origine**.

---

## 9. Come riprodurre

```bash
./offline_graph_builder/venv/Scripts/python.exe   # da eseguire dalla RADICE del repo

python .scratch/ml-collaborativo/canone-misure.py        # il grafo canonico: prodotto + curato + i due cataloghi
python .scratch/ml-collaborativo/temporale.py            # la misura onesta (split temporale)
python .scratch/ml-collaborativo/componenti-nuovi.py     # i 5 componenti nuovi dai dati buttati
python .scratch/ml-collaborativo/bolle-2.py              # le bolle con i componenti nuovi
python .scratch/ml-collaborativo/bolle-100.py            # 100 bolle da leggere + i collegamenti
```

⚠️ `python3` di sistema è rotto su questa macchina: usare il venv del progetto.
