Status: resolved
Type: grilling

# 14 — Il modulo libreria: watchlist, storico, like e love

**Risolto il 17/10/2026.** Il modulo possiede **tutto**: modelli, porta di lettura, regole d'identità e
**anche l'ingestione**. Il lavoro si fa però in due passi — **15** (modelli + porta, che è ciò che sblocca il
pool) e **16** (l'ingestione dentro) — perché i due mestieri hanno ritmi diversi. Vedi `## Esito` in fondo.

## Perché

La **storia pesata dell'utente** — `collectRealSeeds` (`src/engines/hybrid/catalogStrategies.js:902`), coi
suoi pesi e il suo decadimento, coperta da `tests/seedNetwork.test.js` area A — è il materiale di **ogni**
motore: la usano le strategie del vecchio stack (`:1143`) e le righe del grafo
(`hybridRecommendations.js:330`). Ma abita **dentro il pezzo che si ritira**. E la libreria dell'utente —
watchlist, storico, like, love — non ha un posto suo: sta nei modelli (`src/db/models/`), in otto servizi
(`src/services/library*.js`), in `libraryIdentityResolution`, `libraryWatchedService`,
`LibraryConverterService`, e il frontend la legge da rotte sparse.

**La decisione del proprietario (17/10/2026)**: *«dovremmo creare un modulo per la libreria che contiene la
watchlist, lo storico, i like e i love — e interagisce con essi e li fornisce ai profili»*.

## La domanda

Cosa possiede il modulo libreria, e **quale porta legge**?

## Cosa deve uscire

1. **L'inventario di chi tocca la libreria oggi**: chi **scrive** (sync Trakt, conversione, admission,
   la scrittura degli stati visti), chi **legge** (i motori, il profilo, il frontend, le rotte), chi
   **traduce** (`libraryIdentityResolution`, `libraryMediaTypeResolution`, `animeMappingStore`). Con
   `file:riga`, contando i lettori per davvero (non i nomi dei file).
2. **La porta di lettura** del modulo: la storia pesata (`semiDi({userId, context, medium}) → {seeds,
   counts}` — il contratto che `collectRealSeeds` ha già), la libreria per titolo (stato, voto, quando), la
   watchlist. Un nome per cosa, non una funzione per tabella.
3. **Cosa resta fuori**: l'**ingestione** (sync, conversione, admission, retry) è un altro mestiere che
   *scrive* nella libreria — dimmi se resta nei servizi attuali o entra anche lei nel modulo, e perché.
   Attenzione: sono otto file e una macchina a stati (admission/outcome/retry), non un'unghia.
4. **Cosa il profilo riceve**: il profilo è un *derivato* della libreria (pesa, aggrega, deduce). Il confine
   è «la libreria fornisce fatti, il profilo deduce» — e va scritto, se no il primo che ha fretta mette una
   media dentro la libreria.
5. Il destino dei **modelli**: `WatchHistory`, `UserLibraryItem`, `TasteProfile`, `UserConfig` sono in
   `src/db/models/`; la libreria li possiede tutti o solo i suoi due?

## Il confine da non superare

Il modulo libreria **non conosce cataloghi, righe, priorità né motori**: fornisce fatti sulla libreria
dell'utente. Se una cosa «serve a decidere cosa mostrare», non è della libreria.

## Come si verifica

La porta di lettura restituisce **gli stessi semi** che `collectRealSeeds` restituisce oggi: la prova è la
suite che esiste già (`tests/seedNetwork.test.js`, area A), che deve passare **invariata** contro la porta
nuova. E dopo l'applicazione (ticket 15) nessun motore importa più i modelli mongo direttamente — con il
`grep` che lo dimostra.

---

## Esito

**Due decisioni prese il 17/10/2026 in grilling, più il censimento del territorio.**

### Il territorio (censito, non stimato)

| cosa | quanti | dove |
|---|---|---|
| modelli | 2 | `WatchHistory` (`src/models/`), `UserLibraryItem` (`src/db/models/`, con `conversionAttempts`/`parkedAt`/`parkedReason` — cioè lo stato della macchina di conversione **dentro il modello**) |
| lettori diretti dei modelli | **11** | `api/profiles.js` (652 righe di rotte di libreria), `api/bolle.js`, `api/configure/profileProcessor.js`, `catalog/providers/WatchlistProvider.js`, `profile/ProfileBuilder.js`, `profile/studioProfile.js`, `engines/hybrid/catalogStrategies.js`, i tre servizi di libreria, `utils/libraryIdentity.js` |
| test che li toccano | **19 file** | fra cui `libraryWatchedService`, `libraryReorder`, `userLibraryDedup`, `seedNetwork` |
| ingestione | ~8 file | `LibrarySyncService`, `LibraryConverterService`, `libraryConversion{Admission,Outcome,Retry}`, `libraryWatchedService`, `libraryMediaTypeResolution` |

### 1. Il modulo possiede tutto — compresa l'ingestione

Modelli, porta di lettura, regole d'identità **e** l'ingestione. Il costo è dichiarato nella domanda e accettato:
sono due mestieri con ritmi diversi (la lettura è una query, l'ingestione è una macchina a stati con retry e
parcheggio) e il ticket diventa il più grande della mappa.

**Come si tiene fattibile**: il lavoro si fa in **due passi**, e il confine non cambia.
- **15** — i modelli e la **porta di lettura** (più `libraryIdentity`, che è una regola di dominio letta e
  scritta da entrambi i mestieri). È ciò che sblocca il pool (**12**): i semi devono nascere da qui, non da un
  `require` provvisorio.
- **16** — l'**ingestione** dentro il modulo, con i suoi test e la sua macchina a stati.

### 2. La libreria fornisce fatti, il profilo deduce

I **fatti** sono della libreria: cosa hai visto, cosa hai messo in lista, quando, con che segnale, e l'identità
dei titoli (`libraryIdentity`: lo stesso titolo con id diversi). Le **deduzioni** sono del profilo: i vettori
del DNA, le fasce, i pesi, e `TasteProfile`.

Conseguenza dichiarata: quando il DNA si ritira (mappa successiva), `TasteProfile` si ritira con lui — la
libreria resta pulita. La regola da scrivere nel modulo, perché è quella che verrà violata per prima:
**«se serve a decidere cosa mostrare, non è della libreria»**.

E la regola correlata, che oggi esiste come una riga dentro un `if` in `collectRealSeeds` («la libreria è per
account: la leggiamo solo per i contesti che hanno già una cronologia reale, così un profilo mai sincronizzato
resta freddo»): va **dichiarata come regola della porta**, non lasciata implicita nel posto in cui è nata.

### Cosa l'esito lascia aperto

- **Dove vivono i vettori del DNA** (cache rigenerabile? mongo? ricalcolo?): non è di questo ticket, e la
  decisione presa — il profilo deduce — non la impone.
- **La forma dei nomi**: `TasteProfile` e i modelli in due cartelle diverse (`src/models/` e `src/db/models/`).
  Il percorso lo decide il **06** (assetto), con la sua regola.
- **La cache dei poster e i suoi eventi** (`src/cache/posterDaEvento.js`, `drenaPoster.js`): è ingestione o è
  cache? L'inventario del 04 non l'ha guardata da questo lato; il **16** la incontra e decide con i fatti in
  mano.
