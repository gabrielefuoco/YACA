Status: resolved
Type: grilling

# 03 — La superficie di dominio: le rotte che il client può nominare

**Risolto il 17/10/2026.** La tabella completa sta in `## Esito`, in fondo: è la cosa da implementare nei
ticket 10 (il server) e 11 (il client).

## Perché

La decisione 4 della mappa (charting, 17/10/2026) stabilisce la regola: il client **non nomina mai**
l'infrastruttura. Oggi nomina `/api/tmdb/batch-details`, `/api/tmdb/batch-keywords`, `/api/tmdb/search/*`,
`/api/sync/global-queue`, `/api/sync/enrich`, `/api/validate-tmdb-key`, `/api/validate-mistral-key`,
`/api/clear-cache`, `/api/preview-catalog`, `/api/stremio-auth`, `/api/stremio-addon-update`, più 13 chiamate
a `/api/profiles/*`. Applicare la regola senza prima **scrivere la superficie** significa inventare rotte una
alla volta, e finire con dieci nomi nati per caso — che è come il client si è riempito di infrastruttura.

## La domanda

Qual è, per esteso, la superficie di dominio del prodotto — e per ogni rotta che il client nomina oggi, a
quale rotta di dominio si mappa?

## Cosa deve uscire

Una tabella `rotta di oggi → rotta di dominio → cosa assorbe`, con:

- le rotte di **lettura** (cosa serve a disegnare la dashboard: profilo, catalogs, preset, stato della
  sincronizzazione, stato della cache) e le rotte di **intenzione** (`preview`, `save`, `sync`, `disconnect`);
- cosa succede alle validazioni (`validate-tmdb-key`, `validate-mistral-key`): diventano parte di
  `POST /api/dashboard/preview`/`save`, o restano rotte di dominio a sé;
- i **batch TMDB** (`batch-details`, `batch-keywords`): chi li assorbe, e con quale tetto di dimensione;
- l'**anteprima** (`preview-catalog`): oggi il client la compone chiamando il server più volte — con che cosa
  diventa una chiamata sola (e quanto torna grossa: misurare, non stimare);
- `clear-cache` e `stremio-addon-update`: sono operazioni di **amministrazione** dell'utente sul proprio
  addon — qual è la loro rotta di dominio;
- **l'autenticazione** (`/api/auth/*`, `/api/stremio-auth`): cosa resta al client e cosa no;
- il **contratto di errore**: una forma sola per tutte le rotte di dominio (oggi convivono `{error}`,
  `{ok:false, errore}`, `{status, message}` — `src/api/bolle.js` usa `{ok, errore}`, `index.js` usa `{error}`).

## Il confine da non superare

Superficie di dominio significa **il client dice un'intenzione, il server sa come si fa**. Non significa
spostare nel server la logica di presentazione: il client continua a decidere cosa disegnare e come.

## Come si verifica

La superficie è pronta quando: (a) ogni riga della tabella ha un consumatore nel client dichiarato (file e
componente); (b) ogni rotta infrastrutturale di oggi ha **un** posto dove finisce (assorbita, o dichiarata
legittima e motivata); (c) il conteggio delle chiamate del client scende ai numeri che la tabella prevede —
da misurare con un `grep` sul client **prima e dopo** il ticket 11, non a occhio.

---

## Esito

**Due decisioni prese il 17/10/2026 in grilling, più due fatti che le hanno rese precise.**

### I fatti

1. **Il client ha già una porta sola**: `frontend/src/lib/api.ts` (160 righe) contiene **tutte** le chiamate
   infrastrutturali; fuori di lì restano quattro chiamate sparse (`app/page.tsx`, `CreatorPanel.tsx`,
   `UserLibraryPanel.tsx`, `hooks/useAuth.ts`). Il ticket 11 è quindi un lavoro su **un file**, non su
   cinquanta componenti.
2. **La superficie del server è larga e disomogenea**: `auth/*`, `trakt/*`, `user/:userId`, `presets`,
   `configure`, `check-user`, `profiles/:id/{analytics,flatness,library,library/watched,raw-data,
   sync-status,convert-library,dna/confirm,sync-vectors,sync/refresh}`, `tmdb/{search/*,batch-*}`,
   `validate-*`, `preview-catalog`, `clear-cache`, `stremio-*`, `ai/generate-merged-name`, `sync/*`,
   `bolle`, più `admin/*`. Tre forme di errore convivono: `{error}`, `{ok:false, errore}`, `{status, message}`.

### 1. La forma: risorse di dominio, una per possessore

Le rotte si chiamano **come le cose del prodotto**, non come gli schermi: profilo, libreria,
sincronizzazione, configurazione, anteprima, ricerca. Il client compone la schermata leggendo le risorse; il
server compone i **dati**.
Il motivo è la frequenza del cambiamento: la schermata cambia più spesso del dominio, e una rotta fatta a
forma di schermo si sposa con la UI — ogni ritocco di pannello diventa un ritocco di server.

### 2. L'anteprima torna le card **più la diagnosi**

`POST /api/configurazione/anteprima` restituisce le card come le vedrebbe Stremio (titolo, poster, anno,
badge ita, durata) **e** i conteggi dei filtri: candidati, entrati, e quanti ha tagliato ciascun filtro
(ita, nsfw/kids, genere, già visto, cap di qualità, collezioni). Tetto: ~20 card.
Il motivo: è il pannello dove si **tara**, e un'anteprima che non spiega è lo strumento che fa dire «non
capisco perché sono 8». Il client disegna le card e stampa i numeri; non sa cosa sia TMDB.

