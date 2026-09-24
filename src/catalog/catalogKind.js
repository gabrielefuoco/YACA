// src/catalog/catalogKind.js

/**
 * Modulo unico di verità per l'identità e la conformità dei cataloghi rispetto
 * ai selettori di tipo del profilo (Solo Film / Solo Serie / Solo Anime / No Anime).
 *
 * Spec: issues/06-decisione-selettori-tipo.md (Sessione 3)
 *
 * Struttura di kind:
 * kind = {
 *   mediaSet: Array<'film' | 'serie'>,
 *   anime: 'yes' | 'no' | 'mixed'
 * }
 */

// Registry esplicito per 8 Hero e cataloghi fissi/utility
const FIXED_CATALOGS_REGISTRY = {
    // Utility e libreria personale (sempre visibili nel manifest)
    'yaca_search_standard': { mediaSet: ['film', 'serie'], anime: 'mixed', alwaysVisible: true },
    'yaca_search_ai': { mediaSet: ['film', 'serie'], anime: 'mixed', alwaysVisible: true },
    'yaca_watchlist_movies': { mediaSet: ['film'], anime: 'no', alwaysVisible: true },
    'yaca_watchlist_series': { mediaSet: ['serie'], anime: 'no', alwaysVisible: true },
    'yaca_watchlist_anime': { mediaSet: ['film', 'serie'], anime: 'yes', alwaysVisible: true },

    // 8 Hero Catalogs (Phase 4)
    'yaca_true_blend_movies': { mediaSet: ['film'], anime: 'no', alwaysVisible: false },
    'yaca_true_blend_series': { mediaSet: ['serie'], anime: 'no', alwaysVisible: false },
    'yaca_seed_network_movies': { mediaSet: ['film'], anime: 'no', alwaysVisible: false },
    'yaca_seed_network_series': { mediaSet: ['serie'], anime: 'no', alwaysVisible: false },
    'yaca_hidden_gems_movies': { mediaSet: ['film'], anime: 'no', alwaysVisible: false },
    'yaca_hidden_gems_series': { mediaSet: ['serie'], anime: 'no', alwaysVisible: false },
    'yaca_trakt_filtered_movies': { mediaSet: ['film'], anime: 'no', alwaysVisible: false },
    'yaca_trakt_filtered_series': { mediaSet: ['serie'], anime: 'no', alwaysVisible: false },
};

const ALWAYS_VISIBLE_IDS = new Set(
    Object.entries(FIXED_CATALOGS_REGISTRY)
        .filter(([, v]) => v.alwaysVisible)
        .map(([k]) => k)
);

let _cachedPresetsMap = null;
function getPresetMap() {
    if (!_cachedPresetsMap) {
        try {
            const { getPresets } = require('../data/presets');
            const presets = getPresets();
            _cachedPresetsMap = new Map(presets.map(p => [p.id, p]));
        } catch {
            _cachedPresetsMap = new Map();
        }
    }
    return _cachedPresetsMap;
}

function stripPresetPrefix(id) {
    if (typeof id !== 'string') return '';
    return id.startsWith('yaca_preset_') ? id.replace('yaca_preset_', '') : id;
}

function isAlwaysVisible(catalogId) {
    if (!catalogId) return false;
    return ALWAYS_VISIBLE_IDS.has(catalogId) || ALWAYS_VISIBLE_IDS.has(stripPresetPrefix(catalogId));
}

/**
 * Calcola il `kind` di un catalogo (preset, hero, custom, merged).
 *
 * @param {Object|string} catalog - Catalogo (oggetto o ID)
 * @param {Object} [options] - Opzioni opzionali (catalogsMap per risoluzione merged)
 * @returns {{ mediaSet: string[], anime: 'yes'|'no'|'mixed' }}
 */
function getCatalogKind(catalog, options = {}) {
    if (!catalog) {
        return { mediaSet: ['film', 'serie'], anime: 'mixed' };
    }

    // Se è già un oggetto kind
    if (catalog.mediaSet && catalog.anime && !catalog.id) {
        return {
            mediaSet: Array.from(catalog.mediaSet),
            anime: catalog.anime
        };
    }

    const id = typeof catalog === 'string' ? catalog : (catalog.id || '');
    const baseId = stripPresetPrefix(id);

    // 1. Controlla il registry dei cataloghi fissi/hero
    if (FIXED_CATALOGS_REGISTRY[id]) {
        const reg = FIXED_CATALOGS_REGISTRY[id];
        return {
            mediaSet: [...reg.mediaSet],
            anime: reg.anime
        };
    }
    if (FIXED_CATALOGS_REGISTRY[baseId]) {
        const reg = FIXED_CATALOGS_REGISTRY[baseId];
        return {
            mediaSet: [...reg.mediaSet],
            anime: reg.anime
        };
    }

    // 2. Catalogo Merged (unione di più sorgenti)
    const mergedFrom = typeof catalog === 'object' ? catalog.mergedFrom : null;
    if (Array.isArray(mergedFrom) && mergedFrom.length > 0) {
        const sourceKinds = mergedFrom.map(sourceId => {
            if (options.catalogsMap && options.catalogsMap.has(sourceId)) {
                return getCatalogKind(options.catalogsMap.get(sourceId), options);
            }
            return getCatalogKind(sourceId, options);
        });

        const mediaUnion = new Set();
        sourceKinds.forEach(sk => {
            (sk.mediaSet || []).forEach(m => mediaUnion.add(m));
        });

        const allYes = sourceKinds.every(sk => sk.anime === 'yes');
        const allNo = sourceKinds.every(sk => sk.anime === 'no');
        let mergedAnime = 'mixed';
        if (allYes) mergedAnime = 'yes';
        else if (allNo) mergedAnime = 'no';

        return {
            mediaSet: Array.from(mediaUnion).sort(),
            anime: mergedAnime
        };
    }

    // 3. Risolvi se è un preset canonico da presets.js
    const presetMap = options.presetsMap || getPresetMap();
    const canonPreset = presetMap.get(baseId) || presetMap.get(id);

    const type = typeof catalog === 'object' && catalog.type ? catalog.type : (canonPreset?.type || null);
    const isAnime = typeof catalog === 'object' && typeof catalog.isAnime === 'boolean'
        ? catalog.isAnime
        : (canonPreset?.isAnime === true);

    // 4. Custom / Matchmaker
    if (type === 'anime') {
        return {
            mediaSet: ['film', 'serie'], // mediaSet ignoto
            anime: 'yes'
        };
    }

    // MediaSet calcolato da type
    let mediaSet;
    if (type === 'movie') {
        mediaSet = ['film'];
    } else if (type === 'series') {
        mediaSet = ['serie'];
    } else if (type === 'both') {
        mediaSet = ['film', 'serie'];
    } else {
        // Fallback per ID con suffisso noto (_movies / _series) o generico
        if (id.endsWith('_movies')) mediaSet = ['film'];
        else if (id.endsWith('_series')) mediaSet = ['serie'];
        else mediaSet = ['film', 'serie'];
    }

    const anime = isAnime ? 'yes' : 'no';

    return {
        mediaSet,
        anime
    };
}

