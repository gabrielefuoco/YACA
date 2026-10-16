Status: resolved
Type: grilling

# 02 — Il modulo pool: le regole che sopravvivono al vecchio stack

**Risolto il 17/10/2026.** Il ticket è cambiato di forma in grilling: non decide il confine del vecchio
stack (sarebbe un confine attorno a ciò che si ritira), decide **dove abitano le regole che sopravvivono**.
Vedi `## Esito` in fondo, e la decisione 9 della mappa.

## Perché

Il vecchio stack (DNA · grafo delle keyword · scoring) serve **8 delle 12 righe hero** e non è codice morto
(charting, decisione 5): `yaca_true_blend`, `yaca_seed_network`, `yaca_hidden_gems`, `yaca_trakt_filtered`.
Oggi il feed ne conosce gli interni: `src/engines/hybridRecommendations.js` importa quattro strategie in
parallelo, `catalogStrategies.js` (1700 righe) contiene la logica di tutte, e il DNA arriva a
`duckDbStore`, `AiDiscoveryProvider` e `catalogSorting`. Il ticket 12 applica il confine: qui si **decide
dove passa**.

## La domanda

Dove passa il confine del vecchio stack — cioè: **cosa sa il feed, e cosa sa il motore vecchio**? E il
contratto che ne esce è lo **stesso** di quello del motore nuovo (semi/profilo → liste spiegate) o è un
contratto diverso?

## I due candidati

1. **Un contratto solo, due motori.** Il vecchio stack espone la stessa forma del nuovo (ticket 01): lista
   di pool spiegati. Il feed non sa più *chi* ha prodotto una riga — e questo è **il prerequisito della
   misura** che aprirà la mappa successiva («il grafo batte il vecchio?»): senza contratti uguali, i due
   motori non si possono confrontare.
2. **Due contratti, un compositore.** Il vecchio stack mantiene le sue quattro strategie con i loro parametri
   (`CATALOG_MODES`, `HERO_PRIORITY`) e il feed resta il posto dove si decide quale riga prende quale motore.
   Più onesto verso l'esistente, ma la doppia verità resta: il feed continua a sapere come è fatto ogni
   motore.

La raccomandazione da discutere è la **1**, con la **2** come ripiego per ciò che non si lascia ridurre
(anime policy, Tier2, `learnedNames`).

## Cosa deve uscire

- La mappa dei confini attuali, con i file e le righe: chi importa cosa, e quanti dei 12 percorsi passano
  davvero da lì (verificato eseguendo, non leggendo i nomi dei file).
- Il confine deciso, con la forma del contratto e la lista di ciò che **resta** interno (e quindi non è più
  nominabile dal feed).
- La lista delle parti che, guardate da vicino, sono già irraggiungibili — da consegnare al ticket 04 se è
  ancora aperto, o da cancellare direttamente nel 12.
- L'elenco di ciò che il vecchio stack fa e il nuovo **non** fa (anime policy, AI semantica, Tier2 keyword,
  stacking): è la ragione per cui la sostituzione non si decide qui.

## Come si verifica

Il confine è deciso quando si può dire, per ognuno dei file del vecchio stack, **chi lo chiama e attraverso
quale funzione** — e quando esiste un elenco chiuso (niente «e altri») delle cose che il feed non avrà più
il diritto di nominare. Le chiamate vanno contate eseguendo: un `node -e` che carica il modulo e registra
gli accessi reali, non un `grep` che conta le occorrenze del nome.

---

## Esito

**Risolto il 17/10/2026.** Il ticket è stato smontato da una correzione del proprietario, e la correzione era
certa: *«non ho capito a che ci serve creare il modulo per il vecchio stack se poi dobbiamo rimuoverlo»*.
Un confine attorno a ciò che si ritira è **impalcatura attorno a una demolizione**.

### I fatti che rendevano impossibile il contratto comune

Le quattro strategie **non sono motori «semi → titoli»**: sono *candidate-fetcher*, firma
`(userId, context, traktToken, tmdbApiKey, mediaType, kidsMode, …, limit)` — `buildTopGenresMixCatalog`,
`buildHybridCatalog`, `buildHiddenGemsCatalog`, `buildTraktFilteredCatalog` in `catalogStrategies.js` — e
restituiscono item **già arricchiti**. Il contratto del motore nuovo (`semi + opzioni → liste spiegate`) non è
raggiungibile per il vecchio stack senza riscriverlo: cioè senza investire in ciò che si ritira. La preview
del charting prometteva «un contratto come il nuovo»: era troppo, e la mappa lo corregge qui.

### 1. Il modulo pool: la composizione del pool

Escono dal feed e diventano un modulo con **una porta sola**: `HERO_PRIORITY` (oggi il **decimo** posto in cui
gli hero sono definiti, e l'unico non derivato da `registry.js`), l'assegnazione esclusiva coi `claimedIds`,
le righe additive (`SLUG_ADDITIVI`), i limiti (`HERO_MAX_ITEMS_PER_CATALOG`) e il degrado di Trakt.

Le quattro strategie diventano **voci di una lista** chiamate dal modulo: ritirare una riga — che è ciò che
farà la mappa successiva — diventa cancellare una voce.

Il motivo per cui questo modulo **non** è «un modulo per il vecchio stack»: sono **regole del prodotto** che
servono anche dopo la sua dipartita, e sono il posto in cui il motore nuovo deve nascere (ticket 08).

### 2. La libreria è un dominio — e i semi sono suoi

La storia pesata (ex `collectRealSeeds`, `catalogStrategies.js:902`) ha **due consumatori** oggi — una
strategia (`:1143`) e il feed che alimenta le righe del grafo (`hybridRecommendations.js:330`) — e una suite
che la copre (`tests/seedNetwork.test.js`, area A). È materiale che resta.

Ma la domanda del proprietario era più grande, ed è quella giusta: *«un modulo per la libreria che contiene la
watchlist, lo storico, i like e i love, che interagisce con essi e li fornisce ai profili»*. Il confine non è
«dove metto `collectRealSeeds`»: è **chi possiede i fatti della libreria**. Deciso: li possiede il modulo
libreria, che **fornisce fatti**; il profilo **deduce**. → ticket **14** (la decisione) e **15**
(l'applicazione).

### 3. Cosa cambia nella mappa

- la **decisione 5 è superata**, e il marcatore sta dove la decisione era stata presa;
- il ticket **12** cambia nome e contenuto — da «il vecchio stack dietro un confine» a **«Il modulo pool:
  applicato»** — e ora è bloccato da **02 e 15**: il pool consuma la porta della libreria, quindi deve nascere
  così, non con un `require` provvisorio da sostituire dopo;
- nascono i ticket **14** e **15**;
- la misura «il grafo batte il vecchio stack?» resta fuori ambito — e non richiede che i due motori abbiano la
  stessa forma: si confrontano **i titoli proposti per riga**, che è la cosa che si vuole sapere.
