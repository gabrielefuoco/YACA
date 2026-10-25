# 03 — Home layout e matrice piattaforme

**Data**: 20/10/2026 · **Ticket**: `issues/03-home-layout-piattaforme.md` · **Punti**: P06, P12
**Natura**: ricerca. Nessuna decisione di prodotto, nessuna modifica al codice.

## Come leggere questa nota

Ogni affermazione porta uno di questi marcatori:

- **[D]** documentato nella documentazione ufficiale — `https://nuvio.tv/docs/nuvio-public-api.md`,
  **v1.3, last updated 20/08/2026**, letto il 20/10/2026. `r. N` = riga del markdown.
- **[C]** osservato nel codice di un client o di Kaptain. Le fonti sono:
  - **NuvioTV** — `NuvioMedia/NuvioTV`, branch `dev`, commit
    `f062601cc6b9561c4a50aa7ab7464d7ddc555c5e` (20/10/2026).
  - **NuvioMobile** — `NuvioMedia/NuvioMobile`, branch `cmp-rewrite`, commit
    `324afcffb962f1f7df45c5fa951131acec5a15a7` (letto il 20/10/2026).
  - **NuvioDesktop** — `NuvioMedia/NuvioDesktop`, branch `Dev`, commit
    `1229b26cb536ffcc76b95fdfd7cb5d26923f8ca2` (letto il 20/10/2026; **alpha**).
  - **NuvioTVSmart** — `NuvioMedia/NuvioTVSmart`, branch `main`, commit
    `ccef0f6a9fe4643bbec869065cf82d1e4208b4b2` (letto il 20/10/2026; webOS/Tizen).
  - **Kaptain** — `https://www.kaptain.stream/nuvio-push.js?v=106.9`, letto il 20/10/2026.
- **[T]** **da testare** su un account usa-e-getta: né la docs né il codice bastano a chiudere la
  domanda. Non è un'ipotesi presentata come fatto.

Dove docs e codice divergono, la nota tiene le due cose separate. La docs descrive il contratto
pubblico; il codice descrive ciò che le app fanno davvero. La nota compagna
[`01-api-pubblica-nuvio.md`](01-api-pubblica-nuvio.md) copre auth, RPC e sync strategies: qui si
scava solo l'oggetto `home_catalog_settings` e le differenze tra piattaforme.

---

## Risposta in breve

1. **La docs descrive un altro oggetto.** La v1.3 mostra `{rows, hidden_catalogs}` con
   `p_platform: "tv"` **[D r. 1454-1463, 1492]**. Nessuno dei quattro client legge `rows` o
   `hidden_catalogs`; tutti leggono `{hide_unreleased_content, items[]}` **[C]**.
2. **Una sola lista per tutte le piattaforme.** TV, mobile, desktop e TV web usano
   `p_platform = "home_catalog_shared"` **[C]**. `tv`, `mobile` e `desktop` sono namespace separati
   per le **profile settings** (tema, player, poster URL), non per la Home.
3. **`items[]` è la verità, ma non è autosufficiente.** Una riga catalogo si identifica con
   `(addon_id, type, catalog_id)`; una riga collection con `is_collection: true` +
   `collection_id`, e i tre campi catalogo vuoti **[C]**.
4. **Se il blob manca, il client usa il locale e non cancella niente.** NuvioTV non applica il
   remoto e non pusha all'avvio; mobile/desktop marcano il pull come completato e pushano solo dopo
   una modifica **[C]**. Il "locale" non è una Home vuota: è tutti i cataloghi ammessi nell'ordine
   del manifest, più le collection in coda, con le `pinToTop` in cima **[C]**.
5. **Per nascondere una riga serve una riga esplicita `enabled:false`.** Ometterla non basta: un
   catalogo senza item salvato rientra dal default. `hidden_catalogs` non nasconde niente **[C]**.
6. **Il merge è possibile solo in testa al blob.** I client fanno uno shallow merge dei campi
   top-level e sostituiscono `items` in blocco. I campi sconosciuti **dentro** un item vengono
   distrutti da qualunque push di un client Nuvio **[C]**.
7. **Nessuna versione, nessun compare-and-swap.** Il blob non ha `version`, la RPC non ha
   `p_expected_updated_at`, e il server fa un upsert atomico dell'intero blob **[D r. 1793; C]**.
   L'unico rollback è uno snapshot locale del blob grezzo.

### Sintesi delle prove

| Affermazione | Stato | Fonte |
|---|---|---|
| La docs mostra `rows`/`hidden_catalogs` | **D** | r. 1454-1463 |
| I client leggono `items[]`, non `rows` | **C** | TV `HomeCatalogSettingsSyncService.kt:36-52`; mobile `HomeCatalogSettingsSyncService.kt:27-45`; TVSmart `homeCatalogSettingsSyncService.js:209-222` |
| La piattaforma Home è `home_catalog_shared` | **C** | TV `HomeCatalogSettingsSyncService.kt:32`; mobile `SyncPlatform.kt:4`; TVSmart `homeCatalogSettingsSyncService.js:71`; Kaptain `nuvio-push.js:21-22` |
| La docs dice default `p_platform: "tv"` | **D** | r. 1492 |
| Senza `p_platform` la RPC può rispondere 300 | **C / T** | Kaptain `nuvio-push.js:1020-1022` (commento); non riprodotto senza account |
| Blob assente → vince il locale | **C** | TV `HomeCatalogSettingsSyncService.kt:152-155`; mobile `...:106-110`; TVSmart `methods-01:58-64` |
| `hidden_catalogs` non è letto da nessun client | **C** | grep su TV/mobile/desktop/TVSmart: zero occorrenze nei file di sync e Home |
| I campi unknown top-level sopravvivono | **C** | TV `:64-70, 241-250`; mobile `:63-69, 225-234`; TVSmart `:502-528`; Kaptain `:1032-1036` |
| I campi unknown per-item non sopravvivono | **C** | i serializer ricostruiscono solo i campi noti (vedi §4.3) |
| Non c'è compare-and-swap sulla Home | **C** | payload RPC `p_profile_id`, `p_platform`, `p_settings_json`; nessun `updated_at` in scrittura |

---

## 1. La forma reale di `settings_json`

### 1.1 Il contratto documentato

La sezione **Home catalog settings** dice, in tre righe, tutto quello che la docs considera
necessario **[D r. 1423-1463]**:

- ogni profilo ha un blob JSON separato dal blob delle profile settings;
- il blob si legge e si scrive con due RPC;
- `p_platform` è un namespace opzionale, default `"tv"` **[D r. 1492]**;
- `settings_json` è **application-defined JSON**: il server non impone uno schema
  **[D r. 1463]**.

L'esempio della docs è:

```json
{
  "rows": [],
  "hidden_catalogs": []
}
```

**[D r. 1454-1457, 1480-1483]**

`rows` e `hidden_catalogs` non compaiono nei file di sync e di Home dei quattro client esaminati.
Non sono "campi legacy tollerati": sono campi che nessuno legge. Un blob scritto così è, per le
app, un blob con `items` assente **[C]**.

### 1.2 La forma osservata

La forma reale, ricostruita da NuvioTV, NuvioMobile, NuvioDesktop e TVSmart, è questa:

