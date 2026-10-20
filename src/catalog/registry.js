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
const DEFINIZIONI_STORICHE = [
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

Object.freeze(DEFINIZIONI_STORICHE)
/**
 * LE RIGHE NUOVE DEL CANTIERE «righe-vive» (Ticket 13).
 *
 * Il motore del grafo produce queste liste dal ticket 06 in poi, ma il registro ne conosceva solo
 * quattro: le altre arrivavano a `/api/mondi` e non a Stremio. Qui diventano cataloghi di sistema,
 * con **id stabili**: gli stessi che il registro espone al pool (`yaca_<slug>_<media>`).
 *
 * Gli slot dei micro-cluster sono tre e fissi (`micro_cluster_1..3`): il motore ne produce al massimo
 * tre, e un catalogo che compare e sparisce e' un guasto per Stremio, non una varieta'. Il ponte
 * («punti d'incontro») e' **uno** per medium: il motore lo decompone in coppie di filoni, il registro
 * no — il pool le unisce.
 */
const NUOVE_RIGHE_HERO = Object.freeze([
    { slug: 'classici', ruolo: 'classici_imperdibili', emoji: '🏛️', label: 'Classici imperdibili', priority: 5,
      desc: 'I capolavori del tuo micro-genere: molto votati, dentro il tuo bacino (Ticket 06).' },
    { slug: 'ultime_visioni', ruolo: 'ultime_visioni', emoji: '🕐', label: 'Sul filo delle ultime visioni', priority: 6,
      desc: 'Il filone che guardi adesso: la recenza come selezione, non come peso (Ticket 07).' },
    { slug: 'punti_incontro', ruolo: 'punti_incontro', ruoliPonte: 3, emoji: '🌉', label: "Punti d'incontro", priority: 7,
      desc: 'Titoli che ricevono massa da due filoni diversi: i ponti fra i tuoi gusti (Ticket 09).' },
    { slug: 'micro_cluster_1', ruolo: 'micro_cluster_1', emoji: '🧩', label: 'Il tuo filone 1', priority: 8,
      desc: 'Uno dei tuoi filoni, con la sua camminata e i suoi semi (Ticket 08).' },
    { slug: 'micro_cluster_2', ruolo: 'micro_cluster_2', emoji: '🧩', label: 'Il tuo filone 2', priority: 9,
      desc: 'Un altro dei tuoi filoni: non si fa schiacciare dal dominante (Ticket 08).' },
    { slug: 'micro_cluster_3', ruolo: 'micro_cluster_3', emoji: '🧩', label: 'Il tuo filone 3', priority: 10,
      desc: "Il terzo filone, quando ce n'e' uno (Ticket 08)." },
]);

const RAW_HERO_DEFINITIONS = Object.freeze([
    ...DEFINIZIONI_STORICHE,
    ...NUOVE_RIGHE_HERO.flatMap((r) => [['movies', ['film']], ['series', ['serie']]].map(([suffisso, mediaSet]) => ({
        id: `yaca_${r.slug}_${suffisso}`,
        name: `${r.emoji} ${r.label}`,
        emoji: r.emoji,
        mediaSet,
        anime: 'agnostic',
        filters: { strategy: r.slug },
        sort: { by: 'affinity_score', sortable: false },
        system: {
            isSystem: true,
            userModifiable: false,
            priority: r.priority,
            additive: true,
            alwaysVisible: false,
            strategy: null,
            uiType: 'algo',
            idBase: `yaca_${r.slug}`,
            label: r.label,
            desc: r.desc,
            provider: 'hybrid'
        }
    })))
]);

// IL RUOLO DEL MOTORE PER OGNI FAMIGLIA HERO (Ticket 13).
// Le quattro storiche hanno il ruolo del Ticket 02/03, che non coincide sempre con lo slug
// (`mondi` -> `il_tuo_mondo`); le sei nuove lo dichiarano nei loro dati. Questa e' l'unica tabella:
// il pool non tiene piu' una copia (una riga che il pool non conosce si DICHIARA, non sparisce).
const RUOLI_STORICI_PER_SLUG = Object.freeze({
    mondi: 'il_tuo_mondo',
    passo_fuori: 'un_passo_fuori',
    uscite_nuove: 'uscite_nuove',
    nicchia_di_qualita: 'nicchia_di_qualita'
});

function getHeroRuoli() {
    const hero = Object.entries(RUOLI_STORICI_PER_SLUG).map(([slug, ruolo]) => ({ ruolo, slug }));
    const micro = [];
    const ponte = [];
    for (const r of NUOVE_RIGHE_HERO) {
        if (r.ruoliPonte) {
            for (let i = 1; i <= r.ruoliPonte; i++) ponte.push(`${r.ruolo}_${i}`);
        } else if (/^micro_cluster_\d+$/.test(r.slug)) {
            micro.push(r.slug);
        } else {
            hero.push({ ruolo: r.ruolo, slug: r.slug });
        }
    }
    return Object.freeze({
        hero: Object.freeze(hero),
        micro: Object.freeze(micro),
        ponte: Object.freeze(ponte)
    });
}

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

const DAILY_WINDOW_CATALOG_IDS = Object.freeze(new Set([
    'preset_new_movies',
    'preset_new_series',
    'preset_new_series_eps',
    'preset_anime_shonen',
    'preset_anime_shoujo',
    'preset_anime_mecha',
    'preset_anime_isekai'
]));

function isDailyWindowCatalog(id) {
    return typeof id === 'string' && DAILY_WINDOW_CATALOG_IDS.has(id);
}

module.exports = {
    HERO_REGISTRY,
    HERO_SYSTEM_CATALOGS,
    HERO_PREFIXES,
    HERO_IDS,
    HERO_CATALOG_IDS_SET,
    DAILY_WINDOW_CATALOG_IDS,
    isDailyWindowCatalog,
    getManifestHeroCatalogs,
    getHeroCatalogFingerprintRows,
    getHeroCatalogModes,
    getHeroPrefixes,
    isHeroCatalogId,
    getHeroCatalogKindMap,
    getHeroUiGroups,
    getHeroPoolSpec,
    getHeroRuoli,
    getRegistryHash
};
