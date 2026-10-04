/**
 * AiringStateProvider.js
 *
 * Catalogo "Simulcast (Nuovi Episodi)" alimentato dallo stato scritto dal modulo esterno
 * (`anime_airing_state`, contratto ticket 07) — sostituisce AnilistProvider.
 *
 * CONTENUTO (ticket 52, 04/10/2026): le serie che la HOME di AnimeUnity mostra come uscite
 * negli ultimi 14 giorni (`homeReleases`), ordinate per data dell'ultimo episodio uscito,
 * più recente in testa. La finestra l'ha applicata la fonte, sul dato della fonte
 * (`created_at`): qui non c'è nessuna finestra nostra, nessun `listSeenAt`, nessun
 * `updatedAt`. Un titolo senza episodi di home non entra — e la serie annunciata (zero
 * episodi) non c'è.
 * L'idratamento dei metadati resta su DuckDB (query batch `id IN (...)`), come prima.
 *
 * L'id della card è `kitsu:{id}` quando risolvibile (stessa identità di metaHandler/streaming),
 * altrimenti `tmdb:{id}`. Le due card (sub e ITA) condividono lo stesso id.
 */

const animeAiringState = require('../../data/animeAiringState');
const animeMappingStore = require('../../data/animeMappingStore');
const { getDuckDbCatalogFromPreset } = require('./DuckDbProvider');

const PAGE_SIZE = 20;

/**
 * @param {number} skip Paginazione Stremio (offset sugli item della lista novità)
 * @returns {Promise<Array>} Meta Stremio già idratati e ordinati; [] in ogni caso di degrado
 */
async function getAiringStateCatalog(skip = 0) {
    try {
        const snapshot = await animeAiringState.getSnapshot();
        const entries = animeAiringState.getAiringEntries(snapshot);

        if (!entries || entries.length === 0) {
            // Nessun titolo dalla home nelle due settimane: catalogo vuoto, senza eccezioni.
            // È un esito legittimo (la fonte non ha nulla di nuovo), non un degrado.
            return [];
        }

        const tmdbIds = Array.from(new Set(
            entries
                .map((entry) => Number(entry.doc && entry.doc.tmdbId))
                .filter((id) => Number.isFinite(id) && id > 0)
        ));
        if (tmdbIds.length === 0) return [];

        const metas = await getDuckDbCatalogFromPreset({
            type: 'series',
            // Nessun filtro lingua/genere: segue esattamente la lista sorgente AnimeUnity
            where: [
                `"id" IN (${tmdbIds.join(',')})`
            ],
            orderBy: '"id" ASC'
        }, 0, tmdbIds.length);

        const hydrated = new Map();
        for (const meta of metas) {
            if (!meta) continue;
            const key = meta._tmdbId !== undefined && meta._tmdbId !== null
                ? String(meta._tmdbId)
                : String(meta.id || '').replace(/^tmdb:/, '');
            if (key) hydrated.set(key, meta);
        }

        // DuckDB non preserva l'ordine della lista: riordino sulla base delle novità dello stato.
        const valid = [];
        for (const entry of entries) {
            const tmdbKey = String((entry.doc && entry.doc.tmdbId) || entry.tmdbId || '');
            const meta = hydrated.get(tmdbKey);
            if (!meta) continue; // non idratabile da DuckDB: lo saltiamo (come il vecchio provider)
            const cardId = animeAiringState.resolveCardId(entry, animeMappingStore);
            if (cardId) meta.id = cardId;
            // Il documento viaggia con la card. Il badge viene applicato DOPO la cache, quando
            // la meta ha perso l'id TMDB e l'id della card è un `kitsu:` stagionale che
            // `findAiringStateDocument` non riesce a riportare al documento (vedi il commento
            // lì): qui la provenienza è ancora nota, quindi gliela si scrive. È un puntatore,
            // non una copia: il documento si rilegge dallo snapshot (fresco, non invecchiato
            // dentro la cache) e `applyAiringStateBadges` toglie il campo prima della risposta.
            meta._airingDocTmdbId = tmdbKey;
            valid.push(meta);
        }

        const offset = Number(skip) > 0 ? Math.floor(Number(skip)) : 0;
        if (offset >= valid.length) return [];

        return valid.slice(offset, offset + PAGE_SIZE);
    } catch (error) {
        // Degrado: mai un errore all'utente, il catalogo semplicemente non si popola.
        console.error('[AiringStateProvider] Catalogo novità anime non disponibile:', error.message);
        return [];
    }
}

module.exports = {
    getAiringStateCatalog,
    PAGE_SIZE
};
