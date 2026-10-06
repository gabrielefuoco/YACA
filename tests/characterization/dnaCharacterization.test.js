/**
 * Characterization (golden master) del motore DNA — ticket 22.
 *
 * Questi test congelano il comportamento della matematica del DNA **prima**
 * dell'estrazione in `src/dna/dnaEngine.js` (passo 1 del ticket). Il vincolo è:
 *
 *  - passo 2 (estrazione a comportamento invariato): questo file resta **verde e
 *    immutato** — gli import puntano ai vecchi path (`src/utils/*`), che dopo lo
 *    spostamento diventano thin-shim di riesportazione;
 *  - passo 3 (correzione del difetto `V_active`): cambia **deliberatamente** solo
 *    il blocco "scala di V_active", con il motivo nel messaggio di commit.
 *
 * Le fixture sono sintetiche e deterministiche: niente Mongo, DuckDB, HTTP o rete.
 */

const {
    extractStaticDNAFromQueries,
    extractActiveDNAFromTmdbData,
    computeFinalDNA,
    calculateWeightedInteractions,
    normalizeVector,
} = require('../../src/utils/dnaExtractor');
const {
    computeTimeDecay,
    applyLogSaturation,
    getSoftRarityMultiplier,
    applySoftRarity,
    computeActiveDNA,
    getGlobalDfCache,
    setGlobalDfCache,
} = require('../../src/utils/dnaRarity');
const {
    cosineSimilarity,
    sparseNorm,
    sparseUnitNormalize,
    resolveK,
    clusterTasteSignals,
    shouldRecomputeClusters,
} = require('../../src/utils/tasteClusters');
const { sanitizeDnaVector } = require('../../src/data/keywordIds');
const ProfileScorer = require('../../src/profile/ProfileScorer');

// --- helper -----------------------------------------------------------------

const sumVector = (vector) =>
    Object.values(vector || {}).reduce((acc, value) => acc + Number(value || 0), 0);

const roundVector = (vector, digits = 9) =>
    Object.fromEntries(
        Object.entries(vector || {}).map(([key, value]) => [key, Number(Number(value).toFixed(digits))])
    );

// --- fixture congelate ------------------------------------------------------

const STATIC_QUERIES = [
    {
        with_genres: '18, 878',
        with_keywords: 'isekai, 9715, 363309',
        keyword: 'Cyberpunk|Alien',
        with_origin_country: 'US|JP',
    },
    { provider: 'kitsu', _keywordNames: 'mecha' },
    { with_genres: '18' },
];

// 15 chiavi: generi, keyword, paese, e propagazione gerarchica L1-L5.
const V_STATIC = extractStaticDNAFromQueries(STATIC_QUERIES);

const ACTIVE_ITEM = {
    genre_ids: [18, 878],
    keyword_ids: ['isekai', 123, 363309],
    origin_country: ['JP'],
    credits: { cast: [{ id: 1 }], crew: [{ id: 2, job: 'Director' }] },
};

const ACTIVE_ITEMS_WITH_WEIGHTS = [
    { data: { genre_ids: [18], keyword_ids: ['isekai'], origin_country: ['JP'] }, weight: 400 },
    { data: { genre_ids: [18, 878], keyword_ids: [123], origin_country: [] }, weight: 300 },
    { data: { genre_ids: [12], keyword_ids: ['isekai'], origin_country: ['US'] }, weight: 200 },
];

// `rawActive`: volumi accumulati come in ProfileBuilder.recomputeVectorsForUser.
const RAW_ACTIVE = (() => {
    const raw = {};
    for (const item of ACTIVE_ITEMS_WITH_WEIGHTS) {
        const dna = extractActiveDNAFromTmdbData(item.data, 100);
        for (const [key, value] of Object.entries(dna)) {
            raw[key] = (raw[key] || 0) + value * (item.weight / 100);
        }
    }
    return raw;
})();

