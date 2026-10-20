# 12 — Distribuzione: community collections, builder, marketplace

**Domanda**: dove si distribuisce un pack YACA e a quali condizioni? Quali sono le regole delle
community collections Nuvio, i requisiti di submission, la differenza tra pack 0-addon e pack con
addon, e cosa serve per essere “provider” dentro Kaptain, Xperience e Ultra MAX?

**Letto il**: 20/10/2026 · **Natura**: ricerca, nessuna modifica al prodotto.
**Punti coperti**: P11, P26, P29.

**Sintesi**: l’unico canale first-party è la pagina community di Nuvio. Si parte con **YACA Lite**
(0 addon, one-click). **YACA Smart** è distribuibile solo dopo aver creato un **manifest pubblico a
catalogs fisse**: senza, il pack finisce in `catalog_missing` su gran parte dei profili. Kaptain e
Xperience sono superfici di installazione, non canali di scoperta; Ultra MAX è chiuso; AIOMetadata è
un artefatto di supporto. Il sito/GitHub è l’unico canale misurabile e posseduto.

---

## 0. Metodo e legenda

**Documentato** = c’è una pagina ufficiale, una regola scritta o un contratto pubblico che lo dice.
**Osservato** = l’ho ricavato dal codice del sito/dell’app o da una risposta HTTP, non da una pagina
di documentazione.
**Da verificare** = la fonte non basta, serve un test in Nuvio TV/mobile o una risposta dei moderatori.

**Limiti incontrati**

- Reddit blocca il fetch diretto (`403` su `www.reddit.com`, `old.reddit.com`, `api.reddit.com` e
  `r.jina.ai`). Le regole di r/Nuvio sono citate dagli **estratti indicizzati** dei post, non da una
  lettura integrale. Il post `Community Collection Sharing: Rules & Best Practices` compare nei
  listing di r/Nuvio, ma il corpo non è leggibile senza login.
- `nuvio.tv/community-collections` è una pagina Next.js client-rendered: l’HTML pubblico non contiene
  le card. Il contratto è stato ricostruito dal chunk JS della pagina.
- `GET https://nuvio.tv/api/community-collections?page=1&limit=3` risponde **401**: non esiste un’API
  pubblica per listare o misurare i pack.
- La pagina community ha `meta robots = noindex, nofollow`: non è indicizzata dai motori di ricerca.

---

## 1. Il contratto di distribuzione Nuvio (la parte che conta)

### 1.1 Cos’è un pack nella pagina community

La pagina ufficiale è `https://nuvio.tv/community-collections`. La FAQ ufficiale la descrive così:

> “Community collections are collection layouts shared by other Nuvio users. They can include folders,
> TMDB references, public Trakt lists, and required catalog addons. Adding one copies the layout to
> your selected profile. It does not add media or a media subscription. Community collections are
> user-submitted and moderated.”
> — `https://nuvio.tv/faq` (sezione Collections)

Il codice della pagina di submission mostra i campi effettivi
(`https://nuvio.tv/_next/static/chunks/app/community-collections/page-e94b79b6620bcedb.js`, letto il
20/10/2026):

| Campo | Obbligo | Prova nel codice |
|---|---|---|
| `title` | no, ma consigliato | `title.trim()`; senza titolo la card resta vuota |
| `description` | **sì** | `throw Error("Description is required.")` |
| `coverImageUrl` | **sì, URL http(s)** | `throw Error("A public cover image URL is required.")`; `!/^https?:\/\//i.test(...)` |
| almeno una collection | **sì** | `throw Error("Choose at least one profile collection to submit.")` |
| `tags` | no | campo libero, mostrato in card (prime 4) |
| `resources[]` | no, ma se presente ogni voce ha una descrizione | `throw Error("Each resource needs a description.")` |
| `requirements.addons[]` | no | calcolato dalle collection selezionate |
| `type` | auto | `collection_pack` se le collection sono >1, altrimenti `collection` |

**Forma del pack** (campi letti nel codice, non schema pubblicato):

- `type`: `collection` oppure `collection_pack`;
- `title`, `description`, `tags`, `coverImageUrl`;
- `resources[]`: materiale allegato (JSON, cover, ecc.), ogni voce con `description`;
- `requirements.addons[]`: gli addon necessari, con `addonId`, `addonName`, `manifestUrl`,
  `requiredCatalogs[]`;
- `requiredCatalogs[]`: `{ type, catalogId, genre? }` (`catalogId` oppure `id`).

La cover è resa nelle card con `aspect-[16/7]` (≈ 2,29:1). Non è una regola scritta: è la proporzione
usata dalla UI della pagina community.

### 1.2 Come Nuvio installa un pack

Il flusso è self-service dall’account Nuvio: si selezionano una o più collection del proprio profilo,
si compila la scheda e si invia. La pagina mostra poi:

- **stati**: `pending`, `update_pending`, `changes_requested`, `update_changes_requested`, `rejected`,
  `rejected_update`, `hidden`, `removed`, `published`;
- **azioni moderatore**: `Approve`, `Reject`, con `moderation_note`; l’autore può fare **Appeal**;
- **self-approve**: consentito solo con uno scope temporaneo `self_approval_allowed`, con conferma
  esplicita e audit (“This action will be audited”);
- **update**: si può inviare un aggiornamento di un pack già pubblicato; dopo l’approvazione
  “The URL, likes, installs, and ownership stay the same”.