```json
{
  "hide_unreleased_content": false,
  "items": [
    {
      "addon_id": "org.stremio.yaca.catalog",
      "type": "movie",
      "catalog_id": "yaca_top",
      "enabled": true,
      "order": 0,
      "custom_title": "",
      "is_collection": false,
      "collection_id": ""
    },
    {
      "addon_id": "",
      "type": "",
      "catalog_id": "",
      "enabled": true,
      "order": 3,
      "custom_title": "La mia collezione",
      "is_collection": true,
      "collection_id": "collection-1"
    }
  ]
}
```

I campi sono gli stessi in TV e mobile; cambiano solo gli extra:

- **NuvioMobile / NuvioDesktop** aggiungono `show_catalog_type` (top-level, default `true`) e
  `key` su ogni item **[C mobile `HomeCatalogSettingsSyncService.kt:27-45`; desktop stesso file]**.
- **Kaptain** aggiunge `key` su ogni item, con sintassi `addon_id:type:catalog_id`
  **[C `nuvio-push.js:1032-1055`]**.
- **NuvioTVSmart** non aggiunge `show_catalog_type`; conserva però `hide_catalog_underline`
  top-level, che TV e mobile ignorano **[C `homeCatalogSettingsSyncService.js:71-75, 502-528`]**.

Tabella dei campi:

| Campo | Tipo | Default | Chi lo scrive | Chi lo legge | Note |
|---|---|---|---|---|---|
| `addon_id` | string | `""` | TV, mobile, Kaptain, TVSmart | tutti | **manifest `id`** dell'addon, non l'URL. Per una collection è `""`. |
| `type` | string | `""` | tutti | tutti | tipo di catalogo (`movie`, `series`, …). TV conserva il caso raw; TVSmart lo abbassa. Per una collection è `""`. |
| `catalog_id` | string | `""` | tutti | tutti | id del catalogo nel manifest. Per una collection è `""`. |
| `enabled` | bool | `true` | tutti | tutti | assente = **true**. È l'unico modo per nascondere una riga. |
| `order` | int | `0` | tutti | tutti | crescente; i client ordinano e poi ricostruiscono. Gap ammessi, ma i client riscrivono denso. |
| `custom_title` | string | `""` | tutti | tutti | vuoto = nome del catalogo/collection. |
| `is_collection` | bool | `false` | tutti | tutti | `true` → riga collection; i tre campi catalogo sono vuoti. |
| `collection_id` | string | `""` | tutti | tutti | id della collection nel blob `collections`. |
| `key` | string | `""` | mobile, desktop, Kaptain | mobile, desktop | **non** è nel serializer TV. Mobile lo ricostruisce se manca. |
| `show_catalog_type` | bool | `true` | mobile, desktop | mobile, desktop | top-level; TV/TVSmart lo ignorano ma lo preservano. |
| `hide_catalog_underline` | bool | assente | TVSmart | TVSmart | top-level; gli altri lo preservano e lo ignorano. |
| `hide_unreleased_content` | bool | `false` | tutti | tutti | non nasconde righe: filtra gli **item non ancora usciti** dentro le righe (TV `HomeViewModelCatalogPipeline.kt:580-594`). |
| `rows` | array | — | docs | **nessuno** | campo morto. |
| `hidden_catalogs` | array | — | docs | **nessuno** | campo morto: non nasconde nulla. |

**Importante:** il blob reale è **denso**, non sparso. NuvioTV serializza tutti e otto i campi
(`encodeDefaults = true`), Kaptain riscrive tutti i campi, mobile fa lo stesso
**[C TV `HomeCatalogSettingsSyncService.kt:83-86, 36-52`; Kaptain `:1038-1056`; mobile `:74-77`]**.
Un item parziale non è "più leggero": è un item che, al primo push di un client, viene completato
con i default — e `enabled` che manca diventa `true`.

### 1.3 I tre dialetti della chiave

La chiave non è un campo del contratto: è un indice locale. I client la costruiscono in modi
diversi:

| Client | Chiave catalogo | Chiave collection | Fonte |
|---|---|---|---|
| NuvioTV | `addon_id + "_" + catalogTypeKey(type) + "_" + catalog_id` | `collection_{id}` | `HomeCatalogSyncSupport.kt:29-35`; `CatalogRow.kt:69-71` |
| NuvioMobile / Desktop | `manifest.id + ":" + type + ":" + catalog.id` (oppure il campo `key` remoto) | `collection_{id}` | `HomeCatalogDefinitions.kt:51-71`; `HomeCatalogSettingsRepository.kt:605-612` |
| NuvioTVSmart | `addon_id + "_" + type + "_" + catalog_id` | `collection_{id}` | `homeCatalogs.js:100-111` |
| Kaptain | `addon_id + ":" + type + ":" + catalog_id` nel campo `key` | `collection_{id}` | `nuvio-push.js:1044` |

`catalogTypeKey` normalizza i tipi noti (`"Series"` → `"series"`) ma lascia intatto un tipo
sconosciuto **[C NuvioTV `CatalogReference.kt:3-7`]**. Questo significa che la chiave TV è
case-insensitive per i tipi noti; la chiave mobile, che usa `type` così com'è, non lo è
necessariamente. Per YACA — manifest con tipi minuscoli — non è un problema, ma è un punto di
drift per addon di terzi.

**Conseguenza:** l'identità portabile è la terna `(addon_id, type, catalog_id)`, non `key`. `key`
serve a mobile per collegare un item remoto alla propria preferenza locale; TV e TVSmart la
ignorano. Non usare `key` come identità di business.

**Nota sul file citato dal ticket.** In questo commit `CatalogDescriptorExtensions.kt` non contiene
logica Home: espone solo `supportsExtra` e `skipStep` **[C `:15-40`]**. I campi `showInHome` /
`hasExplicitShowInHome` vivono in `Addon.kt` (`CatalogDescriptor`) e vengono mappati da
`AddonMapper.kt:38-52`.

---

## 2. Piattaforme e namespace

### 2.1 Cosa dice la docs

`p_platform` è descritto come "optional platform namespace, recommended for new clients", con
default `"tv"` **[D r. 1372, 1492]**. Lo stesso testo vale per le profile settings e per la Home.
La docs aggiunge che l'upsert è **atomico per `(user, profile, platform)`** **[D r. 1793]**.

Da qui si potrebbe concludere che TV, mobile e desktop abbiano tre Home diverse. È falso.

### 2.2 Cosa fanno i client

| Client | Piattaforma Home | Piattaforma profile settings | Note |
|---|---|---|---|
| NuvioTV (Android TV) | `home_catalog_shared` | `tv` | `HomeCatalogSettingsSyncService.kt:32`; note 01 per `ProfileSettingsSyncService` |
| NuvioMobile (Android/iOS) | `home_catalog_shared` | `mobile` | `SyncPlatform.kt:3-4`; `ProfileSettingsSync.kt:123, 230` |
| NuvioDesktop (alpha) | `home_catalog_shared` | `desktop` se build desktop, altrimenti `mobile` | `SyncPlatform.kt:3-5`; `ProfileSettingsSync.kt:88, 127, 235` |
| NuvioTVSmart (webOS/Tizen) | `home_catalog_shared` | non verificato in questa nota | `homeCatalogSettingsSyncService.js:69-75` |
| Kaptain (web) | `home_catalog_shared` | legge/scrive `tv`, `mobile`, `desktop` separatamente | `nuvio-push.js:21-22, 1337-1342, 1359` |

