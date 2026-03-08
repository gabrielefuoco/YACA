# 🧩 Stremio Internals & Hack Creativi

Per superare i limiti nativi del protocollo Stremio (che è tendenzialmente stateless), YACA implementa diverse soluzioni ingegnose.

## 1. Il Workaround del Profilo ("Switch Profile")

Stremio non permette ad un addon di cambiare dinamicamente i propri cataloghi in base a un menu a tendina. YACA risolve questo problema usando il sistema degli **Stream**.

### Meccanica del "Fake Stream"
1.  Nel Manifest, YACA espone un catalogo di tipo `other` chiamato **"👥 Cambia Profilo"**.
2.  Ogni elemento di questo catalogo (es. "Profilo Anime") è mappato su un ID `yaca-profile-ID`.
3.  Quando l'utente seleziona un profilo, Stremio chiede gli stream per quell'ID.
4.  [`streamHandler.js`](file:///c:/Users/gabri/APP/catalogo/src/handlers/streamHandler.js) restituisce un singolo stream con un titolo descrittivo ("Premi Play per Attivare").
5.  **Il Trucco**: L'URL dello stream punta a un endpoint `/api/users/:userId/switch-profile/:profileId`. 
6.  Quando Stremio tenta di caricare il "video" (che è in realtà un micro-clip o un redirect), il server YACA intercetta la chiamata, aggiorna l'utente nel database e invalida la cache del manifest.
7.  Al ritorno dell'utente nella home di Stremio, i cataloghi sono già stati aggiornati.

---

## 2. Hybrid Anime Mapping (TMDB + Kitsu)

TMDB è ottimo per i metadati generali (poster, trame in italiano), ma scarso per la gestione degli episodi anime (spesso incompleti o con numerazione errata). Kitsu è il leader per gli anime ma manca di localizzazione italiana.

**La Soluzione YACA (in `metaHandler.js`):**
1.  Recupera i metadati base da **TMDB** (per avere poster e trama in italiano).
2.  Analizza se il contenuto è un Anime (Genre 16 + Keyword mapping).
3.  Esegue un **ID Translation** verso **Kitsu**.
4.  Sostituisce la lista episodi di TMDB con quella di **Kitsu**.
5.  **Risultato**: L'utente vede poster e descrizioni in italiano (TMDB) ma ha accesso a tutti gli episodi corretti e aggiornati (Kitsu).

---

## 3. Dynamic Manifest Versioning

Per costringere Stremio ad aggiornare la cache del manifest quando l'utente cambia impostazioni, YACA usa una versione dinamica:

```javascript
const dynamicVersion = `1.0.2+${userConfig.configVersion}`;
```

Ogni volta che la configurazione viene salvata, `configVersion` (un hash o timestamp) cambia, forzando Stremio a scaricare il nuovo manifest e, di conseguenza, la nuova lista di cataloghi personalizzati.

---

## 4. Badge Clipping (ImageKit)

Come descritto in [Integrazioni](file:///c:/Users/gabri/APP/catalogo/docs/INTEGRATIONS.md), YACA usa il clipping URL invece di librerie grafiche pesanti. Questo permette di gestire migliaia di richieste di "badge numero episodio" su una istanza gratuita (Free Tier) di Render/Hugging Face senza saturare la RAM.
