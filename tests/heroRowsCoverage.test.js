/**
 * Ticket 13 — il registro dei nuovi cataloghi.
 *
 * IL DIFETTO CHE QUESTA PROVA CHIUDE: il motore produce le righe dal ticket 06 in poi, ma il pool ne
 * assegnava solo quattro e **buttava le altre senza dirlo** (i `mondo_*` sparivano in silenzio). Qui:
 *  1. ogni ruolo del grafo ha il suo catalogo nel registro, o e' dichiarato «senza catalogo» con un log;
 *  2. i titoli arrivano davvero nel catalogo giusto (classici, ultime visioni, micro-cluster, ponte);
 *  3. il ponte, che il motore decompone in coppie, arriva in **un** catalogo, senza doppioni.
 */
const { HERO_STRATEGIES } = require('../src/pool');
const graphClient = require('../src/clients/graphClient');
const library = require('../src/library');
const { buildManifest } = require('../src/stremio');
const { HERO_CATALOG_IDS_SET, getHeroPoolSpec, getHeroRuoli } = require('../src/catalog/registry');

const RUOLI_SERVITI = [
    ...getHeroRuoli().hero.map((r) => r.ruolo),
    ...getHeroRuoli().micro,
    ...getHeroRuoli().ponte
];

const SEEDS = new Map([['603', 3], ['314', 4]]);

function titolo(tmdbId, medium = 'movie') {
    return { tmdbId, medium, punteggio: 0.9 };
}

function tutteLeRighe() {
    return [
        { ruolo: 'il_tuo_mondo', mondo: 1, descrizione: 'mondo', titoli: [titolo(1)] },
        { ruolo: 'un_passo_fuori', mondo: null, descrizione: 'vicini', titoli: [titolo(2)] },
        { ruolo: 'uscite_nuove', mondo: null, descrizione: 'uscite', titoli: [titolo(3)] },
        { ruolo: 'nicchia_di_qualita', mondo: null, descrizione: 'gemme', titoli: [titolo(4)] },
        { ruolo: 'classici_imperdibili', mondo: null, descrizione: 'classici', titoli: [titolo(5)] },
        { ruolo: 'ultime_visioni', mondo: null, descrizione: 'ultime', titoli: [titolo(6)] },
        { ruolo: 'micro_cluster_1', mondo: 2, descrizione: 'filone 1', titoli: [titolo(7)] },
        { ruolo: 'micro_cluster_2', mondo: 3, descrizione: 'filone 2', titoli: [titolo(8)] },
        { ruolo: 'micro_cluster_3', mondo: 4, descrizione: 'filone 3', titoli: [titolo(9)] },
        { ruolo: 'punti_incontro_1', mondo: null, descrizione: 'ponte 1', titoli: [titolo(10), titolo(11)] },
        { ruolo: 'punti_incontro_2', mondo: null, descrizione: 'ponte 2', titoli: [titolo(11), titolo(12)] },
        { ruolo: 'punti_incontro_3', mondo: null, descrizione: 'ponte 3', titoli: [titolo(13)] },
        { ruolo: 'mondo_2', mondo: 2, descrizione: 'altro mondo', titoli: [titolo(14)] }
    ];
}

async function esegui(righe, mediaType = 'movie') {
    jest.clearAllMocks();
    jest.spyOn(library, 'semiDi').mockResolvedValue({
        seeds: SEEDS,
        counts: { loved: 1, liked: 1, watched: 0, library: 0 }
    });
    jest.spyOn(graphClient, 'raccomanda').mockResolvedValue({
        contratto: 1,
        versioni: { artefatto: 'art-13', ricetta: 'ric-13' },
        semi: { n: 2, da_catalogo: false },
        liste: righe,
        motivi: []
    });
    const strategia = HERO_STRATEGIES.find((s) => s.slug === 'graph_rows');
    const assigned = {};
    await strategia.run(
        { userId: 'u1', context: 'p1', mediaType, userConfig: {} },
        { assigned, rawTraktResult: { traktAvailable: false } }
    );
    return assigned;
}