Quindi:

- **Home catalog settings: una sola riga condivisa.** Non esiste una Home TV diversa dalla Home
  mobile. Se YACA scrive `p_platform: "tv"` seguendo la docs, scrive una **riga diversa**, che le
  app non leggono. La RPC risponde `204`, quindi l'errore è silenzioso. **[C; T: verificare che il
  server accetti `tv` e crei davvero una riga separata]**
- **Profile settings: tre righe separate.** Tema, player, lingua, poster URL sono per piattaforma.
  Kaptain lo sa e per il poster scrive su tutte e tre **[C `nuvio-push.js:1352-1363`]**.
- **Collections: nessuna piattaforma.** Il blob è per profilo e basta **[D r. 1501]**; la stessa
  collection si vede su TV, mobile e desktop.
- **Addons, library, watch progress/history: nessuna piattaforma.** Sono per profilo.

Il nome `home_catalog_shared` è quindi un **valore della colonna `platform`**, non una tabella
separata. Kaptain lo conferma indirettamente con la `DELETE` diretta su
`/rest/v1/home_catalog_settings?...&platform=eq.home_catalog_shared`
**[C `nuvio-push.js:1066-1077`]**.

### 2.3 Blob assente, blob vuoto, parse failure

| Client | Riga assente (`[]`) | `items: []` | Parse failure | Push automatico all'avvio |
|---|---|---|---|---|
| NuvioTV | preserve local; `Result.success(false)`; nessun apply | preserve local (stesso ramo) | preserve local | **no**: lo startup è pull-only (`StartupSyncService.kt:242-251, 623-640`) |
| NuvioMobile / Desktop | preserve local; mark initial pull complete | applica `hide_unreleased_content` e `show_catalog_type` **se presenti**, ma **non** svuota le preferenze (`applyFromRemote` ha il guard `items.isNotEmpty()`) | preserve local | no; push solo dopo una modifica, e solo dopo il primo pull |
| NuvioTVSmart | preserve local; mark complete | preserve local | preserve local | no; push dopo una modifica, con pull iniziale richiesto |
| Kaptain | `pullHomeCatalogs` restituisce `{items: []}`: **non distingue** assente da vuoto | idem | idem | no, ma `syncHomeRowsForCollections` pusha comunque dopo un pull fallito (vedi §6) |

Fonti: TV `HomeCatalogSettingsSyncService.kt:129-167`; mobile `HomeCatalogSettingsSyncService.kt:93-132`;
TVSmart `homeCatalogSettingsSyncServiceMethods-01...js:40-98`; Kaptain `nuvio-push.js:1020-1030`.

**Eccezione TV: le chiavi legacy.** Se le chiavi disabilitate locali contengono `://` (formato
vecchio, basato sull'URL dell'addon), NuvioTV non fa il pull remoto: normalizza il locale con
`applyCatalogSettingsFromRemote(localPayload)` e termina il pull
**[C `HomeCatalogSettingsSyncService.kt:129-141`]**. È una migrazione locale, non un merge col
remoto. Su un device aggiornato da una build vecchia, il primo avvio può quindi ignorare il blob
remoto e, alla prima modifica, sovrascriverlo con il layout locale.

**Cosa significa "preserve local"**. Non è una Home vuota. Con `homeCatalogOrderKeys` vuoto,
NuvioTV ricostruisce l'ordine come `defaultOrder + collectionKeys`, dove `defaultOrder` è tutti i
cataloghi degli addon abilitati che passano `shouldShowOnHome()` e non sono disabilitati
**[C `HomeViewModelCatalogUtils.kt:225-336`]**. Le collection `pinToTop` vengono poi aggiunte in
cima al momento del render **[C `HomeViewModelCatalogPipeline.kt:719-740`]**. Mobile fa lo stesso
per concetto: definizioni dei cataloghi + collection, con le `pinToTop` forzate in testa
**[C `HomeCatalogSettingsRepository.kt:554-578`]**.

Quindi, con blob assente e nessuna preferenza locale:

- tutte le righe eleggibili compaiono;
- l'ordine è quello del manifest, non un ordine salvato;
- le collection compaiono in coda (o in cima se `pinToTop`);
- nessuna riga è disabilitata;
- `hide_unreleased_content` è `false`.

Kaptain scrive nel commento che, senza riga, Nuvio "falls back to rendering all pinned collections"
**[C `nuvio-push.js:1063-1065`]**. È vero solo in parte: in assenza di preferenze locali, il codice
TV rende **tutti** i cataloghi eleggibili, non solo le collection pinnate. La frase di Kaptain va
letta come "le collection pinnate sono la parte che l'utente vede sicuramente", non come "la Home
è solo quello".

**Delete della riga.** Kaptain cancella la riga con una `DELETE` diretta sulla tabella
**[C `nuvio-push.js:1066-1077`]**. Non è un reset globale: i dispositivi che hanno ancora le
preferenze locali le conservano e al primo push le riscrivono. Per un vero reset servirebbe pulire
anche le preferenze locali di ogni device.

---

## 3. Collection vs catalog row, hide, duplicate

### 3.1 Come una collection compare nella Home

Una collection è una **riga di prima classe** in `items[]`:

```json
{
  "addon_id": "",
  "type": "",
  "catalog_id": "",
  "enabled": true,
  "order": 2,
  "custom_title": "",
  "is_collection": true,
  "collection_id": "collection-1"
}
```

- I tre campi catalogo sono vuoti; l'identità è `collection_{collection_id}`.
- Il client cerca la collection nel blob `collections` per `id`; se non la trova, la riga viene
  semplicemente saltata **[C TV `HomeViewModelCatalogPipeline.kt:727-739`; mobile
  `HomeScreen.kt:1155-1185`]**.
- `pinToTop` è un campo della collection, non della riga Home **[D r. 1565; C TV `Collection.kt:148-156`]**.
  NuvioTV aggiunge le collection pinnate in cima **prima** di scorrere `items[]`, e usa un set di
  id per non aggiungerle due volte **[C `HomeViewModelCatalogPipeline.kt:726-739`]**. Mobile
  riordina le preferenze spingendo le chiavi pinnate in testa **[C `HomeCatalogSettingsRepository.kt:554-578`]**.
- Una collection senza folder viene filtrata da mobile **[C `HomeCatalogSettingsRepository.kt:626-640`]**;
  TV la include comunque nel payload di sync (`collections.map`, senza filtro) e può mostrarla
  vuota. Edge case.

La collection **non è una folder**: è una riga che apre una schermata con dentro le folder. Le
`catalogSources` delle folder sono righe di catalogo separate, non righe della Home.

### 3.2 Come si nasconde una row "sciolta"

Una row sciolta è un catalogo che il client aggiungerebbe da solo perché è nel manifest di un
addon abilitato. I meccanismi disponibili sono tre, in ordine di forza:

1. **`enabled: false` esplicito in `items[]`.** È l'unico meccanismo che il client rispetta come
   scelta utente. NuvioTV non mette la riga nel default order se la chiave è disabilitata
   **[C `HomeViewModelCatalogUtils.kt:311-336`]**, e la UI del Catalog Order mostra "Disabled on
   Home" **[C `CatalogOrderScreen.kt:197-208`]**. Mobile filtra `enabled` prima del render
   **[C `HomeScreen.kt:883-925`]**. Kaptain lo fa per ogni catalogo sorgente di una collection
   **[C `nuvio-push.js:1168-1189`]**.