Non è pubblicato nessuno SLA di revisione. La moderazione è umana e discrezionale.

### 1.3 Come Nuvio risolve un addon richiesto

Nel chunk della pagina di dettaglio
(`https://nuvio.tv/_next/static/chunks/5461-c774b5fef52e5199.js`, letto il 20/10/2026) la funzione che
calcola lo stato delle requirement fa questo, in ordine:

1. cerca un addon installato nel profilo per **URL canonico** (`manifestUrl`) oppure per **`addonId`**;
2. se lo trova, controlla che il manifest esponga tutte le `requiredCatalogs`; se manca qualcosa,
   stato `catalog_missing` con messaggio “Included addon is missing N required catalogs: …”;
3. se non lo trova e la requirement ha un `manifestUrl`, scarica il manifest e verifica che
   `manifest.id` coincida con `addonId` e che le catalogs richieste esistano;
4. se il manifest è valido e le catalogs ci sono, lo stato diventa `install_available` con messaggio
   “Included addon will be installed to provide the required catalogs”;
5. se l’addon è installato ma disabilitato, stato `disabled`.

Il matching delle catalogs è preciso (`function A(e,t)` nello stesso chunk):

```js
// requiredCatalogs: [{ type, catalogId, genre? }]
// match per type + catalogId (o id)
// se genre è presente, deve essere in genreOptions (se il catalogo ne dichiara)
```

**Conseguenza pratica**: un pack può anche non includere il `manifestUrl`; in quel caso l’utente deve
installare l’addon da solo, e Nuvio lo riconoscerà per `addonId`. Ma se il pack include un
`manifestUrl`, Nuvio può installarlo automaticamente — a patto che il manifest sia pubblico, che
`manifest.id` coincida e che esponga esattamente le catalogs richieste.

### 1.4 Cosa questo significa per YACA

YACA ha oggi due manifest:

- `GET /manifest.json` — manifest “root”, **senza catalogs**, con
  `behaviorHints.configurationRequired: true` (`src/stremio/manifest.js:57-75`, route in
  `src/api/stremio.js:173`);
- `GET /:userHandle/manifest.json` e `GET /:userHandle/:configVersion/manifest.json` — manifest
  per-utente, con catalogs che dipendono dal profilo YACA attivo
  (`src/stremio/manifest.js:77-189`, route in `src/api/stremio.js:181`).

Il root manifest non è utilizzabile come addon di catalogs: ha `resources: []` e `catalogs: []`, quindi
Kaptain lo rifiuta (`validateManifest` non trova risorse usabili) e Nuvio non avrebbe righe da mostrare.
L’URL da distribuire è quello per-utente (o un pack manifest dedicato), non `/manifest.json`.

L’URL che il configure restituisce è **versionato**:
`${hostUrl}/${userId}/${configVersion}/manifest.json` (`src/api/configure/index.js:154`). Il
`configVersion` cambia quando cambia il manifest (`src/stremio/reconciler.js:52-84`). L’URL
`/:userHandle/manifest.json` è invece stabile e risolve sempre la configurazione corrente.

Quindi:

- **un pack pubblico non può includere un manifest URL per-utente**: funzionerebbe solo per quell’utente;
- **un pack pubblico può citare YACA per `addonId`** (`org.stremio.yaca.catalog`, uguale per tutti,
  `src/stremio/manifest.js:59` e `:170`), ma solo se le catalogs richieste esistono nel manifest di
  quell’utente;
- le catalogs di YACA non sono tutte sempre presenti: dipendono da `selectedPresets`, `customCatalogs`
  e `typeSelectors` (`src/stremio/manifest.js:85-166`);
- il manifest non dichiara `pageSize` e YACA restituisce 20 titoli per pagina
  (`src/config.js:8`), mentre Nuvio calcola lo skip con il default 100: è il rischio già aperto nel
  ticket 04, e qui diventa un rischio di **pack che sembra rotto** (“load more” che salta titoli).

**La conclusione centrale della ricerca**: per distribuire YACA come addon richiesto in un pack
community serve un **manifest pubblico e stabile con un set di catalogs fisso** (un “pack manifest”,
es. `https://yaca.example.com/pack/lite/manifest.json`), che non dipenda da un handle utente e non
cambi quando l’utente salva la configurazione. Senza questo, l’unico pack scalabile è **YACA Lite
0-addon**; YACA Smart resta un’installazione manuale in 3 passi.

---

## 2. Canali

### 2.1 Nuvio community collections (ufficiale)

**Requisiti**: account Nuvio, almeno una collection nel proprio profilo, **descrizione** e **cover
pubblica http(s)** obbligatorie, titolo consigliato, tags opzionali; addon richiesti opzionali. La
submission si fa dalla pagina community (o dal dialog “Share” dell’account).

**Approvazione**: revisione umana, stati e appeal come sopra. Nessuno SLA. Un pack può essere
`rejected`, `hidden` o `removed`; Nuvio può rimuovere contenuti community in qualsiasi momento
(`https://nuvio.tv/terms`, §7).

**Sforzo**: basso per Lite (1 collection, 4–6 folder, cover, descrizione); medio per Smart (serve il
manifest pubblico e test su più profili).

**Ritorno**: è l’unico canale **first-party** con installazione in un click, conteggio install e
flusso di update che conserva URL/like/install. La pagina però è `noindex` e non ha API pubblica: il
traffico va portato da fuori (sito, Reddit, GitHub).

