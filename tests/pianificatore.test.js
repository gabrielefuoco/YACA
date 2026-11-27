/**
 * Il parser della ricerca a sintassi esplicita (fetta 2).
 *
 * I contratti difesi qui sono quelli della spec (§1 e §2 di `.scratch/ricerca-senza-llm/spec.md`):
 *   1. senza operatori è una ricerca sul titolo, come sempre;
 *   2. ogni operatore consuma i valori fino al prossimo operatore, le virgole separano;
 *   3. più valori sono OR, tranne `anno` (intervallo) e `simili` (semi della stessa diffusione);
 *   4. un titolo o un nome con la virgola dentro resta intero: si uniscono i frammenti finché
 *      qualcosa si risolve;
 *   5. il testo residuo con operatori viene scartato **e dichiarato**;
 *   6. un valore non risolto non svuota la ricerca: finisce nei `motivi`;
 *   7. il parser non solleva mai — un risolutore rotto è un motivo, non un'eccezione.
 */

const {
    analizza,
    pianifica,
    interpretaAnno
} = require('../src/ricerca/pianificatore');

// Risolutori finti: il parser è puro e va provato senza database.
const TITOLI = {
    interstellar: [157336],
    'blade runner': [78],
    'game of thrones': [1399],
    bridgerton: [91239],
    'amici miei': [19506],
    'amici miei atto ii': [45324]
};
const PERSONE = {
    'leonardo dicaprio': ['6193'],
    nolan: ['525'],
    villeneuve: ['137427']
};
const CONCETTI = {
    navi: ['ship'],
    'time travel': ['time travel'],
    isekai: ['isekai', 'reincarnation']
};
const PROVIDER = { netflix: [8], prime: [119, 2100] };

const risolutori = {
    titolo: (nome) => TITOLI[nome] || null,
    persona: (nome) => PERSONE[nome] || null,
    concetto: (nome) => CONCETTI[nome] || null,
    provider: (nome) => PROVIDER[nome] || null
};

describe('analizza — lo strato puro', () => {
    it('senza operatori è una ricerca sul titolo', async () => {
        const { grezzo, testo, motivi } = analizza('batman');
        expect(testo).toBe('batman');
        expect(grezzo.simile_a).toEqual([]);
        expect(motivi).toEqual([]);
    });

    it('legge un operatore e il suo valore', async () => {
        const { grezzo, testo, motivi } = analizza('simili interstellar');
        expect(grezzo.simile_a).toEqual(['interstellar']);
        expect(testo).toBeNull();
        expect(motivi).toEqual([]);
    });

    it('le virgole separano i valori, anche senza spazio', async () => {
        expect(analizza('simili game of thrones, bridgerton').grezzo.simile_a)
            .toEqual(['game of thrones', 'bridgerton']);
        expect(analizza('tema horror,navi').grezzo.tema).toEqual(['horror', 'navi']);
    });

    it('il valore finisce al prossimo operatore, ovunque sia', async () => {
        const { grezzo } = analizza('tema horror, navi anno 1980-1989 lingua giapponese');
        expect(grezzo.tema).toEqual(['horror', 'navi']);
        expect(grezzo.anno).toEqual([1980, 1989]);
        expect(grezzo.lingua).toBe('giapponese');
    });

    it('riconosce le forme flesse degli operatori', async () => {
        expect(analizza('attori leonardo dicaprio').grezzo.persone).toEqual(['leonardo dicaprio']);
        expect(analizza('genere fantasy').grezzo.generi).toEqual(['fantasy']);
        expect(analizza('temi navi').grezzo.tema).toEqual(['navi']);
        expect(analizza('anni 80').grezzo.anno).toEqual([1980, 1989]);
    });

    it('`anime` è un flag e non consuma valori', async () => {
        const { grezzo } = analizza('anime tema isekai genere fantasy');
        expect(grezzo.anime).toBe(true);
        expect(grezzo.tema).toEqual(['isekai']);
        expect(grezzo.generi).toEqual(['fantasy']);
    });

    it('il testo che avanza con un operatore viene scartato e dichiarato', async () => {
        const { testo, motivi } = analizza('film tema horror');
        expect(testo).toBeNull();
        expect(motivi).toContain('ignorato: film');
    });

    it("l'operatore anno non si mangia le parole che seguono", async () => {
        const { grezzo, motivi } = analizza('anni 80 sulle navi');
        expect(grezzo.anno).toEqual([1980, 1989]);
        expect(motivi).toContain('ignorato: sulle navi');
    });

    it("l'anno accetta solo forme d'anno: il resto è testo", async () => {
        expect(analizza('anno 1997 nave').grezzo.anno).toEqual([1997, 1997]);
        expect(analizza('anno 1997 nave').motivi).toContain('ignorato: nave');
        expect(analizza('anno domini').grezzo.anno).toBeNull();
        expect(analizza('anno domini').motivi).toContain('valore_mancante: anno');
        expect(analizza('anno domini').motivi).toContain('ignorato: domini');
    });

    it('un operatore senza il suo valore lo dichiara', async () => {
        expect(analizza('tema horror anno').motivi).toContain('valore_mancante: anno');
    });

    it('un operatore ripetuto tiene l\'ultimo e lo dichiara', async () => {
        const { grezzo, motivi } = analizza('anno 80 anno 90');
        expect(grezzo.anno).toEqual([1990, 1999]);
        expect(motivi).toContain('operatore_ripetuto: anno');
    });

    it('una query vuota non produce niente', async () => {
        expect(analizza('   ').motivi).toEqual(['query_vuota']);
        expect(analizza('   ').testo).toBeNull();
    });

    it('non confonde una parola con un operatore: «team» non è «tema»', async () => {
        expect(analizza('team').testo).toBe('team');
    });
});