describe('Ticket 13: ogni riga del grafo ha il suo catalogo', () => {
    test('tutte le righe arrivano nel catalogo giusto', async () => {
        const assigned = await esegui(tutteLeRighe());
        const ids = (catalogo) => (assigned[catalogo] || []).map((i) => i.tmdbId);

        expect(ids('yaca_classici_movies')).toEqual([5]);
        expect(ids('yaca_ultime_visioni_movies')).toEqual([6]);
        expect(ids('yaca_micro_cluster_1_movies')).toEqual([7]);
        expect(ids('yaca_micro_cluster_2_movies')).toEqual([8]);
        expect(ids('yaca_micro_cluster_3_movies')).toEqual([9]);
        // Il ponte e' UN catalogo: le tre coppie si uniscono in ordine, senza doppioni (11 una volta).
        expect(ids('yaca_punti_incontro_movies')).toEqual([10, 11, 12, 13]);
        // anche le tre righe storiche, che il pool assegnava gia': la prova non deve fidarsi di un test
        // vecchio per una riga nuova (Ticket 13, review spec).
        expect(ids('yaca_mondi_movies')).toEqual([1]);
        expect(ids('yaca_passo_fuori_movies')).toEqual([2]);
        expect(ids('yaca_uscite_nuove_movies')).toEqual([3]);
        expect(ids('yaca_nicchia_di_qualita_movies')).toEqual([4]);
    });

    test('nessuna riga calcolata e poi buttata via in silenzio: i mondo_* sono dichiarati', async () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        await esegui(tutteLeRighe());
        const righeLog = log.mock.calls.map((c) => String(c[0])).join('\n');
        expect(righeLog).toContain('senza catalogo');
        expect(righeLog).toContain('mondo');
        log.mockRestore();
    });

    test("i ruoli che il motore puo' emettere sono tutti coperti (letto da services/graph/motore.py)", () => {
        // Il fixture qui sopra e' scritto a mano: un ruolo NUOVO nel motore verrebbe buttato via con un
        // log e la suite resterebbe verde. Questo test legge le stringhe `"tipo": ...` del motore e
        // pretende che ognuna abbia un catalogo, o sia dichiarata fuori catalogo. Le famiglie con un
        // indice si riconoscono dal suffisso (`micro_cluster_{i}` -> `micro_cluster`).
        const fs = require('fs');
        const path = require('path');
        const sorgente = fs.readFileSync(path.join(__dirname, '..', 'services', 'graph', 'motore.py'), 'utf8');
        const ruoli = new Set();
        for (const m of sorgente.matchAll(/"tipo":\s*f?"([a-z_0-9{}]+)"/g)) {
            ruoli.add(m[1].replace(/\{.*?\}/g, '').replace(/_$/, ''));
        }
        expect(ruoli.size).toBeGreaterThan(8);
        // L'unica famiglia che il prodotto NON ha come catalogo statico (Esito §6.2): una bolla per
        // ogni mondo acceso non sta in un manifest di Stremio.
        const FUORI_CATALOGO = ['mondo'];
        const coperto = (r) => [...RUOLI_SERVITI].some((s) => s === r || s.startsWith(`${r}_`));
        const scoperti = [...ruoli].filter((r) => !FUORI_CATALOGO.includes(r) && !coperto(r));
        expect(scoperti).toEqual([]);
    });

    test('ogni catalogo assegnato esiste nel registro', async () => {
        const assigned = await esegui(tutteLeRighe());
        for (const catalogo of Object.keys(assigned)) {
            expect(HERO_CATALOG_IDS_SET.has(catalogo)).toBe(true);
        }
    });

    test('ogni slug del registro e\' un catalogo del pool', async () => {
        const { slugs } = getHeroPoolSpec();
        const assigned = await esegui(tutteLeRighe());
        for (const { slug } of slugs) {
            expect(Object.keys(assigned)).toContain(`yaca_${slug}_movies`);
        }
    });

    test('lo slot di un filone che il motore non produce resta vuoto, non sparisce', async () => {
        const soloUno = tutteLeRighe().filter((r) => r.ruolo !== 'micro_cluster_2' && r.ruolo !== 'micro_cluster_3');
        const assigned = await esegui(soloUno);
        expect(assigned['yaca_micro_cluster_2_movies']).toEqual([]);
        expect(assigned['yaca_micro_cluster_3_movies']).toEqual([]);
    });

    test('il manifest dichiara le righe nuove', () => {
        const manifest = buildManifest({});
        const ids = manifest.catalogs.map((c) => c.id);
        for (const catalogo of [
            'yaca_classici_movies', 'yaca_classici_series',
            'yaca_ultime_visioni_movies', 'yaca_ultime_visioni_series',
            'yaca_punti_incontro_movies', 'yaca_punti_incontro_series',
            'yaca_micro_cluster_1_movies', 'yaca_micro_cluster_2_series', 'yaca_micro_cluster_3_movies'
        ]) {
            expect(ids).toContain(catalogo);
        }
    });
});