2. **`showInHome: false` nel manifest del catalogo**, con `hasExplicitShowInHome` true. NuvioTV
   legge il campo non-standard `showInHome` dal manifest e lo tratta come esplicito
   **[C `AddonMapper.kt:38-52`; `HomeCatalogSyncSupport.kt:163-168`]**. È una scelta dell'addon,
   non dell'utente: YACA può usarla per le proprie righe, non per nascondere righe di terzi.
3. **Rimuovere l'addon.** Fuori scope: è una decisione dell'utente, non di YACA.

**Cosa NON funziona:**

- **Omettere la riga da `items[]`.** Il client la riaggiunge dal default. Kaptain lo dice
  esplicitamente: "a catalog with no saved row can show up on Home next to the collections, so
  hiding must be explicit" **[C `nuvio-push.js:1123-1128`]**.
- **`hidden_catalogs`.** Nessun client lo legge; non nasconde nulla.
- **`enabled: false` senza `order`/`custom_title`.** Funziona, ma al primo push di un client
  l'item viene completato con i default; `enabled` resta `false` solo se il client lo preserva.
  Kaptain lo preserva per le righe di terzi, non per le collection (vedi §3.4).

**Attenzione all'effetto collaterale opposto:** un item parziale con `enabled` assente viene
interpretato come `true` da tutti i client (`enabled: Boolean = true` in TV/mobile;
`it.enabled !== false` in Kaptain/TVSmart). Quindi un merge che "tocca solo l'ordine" e non
ricopia `enabled` **riaccende** le righe che l'utente aveva spento.

### 3.3 Come si evita il duplicate

Ci sono tre livelli di deduplica, e non fanno la stessa cosa:

| Livello | Chi lo fa | Cosa deduplica |
|---|---|---|
| **Identità della riga** | TV `distinct()` sull'ordine; mobile `associate` per chiave; Kaptain `Map` per `key` | due item con la stessa terna/collection id |
| **Collection ripetuta** | TV `collectionsCache.associateBy { it.id }` + `addedCollectionIds`; mobile `visibleCollectionsWithUniqueIds`; Kaptain `finalItemsMap` | la stessa collection importata due volte |
| **Contenuto duplicato** | **nessuno** | una collection e la riga sciolta dello stesso catalogo |

Fonti: TV `HomeViewModelCatalogPipeline.kt:46-59, 726-739`; mobile `HomeCatalogSettingsRepository.kt:626-640`;
Kaptain `nuvio-push.js:1129-1166`.

Il terzo livello è quello che conta per YACA. Se una collection legge il catalogo
`yaca_top` e la riga sciolta `yaca_top` è abilitata, l'utente vede **due volte** gli stessi
contenuti: una dentro la collection e una come riga autonoma. Nuvio non lo impedisce. Kaptain lo
evita con una scelta esplicita: raccoglie tutti i `catalogId`/`id` delle `sources` delle folder e
mette `enabled: false` su ogni riga catalogo che coincide **[C `nuvio-push.js:1099-1108,
1139-1152, 1168-1189`]**.

**Regola pratica:** una collection è visibile solo se la sua riga è in `items[]`; una riga sciolta
è visibile se non è disabilitata. Per non duplicare, o si tiene la collection e si spengono le
righe sciolte, o si tiene la riga sciolta e non si mette la collection. Non si può avere entrambe
senza duplicato.

### 3.4 Cosa fa davvero Kaptain

`syncHomeRowsForCollections` è il riferimento più vicino a un "merge per collezioni", ma è
opinionato. In ordine **[C `nuvio-push.js:1082-1200`]**:

1. costruisce una riga collection per **ogni** collection passata, in ordine di array, con
   `enabled: true` e `custom_title: cat.title`;
2. raccoglie i `catalogId`/`id` di tutte le `sources` delle folder;
3. pulla il blob esistente; se il pull fallisce, **prosegue con `existingHomeItems = []`**;
4. mette le collection in cima; per le righe esistenti:
   - droppa Cinemeta / Nuvio Catalog Addon;
   - tiene ma spegne AIO/Trakt/MDBList/FlixPatrol e ogni catalogo sorgente di una collection;
   - preserva intatte le altre righe di terzi;
5. per ogni `source` di una collection che non ha ancora una riga, crea una riga
   `enabled: false` esplicita;
6. riscrive `order` denso e pusha il blob completo.

Tre conseguenze importanti:

- **Kaptain non preserva `enabled` delle collection**: le rimette tutte a `true`. Se l'utente
  aveva spento una collection, Kaptain la riaccende. TV e mobile, invece, preservano lo stato
  della collection nel proprio payload **[C TV `HomeCatalogSyncSupport.kt:98-108`; mobile
  `HomeCatalogSettingsRepository.kt:484-495`]**.
- **Kaptain non preserva `custom_title` delle collection**: lo sovrascrive con `collection.title`.
- **Kaptain pusha anche dopo un pull fallito**, cancellando le righe di terzi che non riesce a
  rileggere. È un comportamento da non copiare.

---

## 4. Merge, campi unknown, rollback

### 4.1 Cosa fa il server

La RPC è un **blob upsert atomico** per `(user, profile, platform)` **[D r. 1793]**:

- non c'è merge lato server;
- non c'è uno schema;
- non c'è una version field;
- non c'è un `updated_at` in scrittura, né un `p_expected_updated_at`;
- un payload parziale **sostituisce** il blob, non lo integra.

L'unica cosa che il server garantisce è che il blob scritto è quello che si rilegge (salvo
concorrenza). La validazione è tutta nel client.

### 4.2 Cosa fanno i client prima del push

| Client | Pull prima del push? | Merge top-level | Merge item | Fonte |
|---|---|---|---|---|
| NuvioTV | **non garantito**: `cachedSharedSettings` è popolato dal pull, ma `pushToRemote` non attende un pull | sì, se la cache esiste: remoto prima, locale dopo | no: `items` locale sostituisce tutto | `HomeCatalogSettingsSyncService.kt:200-250` |
| NuvioMobile / Desktop | sì: `triggerPush` è bloccato finché `completedInitialPull` non è settato | sì: remoto prima, locale dopo | no: `items` locale sostituisce tutto | `HomeCatalogSettingsSyncService.kt:134-166, 225-234` |
| NuvioTVSmart | sì: pull iniziale richiesto; un pending push può partire al tentativo successivo, ma `mergedSharedPayload` rilegge il remoto | sì: spread remoto + locale | no: `buildLocalPayload` ricostruisce gli item | `homeCatalogSettingsSyncService.js:502-528`; `methods-01:40-125` |
| Kaptain | sì, ma se fallisce prosegue | sì: `Object.assign({}, payload)` | no: ricostruisce i soli campi noti | `nuvio-push.js:1032-1056, 1110-1121` |

Il merge top-level è sempre lo stesso schema:

```
risultato = { ...remoto, ...locale }
```

Il locale vince sulle chiavi che scrive. Le chiavi che il locale non scrive restano quelle del
remoto. `items` è una chiave come le altre: il locale la sovrascrive **in blocco**, non elemento
per elemento. Non esiste un merge per `addon_id`/`catalog_id` lato client.

