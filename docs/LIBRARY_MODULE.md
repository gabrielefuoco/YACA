# Modulo Libreria: Fatti, Porta di Lettura e Macchina a Stati di Ingestione

Questo documento descrive il dominio della **Libreria dell'Utente** in YACA ([src/library/](../src/library/)), introdotto nei Ticket 14, 15 e 16 per separare nettamente i fatti oggettivi dell'utente (cronologia, watchlist, voti, stato di conversione) dalle deduzioni algoritmiche (DNA, Taste Profile, scoring e raccomandazioni).

---

## 🏛️ 1. Principi e Confini del Dominio

### 1.1 La Regola d'Oro: "La libreria fornisce fatti, il profilo deduce"
- **I fatti appartengono alla libreria**: La lista dei contenuti visti, l'istante di visione, il rating assegnato, l'appartenenza a una watchlist, e lo stato di conversione verso TMDB sono proprietà del dominio **Libreria**.
- **Le deduzioni appartengono al profilo**: I vettori DNA, la saturazione delle keyword, le fasce orarie e il `TasteProfile` appartengono al modulo **Profilo/DNA** e si ritireranno quando il vecchio stack verrà sostituito.
- **La regola aurea di violazione**: *«Se serve a decidere cosa mostrare, non è della libreria»*. La libreria non sa cosa sia una raccomandazione né come si formatti una scheda per Stremio.

### 1.2 Isolamento dei Modelli di Persistenza
I due modelli Mongoose della libreria risiedono esclusivamente all'interno del modulo:
- [src/library/models/WatchHistory.js](../src/library/models/WatchHistory.js): Cronologia delle visioni e interazioni (partizionata per `{ owner: userId, context: profileId }`).
- [src/library/models/UserLibraryItem.js](../src/library/models/UserLibraryItem.js): Voci della libreria Stremio dell'account (partizionata per `{ addonUuid }`).

> [!IMPORTANT]
> **Zero lettori diretti dei modelli**: Nessun file al di fuori di `src/library/` può importare direttamente i modelli Mongoose o eseguire query sul database. Qualsiasi accesso deve transitare attraverso la porta pubblica esportata da [src/library/index.js](../src/library/index.js). Gli antichi percorsi (`src/models/WatchHistory.js`, `src/db/models/UserLibraryItem.js`, `src/utils/libraryIdentity.js`) sono stati definitivamente eliminati nel Ticket 16.

