/**
 * L'identità delle keyword: id **e** nome sono la stessa cosa.
 *
 * PERCHÉ QUESTO FILE ESISTE
 * Il grafo gerarchico (`src/data/hierarchical_graph.json`) è indicizzato **per
 * nome**: `kw_to_L1['mission']`. Tutto il resto della pipeline consegna **ID
 * numerici**: il parquet (`[{"id":10364,"name":"mission"}]`), i preset
 * (`with_keywords: '10364'`), `ProfileBuilder` (`keywords.map(k => k.id || k)`).
 *
 * Da quella asimmetria nascevano due difetti distinti, entrambi silenziosi:
 *
 *  1. **Il join impossibile.** `ProfileScorer._computeThematicScoreForVector`
 *     confronta le chiavi del profilo con quelle dell'item *per uguaglianza*.
 *     Freddo, il profilo porta `k:10364` e l'item porta `k:mission` + `L1:…`:
 *     nessuna chiave si incontra, e il punteggio tematico si riduce ai generi.
 *  2. **Il DNA deciso dall'ordine delle richieste.** `singleKwCache` usava la
 *     chiave `id:<id>` sia per l'oggetto `{id,name}` sia per il solo id: chi
 *     passava l'id ereditava nome e livelli *solo se* quel numero era già stato
 *     visto con il nome nello stesso processo. Misurato su un titolo reale:
 *     **14 chiavi a freddo, 74 a caldo**. Sulla top-50 dei cataloghi: metà del
 *     catalogo cambiava (`Jaccard 50%` su 64 preset).
 *
 * Il fix ha due gambe, e questo file le tiene insieme: la mappa id↔nome iniettata
 * dal dump (`keywordNameForId` / `keywordIdForName`) e le cache che descrivono la
 * forma dell'input invece di confonderla.
 *
 * Se un giorno qualcuno "semplifica" la chiave di cache tornando a `id:<id>`, o
 * toglie la risoluzione del nome perché «tanto a caldo funziona», questo file
 * prende un rosso e spiega perché.
 */
const HierarchicalGraph = require('../src/engines/graph/HierarchicalGraph');
const {
    setKeywordNameMaps,
    keywordNameForId,
    keywordIdForName,
    isRetiredTmdbKeywordId
} = require('../src/data/keywordIds');
const { extractStaticDNAFromQueries } = require('../src/utils/dnaExtractor');
const { setGlobalDfCache, getSoftRarityMultiplier } = require('../src/dna/dnaEngine');
const { computeTopKeywords } = require('../src/engines/hybrid/scoringEngine');

// Keyword reale del grafo: da sola produce k:10364, k:mission e la catena L1–L5.
const MISSION = { id: 10364, name: 'mission' };

const LEVEL_KEY = /^L[1-5]:/;
const keysOf = vector => Object.keys(vector);

const withNameMap = () => {
    setKeywordNameMaps({
        idToName: new Map([['10364', 'mission']]),
        nameToId: new Map([['mission', '10364']])
    });
    HierarchicalGraph.invalidateKeywordCaches();
};

const withoutNameMap = () => {
    setKeywordNameMaps({});
    HierarchicalGraph.invalidateKeywordCaches();
};

afterEach(() => {
    withoutNameMap();
    setGlobalDfCache(null);
});

describe('mappa id <-> nome', () => {
    test('risolve nei due sensi e ignora ciò che non conosce', () => {
        withNameMap();
        expect(keywordNameForId('10364')).toBe('mission');
        expect(keywordNameForId(10364)).toBe('mission');
        expect(keywordNameForId('999999')).toBeNull();
        expect(keywordIdForName('mission')).toBe('10364');
        expect(keywordIdForName('  MISSION ')).toBe('10364');
        expect(keywordIdForName('sconosciuta')).toBeNull();
    });

    test('un nome non viene mai filtrato come keyword ritirata', () => {
        // Il filtro è per ID: applicato a un nome deve dire "no", non "sì" per caso.
        expect(isRetiredTmdbKeywordId('mission')).toBe(false);
        expect(isRetiredTmdbKeywordId('10364')).toBe(false);
    });
});

