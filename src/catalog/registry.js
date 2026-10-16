// src/catalog/registry.js

/**
 * UNICO REGISTRO DI VERITÀ PER I CATALOGHI HERO DI YACA (Ticket 37).
 *
 * Mantiene la definizione unificata delle righe hero per Stremio, UI di configurazione,
 * engine di raccomandazione, fingerprints e filtri kind.
 */

const crypto = require('crypto');

const HERO_REGISTRY = [
    {
        id: 'yaca_true_blend_movies',
        idBase: 'yaca_true_blend',
        type: 'movie',
        name: '⭐ Scelti per Te',
        emoji: '⭐',
        label: 'Scelti per Te',
        desc: 'Ricerca semantica AI + Scoring algoritmico.',
        mediaSet: ['film'],
        anime: 'agnostic',
        alwaysVisible: false,
        strategy: 'trueBlend',
        uiType: 'ai'
    },
    {
        id: 'yaca_true_blend_series',
        idBase: 'yaca_true_blend',
        type: 'series',
        name: '⭐ Scelti per Te',
        emoji: '⭐',
        label: 'Scelti per Te',
        desc: 'Ricerca semantica AI + Scoring algoritmico.',
        mediaSet: ['serie'],
        anime: 'agnostic',
        alwaysVisible: false,
        strategy: 'trueBlend',
        uiType: 'ai'
    },
    {
        id: 'yaca_seed_network_movies',
        idBase: 'yaca_seed_network',
        type: 'movie',
        name: '🕸️ La Rete dei tuoi Preferiti',
        emoji: '🕸️',
        label: 'La Rete dei tuoi Preferiti',
        desc: 'Espande la rete dei titoli amati (Stacking).',
        mediaSet: ['film'],
        anime: 'agnostic',
        alwaysVisible: false,
        strategy: null,
        uiType: 'algo'
    },
    {
        id: 'yaca_seed_network_series',
        idBase: 'yaca_seed_network',
        type: 'series',
        name: '🕸️ La Rete dei tuoi Preferiti',
        emoji: '🕸️',
        label: 'La Rete dei tuoi Preferiti',
        desc: 'Espande la rete dei titoli amati (Stacking).',
        mediaSet: ['serie'],
        anime: 'agnostic',
        alwaysVisible: false,
        strategy: null,
        uiType: 'algo'
    },
    {
        id: 'yaca_hidden_gems_movies',
        idBase: 'yaca_hidden_gems',
        type: 'movie',
        name: '💎 Gemme Nascoste',
        emoji: '💎',
        label: 'Gemme Nascoste',
        desc: 'Ricerca AI di nicchia + Quality Cage algoritmica.',
        mediaSet: ['film'],
        anime: 'agnostic',
        alwaysVisible: false,
        strategy: 'hiddenGems',
        uiType: 'ai'
    },
    {
        id: 'yaca_hidden_gems_series',
        idBase: 'yaca_hidden_gems',
        type: 'series',
        name: '💎 Gemme Nascoste',
        emoji: '💎',
        label: 'Gemme Nascoste',
        desc: 'Ricerca AI di nicchia + Quality Cage algoritmica.',
        mediaSet: ['serie'],
        anime: 'agnostic',
        alwaysVisible: false,
        strategy: 'hiddenGems',
        uiType: 'ai'
    },
    {
        id: 'yaca_trakt_filtered_movies',
        idBase: 'yaca_trakt_filtered',
        type: 'movie',
        name: '🌐 Suggeriti dalla Community',
        emoji: '🌐',
        label: 'Suggeriti dalla Community',
        desc: 'Suggerimenti community filtrati col tuo DNA.',
        mediaSet: ['film'],
        anime: 'agnostic',
        alwaysVisible: false,
        strategy: null,
        uiType: 'algo'
    },
    {
        id: 'yaca_trakt_filtered_series',
        idBase: 'yaca_trakt_filtered',
        type: 'series',
        name: '🌐 Suggeriti dalla Community',
        emoji: '🌐',
        label: 'Suggeriti dalla Community',
        desc: 'Suggerimenti community filtrati col tuo DNA.',
        mediaSet: ['serie'],
        anime: 'agnostic',
        alwaysVisible: false,
        strategy: null,
        uiType: 'algo'
    },
    {
        id: 'yaca_mondi_movies',
        idBase: 'yaca_mondi',
        type: 'movie',
        name: '🌍 Il tuo mondo',
        emoji: '🌍',
        label: 'Il tuo mondo',
        desc: "La bolla che la tua storia accende di piu': il tuo mondo, coi suoi titoli.",
        mediaSet: ['film'],
        anime: 'agnostic',
        alwaysVisible: false,
        strategy: null,
        uiType: 'algo'
    },
    {
        id: 'yaca_mondi_series',
        idBase: 'yaca_mondi',
        type: 'series',
        name: '🌍 Il tuo mondo',
        emoji: '🌍',
        label: 'Il tuo mondo',
        desc: "La bolla che la tua storia accende di piu': il tuo mondo, coi suoi titoli.",
        mediaSet: ['serie'],
        anime: 'agnostic',
        alwaysVisible: false,
        strategy: null,
        uiType: 'algo'
    },
    {
        id: 'yaca_passo_fuori_movies',
        idBase: 'yaca_passo_fuori',
        type: 'movie',
        name: '🔭 Un passo fuori',
        emoji: '🔭',
        label: 'Un passo fuori',
        desc: "I mondi accanto al tuo: dove stanno le scoperte, a un passo dal conosciuto.",
        mediaSet: ['film'],
        anime: 'agnostic',
        alwaysVisible: false,
        strategy: null,
        uiType: 'algo'
    },
    {
        id: 'yaca_passo_fuori_series',
        idBase: 'yaca_passo_fuori',
        type: 'series',
        name: '🔭 Un passo fuori',
        emoji: '🔭',
        label: 'Un passo fuori',
        desc: "I mondi accanto al tuo: dove stanno le scoperte, a un passo dal conosciuto.",
        mediaSet: ['serie'],
        anime: 'agnostic',
        alwaysVisible: false,
        strategy: null,
        uiType: 'algo'
    }
];

