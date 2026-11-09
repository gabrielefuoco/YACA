/**
 * Esplora e Cataloghi attivi, lato server (ticket 05/06).
 *
 * Fissa le regole decise: un catalogo compare solo dove è servibile, i gruppi
 * vuoti spariscono, l'attivazione è idempotente e in coda, l'ordine rifiuta id
 * estranei/duplicati/mancanti, e ogni scrittura invalida il manifest.
 */

jest.mock('../src/stremio/shelvesResolver', () => ({
    resolveProfileShelves: jest.fn()
}));

const { resolveProfileShelves } = require('../src/stremio/shelvesResolver');
const AddonConfig = require('../src/models/AddonConfig');
const {
    elencaEsplora,
    attivaCatalogo,
    riordinaCataloghi,
    tipoDi,
    servibileNelModo,
    modoAttivoStretto
} = require('../src/profile/cataloghiEsplora');
const { derivaLeve } = require('../src/profile/modo');
const { buildManifestFingerprint } = require('../src/stremio/fingerprint');

const SCAFFALI = [
    { catalog_id: 'yaca_mondi_movies', nome: 'I tuoi mondi', medium: 'movie', slot: 1, anime: false },
    { catalog_id: 'yaca_passi_series', nome: 'Passi fuori', medium: 'series', slot: 2, anime: false }
];

function utente({
    modo = 'film',
    cataloghi = {},
    customCatalogs = [],
    activeModo = undefined
} = {}) {
    return {
        userId: 'u1',
        addonUuid: 'addon-esplora',
        activeProfileId: `modo_${modo}`,
        ...(activeModo !== undefined ? { activeModo } : { activeModo: modo }),
        cataloghi,
        configVersion: 'v1',
        manifestFingerprint: 'fp-vecchia',
        profiles: [{ id: `modo_${modo}`, modo }],
        customCatalogs
    };
}

function voci(...ids) {
    return ids.map((id, ordine) => ({ id, ordine }));
}

beforeEach(() => {
    process.env.MODI_ABILITATI = '1';
    jest.restoreAllMocks();
    resolveProfileShelves.mockResolvedValue(SCAFFALI);
    jest.spyOn(AddonConfig, 'updateOne').mockResolvedValue({ matchedCount: 1 });
});

afterAll(() => {
    delete process.env.MODI_ABILITATI;
});

