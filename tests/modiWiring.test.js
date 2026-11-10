/**
 * Cablaggio delle modalità attraverso il percorso di lettura (ticket 01/02/04),
 * dietro il flag `MODI_ABILITATI`.
 *
 * Due metà nette:
 *  · FLAG OFF — caratterizzazione: manifest, impronta e chiave di cache sono
 *    bit-identici a prima (baseline misurata PRIMA del cablaggio).
 *  · FLAG ON — la modalità cambia i cataloghi del manifest, la chiave di cache,
 *    l'attivazione è mutuamente esclusiva, un modo ignoto è 400, `modo` è immutabile.
 */

const baseline = require('./fixtures/modi_senza_modo_baseline.json');
const { buildManifest, buildManifestFingerprint } = require('../src/stremio');
const { buildShelfCacheKey } = require('../src/cache/shelfKey');
const {
    modiAbilitati,
    leggiModoAttivo,
    cataloghiDelModo,
    derivaLeve,
    selettoriDaLeve,
    materializzaModi
} = require('../src/profile/modo');
const { contestoDi } = require('../src/profile/context');
const { elencaModi, attivaModo, validaModo } = require('../src/profile/attivazioneModi');
const AddonConfig = require('../src/models/AddonConfig');
const UserConfig = require('../src/models/UserConfig');
const UserAccount = require('../src/models/UserAccount');

// Fixture della chiave di cache misurata con il codice PRE-cablaggio.
const FIXTURE_CHIAVE_SCAFFALI = Object.freeze({
    semi: [
        { tmdbId: 603, plays: 2, eta_giorni: 10, medium: 'movie' },
        { tmdbId: 1399, plays: 5, eta_giorni: 3, medium: 'series' }
    ],
    medium: 'movie',
    opzioni: { cozy: 0.3, canone: -0.2 },
    cap: 60,
    versioni: { artefatto: 'a1', ricetta: 'r1' }
});
// La chiave è cambiata quando il budget di scaffali (`n`) è entrato nell'impronta: con 8 e con 16
// la risposta del grafo è diversa, e la cache non deve restituire le righe della richiesta precedente.
// Il valore vecchio era b1165f5a36f2feae81f80eabdce1fbd35e47bccae81e6ebf51f1b4ca76257710.
// v2: la chiave porta CHIAVE_VERSIONE = 2 (età ignota non più riempita con l'indice).
// v1 era 424b0007c42e3dea087cb3e94430502afa463ba5a719460dca481d2c46968b11.
const CHIAVE_SCAFFALI_PRE_CABLAGGIO = 'fd739bed0fc7510b44d28a06b726e7d06bda93099ffe700806dacae0aa46066b';

function configConModi({ attivo = 'film' } = {}) {
    const profili = materializzaModi({ profiles: [] }).profiles;
    return {
        activeProfileId: `modo_${attivo}`,
        activeModo: attivo,
        config: {
            activeProfileId: `modo_${attivo}`,
            activeModo: attivo,
            sliders: { tonalita: 0.4, notorieta: -0.3 },
            cataloghi: {
                generale: [{ id: 'preset_pop_movies', ordine: 0 }, { id: 'preset_pop_series', ordine: 1 }],
                film: [{ id: 'preset_pop_movies', ordine: 0 }],
                serie: [{ id: 'preset_pop_series', ordine: 0 }],
                anime: [{ id: 'preset_pop_anime', ordine: 0 }],
                bambini: []
            }
        },
        profiles: profili,
        customCatalogs: []
    };
}

function idsCatalogo(manifest) {
    return manifest.catalogs.map(c => c.id);
}

beforeEach(() => {
    delete process.env.MODI_ABILITATI;
    jest.restoreAllMocks();
});

afterAll(() => {
    delete process.env.MODI_ABILITATI;
});