**Rischio**: moderazione discrezionale, duplicati, loghi di terzi, pack che si rompe se le catalogs
richieste non esistono nel manifest dell’utente. Nessuna analytics oltre a `installs_count` e like
visibili in pagina.

### 2.2 r/Nuvio e r/nuvioaddons (community)

**r/Nuvio** è il sub ufficiale della community. Dalle regole/annunci (estratti indicizzati, Reddit
blocca la lettura integrale):

- “Posts containing unauthorized streams or stream-scraping addons will be removed. To reiterate:
  Nuvio operates on a Bring Your Own Content ecosystem.”
- “Posts containing logos of Streaming Services, Networks, Studios, or otherwise copyrighted logos
  will be removed.”
- una regola numerata “**No duplicate**” (il testo completo non è leggibile).
- “What belongs here: … legitimate metadata or utility addons like TMDB, Trakt, Simkl, OpenSubtitles,
  custom collections, UI tools, setup tools, etc.”; per gli scraper si rimanda a r/nuvioaddons
  (“a community managed subreddit, unaffiliated with the Nuvio project and dev team”).
- flair disponibili: `Collections`, `Addons & Tools`, `Guides & Tutorials`, ecc.

Fonti: `https://www.reddit.com/r/Nuvio/about/rules` (403 al fetch), post di moderazione
`https://www.reddit.com/r/Nuvio/comments/1wrsdct/moderation_update_forks_not_allowed_clarification/`,
listing `https://www.reddit.com/r/Nuvio/rising` (dove compare il titolo
“Community Collection Sharing: Rules & Best Practices”, corpo non leggibile).

**r/nuvioaddons** (`https://www.reddit.com/r/nuvioaddons`) è il sub non affiliato per addon e
scraper. È il posto giusto per un addon di catalogo, non per un pack editoriale; il pubblico è più
tecnico e più orientato a stream/debrid. Il rischio reputazionale è alto se YACA viene percepito come
“l’ennesimo addon di contenuti”.

**Sforzo**: poche ore per un post; **ritorno**: picco di install e feedback nelle prime 48 ore;
**rischio**: rimozione per logo/duplicato/scraper, moderazione, commenti ostili.

### 2.3 Kaptain addon marketplace / setup wizard

Kaptain è un sito statico (`https://kaptain.stream`) con:

- **Add-on Marketplace** (`/addons`): la lista base non è curata da Kaptain. `marketplace/feed-source.js`
  legge `https://api.strem.io/addonscollection.json` (la lista pubblica di Stremio) e la sanifica;
  `marketplace/overlay.json` può aggiungere, nascondere o mettere in evidenza voci, ma oggi contiene
  solo OpenSubtitles v3 e `hide` di Cinemeta. **Non esiste una submission a Kaptain**: per comparire
  nel marketplace bisogna comparire nel feed di Stremio, oppure essere aggiunti manualmente
  all’overlay (decisione editoriale di Kaptain, non un processo pubblico).
- **Installazione da URL**: `addon-core.js` (`validateManifest`) accetta un manifest con `id`, `name`,
  `version` e almeno una risorsa usabile (`stream`, `catalog`, `meta`, `subtitles`) o almeno una
  catalog. `planInstall` installa **add-only**, per profilo, deduplicando per URL canonico; non tocca
  collection, home rows o altri addon.
- **Conteggio install**: `marketplace/install.js` invia un `POST /api/addon-installs` con
  `{ addonId }`; `addons.js` legge `GET /api/addon-installs`. Sono install **via Kaptain**, non
  install Nuvio.
- **Collection ufficiale Kaptain**: nelle versioni recenti è “No Addons needed / 100% Nuvio Native”
  (gist `https://gist.github.com/ImKaptain/c3dd37db5ee2721149687b9fd71c93eb`), quindi oggi YACA non è
  una row della mega collection.

**Requisiti per YACA**: nessuna approvazione per l’installazione da URL; per il marketplace, essere
nel feed Stremio (fuori dal nostro controllo). **Sforzo**: basso (documentare l’URL); **ritorno**:
basso-medio (Kaptain è un buon setup tool, non un canale di scoperta); **rischio**: basso, ma
dipendenza da un feed di terzi e da un overlay non documentato.

### 2.4 Xperience “import catalogs”

Xperience è un builder ospitato e closed-source (`https://xperience-app.com/guide`). Due funzioni
rilevanti:

- **Import from another add-on**: “Paste one or more Stremio manifest URLs. Catalogs from compatible
  add-ons (ones that use IMDb, TMDB, or TVDB ids, or serve their own item details) become rows you can
  keep, rename, or remove.”
- **Import config**: “Paste a Stremio manifest URL (AIOMetadata works too) or a Nuvio collections.json
  and Xperience turns it into a profile.”

Non risulta una directory pubblica né un’approvazione: l’import è privato, per profilo, e il link di
install è personale (“Your install link is personal… A link used from many places is paused and then
reset”). Non ci sono metriche per l’addon importato. Le “merged rows” permettono di combinare più
catalogs in una riga: YACA può essere una delle sorgenti, ma il merge resta lato Xperience e non è
esportabile come pack Nuvio.

