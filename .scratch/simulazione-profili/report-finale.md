# Report finale — Simulazione profili YACA

**Data:** 2026-09-24 · **Commit verificato in produzione:** `127fe44` (deployato su `mate` via GHCR + Watchtower) · **Test:** 74 suite / 509 test verdi.

## 1. Obiettivo
Verificare YACA come la userebbe un utente vero: 8 profili simulati (4 realistici + 4 diagnostici), revisione **manuale item-per-item** dei primi 40 risultati di ogni catalogo, hero perfetti e disgiunti, tutti i 160 preset coperti, punti di rottura chiusi, kidsMode verificato, repo pulito, harness riutilizzabile, verifica finale in produzione.

## 2. Metodo
- Mappa e **28 ticket** in `.scratch/simulazione-profili/` (wayfinder: ricerca → decisioni → revisione → fix → verifica).
- Regola fissa: **bug → fix diretto; cambio di comportamento visibile → decisione dell'utente** (4 decisioni prese così: dedup cross-hero, pagine corte, HBO per produzione, gate `murder`).
- Harness `scripts/qa/simulate.js` (`profiles|fetch|review|compare|teardown`), 8 profili di test con DNA reali clonati, dati `sim_*` separati dal profilo reale `REOZrGNRr3` (mai toccato).
- Ogni affermazione chiave verificata dall'orchestratore (controprova su TMDB, sul codice, sui test): le misure degli agenti non sono mai state prese per buone.
- Un writer per checkout: i 35 fix di preset sono passati da **worktree isolati** con merge sequenziali e conflitti risolti a mano.

## 3. Revisione manuale (la base di tutto)
| Ambito | Copertura | Verdetti |
|---|---|---|
| **Hero** | 8 profili, 1.852 item | P 1.290 · B 258 · N 304 |
| **Preset** | **160/160**, 5.987 occorrenze | P 5.052 · B 337 · N 598 (**9,99% N**) → 98 ok · 35 tuning · 27 rotti |
| **Utility/custom** | watchlist, ricerca std/AI, 7 Matchmaker, `yaca-profiles`, casi limite | 17 artefatti + 11 finding |

74 documenti di revisione in `reviews/` (8 hero, 22 batch preset, sintesi consolidata, verifica dataset completo, utility, fix).

## 4. Bilancio dei fix
- **120 commit**, 111 file, **+7.402 / −2.429** righe, **15 nuovi file di test**.
- **73 preset distinti** corretti (su 160).
- **68 run** dell'harness, **74 report**.

Bug e difetti chiusi (per gravità):
1. **kidsMode mai attivo** — letto da un campo inesistente (`TasteProfile.settings`), filtro sempre spento. Ora enforced ovunque con cache isolata `_kids`/`configVersion`; 0 leak verificati.
2. **Cache hero `heroes_v1` non validava l'overlap** — gli hero potevano condividere item (fino a 54/120 a freddo). Ora schema 4 con validazione pairwise: **overlap 0 su tutti gli 8 profili**, verificato in produzione.
3. **Paginazione assente** — i preset restituivano ~100 item e la seconda pagina ripeteva la prima (146/160 preset). Ora **20 item/pagina** con offset reale e tie-breaker `id ASC`; **−77%** sui tempi della prima pagina; pagine sovrapposte **0** in produzione.
4. **ID TMDB sbagliati** — Scorsese puntava a Cronenberg, Fincher a Donnie Yen, Denzel a Liv Tyler; decine di keyword errate (Mostri Giganti usava `knight`; Neo-Noir usava `Christmas`; zombie usava `dystopia`) con **404** sparsi. Tutti verificati e sostituiti: la quota N dei preset corretti è passata da 22-92% a 0-15%.
5. **Leak contenuti adulti nella watchlist kids** — filtro fail-open sugli item senza metadati (*Fight Club* passava). Ora fail-closed + arricchimento dai parquet.
6. **Ricerca inutilizzabile** — il titolo esatto era il #2, una stringa senza senso restituiva 48 film. Ora titolo esatto **#1**, gibberish **0**, e il fallback AI è dichiarato invece di fingere.
7. **Matchmaker troncato a 10 query** — 64 fonti disponibili scartate in silenzio, seconda pagina vuota. Ora **124/124 fonti** con pagine piene.
8. **Cambio profilo da Stremio sempre HTTP 500** — funzione **rimossa** su decisione utente (manifest, route, stream, asset, test).
9. **Anno delle serie sbagliato** (ultima stagione invece della prima), **badge del simulcast** mancanti per ID Kitsu stagionali, **`_isAnime`** incoerente (presente sul 45%, con default opposti tra catalogo e dettaglio) — tutti corretti con default unico documentato.
10. **1.124 righe duplicate nel dump di produzione** — dedup aggiunta alla conversione: sparite da sole al primo aggiornamento post-deploy (97.375 righe, 0 duplicati).
11. **HBO & Max** riportato alla promessa reale: **per produzione** (società HBO/HBO Max, network HBO+Max), niente regione né backfill.
12. **`preset_oscar_winners`** rinominato **"Acclamati dalla Critica"**: TMDB non espone i premi, quindi la promessa è stata allineata al criterio reale anziché inventare dati.