describe('flag OFF: il comportamento è quello di sempre', () => {
    it('il flag è spento quando la variabile è assente o vale 0', () => {
        expect(modiAbilitati()).toBe(false);
        process.env.MODI_ABILITATI = '0';
        expect(modiAbilitati()).toBe(false);
        process.env.MODI_ABILITATI = '';
        expect(modiAbilitati()).toBe(false);
        process.env.MODI_ABILITATI = '1';
        expect(modiAbilitati()).toBe(true);
    });

    it('manifest e impronta di un documento senza modo restano bit-identici alla baseline', () => {
        const config = JSON.parse(JSON.stringify(baseline.config));

        expect(buildManifestFingerprint(config)).toBe(baseline.fingerprint);
        expect(buildManifest(config, 'http://localhost:7000', 'characterisation-user', { shelves: [] }))
            .toEqual(baseline.manifest);
    });

    it('la chiave di cache degli scaffali è quella di prima, senza la modalità', () => {
        const chiave = buildShelfCacheKey({ ...FIXTURE_CHIAVE_SCAFFALI, modo: 'film' });
        // La costante cambia quando cambia il CODICE che calcola gli scaffali, non quando cambia
        // la modalità: la chiave porta la versione (2 = età ignota non più riempita con
        // l'indice del seme) e non contiene il campo `modo`. Qui si fissa che a flag spento
        // la modalità non entri nella chiave: è questo che il test protegge.
        expect(chiave).toBe(CHIAVE_SCAFFALI_PRE_CABLAGGIO);
    });

    it('le nuove funzioni di cablaggio non entrano nel manifest della baseline', () => {
        const config = JSON.parse(JSON.stringify(baseline.config));
        // Anche se il documento portasse i campi d'account, senza flag non contano.
        config.config = {
            ...(config.config || {}),
            activeModo: 'film',
            cataloghi: { film: [{ id: 'preset_pop_movies', ordine: 0 }] }
        };

        expect(buildManifestFingerprint(config)).toBe(baseline.fingerprint);
    });

    it('il contesto non espone la modalità e legge ancora i selettori del profilo', async () => {
        const documento = {
            uuid: 'addon-off',
            config: { activeProfileId: 'p1' },
            profiles: [{
                id: 'p1',
                name: 'Profilo',
                catalogs: [],
                settings: { typeSelectors: { anime: 'only' }, kidsMode: true, sliders: { cozy: 0.5, canone: 0.1 } }
            }]
        };
        jest.spyOn(AddonConfig, 'findOne').mockReturnValue({ lean: jest.fn().mockResolvedValue(documento) });

        const contesto = await contestoDi({ userId: 'u1', addonUuid: 'addon-off', profileId: 'p1' });

        expect(contesto.modo).toBeUndefined();
        expect(contesto.selettoriEffettivi.anime).toBe('only');
        expect(contesto.kidsMode).toBe(true);
        expect(contesto.sliders).toEqual({ cozy: 0.5, canone: 0.1 });
    });
});