**Compatibilità YACA**: il manifest dichiara `idPrefixes: ['tt', 'tmdb:', 'kitsu:']`
(`src/stremio/manifest.js:181`) e fornisce `meta`; per film/serie dovrebbe rientrare nei casi
“IMDb/TMDB ids or own item details”. Per gli anime con ID `kitsu:` Xperience non elenca Kitsu tra gli
ID compatibili: **da testare**. YACA non è un “provider” di Xperience: è una sorgente che l’utente
può importare.

**Sforzo**: zero per il canale, un test per la compatibilità; **ritorno**: basso come distribuzione,
medio come percorso per chi già usa Xperience; **rischio**: basso, ma Xperience può cambiare le
regole di import o filtrare le catalogs senza preavviso.

### 2.5 Ultra MAX

Ultra MAX è un addon “walled garden”: le righe sono catalogs Ultra MAX/TMDB/MDBList, le collection
sono un JSON Ultra MAX, e la guida ufficiale (`https://ultramax.vip/guide.html`) non descrive alcun
import di manifest di terzi. L’unico import è “Import collection file — Add collections from an Ultra
MAX JSON backup” (`https://ultramax.vip/setup.html`).

Non esiste un modo per proporre YACA come provider o come row. L’unica convivenza è: entrambi
installati in Nuvio, due addon separati, due set di collection separati.

**Sforzo**: zero; **ritorno**: zero come canale; **rischio**: zero. **No-go**.

### 2.6 AIOMetadata config export

AIOMetadata non distribuisce i catalogs di YACA: è un metadata layer con i propri catalogs (TMDB,
TVDB, MDBList, ecc.). Il suo export è però un formato utile e documentato:

`configure/src/lib/exportConfigFile.ts:68-77` (repo `cedya77/aiometadata`, letto il 20/10/2026):

```json
{
  "version": "<addonVersion>",
  "exportedAt": "<ISO>",
  "config": { "...": "..." },
  "metadata": {
    "apiKeysExcluded": true,
    "totalCatalogs": 0,
    "enabledCatalogs": 0
  }
}
```

L’import accetta un file `.json` oppure un URL http(s)
(`configure/src/components/ConfigImportExport.tsx:140-213`), avverte se la versione del file è
diversa da quella dell’addon e può escludere le API key dall’export.

**Per YACA**: non è un canale di distribuzione. È un **artefatto di supporto**: si può pubblicare su
GitHub un config JSON che prepara il layer metadata per YACA Smart (provider, lingua, catalogs di
contorno), e l’utente lo importa da URL. Non installa YACA e non crea righe YACA. **Sforzo**: basso;
**ritorno**: basso-medio (meno errori di configurazione); **rischio**: basso (drift di versione,
sovrascrittura della config utente).

### 2.7 Sito YACA / GitHub / QR

È l’unico canale **posseduto**:

- landing page con due percorsi: “YACA Lite — 0 addon, aggiungi il pack” e “YACA Smart — installa
  YACA, configura, aggiungi il pack”;
- URL del manifest e URL di configure ben visibili, con copia/incolla;
- **QR**: comodo per aprire la pagina di configure sul telefono. Nuvio TV ha un QR “Manage from phone”
  per aggiungere un addon dal browser del telefono (fonte secondaria: guida Koditips
  `https://koditips.com/add-addons-to-nuvio`, da verificare in app); non risulta un “scan QR → install
  addon” nativo. Il QR YACA va quindi inteso come scorciatoia per aprire l’URL, non come installazione
  automatica.
- **GitHub**: `collections.json`, config AIOMetadata, cover, note di release. Le immagini devono essere
  URL diretti (`raw.githubusercontent.com/...`), non pagine GitHub: la wiki Nuvio lo dice
  esplicitamente (`https://nuvio.wiki/settings/collections`, sezione “Before You Start”).
- **Misurazione**: analytics del sito, download da GitHub, richieste al manifest.

**Sforzo**: medio (2–3 giorni per landing + asset + QR); **ritorno**: alto nel tempo, perché è
l’unico canale misurabile e indipendente; **rischio**: basso (hosting, TLS, URL stabile).

---

## 3. Pack types: Lite vs Smart

### 3.1 YACA Lite (0-addon)

**Cos’è**: una collection Nuvio con sole source native (TMDB/Trakt), nessun addon richiesto. È il caso
“0 required addons” documentato dalla wiki: “These packs rely exclusively on native TMDB or Trakt
sources. They will display ‘0 required addons’ on their community page… typically a one-click install
and work immediately” (`https://nuvio.wiki/settings/collections`).

**Cosa mostrare**: 1 collection, 4–6 folder. Proposta di shape (la lineup esatta dipende da 09/14):

| Folder | Source nativa | Perché |
|---|---|---|
| Cinema italiano 2000–oggi | TMDB Discover (genere; paese IT se il resolver lo supporta) o lista TMDB | il cuore dell’identità YACA |
| Autori italiani | TMDB Person/Director | dimostra la curatela, non solo il filtro |
| Grandi classici | TMDB Collection/List | riconoscibilità immediata |
| Serie italiane | TMDB Discover (TV; paese IT se supportato) | copre il caso serie |
| Trakt: la tua lista | Trakt public list | personalizzazione senza addon |

**Titolo**: `YACA Lite — Cinema italiano` (o `YACA Lite — Italia`). **Descrizione**: una frase sul
criterio + “0 addon richiesti; si installa in un click”. **Cover**: 16:7, fiamma YACA + titolo, niente
loghi di servizi. **CTA**: “Aggiungi a Nuvio” (nessun prerequisito).