describe('analizza — gli operatori allineati al block editor', () => {
    it('`titolo` è il testo dentro gli operatori', async () => {
        const { grezzo, testo } = analizza('titolo batman genere azione');
        expect(grezzo.testo).toBe('batman');
        expect(grezzo.generi).toEqual(['azione']);
        expect(testo).toBeNull();   // il testo libero fuori dagli operatori non esiste più
    });

    it('`regista` raccoglie i nomi', async () => {
        expect(analizza('regista nolan, villeneuve').grezzo.crew).toEqual(['nolan', 'villeneuve']);
    });

    it('`voto` e `durata` accettano intervalli aperti', async () => {
        expect(analizza('voto 7+').grezzo.voto).toEqual([7, null]);
        expect(analizza('voto 7-9').grezzo.voto).toEqual([7, 9]);
        expect(analizza('voto -4').grezzo.voto).toEqual([null, 4]);
        expect(analizza('voto 4-').grezzo.voto).toEqual([4, null]);   // «dal 4 in su»
        expect(analizza('voto 7.5+').grezzo.voto).toEqual([7.5, null]);
        expect(analizza('durata 90-120').grezzo.durata).toEqual([90, 120]);
        expect(analizza('durata -150').grezzo.durata).toEqual([null, 150]);
    });

    it('i comparatori danno il verso giusto: `<` non è un minimo', async () => {
        // Il difetto che questa prova difende: `voto < 7` diventava `vote_average.gte: 7`, cioè
        // l'opposto, e la pagina tornava piena di titoli sbagliati senza un avviso.
        expect(analizza('voto < 7').grezzo.voto).toEqual([null, 7]);
        expect(analizza('voto <= 6').grezzo.voto).toEqual([null, 6]);
        expect(analizza('voto ≤ 6').grezzo.voto).toEqual([null, 6]);
        expect(analizza('voto > 7').grezzo.voto).toEqual([7, null]);
        expect(analizza('voto >= 8').grezzo.voto).toEqual([8, null]);
        expect(analizza('voto ≥ 8').grezzo.voto).toEqual([8, null]);
        expect(analizza('durata < 90').grezzo.durata).toEqual([null, 90]);
        expect(analizza('durata > 150').grezzo.durata).toEqual([150, null]);
        // Attaccato al numero, senza spazio: è come si scrive di fretta.
        expect(analizza('durata <90').grezzo.durata).toEqual([null, 90]);
        expect(analizza('voto >7').grezzo.voto).toEqual([7, null]);
        // Un comparatore da solo (o davanti a una parola) è un errore dichiarato, non un silenzio.
        expect(analizza('voto <').grezzo.voto).toBeNull();
        expect(analizza('voto <').motivi.some(m => m.includes('voto_numero_non_valido'))).toBe(true);
        expect(analizza('voto < abc').grezzo.voto).toBeNull();
    });

    it('un intervallo impossibile è un motivo, non un filtro', async () => {
        const { grezzo, motivi } = analizza('voto 9-6');
        expect(grezzo.voto).toBeNull();
        expect(motivi.some(m => m.startsWith('voto_numero_non_valido'))).toBe(true);
    });

    it('`senza` porta il tipo e lo ricorda fra le virgole', async () => {
        const { grezzo } = analizza('senza genere horror, commedia senza tema splatter, zombie');
        expect(grezzo.senza).toEqual([
            { tipo: 'genere', nome: 'horror' },
            { tipo: 'genere', nome: 'commedia' },
            { tipo: 'tema', nome: 'splatter' },
            { tipo: 'tema', nome: 'zombie' }
        ]);
    });

    it('`senza` senza tipo parte dal tema', async () => {
        expect(analizza('senza splatter').grezzo.senza).toEqual([{ tipo: 'tema', nome: 'splatter' }]);
    });

    it('`ordina` accetta i nomi e anche la parola «voto»', async () => {
        expect(analizza('ordina voto').grezzo.ordina).toBe('vote_average.desc');
        expect(analizza('ordina popolarita').grezzo.ordina).toBe('popularity.desc');
        expect(analizza('ordina incasso').grezzo.ordina).toBe('revenue.desc');
        const ignoto = analizza('ordina a-caso');
        expect(ignoto.grezzo.ordina).toBeNull();
        expect(ignoto.motivi).toContain('ordine_non_riconosciuto: a-caso');
    });

    it('`eta` normalizza la certificazione', async () => {
        expect(analizza('eta pg-13').grezzo.eta).toBe('PG-13');
    });

    it('gli operatori numerici non si mangiano le parole', async () => {
        const { grezzo, motivi } = analizza('voto alto genere animazione');
        expect(grezzo.voto).toBeNull();
        expect(motivi).toContain('valore_mancante: voto');
        expect(motivi).toContain('ignorato: alto');
        expect(grezzo.generi).toEqual(['animazione']);
    });
});