describe('flag ON: la modalità governa la lettura', () => {
    beforeEach(() => {
        process.env.MODI_ABILITATI = '1';
    });

    it('leggiModoAttivo usa config.activeModo, poi il modo del profilo attivo', () => {
        const config = configConModi({ attivo: 'serie' });
        expect(leggiModoAttivo(config)).toBe('serie');

        delete config.config.activeModo;
        expect(leggiModoAttivo(config)).toBe('serie');
    });

    it('un profilo legacy senza modo ricade sul ponte dai selettori salvati', () => {
        const legacy = {
            config: { activeProfileId: 'p1' },
            profiles: [{ id: 'p1', settings: { typeSelectors: { anime: 'only' }, kidsMode: false } }]
        };
        expect(leggiModoAttivo(legacy)).toBe('anime');
    });

    it('i cataloghi del modo arrivano nell\'ordine dichiarato', () => {
        const config = configConModi();
        config.config.cataloghi.film = [
            { id: 'preset_top_rated_movies', ordine: 2 },
            { id: 'preset_pop_movies', ordine: 1 }
        ];
        expect(cataloghiDelModo(config, 'film').map(v => v.id))
            .toEqual(['preset_pop_movies', 'preset_top_rated_movies']);
    });

    it('la modalità cambia l\'insieme di cataloghi del manifest (film vs serie)', () => {
        const film = buildManifest(configConModi({ attivo: 'film' }), 'http://localhost:7000', 'u', { shelves: [] });
        const serie = buildManifest(configConModi({ attivo: 'serie' }), 'http://localhost:7000', 'u', { shelves: [] });

        expect(idsCatalogo(film)).toContain('preset_pop_movies');
        expect(idsCatalogo(film)).not.toContain('preset_pop_series');
        expect(idsCatalogo(serie)).toContain('preset_pop_series');
        expect(idsCatalogo(serie)).not.toContain('preset_pop_movies');
    });

    it('la modalità anime dichiara solo cataloghi anime', () => {
        const anime = buildManifest(configConModi({ attivo: 'anime' }), 'http://localhost:7000', 'u', { shelves: [] });
        expect(idsCatalogo(anime)).toContain('preset_pop_anime');
        expect(idsCatalogo(anime)).not.toContain('preset_pop_movies');
    });

    it('l\'impronta include la modalità attiva e i suoi cataloghi', () => {
        const film = configConModi({ attivo: 'film' });
        const serie = configConModi({ attivo: 'serie' });
        expect(buildManifestFingerprint(film)).not.toBe(buildManifestFingerprint(serie));

        const filmConAltroCatalogo = configConModi({ attivo: 'film' });
        filmConAltroCatalogo.config.cataloghi.film = [{ id: 'preset_pop_series', ordine: 0 }];
        expect(buildManifestFingerprint(filmConAltroCatalogo)).not.toBe(buildManifestFingerprint(film));

        // Determinismo: due letture identiche danno la stessa impronta (niente bump a ogni riavvio).
        expect(buildManifestFingerprint(film)).toBe(buildManifestFingerprint(configConModi({ attivo: 'film' })));
    });

    it('la chiave di cache cambia fra due modalità e non è quella di prima', () => {
        const film = buildShelfCacheKey({ ...FIXTURE_CHIAVE_SCAFFALI, modo: 'film' });
        const serie = buildShelfCacheKey({ ...FIXTURE_CHIAVE_SCAFFALI, modo: 'serie' });

        expect(film).not.toBe(serie);
        expect(film).not.toBe(CHIAVE_SCAFFALI_PRE_CABLAGGIO);
    });

    it('le leve vengono da derivaLeve e i selettori sono una sua proiezione', () => {
        expect(selettoriDaLeve(derivaLeve('film'))).toEqual({ film: true, serie: false, anime: 'exclude' });
        expect(selettoriDaLeve(derivaLeve('serie'))).toEqual({ film: false, serie: true, anime: 'exclude' });
        expect(selettoriDaLeve(derivaLeve('generale'))).toEqual({ film: true, serie: true, anime: 'neutral' });
        expect(selettoriDaLeve(derivaLeve('bambini'))).toEqual({ film: true, serie: true, anime: 'neutral' });
    });

    it('il contesto deriva selettori, kids e cursori dalla modalità, non dal profilo', async () => {
        const config = configConModi({ attivo: 'film' });
        // Il profilo contraddice la modalità: con il flag acceso la modalità vince.
        config.profiles[1].settings = { typeSelectors: { anime: 'only' }, kidsMode: true, sliders: { cozy: -1, canone: -1 } };
        jest.spyOn(AddonConfig, 'findOne').mockReturnValue({ lean: jest.fn().mockResolvedValue(config) });

        const contesto = await contestoDi({ userId: 'u1', addonUuid: 'addon-on', user: config });

        expect(contesto.modo).toBe('film');
        expect(contesto.selettoriEffettivi).toEqual({ film: true, serie: false, anime: 'exclude' });
        expect(contesto.kidsMode).toBe(false);
        expect(contesto.sliders).toEqual({ cozy: 0.4, canone: -0.3 });
    });
});

