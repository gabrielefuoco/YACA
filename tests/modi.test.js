/**
 * Fondamenta del modello «il profilo è una modalità» (ticket 01).
 * Additive: questi test non descrivono alcun comportamento nuovo nel prodotto,
 * fissano la tabella e i contratti dei soli helper.
 */

const {
    MODI,
    derivaLeve,
    materializzaModi,
    leggiSliders,
    scriviSliders,
    applicaImmutabilitaModo
} = require('../src/profile/modo');

const UserConfig = require('../src/models/UserConfig');
const UserAccount = require('../src/models/UserAccount');
const AddonConfig = require('../src/models/AddonConfig');
const { buildManifest, buildManifestFingerprint } = require('../src/stremio');
const baseline = require('./fixtures/modi_senza_modo_baseline.json');

function expectCinqueModi(config) {
    expect(config.profiles.filter(p => p.modo).map(p => p.modo)).toEqual(MODI);
}

describe('derivaLeve: la tabella delle cinque modalità', () => {
    it.each([
        ['generale', { medium: null, anime: 'neutral', kids: false }],
        ['film', { medium: 'movie', anime: 'exclude', kids: false }],
        ['serie', { medium: 'series', anime: 'exclude', kids: false }],
        ['anime', { medium: null, anime: 'only', kids: false }],
        ['bambini', { medium: null, anime: 'neutral', kids: true }]
    ])('%s -> %j', (modo, attese) => {
        expect(derivaLeve(modo)).toEqual(attese);
    });

    it('rifiuta un modo sconosciuto invece di indovinare', () => {
        expect(() => derivaLeve('documentari')).toThrow(TypeError);
    });

    it('restituisce una copia: mutare il risultato non cambia la tabella', () => {
        const leve = derivaLeve('film');
        leve.medium = 'series';
        expect(derivaLeve('film').medium).toBe('movie');
    });
});

describe('materializzaModi', () => {
    it('crea le cinque modalità mancanti senza toccare i profili esistenti', () => {
        const esistente = { id: 'profilo-vecchio', name: 'Mio profilo', catalogs: [{ id: 'x' }] };
        const config = { profiles: [esistente] };

        const risultato = materializzaModi(config);

        expect(risultato).toBe(config);
        expect(config.profiles[0]).toBe(esistente);
        expect(esistente).toEqual({ id: 'profilo-vecchio', name: 'Mio profilo', catalogs: [{ id: 'x' }] });
        expect(config.profiles).toHaveLength(6);
        expectCinqueModi(config);
    });

    it('è idempotente: chiamata due volte lascia la configurazione identica', () => {
        const config = materializzaModi({});
        const prima = JSON.stringify(config);

        materializzaModi(config);

        expect(JSON.stringify(config)).toBe(prima);
        expect(config.profiles).toHaveLength(5);
    });

    it('non duplica una modalità già presente e non la modifica', () => {
        const film = { id: 'p1', name: 'Il mio film', emoji: '🎬', modo: 'film', catalogs: [] };
        const config = { profiles: [film] };

        materializzaModi(config);

        expect(config.profiles[0]).toBe(film);
        expect(film).toEqual({ id: 'p1', name: 'Il mio film', emoji: '🎬', modo: 'film', catalogs: [] });
        expect(config.profiles).toHaveLength(5);
        expect(config.profiles.filter(p => p.modo === 'film')).toHaveLength(1);
    });

    it('crea le caselle vuote: nome fisso, emoji vuota, nessun catalogo', () => {
        const config = materializzaModi({});
        for (const profilo of config.profiles) {
            expect(MODI).toContain(profilo.modo);
            expect(profilo.emoji).toBe('');
            expect(profilo.catalogs).toEqual([]);
        }
        expect(config.profiles.map(p => p.name)).toEqual(['Generale', 'Film', 'Serie', 'Anime', 'Bambini']);
    });
});