### 4.3 Quali campi unknown sopravvivono

**Top-level: sì, nella maggior parte dei casi.**

- NuvioTV: `mergeHomeCatalogSettingsJson(remoteJson, localJson)` mette prima il remoto e poi il
  locale **[C `HomeCatalogSettingsSyncService.kt:64-70, 241-250`]**. Un campo che il client non
  conosce (es. `yaca`, `schema_version`, `rows`, `hidden_catalogs`) resta.
- NuvioMobile/Desktop: stessa funzione, stesso comportamento **[C `:63-69, 225-234`]**.
- NuvioTVSmart: spread `{...remoteJson, ...localPayload}`, più `hide_catalog_underline` riletto
  dal remoto **[C `:502-528`]**.
- Kaptain: `Object.assign({}, payload)` preserva i top-level, ma **non** i campi dentro gli item
  **[C `:1032-1036`]**.

**Per-item: no.**

Tutti i client ricostruiscono ogni item con una lista chiusa di campi:

- TV: `SyncCatalogItem` con 8 campi, `ignoreUnknownKeys = true` **[C `:36-52, 83-86`]**;
- mobile: 9 campi (8 + `key`) **[C `:27-45`]**;
- TVSmart: `normalizeSyncItem` con 8 campi **[C `:209-222`]**;
- Kaptain: 8 campi + `key` **[C `:1038-1056`]**.

Quindi un campo custom dentro un item (per esempio `yaca_preset_id`, `badge`, `source`) viene
**droppato al primo push di un client Nuvio**, anche se YACA lo aveva scritto. Non è un posto dove
mettere dati critici.

**Caso speciale: `rows`/`hidden_catalogs`.** Se un blob contiene questi campi e nessun `items`:

- TV: `items` decodifica a `[]` → preserve local; non applica nemmeno `hide_unreleased_content`;
- mobile: `items` decodifica a `[]` → applica i flag top-level ma non svuota le preferenze;
- TVSmart: `items` assente e nessun array legacy → payload vuoto → preserve local;
- al push successivo, i campi restano nel top-level e viene aggiunto `items`. Il blob diventa un
  ibrido: `rows` e `hidden_catalogs` restano come zavorra, `items` diventa la verità.

**Caso speciale: `show_catalog_type`.** È top-level, quindi TV e TVSmart lo preservano ma non lo
leggono. Solo mobile/desktop lo applicano. Se YACA lo scrive, non deve aspettarsi che TV si
comporti di conseguenza.

**Caso speciale: `hide_catalog_underline`.** È top-level, lo legge solo TVSmart. Mobile/TV lo
preservano e lo ignorano. È l'esempio perfetto di campo di una build futura che sopravvive senza
essere capita.

### 4.4 Una strategia di merge che preserva i campi unknown

Questa è una **proposta di ricerca**, non codice di prodotto. Presuppone un client autorizzato
dall'utente, come in note 01.

1. **Pull del blob grezzo** con `p_platform = "home_catalog_shared"`. Conservare
   `settings_json` **e** `updated_at`. Se la riga non esiste, non inventare un blob: trattare
   `{}` come assenza e decidere esplicitamente se creare o no.
2. **Snapshot locale del blob grezzo** (o del JSON canonico) prima di qualunque scrittura. È l'unico
   rollback disponibile: non c'è storia lato server.
3. **Leggere solo `items`** se è un array. Se non c'è, non indovinare `rows`: trattare il blob
   come "senza righe" e non pushare automaticamente. Un blob docs-style non descrive la Home
   reale.
4. **Costruire l'insieme completo delle righe**, non solo quelle di YACA:
   - partire da tutti gli item esistenti, indicizzati per terna/collection id (l'ultimo vince,
     come fanno mobile e Kaptain);
   - aggiornare solo le righe che YACA possiede, match per `(addon_id, type, catalog_id)` o
     `collection_id`;
   - preservare `enabled`, `order`, `custom_title` delle righe di terzi;
   - per le righe di terzi che l'utente aveva spento, **ricopiare `enabled: false`**: non basta
     ometterle.
5. **Aggiungere le righe YACA** con tutti gli 8 campi, `order` denso, `custom_title` vuoto se non
   serve. Se una riga YACA deve essere nascosta, scriverla con `enabled: false`, non ometterla.
6. **Non toccare i top-level che non sono di YACA**: `hide_unreleased_content`,
   `show_catalog_type`, `hide_catalog_underline`, `rows`, `hidden_catalogs`, e qualunque chiave
   futura. Il merge `{...remoto, ...locale}` va fatto con un `locale` che contiene **solo** le
   chiavi che YACA possiede.
7. **Pushare il blob completo** e poi **rileggerlo**. La verifica non è opzionale: la RPC non
   restituisce un ETag né un numero di versione.
8. **In caso di errore, ripristinare lo snapshot** con un secondo push. Se nel frattempo un altro
   device ha scritto, il ripristino lo sovrascrive: non c'è modo di fare un merge server-side.

**Dove mettere i metadati di YACA.** Solo in una chiave top-level dedicata, per esempio:

```json
{
  "yaca": {
    "schema": 1,
    "pack": "cinema-italiano",
    "rows": ["yaca_top", "yaca_watchlist"]
  }
}
```

Questa chiave sopravvive ai push dei client perché è top-level e nessuno la conosce — a patto che
il client abbia fatto un pull prima di pushare. NuvioTV non lo garantisce (vedi §4.2), quindi un
push TV "a freddo" può cancellarla. **Non** mettere gli stessi dati dentro un item: verrebbero
persi. Non chiamarla `rows` o `hidden_catalogs`: sono nomi già usati dalla docs e rischiano di
confondere una futura migrazione.

### 4.5 Rollback

Non esiste un rollback server-side. Le opzioni reali sono:

| Strategia | Cosa fa | Limite |
|---|---|---|
| **Snapshot + restore** | salva il blob prima del push; in caso di errore rilancialo | sovrascrive le modifiche fatte da altri nel frattempo |
| **Delete della riga** | `DELETE /rest/v1/home_catalog_settings?...&platform=eq.home_catalog_shared` | non resetta i device con preferenze locali; non è documentato come RPC |
| **Ri-push del default** | ricostruisce un blob con tutte le righe eleggibili | non è un vero rollback: perde ordine e title utente |
| **Snapshot delle collections** | Kaptain usa IndexedDB per le collection | la Home non ha un equivalente; va costruito |

Ordine di ripristino, se YACA tocca sia collections sia Home: **prima le collections, poi la
Home**. Se la Home referenzia una `collection_id` che non esiste, la riga viene saltata; quindi
ripristinare prima la collection evita un buco temporaneo.

### 4.6 La corsa che nessuno gestisce

Il flusso `pull → merge → push` ha una finestra in cui un altro device può scrivere. La RPC non
ha `p_expected_updated_at` (a differenza della variante guarded delle profile settings usata da
Kaptain **[C `nuvio-push.js:1209-1250`]**). Quindi:

- due device che applicano due layout diversi possono sovrascriversi a vicenda;
- l'ultimo push vince, senza conflitto e senza avviso;
- `p_origin_client_id` viene mandato da TV/mobile **[C TV `:207`; mobile `:158`]**, ma non è
  documentato e non è un lock.