describe('attivazione delle modalità', () => {
    function documentoConModi({ attivo = 'generale', conModi = false } = {}) {
        const profiles = conModi
            ? materializzaModi({ profiles: [] }).profiles
            : [{
                id: 'profilo-vecchio',
                name: 'Il mio profilo',
                catalogs: [{ id: 'x' }],
                settings: { typeSelectors: { anime: 'exclude' }, kidsMode: false }
            }];
        const profiloAttivo = profiles.find(p => p.modo === attivo)?.id || profiles[0].id;
        return {
            uuid: 'addon-modi',
            profiles,
            customCatalogs: [{ id: 'mio-catalogo', name: 'Mio', type: 'movie' }],
            config: {
                activeProfileId: profiloAttivo,
                ...(conModi ? { activeModo: attivo } : {}),
                configVersion: 'v1',
                manifestFingerprint: 'impronta-vecchia'
            }
        };
    }

    beforeEach(() => {
        process.env.MODI_ABILITATI = '1';
        jest.spyOn(AddonConfig, 'updateOne').mockResolvedValue({ matchedCount: 1 });
    });

    it('elenca le cinque modalità con nome fisso, emoji, chi è attiva e le leve', () => {
        const elenco = elencaModi(documentoConModi({ conModi: true, attivo: 'serie' }));

        expect(elenco.modi.map(m => m.modo)).toEqual(['generale', 'film', 'serie', 'anime', 'bambini']);
        expect(elenco.modi.map(m => m.nome)).toEqual(['Generale', 'Film', 'Serie', 'Anime', 'Bambini']);
        expect(elenco.modi.filter(m => m.attivo).map(m => m.modo)).toEqual(['serie']);
        expect(elenco.modi.find(m => m.modo === 'film').leve).toEqual({ medium: 'movie', anime: 'exclude', kids: false });
    });

    it('attiva una modalità e ne spegne ogni altra (mutuamente esclusivo)', async () => {
        const documento = documentoConModi({ conModi: true });
        jest.spyOn(AddonConfig, 'findOne').mockReturnValue({ lean: jest.fn().mockResolvedValue(documento) });

        const risultato = await attivaModo({ userId: 'u1', addonUuid: 'addon-modi', modo: 'film' });

        expect(risultato.attivo).toBe('film');
        expect(risultato.modi.filter(m => m.attivo)).toHaveLength(1);
        const set = AddonConfig.updateOne.mock.calls[0][1].$set;
        expect(set['config.activeModo']).toBe('film');
        expect(set['config.activeProfileId']).toBe('modo_film');
        // `modo` non si tocca: le caselle non vengono riscritte.
        expect(set.profiles).toBeUndefined();
    });

    it('materializza le caselle mancanti senza toccare i profili esistenti', async () => {
        const documento = documentoConModi();
        jest.spyOn(AddonConfig, 'findOne').mockReturnValue({ lean: jest.fn().mockResolvedValue(documento) });

        await attivaModo({ userId: 'u1', addonUuid: 'addon-modi', modo: 'bambini' });

        const set = AddonConfig.updateOne.mock.calls[0][1].$set;
        expect(set.profiles).toHaveLength(6);
        expect(set.profiles[0]).toEqual(documento.profiles[0]);
        expect(set.profiles.map(p => p.modo).filter(Boolean)).toEqual(['generale', 'film', 'serie', 'anime', 'bambini']);
        expect(set['config.activeModo']).toBe('bambini');
    });

    it('alza pendingStremioResync quando l\'impronta cambia (ticket 04)', async () => {
        const documento = documentoConModi({ conModi: true });
        jest.spyOn(AddonConfig, 'findOne').mockReturnValue({ lean: jest.fn().mockResolvedValue(documento) });

        const risultato = await attivaModo({ userId: 'u1', addonUuid: 'addon-modi', modo: 'anime' });

        const set = AddonConfig.updateOne.mock.calls[0][1].$set;
        expect(risultato.manifestChanged).toBe(true);
        expect(set['config.pendingStremioResync']).toBe(true);
        expect(set['config.configVersion']).not.toBe('v1');
        expect(typeof set['config.manifestFingerprint']).toBe('string');
    });

    it('un modo sconosciuto è un errore 400, non un default silenzioso', async () => {
        expect(() => validaModo('plays')).toThrow(expect.objectContaining({ status: 400 }));
        expect(() => validaModo(undefined)).toThrow(expect.objectContaining({ status: 400 }));

        await expect(attivaModo({ userId: 'u1', addonUuid: 'addon-modi', modo: 'play' }))
            .rejects.toMatchObject({ status: 400 });
        expect(AddonConfig.updateOne).not.toHaveBeenCalled();
    });
});

describe('immutabilità di `modo` nel percorso di update', () => {
    beforeEach(() => {
        process.env.MODI_ABILITATI = '1';
    });

    it('un profilo già munito di modo non cambia modo, nemmeno con il flag acceso', async () => {
        const existingConfig = {
            uuid: 'addon-immutabile',
            profiles: [{ id: 'modo_film', name: 'Film', modo: 'film', catalogs: [], settings: {} }],
            customCatalogs: [],
            config: { activeProfileId: 'modo_film', configVersion: 'v1', manifestFingerprint: 'fp' }
        };
        jest.spyOn(UserAccount, 'findOne').mockResolvedValue({ userId: 'u1', addonUuid: 'addon-immutabile', apiKeys: {} });
        jest.spyOn(AddonConfig, 'findOne').mockReturnValue({ lean: jest.fn().mockResolvedValue(existingConfig) });
        jest.spyOn(UserAccount, 'findOneAndUpdate').mockResolvedValue({ userId: 'u1', addonUuid: 'addon-immutabile', apiKeys: {} });
        jest.spyOn(AddonConfig, 'findOneAndUpdate').mockImplementation(async (_q, update) => ({
            ...existingConfig,
            profiles: update.$set?.profiles ?? existingConfig.profiles,
            config: { ...existingConfig.config, configVersion: 'v2' }
        }));

        await UserConfig.saveUser({
            userId: 'u1',
            profiles: [{ id: 'modo_film', name: 'Film', modo: 'anime', catalogs: [], settings: {} }]
        });

        const salvati = AddonConfig.findOneAndUpdate.mock.calls[0][1].$set.profiles;
        expect(salvati[0].modo).toBe('film');
    });
});