// `V_active` come lo persiste OGGI ProfileBuilder: applyLogSaturation(rawActive, 100).
const V_ACTIVE = applyLogSaturation(RAW_ACTIVE, 100);

const ITEM_DNA = (dna) => dna;

const CLUSTER_ITEMS = (() => {
    const items = [];
    for (let i = 1; i <= 5; i++) items.push({ tmdbId: i, weight: 400, itemDna: ITEM_DNA({ 'g:16': 100, 'k:isekai': 80 }) });
    for (let i = 6; i <= 10; i++) items.push({ tmdbId: i, weight: 300, itemDna: ITEM_DNA({ 'g:28': 100, 'k:war': 80 }) });
    for (let i = 11; i <= 14; i++) items.push({ tmdbId: i, weight: 200, itemDna: ITEM_DNA({ 'g:35': 100, 'k:comedy': 80 }) });
    return items;
})();

const V_FINAL = computeFinalDNA(V_STATIC, V_ACTIVE, 150);

const PROFILE_BASE = {
    compiledVectors: { V_final: V_FINAL, V_clusters: [] },
    tmdbWeight: 1.0,
    traktWeight: 1.0,
};

const SCORER_CASES = {
    'align-strong': {
        genre_ids: [18, 878],
        keywords: [{ id: 'isekai' }, { id: 123 }],
        vote_average: 7.4,
        vote_count: 320,
        origin_country: ['JP'],
    },
    'alien-niche': {
        genre_ids: [35, 10749],
        keywords: [{ id: 'romcom' }],
        vote_average: 6.2,
        vote_count: 45,
        origin_country: ['US'],
    },
    'anime-strong': {
        genre_ids: [16],
        keywords: [{ id: 'isekai' }],
        vote_average: 8.1,
        vote_count: 5000,
        origin_country: ['JP'],
    },
    'cold-novotes': {
        genre_ids: [27],
        keywords: [],
        vote_average: 0,
        vote_count: 0,
        origin_country: [],
    },
};

const ORIGINAL_DF_CACHE = getGlobalDfCache();

beforeEach(() => {
    // Le fixture numeriche valgono con la cache df vuota (fallback stimati).
    setGlobalDfCache(null);
});

afterAll(() => {
    setGlobalDfCache(ORIGINAL_DF_CACHE);
});

// --- test -------------------------------------------------------------------

describe('DNA characterization — estrazione statica (extractStaticDNAFromQueries)', () => {
    it('congela il vettore statico completo: generi, keyword, paese, grafo L1-L5, kitsu', () => {
        expect(roundVector(V_STATIC, 9)).toEqual({
            'g:18': 200,
            'g:878': 100,
            'k:isekai': 100,
            'L1:c_85': 100,
            'L2:t_423': 50,
            'L3:v_53': 10,
            'L4:m_14': 5,
            'L5:r_2': 1,
            'k:9715': 100,
            'k:cyberpunk': 100,
            'k:alien': 100,
            'o:US': 100,
            'o:JP': 200,
            'g:16': 100,
            'k:mecha': 100,
        });
    });

    it('scarta le keyword ritirate TMDB e le chiavi persona', () => {
        expect(V_STATIC['k:363309']).toBeUndefined();
        expect(Object.keys(V_STATIC).some((key) => key.startsWith('a:') || key.startsWith('d:'))).toBe(false);
    });

    it('è vuoto e non lancia su input assente', () => {
        expect(extractStaticDNAFromQueries(null)).toEqual({});
        expect(extractStaticDNAFromQueries([])).toEqual({});
    });

    it('il dizionario Rosetta Kitsu aggiunge g:16, o:JP e le keyword testuali', () => {
        const result = extractStaticDNAFromQueries([{ provider: 'kitsu', _keywordNames: 'isekai' }]);
        expect(result).toEqual({ 'g:16': 100, 'o:JP': 100, 'k:isekai': 100 });
    });
});