Mitigazione realistica: finestra breve, un solo job di sync alla volta, pull immediatamente prima
del push, verifica dopo, snapshot per il rollback. **Non** promettere "merge senza perdite" in
presenza di più device.

---

## 5. Matrice TV / mobile / desktop

### 5.1 La matrice

| Aspetto | NuvioTV | NuvioMobile | NuvioDesktop | NuvioTVSmart |
|---|---|---|---|---|
| **Home platform** | `home_catalog_shared` | `home_catalog_shared` | `home_catalog_shared` | `home_catalog_shared` |
| **Payload Home** | 8 campi, niente `key` | 8 campi + `key`, + `show_catalog_type` top-level | come mobile | 8 campi, niente `key`; preserva `hide_catalog_underline` |
| **Profile settings platform** | `tv` | `mobile` | `desktop` (build desktop) / `mobile` | non verificato |
| **Blob Home assente** | local vince, niente push | local vince, push dopo modifica | come mobile | local vince, push dopo modifica |
| **`items: []`** | local vince | flag top-level applicati, preferenze conservate | come mobile | local vince |
| **Nascondere una riga** | `enabled:false` + UI toggle | `enabled:false` | `enabled:false` | `enabled:false` |
| **Auto-hide righe sciolte** | no | no | no | no |
| **Collection** | riga `is_collection`; `pinToTop` in cima; skip se manca | come TV; skip collection senza folder | come mobile | riga nell'ordine; nessuna aggiunta separata |
| **Deduplica righe** | `distinct` sull'ordine | `associate` per chiave | come mobile | `Set` sull'ordine |
| **Deduplica collection** | per `id` | `distinctBy(id)` | come mobile | per chiave |
| **Ordine** | salva le chiavi, poi appende le mancanti | ordina per `order` | come mobile | ordina per `order` |
| **Import collections** | blob condiviso, full replace | blob condiviso, full replace | blob condiviso, full replace | blob condiviso, full replace |
| **Poster URL** | `features.layout_settings` nel blob `tv` | `features` flat nel blob `mobile` | `features` flat nel blob `desktop` | non verificato |
| **Limite noto** | niente campi item custom; niente `key` | chiave con `:`; `show_catalog_type` solo qui | alpha; codice mobile con modifiche di concorrenza | legge forme legacy; niente `show_catalog_type` |

### 5.2 Cosa è condiviso e cosa è separato

| Dato | Condivisione | Fonte |
|---|---|---|
| **Home catalog rows** | **una sola lista** per profilo, tutte le piattaforme | `home_catalog_shared` in tutti i client |
| **Profile settings** (tema, player, lingua, poster) | **separate** per `tv` / `mobile` / `desktop` | docs r. 1372; Kaptain `:1337-1342, 1359` |
| **Collections** | **un solo blob** per profilo, nessuna piattaforma | docs r. 1501, 1592 |
| **Addons** | per profilo, nessuna piattaforma | note 01 |
| **Library / watch progress / history** | per profilo, nessuna piattaforma | note 01 |
| **Hero della Home** | **non** è nel blob Home; resta locale per device | mobile `StoredHomeCatalogSettingsPayload.heroEnabled` non è in `SyncHomeCatalogPayload`; TV non ha hero in `HomeCatalogSyncSupport` |
| **Layout Classic/Modern/Grid** | non è nel blob Home | non gestito da `home_catalog_settings` |

### 5.3 Import collections, in pratica

L'import di una collection scrive nel blob `collections`, che è per profilo e non ha piattaforma
**[D r. 1501, 1592]**. Quindi:

- una collection importata su TV è visibile su mobile e desktop;
- una collection cancellata su un client sparisce per tutti;
- la riga Home che la referenzia **non** sparisce da sola: resta in `items[]` finché un client non
  riscrive il blob senza quella riga. TV la salta a render, mobile la salta, ma il dato resta
  **[C TV `HomeViewModelCatalogPipeline.kt:727-739`; mobile `HomeScreen.kt:1155-1185`]**;
- il prossimo push di un client che ricostruisce gli item dalle collection esistenti (TV) la
  elimina; mobile può conservarla perché esporta tutte le preferenze, anche quelle stale
  **[C TV `HomeCatalogSyncSupport.kt:75-81`; mobile `HomeCatalogSettingsRepository.kt:480-509`]**.

L'import è quindi un'operazione di scrittura **full replace** sul blob condiviso: non esiste un
"import TV" e un "import mobile". Le differenze stanno nella UI e nella validazione (mobile rifiuta
un `catalogSources` malformato, TV lo tollera: vedi nota 02), materia del ticket 02. Per YACA: l'import delle
collection è materia del ticket 02/11; qui basta sapere che la Home non è transazionale con le
collection. Se si cancellano collection, va ripulito anche il blob Home.

### 5.4 Poster URL e altre impostazioni per piattaforma

Il poster URL non è nella Home. È nelle **profile settings**, dentro `features`:

- TV: `features.layout_settings.custom_poster_url_pattern` e
  `custom_poster_enabled_screens`, come `{type, value}`;
- mobile/desktop: `features.custom_poster_url_pattern` e `custom_poster_enabled_screens` flat.

Kaptain lo scrive su tutti e tre i namespace **[C `nuvio-push.js:1352-1363, 1366-1388, 1401`]**.
Questo è il modello corretto per un'impostazione "globale ma per piattaforma": tre righe separate,
non una riga condivisa. La Home, invece, è l'eccezione: una riga sola.

---

## 6. Rischi

Ordinati per impatto su un'integrazione YACA.

| # | Rischio | Gravità | Evidenza | Conseguenza |
|---|---|---|---|---|
| 1 | **La docs descrive `rows`/`hidden_catalogs`, i client leggono `items`** | Alta | docs r. 1454-1463; zero letture nei client | Un writer che segue la docs scrive un blob ignorato; nessun errore HTTP |
| 2 | **Un payload parziale riaccende le righe spente** | Alta | `enabled` default `true`; il merge sostituisce `items` in blocco | L'utente perde le disabilitazioni; YACA sembra "aver riattivato tutto" |
| 3 | **I campi unknown per-item vengono distrutti** | Alta | serializer chiusi TV/mobile/TVSmart/Kaptain | Metadati YACA dentro gli item spariscono al primo push di un client |
| 4 | **Nessun compare-and-swap sulla Home** | Alta | RPC senza `p_expected_updated_at`; `updated_at` non usato in scrittura | Lost update tra due device; rollback che sovrascrive l'altro |
| 5 | **`p_platform` sbagliato = riga invisibile** | Alta | docs default `tv`; client reali `home_catalog_shared` | Scrittura `204` ma nessuna app la vede |
| 6 | **Push dopo pull fallito** | Alta | Kaptain `:1110-1121` prosegue con lista vuota | Cancellazione delle righe di terzi; Kaptain non è un modello da copiare |
| 7 | **Collection e riga sciolta duplicano lo stesso contenuto** | Media | nessun auto-hide; Kaptain spegne esplicitamente | Doppioni visibili in Home |
| 8 | **Collection cancellata → riga Home orfana** | Media | TV salta la riga; mobile può conservarla | Layout "bucato" finché non si ripulisce il blob |
| 9 | **Version drift tra build** | Media | mobile aggiunge `key`/`show_catalog_type`; TVSmart legge forme legacy; TV preserva il caso del type | Round-trip non deterministico tra versioni |
| 10 | **Nessuna versione del blob** | Media | nessun campo `version` in nessuno dei client | Impossibile distinguere un blob vecchio da uno nuovo; migrazioni a indovinare |
| 11 | **Delete riga non è reset globale** | Bassa | Kaptain `:1066-1077`; i locali restano | Il "reset" non resetta i device già sincronizzati |
| 12 | **`hide_unreleased_content` non nasconde righe** | Bassa | TV `HomeViewModelCatalogPipeline.kt:580-594` | Chi si aspetta righe vuote resta deluso; filtra solo item non usciti |

