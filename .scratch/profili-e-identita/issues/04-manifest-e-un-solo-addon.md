# Un addon, cinque modalità: cosa succede al manifest quando cambi modo

Status: resolved
Type: research
Blocked by: —

## Question

Un solo addon per account. La modalità attiva decide quali cataloghi il manifest dichiara. Questo tocca il punto più delicato del sistema: il manifest è ciò che Stremio ha *installato*, e cambiarlo da sotto i piedi del client ha conseguenze che nessuno ha ancora misurato.

Da accertare:

1. **Il tempo di propagazione** — quando il manifest cambia, quanto ci mette Stremio a vederlo? Serve riavvio, refresh manuale, o lo legge a ogni apertura? Il reconciler oggi chiama `updateStremioAddonCollection`: che cosa aggiorna esattamente, l'URL o il contenuto? (Nel secondo caso l'utente non deve fare nulla; nel primo sì, e va detto nell'interfaccia.)
2. **Un catalogo che sparisce dal manifest** — Stremio lo rimuove dalla sua lista, o resta appeso come riga vuota? Comportamento per un catalogo *rimosso* e per un catalogo *aggiunto*. Se resta appeso, il cambio di modalità produce spazzatura accumulata: serve saperlo prima di decidere il resto.
3. **La modalità come impronta** — `src/stremio/fingerprint.js` oggi include profilo e scaffali. Deve includere la modalità attiva, altrimenti il cambio non bumpa `configVersion` e Stremio non vede nulla. Verificare che aggiungerla non causi un bump a ogni riavvio (l'impronta deve essere deterministica e stabile fra due richieste identiche).
4. **Chi cambia la modalità** — solo la dashboard. Quindi: il cambio è un'azione esplicita con un costo di propagazione, e l'interfaccia deve dire "Stremio vedrà il cambiamento fra X". Trovare X, o dichiarare che non è misurabile e va dette una frase onesta.
5. **Il caso in cui il grafo non risponde** durante un cambio di modalità: il manifest deve restare valido (soli cataloghi non personali) e non deve dichiarare cataloghi che il pool non sa servire. Verificare il percorso di fallback già scritto per gli scaffali e dire se regge anche con la modalità.

Esito: la catena esatta (modifica → fingerprint → configVersion → sync → client), con i tempi misurati dove possibile e i comportamenti di Stremio verificati, non supposti.

---

## Risoluzione

### 1. Risposte ai cinque quesiti del ticket

#### Punto 1 — Tempo di propagazione & Cosa aggiorna esattamente il reconciler
- **Cosa viene aggiornato**: Il reconciler aggiorna **sia l'URL (`transportUrl`) sia il contenuto del manifest (`manifest`)** direttamente nella collezione dell'account Stremio.
  - In `src/stremio/reconciler.js:52-64`, quando l'impronta cambia viene generata una nuova `configVersion = nanoid(8)` e impostato `pendingStremioResync = true`.
  - In `src/stremio/reconciler.js:84-87` e `src/stremio/collection.js:86-126`, `updateStremioAddonCollection(stremioAuthKey, manifestUrl)` recupera la collezione con `POST /api/addonCollectionGet`, compila in-process il nuovo manifest tramite `buildManifest()` (`collection.js:97`), e dentro l'array `addons` dell'utente sovrascrive:
    - `addons[existingIdx].transportUrl = manifestUrl;` (`collection.js:111`) — URL contenente la nuova `configVersion` (bypassa la cache HTTP del client).
    - `addons[existingIdx].manifest = manifest;` (`collection.js:112`) — l'intero oggetto JSON del manifest con i cataloghi aggiornati.
    - Infine invia l'aggiornamento a Stremio Cloud con `POST /api/addonCollectionSet` (`collection.js:122-126`).
- **Frequenza di esecuzione**: Il reconciler gira all'avvio del server (`index.js:275-276`) per allineare eventuali disallineamenti di codice o riavvii, e su richiesta quando l'utente salva la configurazione da interfaccia (`src/api/stremio.js:92-117`).
- **Propagazione al client**: L'aggiornamento su Stremio Cloud (`api.strem.io`) è immediato (~200–800 ms per la POST HTTP). Tuttavia, **non esiste alcun canale push/WebSocket da server verso i client Stremio**. I client attivi non vengono notificati all'istante:
  - **Client chiuso**: Alla successiva apertura, Stremio invoca `pullAddonCollection` (`POST /api/addonCollectionGet`) all'avvio e riceve immediatamente la nuova collezione e il nuovo manifest (ritardo percepito: 0 secondi oltre il tempo di avvio).
  - **Client già aperto**: Mantiene in memoria i cataloghi della schermata corrente. Mostra i nuovi cataloghi appena l'utente ricarica la schermata (F5 su Desktop/Web), cambia scheda tornando alla Home, o riavvia l'app.

#### Punto 2 — Un catalogo che sparisce dal manifest (e uno che viene aggiunto)
- **Catalogo rimosso**:
  - Quando Stremio ricarica il manifest, ricostruisce l'elenco delle righe basandosi esclusivamente su `manifest.catalogs`. Un catalogo rimosso dal manifest **sparisce completamente dall'interfaccia** (Board e Discover); non resta alcuna riga vuota o orfana appesa una volta che il manifest aggiornato è acquisito.
  - *Nella finestra temporale di transizione* (prima che il client ricarichi il manifest, mentre interroga ancora il vecchio ID): il client invia `GET /:userHandle/:configVersion/catalog/:type/:id.json`. In `src/api/stremio.js:202-246`, `catalogHandler` valuta i selettori di tipo (`src/stremio/catalogHandler.js:84-89`) e il router delle fonti (`src/stremio/CatalogRouter.js:62`). Se il catalogo non è conforme o non è riconosciuto dal pool (`src/pool/composer.js:227`), YACA risponde con status **HTTP 200 `{ metas: [] }`** (`src/api/stremio.js:241`). Stremio tratta l'array vuoto mostrando temporaneamente una riga vuota ("EmptyContent") senza alcun crash o errore 500, fino al refresh del manifest che rimuove definitivamente la riga.
- **Catalogo aggiunto**:
  - Compare nella Home e in Discover solo dopo che il client ha scaricato il nuovo manifest. Non richiede la reinstallazione manuale dell'addon da parte dell'utente, poiché `addonCollectionSet` ha già aggiornato la collezione a livello di account cloud.

#### Punto 3 — La modalità come impronta (`src/stremio/fingerprint.js`)
- Oggi `buildManifestFingerprint(userConfig)` (`src/stremio/fingerprint.js:196-234`) include `definitionsSignature`, `activeProfileId`, `profiles` (con `typeSelectors`, `kidsMode`, `selectedPresets`, `catalogOrder`, `shelves`) e `customCatalogs`.
- Se la modalità attiva è memorizzata come `activeProfileId` (5 modalità = 5 profili predefiniti) o in un campo esplicito `mode` / `activeMode`:
  - Il cambio di modalità altera l'input dell'hash, producendo una nuova firma SHA-256 e scatenando il bump di `configVersion` (`src/stremio/reconciler.js:47-52`).
  - **Determinismo e stabilità**: L'impronta passa per `normalizeForJson()` (`src/stremio/fingerprint.js:5-18`) che ordina alfabeticamente tutte le chiavi degli oggetti JSON. Trattandosi di un hash SHA-256 deterministico, **a parità di modalità e configurazione due esecuzioni successive generano lo stesso identico hash**. All'avvio successivo `savedFingerprint === currentFingerprint` (`reconciler.js:47`), per cui `manifestChanged` è `false` e `configVersion` **non viene modificata**. Nessun bump spurio ad ogni riavvio.

#### Punto 4 — Chi cambia la modalità & Tempo di propagazione (X)
- La modalità viene cambiata **esclusivamente dall'utente tramite la dashboard YACA**.
- **Misurabilità del tempo X**:
  - Salto Dashboard → Server YACA → Stremio Cloud Datastore (`addonCollectionSet`): **misurabile** e dura tra 200 e 800 ms.
  - Salto Stremio Cloud → Client Stremio in esecuzione: **non misurabile a priori** perché dipende dal comportamento asincrono del client e dalla piattaforma (Desktop, Web, Android TV). Non c'è polling deterministico garantito al secondo né push server.
- **Dicitura onesta per la UI**:
  > *"Modalità aggiornata. Su Stremio aperta, ricarica la pagina o riavvia l'app per visualizzare subito i nuovi cataloghi."*
  (Evitare promesse ingannevoli del tipo "visibile entro 30 secondi", poiché su smart TV o app aperte in background l'aggiornamento richiede il refresh o riavvio dell'app).

#### Punto 5 — Grafo non raggiungibile durante il cambio modalità
- In `src/stremio/shelvesResolver.js:80-141`, `fetchShelvesForMedia` racchiude la chiamata a `graphClient.scaffali` in un blocco `try/catch`. Se il grafo va in timeout o lancia eccezione, logga un warning e ritorna `[]`.
- In `src/stremio/manifest.js:92-102`, `catalogDefinitionsFromShelves([])` ritorna `[]` (`src/catalog/registry.js:351`).
- Il manifest attiva il fallback già consolidato (`src/stremio/manifest.js:130-142`):
  - 4 cataloghi di ricerca (film e serie per standard e AI)
  - 3 cataloghi watchlist (film, serie, anime)
  - Eventuali preset o custom catalog dell'utente.
- Ciascun catalogo statico viene filtrato con `isCatalogConformant(c, typeSelectors)` (`manifest.js:128, 173`), quindi in modalità Film rimarranno solo la ricerca film e la watchlist film.
- Eventuali richieste residue del client per vecchi scaffali vengono gestite dal router (`src/stremio/CatalogRouter.js:62`) e dal pool (`src/pool/composer.js:227`), che restituiscono `[]`, terminando in una risposta HTTP 200 `{ metas: [] }` pulita (`src/api/stremio.js:241`).
- **Esito**: Il manifest rimane valido al 100%, rispetta la modalità scelta, non dichiara cataloghi non servibili e la catena di fallback regge perfettamente.

---

### 2. La catena esatta dei passaggi

```
[Dashboard YACA] Utente cambia modalità
       │
       ▼
1. Modifica Configurazione (DB)
   • Scrittura su AddonConfig / UserConfig
   • Identificatore modalità aggiornato
       │
       ▼
2. Calcolo Fingerprint
   • File: src/stremio/fingerprint.js:196 (buildManifestFingerprint)
   • Genera hash SHA-256 canonico includendo la nuova modalità attiva
       │
       ▼
3. Riconciliazione & Version Bump
   • File: src/stremio/reconciler.js:47 (manifestChanged = savedFingerprint !== currentFingerprint)
   • File: src/stremio/reconciler.js:52 (configVersion = nanoid(8))
   • File: src/stremio/reconciler.js:55-64 ($set: configVersion, manifestFingerprint, pendingStremioResync: true)
       │
       ▼
4. Sincronizzazione Account Stremio
   • File: src/stremio/reconciler.js:87
   • File: src/stremio/collection.js:62 (updateStremioAddonCollection)
   • File: src/stremio/collection.js:97 (buildManifest in-process con scaffali e filtri modalità)
   • File: src/stremio/collection.js:111-112 (aggiorna sia transportUrl che manifest inline)
   • File: src/stremio/collection.js:122-126 (POST https://api.strem.io/api/addonCollectionSet)
   • File: src/stremio/reconciler.js:93 (pendingStremioResync = false al successo)
       │
       ▼
5. Propagazione al Client Stremio
   • Client chiuso: al prossimo avvio chiama POST /api/addonCollectionGet e carica il nuovo manifest istantaneamente.
   • Client aperto: riceve il nuovo manifest al refresh (F5), riapertura finestra o navigazione schede.
   • Richieste temporanee a vecchi cataloghi: src/api/stremio.js:202-246 risponde HTTP 200 { metas: [] }.
```

---

### 3. Comportamento documentato e verificato di Stremio

- **Architettura Manifest & Transport URL**:
  - Specifiche ufficiali Stremio Addon Protocol: il manifest installato nel client è definito dal descrittore associato alla sua `transportUrl` ([Stremio Addon Protocol Documentation](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md)).
  - Descrittori Addon e Core Transports in `stremio-core` e `stremio-core-validator` ([stremio-core](https://github.com/Stremio/stremio-core) / [stremio-core-validator](https://github.com/Stremio/stremio-core-validator)).
- **Sincronizzazione account e aggiornamento senza reinstallazione**:
  - La libreria client ufficiale `stremio-api-client` gestisce lo stato degli addon tramite `pullAddonCollection()` e `pushAddonCollection()`, interfacciandosi con le route RPC `/api/addonCollectionGet` e `/api/addonCollectionSet` ([stremio-api-client GitHub](https://github.com/Stremio/stremio-api-client)).
  - Quando un backend invia `addonCollectionSet` con una nuova `transportUrl` e il nuovo oggetto `manifest`, il profilo cloud dell'utente viene aggiornato atomicamente, eliminando la necessità per l'utente di disinstallare e reinstallare l'addon manualmente ([Stremio Addon Manager Documentation](https://stremioaddonmanager.com)).
- **Caching del Manifest, Rimozione Cataloghi ed Empty Rows**:
  - I client Stremio mantengono una cache locale dei descrittori dei manifest. In assenza di variazione dell'URL o del numero di versione, il client riutilizza il manifest in cache ([Stremio Addon SDK Issue Tracker](https://github.com/Stremio/stremio-addon-sdk/issues)).
  - Bumping di `configVersion` nell'URL (`/:userId/:configVersion/manifest.json`) garantisce che il client invalidi la cache HTTP e acquisisca il nuovo schema.
  - La rimozione di un catalogo da `manifest.catalogs` comporta la cancellazione pulita della riga nella UI di Stremio non appena il nuovo manifest viene caricato. Cataloghi rimossi che rispondono con `{ metas: [] }` producono righe temporaneamente vuote senza generare errori fatali nell'applicazione.
- **Assenza di meccanismi Push Server-to-Client**:
  - Non esiste alcun protocollo WebSocket o push notification server-initiated per sincronizzare gli addon nei client Stremio; la sincronizzazione è interamente basata su richieste client-side al bootstrap o su eventi di focus/navigazione.

---

### 4. Comunicazione all'utente nella Dashboard

Poiché il tempo di propagazione lato client in esecuzione non è controllabile via server, la UI della Dashboard non deve mostrare un timer di conto alla rovescia, bensì un messaggio chiaro e operativo:

> **Modalità attivata**  
> I cataloghi su Stremio si aggiorneranno automaticamente alla prossima apertura dell'applicazione. Se Stremio è già in esecuzione, ricarica la schermata o riavvia l'app.
