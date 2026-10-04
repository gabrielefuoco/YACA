> **Recuperato il 04/10/2026**: questo report era finito in un commit orfano (`f1392c2d`, 03/10/2026) mai mergiato su nessun ramo, quindi non lo poteva leggere nessuno. La sua risposta — *la data **è** il filtro della query: non si toglie, si liberano le chiavi* — è la stessa a cui siamo arrivati il 04/10 rifacendo la diagnosi da capo. Il costo di un commit orfano è esattamente questo: rifare il lavoro per non averlo potuto leggere.

# Ticket 47b — A cosa serve la data dentro la definizione dei preset

Worktree: `feat/t47b-data`. **Nessuna modifica al codice**: questo è solo un report.
Domanda: sette preset hanno la data di oggi dentro la propria definizione, quindi la chiave
della cache cambia ogni giorno. Prima di toglierla: **a cosa serve?**

Risposta breve: **serve alla query**. La data è un filtro di finestra temporale scorrevole,
finisce letteralmente nella `WHERE` SQL, e il risultato del catalogo cambia ogni giorno.
Non è un valore di comodo e non è ridondante.

---

## 1. I sette preset (e un ottavo, stagionale)

Tutte le date nascono in `src/data/presets.js`, dentro `getPresets()` (riga 44), calcolate
**a ogni chiamata** di `getPresets()`:

```js
// src/data/presets.js:44-58
const getPresets = () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];            // riga 46

    const dMovies = new Date();
    dMovies.setMonth(dMovies.getMonth() - 2);
    const twoMonthsAgoStr = ...                                     // riga 50  (-2 mesi)

    const dSeries = new Date();
    dSeries.setMonth(dSeries.getMonth() - 6);
    const sixMonthsAgoStr = ...                                     // riga 54  (-6 mesi)

    const dWeek = new Date();
    dWeek.setDate(dWeek.getDate() - 45);
    const recentEpisodesWindowStr = ...                             // riga 58  (-45 giorni)
```

| # | id preset | riga | nome | data usata |
|---|-----------|------|------|-----------|
| 1 | `preset_new_movies` | `src/data/presets.js:68` | 🆕 Film: Nuove Uscite | `todayStr` + `twoMonthsAgoStr` |
| 2 | `preset_new_series` | `src/data/presets.js:69` | 🆕 Serie TV: Novità | `todayStr` + `sixMonthsAgoStr` |
| 3 | `preset_new_series_eps` | `src/data/presets.js:70` | 🆕 Serie: Episodi Recenti | `todayStr` + `recentEpisodesWindowStr` |
| 4 | `preset_anime_shonen` | `src/data/presets.js:228` | 🔥 Anime: Battle Shōnen | `recent_since: sixMonthsAgoStr` |
| 5 | `preset_anime_shoujo` | `src/data/presets.js:230` | 🌸 Anime: Shōjo (Romantico) | `recent_since: sixMonthsAgoStr` |
| 6 | `preset_anime_mecha` | `src/data/presets.js:232` | 🤖 Anime: Mecha & Robot | `recent_since: sixMonthsAgoStr` |
| 7 | `preset_anime_isekai` | `src/data/presets.js:233` | 🌀 Anime: Isekai & Fantasy | `recent_since: sixMonthsAgoStr` |

**Ottavo caso, che la misura non ha contato** perché non cambia ogni giorno:

| 8 | `preset_top_current_year` | `src/data/presets.js:261` | Il meglio dell'anno | `primary_release_year: today.getFullYear()` |

Cambia una volta all'anno, non ogni giorno. Da tenere d'occhio se il calcolo del ticket 47
vuole essere completo.

---

## 2. Che forma ha la data, e chi la calcola

**Forma**: stringa assoluta `YYYY-MM-DD`, non un numero di giorni.

```js
today.toISOString().split('T')[0]   // → '2026-10-03'
```

**Chi la calcola**: **il preset la contiene già risolta**. `getPresets()` la calcola e la
incorpora come letterale nella definizione, sotto forma di chiavi filtro:

- preset 1-3: `primary_release_date.lte` / `.gte`, `first_air_date.lte` / `.gte`, `air_date.lte` / `.gte`
- preset 4-7: `permissive_recent: true` + `recent_since: <data>`

Un caso diverso: `preset_top_current_year` passa un **anno** (`2026`), non una data.

La soglia è dunque una **finestra scorrevole ancorata a oggi**: da -2 mesi a oggi (film),
da -6 mesi a oggi (serie), da -45 giorni a oggi (episodi).

---

## 3. Cosa cambia nel risultato fra ieri e oggi

La definizione non resta "la stessa cosa con un numero diverso": la data finisce nella
**WHERE SQL** che DuckDB esegue.

### I tre preset "nuove uscite" — `src/catalog/providers/DuckDbProvider.js:160-164`