describe('GET: gruppi per modalità', () => {
    it('in Film una creazione film c\'è, in Bambini no', async () => {
        const creazione = [{ id: 'crea-film', name: 'La mia creazione', type: 'movie' }];

        const film = await elencaEsplora(utente({ modo: 'film', customCatalogs: creazione }));
        expect(film.gruppi.creazioni.map(v => v.id)).toEqual(['crea-film']);
        expect(film.gruppi.creazioni[0]).toMatchObject({ tipo: 'film', fonte: 'creazione', attivo: false, ordine: null });

        const bambini = await elencaEsplora(utente({ modo: 'bambini', customCatalogs: creazione }));
        expect(bambini.gruppi).not.toHaveProperty('creazioni');
    });

    it('i suggerimenti sono le righe del resolver del manifest, già ordinate per slot', async () => {
        const risposta = await elencaEsplora(utente({ modo: 'generale' }));

        expect(resolveProfileShelves).toHaveBeenCalled();
        expect(risposta.gruppi.suggerimenti.map(v => v.id)).toEqual(['yaca_mondi_movies', 'yaca_passi_series']);
        expect(risposta.gruppi.suggerimenti[0]).toMatchObject({ fonte: 'grafo', tipo: 'film' });
        expect(risposta.gruppi.suggerimenti[1]).toMatchObject({ fonte: 'grafo', tipo: 'serie' });
    });

    it('un gruppo senza niente dentro è OMESSO, non restituito come []', async () => {
        resolveProfileShelves.mockResolvedValue([]);
        const risposta = await elencaEsplora(utente({ modo: 'film' }));

        expect(risposta.gruppi).not.toHaveProperty('suggerimenti');
        expect(risposta.gruppi).not.toHaveProperty('creazioni');
        expect(Object.values(risposta.gruppi).every(g => Array.isArray(g) && g.length > 0)).toBe(true);
        expect(risposta.modo).toBe('film');
    });

    it('la watchlist segue il modo: in Serie niente anime, in Anime solo anime', async () => {
        const serie = await elencaEsplora(utente({ modo: 'serie' }));
        expect(serie.gruppi.watchlist.map(v => v.id)).toEqual(['yaca_watchlist_series']);

        const anime = await elencaEsplora(utente({ modo: 'anime' }));
        expect(anime.gruppi.watchlist.map(v => v.id)).toEqual(['yaca_watchlist_anime']);
    });

    it('in Bambini restano le righe della persona e i cataloghi curati', async () => {
        const risposta = await elencaEsplora(utente({ modo: 'bambini' }));

        expect(risposta.gruppi.suggerimenti).toBeDefined();
        expect(risposta.gruppi.watchlist).toBeDefined();
        // «Tutti» in Bambini contiene solo preset curati per l'infanzia.
        expect(risposta.gruppi.tutti.length).toBeGreaterThan(0);
        expect(risposta.gruppi.tutti.every(v => v.tipo === 'bambini' || v.tipo === 'anime')).toBe(true);
    });

    it('i tipi sono quelli dei badge: film, serie, anime, bambini', () => {
        const presetMap = new Map(require('../src/catalog/presets').getPresets().map(p => [p.id, p]));
        expect(tipoDi(presetMap.get('preset_pop_movies'), presetMap)).toBe('film');
        expect(tipoDi(presetMap.get('preset_pop_series'), presetMap)).toBe('serie');
        expect(tipoDi(presetMap.get('preset_pop_anime'), presetMap)).toBe('anime');
        expect(tipoDi(presetMap.get('preset_pixar'), presetMap)).toBe('bambini');
        expect(tipoDi({ id: 'yaca_watchlist_anime', type: 'anime' }, presetMap)).toBe('anime');
        expect(tipoDi({ id: 'yaca_watchlist_series', type: 'series' }, presetMap)).toBe('serie');
    });

    it('la servibilità in Bambini passa dalla curatela, non da un lasciapassare', () => {
        const presetMap = new Map(require('../src/catalog/presets').getPresets().map(p => [p.id, p]));
        const leveBambini = derivaLeve('bambini');
        expect(servibileNelModo({ id: 'crea-film', name: 'X', type: 'movie' }, 'creazione', leveBambini, presetMap)).toBe(false);
        expect(servibileNelModo(presetMap.get('preset_pixar'), 'preset', leveBambini, presetMap)).toBe(true);
        expect(servibileNelModo({ id: 'yaca_watchlist_movies', type: 'movie' }, 'watchlist', leveBambini, presetMap)).toBe(true);
    });

    it('gli attivi arrivano con attivo:true e il loro ordine', async () => {
        const risposta = await elencaEsplora(utente({
            modo: 'film',
            cataloghi: { film: voci('preset_pop_movies', 'preset_top_rated_movies') }
        }));

        const attivi = risposta.gruppi.tutti.filter(v => v.attivo)
            .sort((a, b) => a.ordine - b.ordine);
        expect(attivi.map(v => [v.id, v.ordine])).toEqual([
            ['preset_pop_movies', 0],
            ['preset_top_rated_movies', 1]
        ]);
    });

    it('un modo persistito sconosciuto è 400, non un default', async () => {
        await expect(elencaEsplora(utente({ activeModo: 'play' })))
            .rejects.toMatchObject({ status: 400, code: 'modo_non_valido' });
        expect(() => modoAttivoStretto({ activeModo: 'plays' })).toThrow(expect.objectContaining({ status: 400 }));
    });
});