describe('DNA characterization — estrazione attiva (extractActiveDNAFromTmdbData)', () => {
    it('congela il vettore attivo di un item con generi, keyword gerarchiche e paese', () => {
        expect(roundVector(extractActiveDNAFromTmdbData(ACTIVE_ITEM), 9)).toEqual({
            'g:18': 100,
            'g:878': 100,
            'k:isekai': 100,
            'L1:c_85': 100,
            'L2:t_423': 50,
            'L3:v_53': 10,
            'L4:m_14': 5,
            'L5:r_2': 1,
            'k:123': 100,
            'o:JP': 100,
        });
    });

    it('non muta il tmdbData di input', () => {
        const input = JSON.parse(JSON.stringify(ACTIVE_ITEM));
        extractActiveDNAFromTmdbData(ACTIVE_ITEM);
        expect(ACTIVE_ITEM).toEqual(input);
    });

    it('restituisce {} su input assente', () => {
        expect(extractActiveDNAFromTmdbData(null)).toEqual({});
    });
});

describe('DNA characterization — le due scale di normalizzazione', () => {
    it('normalizeVector normalizza a somma 1 (passaggio algebrico interno di computeFinalDNA)', () => {
        const normalized = normalizeVector({ 'g:18': 3, 'k:x': 1 });
        expect(normalized).toEqual({ 'g:18': 0.75, 'k:x': 0.25 });
        expect(sumVector(normalized)).toBeCloseTo(1, 12);
    });

    it('normalizeVector scarta le chiavi persona', () => {
        expect(normalizeVector({ 'g:18': 3, 'a:1': 5, 'd:2': 5, 'k:x': 1 })).toEqual({ 'g:18': 0.75, 'k:x': 0.25 });
    });

    it('sanitizeDnaVector normalizza a somma 100 (scala ontologica di persistenza)', () => {
        const sanitized = sanitizeDnaVector({ 'g:18': 3, 'k:x': 1 });
        expect(sanitized).toEqual({ 'g:18': 75, 'k:x': 25 });
        expect(sumVector(sanitized)).toBeCloseTo(100, 12);
    });

    it('sanitizeDnaVector scarta keyword ritirate e chiavi persona, poi rinormalizza a 100', () => {
        const sanitized = sanitizeDnaVector({ 'g:18': 60, 'k:363309': 20, 'a:1': 10, 'd:2': 10 });
        expect(sanitized).toEqual({ 'g:18': 100 });
    });

    it('sanitizeDnaVector su un vettore già a 100 restituisce una copia (identità nuova)', () => {
        const vector = { 'g:18': 50, 'g:878': 50 };
        const sanitized = sanitizeDnaVector(vector);
        expect(sanitized).not.toBe(vector);
        expect(sanitized).toEqual(vector);
    });

    it('le due scale sono la stessa matematica a fattore 100', () => {
        const vector = { 'g:18': 3, 'k:x': 1 };
        const unit = normalizeVector(vector);
        const hundred = sanitizeDnaVector(vector);
        for (const key of Object.keys(unit)) {
            expect(hundred[key]).toBeCloseTo(unit[key] * 100, 9);
        }
    });
});

