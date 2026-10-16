# Il contratto del motore

**Risolto il 17/10/2026** — ticket `01-contratto-del-motore.md` della mappa `confini`.
Questo documento è la cosa da implementare nei ticket 07 (lato motore) e 08 (lato prodotto).
Finché il ticket 07 non l'ha realizzato, **questo contratto non esiste nel codice**: descrive ciò che si
costruisce, non ciò che c'è.

---

## 1. Chi parla, quando

Il **prodotto** (Node) chiama il **motore** (Python), una volta, quando costruisce il pool delle righe hero —
cioè al **cache-miss** (`buildSharedHeroCatalogs`, `src/engines/hybridRecommendations.js`), non a ogni
richiesta di Stremio. La risposta entra nella struttura memorizzata del prodotto, e da lì in poi è una riga
come tutte le altre.

Trasporto: **HTTP POST, JSON**, su un endpoint solo. Porta, nome del servizio, immagine e volumi li fissa il
ticket 07.

## 2. Il vocabolario

| cosa | forma | nota |
|---|---|---|
| medium | `"movie"` \| `"series"` | **un nome solo** per le serie: non `tv`, non `serie`, non `show`. Chi ha `tv` (il canone del motore) converte al proprio bordo. |
| titolo | `{ tmdbId: <int>, medium: "movie"\|"series" }` | **oggi si scrive così e domani pure**: non esiste una forma con prefisso (`tmdb:655`, `tv:655`) nel contratto. |
| peso del seme | `"loved"` \| `"liked"` \| `"watched"` \| `"library"` | i quattro segnali del prodotto (`PESO_A_TIPO` in `hybridRecommendations.js` ↔ `PESO_TIPO` in `graph/parametri.py`). |
| punteggio | numero ≥ 0 | **l'attivazione** del titolo: è ciò che ordina dentro una lista, e ciò che permette al prodotto di fondere due liste senza rompere l'ordine. |
| slider | `largo` 2–8 · `lontano` 0–1 · `cozy` −1–+1 · `canone` −1–+1 | i nomi dicono la **richiesta**, non la persona (`graph/parametri.py` §13). |

**Perché non le stringhe con prefisso**: il 17/10/2026 le serie sono sparite dalle righe del grafo per la
forma dell'id — *«la forma piena non è quella del prodotto»* — e il prodotto usa la forma breve `tmdb:<id>`
senza medium (`DuckDbProvider.js:292`), mentre `tv` e `series` sono la stessa cosa con due nomi. Un oggetto
con due campi toglie la classe di guasto: non c'è niente da indovinare.

## 3. La richiesta

```json
{
  "semi": [ { "tmdbId": 655, "medium": "series", "peso": "loved" } ],
  "medium": "series",
  "opzioni": { "largo": 4, "lontano": 0.0, "cozy": 0.0, "canone": 0.0 },
  "cap": 60
}
```

- `semi` — la storia. Id fuori dal canone del motore **non sono un errore**: vengono ignorati, e se
  *nessuno* è nel canone il motore lo dice nei `motivi` (vedi §6).
- `medium` — il medium della richiesta: è il tipo della **riga**, e serve perché un mondo quasi sempre è di
  un solo medium ma può non esserlo (trappola pagata: il filtro va contato **per medium**, non sulla taglia
  totale).
- `opzioni` — **opzionale**: se manca, il motore applica `SLIDER_DEFAULT` (`graph/motore.py:51`: `largo 4`,
  gli altri a `0.0`). Chi sceglie il valore per profilo è il prodotto — è il ticket 39 della mappa
  `suggerimenti`, e non si decide qui.
- `cap` — il tetto di titoli **per lista**. Opzionale, default `60`.

Non c'è un campo «quante liste»: il motore restituisce le liste che ha (vedi §4). Non c'è un campo «nome
della riga»: il motore non conosce le righe.

## 4. La risposta: liste, non righe

```json
{
  "contratto": 1,
  "versioni": { "artefatto": "…", "ricetta": "…" },
  "semi": { "n": 128, "da_catalogo": false },
  "liste": [
    {
      "ruolo": "il_tuo_mondo",
      "mondo": 4192,
      "descrizione": "…",
      "attivazione": 0.83,
      "mediana_voti": 7.2,
      "quota_serie": 0.9,
      "semi": [655, 1972],
      "titoli": [ { "tmdbId": 1309, "medium": "series", "punteggio": 0.42 } ]
    }
  ],
  "motivi": []
}
```

