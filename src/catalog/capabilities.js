// src/catalog/capabilities.js

/**
 * DICHIARAZIONE DELLE CAPACITÀ DELLE FONTI (Ticket 23).
 *
 * Definisce la FORMA di una dichiarazione di capacità per il servire (che sarà gestita
 * dal registro delle fonti del Ticket 22), e dichiara temporaneamente le capacità
 * delle fonti esistenti per consentire la validazione incrociata.
 *
 * Forma di una dichiarazione di capacità:
 * - id: identificatore della fonte (es. 'duckdb', 'airing_state', 'hybrid', 'watchlist')
 * - name: nome descrittivo
 * - supportedMediaSets: array dei mediaSet ammessi (es. [['film'], ['serie']])
 * - supportedAnime: array dei valori asse anime ammessi ('yes', 'no', 'mixed', 'agnostic')
 * - supportedFilters: array dei filtri servibili da questa fonte
 * - supportedSorts: array delle chiavi sort_by gestibili
 * - canServeFilter(key): funzione di verifica
 * - canServeMediaSet(mediaSet): funzione di verifica
 * - canServeAnime(anime): funzione di verifica
 * - canServeSort(sort): funzione di verifica
 */

const { SUPPORTED_SORT_BY } = require('./catalogSorting');

/**
 * Factory per una dichiarazione di capacità fonte.
 */
function defineSourceCapabilities({
    id,
    name,
    supportedMediaSets = [['film'], ['serie'], ['film', 'serie']],
    supportedAnime = ['yes', 'no', 'mixed', 'agnostic'],
    supportedFilters = [],
    supportedSorts = []
}) {
    if (!id || typeof id !== 'string') {
        throw new TypeError('id della fonte obbligatorio e stringa');
    }

    const filterSet = new Set(supportedFilters);
    const sortSet = new Set(supportedSorts);

    return {
        id,
        name: name || id,
        supportedMediaSets,
        supportedAnime,
        supportedFilters: Array.from(filterSet),
        supportedSorts: Array.from(sortSet),

        canServeFilter(filterKey) {
            return filterSet.has(filterKey);
        },

        canServeMediaSet(mediaSet) {
            if (!Array.isArray(mediaSet) || mediaSet.length === 0) return false;
            return supportedMediaSets.some(set =>
                set.length === mediaSet.length && set.every(m => mediaSet.includes(m))
            );
        },

        canServeAnime(anime) {
            return supportedAnime.includes(anime);
        },

        canServeSort(sortKey) {
            if (!sortKey) return true;
            return sortSet.has(sortKey);
        }
    };
}

// --- DICHIARAZIONE CAPACITÀ DELLE FONTI ESISTENTI (Ticket 23 Seam) ---

// 1. DuckDB / Local Discovery Index (la fonte principale per i preset e la ricerca)
const DUCKDB_SUPPORTED_FILTERS = [
    'strategy',
    'sort_by',
    'provider',
    'with_genres',
    'without_genres',
    'with_keywords',
    'without_keywords',
    'with_crew',
    'with_cast',
    'with_companies',
    'with_networks',
    'with_original_language',
    'without_original_language',
    'with_origin_country',
    'without_tmdbIds',
    'primary_release_year',
    'first_air_date_year',
    'primary_release_date.gte',
    'primary_release_date.lte',
    'first_air_date.gte',
    'first_air_date.lte',
    'air_date.gte',
    'air_date.lte',
    'vote_count.gte',
    'vote_count.lte',
    'vote_average.gte',
    'vote_average.lte',
    'with_runtime.gte',
    'with_runtime.lte',
    'number_of_seasons.lte',
    'number_of_episodes.lte',
    'onlyIta',
    'isDubbed',
    'status',
    'with_status',
    'recent_since',
    'permissive_recent',
    'watch_providers',
    'with_watch_providers',
    'watch_region',
    'with_collections',
    'showEpisodeBadge'
];

const duckdbSource = defineSourceCapabilities({
    id: 'duckdb',
    name: 'DuckDB Local Index (Discovery)',
    supportedMediaSets: [['film'], ['serie'], ['film', 'serie']],
    supportedAnime: ['yes', 'no', 'mixed'],
    supportedFilters: DUCKDB_SUPPORTED_FILTERS,
    supportedSorts: [...SUPPORTED_SORT_BY]
});

// 2. Airing State (Anime Novità / Simulcast)
const airingStateSource = defineSourceCapabilities({
    id: 'airing_state',
    name: 'Anime Airing State (Simulcast)',
    supportedMediaSets: [['serie'], ['film', 'serie']],
    supportedAnime: ['yes'],
    supportedFilters: [
        'provider',
        'air_date.gte',
        'air_date.lte',
        'recent_since',
        'showEpisodeBadge'
    ],
    supportedSorts: ['lastAiredAt']
});

// 3. Hybrid / Hero Recommendation Engine (VSM + Rete Preferiti + Mondi)
const hybridSource = defineSourceCapabilities({
    id: 'hybrid',
    name: 'Hybrid Recommendation Engine (Hero Rows)',
    supportedMediaSets: [['film'], ['serie']],
    supportedAnime: ['agnostic', 'yes', 'no', 'mixed'],
    supportedFilters: [
        'strategy',
        'provider'
    ],
    supportedSorts: ['affinity_score']
});

// 4. Watchlist (Libreria personale utente Stremio)
const watchlistSource = defineSourceCapabilities({
    id: 'watchlist',
    name: 'User Watchlist / Personal Library',
    supportedMediaSets: [['film'], ['serie'], ['film', 'serie']],
    supportedAnime: ['yes', 'no', 'mixed'],
    supportedFilters: [
        'provider',
        'type'
    ],
    supportedSorts: ['_mtime DESC']
});

// Registro transitorio delle fonti per la validazione di oggi
const SOURCES_REGISTRY = {
    duckdb: duckdbSource,
    airing_state: airingStateSource,
    hybrid: hybridSource,
    watchlist: watchlistSource
};

function getSourceCapabilities(sourceId) {
    return SOURCES_REGISTRY[sourceId] || null;
}

function getAllSourceCapabilities() {
    return { ...SOURCES_REGISTRY };
}

function registerSourceCapabilities(caps) {
    if (!caps || !caps.id) throw new TypeError('Capacità fonte non valide.');
    SOURCES_REGISTRY[caps.id] = caps;
}

module.exports = {
    defineSourceCapabilities,
    getSourceCapabilities,
    getAllSourceCapabilities,
    registerSourceCapabilities,
    DUCKDB_SUPPORTED_FILTERS,
    duckdbSource,
    airingStateSource,
    hybridSource,
    watchlistSource
};