**Perché partire da qui**: zero attriti, zero supporto per manifest/addon, prova il canale community e
la moderazione, e misura il desiderio di un pack editoriale italiano.

### 3.2 YACA Smart (con addon)

**Cos’è**: una collection che richiede YACA come addon, perché usa catalogs YACA (DNA, grafo, AI,
watchlist, anime) e, se serve, il poster endpoint per i badge ITA. È il caso “Required Addons” della
wiki: la pagina community elenca gli addon necessari e indica se sono inclusi o da installare
separatamente.

**Cosa mostrare**: 1 collection, 6–10 folder, con una prima folder “Il tuo DNA” e poi 2–3 folder
tematiche. La descrizione deve dire chiaramente:

> “Richiede l’addon YACA. Installalo, configura le righe che vuoi usare, poi aggiungi questo pack.
> Le folder che richiedono catalogs non attivi resteranno vuote.”

**Titolo**: `YACA Smart — Il tuo DNA`. **Cover**: 16:7, fiamma + “DNA”, sfondo astratto, nessun logo
streaming. **CTA**: “1. Installa YACA → 2. Configura → 3. Aggiungi il pack”.

**Perché non partire da Smart**: senza un manifest pubblico a catalogs fisse, il pack può finire in
`catalog_missing` su quasi tutti i profili; ogni utente ha una selezione di preset diversa. È un
funnel a 3 passi con supporto manuale. Va fatto **dopo** Lite e dopo il manifest pubblico.

### 3.3 Cosa non mettere in nessuno dei due

- loghi di Netflix, Disney+, Prime Video, Rai, Sky, ecc. (regola Reddit “Company Logos”);
- poster o key art di film/serie senza diritti; meglio cover astratte o arte YACA;
- link a scraper, debrid, liste “illegali” o addon di stream;
- duplicati dello stesso pack con titoli diversi;
- una descrizione che promette “tutto” o “gratis” senza dire cosa serve.

---

## 4. Regole

### 4.1 Nuvio (community + terms)

- **Contenuti community**: Nuvio può “review, reject, hide, remove, reorder, restrict, or delete
  community content at any time”, senza obbligo di spiegare ogni decisione
  (`https://nuvio.tv/terms`, §7).
- **Divieti**: contenuti “infringing, unlawful, sexually exploitative, abusive, harassing, hateful,
  violent, misleading, invasive of privacy, or spam”; niente malware o credenziali
  (`https://nuvio.tv/terms`, §7).
- **Addon developer**: chi pubblica un addon/manifest/endpoint è responsabile del servizio e del
  materiale che restituisce; deve avere i diritti (`https://nuvio.tv/terms`, §5).
- **Community collections**: “user-submitted and moderated”; aggiungere un pack “does not add media or
  a media subscription” (`https://nuvio.tv/faq`).

### 4.2 Reddit

- **Niente stream non autorizzati / stream-scraping addon**: “Posts containing unauthorized streams or
  stream-scraping addons will be removed. To reiterate: Nuvio operates on a Bring Your Own Content
  ecosystem.” (post di moderazione r/Nuvio, estratto indicizzato).
- **Niente loghi di servizi/network/studio**: “Posts containing logos of Streaming Services, Networks,
  Studios, or otherwise copyrighted logos will be removed.” (regola r/Nuvio, estratto indicizzato).
- **No duplicate**: una regola numerata “No duplicate” compare nell’estratto; non è chiaro se riguardi
  post o contenuti. Va trattata come “un solo post per pack, niente repost identici”.
- **Self-promo**: non ho trovato una regola scritta specifica. Non significa che sia libera: la
  moderazione può applicare le regole Reddit generali e il divieto di spam. La submission Nuvio non ha
  un campo “sito/affiliate”: la promo resta nella descrizione e nelle risorse, ed è moderata.

### 4.3 Checklist operativa

1. Cover originale 16:7, URL diretto, nessun logo di terzi.
2. Titolo unico e descrizione che dice cosa serve (0 addon / richiede YACA / quali catalogs).
3. Un pack = un obiettivo editoriale; niente “tutto il catalogo” in un unico pack.
4. Nessun link a scraper/debrid/stream; nessun linguaggio da “pirateria”.
5. Crediti per le immagini se non sono nostre; meglio asset YACA.
6. Un solo post per pack; aggiornamenti nel thread o nella pagina community, non repost.
7. Testare il pack su un profilo pulito prima di inviarlo.

---

## 5. Essere provider

### 5.1 Il contratto minimo (Nuvio community pack)

