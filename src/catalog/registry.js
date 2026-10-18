// src/catalog/registry.js

/**
 * UNICO REGISTRO DI VERITÀ PER I CATALOGHI HERO DI YACA (Ticket 23 & Ticket 37).
 *
 * Tutte le righe hero sono ora DEFINIZIONI DICHIARATIVE DI SISTEMA (System Presets),
 * e tutte le 10 proiezioni del prodotto discendono da queste definizioni:
 * - Manifest Stremio (getManifestHeroCatalogs)
 * - Fingerprint cache (getHeroCatalogFingerprintRows)
 * - Mappe kind per selettori (getHeroCatalogKindMap)
 * - Specifiche del pool (getHeroPoolSpec)
 * - Gruppi UI della dashboard (getHeroUiGroups)
 * - Strategie motore (getHeroCatalogModes)
 * - Prefissi hero (getHeroPrefixes, isHeroCatalogId)
 * - Hash del registro (getRegistryHash)
 */

const crypto = require('crypto');
const { defineCatalog } = require('./definition');

/**
 * Le 8 definizioni dei cataloghi hero di sistema (Ticket 46).
 * Il grafo è il motore del gusto: mondi, passo_fuori, uscite_nuove, nicchia_di_qualita.
 * Una sola natura: la riga hero è un preset di sistema con la stessa forma del preset utente.
 */
const RAW_HERO_DEFINITIONS = [
    {
        id: 'yaca_mondi_movies',
        name: '🌍 Il tuo mondo',
        emoji: '🌍',
        mediaSet: ['film'],
        anime: 'agnostic',
        filters: { strategy: 'mondi' },
        sort: { by: 'affinity_score', sortable: false },
        system: {
            isSystem: true,
            userModifiable: false,
            priority: 1,
            additive: true,
            alwaysVisible: false,
            strategy: null,
            uiType: 'algo',
            idBase: 'yaca_mondi',
            label: 'Il tuo mondo',
            desc: "La bolla che la tua storia accende di piu': il tuo mondo, coi suoi titoli.",
            provider: 'hybrid'
        }
    },
    {
        id: 'yaca_mondi_series',
        name: '🌍 Il tuo mondo',
        emoji: '🌍',
        mediaSet: ['serie'],
        anime: 'agnostic',
        filters: { strategy: 'mondi' },
        sort: { by: 'affinity_score', sortable: false },
        system: {
            isSystem: true,
            userModifiable: false,
            priority: 1,
            additive: true,
            alwaysVisible: false,
            strategy: null,
            uiType: 'algo',
            idBase: 'yaca_mondi',
            label: 'Il tuo mondo',
            desc: "La bolla che la tua storia accende di piu': il tuo mondo, coi suoi titoli.",
            provider: 'hybrid'
        }
    },
    {
        id: 'yaca_passo_fuori_movies',
        name: '🔭 Un passo fuori',
        emoji: '🔭',
        mediaSet: ['film'],
        anime: 'agnostic',
        filters: { strategy: 'passo_fuori' },
        sort: { by: 'affinity_score', sortable: false },
        system: {
            isSystem: true,
            userModifiable: false,
            priority: 2,
            additive: true,
            alwaysVisible: false,
            strategy: null,
            uiType: 'algo',
            idBase: 'yaca_passo_fuori',
            label: 'Un passo fuori',
            desc: "I mondi accanto al tuo: dove stanno le scoperte, a un passo dal conosciuto.",
            provider: 'hybrid'
        }
    },
    {
        id: 'yaca_passo_fuori_series',
        name: '🔭 Un passo fuori',
        emoji: '🔭',
        mediaSet: ['serie'],
        anime: 'agnostic',
        filters: { strategy: 'passo_fuori' },
        sort: { by: 'affinity_score', sortable: false },
        system: {
            isSystem: true,
            userModifiable: false,
            priority: 2,
            additive: true,
            alwaysVisible: false,
            strategy: null,
            uiType: 'algo',
            idBase: 'yaca_passo_fuori',
            label: 'Un passo fuori',
            desc: "I mondi accanto al tuo: dove stanno le scoperte, a un passo dal conosciuto.",
            provider: 'hybrid'
        }
    },
    {
        id: 'yaca_uscite_nuove_movies',
        name: '✨ Uscite Nuove',
        emoji: '✨',
        mediaSet: ['film'],
        anime: 'agnostic',
        filters: { strategy: 'uscite_nuove' },
        sort: { by: 'affinity_score', sortable: false },
        system: {
            isSystem: true,
            userModifiable: false,
            priority: 3,
            additive: true,
            alwaysVisible: false,
            strategy: null,
            uiType: 'algo',
            idBase: 'yaca_uscite_nuove',
            label: 'Uscite Nuove',
            desc: 'Uscite recenti nei mondi accesi dal tuo gusto.',
            provider: 'hybrid'
        }
    },
    {
        id: 'yaca_uscite_nuove_series',
        name: '✨ Uscite Nuove',
        emoji: '✨',
        mediaSet: ['serie'],
        anime: 'agnostic',
        filters: { strategy: 'uscite_nuove' },
        sort: { by: 'affinity_score', sortable: false },
        system: {
            isSystem: true,
            userModifiable: false,
            priority: 3,
            additive: true,
            alwaysVisible: false,
            strategy: null,
            uiType: 'algo',
            idBase: 'yaca_uscite_nuove',
            label: 'Uscite Nuove',
            desc: 'Uscite recenti nei mondi accesi dal tuo gusto.',
            provider: 'hybrid'
        }
    },
    {
        id: 'yaca_nicchia_di_qualita_movies',
        name: '💎 Nicchia di Qualità',
        emoji: '💎',
        mediaSet: ['film'],
        anime: 'agnostic',
        filters: { strategy: 'nicchia_di_qualita' },
        sort: { by: 'affinity_score', sortable: false },
        system: {
            isSystem: true,
            userModifiable: false,
            priority: 4,
            additive: true,
            alwaysVisible: false,
            strategy: null,
            uiType: 'algo',
            idBase: 'yaca_nicchia_di_qualita',
            label: 'Nicchia di Qualità',
            desc: 'Titoli di alta qualità e bassa popolarità scoperti dal grafo.',
            provider: 'hybrid'
        }
    },
    {
        id: 'yaca_nicchia_di_qualita_series',
        name: '💎 Nicchia di Qualità',
        emoji: '💎',
        mediaSet: ['serie'],
        anime: 'agnostic',
        filters: { strategy: 'nicchia_di_qualita' },
        sort: { by: 'affinity_score', sortable: false },
        system: {
            isSystem: true,
            userModifiable: false,
            priority: 4,
            additive: true,
            alwaysVisible: false,
            strategy: null,
            uiType: 'algo',
            idBase: 'yaca_nicchia_di_qualita',
            label: 'Nicchia di Qualità',
            desc: 'Titoli di alta qualità e bassa popolarità scoperti dal grafo.',
            provider: 'hybrid'
        }
    }
];