describe('interpretaAnno', () => {
    const casi = [
        ['1997', [1997, 1997]],
        ['1990-2000', [1990, 2000]],
        ['1990 2000', [1990, 2000]],
        ['80', [1980, 1989]],
        ["'80", [1980, 1989]],
        ['80s', [1980, 1989]],
        ['80-90', [1980, 1999]],
        ['1980-89', [1980, 1989]],
        ['20', [2020, 2029]],
        ['10', [2010, 2019]]
    ];

    it.each(casi)('%s → %j', (valore, atteso) => {
        expect(interpretaAnno(valore).anno).toEqual(atteso);
    });

    it('un anno impossibile è un motivo, non un risultato sbagliato', async () => {
        for (const valore of ['xyz', '2000-1990', '12345']) {
            const esito = interpretaAnno(valore);
            expect(esito.anno).toBeNull();
            expect(esito.motivo).toMatch(/^anno_non_valido/);
        }
    });
});

describe('risolvi — dai valori agli id', () => {
    it('produce l\'intento canonico completo', async () => {
        const { intenti, motivi } = await pianifica(
            'tema horror, navi anno 1980-1989 cast leonardo dicaprio',
            { risolutori }
        );

        expect(motivi).toEqual([]);
        expect(intenti).toHaveLength(1);
        expect(intenti[0]).toEqual(expect.objectContaining({
            generi: [27],              // horizon: genere, non keyword
            concetti: ['ship'],        // navi → ship
            persone: ['6193'],
            anno: [1980, 1989],
            simile_a: [],
            testo: null
        }));
    });

    it('`generi` preferisce il genere e ripiega sul tema dichiarandolo', async () => {
        const genere = await pianifica('generi horror', { risolutori });
        expect(genere.intenti[0].generi).toEqual([27]);

        const isekai = await pianifica('generi isekai', { risolutori });
        expect(isekai.intenti[0].generi).toEqual([]);
        expect(isekai.intenti[0].concetti).toEqual(['isekai', 'reincarnation']);
        expect(isekai.motivi).toContain('genere_degradato_a_tema: isekai');
    });

    it('più titoli restano nella stessa intenzione: sono semi, non ricerche', async () => {
        const { intenti } = await pianifica('simili game of thrones, bridgerton', { risolutori });
        expect(intenti).toHaveLength(1);
        expect(intenti[0].simile_a).toEqual([1399, 91239]);
    });

    it('un titolo con la virgola dentro resta un titolo solo', async () => {
        const { intenti, motivi } = await pianifica('simili amici miei, atto ii', { risolutori });
        expect(intenti[0].simile_a).toEqual([45324]);
        expect(motivi).toEqual([]);
    });

    it('più persone sono un OR, non due condizioni in AND', async () => {
        const { intenti } = await pianifica('cast nolan, villeneuve', { risolutori });
        expect(intenti[0].persone).toEqual(['525', '137427']);
    });

    it('più provider restano distinti (Amazon e Amazon con pubblicità)', async () => {
        const { intenti } = await pianifica('su prime', { risolutori });
        expect(intenti[0].provider).toEqual([119, 2100]);
    });

    it('lingua e paese diventano codici', async () => {
        const { intenti } = await pianifica('lingua giapponese paese giappone', { risolutori });
        expect(intenti[0].lingua).toBe('ja');
        expect(intenti[0].paese).toBe('JP');
    });

    it('un valore non risolto non svuota la ricerca: resta un motivo', async () => {
        const { intenti, motivi } = await pianifica('tema horror, navi, parola-inventata', { risolutori });
        expect(intenti[0].generi).toEqual([27]);
        expect(intenti[0].concetti).toEqual(['ship']);
        expect(motivi).toContain('tema_non_riconosciuto: parola-inventata');
    });

    it('un titolo non risolto è un motivo, non una ricerca vuota', async () => {
        const { intenti, motivi } = await pianifica('simili film-che-non-esiste', { risolutori });
        expect(intenti[0].simile_a).toEqual([]);
        expect(motivi).toContain('titolo_non_risolto: film-che-non-esiste');
    });

    it('un intento senza condizioni si dichiara', async () => {
        const { motivi } = await pianifica('tema parola-inventata', { risolutori });
        expect(motivi).toContain('nessuna_condizione');
    });

    it('senza risolutori i valori non si inventano: si dichiarano', async () => {
        const { intenti, motivi } = await pianifica('cast leonardo dicaprio simili interstellar', {});
        expect(intenti[0].persone).toEqual([]);
        expect(intenti[0].simile_a).toEqual([]);
        expect(motivi.some(m => m.startsWith('persona_non_risolto'))).toBe(true);
        expect(motivi.some(m => m.startsWith('titolo_non_risolto'))).toBe(true);
    });

    it('un risolutore che esplode diventa un motivo, non un\'eccezione', async () => {
        const rotti = {
            ...risolutori,
            titolo: () => { throw new Error('indice giù'); }
        };
        const { intenti, motivi } = await pianifica('simili interstellar', { risolutori: rotti });
        expect(intenti[0].simile_a).toEqual([]);
        expect(motivi.some(m => m.startsWith('risolutore_in_errore'))).toBe(true);
    });

    it('il caso tutto-in-uno della spec', async () => {
        const esito = await pianifica(
            'cast leonardo dicaprio tema navi anno 1990-2000 su netflix lingua inglese',
            { risolutori }
        );

        expect(esito.intenti[0]).toEqual({
            generi: [],
            anno: [1990, 2000],
            concetti: ['ship'],
            persone: ['6193'],
            crew: [],
            provider: [8],
            lingua: 'en',
            paese: null,
            anime: null,
            simile_a: [],
            testo: null,
            voto: null,
            durata: null,
            eta: null,
            senzaGeneri: [],
            senzaConcetti: [],
            ordina: null
        });
        expect(esito.motivi).toEqual([]);
    });
});