| Campo | Dove vive | Obbligatorio | Cosa deve essere per YACA |
|---|---|---|---|
| `addonId` | `requirements.addons[].addonId` | consigliato (matching per id) | `org.stremio.yaca.catalog` (`src/stremio/manifest.js:59`, `:170`) |
| `addonName` | `requirements.addons[].addonName` | consigliato | `YACA 🇮🇹 (Yet Another Catalog Addon)` |
| `manifestUrl` | `requirements.addons[].manifestUrl` | no, ma serve per l’auto-install | URL pubblico, HTTPS, che restituisce un manifest con `id` uguale e le catalogs richieste |
| `requiredCatalogs[]` | `requirements.addons[].requiredCatalogs` | sì, se il pack usa catalogs YACA | `{ type, catalogId, genre? }`; il `catalogId` deve esistere nel manifest |
| `catalogSources[]` | dentro le folder della collection | sì | `{ addonId, type, catalogId }` — Kaptain sanitizza esattamente questi tre campi (`nuvio-push.js`, `sanitizeCollectionsForSync`) |
| `manifest.version` | manifest | sì | `1.0.4+<configVersion>`; va bumpato quando cambia il manifest |
| `behaviorHints.configurable` | manifest | consigliato | `true` (`src/stremio/manifest.js:182-185`) |
| `configurationURL` | manifest | consigliato | `https://<host>/<handle>/configure` |
| `resources` | manifest | sì | `catalog`, `meta` (`src/stremio/manifest.js:175-178`) |
| `idPrefixes` | manifest | sì | `tt`, `tmdb:`, `kitsu:` (`src/stremio/manifest.js:181`) |
| `types` | manifest | sì | `movie`, `series`, `anime`, `other` (`src/stremio/manifest.js:179`) |

**Extra e artwork**: le catalogs YACA dichiarano `extra` (`sortBy` con opzioni, `skip`, `search` per
le search-only: `src/stremio/manifest.js:9-11`, `:28-46`). Un pack che usa `genre` deve fare i conti
con `genreOptions`; le folder della collection hanno `coverImageUrl`/`tileShape`, e la cover del pack è
16:7. L’artwork non è un campo del manifest addon: vive nella collection e nella pagina community.

**Cosa manca a YACA per essere un provider “completo”**:

1. un **manifest pubblico a catalogs fisse** (pack manifest), senza `userHandle`, con un set di
   catalogs stabile e documentato;
2. un **catalogo IDs stabile** per i pack (es. `yaca_pack_lite_cinema_it`), distinto dai preset
   dinamici del profilo;
3. `pageSize` dichiarato o paginazione compatibile con lo skip di Nuvio (ticket 04);
4. una pagina di documentazione con: manifest URL, catalog IDs, tipo, extra, cover, esempi di
   `catalogSources`;
5. un test matrix TV/mobile per l’auto-install e per `catalog_missing`.

### 5.2 Cosa serve per Kaptain

- Per il **marketplace**: essere nel feed `https://api.strem.io/addonscollection.json`; non c’è una
  submission Kaptain. L’overlay di Kaptain può aggiungere/featured un addon, ma è una decisione
  editoriale non documentata.
- Per l’**installazione**: un manifest valido (`id`, `name`, `version`, risorsa usabile) e un URL
  pubblico. `planInstall` è add-only e per profilo.
- Per una **row in una collection Kaptain**: la collection deve avere `catalogSources` con
  `addonId`/`catalogId`/`type`; la mega collection ufficiale è native-only, quindi servirebbe una
  collection Kaptain separata o una custom collection dell’utente.

### 5.3 Cosa serve per Xperience

- Un manifest Stremio-compatibile con catalogs che usano IMDb/TMDB/TVDB o che servono i propri item
  details. L’utente incolla l’URL in “Import from another add-on”; non c’è listing.
- Attenzione agli ID `kitsu:` degli anime: non sono nell’elenco degli ID compatibili citato dalla
  guida. Testare prima di promettere “funziona in Xperience”.

### 5.4 Cosa serve per Ultra MAX

- Niente: Ultra MAX non importa catalogs di terzi. Non è un canale provider.

### 5.5 Rischi di dipendere dai builder

| Builder | Dipendenza | Rischio |
|---|---|---|
| Kaptain | feed Stremio + overlay | il feed può cambiare; l’overlay è opaco; nessuno SLA |
| Xperience | servizio hosted, closed-source | import/filtri possono cambiare; link privati; niente metriche |
| Ultra MAX | ecosistema chiuso | nessuna inclusione possibile |
| Nuvio community | moderazione + pagina client-rendered | rimozione discrezionale; niente API; niente SLA |
| AIOMetadata | formato di export/import | drift di versione; sovrascrittura config |

La regola è: **usare i builder come superfici di installazione, non come fonte di verità**. La fonte
di verità è il manifest YACA e il pack JSON che possediamo.

---

## 6. Misurazione

| Metrica | Canale | Come si ottiene | Limiti |
|---|---|---|---|
| Install del pack | Nuvio community | `installs_count` nella pagina del pack | visibile in pagina, non via API; conta l’azione “Add”; non è documentato se deduplichi per account |
| Like | Nuvio community | like nella pagina | vanità; non correlato all’uso |
| Install via Kaptain | Kaptain | `GET /api/addon-installs` per `addonId` | solo install fatti dal sito Kaptain, non da Nuvio |
| Manifest fetch | YACA | log della route `/:handle/manifest.json` | un device può fare più fetch; cache; niente user ID |
| Attivazione | YACA | prima richiesta a una catalog del pack | proxy; richiede instrumentazione |
| Retention | YACA | richieste ripetute per pack nel tempo | serve un identificatore pseudonimo (IP+UA hash) e una politica privacy |
| Click | sito YACA | analytics + UTM | solo traffico nostro |
| Download | GitHub | download dei file release | non dice se il pack è installato |
| Commenti/upvote | Reddit | piattaforma | non sono install |

**Cosa non è ottenibile**:

- install per account/profilo Nuvio;
- utenti unici reali (la documentazione pubblica non prevede un ID utente nelle richieste catalogs;
  da verificare sui log);
- attivazione per profilo, retention per utente, churn, LTV;
- metriche dei pack di altri;
- metriche di Xperience/Ultra MAX per un addon importato.

**Raccomandazione minima**: se Nuvio conserva la query (da testare), aggiungere un parametro `pack`
all’URL del manifest o delle catalogs (es. `?pack=lite`) e loggare `pack`, data, `user-agent` e un hash
di IP con salt giornaliero. Non è perfetto, ma è l’unico modo per distinguere Lite da Smart e per
misurare la retention senza chiedere dati a Nuvio. Va coordinato con il ticket 13 (privacy/terms).

---

## 7. Matrice canali

| Canale | Tipo | Requisiti | Approvazione | Sforzo | Ritorno | Rischio | Go/No-go |
|---|---|---|---|---|---|---|---|
| **Nuvio community — Lite** | first-party, 0 addon | account, 1 collection, cover, descrizione | moderazione umana, no SLA | basso | alto: one-click, install count | medio: moderazione, duplicati, noindex | **GO** |
| **Nuvio community — Smart** | first-party, con addon | manifest pubblico stabile + catalogs fisse | moderazione umana | medio-alto | alto se funziona, ma supporto | alto: `catalog_missing`, URL, profili | **CONDITIONAL** |
| **r/Nuvio** | community | post con flair `Collections`, niente loghi/scraper/duplicati | moderazione sub | basso | medio: picco e feedback | medio: rimozione, commenti | **GO (un post)** |
| **r/nuvioaddons** | community non affiliata | post tecnico | moderazione sub | basso | basso: pubblico sbagliato | alto: brand piracy-adjacent | **NO-GO ora** |
| **Kaptain marketplace** | directory di terzi | essere nel feed Stremio | nessuna submission Kaptain | zero | basso: listing non garantito | basso | **NO-GO come canale** |
| **Kaptain install da URL** | setup tool | manifest valido | nessuna | basso | basso-medio | basso | **GO come supporto** |
| **Xperience import** | builder di terzi | manifest compatibile | nessuna | zero + test | basso come distribuzione | basso | **NO-GO come canale, GO come test** |
| **Ultra MAX** | ecosistema chiuso | nessuno | non previsto | zero | zero | zero | **NO-GO** |
| **AIOMetadata config** | artefatto di supporto | config JSON + URL | nessuna | basso | basso-medio | basso | **GO solo per Smart** |
| **Sito/GitHub/QR** | owned | landing, asset, URL stabile | nessuna | medio | alto nel tempo, misurabile | basso | **GO** |

---

## 8. Go / no-go per partire

**GO — settimana 1**

1. **YACA Lite** su Nuvio community: una collection, 4–6 folder native, cover 16:7 originale,
   descrizione “0 addon”, tag `cinema italiano`, `0 addon`.
2. **Landing + GitHub**: pagina con i due percorsi, manifest URL, configure URL, QR, `collections.json`
   e cover. Tutto su URL diretti e stabili.
3. **Un post su r/Nuvio** con flair `Collections`: screenshot, descrizione, link al pack, nessun logo
   di servizi, nessun riferimento a scraper. Un solo post; gli update nel thread.

**CONDITIONAL — dopo Lite**

4. **YACA Smart** solo se esiste un **manifest pubblico a catalogs fisse** e un test matrix che
   dimostri l’auto-install e l’assenza di `catalog_missing` su un profilo pulito.
5. **Config AIOMetadata** per Smart: pubblicare il JSON su GitHub e documentare l’import da URL.

**NO-GO ora**

6. **r/nuvioaddons**: pubblico sbagliato e rischio brand; casomai un post tecnico dopo Lite, non un
   lancio.
7. **Kaptain marketplace**: non c’è una submission; dipende dal feed Stremio. Si può documentare
   l’install da URL, non aspettarsi visibilità.
8. **Xperience come canale**: nessuna directory, nessuna metrica; solo test di compatibilità.
9. **Ultra MAX**: nessun provider path.

**Criterio di stop/go**: se Lite ottiene install e commenti in 2 settimane senza supporto manuale,
si passa a Smart; se la moderazione rifiuta o il pack si rompe, si corregge Lite prima di aggiungere
addon.

---

## 9. Cosa significa per YACA

1. **Il pack non è il prodotto: il manifest è il prodotto.** Lite vende il catalogo; Smart vende il
   motore (DNA, grafo, AI, ITA, anime). Senza un manifest pubblico stabile, Smart non è distribuibile
   come pack community.
2. **La pagina community è una vetrina senza analytics.** È `noindex`, non ha API pubblica e mostra
   solo install/like. La misurazione va costruita lato YACA (pack param + log) e lato sito.
3. **Il primo canale giusto è Lite.** Zero addon, one-click, meno supporto, e testa la moderazione
   Nuvio e il pubblico italiano senza mettere a rischio il brand.
4. **I builder non sono canali di distribuzione.** Kaptain è un setup tool, Xperience è un builder
   concorrente, Ultra MAX è chiuso. Possono installare YACA, ma non la fanno scoprire.
5. **Reddit serve per il lancio, non per la retention.** Un post su r/Nuvio con flair `Collections`,
   niente loghi, niente duplicati, niente scraper. r/nuvioaddons non è il pubblico di un pack
   editoriale.