### 6.1 Version drift: cosa cambia tra build

- **Docs v1.3 (20/08/2026)** → `rows`/`hidden_catalogs`, default `tv`.
- **NuvioTV dev (20/10/2026)** → `items`, `home_catalog_shared`, 8 campi, nessun `key`.
- **NuvioMobile cmp-rewrite (letto 20/10/2026)** → `items`, `home_catalog_shared`,
  + `show_catalog_type`, + `key`, chiave con `:`.
- **NuvioDesktop Dev (letto 20/10/2026)** → stesso codice mobile, + `desktop` per le profile
  settings.
- **NuvioTVSmart main (letto 20/10/2026)** → `items`, `home_catalog_shared`, legge anche forme legacy
  (`catalog_order_keys`, `disabled_catalog_keys`, …), preserva `hide_catalog_underline`, chiave
  con `_`.
- **Kaptain v106.9** → `items`, `home_catalog_shared`, + `key` con `:`, droppa i campi item
  sconosciuti, riscrive `order` denso.

Non esiste un numero di versione nel blob. L'unico modo per riconoscere una forma è la presenza
dei campi (`items` vs `rows` vs `catalog_order_keys`). È un riconoscimento fragile: un blob può
contenere più forme insieme dopo un merge.

**Caveat sulle build.** Il codice letto è quello dei branch di sviluppo (`dev`, `cmp-rewrite`,
`Dev`, `main`), non necessariamente quello delle build pubblicate. NuvioTV e NuvioMobile possono
avere release più vecchie con un parser diverso; NuvioDesktop è dichiarato alpha. La matrice va
riletta contro la versione installata prima di ogni test di contratto.

### 6.2 Full replace: cosa significa davvero

La RPC sostituisce **tutto il blob**, non solo le righe di YACA. Quindi:

- se YACA pusha solo le proprie righe, le righe di terzi non vengono cancellate dal server, ma
  vengono **riaggiunte dal default** sui client; l'effetto pratico è che perdono ordine e stato
  `enabled`;
- un blob con `items: []` **non** resetta i client che hanno preferenze locali: NuvioTV lo ignora
  e conserva il locale, mobile conserva le preferenze e applica solo i flag top-level presenti. Il
  default si vede su un device senza stato locale, o dopo un reset locale esplicito;
- non c'è un "append" o un "patch": l'unica unità è il blob.

Per questo il merge deve essere **sull'intero set di item**, non sulle sole righe YACA.

---

## Fonti primarie

**Documentazione**

- `https://nuvio.tv/docs/nuvio-public-api.md` — v1.3, last updated 20/08/2026, letto il 20/10/2026.
  Sezioni: **Home catalog settings** r. 1423-1495; **Collections** r. 1499-1617; **Profile
  settings** r. 1345-1419; **Sync strategies** r. 1785-1796; **Changelog** r. 2016-2036.

**NuvioTV** — `https://github.com/NuvioMedia/NuvioTV`, branch `dev`, commit
`f062601cc6b9561c4a50aa7ab7464d7ddc555c5e`:

- `app/src/main/java/com/nuvio/tv/core/sync/HomeCatalogSettingsSyncService.kt` — r. 32 (platform),
  36-52 (schema), 64-70 (merge), 121-182 (pull), 200-250 (push/merge).
- `app/src/main/java/com/nuvio/tv/core/sync/HomeCatalogSyncSupport.kt` — r. 11-35 (stato e chiavi),
  69-134 (payload), 136-168 (entry e `showInHome`).
- `app/src/main/java/com/nuvio/tv/data/local/LayoutPreferenceDataStore.kt` — r. 885-947
  (export/apply).
- `app/src/main/java/com/nuvio/tv/ui/screens/home/HomeViewModelCatalogPipeline.kt` — r. 46-59
  (dedupe collection), 573-711 (ordered rows), 719-740 (collection rows).
- `app/src/main/java/com/nuvio/tv/ui/screens/home/HomeViewModelCatalogUtils.kt` — r. 225-336
  (rebuild e default order), 338-350 (disabled keys).
- `app/src/main/java/com/nuvio/tv/ui/screens/addon/CatalogOrderViewModel.kt` — r. 64-72 (toggle),
  206-437 (ordered items e dedupe).
- `app/src/main/java/com/nuvio/tv/ui/screens/addon/CatalogOrderScreen.kt` — r. 197-208
  ("Disabled on Home").
- `app/src/main/java/com/nuvio/tv/data/mapper/AddonMapper.kt` — r. 38-52 (`showInHome`).
- `app/src/main/java/com/nuvio/tv/domain/model/Addon.kt` — r. 34-53 (`CatalogDescriptor`,
  `showInHome`).
- `app/src/main/java/com/nuvio/tv/domain/model/CatalogDescriptorExtensions.kt` — r. 15-40
  (`supportsExtra`, `skipStep`: nessuna logica Home in questo commit).