### La tabella

| rotta di oggi | rotta di dominio | cosa assorbe, e chi la consuma |
|---|---|---|
| `GET /api/user/:userId`, `POST /api/check-user` | `GET /api/profilo` | l'anagrafica e lo stato del profilo (e `heroCatalogs`, oggi in `index.js:136-154`) — `app/page.tsx` |
| `GET /api/profiles/:id/{library,library/watched,raw-data,analytics,flatness}` | `GET /api/profilo/libreria` | la libreria dell'utente: titoli, stati, voti — `UserLibraryPanel.tsx` |
| `POST/DELETE/PUT /api/profiles/:id/library*` | `POST /api/profilo/libreria` · `DELETE …/libreria/:titolo` · `PUT …/libreria/ordine` | le mutazioni della libreria (riordino compreso) |
| `GET /api/profiles/:id/sync-status` | `GET /api/profilo/sincronizzazione` | lo stato e la coda |
| `POST /api/sync/{global-queue,enrich}`, `POST /api/profiles/:id/{convert-library,sync-vectors,sync/refresh}`, `POST /api/trakt/device/{code,token}` | `POST /api/profilo/sincronizzazione` | l'intenzione «sincronizza»: il server fa la sequenza (coda, arricchimento, conversione, vettori, device flow Trakt). Oggi quella sequenza la fa il browser in più chiamate |
| `POST /api/preview-catalog`, `POST /api/tmdb/batch-{details,keywords}` | `POST /api/configurazione/anteprima` | card + diagnosi, cap ~20 |
| `POST /api/validate-tmdb-key`, `POST /api/validate-mistral-key` | `POST /api/configurazione/verifica` | la validazione diventa un'operazione di dominio («posso salvare questa configurazione?»), non un test di infrastruttura |
| `POST /api/configure`, `POST /api/stremio-addon-update` | `POST /api/configurazione` | salvare, compreso ciò che il salvataggio comporta sull'addon |
| `GET /api/presets` | `GET /api/configurazione/preset` | i preset dei cataloghi (lettura) |
| `GET /api/tmdb/search/{multi,genre,keyword,person}` | `GET /api/ricerca?tipo=titolo\|genere\|keyword\|persona&q=…` | **una** rotta: il tipo è un parametro, non un percorso — `CreatorPanel.tsx` |
| `POST /api/ai/generate-merged-name` | `POST /api/configurazione/nome` | un aiuto del costruttore di cataloghi |
| `POST /api/clear-cache` | `POST /api/profilo/aggiorna` | «ricostruisci i miei suggerimenti» è un'intenzione dell'utente, non un verbo di cache |
| `POST /api/stremio-auth` | `POST /api/auth/stremio` | è autenticazione, e sta con le altre |
| `POST /api/auth/{login,guest,logout}`, `GET /api/auth/me` | **restano** `POST/GET /api/auth/*` | il dominio autenticazione è già una superficie di dominio |
| `POST /api/trakt/disconnect`, `GET /api/trakt/health` | `DELETE /api/auth/trakt` · `GET /api/auth/trakt` | due rotte per la stessa cosa (`/api/trakt/disconnect` è un doppione di `/api/auth/trakt/disconnect`) |
| `POST /api/bolle` | `POST /api/mondi` (o `GET /api/profilo/mondi`) | **il nome è del motore, non del dominio**: `bolle` è la parola interna dell'engine. La rotta pubblica è il portafoglio dei mondi per un profilo |
| `/manifest.json`, `/catalog/…`, `/meta/…`, `/stream/…` | **non si toccano** | sono il protocollo di Stremio: il confine è con la dashboard, non con Stremio |
| `/api/admin/*` (`metrics`, `system/flush`, `scripts/trigger`, `tmdb-dump/*`) | **restano** | altro consumatore (l'operatore, non il client): non entrano nella superficie di dominio, ma non sono debito |
| `POST /api/profiles/:id/dna/confirm` | `POST /api/profilo/dna/conferma` | è la conferma del DNA (vecchio stack): la rotta segue il suo destino — non si rinomina per gusto, si sposta quando il DNA si ritira |

### Il contratto di errore, unico

Una forma sola per tutte le rotte di dominio:

```json
{ "error": { "code": "non_autenticato", "message": "Sessione scaduta." } }
```

- `code` — stabile, minuscolo, per il codice: `non_autenticato`, `non_trovato`, `richiesta_non_valida`,
  `chiave_non_valida`, `motore_giu`, `non_disponibile`;
- `message` — in italiano: è l'unico che può finire nell'interfaccia;
- HTTP coerente: `401` non autenticato · `404` non trovato · `400` richiesta non valida · `503` motore giù.

Il motivo per cui vale la pena fissarlo: oggi convivono tre forme, e chi scrive il client le scopre una per
una — è così che il client ha imparato l'infrastruttura.

### Cosa l'esito lascia aperto (dichiarato)

- **`GET /api/profilo` è grande**: anagrafica, catalogs attivi, preset, hero groups, `hasGlobalErdb`. Va
  spezzato o va bene tutto insieme? Decisione del ticket 10, **misurando** il payload.
- **L'autenticazione**: come la sessione entra nelle rotte di dominio (cookie, come oggi) resta.
- **Il vecchio `/api/trakt/disconnect`**: doppione da togliere, non da deprecare in eterno.