6. **La regola d’oro**: nessun pack senza un test su un profilo Nuvio pulito, con il manifest
   effettivamente installato e le catalogs richieste presenti.

---

## 10. Domande aperte

1. **Manifest pubblico**: chi lo possiede e come si genera? Serve un `pack manifest` separato dal
   manifest utente, con catalogs fisse. È una decisione di prodotto (ticket 14), non di ricerca.
2. **Approvazione Nuvio**: un pack che richiede un addon non presente nel feed Stremio viene accettato?
   Il codice prevede `manifestUrl`, ma la moderazione potrebbe chiedere che l’addon sia “noto”. Da
   testare con una submission Lite e una Smart.
3. **Auto-install**: su TV e mobile l’installazione dell’addon incluso funziona davvero? Il codice
   dice `install_available`; manca un test end-to-end.
4. **`genre` matching**: YACA non dichiara `genreOptions`; un pack che usa `genre` rischia di non
   matchare. Testare o evitare `genre` nei pack.
5. **Cover**: 16:7 è la proporzione della card, ma non c’è una specifica di dimensione/qualità. Testare
   con una cover 1920×840 e una GIF.
6. **Reddit**: il testo completo di `Community Collection Sharing: Rules & Best Practices` non è
   leggibile senza login. Chiedere ai mod di r/Nuvio il testo o una copia.
7. **QR**: Nuvio mobile ha uno scan nativo per installare un addon? La guida Koditips descrive il QR
   “Manage from phone” di Nuvio TV, non un scan di manifest. Da verificare in app.

---

## Fonti primarie lette

**Nuvio**

- `https://nuvio.tv/community-collections` — pagina ufficiale (client-rendered; `meta robots noindex`).
- `https://nuvio.tv/_next/static/chunks/app/community-collections/page-e94b79b6620bcedb.js` — form di
  submission, validazione, stati, update, self-approve.
- `https://nuvio.tv/_next/static/chunks/5461-c774b5fef52e5199.js` — risoluzione requirement addon,
  matching per URL/`addonId`, `requiredCatalogs`, `install_available`, `catalog_missing`.
- `https://nuvio.tv/faq` — “What are community collections?”.
- `https://nuvio.tv/terms` — §5 community addon developers, §7 community content (last updated
  8/08/2026).
- `https://nuvio.tv/docs/nuvio-public-api.md` — v1.3, 20/08/2026: `sync_push_addons`,
  `sync_push_collections`, full replace, dedupe `md5(url)`.
- `https://nuvio.wiki/settings/collections` — wiki community: pack 0-addon vs required addons, cover
  URL diretti, import AIOMetadata.
- `https://nuvio.tv/api/community-collections?page=1&limit=3` — 401 (osservato).
- YACA: `src/stremio/manifest.js:57-75`, `:77-189`; `src/api/stremio.js:173`, `:181`;
  `src/stremio/reconciler.js:52-84`; `src/api/configure/index.js:154`; `src/config.js:8`.

**Reddit**

- `https://www.reddit.com/r/Nuvio/about/rules` — 403 al fetch; regole citate da estratti indicizzati.
- `https://www.reddit.com/r/Nuvio/comments/1wrsdct/moderation_update_forks_not_allowed_clarification/`
  — post di moderazione su addon/scraper.
- `https://www.reddit.com/r/Nuvio/rising` — listing dove compare il titolo
  “Community Collection Sharing: Rules & Best Practices”.
- `https://www.reddit.com/r/nuvioaddons` — sub non affiliato per addon/scraper.

**Kaptain**

- `https://kaptain.stream/addons` — pagina marketplace.
- `https://kaptain.stream/addon-core.js` — `validateManifest`, `planInstall`, `canonicalUrl`.
- `https://kaptain.stream/marketplace/feed-source.js` — feed
  `https://api.strem.io/addonscollection.json`.
- `https://kaptain.stream/marketplace/overlay.json` — solo OpenSubtitles v3 + hide Cinemeta.
- `https://kaptain.stream/marketplace/install.js` — `POST /api/addon-installs`.
- `https://kaptain.stream/addons.js` — `GET /api/addon-installs`.
- `https://kaptain.stream/nuvio-push.js` — `installAddons` add-only, `sanitizeCollectionsForSync`,
  `sync_push_addons`.
- `https://gist.github.com/ImKaptain/c3dd37db5ee2721149687b9fd71c93eb` — mega collection “100% Nuvio
  Native, No AIO Metadata”.

**Xperience**

- `https://xperience-app.com/guide` — “Import from another add-on”, “Import config”, link privato,
  membership.

**Ultra MAX**

- `https://ultramax.vip/guide.html` — setup, collections JSON, nessun import di manifest di terzi.
- `https://ultramax.vip/setup.html` — “Import collection file” (solo backup Ultra MAX).
- `https://ultramax.vip/about/` — cos’è Ultra MAX.

**AIOMetadata**

- `https://github.com/cedya77/aiometadata` — repo.
- `configure/src/lib/exportConfigFile.ts:68-77` — schema export.
- `configure/src/components/ConfigImportExport.tsx:140-213` — import file/URL, warning di versione.

**Fonti secondarie (solo per il QR, da verificare)**

- `https://koditips.com/add-addons-to-nuvio` — “Manage from phone” e QR su Nuvio TV.