### 1.3 Il Contesto della Libreria a Tre Chiavi
Il dominio della libreria richiede tre coordinate per risolvere completamente i dati:
`{ userId, profileId, addonUuid }`.
Invece di disperdere query verso le collezioni account e configurazione, il resolver centralizzato [src/library/context.js:23](../src/library/context.js#L23) (`resolveLibraryContext`) unifica la risoluzione dei parametri, gestendo il degrado elegante qualora il database sia temporaneamente non raggiungibile.

---

## 📖 2. La Porta di Lettura

La porta di lettura è esposta da [src/library/index.js](../src/library/index.js) e implementata in [src/library/reader.js](../src/library/reader.js) e [src/library/seeds.js](../src/library/seeds.js).

### 2.1 I Semi Pesati (`semiDi`)
La funzione `semiDi` ([src/library/seeds.js:90](../src/library/seeds.js#L90)) estrae la storia pesata dell'utente per alimentare i motori di raccomandazione (modulo Pool e servizio Grafo):
```javascript
const { semiDi } = require('../library');
const { seeds, counts } = await semiDi({
    userId,
    profileId,
    context,
    mediaType,
    user
});
```
- **Pesi dei segnali**:
  - `loved`: peso **4.0**
  - `liked`: peso **3.0**
  - `library`: peso **1.0**
  - `watched`: applica il decadimento temporale esponenziale:
    $$\text{peso} = \max\left(0.20, \; 0.5^{\frac{\text{giorni}}{60}}\right)$$
    Un titolo visto oggi vale 1.0; dopo due mesi vale 0.5; non scende mai sotto 0.20.
- **Tetti per segnale**: Definiti in `SEED_SIGNAL_LIMITS` (es. max 60 titoli per segnale per non saturare la diffusione del grafo).

### 2.2 La Regola del Profilo Mai Sincronizzato
Formalizzata in [src/library/seeds.js:49](../src/library/seeds.js#L49) (`profiloHaCronologiaReale`):
> **Se un profilo non possiede alcuna voce di cronologia reale (`historyDocs.length === 0`), il profilo resta formalmente freddo.**
> La libreria generale dell'account non viene interrogata per i semi di quel profilo, prevenendo che un profilo secondario appena creato (es. "Bambini") erediti silenziosamente i gusti dell'account principale.

### 2.3 Lettura Dati e Stato
- `leggiWatchlist` ([src/library/reader.js:25](../src/library/reader.js#L25)): Paginazione deterministica della watchlist ordinata per data di modifica decrescente (`_mtime DESC`).
- `leggiTitolo` ([src/library/reader.js:69](../src/library/reader.js#L69)): Recupera i metadati di un singolo titolo, inclusi lo stato di conversione, i tentativi e i dettagli di eventuale parcheggio.
- `contaDaConvertire` ([src/library/reader.js:151](../src/library/reader.js#L151)): Conta i titoli in attesa di risoluzione TMDB, escludendo rigorosamente i titoli già convertiti o parcheggiati.
- `storiaDi` ([src/library/reader.js:163](../src/library/reader.js#L163)): Estrae la cronologia grezza delle visioni dell'utente per l'UI o per il ricalcolo dei pesi.
- `ensureLibraryIndexesSafe` ([src/library/reader.js:219](../src/library/reader.js#L219)): Garantisce l'integrità degli indici MongoDB su `UserLibraryItem` e `WatchHistory` all'avvio dell'applicazione.

---

## ⚙️ 3. L'Ingestione e la Macchina a Stati (`src/library/ingestion/`)

L'ingestione della libreria governa l'importazione dei dati grezzi provenienti da Stremio e Trakt e la loro risoluzione verso entità canoniche TMDB.

### 3.1 La Macchina a Stati della Conversione (`conversionStateMachine.js`)
Dichiarata formalmente in [src/library/ingestion/conversionStateMachine.js](../src/library/ingestion/conversionStateMachine.js), stabilisce gli stati esatti di ogni titolo memorizzato in `UserLibraryItem`:

```
                 +-----------------------+
                 |        QUEUED         | <-----------+
                 | (attempts < 3,        |             |
                 |  parkedAt == null)    |             | unparkItem()
                 +-----------+-----------+             | (reset dati)
                             |                         |
               +-------------+-------------+           |
               |                           |           |
       Risolto con successo        3 fallimenti        |
               |                           |           |
               v                           v           |
     +-------------------+       +-------------------+ |
     |     CONVERTED     |       |      PARKED       | +
     |  (mapped: true,   |       | (attempts >= 3,   |
     |   tmdbId: <id>)   |       |  parkedAt: Date)  |
     +-------------------+       +-------------------+
```

#### Gli Stati Formali (`CONVERSION_STATES`)
Definiti in [src/library/ingestion/conversionStateMachine.js:89](../src/library/ingestion/conversionStateMachine.js#L89):
1. **`QUEUED`**: `mapped: false`, `removed: false`, `duplicateOf: null`, `parkedAt: null`, `conversionAttempts < 3`. L'item è idoneo per l'ammissione al batch di conversione (`isEligibleForConversion(item) === true`).
2. **`CONVERTED`**: `mapped: true`, `tmdbId` valorizzato. Stato terminale positivo. I tentativi e i flag di parcheggio sono azzerati.
3. **`PARKED`**: `mapped: false`, `parkedAt: Date`, `conversionAttempts >= 3`, `parkedReason: string`. L'item ha fallito tutti i tentativi ammessi. Viene escluso dai cicli successivi di conversione per non sprecare quote e rate-limit verso le API TMDB.
4. **`EXCLUDED_REMOVED`**: `removed: true`. Titolo rimosso dall'utente.
5. **`EXCLUDED_DUPLICATE`**: `duplicateOf: string`. Titolo secondario accorpato a un record principale.

#### Regole dei Tentativi e del Parcheggio
- **Tentativi Massimi**: [src/library/ingestion/conversionStateMachine.js:86](../src/library/ingestion/conversionStateMachine.js#L86) fissa `MAX_CONVERSION_ATTEMPTS = 3`.
- **Condizione di Parcheggio**: Quando `conversionAttempts >= 3`, la funzione `applyConversionAttempt` ([src/library/ingestion/conversionStateMachine.js:162](../src/library/ingestion/conversionStateMachine.js#L162)) registra:
  - `parked = true`
  - `parkedAt = new Date()`
  - `parkedReason = outcome.reason` (`not-found`, `unsupported`, `ambiguous-type`, `timeout`, `error`).
- **Meccanismo di Ritorno in Coda (`unparkItem`)**:
  Il parcheggio è un **fatto di dati, non di codice**. Rimettere in coda un titolo parcheggiato non richiede alterazioni al software: la funzione `unparkItem` ([src/library/ingestion/conversionStateMachine.js:203](../src/library/ingestion/conversionStateMachine.js#L203)) resetta semplicemente:
  `{ conversionAttempts: 0, parkedAt: null, parkedReason: null }`.
  Ciò avviene ad esempio in occasione di un aggiornamento del dump di mapping anime (Anibridge / Fribb) o di un'azione amministrativa.

### 3.2 Il Write Path Unificato: `ingestStremioData`
In precedenza, la scrittura dei dati Stremio avveniva da punti disgiunti: l'endpoint delle rotte e il metodo `syncAllStremioData` invocato dal motore di raccomandazione.
Oggi [src/library/index.js:72](../src/library/index.js#L72) espone il punto di ingresso unico `ingestStremioData`:
1. Risolve il contesto sicuro a 3 chiavi (`userId`, `profileId`, `addonUuid`).
2. Scrive la cronologia su `WatchHistory` (con eventuale fan-out e aggiornamento dei profili).
3. Se sono presenti elementi di libreria e un `addonUuid`, orchestra `LibrarySyncService.syncLibraryForUser` per aggiornare `UserLibraryItem`.

### 3.3 Rapporto con la Cache dei Poster ed ERDB
- **Confine dichiarato**: I file dei poster e le code di generazione (`src/cache/posterDaEvento.js`, `drenaPoster.js`, `scripts/push-diff-in-coda.js`) **non appartengono al modulo Libreria**.
- **Perché**: I poster servono l'intero catalogo di Stremio (inclusi i preset DuckDB, le schede dettaglio meta e gli episodi anime doppiati da timer di sistema).
- **Interazione asincrona**: Il modulo Libreria è unicamente un generatore di eventi: al momento della conversione riuscita di un titolo, emette una notifica non bloccante verso la coda dei poster. Se la coda dei poster fallisce o è disattivata, la persistenza e i metadati della libreria rimangono al 100% integri.