describe('pianifica — la porta', () => {
    it('non solleva mai, nemmeno con input assurdi', async () => {
        for (const query of [null, undefined, 42, {}, [], '   ', ',,,', 'simili', 'anno', 'anime']) {
            await expect(pianifica(query, { risolutori })).resolves.toBeDefined();
            const esito = await pianifica(query, { risolutori });
            expect(Array.isArray(esito.motivi)).toBe(true);
        }
    });

    it('una ricerca per titolo resta una ricerca per titolo', async () => {
        const { intenti, motivi } = await pianifica('interstellar', { risolutori });
        expect(intenti[0].testo).toBe('interstellar');
        expect(intenti[0].simile_a).toEqual([]);
        expect(motivi).toEqual([]);
    });
});

/**
 * Il genere ha id diversi fra film e serie in TMDB. Senza il tipo, `anime genere fantasy` sulle
 * serie filtrava l'id dei film (14) e restituiva zero risultati: «Fantasy» per le serie è
 * `10765` (Sci-Fi & Fantasy). Misurato su 181 ricerche reali: era l'unico filtro che sbagliava
 * sistematicamente su un intero medium.
 */
describe('i generi delle serie hanno un altro id', () => {
    const { genereDaNome } = require('../src/ricerca/generi');

    it('Fantasy e Fantascienza nelle serie sono Sci-Fi & Fantasy (10765)', () => {
        expect(genereDaNome('fantasy')).toBe(14);
        expect(genereDaNome('fantasy', { tipo: 'series' })).toBe(10765);
        expect(genereDaNome('fantascienza', { tipo: 'series' })).toBe(10765);
        expect(genereDaNome('fantascienza')).toBe(878);
    });

    it('Azione e Avventura nelle serie sono Action & Adventure (10759)', () => {
        expect(genereDaNome('azione', { tipo: 'series' })).toBe(10759);
        expect(genereDaNome('avventura', { tipo: 'tv' })).toBe(10759);
        expect(genereDaNome('azione')).toBe(28);
    });

    it('Guerra nelle serie è War & Politics (10768)', () => {
        expect(genereDaNome('guerra', { tipo: 'series' })).toBe(10768);
    });

    it('gli id condivisi restano gli stessi', () => {
        expect(genereDaNome('horror', { tipo: 'series' })).toBe(27);
        expect(genereDaNome('commedia', { tipo: 'series' })).toBe(35);
        expect(genereDaNome('animazione', { tipo: 'series' })).toBe(16);
    });

    it('i refusi seguono il tipo', () => {
        expect(genereDaNome('fantasyy', { tipo: 'series' })).toBe(10765);
    });
});