describe('DNA characterization — rarità, saturazione e cache df', () => {
    it('computeTimeDecay: emivita 24 mesi e pavimento 0.01', () => {
        const now = new Date('2026-10-06T12:00:00Z').getTime();
        const months = (n) => n * 30.4375 * 24 * 60 * 60 * 1000;
        expect(computeTimeDecay(null, now)).toBe(1.0);
        expect(computeTimeDecay(new Date(now - months(24)), now, 24)).toBeCloseTo(0.5, 9);
        expect(computeTimeDecay(new Date(now - months(1200)), now, 24)).toBe(0.01);
    });

    it('applyLogSaturation congela f(x) = 100 * ln(1 + x/100)', () => {
        expect(roundVector(applyLogSaturation(RAW_ACTIVE, 100), 9)).toEqual({
            'g:18': 207.944154168,
            'k:isekai': 194.591014906,
            'L1:c_85': 194.591014906,
            'L2:t_423': 138.629436112,
            'L3:v_53': 47.000362925,
            'L4:m_14': 26.236426447,
            'L5:r_2': 5.826890812,
            'o:JP': 160.943791243,
            'g:878': 138.629436112,
            'k:123': 138.629436112,
            'g:12': 109.861228867,
            'o:US': 109.861228867,
        });
    });

    it('getSoftRarityMultiplier usa le stime di fallback per prefisso', () => {
        expect(getSoftRarityMultiplier('g:foo')).toBeCloseTo(1.072669823, 9);
        expect(getSoftRarityMultiplier('k:foo')).toBeCloseTo(1.684327042, 9);
        expect(getSoftRarityMultiplier('L1:foo')).toBeCloseTo(1.59091481, 9);
    });

    it('applySoftRarity è lineare: moltiplica per chiave, non normalizza', () => {
        const result = applySoftRarity({ 'g:18': 10, 'k:foo': 10 });
        expect(result['g:18']).toBeCloseTo(10 * getSoftRarityMultiplier('g:18'), 9);
        expect(result['k:foo']).toBeCloseTo(10 * getSoftRarityMultiplier('k:foo'), 9);
    });

    it('globalDfCache: setGlobalDfCache è una singola istanza di modulo e la rarità la usa davvero', () => {
        const injected = new Map([['k:foo', 5]]);
        setGlobalDfCache(injected);
        expect(getGlobalDfCache()).toBe(injected);
        // df reale 5 -> moltiplicatore 1.8 (cap), non il fallback 150 -> 1.684...
        expect(getSoftRarityMultiplier('k:foo')).toBeCloseTo(1.8, 9);
        expect(applySoftRarity({ 'k:foo': 100 })).toEqual({ 'k:foo': 180 });
    });

    it('globalDfCache: un df esplicito passato come argomento vince sulla cache di modulo', () => {
        setGlobalDfCache(new Map([['k:foo', 5]]));
        // df 30000 = frequenza di riferimento comune -> nessun boost di rarità.
        expect(getSoftRarityMultiplier('k:foo', new Map([['k:foo', 30000]]))).toBeCloseTo(1.0, 9);
        expect(getSoftRarityMultiplier('k:foo')).toBeCloseTo(1.8, 9);
    });
});