## 5. Verifica finale in produzione (post-deploy)
Run `post-deploy` contro `https://mate.taild24589.ts.net`, codice `127fe44`:

| Metrica | Prima | Dopo |
|---|---|---|
| Cataloghi / item | 260 / 27.929 | 252 / **6.581** (pagine corrette) |
| Pagine sovrapposte | 146/160 preset | **0** |
| Overlap hero (8 profili) | fino a 54/120 | **0** |
| Duplicati intra-pagina | diversi | **0** (la coppia ITA/原始 è voluta) |
| kidаMode (profilo Famiglia) | leak | **0** leak di generi adulti |
| Ricerca titolo esatto | #2 | **#1** (`Spider-Man`, `Pulp Fiction`) |
| Ricerca descrittiva / gibberish | 12 serie / 48 film fuori tema | **0 / 0** |
| Tempi preset | ~930 ms | **275 ms** medi (p90 384 ms) |
| Tempi hero | — | mediana **1.395 ms**, p90 5.318 ms |
| Vuoti/semi-vuoti | — | 35 vuoti e 21 corti, **tutti** ricerca senza query o watchlist sintetica: **0 cataloghi reali sotto i 10 item** |

Nota: il calo degli item totali (27.929 → 6.581) è **atteso e voluto** — prima ogni richiesta restituiva ~100 item per pagina, ora 20.