- `app/src/main/java/com/nuvio/tv/domain/model/CatalogRow.kt` — r. 58-71 (chiavi).
- `app/src/main/java/com/nuvio/tv/domain/model/Collection.kt` — r. 148-156 (`pinToTop`).
- `app/src/main/java/com/nuvio/tv/core/sync/StartupSyncService.kt` — r. 242-251, 623-640
  (pull all'avvio).

**NuvioMobile** — `https://github.com/NuvioMedia/NuvioMobile`, branch `cmp-rewrite`, commit
`324afcffb962f1f7df45c5fa951131acec5a15a7`:

- `composeApp/src/commonMain/kotlin/com/nuvio/app/features/home/HomeCatalogSettingsSyncService.kt`
  — r. 27-45 (schema), 63-69 (merge), 93-132 (pull), 149-166 (push), 206-234 (decode/merge).
- `.../home/HomeCatalogDefinitions.kt` — r. 45-71 (chiave `:` e filtro extra required).
- `.../home/HomeCatalogSettingsRepository.kt` — r. 476-545 (export/apply), 554-578 (pinned),
  626-640 (collection senza folder).
- `.../home/HomeScreen.kt` — r. 883-925, 1155-1185 (render righe e collection).
- `composeApp/src/commonMain/kotlin/com/nuvio/app/core/sync/SyncPlatform.kt` — r. 3-4.
- `.../core/sync/ProfileSettingsSync.kt` — r. 123, 230 (`mobile`).

**NuvioDesktop** — `https://github.com/NuvioMedia/NuvioDesktop`, branch `Dev`, commit
`1229b26cb536ffcc76b95fdfd7cb5d26923f8ca2`:

- `composeApp/src/commonMain/kotlin/com/nuvio/app/features/home/HomeCatalogSettingsSyncService.kt`
  — identico al mobile.
- `.../home/HomeCatalogSettingsRepository.kt` — differenze di concorrenza/persistenza, stesso
  schema.
- `.../core/sync/SyncPlatform.kt` — r. 3-5 (`mobile`, `desktop`, `home_catalog_shared`).
- `.../core/sync/ProfileSettingsSync.kt` — r. 88, 127, 235 (scelta `desktop`/`mobile`).

**NuvioTVSmart** — `https://github.com/NuvioMedia/NuvioTVSmart`, branch `main`, commit
`ccef0f6a9fe4643bbec869065cf82d1e4208b4b2`:

- `js/core/profile/homeCatalogSettingsSyncService.js` — r. 69-75 (platform), 209-222
  (normalize), 273-331 (build), 334-402 (decode legacy), 417-456 (fetch), 481-528 (apply/merge).
- `js/core/profile/homeCatalogSettingsSyncServiceMethods-01-is-syncing-from-remote.js` — r. 40-160
  (pull/push/trigger).
- `js/core/addons/homeCatalogs.js` — r. 7-20 (`shouldShowOnHome`), 100-111 (chiavi), 134-222
  (ordered items).
- `js/data/local/homeCatalogStore.js` — r. 45-137 (prefs locali).
- `js/data/local/layoutPreferences.js` — r. 57 (`hideUnreleasedContent`).

**Kaptain** — `https://www.kaptain.stream/nuvio-push.js?v=106.9`, letto il 20/10/2026:

- r. 21-22 (platform), 1015-1060 (pull/push), 1063-1077 (delete), 1082-1200
  (`syncHomeRowsForCollections`), 1337-1342 (profile settings per platform), 1352-1363
  (poster platforms).
- `https://www.kaptain.stream/profile-snapshots.js?v=106.9` — r. 1-17 (snapshot su IndexedDB,
  usato per il rollback delle collection).

**YACA** (solo per le conseguenze):

- `src/stremio/manifest.js:57-75` — manifest id `org.stremio.yaca.catalog`; nessun `showInHome`
  esplicito, quindi i cataloghi YACA sono eleggibili per la Home, salvo quelli search-only
  (`CatalogDescriptor.isSearchOnlyCatalog()`).
- `src/stremio/collection.js:80` — l'addon è ritrovato per `manifest.id`.

**Nota compagna**

- `.scratch/nuvio-native/ricerche/01-api-pubblica-nuvio.md` — RPC, auth, sync strategies; la
  presente nota ne riprende solo la parte Home.

---

## 7. Cosa significa per YACA

1. **Scrivere solo `items[]` su `home_catalog_shared`, mai `rows`/`hidden_catalogs`.** La docs è
   stale; un blob docs-style è un no-op. Su mobile può toccare i flag solo se contiene già
   `hide_unreleased_content`/`show_catalog_type`, ma non crea righe. La prima riga del client YACA
   deve essere: `p_platform = "home_catalog_shared"`, payload
   `{hide_unreleased_content, items[]}`.
2. **Adottare il merge "pull → intero set → push → verify", con snapshot.** YACA non può pushare
   solo le proprie righe: riaccenderebbe le righe spente e perderebbe l'ordine di terzi. Deve
   preservare ogni item esistente, ricopiare `enabled:false` esplicito, e tenere uno snapshot del
   blob prima di scrivere. Il rollback è lo snapshot, non il delete.
3. **Scegliere una identità stabile per le proprie righe e non duplicare le collection.** Per ogni
   collection YACA: riga `is_collection:true` + `collection_id`; per ogni catalogo sorgente che non
   deve comparire sciolto: riga `enabled:false` esplicita. La terna `(addon_id, type, catalog_id)`
   è l'identità; `key` è solo un indice locale. Non contare sull'auto-hide: non esiste.
4. **Mettere i metadati YACA solo in una chiave top-level dedicata, e non promettere
   forward-compat per-item.** `yaca: {schema, pack, rows}` sopravvive ai push dei client che hanno
   fatto un pull prima di scrivere; un campo dentro un item no. I campi unknown top-level vanno
   preservati; i campi item unknown vanno trattati come effimeri. `show_catalog_type` e
   `hide_catalog_underline` sono esempi di campi che sopravvivono ma che solo alcune piattaforme
   leggono.
5. **Testare la matrice, non solo la TV.** Un round-trip TV → mobile → desktop → TV deve
   conservare: ordine, `enabled:false`, `custom_title`, `hide_unreleased_content`, collection
   pinnate, e i campi top-level `yaca`. Vanno testati anche: blob assente, `items: []`, blob
   docs-style con `rows`, collection cancellata, doppio device in scrittura. Senza questi test,
   "funziona sulla TV" non significa "funziona".

---

## 8. Domande aperte

1. **`p_platform` omesso restituisce davvero 300?** Kaptain lo scrive nel commento
   **[C `nuvio-push.js:1020-1022`]**, ma questa nota non l'ha verificato. La spiegazione più
   probabile è un overload PostgREST (due funzioni con firme diverse), non un errore di carico.
   Da testare con un account usa-e-getta.
2. **`home_catalog_shared` è stabile?** È il valore usato da quattro client, ma non è nella docs.
   Se Nuvio introducesse una Home per piattaforma, YACA si troverebbe con una riga condivisa e
   nessun avviso. Non c'è una policy di deprecazione.
3. **Il server preserva i campi top-level unknown byte-per-byte?** Il codice client li preserva;
   il server, secondo la docs, non valida lo schema **[D r. 1463]**. Ma non è stato verificato con
   un round-trip reale su un blob contenente `yaca`.
4. **Chi scrive `rows`/`hidden_catalogs`?** Nessun client attuale. Potrebbe essere una build
   precedente o un'altra implementazione. Se esistono blob così nel mondo, YACA deve decidere se
   migrarli o trattarli come "senza righe".
5. **`items: []` su mobile resetta `hide_unreleased_content`?** Il codice applica il payload anche
   con item vuoti, ma `applyFromRemote` non svuota le preferenze. Il flag top-level però viene
   scritto. Da testare: un blob `{items: [], hide_unreleased_content: false}` può spegnere un
   flag che l'utente aveva attivato?
6. **C'è un limite di dimensione o di numero di item?** La docs non lo dice. Un blob con molte
   righe (100+ addon) è normale, ma non è verificato il limite della tabella/RPC.
7. **`updated_at` può essere usato per la concorrenza?** La RPC di pull lo restituisce, quella di
   push non lo accetta. Esiste una variante guarded non documentata per la Home, come per le
   profile settings? **[C `nuvio-push.js:1209-1250` per la variante profile settings]**
8. **Le collection senza folder vanno escluse dal blob Home?** Mobile le filtra; TV non ha un
   filtro equivalente nel payload. Se YACA scrive una riga per una collection vuota, il
   comportamento può differire tra TV e mobile.
9. **Il desktop alpha è davvero equivalente al mobile?** Il file di sync è identico, ma il
   repository ha differenze di concorrenza e la UI può importare collection in modo diverso. Non
   è stato testato in questa nota.
10. **`showInHome` è un campo Nuvio-only o è letto anche da altri client?** NuvioTV lo legge dal
    manifest; non è standard Stremio. YACA può usarlo per le proprie righe, ma non è un contratto
    pubblico.

---