describe("Il medium della modalità vale anche nell'elenco", () => {
    // In Film il gestore risponde `serie:false`: elencare gli scaffali di serie
    // produceva cataloghi promessi e mai servibili (anteprima sempre vuota).
    it('in Film non compare uno scaffale di serie', async () => {
        resolveProfileShelves.mockResolvedValue([
            { catalog_id: 'yaca_1_movie', nome: 'Film', medium: 'movie', slot: 1, anime: false },
            { catalog_id: 'yaca_2_series', nome: 'Serie', medium: 'series', slot: 2, anime: false }
        ]);
        const risultato = await elencaEsplora(utente({ modo: 'film' }));
        const ids = Object.values(risultato.gruppi).flat().map(v => v.id);
        expect(ids).toContain('yaca_1_movie');
        expect(ids).not.toContain('yaca_2_series');
    });

    it('in Generale compaiono entrambi, perché il medium non è fissato', async () => {
        resolveProfileShelves.mockResolvedValue([
            { catalog_id: 'yaca_1_movie', nome: 'Film', medium: 'movie', slot: 1, anime: false },
            { catalog_id: 'yaca_2_series', nome: 'Serie', medium: 'series', slot: 2, anime: false }
        ]);
        const risultato = await elencaEsplora(utente({ modo: 'generale' }));
        const ids = Object.values(risultato.gruppi).flat().map(v => v.id);
        expect(ids).toEqual(expect.arrayContaining(['yaca_1_movie', 'yaca_2_series']));
    });
});

describe('POST attiva: idempotenza e coda', () => {
    it('attiva in coda e riscrive cataloghi[modo] con l\'ordine progressivo', async () => {
        const user = utente({ modo: 'film', cataloghi: { film: voci('preset_pop_series', 'preset_top_rated_series') } });
        // La modalità film non serve i preset serie: uso due preset film.
        user.cataloghi.film = voci('preset_pop_movies');

        const risultato = await attivaCatalogo({ userConfig: user, id: 'preset_top_rated_movies', attivo: true });

        const set = AddonConfig.updateOne.mock.calls[0][1].$set;
        expect(set['config.cataloghi'].film).toEqual([
            { id: 'preset_pop_movies', ordine: 0 },
            { id: 'preset_top_rated_movies', ordine: 1 }
        ]);
        expect(risultato.attivo).toBe(true);
        expect(set['config.pendingStremioResync']).toBe(true);
    });

    it('è idempotente: la seconda attivazione non scrive e non bumpa', async () => {
        const user = utente({ modo: 'film', cataloghi: { film: voci('preset_pop_movies') } });

        const primo = await attivaCatalogo({ userConfig: user, id: 'preset_pop_movies', attivo: true });
        expect(primo.manifestChanged).toBe(false);
        expect(AddonConfig.updateOne).not.toHaveBeenCalled();

        const secondo = await attivaCatalogo({ userConfig: user, id: 'preset_pop_movies', attivo: true });
        expect(secondo.manifestChanged).toBe(false);
        expect(AddonConfig.updateOne).not.toHaveBeenCalled();
    });

    it('disattivare rimuove e ricompatta l\'ordine', async () => {
        const user = utente({
            modo: 'film',
            cataloghi: { film: voci('preset_pop_movies', 'preset_top_rated_movies', 'preset_new_movies') }
        });

        await attivaCatalogo({ userConfig: user, id: 'preset_top_rated_movies', attivo: false });

        const set = AddonConfig.updateOne.mock.calls[0][1].$set;
        expect(set['config.cataloghi'].film).toEqual([
            { id: 'preset_pop_movies', ordine: 0 },
            { id: 'preset_new_movies', ordine: 1 }
        ]);
    });

    it('l\'impronta cambia sull\'attivazione (il manifest non resta fermo)', async () => {
        const user = utente({ modo: 'film' });
        const prima = buildManifestFingerprint({
            activeProfileId: user.activeProfileId,
            activeModo: 'film',
            cataloghi: {},
            profiles: user.profiles,
            customCatalogs: []
        });

        const risultato = await attivaCatalogo({ userConfig: user, id: 'preset_pop_movies', attivo: true });

        const set = AddonConfig.updateOne.mock.calls[0][1].$set;
        const dopo = buildManifestFingerprint({
            activeProfileId: user.activeProfileId,
            activeModo: 'film',
            cataloghi: set['config.cataloghi'],
            profiles: user.profiles,
            customCatalogs: []
        });
        expect(dopo).not.toBe(prima);
        expect(set['config.manifestFingerprint']).toBe(dopo);
        expect(risultato.manifestChanged).toBe(true);
        expect(set['config.configVersion']).not.toBe('v1');
    });

    it('un id sconosciuto è 400 catalogo_non_valido', async () => {
        await expect(attivaCatalogo({ userConfig: utente({ modo: 'film' }), id: 'non_esiste', attivo: true }))
            .rejects.toMatchObject({ status: 400, code: 'catalogo_non_valido' });
        expect(AddonConfig.updateOne).not.toHaveBeenCalled();
    });

    it('un catalogo non servibile nella modalità è 400, non un default', async () => {
        await expect(attivaCatalogo({ userConfig: utente({ modo: 'bambini' }), id: 'preset_pop_movies', attivo: true }))
            .rejects.toMatchObject({ status: 400, code: 'catalogo_non_servibile' });
        await expect(attivaCatalogo({
            userConfig: utente({ modo: 'bambini', customCatalogs: [{ id: 'crea-film', name: 'X', type: 'movie' }] }),
            id: 'crea-film',
            attivo: true
        })).rejects.toMatchObject({ status: 400, code: 'catalogo_non_servibile' });
    });

    it('un `attivo` non booleano è 400 catalogo_non_valido', async () => {
        await expect(attivaCatalogo({ userConfig: utente({ modo: 'film' }), id: 'preset_pop_movies', attivo: 'sì' }))
            .rejects.toMatchObject({ status: 400, code: 'catalogo_non_valido' });
        await expect(attivaCatalogo({ userConfig: utente({ modo: 'film' }), id: 42, attivo: true }))
            .rejects.toMatchObject({ status: 400, code: 'catalogo_non_valido' });
    });
});