## 6. Limiti noti e cose aperte
- **Hero p90 5,3 s** a cache fredda (mediana 1,4 s): accettabile ma migliorabile; misurato su container con limite 1,5 GB.
- **Follow-up minori** tracciati nel ticket `27`: U-08 (8 fonti custom assenti dal dump), U-09 (ordinamento freddo vs `V_final:{}`), test dedicato per i seed di rete (H-11).
- **Test di rete**: i profili di test non hanno cronologia/Trakt reali, quindi il grafo dei seed è limitato ai `dnaSeeds`; sul profilo reale esiste.
- **Igiene repo**: il remote `hf` contiene un **token in chiaro** in `.git/config` (solo locale) — da ruotare o rimuovere; tre cartelle di vecchi worktree restano bloccate da handle Windows (rimovibili dopo un riavvio).
- **Dati di test**: gli 8 profili `sim_*` sono **ancora presenti** in produzione (utili per rilanciare l'harness). Si cancellano con `node scripts/qa/simulate.js teardown`; il profilo reale non viene toccato.

---

# Aggiornamento (post-deploy serale) — `main` = `a5a0e45`

Dopo la prima verifica in produzione sono emersi altri tre difetti, segnalati dall'utente e chiusi lo stesso giorno:

| # | Problema | Causa dimostrata | Fix | Verifica in produzione |
|---|---|---|---|---|
| 1 | **Ricerca AI inutilizzabile** (0 risultati) | Il modello `mistral-small-latest` è hardcoded in `src/ai/router.js` e sul piano Mistral ha `limit-req-minute = 0` → **429 a ogni chiamata**, fallback su parametri base → zero risultati | modello configurabile (`MISTRAL_MODEL`, default `open-mistral-nemo`); chiave aggiornata anche in `/srv/yaca/.env` | ricerca risponde in ~2 s con 20 risultati |
| 2 | **La ricerca AI ignorava i filtri** (query diverse → stessi 20 titoli) | L'AI produce `genre_ids`/`keyword`(nomi)/`original_language`/`year_from`/`people_list`, il motore DuckDB legge `with_genres`/`with_keywords`(id numerici)/date/`with_cast`: nessuna chiave combaciava → la query diventava "tutto" | nuovo `AiQueryNormalizer.js`: mappatura completa + risoluzione nomi→id via TMDB con cache RAM (256 voci, TTL 6h), nomi non risolti scartati e loggati, degrado dichiarato; `F.actor` variadico | *supereroi* → Il cavaliere oscuro, Logan, Avengers; *thriller coreani* → Time to Hunt, Peninsula; *anime romantici* → Ranma ½, Monogatari. Cataloghi distinti e on-theme |
| 3 | **I filtri Solo Anime/No Anime non si vedevano in Stremio** | Due concause: (a) **i profili reali hanno `settings.typeSelectors` vuoti** (`anime: null`), quindi non c'è nulla da filtrare; (b) la `configVersion` nella URL del manifest **non veniva mai incrementata** → Stremio teneva il manifest in cache e la lista cataloghi non si aggiornava | ticket 30: impronta SHA-256 del manifest, **bump della `configVersion`** solo quando cambia davvero qualcosa (profili/cataloghi/selettori/kidsMode/custom/profilo attivo) + resync dell'addon su Stremio con la URL nuova; retrocompatibilità mantenuta | verificato in locale su config usa-e-getta: versione invariata al resave, cambiata su `anime=exclude` e su cambio profilo; liste cataloghi allineate |

Nota sul punto 3: il filtro **funziona** quando i selettori sono impostati — verificato in produzione (Otaku con `anime='only'` → 19 cataloghi anime; No Anime → solo la watchlist anime, sempre visibile per design; 0 item anime nei contenuti). I profili reali vanno configurati dal configuratore (ProfileManager → "Solo Anime"/"No Anime" → Salva); da oggi il salvataggio si propaga a Stremio da solo.

**Stato finale**: `main` = `a5a0e45`, **77 suite / 532 test verdi**, 3 deploy eseguiti, verifica di non-regressione post-deploy (overlap hero 0 su tutti i profili, pagine 20, AI search funzionante).

---

# Seconda tornata (segnalazioni dirette dell'utente)

## 1. I tag "Solo Anime"/"No Anime" non avevano effetto — RISOLTO
Causa radice: **il campo non lasciava mai il browser.** `frontend/src/lib/utils.ts` → `profilesToApiPayload()` costruiva l'oggetto `settings` per `/api/configure` **senza `typeSelectors`**, e `mapBackendProfile()` non lo rileggeva. Il backend era sano (`profileProcessor.js` accetta tutto, `isCatalogConformant()` filtra correttamente), ma con campo assente nessun vincolo viene applicato. Spiegato così anche il perché i profili reali avessero `typeSelectors` vuoti.

Fix: `sanitizeTypeSelectors()` + inclusione nei due sensi (payload e rilettura), tipi, default nei profili iniziali, test di regressione (`tests/typeSelectorsPayload.test.js`, 15 test) + verifica end-to-end indipendente.

| Stato dei selettori | Cataloghi nel manifest |
|---|---|
| Nessun tag (payload di prima) | 13 |
| **Solo Anime** | **9** (−4: hero film/serie, popolari film/serie) |
| **No Anime** | **11** (−2: Ghibli, popolari anime) |

I cataloghi non conformi sono **assenti dal manifest** (nessuna riga vuota in Stremio); la guardia a 0 item vale solo per richieste HTTP dirette.

## 2. Pagina DNA & AI LAB: voci con numeri invece dei nomi — RISOLTO
Causa: `src/api/configure/profileProcessor.js` costruiva l'etichetta come `"<tipo> <id>"` e risolveva il nome vero **solo per i generi**. Fix: nuovo `src/utils/tmdbNameResolver.js` (batch da 20, budget 1,5 s, cache Redis+LRU, fallback leggibile `Network #49`, keyword ritirate scartate), applicato a tutti i tipi; il vecchio codice risolveva le keyword solo se il profilo aveva una chiave TMDB propria (i profili reali non ce l'hanno → nessuna risoluzione).

Dry-run sul profilo reale: **70 voci esaminate, 8 etichette placeholder, 8 risolte** (`network 49`→HBO, `company 41077`→A24, `company 10342`→Studio Ghibli, `network 3186`→HBO Max, `network 453`→Hulu, `company 3172`→Blumhouse Productions). Script idempotente: `node scripts/repair-dna-names.js --uuid <uuid>` (`--apply` per scrivere). I filtri usano `type`+`id`, quindi nessun impatto sui cataloghi.