```js
const dateCol = isTv ? '"first_air_date"' : '"release_date"';
const dateGte = q['primary_release_date.gte'] || q['first_air_date.gte'] || q['air_date.gte'];
const dateLte = q['primary_release_date.lte'] || q['first_air_date.lte'] || q['air_date.lte'];
if (dateGte) where.push(`${dateCol} >= '${dateGte}'`);
if (dateLte) where.push(`${dateCol} <= '${dateLte}'`);
```

Misura eseguita oggi (data simulata, nessun file toccato):

```
preset_new_movies        2026-10-02 → "release_date" >= '2026-08-02' AND "release_date" <= '2026-10-02'
                         2026-10-03 → "release_date" >= '2026-08-03' AND "release_date" <= '2026-10-03'
preset_new_series        2026-10-02 → "first_air_date" >= '2026-04-02' AND "first_air_date" <= '2026-10-02'
                         2026-10-03 → "first_air_date" >= '2026-04-03' AND "first_air_date" <= '2026-10-03'
preset_new_series_eps    2026-10-02 → "first_air_date" >= '2026-08-18' AND "first_air_date" <= '2026-10-02'
                         2026-10-03 → "first_air_date" >= '2026-08-19' AND "first_air_date" <= '2026-10-03'
```

**Cosa cambia, in concreto, ogni giorno**:
- il **pavimento** della finestra esce un titolo dal catalogo (il film uscito 62 giorni fa
  esce, entra quello uscito 59 giorni fa);
- il **soffitto** si sposta e ogni giorno ammette i titoli usciti proprio quel giorno.

Il risultato è diverso ogni giorno **per costruzione**: senza la data nella chiave, serviremo
ieri la finestra di ieri — cioè risultati stantii.

### I quattro preset anime — `src/data/filters.js:68-77`

```js
permissiveFloor: (standardFloor, recentDate, recentFloor = 0, isTv = false) => {
    const col = isTv ? '"first_air_date"' : '"release_date"';
    ...
    return `("vote_count" >= ${standardFloor} OR (${col} IS NOT NULL AND ${col} >= '${recentDate}'))`;
}
```

Misura:

```
preset_anime_shonen   2026-10-02 → ("vote_count" >= 50 OR ("first_air_date" IS NOT NULL AND "first_air_date" >= '2026-04-02'))
                      2026-10-03 → ("vote_count" >= 50 OR ("first_air_date" IS NOT NULL AND "first_air_date" >= '2026-04-03'))
```

Qui la data è una **sortella**: "con almeno 50 voti, oppure uscita nell'ultimo semestre,
anche se ha pochi voti". Anche questo cambia ogni giorno (le nuove uscite del genere entrano
nella parte "permissiva", le vecchie a basso punteggio ne escono).

### `preset_top_current_year`

`"release_date" BETWEEN '2026-01-01' AND '2026-12-31'`. Stabile per 365 giorni.

---

## 4. Cosa succede se la si toglie dalla definizione

Risposta verificata **leggendo ed eseguendo il codice**, senza modificarlo: ho rieseguito
`buildPresetFromFilters()` con le stesse query ma senza le chiavi di data.

```
== preset_new_movies   data 2026-10-03
   queries[0] SENZA date: {"strategy":"discovery","sort_by":"popularity.desc"}
   where generata SENZA date : (nessun filtro di data)
   where ORIGINALE           : "release_date" >= '2026-08-03' AND "release_date" <= '2026-10-03'

== preset_new_series_eps   data 2026-10-03
   where generata SENZA date : (nessun filtro di data)
   where ORIGINALE           : "first_air_date" >= '2026-08-19' AND "first_air_date" <= '2026-10-03'
```

**Il filtro sparisce del tutto.** `preset_new_movies` ("Film: Nuove Uscite") diventerebbe
"tutti i film ordinati per popolarità"; `preset_new_series_eps` ("Episodi Recenti")
diventerebbe "tutte le serie per popolarità". Non è una cache stantia: è **un catalogo diverso**.

**Un'eccezione, e conta** — i 4 preset anime:

```
== preset_anime_shonen   data 2026-10-03
   where generata SENZA recent_since : ("vote_count" >= 50 OR ("first_air_date" IS NOT NULL AND "first_air_date" >= '2026-04-03'))
   where ORIGINALE                   : ("vote_count" >= 50 OR ("first_air_date" IS NOT NULL AND "first_air_date" >= '2026-04-03'))
```

**Identiche.** Perché `DuckDbProvider.js:72-80` ricalcola da sé la data se manca:

```js
let recentDate = q.recent_since;
if (!recentDate) {
    const d = new Date();
    if (isTv) d.setMonth(d.getMonth() - 6); else d.setMonth(d.getMonth() - 2);
    recentDate = d.toISOString().split('T')[0];
}
```

Quindi `recent_since: sixMonthsAgoStr` è **ridondante lato `queries`**: il valore che
finisce davvero nella `where` è identico. Ma la definizione finale **resta uguale**,
perché la `where` contiene comunque la data. Anche togliendo `recent_since`, la chiave
cambierebbe ogni giorno lo stesso.

---

## 5. Perché è nella *chiave* della cache — la domanda che conta