/**
 * Manifest hero rows for Stremio manifest builder.
 */
function getManifestHeroCatalogs() {
    return HERO_REGISTRY.map(r => ({
        id: r.id,
        type: r.type,
        name: r.name,
        extra: [{ name: 'skip' }]
    }));
}

/**
 * Hero rows projected for cache fingerprint signature.
 */
function getHeroCatalogFingerprintRows() {
    return HERO_REGISTRY.map(r => ({
        id: r.id,
        type: r.type,
        name: r.name
    }));
}

/**
 * Engine catalog modes mapping (CATALOG_MODES).
 */
function getHeroCatalogModes() {
    const modes = {};
    for (const r of HERO_REGISTRY) {
        modes[r.id] = r.strategy;
    }
    return modes;
}

/**
 * Derives unique hero prefixes (e.g. 'yaca_true_blend_') from catalog IDs.
 */
function getHeroPrefixes() {
    const prefixes = new Set();
    for (const r of HERO_REGISTRY) {
        const prefix = r.id.replace(/(movies|series)$/, '');
        prefixes.add(prefix);
    }
    return Array.from(prefixes);
}

const HERO_PREFIXES = getHeroPrefixes();

function isHeroCatalogId(id) {
    if (!id || typeof id !== 'string') return false;
    return HERO_PREFIXES.some(prefix => id.startsWith(prefix));
}

/**
 * Maps hero catalog IDs to their kind attributes for catalogKind.js.
 */
function getHeroCatalogKindMap() {
    const map = {};
    for (const r of HERO_REGISTRY) {
        map[r.id] = {
            mediaSet: [...r.mediaSet],
            anime: r.anime,
            alwaysVisible: r.alwaysVisible
        };
    }
    return map;
}

/**
 * UI groups (base rows by idBase) for configuration dashboard.
 */
function getHeroUiGroups() {
    const groups = [];
    const seen = new Set();
    for (const r of HERO_REGISTRY) {
        if (!seen.has(r.idBase)) {
            seen.add(r.idBase);
            groups.push({
                idBase: r.idBase,
                label: r.label,
                emoji: r.emoji,
                desc: r.desc,
                type: r.uiType || 'algo'
            });
        }
    }
    return groups;
}

/**
 * Deterministic hash of the hero catalog registry.
 */
function getRegistryHash() {
    return crypto.createHash('sha256').update(JSON.stringify(HERO_REGISTRY)).digest('hex').slice(0, 16);
}

const HERO_IDS = Object.freeze(HERO_REGISTRY.map(r => r.id));
const HERO_CATALOG_IDS_SET = new Set(HERO_IDS);

module.exports = {
    HERO_REGISTRY,
    HERO_PREFIXES,
    HERO_IDS,
    HERO_CATALOG_IDS_SET,
    getManifestHeroCatalogs,
    getHeroCatalogFingerprintRows,
    getHeroCatalogModes,
    getHeroPrefixes,
    isHeroCatalogId,
    getHeroCatalogKindMap,
    getHeroUiGroups,
    getRegistryHash
};