- **il motore restituisce liste coi loro ruoli; il prodotto decide quali diventano righe.** I ruoli sono
  quelli del motore Python (`graph/motore.py:275-297`): `il_tuo_mondo` (una, il mondo del profilo),
  `un_passo_fuori` (una, i mondi vicini), `uscite_nuove` (i titoli recenti dentro i mondi accesi),
  `nicchia_di_qualita` (ben votati e poco popolari), e `mondo_<bolla>` per ogni altro mondo acceso (i
  micro-cluster: 8 titoli ciascuno).
- **il prodotto mappa**: oggi `yaca_mondi_*` ← `il_tuo_mondo`, `yaca_passo_fuori_*` ← `un_passo_fuori`; le
  altre liste sono materiale per l'anteprima in dashboard o per righe future. Nessuno dei due nomi entra nel
  contratto.
- **ogni lista porta la sua spiegazione**: il mondo, la descrizione, l'attivazione, la mediana dei voti, i
  semi che l'hanno accesa. È la parte «spiegata» della decisione 3 — e sta **a livello di lista**, che è dove
  il motore ce l'ha davvero.
- **ogni titolo porta il punteggio**: senza, il prodotto non può fondere due liste rispettando l'ordine — ed
  è l'errore misurato del 16/10/2026 (*«tre bolle concatenate»*: le prime dieci posizioni erano tutte del
  primo vicino).
- **niente `perché` per titolo**: il motore non sa, per ogni titolo, da quale seme è arrivato — non lo
  calcola oggi. Se servirà, è una capacità nuova del motore, non un campo che si finge di avere (§9).

## 5. Versioni

`versioni.artefatto` e `versioni.ricetta` arrivano da `graph` (`P.impronta()`): il prodotto li **registra** e
non li interpreta. `contratto: 1` è la versione di *questo documento*: cambia quando cambia la forma, non
quando cambia il contenuto di una lista.

Il prodotto **non cabla nessun numero** del motore: i parametri viaggiano nell'artefatto (lezione del modulo).

## 6. Errori e degrado

**Regola**: il caso normale non è mai un errore. Il motore risponde `200` con `liste` **e** `motivi`; gli
stati HTTP non-200 sono riservati ai guasti veri (processo giù, richiesta malformata).

| caso | risposta | motore | prodotto |
|---|---|---|---|
| storia fuori dal canone | `200`, `liste: []`, `motivi: ["storia fuori dal canone"]` | — | la riga non compare; il resto del feed continua |
| una lista senza materiale | `200`, quella lista assente, il motivo in `motivi` | es. `uscite_nuove: dati anno mancanti` | mostra le altre |
| artefatto assente o non caricato | `503` | il processo è su ma non ha il grafo | nessuna riga del motore; log |
| processo non in piedi | connessione rifiutata | — | nessuna riga del motore; log |
| richiesta incomprensibile | `400` | — | è un guasto del prodotto: allarme |