describe('DNA characterization — fusione finale (computeFinalDNA)', () => {
    it('coniuga V_static e V_active e normalizza a somma 100 (T=150)', () => {
        const vFinal = computeFinalDNA(V_STATIC, V_ACTIVE, 150);
        expect(sumVector(vFinal)).toBeCloseTo(100, 12);
        expect(roundVector(vFinal, 9)).toEqual({
            'g:18': 11.441197013,
            'g:878': 6.930060303,
            'k:isekai': 13.948244124,
            'L1:c_85': 13.174679021,
            'L2:t_423': 7.937538621,
            'L3:v_53': 2.226489453,
            'L4:m_14': 1.020201351,
            'L5:r_2': 0.209073808,
            'k:9715': 3.285233775,
            'k:cyberpunk': 3.285233775,
            'k:alien': 3.285233775,
            'o:US': 6.198124875,
            'o:JP': 10.250858181,
            'g:16': 2.092213118,
            'k:mecha': 3.285233775,
            'k:123': 7.596481845,
            'g:12': 3.833903186,
        });
    });

    it('con T=0 il peso attivo è 0: V_final = V_static normalizzato a 100, con le chiavi attive a 0', () => {
        const vFinal = computeFinalDNA(V_STATIC, V_ACTIVE, 0);
        expect(roundVector(vFinal, 9)).toEqual({
            'g:18': 11.54324479,
            'g:878': 5.771622395,
            'k:isekai': 9.062713862,
            'L1:c_85': 8.560098685,
            'L2:t_423': 3.893001004,
            'L3:v_53': 0.694835061,
            'L4:m_14': 0.28858112,
            'L5:r_2': 0.053806141,
            'k:9715': 9.062713862,
            'k:cyberpunk': 9.062713862,
            'k:alien': 9.062713862,
            'o:US': 6.0365397,
            'o:JP': 12.0730794,
            'g:16': 5.771622395,
            'k:mecha': 9.062713862,
            // Le chiavi presenti solo nel vettore attivo restano nell'unione con valore 0.
            'k:123': 0,
            'g:12': 0,
        });
        expect(vFinal['k:123']).toBe(0);
        expect(vFinal['g:12']).toBe(0);
    });

    it('la curva del peso attivo è w = 0.85 * T / (T + 50) e con T=50 vale 0.425', () => {
        const onlyActive = { 'g:18': 100 };
        const onlyStatic = { 'g:878': 100 };
        // w = 0.425 -> g:18 = 42.5, g:878 = 57.5 dopo rinormalizzazione a 100.
        const vFinal = computeFinalDNA(onlyStatic, onlyActive, 50);
        expect(vFinal['g:18']).toBeCloseTo(42.5, 9);
        expect(vFinal['g:878']).toBeCloseTo(57.5, 9);
    });

    it('con un solo vettore presente assegna peso 1.0 a quello non vuoto', () => {
        expect(roundVector(computeFinalDNA(V_STATIC, {}, 150), 9)).toEqual(roundVector(computeFinalDNA(V_STATIC, {}, 0), 9));
        const onlyActive = computeFinalDNA({}, V_ACTIVE, 0);
        expect(sumVector(onlyActive)).toBeCloseTo(100, 12);
        expect(onlyActive['g:18']).toBeGreaterThan(0);
    });

    it('senza segnali restituisce {}', () => {
        expect(computeFinalDNA({}, {}, 100)).toEqual({});
        expect(computeFinalDNA(null, null, 100)).toEqual({});
    });

    it('è invariante alla scala di V_active (la normalizzazione interna la annulla)', () => {
        const scaled = Object.fromEntries(
            Object.entries(V_ACTIVE).map(([key, value]) => [key, value * 0.001])
        );
        const a = computeFinalDNA(V_STATIC, V_ACTIVE, 150);
        const b = computeFinalDNA(V_STATIC, scaled, 150);
        for (const key of Object.keys(a)) {
            expect(b[key]).toBeCloseTo(a[key], 12);
        }
    });

    it('calculateWeightedInteractions: loved 4, liked 3, watched 2, libreria 0, default 2', () => {
        expect(calculateWeightedInteractions(null)).toBe(0);
        expect(
            calculateWeightedInteractions([
                { signals: [{ type: 'loved' }] },
                { signals: [{ type: 'liked' }] },
                { signals: [{ type: 'watched' }] },
                { signals: [{ type: 'library' }] },
                { signals: [] },
            ])
        ).toBe(4 + 3 + 2 + 0 + 2);
    });
});

