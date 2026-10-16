Status: ready-for-agent
Type: task
Blocked by: 15

# 16 — L'ingestione dentro il modulo libreria

> **Secondo dei due passi** decisi dal ticket 14: il modulo possiede tutto, ingestione compresa. Il 15 ha
> creato i modelli e la porta di lettura; qui entra il mestiere che **porta dentro i fatti**.

## Perché

L'ingestione è una macchina a stati con retry e parcheggio (`conversionAttempts`, `parkedAt`, `parkedReason`
vivono **dentro** `UserLibraryItem`) distribuita su ~8 file: `LibrarySyncService` (681 righe),
`LibraryConverterService`, `libraryConversionAdmission`, `libraryConversionOutcome`,
`libraryConversionRetry`, `libraryWatchedService`, `libraryMediaTypeResolution`, più la cache dei poster
(`src/cache/posterDaEvento.js`, `drenaPoster.js`) che di quei titoli è un effetto.

Finché sta fuori, il confine del 14 è a metà: il modulo possiede i fatti, ma chi li scrive non è suo.

## Cosa deve uscire

- **I servizi di ingestione nel modulo**, con i loro test (`librarySyncPosterRefresh`, `libraryWatched*`,
  `librarySyncPosterRefresh`, `resilienceAuditFixes`, `libraryIdentityDuplicatesTicket19` e gli altri).
  Anche qui: **si sposta, non si riscrive**.
- **La macchina a stati dichiarata**: quanti tentativi, quando si parcheggia, come si rimette in coda, chi
  legge `parkedAt`. Oggi è una proprietà emergente di quattro file: dopo, dev'essere una regola scritta in un
  posto, con i suoi test.
- **Il rapporto con la cache dei poster**: `src/cache/posterDaEvento.js` e `drenaPoster.js` — dentro il modulo
  o fuori? La domanda è «chi possiede il poster: la libreria o la cache?» e va deciso **con i fatti in mano**
  (chi scrive, chi legge, cosa succede se si perde).
- **Il rapporto con Stremio**: l'ingestione riceve dal sync di Stremio (`_ctime`, `_mtime`, `state`) e da
  Trakt. Il modulo è **il punto in cui quel formato entra nel dominio** — e il posto in cui si converte una
  volta, non in tre.
- **Il confine con le rotte**: `src/api/profiles.js` (652 righe) chiama l'ingestione dagli endpoint. Dopo, le
  rotte restano **sottili** (autenticazione, richiesta, risposta) e il mestiere sta nel modulo: è la stessa
  regola della superficie di dominio (decisione 10), applicata dall'altro lato.

## Come si verifica

I test dell'ingestione verdi prima e dopo (senza asserzioni cambiate); un sync vero su un profilo di prova
(osservando i contatori finali: quanti convertiti, quanti parcheggiati) confrontato **prima e dopo** sul
deploy; e il `grep` che dimostra che fuori dal modulo nessuno importa più i servizi di libreria.

## Attenzione

Questo è il ticket con il rapporto rischio/durata peggiore della mappa: una macchina a stati che gira su dati
veri dell'utente. Va preso **dopo** il 15, con la porta di lettura stabile — così, se qualcosa si rompe, i
fatti si possono ancora leggere mentre si ripara la scrittura.

---

## Emendamenti — revisione esterna del 17/10/2026 (verificati sul codice)

### 1. La cache dei poster **non entra** nel modulo: la risposta alla domanda aperta

Il ticket 14 la lasciava aperta. I fatti la chiudono:

- `src/api/staticPosters.js:5-7` importa `erdbIdDaNomeFile`/`eventoDaNomeFile` **e** `scarica`/`scrivi` da
  `../cache/` per servire `GET /erdb-poster/:file` — cioè **i poster di tutti i cataloghi e delle schede meta di
  Stremio**, non della libreria;
- `scripts/push-diff-in-coda.js` (chiamato dal timer `ops/yaca-doppiaggi.sh`) spinge nella **stessa coda** i
  poster dei nuovi episodi doppiati.

Se entrassero nel modulo, una rotta pubblica e un timer di sistema dipenderebbero dal dominio libreria.
Confine giusto: **la cache/ERDB possiede i poster e la coda; l'ingestione è un cliente che manda un evento
quando converte un titolo**.

### 2. Uno scrittore che l'elenco non aveva: `syncAllStremioData`

**Verificato**: non scrive solo dalle rotte — è chiamato anche **dal motore delle raccomandazioni**
(`src/engines/hybridRecommendations.js:728-729`), oltre che da `src/api/profiles.js:175`. È una porta di
scrittura sulla libreria che vive fuori da qualsiasi elenco: se non entra nel modulo, resta il buco.

### 3. Il contesto della libreria è **tre** chiavi, non una

**Verificato**: `WatchHistory` è partizionata per `{owner: userId, context: profileId}`, `UserLibraryItem` per
`{addonUuid}` (livello account), e l'ordine manuale della libreria (`libraryOrder`) sta dentro
`AddonConfig.profiles.$.raw_ui_state` (via `profileProcessor`). La porta dichiara quindi il suo contesto in
modo esplicito — `{userId, profileId, addonUuid}` — o ha **un solo** resolver in ingresso; `UserAccount` e
`AddonConfig` non devono comparire sparsi dentro le query del modulo.