describe('immutabilità del modo nel percorso di update', () => {
    let existingConfig;

    beforeEach(() => {
        jest.restoreAllMocks();
        existingConfig = {
            uuid: 'addon-modo',
            profiles: [
                {
                    id: 'profilo-film',
                    name: 'Film',
                    modo: 'film',
                    catalogs: [],
                    settings: { typeSelectors: { film: true, serie: false, anime: 'exclude' } }
                }
            ],
            customCatalogs: [],
            config: {
                activeProfileId: 'profilo-film',
                configVersion: 'v1',
                manifestFingerprint: 'fingerprint-esistente'
            }
        };

        jest.spyOn(UserAccount, 'findOne').mockResolvedValue({
            userId: 'u1',
            addonUuid: 'addon-modo',
            apiKeys: {}
        });
        jest.spyOn(AddonConfig, 'findOne').mockReturnValue({
            lean: jest.fn().mockResolvedValue(existingConfig)
        });
        jest.spyOn(UserAccount, 'findOneAndUpdate').mockResolvedValue({
            userId: 'u1',
            addonUuid: 'addon-modo',
            apiKeys: {}
        });
        jest.spyOn(AddonConfig, 'findOneAndUpdate').mockImplementation(async (_query, update) => ({
            ...existingConfig,
            profiles: update.$set?.profiles ?? existingConfig.profiles,
            config: { ...existingConfig.config, configVersion: 'v2' }
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('ignora un tentativo di cambiare il modo di un profilo già persistito', async () => {
        await UserConfig.saveUser({
            userId: 'u1',
            profiles: [{
                id: 'profilo-film',
                name: 'Rinominato',
                modo: 'anime',
                catalogs: [],
                settings: { typeSelectors: { anime: 'only' } }
            }]
        });

        const profiliSalvati = AddonConfig.findOneAndUpdate.mock.calls[0][1].$set.profiles;
        expect(profiliSalvati[0].modo).toBe('film');
        expect(profiliSalvati[0].name).toBe('Rinominato');
    });

    it('preserva il modo se il payload non lo porta affatto', async () => {
        await UserConfig.saveUser({
            userId: 'u1',
            profiles: [{ id: 'profilo-film', name: 'Senza modo', catalogs: [], settings: {} }]
        });

        expect(AddonConfig.findOneAndUpdate.mock.calls[0][1].$set.profiles[0].modo).toBe('film');
    });

    it('accetta un modo su un profilo che non ne aveva ancora uno (prima materializzazione)', async () => {
        existingConfig.profiles[0].modo = undefined;

        await UserConfig.saveUser({
            userId: 'u1',
            profiles: [{ id: 'profilo-film', name: 'Film', modo: 'serie', catalogs: [], settings: {} }]
        });

        expect(AddonConfig.findOneAndUpdate.mock.calls[0][1].$set.profiles[0].modo).toBe('serie');
    });

    it('scarta un valore invalido su un profilo senza modo', () => {
        expect(applicaImmutabilitaModo({ id: 'p' }, { id: 'p', modo: 'documentari' })).toEqual({ id: 'p' });
    });
});

describe('cursori d\'account', () => {
    it('ricade sui valori del profilo attivo quando config.sliders è assente', () => {
        const config = {
            config: { activeProfileId: 'p1' },
            profiles: [{
                id: 'p1',
                settings: { sliders: { cozy: 0.6, canone: -0.5 } }
            }]
        };

        expect(leggiSliders(config)).toEqual({ tonalita: 0.6, notorieta: -0.5 });
    });

    it('legge i valori d\'account quando presenti', () => {
        const config = {
            config: { activeProfileId: 'p1', sliders: { tonalita: 1, notorieta: 0.25 } },
            profiles: [{ id: 'p1', settings: { sliders: { cozy: 0, canone: 0 } } }]
        };

        expect(leggiSliders(config)).toEqual({ tonalita: 1, notorieta: 0.25 });
    });

    it('senza profilo attivo restituisce zeri neutri', () => {
        expect(leggiSliders({ config: {} })).toEqual({ tonalita: 0, notorieta: 0 });
    });

    it('scrive i cursori a livello account senza toccare il profilo', () => {
        const config = {
            config: { activeProfileId: 'p1' },
            profiles: [{ id: 'p1', settings: { sliders: { cozy: 0.6, canone: -0.5 } } }]
        };

        const risultato = scriviSliders(config, { tonalita: -1, notorieta: 0.4 });

        expect(risultato).toBe(config);
        expect(config.config.sliders).toEqual({ tonalita: -1, notorieta: 0.4 });
        expect(config.profiles[0].settings.sliders).toEqual({ cozy: 0.6, canone: -0.5 });
        expect(leggiSliders(config)).toEqual({ tonalita: -1, notorieta: 0.4 });
    });
});

describe('caratterizzazione: senza modo tutto si comporta come prima', () => {
    it('il manifest e la fingerprint di un documento senza modo sono bit-identici alla baseline', () => {
        const config = JSON.parse(JSON.stringify(baseline.config));
        expect(config.profiles.every(profilo => profilo.modo === undefined)).toBe(true);

        expect(buildManifestFingerprint(config)).toBe(baseline.fingerprint);
        expect(buildManifest(config, 'http://localhost:7000', 'characterisation-user', { shelves: [] }))
            .toEqual(baseline.manifest);
    });

    it('i nuovi campi (dna d\'account e sliders) non entrano nel manifest', () => {
        const config = JSON.parse(JSON.stringify(baseline.config));
        config.dna = { genres: { '28': 50 }, keywords: {}, networks: {} };
        config.config = { ...(config.config || {}), sliders: { tonalita: 1, notorieta: -1 } };

        expect(buildManifestFingerprint(config)).toBe(baseline.fingerprint);
    });

    it('un AddonConfig senza modo resta valido: il campo non è obbligatorio', () => {
        const documento = new AddonConfig({
            uuid: 'uuid-senza-modo',
            profiles: JSON.parse(JSON.stringify(baseline.config.profiles))
        });

        expect(documento.validateSync()).toBeUndefined();
        expect(documento.profiles[0].modo).toBeUndefined();
    });

    it('il modello rifiuta un modo fuori dall\'enum, ma accetta i cinque valori', () => {
        const valido = new AddonConfig({
            uuid: 'uuid-modo-valido',
            profiles: [{ id: 'p', name: 'P', modo: 'bambini' }]
        });
        expect(valido.validateSync()).toBeUndefined();

        const invalido = new AddonConfig({
            uuid: 'uuid-modo-invalido',
            profiles: [{ id: 'p', name: 'P', modo: 'documentari' }]
        });
        expect(invalido.validateSync()).toBeDefined();
    });
});