describe('Liste di una modalità non attiva', () => {
    // I cataloghi appartengono alla modalità, non all'atto di attivarla: si guardano
    // e si modificano anche mentre un'altra modalità è in uso.
    it('elenca i cataloghi della modalità richiesta, non di quella attiva', async () => {
        const risultato = await elencaEsplora(utente({ modo: 'film', activeModo: 'film' }), 'serie');
        expect(risultato.modo).toBe('serie');
        expect(resolveProfileShelves).toHaveBeenCalledWith(
            expect.objectContaining({ userConfig: expect.objectContaining({ activeModo: 'serie' }) })
        );
    });

    it('una modalità inventata è 400 modo_non_valido', async () => {
        await expect(elencaEsplora(utente(), 'documentari')).rejects.toMatchObject({ code: 'modo_non_valido' });
    });

    it('attivare in una modalità non attiva scrive le liste ma non risincronizza Stremio', async () => {
        const user = utente({ modo: 'anime', activeModo: 'anime' });

        const risultato = await attivaCatalogo({ userConfig: user, id: 'preset_pop_movies', attivo: true, modo: 'film' });

        expect(risultato.modo).toBe('film');
        expect(risultato.manifestChanged).toBe(false);
        const [filtro, aggiornamento] = AddonConfig.updateOne.mock.calls[0];
        expect(filtro).toEqual({ uuid: 'addon-esplora' });
        expect(Object.keys(aggiornamento.$set)).toEqual(['config.cataloghi']);
        expect(aggiornamento.$set['config.pendingStremioResync']).toBeUndefined();
        expect(aggiornamento.$set['config.cataloghi'].film).toEqual([
            { id: 'preset_pop_movies', ordine: 0 }
        ]);
        expect(aggiornamento.$set['config.configVersion']).toBeUndefined();
    });

    it('la modalità attiva continua invece a invalidare il manifest', async () => {
        const user = utente({ modo: 'film', activeModo: 'film' });

        const risultato = await attivaCatalogo({ userConfig: user, id: 'preset_pop_movies', attivo: true, modo: 'film' });

        expect(risultato.manifestChanged).toBe(true);
        expect(AddonConfig.updateOne.mock.calls[0][1].$set['config.pendingStremioResync']).toBe(true);
    });

    it('il riordino vale per la modalità indicata, non per quella in uso', async () => {
        const user = utente({
            modo: 'anime',
            activeModo: 'anime',
            cataloghi: { anime: [], film: voci('preset_pop_movies', 'preset_top_rated_movies') }
        });

        const risultato = await riordinaCataloghi({
            userConfig: user,
            ids: ['preset_top_rated_movies', 'preset_pop_movies'],
            modo: 'film'
        });

        expect(risultato.modo).toBe('film');
        expect(risultato.manifestChanged).toBe(false);
        expect(AddonConfig.updateOne.mock.calls[0][1].$set['config.cataloghi'].film).toEqual([
            { id: 'preset_top_rated_movies', ordine: 0 },
            { id: 'preset_pop_movies', ordine: 1 }
        ]);
    });
});

