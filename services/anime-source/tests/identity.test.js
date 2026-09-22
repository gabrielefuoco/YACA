const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { IdentityResolver } = require('../src/identity');

describe('Identity Resolver', () => {
    test('risolve correttamente Dandadan da fixture reali Fribb e Anibridge', () => {
        const fribbFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/fribb_dandadan.json'), 'utf8'));
        const anibridgeFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/anibridge_dandadan.json'), 'utf8'));

        const resolver = new IdentityResolver();
        resolver.loadFromData({ fribbData: fribbFixture, anibridgeData: anibridgeFixture });

        // Risoluzione tramite AniList ID 171018
        const resFromAnilist = resolver.resolve({ anilistId: 171018 });
        assert.ok(resFromAnilist, 'Deve risolvere da anilist_id');
        assert.strictEqual(resFromAnilist.tmdbId, '240411');
        assert.strictEqual(resFromAnilist.kitsuId, '48269');
        assert.strictEqual(resFromAnilist.anilistId, 171018);
        assert.strictEqual(resFromAnilist.season, 1);

        // Risoluzione tramite MAL ID 57334
        const resFromMal = resolver.resolve({ malId: 57334 });
        assert.ok(resFromMal, 'Deve risolvere da mal_id');
        assert.strictEqual(resFromMal.tmdbId, '240411');
        assert.strictEqual(resFromMal.kitsuId, '48269');
        assert.strictEqual(resFromMal.malId, 57334);
        assert.strictEqual(resFromMal.season, 1);

        // Risoluzione con entrambi forniti (come fa AnimeUnity)
        const resBoth = resolver.resolve({ anilistId: 171018, malId: 57334 });
        assert.ok(resBoth);
        assert.strictEqual(resBoth.tmdbId, '240411');
        assert.strictEqual(resBoth.kitsuId, '48269');
    });

    test('ritorna null per ID sconosciuti (nessun fuzzy matching sui titoli, nessun dato inventato)', () => {
        const resolver = new IdentityResolver();
        resolver.loadFromData({ fribbData: [], anibridgeData: {} });

        const res = resolver.resolve({ anilistId: 99999999, malId: 88888888 });
        assert.strictEqual(res, null);

        const resEmpty = resolver.resolve({});
        assert.strictEqual(resEmpty, null);
    });
});
