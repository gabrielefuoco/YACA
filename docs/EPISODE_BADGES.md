# Logica e Generazione dei Badge Episodi

In Stremio, i cataloghi generati da YACA offrono all'utente un'informazione visiva immediata sul progresso di una serie in corso attraverso i "Badge" posizionati agli angoli dei poster (Top-Right e Top-Left).

## Architettura dei Badge
La generazione dei badge avviene primariamente all'interno di `src/catalog/formatters/StremioFormatter.js`.

YACA applica due tipi principali di badge:
1. **Top-Left (Stagione / Lingua)**: Indica la stagione corrente della serie o la lingua del flusso audio (es. `S4`, `S2 - Pt2`, `ITA - S1`).
2. **Top-Right (Episodio corrente)**: Indica l'ultimo episodio andato in onda per la serie (es. `Ep 12`).

## Calcolo Dinamico dell'Ultimo Episodio Uscito

Il badge `Ep X` non si basa su dati statici o totali assoluti, ma viene calcolato in tempo reale sulla base degli episodi effettivamente rilasciati ("aired").

### Filtro Episodi "Aired"
La funzione esamina l'array `item.videos` e filtra gli episodi validi:
- Vengono **esclusi gli episodi "fantasma"** (ovvero episodi con titolo generico, senza descrizione e senza un vero thumbnail).
- Un episodio viene considerato "uscitò" se la sua `released` date è nel passato (`<= now`).
- Se `released` è `null` (ma l'episodio ha metadati reali validi), viene applicato un fallback che lo considera comunque uscito.

Una volta filtrati, l'algoritmo prende l'episodio con data di uscita più recente o con numero più alto. Da questo estrae `latest.season` e `latest.episode`.

## Differenze tra Serie TV Standard (TMDB) e Anime (Kitsu)

### Serie TV Standard
Per i contenuti TMDB, l'identificativo include la stagione (es. `S 2 Ep 12`). Questo è lineare perché TMDB categorizza univocamente le stagioni (Season 1, Season 2).

### Gestione Kitsu (Anime)
Kitsu presenta sfide particolari perché le stagioni successive sono spesso trattate come opere completamente separate (es. *Attack on Titan Season 2* ha un ID Kitsu separato rispetto alla Season 1). Inoltre, l'API Kitsu restituisce spesso una numerazione episodi che parte da `1` per ogni stagione o cour, ma senza specificare la data di uscita.

Le ottimizzazioni recenti per Kitsu includono:
- **Badge Indipendenti**: Se il contenuto è Kitsu, o la stagione è <= 1, il formato sarà sempre un contatore assoluto della singola opera `Ep X` invece di forzare `S X Ep Y`.
- **Prevenzione Fallback Fantasma**: Poiché gli episodi futuri su Kitsu non hanno spesso la data `airdate`, il mapper sincronizza le date esatte (`match.released`) da TMDB. In questo modo gli episodi che usciranno nel futuro verranno ignorati dal filtro `aired` del Formatter e il conteggio degli episodi mostrerà correttamente l'ultimo episodio effettivamente rilasciato ad oggi (es. "Ascendance of a Bookworm S4" mostrerà "Ep 12" al posto di tutti i 24 episodi futuri messi a catalogo).

## Badge per flussi Doppiati (ITA)

Il badge ITA dice una cosa sola: **questo titolo è doppiato in italiano**. La fonte è la colonna `ita` del
catalogo, alimentata dalle annotazioni de *Il Mondo dei Doppiatori* (`antoniogenna.net`) che produce il modulo
`services/doppiaggi-source` (mappa `.scratch/doppiaggio-ita`). Lo scanner torrent è stato **rimosso**: era un
booleano per base id, sondava solo la S1E1 e alimentava una collezione che nessuno leggeva più.

### I tre stati

| `ita` | significato | badge sul poster |
|---|---|---|
| `true` | doppiato: una scheda di AG identifica l'opera senza ambiguità | **`ITA`** |
| `null` | indecisione: c'è una scheda AG ma non si sa *quale* opera sia | niente badge |
| `false` | nessuna traccia di doppiaggio (o riga assente dal file) | niente badge |

Il `null` **non produce badge** — un'ambiguità non si mostra — ma esiste perché il futuro filtro "solo ITA"
lo **include**: meglio un dubbio in più che un doppiato in meno.

### Come arriva sulla card

Il badge si applica in `catalogHandler.applyPostCacheBadges` leggendo uno **snapshot in RAM** del file delle
annotazioni (`src/data/itaAnnotations.js`, TTL ~60s, ~1,6 MB), **non** la colonna del parquet: **21 cataloghi**
(9 Trakt, 8 hero, 3 watchlist, simulcast) non passano dal parquet e quella colonna non ce l'hanno. La colonna
resta per i filtri SQL.

La card va risolta in una chiave `(tipo, id)` — il tipo fa parte della chiave perché **5.933 id TMDB vivono in
entrambe le tabelle**:

- `tmdb:{id}` o `tmdb:{tipo}:{id}` → chiave diretta;
- `tt…` → ponte IMDb→TMDB **in batch** sul parquet (`duckDbStore.resolveImdbIds`: una query, nessuna chiamata API);
- `kitsu:…` → ponte dal mapping anime, o dallo stato anime (`doc.tmdbId`).

### Perché il poster va **ri-formattato** (ticket 15)

Il poster di una card viene scelto quando la card è formattata e messa in cache — cioè **prima** che le
annotazioni ITA siano lette. `applyPostCacheBadges` aggiunge `_itaBadge` dopo: se la card non viene
ri-formattata, il poster non viene ricalcolato e il badge resta un'etichetta che **nessuno disegna**.

```js
// ramo anime — ri-formatta sempre, se doppiato
if (sanitizeOptions.shouldApplyEpisodeBadge || animeDubbed) {
    processedMetas.push(sanitizeCatalogMeta(animeItem, sanitizeOptions));
}

// ramo non-anime — deve ri-formattare anche lui
if (dubbed || sanitizeOptions.shouldApplyEpisodeBadge) {
    processedMetas.push(sanitizeCatalogMeta(outItem, sanitizeOptions));
} else {
    processedMetas.push(outItem);
}
```

Fino al 04/10/2026 il ramo non-anime ri-formattava **solo** col badge episodio attivo — e per un catalogo film
`type === 'movie'` basta a escluderlo, quindi non ri-formattava mai. Risultato: **Il Padrino, Pulp Fiction,
Interstellar, Breaking Bad** doppiati e senza badge, mentre gli anime (che ri-formattavano) lo avevano. Il difetto
non era nei dati: era nell'ordine delle due formattazioni.

Due conseguenze da ricordare quando si tocca questo percorso:

- **`BADGE_CATALOG_VERSION`** (`catalogHandler.js`) va **alzato** a ogni cambio del modo in cui nascono badge e
  poster, o le card già in cache (fino a 14 giorni) continuano a servire il poster vecchio e la correzione
  sembra non funzionare. È successo due volte: versione 18 e versione 19.
- La **scheda** e il **catalogo** sono percorsi diversi: la scheda passa `itaCacheBadge` e mostra il badge anche
  quando la griglia no. Verificare sempre **entrambi** — il difetto del ticket 15 si vedeva solo nella griglia.

### Anime

Fuori dal catalogo novità un anime mostra **`ITA` secco**: niente numero di episodio, niente badge di stagione
(`_itaBadge: true` + `_itaOnlyBadge: true`). Nel catalogo novità (`preset_anime_simulcast`) restano le due card:
`EP n` per i sub e `ITA n` con il clone `_ita_offset` per il doppiato uscito nella finestra di 14 giorni, letti
da `anime_airing_state` (`src/data/animeAiringState.js`).

La verità ITA degli anime è l'**unione** tra le annotazioni di AG e lo stato AnimeUnity. L'unione **non** la fa la
build del parquet (`scripts/convert_to_parquet.js` legge e converte soltanto): la fa
`services/doppiaggi-source` (`cli.js`, `mergeAnnotationRows`), che legge `anime_airing_state` e scrive le righe
unite in `ita_annotations.jsonl`. Se quel passaggio salta — servizio fermo, `--no-anime`, collezione vuota — la
build non se ne accorge e il badge ITA degli anime **sparisce da tutti i cataloghi in silenzio**: il file meta
resta onesto (`source` senza `∪ anime_airing_state`) e dal 04/10/2026 il giro lo dice anche nel log.

- **Costo zero per item**: una lettura per finestra (snapshot), non una query per card.
- **Degrado silenzioso**: file assente o rotto → snapshot vuoto, nessun badge, nessuna eccezione. Il catalogo
  resta fresco; il badge si spegne.
