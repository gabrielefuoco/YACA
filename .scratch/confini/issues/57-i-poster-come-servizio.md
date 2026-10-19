Status: needs-triage
Type: task

# 57 — I poster: da percorso interno a servizio con un contratto

## Perché è un candidato (decisione 32)

Il criterio: **profilo di risorse diverso**. I poster ce l'hanno, e sono già **quasi** un servizio:
- ERDB (l'istanza patchata per i badge `ITA`) è **un'altra immagine**, con un suo tetto di RAM e una sua rete;
- la composizione dei poster è **rete pesante e lenta** (il giro grosso è una passata una tantum da ~2 ore);
- il **drenatore** è già pilotato da un **timer di sistema** (`yaca-poster-eventi.timer`), cioè da fuori dal
  processo dell'app.

Ma il confine è tracciato a metà: il modulo `src/posters/` vive nell'app, e i **poster composti** arrivano all'app
da un **volume** (`yaca_erdb_cache:/data/erdb-cache`), senza contratto né versione. È la stessa forma della rottura
silenziosa trovata il 19/10/2026 sull'artefatto anime: *un volume come interfaccia, e nessuno che verifichi il
formato*.

## Cosa c'è da decidere

1. **Cosa diventa servizio**: il **drenatore** (già quasi: gira da un timer) o **anche la risoluzione/composizione**
   (`src/posters/posterResolver.js`, `src/posters/erdb/build.js`)?
2. **Il contratto**: oggi il confine è «un file in una cartella con un nome concordato» (la convenzione dei nomi
   la produce `scripts/erdb-builder/build.js` e la chiede la rotta `/erdb-poster/:file`: **un nome inventato
   produce poster invisibili, zero errori**). Serve una **versione** e una verifica, come il grafo fa con
   `versioni`.
3. **Chi legge il volume**: l'app continua a servire i file statici, o è il servizio a servirli?
4. **Il drenatore**: resta un timer di sistema (come ora) o diventa un loop del servizio?

## La prova (quando si eseguirà)

- I poster serviti **come prima**: una scheda con poster composto risponde con lo stesso file (byte-a-byte o
  almeno stessa dimensione).
- Il drenatore dal percorso nuovo esce **0** quando ERDB o Redis sono giù (è il contratto già scritto nella unità:
  *«Redis o ERDB giù NON sono un guasto di questa unità»*) e **1** solo quando manca la configurazione.
- La baseline della suite e i due hash del manifest, come per ogni ticket di questa mappa.

## Note

- Nasce da un brainstorming: **va triato** prima di essere eseguibile.
- Il ticket 28 (gli shim) e il 30 (il deploy) hanno già toccato questo terreno: leggere i loro Esiti prima.

## Triage (19/10/2026) — le prove, e due premesse da correggere

**ERDB è davvero un'altra cosa** ✓ — ma non sta nel compose principale: ha un suo deployment in
`ops/erdb-legion/` (README, `compose.yml`, le due patch, `costruisci.js`). Il ticket dice il vero sul profilo.

**La premessa «senza versione» è vecchia.** `posterFileName` (`src/posters/erdb/build.js`) **deriva la versione
da sé** con `calcolaVersionePoster({erdbId, badge})`, e `docs/EPISODE_BADGES.md:123` lo dice: *«da qui deriva la
versione da sé: chi costruisce un nome ottiene quello giusto, e i due lati non possono divergere per
costruzione»*. Il difetto non è l'assenza di versione: è che **nessuno verifica** che il volume contenga ciò che
il nome promette.

**La premessa che rompe il ticket: `src/posters/` non è un modulo ai margini, è dentro la logica dell'app.**
Lo usano `library/ingestion/LibraryConverterService`, `library/ingestion/LibrarySyncService`,
`api/profilo.js`, e `stremio/formatters/StremioFormatter` (che prende `posterFileName` da `erdb/build.js`).
`posterResolver` è una funzione **pura** chiamata dall'ingestione della libreria: spostarla dietro un servizio
vuol dire mettere una chiamata di rete dentro il percorso di ingestione, cioè **rompere** un confine per
crearne un altro.

**Conclusione del triage.** La parte che vale di questo ticket non è la separazione del processo: è il
**contratto sul volume** — la stessa forma della rottura silenziosa dell'artefatto anime. Il drenatore è già
fuori dal processo (timer di sistema), e va bene così.

## Decisione del triage (19/10/2026)

**Scelta: non si separa. Si aggiunge il contratto sul volume.** Il processo resta com'è — il drenatore è già
fuori dal processo dell'app, pilotato da un timer di sistema — e il lavoro diventa:

1. **una versione dichiarata del volume** `yaca_erdb_cache`, come il grafo fa con `versioni`;
2. **una verifica** che dica se il volume contiene ciò che i nomi promettono: oggi un nome che non corrisponde a
   un file produce **un poster invisibile e zero errori**, che è la stessa forma della rottura silenziosa trovata
   sull'artefatto anime.

Separare `posterResolver` e `erdb/build.js` è stato **escluso**: sono funzioni **pure** chiamate dall'ingestione
della libreria e dal formattatore Stremio, e spostarle dietro un servizio metterebbe una chiamata di rete dentro
il percorso di ingestione — rompere un confine per crearne un altro.
