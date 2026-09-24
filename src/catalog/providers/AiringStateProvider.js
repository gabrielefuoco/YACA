/**
 * AiringStateProvider.js
 *
 * Catalogo "Simulcast (Nuovi Episodi)" alimentato dallo stato scritto dal modulo esterno
 * (`anime_airing_state`, contratto ticket 07) — sostituisce AnilistProvider.
 *
 * Contenuto: serie con almeno un episodio (sub o ITA) uscito negli ultimi 14 giorni,
 * ordinate per data dell'ultimo episodio disponibile (più recente in testa).
 * L'idratamento dei metadati resta su DuckDB (query batch `id IN (...)`), come prima.
 *
 * L'id della card è `kitsu:{id}` quando risolvibile (stessa identità di metaHandler/streaming),
 * altrimenti `tmdb:{id}`. Le due card (sub e ITA) condividono lo stesso id.
 */

const animeAiringState = require('../../data/animeAiringState');
const animeMappingStore = require('../../data/animeMappingStore');
const { F } = require('../../data/filters');
const { getDuckDbCatalogFromPreset } = require('./DuckDbProvider');

const PAGE_SIZE = 100;

/**
 * @param {number} skip Paginazione Stremio (offset sugli item della lista novità)
 * @returns {Promise<Array>} Meta Stremio già idratati e ordinati; [] in ogni caso di degrado
 */
async function getAiringStateCatalog(skip = 0) {
    try {
        const snapshot = await animeAiringState.getSnapshot();
        const entries = animeAiringState.getNoveltyEntries(snapshot);

        const offset = Number(skip) > 0 ? Math.floor(Number(skip)) : 0;
        if (entries.length === 0 || offset >= entries.length) return [];

        const page = entries.slice(offset, offset + PAGE_SIZE);
        const tmdbIds = page
            .map((entry) => Number(entry.doc.tmdbId))
            .filter((id) => Number.isFinite(id) && id > 0);
        if (tmdbIds.length === 0) return [];

        const metas = await getDuckDbCatalogFromPreset({
            type: 'series',
            // Lo stato Kitsu/ airing può contenere donghua e webtoon. Per il
            // catalogo Solo Anime l'identità deve essere provata dai metadati
            // TMDB: lingua originale giapponese e genere Animazione.
            where: [
                `"id" IN (${tmdbIds.join(',')})`,
                F.lang('ja'),
                F.genre(16)
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

        // DuckDB non preserva l'ordine della lista: riordino sulla pagina dello stato.
        const ordered = [];
        for (const entry of page) {
            const meta = hydrated.get(entry.doc.tmdbId);
            if (!meta) continue; // non idratabile da DuckDB: lo saltiamo (come il vecchio provider)
            const cardId = animeAiringState.resolveCardId(entry, animeMappingStore);
            if (cardId) meta.id = cardId;
            ordered.push(meta);
        }

        return ordered;
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