## 3. Pagina DNA & AI LAB: grafico poco leggibile — RIFATTO
`OrbitalDnaGraph` (pill su un'orbita) sostituito da `DnaBarChart`: barre orizzontali **raggruppate per categoria** (generi, keyword, persone, case di produzione, network), ordinate per peso, con percentuale (la voce più forte = 100%), layout responsive (1 colonna su mobile, 2 per le categorie corte), nomi troncati con tooltip, etichette sempre leggibili (`Keyword #210024`, mai `keyword:210024`). Nessuna dipendenza nuova.

## 4. Libreria Utente: import duplicato e copertine — RISOLTO (dati da ripulire post-deploy)
Diagnosi sui dati reali: **368 item, di cui 169 senza `itemId`** (documenti legacy) → l'upsert del sync (`filter: {addonUuid, itemId}`) non li trova e **crea un secondo documento**: **70 titoli duplicati**. L'indice unico `{addonUuid, itemId}` dichiarato nel codice **non esisteva** in produzione (c'è `{addonUuid, _id}`) e non poteva nascere finché c'erano `itemId` nulli duplicati.

Fix: `deduplicateUserLibrary()` (riconcilia i documenti legacy assegnando `itemId = _id`, tiene il più ricco) eseguita prima di ogni sync/conversione; `ensureIndexesSafe()` all'avvio; dedup difensiva in `GET /:id/library` e nella griglia; riempimento copertine mancanti via parquet locale (nuovo `src/utils/posterResolver.js`); **`preserveExistingPosters()`**: un sync che non risolve la copertina non la cancella più (prima poteva azzerarla).

Copertine: 367/368 presenti, tutti i 12 host raggiungibili anche con `Referer` (non è hotlink), l'API della griglia restituisce 74 item attivi con 0 copertine mancanti e gli URL scaricano immagini reali. Likely causa del placeholder visto dall'utente: il payload della libreria Stremio non sempre porta la copertina → ora viene risolta al momento del sync.

## 5. Impostazioni: rimozione sezioni — FATTO
Rimosse "Chiavi API (Opzionali)" (conteneva anche la configurazione EasyRatingsDB) e "Backup & Import"; ripuliti props, stato, handler e import morti; backend intatto.

## 6. Creatore: rimozione Kitsu + tag "solo anime" — FATTO
`provider: 'tmdb' | 'kitsu'` → solo `tmdb`; rimosse la UI e le categorie Kitsu, il target `kitsu` dai prompt/validazione AI (un eventuale `target: 'kitsu'` degrada a `tmdb`), retrocompatibilità garantita da `sanitizeCustomCatalog(s)` (normalizza `provider: 'kitsu'` → `'tmdb'` in cataloghi, filtri e query). Kitsu resta solo come **formato di ID** degli item anime (idPrefixes, `animeIdMode`, formatter): non è più una sorgente selezionabile.

**Stato**: `main` con tutti i mergi sopra, build frontend verde, **83 suite / 581 test verdi**.

---

# Deploy e manutenzione dati (25 settembre)

**Deploy eseguiti**: 2 (il server `mate` era rimasto offline ~4 ore con Watchtower morto in uscita 255; al rientro: immagini GHCR `sha256:678b1926` da `53a982e` e poi `d4e06d71` da `5ac2ee8`).

**Verifica end-to-end in produzione** (dopo il secondo deploy):
| Controllo | Esito |
|---|---|
| health | 200 |
| manifest reale | 22 cataloghi |
| catalogo preset (Nolan) | 14 item, primo "Il cavaliere oscuro", copertina servita dal proxy con URL valido |
| anteprima "solo anime" (`isAnime: true`) | **20 risultati tutti anime** (Demon Slayer, Il castello errante di Howl, La città incantata, Look Back) |
| anteprima senza tag | 20 titoli non anime (Spider-Man, Resident Evil…) |
| ricerca AI in Stremio | 9 risultati on-theme (Time to Hunt, Concrete Utopia…) |
| libreria via API | 74 item attivi, **0 duplicati**, **0 senza copertina** |
| frontend servito | i chunk JS contengono le novità: `Solo anime`, `CASE DI PRODUZIONE` (grafico DNA), `typeSelectors` |
| log di avvio | nessun avviso sull'indice: `{addonUuid, itemId}` ora esiste |

## Pulizia dati libreria (eseguita sulla libreria reale, con backup)
Composizione trovata: **199 documenti moderni** (`_id` ObjectId + `itemId`) e **168 legacy** (`_id` **stringa**, `itemId` assente) → **168 chiavi duplicate** (70 con il documento ancora attivo: i duplicati visibili).

Causa per cui la deduplica *sembrava* funzionare ma non cambiava nulla: **lo schema mongoose non dichiara `_id`** (quindi lo assume ObjectId) mentre i documenti legacy hanno `_id` stringa: le scritture via modello (`item.save()`, `deleteMany({_id: {$in: [...]}})`) **non toccavano quei documenti, senza errori**. Corretto usando la collection grezza (`Model.collection`) e documentato nel test.

Risultato: **367 → 199 documenti**, 168 duplicati eliminati, 72 `itemId` assegnati, **0 `itemId` mancanti, 0 chiavi doppie**, **indice unico `{addonUuid, itemId}` creato** (era la protezione che mancava). Backup completi in `.cache/backups/`. Migliorata anche la politica di consolidamento: ora `removed` ha la priorità (prima si rischiava di tenere un documento rimosso ed eliminare quello attivo — verificato con test: 0 casi).

## Riparazione etichette DNA (eseguita sul config reale)
`node scripts/repair-dna-names.js --uuid <uuid> --apply` → **8 etichette placeholder risolte** (HBO, HBO Max, Hulu, A24, Studio Ghibli, Blumhouse Productions), 62 voci già corrette, 0 scartate.

**Stato finale**: `main` = `origin/main` = `5ac2ee8`, suite **84/84 verdi (591 test + 9 saltati)**, produzione aggiornata e verificata.