/**
 * Valuta se un catalogo è conforme ai selettori di tipo del profilo attivo.
 *
 * Regola spec (decisione 4):
 * mediaSet ⊆ mediaAmmessi
 *   AND (anime='only'    → kind.anime === 'yes')
 *   AND (anime='exclude' → kind.anime === 'no')
 * mediaAmmessi: nessuno o entrambi → {film,serie} · Solo Film → {film} · Solo Serie → {serie}
 * `mixed` e ignoti conformi solo con anime:null.
 *
 * @param {Object|string} catalogOrKind
 * @param {Object|null|undefined} typeSelectors
 * @param {Object} [options]
 * @returns {boolean}
 */
function isCatalogConformant(catalogOrKind, typeSelectors, options = {}) {
    // I cataloghi di utility/libreria personale sono SEMPRE visibili
    const id = typeof catalogOrKind === 'string' ? catalogOrKind : catalogOrKind?.id;
    if (id && isAlwaysVisible(id)) {
        return true;
    }

    // Assenza di selettori = nessun vincolo (retrocompatibilità totale)
    if (!typeSelectors) {
        return true;
    }

    const film = Boolean(typeSelectors.film);
    const serie = Boolean(typeSelectors.serie);
    const anime = typeSelectors.anime || null;

    if (!film && !serie && !anime) {
        return true;
    }

    const kind = (catalogOrKind && Array.isArray(catalogOrKind.mediaSet) && catalogOrKind.anime)
        ? catalogOrKind
        : getCatalogKind(catalogOrKind, options);

    // 1. mediaAmmessi
    let mediaAmmessi;
    if ((!film && !serie) || (film && serie)) {
        mediaAmmessi = new Set(['film', 'serie']);
    } else if (film && !serie) {
        mediaAmmessi = new Set(['film']);
    } else {
        mediaAmmessi = new Set(['serie']);
    }

    // mediaSet ⊆ mediaAmmessi
    const mediaSet = kind.mediaSet || [];
    if (mediaSet.length > 0) {
        const isSubset = mediaSet.every(m => mediaAmmessi.has(m));
        if (!isSubset) {
            return false;
        }
    }

    // 2. anime condition
    if (anime === 'only') {
        if (kind.anime !== 'yes') {
            return false;
        }
    } else if (anime === 'exclude') {
        if (kind.anime !== 'no') {
            return false;
        }
    }

    return true;
}

/**
 * Restituisce il motivo testuale dell'incompatibilità, oppure null se conforme.
 *
 * @param {Object|string} catalogOrKind
 * @param {Object|null|undefined} typeSelectors
 * @param {Object} [options]
 * @returns {string|null}
 */
function getIncompatibilityReason(catalogOrKind, typeSelectors, options = {}) {
    if (isCatalogConformant(catalogOrKind, typeSelectors, options)) {
        return null;
    }

    const film = Boolean(typeSelectors?.film);
    const serie = Boolean(typeSelectors?.serie);
    const anime = typeSelectors?.anime || null;

    const kind = (catalogOrKind && Array.isArray(catalogOrKind.mediaSet) && catalogOrKind.anime)
        ? catalogOrKind
        : getCatalogKind(catalogOrKind, options);

    let mediaAmmessi;
    if ((!film && !serie) || (film && serie)) {
        mediaAmmessi = new Set(['film', 'serie']);
    } else if (film && !serie) {
        mediaAmmessi = new Set(['film']);
    } else {
        mediaAmmessi = new Set(['serie']);
    }

    const mediaSet = kind.mediaSet || [];
    if (mediaSet.length > 0 && !mediaSet.every(m => mediaAmmessi.has(m))) {
        if (film && !serie) return 'Non compatibile: profilo Solo Film';
        if (!film && serie) return 'Non compatibile: profilo Solo Serie';
    }

    if (anime === 'only' && kind.anime !== 'yes') {
        return 'Non compatibile: profilo Solo Anime';
    }
    if (anime === 'exclude' && kind.anime !== 'no') {
        return 'Non compatibile: profilo No Anime';
    }

    return 'Non compatibile con i selettori del profilo';
}

module.exports = {
    FIXED_CATALOGS_REGISTRY,
    ALWAYS_VISIBLE_IDS,
    isAlwaysVisible,
    getCatalogKind,
    isCatalogConformant,
    getIncompatibilityReason
};