describe('DNA characterization — clustering sparso (tasteClusters)', () => {
    it('matematica sparsa: norme, normalizzazione unitaria e coseno', () => {
        expect(sparseNorm({ 'g:28': 3, 'g:12': 4 })).toBeCloseTo(5, 12);
        expect(sparseUnitNormalize({ 'g:28': 3, 'g:12': 4 })).toEqual({ 'g:28': 0.6, 'g:12': 0.8 });
        expect(sparseUnitNormalize({})).toEqual({});
        expect(cosineSimilarity({ 'g:28': 1 }, { 'g:28': 2 })).toBeCloseTo(1, 12);
        expect(cosineSimilarity({ 'g:28': 1 }, { 'g:12': 1 })).toBe(0);
    });

    it('resolveK: cold start < 12, poi 3, 4, 5', () => {
        expect(resolveK(11)).toBe(0);
        expect(resolveK(12)).toBe(3);
        expect(resolveK(20)).toBe(4);
        expect(resolveK(35)).toBe(5);
    });

    it('clusterTasteSignals è deterministico: due esecuzioni identiche', () => {
        const first = clusterTasteSignals(CLUSTER_ITEMS);
        const second = clusterTasteSignals(CLUSTER_ITEMS);
        expect(second).toEqual(first);
    });

    it('clusterTasteSignals congela i 3 cluster, i seed e le masse', () => {
        expect(clusterTasteSignals(CLUSTER_ITEMS)).toEqual([
            { vector: { 'g:16': 40.63, 'k:isekai': 59.37 }, mass: 2000, massShare: 0.4651, seeds: [1, 2, 3, 4, 5] },
            { vector: { 'g:28': 40.7726, 'k:war': 59.2274 }, mass: 1500, massShare: 0.3488, seeds: [6, 7, 8, 9, 10] },
            { vector: { 'g:35': 41.1466, 'k:comedy': 58.8534 }, mass: 800, massShare: 0.186, seeds: [11, 12, 13, 14] },
        ]);
    });

    it('clusterTasteSignals non parte sotto la soglia minima di segnali (cold start)', () => {
        expect(clusterTasteSignals(CLUSTER_ITEMS.slice(0, 11))).toEqual([]);
        expect(clusterTasteSignals([])).toEqual([]);
        expect(clusterTasteSignals(null)).toEqual([]);
    });

    it('shouldRecomputeClusters: ricalcola su cluster assenti, crollo sotto soglia e Jaccard < 0.85', () => {
        const current = CLUSTER_ITEMS;
        const meta = { signalCount: 14, itemIds: CLUSTER_ITEMS.map((i) => i.tmdbId) };
        expect(shouldRecomputeClusters(null, meta, current)).toBe(true);
        expect(shouldRecomputeClusters(clusterTasteSignals(CLUSTER_ITEMS), meta, current)).toBe(false);
        expect(shouldRecomputeClusters(clusterTasteSignals(CLUSTER_ITEMS), meta, CLUSTER_ITEMS.slice(0, 11))).toBe(true);
        const drifted = current.map((item, idx) => ({ ...item, tmdbId: idx < 5 ? item.tmdbId : 100 + item.tmdbId }));
        expect(shouldRecomputeClusters(clusterTasteSignals(CLUSTER_ITEMS), meta, drifted)).toBe(true);
    });
});

describe('DNA characterization — scala di V_active (corretta nel passo 3, ticket 22)', () => {
    it('V_active persistito è saturato e rinormalizzato a somma 100, come la rotta REST', () => {
        const persisted = computeActiveDNA(RAW_ACTIVE);
        expect(sumVector(persisted)).toBeCloseTo(100, 9);
        expect(roundVector(persisted, 6)).toEqual({
            'g:18': 14.1195,
            'k:isekai': 13.212816,
            'L1:c_85': 13.212816,
            'L2:t_423': 9.413,
            'L3:v_53': 3.191346,
            'L4:m_14': 1.781465,
            'L5:r_2': 0.395648,
            'o:JP': 10.928155,
            'g:878': 9.413,
            'k:123': 9.413,
            'g:12': 7.459626,
            'o:US': 7.459626,
        });
    });

    it('applyLogSaturation resta l\'algebra interna a somma libera (pre-normalizzazione)', () => {
        const saturated = applyLogSaturation(RAW_ACTIVE, 100);
        expect(sumVector(saturated)).toBeCloseTo(1472.744421476, 6);
        expect(roundVector(saturated, 6)['g:18']).toBeCloseTo(207.944154, 6);
    });

    it('la normalizzazione di V_active non cambia V_final: computeFinalDNA è invariante di scala', () => {
        const saturated = applyLogSaturation(RAW_ACTIVE, 100);
        const normalized = computeActiveDNA(RAW_ACTIVE);
        const before = computeFinalDNA(V_STATIC, saturated, 150);
        const after = computeFinalDNA(V_STATIC, normalized, 150);
        for (const key of Object.keys(before)) {
            expect(after[key]).toBeCloseTo(before[key], 12);
        }
        // Il confronto con la rotta REST è ora una stessa-scala, non più due scale.
        expect(sumVector(sanitizeDnaVector(saturated))).toBeCloseTo(sumVector(normalized), 9);
    });
});

