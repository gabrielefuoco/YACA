/**
 * Estrazione DNA — verifica del confine (passo 2, ticket 22).
 *
 * Il motore matematico vive in `src/dna/dnaEngine.js`; i vecchi path
 * (`src/utils/dnaExtractor.js`, `src/utils/dnaRarity.js`,
 * `src/utils/tasteClusters.js`) sono thin-shim di riesportazione.
 *
 * Qui si verificano le due trappole silenziose dichiarate dal ticket:
 *  - `globalDfCache` deve restare **la stessa istanza** anche quando
 *    `duckDbStore` inietta attraverso `src/utils/dnaRarity.js`;
 *  - il modulo è puro (nessun require di Mongo/DuckDB/HTTP).
 * E si blinda il contratto dei consumatori esterni (script e tool).
 */

const fs = require('fs');
const path = require('path');

const dnaEngine = require('../../src/dna/dnaEngine');
const dnaRarity = require('../../src/utils/dnaRarity');
const dnaExtractor = require('../../src/utils/dnaExtractor');
const tasteClusters = require('../../src/utils/tasteClusters');
const keywordIds = require('../../src/data/keywordIds');

describe('estrazione DNA — thin-shim e identità del modulo', () => {
    it('i vecchi path riesportano le stesse funzioni di dnaEngine (identità referenziale)', () => {
        expect(dnaRarity.setGlobalDfCache).toBe(dnaEngine.setGlobalDfCache);
        expect(dnaRarity.getGlobalDfCache).toBe(dnaEngine.getGlobalDfCache);
        expect(dnaRarity.applySoftRarity).toBe(dnaEngine.applySoftRarity);
        expect(dnaRarity.applyLogSaturation).toBe(dnaEngine.applyLogSaturation);
        expect(dnaRarity.calculateFlatnessMetrics).toBe(dnaEngine.calculateFlatnessMetrics);
        expect(dnaRarity.DF_MIN_DEFAULT).toBe(dnaEngine.DF_MIN_DEFAULT);
        expect(dnaRarity.RARITY_MAX_WEIGHT).toBe(dnaEngine.RARITY_MAX_WEIGHT);
        expect(dnaRarity.RARITY_ALPHA).toBe(dnaEngine.RARITY_ALPHA);

        expect(dnaExtractor.computeFinalDNA).toBe(dnaEngine.computeFinalDNA);
        expect(dnaExtractor.extractStaticDNAFromQueries).toBe(dnaEngine.extractStaticDNAFromQueries);
        expect(dnaExtractor.extractActiveDNAFromTmdbData).toBe(dnaEngine.extractActiveDNAFromTmdbData);
        expect(dnaExtractor.normalizeVector).toBe(dnaEngine.normalizeVector);
        expect(dnaExtractor.calculateWeightedInteractions).toBe(dnaEngine.calculateWeightedInteractions);

        expect(tasteClusters.clusterTasteSignals).toBe(dnaEngine.clusterTasteSignals);
        expect(tasteClusters.shouldRecomputeClusters).toBe(dnaEngine.shouldRecomputeClusters);
        expect(tasteClusters.MIN_SIGNALS_FOR_CLUSTERING).toBe(dnaEngine.MIN_SIGNALS_FOR_CLUSTERING);
    });

    it('globalDfCache: la stessa istanza anche iniettando via src/utils/dnaRarity (path di duckDbStore)', () => {
        const injected = new Map([['k:extra', 5]]);
        const previous = dnaEngine.getGlobalDfCache();
        try {
            // È esattamente ciò che fa duckDbStore._buildDfCache.
            const { setGlobalDfCache } = require('../../src/utils/dnaRarity');
            setGlobalDfCache(injected);

            expect(dnaEngine.getGlobalDfCache()).toBe(injected);
            expect(dnaRarity.getGlobalDfCache()).toBe(injected);
            // La matematica del motore usa la mappa iniettata, non i fallback stimati:
            // df=5 -> cap 1.8; il fallback per k: sarebbe 1.684...
            expect(dnaEngine.getSoftRarityMultiplier('k:extra')).toBeCloseTo(1.8, 9);
            expect(dnaEngine.applySoftRarity({ 'k:extra': 100 })).toEqual({ 'k:extra': 180 });
            expect(dnaEngine.computeFinalDNA({ 'k:extra': 100 }, {}, 0)['k:extra']).toBeCloseTo(100, 9);
        } finally {
            dnaEngine.setGlobalDfCache(previous);
        }
    });

    it('scrive la cache una sola volta: dnaRarity non istanzia una propria variabile', () => {
        const source = fs.readFileSync(path.join(__dirname, '../../src/utils/dnaRarity.js'), 'utf8');
        expect(source).not.toMatch(/globalDfCache\s*=/);
        expect(source).toMatch(/require\(['"]\.\.\/dna\/dnaEngine['"]\)/);
    });

    it('il modulo è puro: nessun require di I/O (Mongo, DuckDB, HTTP, express)', () => {
        const source = fs.readFileSync(path.join(__dirname, '../../src/dna/dnaEngine.js'), 'utf8');
        const requires = [...source.matchAll(/require\((['"])([^'"]+)\1\)/g)].map((match) => match[2]);
        const forbidden = ['mongoose', 'duckdb', 'axios', 'express', '/http', 'node:http', 'fs'];
        for (const request of requires) {
            for (const token of forbidden) {
                expect(request.includes(token)).toBe(false);
            }
        }
        expect(requires).toEqual(
            expect.arrayContaining(['../data/keywordIds', '../engines/graph/HierarchicalGraph'])
        );
    });
});

describe('estrazione DNA — contratto dei consumatori esterni', () => {
    it('gli script di riparazione trovano ancora keywordIds intatto', () => {
        // scripts/repair-dna-vectors.js: sanitizeDnaVector
        expect(typeof keywordIds.sanitizeDnaVector).toBe('function');
        // scripts/repair-dna-names.js: isRetiredTmdbKeywordId
        expect(typeof keywordIds.isRetiredTmdbKeywordId).toBe('function');
        expect(typeof keywordIds.filterRetiredTmdbKeywords).toBe('function');
        expect(keywordIds.RETIRED_TMDB_KEYWORD_IDS.length).toBeGreaterThan(0);
    });

    it('i tool in .scratch/motore-raccomandazioni/tools trovano ProfileBuilder e ProfileScorer intatti', () => {
        const ProfileBuilder = require('../../src/profile/ProfileBuilder');
        const ProfileScorer = require('../../src/profile/ProfileScorer');
        // monkey-patch dei tool: syncUserHistory resta sovrascrivibile
        expect(typeof ProfileBuilder.syncUserHistory).toBe('function');
        expect(typeof ProfileBuilder.recomputeVectorsForUser).toBe('function');
        // scoring usato da clusterdiag/quickcheck/scorebench/scorediag
        expect(typeof ProfileScorer.calculateItemMatch).toBe('function');
        expect(typeof ProfileScorer.calculateBaseItemMatch).toBe('function');
        expect(typeof ProfileScorer._computeThematicScoreForVector).toBe('function');
        expect(typeof ProfileScorer.getItemNarrativeStrand).toBe('function');
    });

    it('i path legacy e il motore danno lo stesso risultato numerico', () => {
        const vStatic = { 'g:18': 200, 'k:isekai': 100, 'L1:c_85': 100 };
        const vActive = { 'g:18': 700, 'g:12': 200 };
        expect(dnaExtractor.computeFinalDNA(vStatic, vActive, 150)).toEqual(
            dnaEngine.computeFinalDNA(vStatic, vActive, 150)
        );
        expect(tasteClusters.clusterTasteSignals([])).toEqual(dnaEngine.clusterTasteSignals([]));
    });
});