### Il meccanismo

`src/handlers/catalogHandler.js:138-164`:

```js
/**
 * Chiave di cache della pagina di catalogo. Ci finisce tutto ciò che cambia il
 * risultato — e nient'altro.
 * ...
 * Al posto del vecchio `configVersion` c'è `catalogDef`: l'impronta canonica della
 * definizione di QUESTO catalogo (`where`, `orderBy`, `queries`, `isAnime`, provider…).
 */
function buildCatalogCacheKey({ ... }) {
    return generateRequestHash(id, {
        ...,
        catalogDef: canonicalCatalogDefinition(catalogMeta),
        badgeV: badgeVersion
    }, skip, type);
}
```

e `src/handlers/catalogHandler.js:445-447`:

```js
// Check Full CACHE Request. La chiave nasce DOPO la risoluzione del catalogo,
// perché la sua definizione è uno degli ingredienti.
const requestCacheKey = buildCatalogCacheKey({ ..., catalogMeta, ... });
```

`canonicalCatalogDefinition()` (righe 87-102) serializza **tutto** l'oggetto preset,
chiavi ordinate, senza eccezioni: `where`, `orderBy`, `queries`, e quindi anche le date.

### La risposta: le due cose insieme, e sono coerenti

- **Meccanismo = effetto collaterale.** Non esiste da nessuna parte un codice che "sa"
  che la data è un caso speciale. Nessun `if (hasDate) keyDate = today`. La data entra
  in chiave **perché si hasha la definizione intera**, e la definizione la contiene.
- **Conseguenza = voluta e corretta.** Ma il punto è che **la data è ciò che serve alla
  query**: è nella `WHERE`. Se la chiave non cambiasse, serviremo risultati sbagliati.
  La regola scritta nel modulo ("ci finisce tutto ciò che cambia il risultato — e nient'altro")
  impone che la chiave cambi.

Quindi **non si può "separare cosa serve alla query da cosa entra nella chiave"**, perché
per questi sette preset le due cose sono la stessa identica cosa: la data è la definizione
del catalogo. Non è un campo di comodo che si può escludere dall'hash.

**Prova che la chiave cambia ogni giorno per davvero** (misura, `canonicalCatalogDefinition`
presa dal sorgente e applicata ai preset reali con date simulate):

```
preset totali: 161
con definizione che cambia col tempo: 8   (i 7 + preset_top_current_year)
generazioni distinte di definizioni in 3 giorni consecutivi: 3
```

3 giorni → 3 chiavi diverse. Coerente con la misura del ticket 47.

---

## Conseguenza per il ticket 47

Il TTL di default è **14 giorni** (`src/config.js:27`: `CACHE_TTL_MS: 14 * 24 * 60 * 60 * 1000`;
idem `catalogRequestCache` in `src/cache/cacheInstances.js:37-41`).

Per questi sette preset quel TTL **non serve a nulla**: la chiave di oggi non esisterà mai
più, quindi l'entry di ieri non verrà *mai riletta*. Significa che ogni giorno:

- una chiave nuova viene scritta (cache miss → si ricalcola tutto → la misura del costo reale);
- l'entry di ieri resta in Redis **14 giorni occupando spazio, senza mai essere servita**.

Quindi il vero costo del ticket 47 non è "cache poco efficace": è **1 ricomputazione al giorno
per 7 cataloghi + 14 giorni di chiavi morte**. Il TTL di 14 giorni non è la strada da accorciare:
accorciarlo non cambierebbe nulla, perché quelle entry sono già irraggiungibili.

Se l'obiettivo è fermare la ricomputazione quotidiana, la strada non è togliere la data dalla
chiave (servirebbe risultati stantii: un "Film: Nuove Uscite" con la finestra congelata), ma:

1. **accorciare il TTL di questi sette** per liberare le chiavi morte (effetto sullo spazio, non sul calcolo);
2. oppure fare la query sulla finestra senza ancorarla a oggi — cioè cambiare il **senso** del
   catalogo, che è una decisione di prodotto, non un refactor.

---

## La lettura in tre righe

1. **Meccanismo = effetto collaterale, conseguenza = voluta e necessaria**: la data finisce
   nella chiave perché si hasha la definizione intera, non perché qualcolo l'ha messa lì per
   invalidare; ma non è un campo separabile, perché la data **è** il filtro della query.
2. **Toglierla cambierebbe il risultato**: per i 3 preset "nuove uscite" il filtro sparisce
   dalla `WHERE` e il catalogo diventa un altro; per i 4 anime la `where` resta identica
   (il codice la ricalcola da sé), quindi la chiave cambia comunque ogni giorno.
3. **Conseguenza per il 47**: il TTL di 14 giorni è già inefficace per questi sette (le chiavi
   di ieri non verranno mai rilesse, ma restano in Redis 14 giorni) → il problema è
   ricomputazione quotidiana + chiavi morte, non cache stantia; **non togliere la data**,
   ma liberare le chiavi e, se si vuole fermare il calcolo, ripensare la finestra.