describe('DNA characterization — scoring VSM (golden master)', () => {
    it('_computeThematicScoreForVector congela il prodotto scalare DNA x item', () => {
        const HierarchicalGraph = require('../../src/engines/graph/HierarchicalGraph');
        const hVector = HierarchicalGraph.vectorizeKeywords([{ id: 'isekai' }, { id: 123 }]);
        expect(ProfileScorer._computeThematicScoreForVector(V_FINAL, [18, 878], hVector)).toBeCloseTo(57.335181368, 9);
    });

    it('calculateBaseItemMatch congela i punteggi dei 4 item campione', () => {
        expect(ProfileScorer.calculateBaseItemMatch(SCORER_CASES['align-strong'], PROFILE_BASE)).toBeCloseTo(10, 9);
        expect(ProfileScorer.calculateBaseItemMatch(SCORER_CASES['alien-niche'], PROFILE_BASE)).toBeCloseTo(6.33695051, 9);
        expect(ProfileScorer.calculateBaseItemMatch(SCORER_CASES['anime-strong'], PROFILE_BASE)).toBeCloseTo(8.105167975, 9);
        expect(ProfileScorer.calculateBaseItemMatch(SCORER_CASES['cold-novotes'], PROFILE_BASE)).toBeCloseTo(1.625, 9);
    });

    it('calculateItemMatch con i 4 cluster congela i punteggi multi-vettore', () => {
        const profileClusters = {
            ...PROFILE_BASE,
            compiledVectors: { V_final: V_FINAL, V_clusters: clusterTasteSignals(CLUSTER_ITEMS) },
        };
        expect(ProfileScorer.calculateBaseItemMatch(SCORER_CASES['align-strong'], profileClusters)).toBeCloseTo(10, 9);
        expect(ProfileScorer.calculateBaseItemMatch(SCORER_CASES['alien-niche'], profileClusters)).toBeCloseTo(3.495635699, 9);
        expect(ProfileScorer.calculateBaseItemMatch(SCORER_CASES['anime-strong'], profileClusters)).toBeCloseTo(9.757785387, 9);
        expect(ProfileScorer.calculateBaseItemMatch(SCORER_CASES['cold-novotes'], profileClusters)).toBeCloseTo(1.625, 9);
    });

    it('una copia del vettore produce lo stesso punteggio (il WeakMap memoizza, non cambia i numeri)', () => {
        const profileCopy = {
            ...PROFILE_BASE,
            compiledVectors: { V_final: { ...V_FINAL }, V_clusters: [] },
        };
        expect(ProfileScorer.calculateBaseItemMatch(SCORER_CASES['alien-niche'], profileCopy)).toBeCloseTo(
            ProfileScorer.calculateBaseItemMatch(SCORER_CASES['alien-niche'], PROFILE_BASE),
            12
        );
    });

    it('lo scoring non muta V_final né V_clusters (identità stabile per la WeakMap)', () => {
        const before = JSON.parse(JSON.stringify(V_FINAL));
        const profileClusters = {
            ...PROFILE_BASE,
            compiledVectors: { V_final: V_FINAL, V_clusters: clusterTasteSignals(CLUSTER_ITEMS) },
        };
        const clustersBefore = JSON.parse(JSON.stringify(profileClusters.compiledVectors.V_clusters));
        for (const item of Object.values(SCORER_CASES)) {
            ProfileScorer.calculateItemMatch(item, profileClusters, {});
        }
        expect(V_FINAL).toEqual(before);
        expect(profileClusters.compiledVectors.V_clusters).toEqual(clustersBefore);
    });
});