describe('vectorizeKeywords: la forma dell\'input non cambia il risultato', () => {
    test('con la mappa, il solo id produce esattamente il vettore dell\'oggetto', () => {
        withNameMap();
        const fromId = HierarchicalGraph.vectorizeKeywords(['10364']);
        const fromObject = HierarchicalGraph.vectorizeKeywords([MISSION]);

        expect(fromObject).toEqual(fromId);
        // Sanity: la risoluzione è avvenuta davvero (non due vettori poveri uguali).
        expect(keysOf(fromId)).toContain('k:mission');
        expect(keysOf(fromId).filter(k => LEVEL_KEY.test(k)).length).toBeGreaterThan(0);
    });

    test('l\'ordine delle chiamate non cambia il vettore (id prima / oggetto prima)', () => {
        withNameMap();

        HierarchicalGraph.invalidateKeywordCaches();
        const idFirst = HierarchicalGraph.vectorizeKeywords(['10364']);
        const objectAfter = HierarchicalGraph.vectorizeKeywords([MISSION]);

        HierarchicalGraph.invalidateKeywordCaches();
        const objectFirst = HierarchicalGraph.vectorizeKeywords([MISSION]);
        const idAfter = HierarchicalGraph.vectorizeKeywords(['10364']);

        expect(idFirst).toEqual(objectFirst);
        expect(objectAfter).toEqual(idAfter);
    });

    test('senza mappa, l\'id resta povero e non eredita il nome visto prima', () => {
        withoutNameMap();

        const rich = HierarchicalGraph.vectorizeKeywords([MISSION]);
        const poor = HierarchicalGraph.vectorizeKeywords(['10364']);

        expect(keysOf(rich)).toContain('k:mission');
        expect(keysOf(poor)).toEqual(['k:10364']);
    });

    test('anche la cache a livello di array distingue le due forme', () => {
        withoutNameMap();
        expect(keysOf(HierarchicalGraph.vectorizeKeywords([MISSION, { id: 1566, name: 'dreams' }])))
            .not.toEqual(keysOf(HierarchicalGraph.vectorizeKeywords(['10364', '1566'])));

        withNameMap();
        expect(keysOf(HierarchicalGraph.vectorizeKeywords(['10364', '1566'])))
            .toContain('k:mission');
    });
});

describe('il DNA del profilo incontra le chiavi dell\'item', () => {
    test('un preset con id numerici produce chiavi a nome e gerarchiche', () => {
        withNameMap();
        const vStatic = extractStaticDNAFromQueries([{ with_keywords: '10364', with_genres: '27' }]);
        const keys = keysOf(vStatic);

        expect(keys).toContain('k:10364');
        expect(keys).toContain('k:mission');
        expect(keys.filter(k => LEVEL_KEY.test(k)).length).toBeGreaterThan(0);
    });

    test('l\'intersezione profilo/item non è vuota (era il difetto)', () => {
        withNameMap();
        const profile = extractStaticDNAFromQueries([{ with_keywords: '10364' }]);
        const item = HierarchicalGraph.vectorizeKeywords([MISSION]);

        const shared = keysOf(item).filter(key => profile[key] !== undefined);
        expect(shared).toContain('k:mission');
        expect(shared.some(key => LEVEL_KEY.test(key))).toBe(true);
    });

    test('senza mappa l\'intersezione si riduce al solo id numerico', () => {
        withoutNameMap();
        const profile = extractStaticDNAFromQueries([{ with_keywords: '10364' }]);
        const item = HierarchicalGraph.vectorizeKeywords([MISSION]);

        const shared = keysOf(item).filter(key => profile[key] !== undefined);
        expect(shared).toEqual(['k:10364']);
    });
});

describe('computeTopKeywords resta una lista di ID', () => {
    test('scarta i nomi, deduplica e tiene il peso maggiore', () => {
        withNameMap();
        const profile = {
            compiledVectors: {
                V_final: { 'g:27': 10, 'k:10364': 5, 'k:mission': 3, 'k:sconosciuta': 9 }
            }
        };
        expect(computeTopKeywords(profile, 5)).toEqual(['10364']);
    });

    test('senza mappa un nome non risolvibile non diventa un id fasullo', () => {
        withoutNameMap();
        const profile = { compiledVectors: { V_final: { 'k:mission': 5, 'g:27': 1 } } };
        expect(computeTopKeywords(profile, 5)).toEqual([]);
    });
});

describe('rarità dolce: le due forme della stessa keyword pesano uguale', () => {
    test('con la mappa del dump in cache, id e nome hanno lo stesso moltiplicatore', () => {
        withNameMap();
        setGlobalDfCache(new Map([['k:10364', 4200], ['k:mission', 4200]]));
        expect(getSoftRarityMultiplier('k:mission')).toBeCloseTo(getSoftRarityMultiplier('k:10364'), 10);
    });

    test('se il dump indicizza solo gli id, il nome ricade sulla stima e il peso cambia', () => {
        withNameMap();
        setGlobalDfCache(new Map([['k:10364', 4200]]));
        // È il motivo per cui `buildDfCache` deve scrivere entrambe le forme.
        expect(getSoftRarityMultiplier('k:mission')).not.toBeCloseTo(getSoftRarityMultiplier('k:10364'), 4);
    });
});