const HERO_SYSTEM_CATALOGS = Object.freeze(RAW_HERO_DEFINITIONS.map(defineCatalog));
const HERO_REGISTRY = HERO_SYSTEM_CATALOGS;

// --- DERIVAZIONI DALLE DEFINIZIONI ---

/**
 * Manifest hero rows for Stremio manifest builder.
 */
function getManifestHeroCatalogs() {
    return HERO_SYSTEM_CATALOGS.map(r => ({
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
    return HERO_SYSTEM_CATALOGS.map(r => ({
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
    for (const r of HERO_SYSTEM_CATALOGS) {
        modes[r.id] = r.strategy;
    }
    return modes;
}

/**
 * Derives unique hero prefixes (e.g. 'yaca_mondi_') from catalog IDs.
 */
function getHeroPrefixes() {
    const prefixes = new Set();
    for (const r of HERO_SYSTEM_CATALOGS) {
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
    for (const r of HERO_SYSTEM_CATALOGS) {
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
    for (const r of HERO_SYSTEM_CATALOGS) {
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
 * Specifiche del pool hero: priorità e righe additive per il modulo pool (Ticket 12).
 * L'unico posto di verità per priorità e natura additiva degli hero.
 */
function getHeroPoolSpec() {
    const slugMap = new Map();
    const sorted = [...HERO_SYSTEM_CATALOGS].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
    for (const r of sorted) {
        const slug = r.idBase.replace(/^yaca_/, '');
        if (!slugMap.has(slug)) {
            slugMap.set(slug, {
                slug,
                idBase: r.idBase,
                priority: r.priority,
                additive: Boolean(r.additive)
            });
        }
    }
    const slugs = Array.from(slugMap.values());
    const heroPriority = Object.freeze(slugs.map(s => s.slug));
    const slugAdditivi = Object.freeze(new Set(slugs.filter(s => s.additive).map(s => s.slug)));
    const catalogs = HERO_SYSTEM_CATALOGS.map(r => ({
        id: r.id,
        idBase: r.idBase,
        slug: r.idBase.replace(/^yaca_/, ''),
        type: r.type,
        priority: r.priority,
        additive: Boolean(r.additive)
    }));
    return {
        heroPriority,
        slugAdditivi,
        slugs,
        catalogs
    };
}

/**
 * Deterministic hash of the hero catalog registry.
 */
function getRegistryHash() {
    const canonicalPayload = HERO_SYSTEM_CATALOGS.map(r => ({
        id: r.id,
        idBase: r.idBase,
        type: r.type,
        name: r.name,
        emoji: r.emoji,
        label: r.label,
        desc: r.desc,
        mediaSet: r.mediaSet,
        anime: r.anime,
        alwaysVisible: r.alwaysVisible,
        strategy: r.strategy,
        uiType: r.uiType,
        priority: r.priority,
        additive: r.additive
    }));
    return crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex').slice(0, 16);
}

const HERO_IDS = Object.freeze(HERO_SYSTEM_CATALOGS.map(r => r.id));
const HERO_CATALOG_IDS_SET = new Set(HERO_IDS);

module.exports = {
    HERO_REGISTRY,
    HERO_SYSTEM_CATALOGS,
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
    getHeroPoolSpec,
    getRegistryHash
};