**Tetto di tempo**: il prodotto aspetta **10 s** al cache-build. Oltre, la riga del motore non compare e il
resto del feed si costruisce lo stesso. Il motore non ha bisogno di un timeout proprio: il suo costo è il
**caricamento** (~20 s, una volta, all'avvio del processo — `graph/motore.py:60`), non la risposta.

**Il ripiego popolare è escluso**: se la storia non è nel canone, il motore **non** risponde coi titoli
popolari. Il motivo è già scritto nel prodotto: il fallback popolare *«mostra di nuovo il catalogo generico,
cioè esattamente il sintomo che si stava cercando di togliere»*.

## 7. Le due liste derivate

`uscite_nuove` e `nicchia_di_qualita` **le riempie il motore** coi suoi dati (`ANNO`, `POP`, `VAVE`,
`LISTDEG` — `graph/motore.py:283-297`) e le marca `parziale: true`: il prodotto può rifinirle col proprio
catalogo, che è più fresco (anni, popolarità e voti del prodotto stanno in DuckDB). Il prodotto che le ignora
non sbaglia: sono liste complete dal punto di vista del motore.

**Conseguenza**: il `da_comporre: true` del ponte JS attuale (`src/api/bolle.js`) — che esisteva perché il JS
non ha anni né popolarità — **sparisce con il ponte**.

## 8. Cosa NON è nel contratto

- poster, titoli, anni, durata, lingua, badge ita: composizione del prodotto;
- popolarità, voto medio, filtri per genere/keyword: catalogo del prodotto;
- dedup con la libreria e con il già visto: il motore ha già escluso i **visti/amati** (la libreria è
  intenzione, non visione — `graph/motore.py:254`), il resto è del prodotto;
- **anime**: il modulo Python non ha la tabella anime (una occorrenza in `collocator.py`, zero nel ponte).
  Il prodotto ce l'ha (`animeMappingStore`, `animeAiringState`, `catalogKind`, provider): l'annotazione resta
  sua. Se un giorno il motore userà l'anime come segnale, il campo entra **in ingresso** sui semi — non in
  uscita, perché il prodotto sa già quali dei suoi titoli sono anime;
- i nomi delle righe (`yaca_mondi_series`, …): vivono in `src/catalog/registry.js` e in altri nove posti, e
  sono del prodotto.

## 9. Punti aperti (dichiarati, non nascosti)

1. **I default degli slider per profilo**: il contratto li accetta e non li sceglie. È il ticket 39 della
   mappa `suggerimenti` — dove `DELTA_FASCIA` è marcato **INVENTATO** in `graph/parametri.py` e va calibrato
   su `graph/measure/ricetta.py` **prima** di esporre la manopola.
2. **Il `perché` per titolo**: oggi non esiste nel motore. Se il prodotto lo vorrà (mostrare «perché questo
   titolo»), è una capacità da aggiungere al motore e una revisione di questo contratto — non un campo
   opzionale che ogni tanto c'è.
3. **Il trasporto e la sua autenticazione**: rete interna del compose (nessuna esposizione pubblica) è
   l'ipotesi; la fissa il ticket 07.
4. **`nicchia_di_qualita` è esente dal contratto di monotonia** (`graph/motore.py:299`): è ordinata per
   qualità, non per attivazione. Se il prodotto assume «ogni lista è ordinata per punteggio», sbaglia su
   quella — e il contratto lo dice qui invece di lasciarlo scoprire.

---

## Emendamenti — revisione esterna del 17/10/2026

Sei modifiche, ognuna **verificata sul codice** (non accettata sulla fiducia: la revisione esterna aveva visto
solo le prime sezioni del digest, e due suoi rilievi non reggevano — quelli sono in fondo, respinti).

### E1. Il peso del seme è un **numero**, non un'etichetta

`collectRealSeeds` non restituisce etichette: restituisce **pesi numerici** — `loved 3 / liked 2 / library 1.5`
e per i `watched` un **decadimento** `max(0.20, 0.5^(giorni/60))` (`catalogStrategies.js:902-1000`). Il motore
Python ha i suoi (`PESO_TIPO` in `parametri.py`, marcato **INVENTATO**). Se sul filo passa solo l'etichetta
`"watched"`, il prodotto butta via il decadimento e il motore riapplica i suoi pesi: **due verità sui pesi, e
quella misurata perde**.

```json
"semi": [ { "tmdbId": 655, "medium": "series", "tipo": "watched", "peso": 0.42 } ]
```

`peso` è **opzionale**: se c'è, il motore lo usa; se manca, usa il default di `PESO_TIPO[tipo]`.

### E2. `"catalogo"` è un tipo di seme (il freddo)

La decisione 3c della mappa `suggerimenti` è verificata: **freddo = sotto i 3 titoli**, e lì i semi vengono dai
**cataloghi attivi** del profilo (`UserConfig.catalogs`) — e quei titoli *«non vanno mai restituiti fra i
suggerimenti»*. Col vocabolario attuale non si può esprimere: `"library"` **è** restituito
(`graph/motore.py:254`), `"watched"` mentirebbe e accenderebbe `da_catalogo: false`.

Aggiunto `"catalogo"` ai tipi ammessi: **semina la diffusione, non compare fra i titoli suggeriti, e accende
`semi.da_catalogo: true`**. Chi materializza i semi dai cataloghi è il **prodotto** (ha `UserConfig` e DuckDB).

### E3. `GET /health` porta le versioni — ed è la chiave che chiude il ticket 09

Il ticket 09 chiede: *«si pubblica un artefatto nuovo e il prodotto serve le righe nuove senza che nessuno
tocchi il prodotto»*. Ma la risposta alle versioni sta **dentro** il `POST` (`versioni.artefatto`,
`versioni.ricetta`), e il prodotto non lo chiama finché la cache non scade: **non saprebbe mai che l'artefatto
è cambiato**. Il contratto aggiunge quindi:

```json
GET /health  →  { "ok": true, "contratto": 1, "versioni": { "artefatto": "…", "ricetta": "…" } }
```

in meno di 1 ms (non tocca il grafo: risponde dal processo), usato **anche** come `healthcheck` del compose
— così non si manda traffico nei ~20 s di caricamento. Il prodotto legge `versioni` da lì (cache in RAM 60 s) e
la concatena alla propria chiave di cache insieme alle opzioni: **quando l'artefatto o un parametro cambia, la
cache del prodotto scatta da sola**, e `HERO_CACHE_KEY_VERSION` torna a essere solo quello che è: la versione
della *forma* della struttura memorizzata.

### E4. `medium` è **opzionale**

Verificato: `Motore.lista()` (`graph/motore.py:231`) **non ha il medium** — la diffusione è una sola, e il
filtro per medium è del prodotto (nella riga). Obbligare `medium` in ingresso costringerebbe il prodotto a due
`POST` identiche per costruire film *e* serie, cioè a pagare **due volte** la camminata (115 ms su 1,52M di
archi) per lo stesso risultato. Quindi: `medium` opzionale; se manca, il motore restituisce le liste coi titoli
di entrambi i medium, **ognuno col suo `medium` sul titolo**.

### E5. Un guasto transitorio **non si memorizza** (il numero vero è peggiore di quello che sembrava)

Il ticket 08 diceva: motore giù → la riga non compare, il resto del feed continua. Vero — **ma il pool si
memorizza**. Verificato: la cache delle raccomandazioni ha TTL **7 giorni** (`src/config.js:39`,
`RECOMMENDATIONS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000`). Quindi un `503`/timeout nei ~20 s di caricamento
del motore — cioè subito dopo un riavvio di watchtower — lascerebbe le righe del grafo **vuote per una
settimana**, senza un errore da nessuna parte.

Regola: se la chiamata al motore **fallisce** (503, timeout, connessione rifiutata), le chiavi del grafo
**non si memorizzano** (o si memorizzano con TTL 60 s): si ricostruisce alla prossima richiesta. Un pool
parziale è una risposta legittima, una cache di 7 giorni su un guasto transitorio no.

### E6. Nel pool non entrano stringhe (la lezione del ticket 38)

Qualunque forma abbia l'adattatore, l'invariante è uno: **gli item che entrano nei pool sono oggetti con
`id`, `tmdbId`, `type` e `media_type` coerenti**. Le stringhe scalari `'tmdb:655'` nascondono il medium, e in
TMDB gli id numerici di `movie` e `tv` sono **due spazi che si sovrascrivono sullo stesso intero**: senza il
medium, l'idratazione sceglie la tabella sbagliata e il filtro a valle butta via il resto. Questo emendamento
lega il ticket 38 al 08 e al 12: è la stessa riga di codice.

### I due rilievi respinti (respinti coi fatti)

1. **«Il client calcola i vettori VSM e li rispedisce»** — *falso oggi*: `syncVectors` è **definito** in
   `frontend/src/lib/api.ts:151` e **nessun componente lo chiama** (`grep -rn syncVectors frontend/src` → una
   sola riga, la definizione). Il client *legge* `compiledVectors` dallo stato per disegnare il pannello DNA.
   Il che è una notizia migliore: `raw-data`, `sync-vectors` e `batch-details` sono **rotte senza chiamanti**, e
   quindi candidate a morire invece che a essere riportate (verifica del ticket 10, col conteggio).
2. **«TTL 12 ore»** — no: **7 giorni** (`src/config.js:39`). Il problema è più grave di come lo descriveva, e
   l'emendamento E5 lo tratta col numero giusto.