describe('POST ordine: solo la permutazione esatta degli attivi', () => {
    const user = () => utente({
        modo: 'film',
        cataloghi: { film: voci('preset_pop_movies', 'preset_top_rated_movies') }
    });

    it('riscrive l\'ordine e invalida il manifest', async () => {
        const risultato = await riordinaCataloghi({
            userConfig: user(),
            ids: ['preset_top_rated_movies', 'preset_pop_movies']
        });

        const set = AddonConfig.updateOne.mock.calls[0][1].$set;
        expect(set['config.cataloghi'].film).toEqual([
            { id: 'preset_top_rated_movies', ordine: 0 },
            { id: 'preset_pop_movies', ordine: 1 }
        ]);
        expect(risultato.manifestChanged).toBe(true);
        expect(set['config.pendingStremioResync']).toBe(true);
    });

    it('un ordine identico è un no-op', async () => {
        const risultato = await riordinaCataloghi({
            userConfig: user(),
            ids: ['preset_pop_movies', 'preset_top_rated_movies']
        });
        expect(risultato.manifestChanged).toBe(false);
        expect(AddonConfig.updateOne).not.toHaveBeenCalled();
    });

    it('rifiuta id non attivi con 400 catalogo_non_attivo', async () => {
        await expect(riordinaCataloghi({ userConfig: user(), ids: ['preset_pop_movies', 'preset_new_movies'] }))
            .rejects.toMatchObject({ status: 400, code: 'catalogo_non_attivo' });
        expect(AddonConfig.updateOne).not.toHaveBeenCalled();
    });

    it('rifiuta i duplicati con 400 ordine_duplicato', async () => {
        await expect(riordinaCataloghi({
            userConfig: user(),
            ids: ['preset_pop_movies', 'preset_pop_movies']
        })).rejects.toMatchObject({ status: 400, code: 'ordine_duplicato' });
    });

    it('rifiuta un ordine che dimentica un attivo con 400 ordine_incompleto', async () => {
        await expect(riordinaCataloghi({ userConfig: user(), ids: ['preset_pop_movies'] }))
            .rejects.toMatchObject({ status: 400, code: 'ordine_incompleto' });
    });

    it('rifiuta un `ids` non array con 400 ordine_non_valido', async () => {
        await expect(riordinaCataloghi({ userConfig: user(), ids: 'preset_pop_movies' }))
            .rejects.toMatchObject({ status: 400, code: 'ordine_non_valido' });
        await expect(riordinaCataloghi({ userConfig: user(), ids: ['preset_pop_movies', ''] }))
            .rejects.toMatchObject({ status: 400, code: 'ordine_non_valido' });
    });
});

describe('media separato dal tipo (review spec)', () => {
    const { mediaDi } = require('../src/profile/cataloghiEsplora');

    test('un catalogo anime di serie tiene il suo medium', () => {
        const voce = { mediaSet: ['serie'], anime: 'yes' };
        expect(mediaDi(voce)).toBe('series');
    });

    test('un catalogo anime di film tiene il suo medium', () => {
        expect(mediaDi({ mediaSet: ['film'], anime: 'yes' })).toBe('movie');
    });

    test('un contenitore che copre entrambi i media non finge di essere film', () => {
        expect(mediaDi({ mediaSet: ['film', 'serie'], anime: 'yes' })).toBeNull();
    });
});
