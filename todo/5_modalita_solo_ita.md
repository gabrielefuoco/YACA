# Obiettivo: la colonna `ita` a tre stati e la modalità "solo ITA"

Idea dell'umano (01/10/2026), registrata qui perché è una decisione presa ma il consumatore che la giustifica
non esiste ancora. Contesto completo: mappa `.scratch/doppiaggio-ita/map.md`.

## La decisione

La colonna ITA sul catalogo **non è un booleano: ha tre stati**, e sono i due consumatori a leggerla
diversamente.

| valore | significato | badge sul poster | filtro "solo ITA" |
|---|---|---|---|
| `true` | una scheda di Antonio Genna identifica **questa opera** senza ambiguità (titolo unico · anno esatto · zona) | **mostra ITA** | include |
| `null` | **indecisione**: l'opera è candidata di una scheda AG omonima che non si riesce ad attribuire | **niente badge** | **include** |
| `false` | nessuna scheda AG tocca questo record | niente badge | esclude |

- **Badge**: legge solo `true`. I `null` non producono badge → il badge non mostra mai un'ambiguità.
- **Filtro "solo ITA"**: legge `true` **e** `null` → meglio includere un dubbio che perdere un titolo
  doppiato. Il filtro è uno strumento di ricerca: un titolo in più si perdona, un titolo doppiato che
  sparisce no.

**Perché è meglio di una soglia parametrizzata**: con una sola colonna e l'interpretazione spostata al
consumatore non servono due calcoli né due file di annotazioni, e la scelta "includere o no i dubbi" resta
**dove appartiene** — nel consumatore, non nel dato. Nessun campo di confidenza: il terzo stato non è
"quanto sono sicuro", è "non lo so".

**Attenzione, cambia una decisione precedente**: prima si era detto "titolo non trovato in AG → `null`"
(perché nulla vieta un doppiaggio futuro). Con questa semantica **il non trovato è `false`** e il `null` è
riservato all'indecisione da omonimia.

## I numeri (misurati, `ricerche/classi-db.json`, `tools/classi-db.js`)

| stato | record del catalogo (116.964) | |
|---|---|---|
| `true` | **16.946** | 14,5% |
| `null` | **3.204** | 2,7% |
| `false` | **96.814** | 82,8% |
| **dimensione del filtro `true`+`null`** | **20.150** | **17,2% del catalogo** |

- I `null` vengono da **1.375 schede AG indecise** (omonimi senza anno e senza zona risolutiva): una scheda
  indecisa rende `null` **tutti** i suoi candidati. È il prezzo dichiarato della scelta.
- Le schede AG risolte: 15.424 da titolo unico, 804 da anno, 909 da zona. 6.658 schede non hanno alcun
  candidato nel DB.
- Con le leve misurate sotto (articolo inglese + fuzzy stretto), `true` sale da 16.946 a **~19.300 (+14%)** e
  il filtro si allarga di conseguenza — **senza una sola pagina di scraping in più**.

## Il buco da chiudere prima di credere al filtro

**`false` NON significa "non doppiato".** Significa "nessuna traccia AG *con quel titolo*". Misurato (ticket
03, campione C): **6 schede AG su 10 senza candidato hanno l'opera nel nostro DB sotto un altro titolo
italiano** — `007 - Thunderball, operazione tuono` ↔ *Agente 007 - Thunderball - Operazione tuono*;
`Segreti di Marrowbone (I)` ↔ *Marrowbone*; `Big City` ↔ *Big city - Dove i bambini fanno la legge*. Quei
record oggi finiscono in `false`, e il filtro li **perderebbe** — cioè perderebbe titoli che sappiamo
doppiati.

Non è un'opera mancante: è una **divergenza di localizzazione**. Misurato il 01/10 sulle 6.658 schede senza
candidato (`tools/recupero-unmatched.js`):

| leva | recuperate | note |
|---|---|---|
| **articolo inglese** `(The)`/`(A)`/`(An)` nell'inversione | **1.209 (18,2%)** | era un **bug** del matcher: gestiva solo `Il/La/Lo/…`. Zero rischio |
| **fuzzy stretto** (contenimento di token; se il token in comune è uno solo, deve essere raro) | **1.734 (26,0%)** | di cui **1.172 con un solo candidato** → `true`; 562 ambigue → `null` |
| *fuzzy largo, per confronto* | *2.808 (42,2%)* | **scartato**: fabbrica falsi positivi (`6 Teen` → *Teen Wolf*, *Teen Titans Go!*; `My Sweet Lie`, opera assente, agganciata a un record) |
| **ricerca TMDB + titoli alternativi** | **~6%** | vedi sotto: **non** è la cura del buco |

## I titoli alternativi di TMDB: ci sono, ma non chiudono il buco

**Il nostro dump non li contiene**: `master_*.jsonl` ha 35 campi e fra questi **non** c'è `alternative_titles`
(solo `title` e `original_title`). **L'API di TMDB però li ha** (`/{type}/{id}/alternative_titles`, anche come
`append_to_response`) e la chiave è in `.env`.

Testato il 01/10 su **50 schede scoperte** (già oltre articolo + fuzzy stretto,
`tools/test-titoli-alternativi.js` + `tools/analisi-ricerca-tmdb.js`):

| esito | |
|---|---|
| la ricerca TMDB trova qualcosa | 34 / 50 (68%) |
| il **primo** risultato è nel nostro DB | 4 / 50 (8%) |
| **almeno un** risultato è nel nostro DB | 12 / 50 (24%) — di cui **5 su 12 ambigui** |
| il titolo di AG compare fra i **titoli alternativi** del record | 27 / 50 (54%) |
| **confermati** (nel DB **e** alternativo o anno) | **3 / 50 (6%)** |

*(Il primo campione, da 15 casi, diceva 27%: era ottimista. Il numero buono è questo.)*

**Lettura**: l'"almeno un risultato nel DB" **non è utilizzabile** — è una fabbrica di falsi positivi come il
fuzzy largo: `Triple Z` → *The Six Triple Eight*, `Safari Express` → *Africa Express*, `McCoy` → *Una bionda
tutta d'oro*. Con la conferma obbligatoria (titolo alternativo o anno) restano **~6%**: circa **220 schede**
sulle 3.700, non 1.000.

Quindi il residuo scoperto sono in gran parte **opere che nel nostro DB non ci sono**, non errori di
localizzazione da correggere: questa leva **non chiude il buco della copertura del badge**. Il suo valore vero
è **la ricerca** (54% dei titoli che non agganciamo sono nomi che un utente può digitare) — ed è per questo che
il lavoro è stato aperto come ticket a sé: *Colonna `alternative_titles` nel dump (e backfill progressivo)*,
con il vincolo che il dato vada in un **sidecar**, non nella tabella principale del catalogo.

## Cosa fare

- [x] **Articolo inglese** `(The)`/`(A)`/`(An)` nell'inversione: era un bug, misurato il 01/10 (+1.209 schede).
      Va nelle regole di parsing del modulo.
- [x] **Gradino fuzzy** sulle 6.658 schede senza candidato: lo **stretto** recupera 1.734 schede (1.172 con un
      solo candidato) **senza falsi positivi** sul campione verificato; il largo è scartato perché li produce.
- [x] **Titoli alternativi**: non sono nel dump, l'API li ha. Rendimento per il badge basso (~6%), valore vero
      nella **ricerca**.
- [x] **Fuori dalla mappa**: la colonna e il backfill sono stati spostati in
      [`7_colonna_titoli_alternativi.md`](7_colonna_titoli_alternativi.md) (decisione dell'umano: non è
      lavoro di questa mappa, il suo valore è la ricerca). Vincoli scritti lì: **sidecar** (non nella tabella
      principale) e backfill **a rate**.
- [x] **Todo separato per la ricerca**: `todo/6_ricerca_titoli_alternativi.md`.
- [ ] **Decidere se i `null` entrano tutti nel filtro o solo un sottoinsieme** (es. esclusi i gruppi dove il
      DB ha più opere di AG). Da decidere **con i numeri davanti**, non sulla carta.
- [ ] **Documentare la semantica**: nel file di annotazioni e in `docs/`, `false` = "nessuna traccia AG" (una
      politica), non "non doppiato" (un fatto). Senza questa riga, fra sei mesi qualcuno leggerà `false` come
      una verità.
- [ ] **Non implementare il filtro adesso**: è un consumatore, non un requisito. Prima il badge (`true`) deve
      essere vivo e verificato — mappa `doppiaggio-ita`, ticket *Verifica di fine mappa*.
- [ ] **Quando esisterà**: decidere dove vive (preset? etichetta nell'edizione del profilo? ordinamento?) e
      come si mostra che un risultato è "probabile". Dipende dal ticket *Disegno della colonna `ita`*.

## Vincoli (già decisi)

- Nessun campo di confidenza nella colonna: solo `true` / `null` / `false`.
- Nessuna pagina di dettaglio AG scrapata: il match usa solo gli indici (79 pagine).
- Il match è **calcolo offline ricalcolabile**: cambiare le regole non costa una richiesta al sito.

## Riferimenti

- Mappa: `.scratch/doppiaggio-ita/map.md` (voce *L'ITA come filtro*).
- Ticket: *La scala di match* (le regole e i numeri), *Disegno della colonna `ita`*,
  *services/doppiaggi-source*.
- Altrove: `7_colonna_titoli_alternativi.md` (il dato), `6_ricerca_titoli_alternativi.md` (il consumatore).
- Dati: `.scratch/doppiaggio-ita/ricerche/classi-db.json`, `scala-di-match.md`, `gruppi-omonimi.json`,
  `recupero-unmatched.json`, `titoli-alternativi.json`.
