/**
 * src/profile/cataloghiEsplora.js
 *
 * Il lato server di Esplora (ticket 05) e dei Cataloghi attivi (ticket 06):
 * elenca i cataloghi servibili nella modalità attiva, li attiva/disattiva e ne
 * riscrive l'ordine in `config.cataloghi[modo]`.
 *
 * Perché vive nel profilo: `config.cataloghi[modo]` è la verità dei cataloghi
 * attivi per modalità (ticket 01), e il profilo è il modulo che possiede quella
 * verità. Il manifest e il pool leggono lo stesso campo con `cataloghiDelModo`.
 *
 * Regole dei ticket che questo file possiede:
 * - «un catalogo compare solo dove è servibile» (ticket 05): un film non compare
 *   in Bambini; i gruppi vuoti spariscono dalla risposta, non tornano `[]`.
 * - le righe del grafo NON si ricalcolano qui: si chiedono allo stesso resolver
 *   che usa il manifest (`resolveProfileShelves` + `catalogDefinitionsFromShelves`).
 * - un id ignoto, un modo ignoto o un ordine con id estranei/duplicati sono
 *   errori 400 dichiarati, mai un default silenzioso.
 * - ogni scrittura ricalcola l'impronta del manifest e alza `pendingStremioResync`
 *   quando cambia, esattamente come l'attivazione di una modalità (ticket 04).
 */

const { nanoid } = require('nanoid');
const AddonConfig = require('../models/AddonConfig');
const {
    MODI,
    derivaLeve,
    isModoValido,
    normalizzaModo,
    leggiModoAttivo,
    cataloghiDelModo,
    conformeAlModo
} = require('./modo');
const { AccountNonTrovatoError } = require('./attivazioneModi');
const { buildManifestFingerprint } = require('../stremio/fingerprint');
const { WATCHLIST_CATALOGS } = require('../stremio/manifest');
const { catalogDefinitionsFromShelves, isHeroCatalogId } = require('../catalog/registry');
const { resolveCatalogDefinition } = require('../catalog/catalogDefinition');
const { getCatalogKind } = require('../catalog/catalogKind');
const { resolveProfileShelves } = require('../stremio/shelvesResolver');

/** Ordine dei tipi dentro «Tutti» (ticket 05: intestazioni per tipo). */
const ORDINE_TIPI = Object.freeze(['film', 'serie', 'anime', 'bambini']);

const ERRORE_MODO = (modo) => {
    const err = new Error(`Modalità sconosciuta: ${modo === undefined ? '(assente)' : String(modo)}. Valori ammessi: ${MODI.join(', ')}.`);
    err.status = 400;
    err.code = 'modo_non_valido';
    return err;
};

function errore(codice, messaggio) {
    const err = new Error(messaggio);
    err.status = 400;
    err.code = codice;
    return err;
}

/**
 * Il modo attivo, SENZA fallback muto. Un `config.activeModo` presente ma fuori
 * dai cinque valori è un errore (400), non «generale». Un documento legacy senza
 * il campo continua a passare dal ponte `leggiModoAttivo`.
 *
 * @param {object|null} addonConfig
 * @returns {'generale'|'film'|'serie'|'anime'|'bambini'}
 */
function modoAttivoStretto(addonConfig) {
    const config = addonConfig?.config && typeof addonConfig.config === 'object'
        ? addonConfig.config
        : (addonConfig && typeof addonConfig === 'object' ? addonConfig : {});
    const dichiarato = config.activeModo;

    if (dichiarato !== undefined && dichiarato !== null && dichiarato !== '') {
        const normalizzato = normalizzaModo(dichiarato);
        if (!isModoValido(normalizzato)) throw ERRORE_MODO(dichiarato);
        return normalizzato;
    }

    return leggiModoAttivo(addonConfig);
}

function mappaPreset() {
    const mappa = new Map();
    try {
        const { getPresets } = require('../catalog/presets');
        for (const preset of getPresets()) mappa.set(preset.id, preset);
    } catch (_err) {
        // Senza preset il resto della risposta resta valido (grafo, watchlist, creazioni).
    }
    return mappa;
}

function baseIdDi(id) {
    return typeof id === 'string' && id.startsWith('yaca_preset_') ? id.replace('yaca_preset_', '') : id;
}

/**
 * Marcatore «catalogo per bambini» disponibile oggi: la categoria del preset
 * (`👨‍👩‍👧‍👦 Bambini & Famiglia`) oppure un flag esplicito `kids`/`isKids`.
 * Le creazioni non hanno ancora un modo per dichiararlo: quindi non compaiono in
 * Bambini, come da ticket 05 («una creazione film appare in Generale e in Film,
 * non in Serie, Anime o Bambini»).
 */
function ePerBambini(definizione, presetMap) {
    if (!definizione) return false;
    if (definizione.kids === true || definizione.isKids === true) return true;
    const categoria = typeof definizione.category === 'string'
        ? definizione.category
        : (presetMap.get(baseIdDi(definizione.id))?.category || '');
    return /bambini/i.test(categoria);
}

/**
 * Il tipo mostrato accanto al catalogo (ticket 06: «badge film / serie / anime»).
 * Il gruppo «Bambini» di Esplora (ticket 05) è fatto dai cataloghi curati per
 * l'infanzia, che non sono un medium: quelli non-anime finiscono lì.
 */
function tipoDi(definizione, presetMap) {
    if (!definizione) return 'film';
    const kind = getCatalogKind(definizione);
    if (kind.anime === 'yes' || definizione.isAnime === true || definizione.anime === true) return 'anime';
    if (ePerBambini(definizione, presetMap)) return 'bambini';
    return Array.isArray(kind.mediaSet) && kind.mediaSet.includes('film') ? 'film' : 'serie';
}

/**
 * Un catalogo è servibile in una modalità? Le leve del modo filtrano medium e
 * anime (`conformeAlModo`); in Bambini serve in più la curatela.
 *
 * Grafo e watchlist sono già filtrati per contenuto al serving (il pool manda
 * `kids: true` al grafo, il catalogHandler applica `applyKidsMode`), quindi
 * restano servibili; un catalogo statico (preset/creazione) invece deve essere
 * dichiarato per l'infanzia, altrimenti è un lasciapassare che i ticket non
 * concedono (spec §2: «curatela nei cataloghi»).
 */
function servibileNelModo(definizione, fonte, leve, presetMap) {
    if (!definizione) return false;
    if (!conformeAlModo(definizione, leve)) return false;
    // Il medium della modalità vale anche qui, non solo al serving. In Film il gestore
    // risponde `serie:false`: elencare comunque gli scaffali di serie produceva cataloghi
    // promessi e mai servibili — l'anteprima tornava vuota e sembrava un guasto.
    if (leve.medium) {
        const media = mediaDi(definizione);
        if ((media === 'movie' || media === 'series') && media !== leve.medium) return false;
    }
    if (!leve.kids) return true;
    if (fonte === 'grafo' || fonte === 'watchlist') return true;
    return ePerBambini(definizione, presetMap);
}

/**
 * La watchlist segue il modo come dice il ticket 05 («film / serie / anime
 * secondo il modo»): a differenza del manifest — dove le tre righe sono
 * `alwaysVisible` e il contenuto si filtra al serving — qui elenchiamo solo la
 * riga del medium/anime della modalità. In Bambini restano tutte e tre: le righe
 * sono della persona e il contenuto è filtrato (ticket 05, decisione esplicita).
 *
 * @param {object} definizione
 * @param {{medium: 'movie'|'series'|null, anime: string, kids: boolean}} leve
 * @returns {boolean}
 */
function servibileWatchlist(definizione, leve) {
    if (!definizione) return false;
    const kind = getCatalogKind(definizione);
    const anime = Array.isArray(kind?.mediaSet) && kind.anime === 'yes';

    if (leve.anime === 'only') return anime;
    if (leve.anime === 'exclude' && anime) return false;
    if (!leve.medium) return true;

    const voluto = leve.medium === 'movie' ? 'film' : 'serie';
    return Array.isArray(kind?.mediaSet) && kind.mediaSet.includes(voluto);
}

const WATCHLIST_PER_ID = new Map(WATCHLIST_CATALOGS.map(c => [c.id, c]));

/**
 * Contesto di una richiesta Esplora: modalità, scaffali del grafo (resolver del
 * manifest), preset e mappa degli attivi. Calcolato una volta per richiesta.
 *
 * @param {object} userConfig configurazione risolta (resolveUserConfig)
 */
async function contestoEsplora(userConfig, modoRichiesto = null) {
    if (!userConfig) throw new AccountNonTrovatoError();

    const modoAttivo = modoAttivoStretto(userConfig);
    let modo = modoAttivo;
    if (modoRichiesto !== null && modoRichiesto !== undefined) {
        const normalizzato = normalizzaModo(modoRichiesto);
        if (!isModoValido(normalizzato)) throw ERRORE_MODO(modoRichiesto);
        modo = normalizzato;
    }
    const leve = derivaLeve(modo);
    // Stesso resolver del manifest: nessuna seconda logica sugli scaffali. Per una
    // modalità non attiva si sposta solo la lente del resolver, non lo stato dell'account.
    const configPerModo = modo === modoAttivo ? userConfig : { ...userConfig, activeModo: modo };
    const shelves = await resolveProfileShelves({ userConfig: configPerModo });
    const definizioniGrafo = catalogDefinitionsFromShelves(shelves);
    const presetMap = mappaPreset();
    const attive = new Map(cataloghiDelModo(userConfig, modo).map(v => [v.id, v.ordine]));

    return { userConfig, modo, leve, shelves, definizioniGrafo, presetMap, attive };
}

/**
 * Il medium effettivo di un catalogo, separato dal tipo mostrato.
 *
 * `tipo` risponde a «in che gruppo lo metto» (film / serie / anime / bambini),
 * ma `anime` e `bambini` non sono medium: una riga anime può essere fatta di
 * serie o di film. Senza questo campo l'interfaccia indovina «film» e sbaglia
 * icona, tipo dichiarato e anteprima.
 *
 * @returns {'movie'|'series'|null} null quando il catalogo contiene entrambi
 */
function mediaDi(definizione) {
    if (!definizione) return 'movie';
    if (definizione.type === 'movie' || definizione.type === 'series') return definizione.type;
    const kind = getCatalogKind(definizione);
    const mediaSet = Array.isArray(kind?.mediaSet) ? kind.mediaSet : [];
    const film = mediaSet.includes('film');
    const serie = mediaSet.includes('serie');
    if (film && !serie) return 'movie';
    if (serie && !film) return 'series';
    if (film && serie) return null;
    return definizione.isAnime === true ? null : 'movie';
}

function voceDi(definizione, fonte, contesto) {
    const id = String(definizione.id);
    const ordine = contesto.attive.has(id) ? contesto.attive.get(id) : null;
    const tipo = tipoDi(definizione, contesto.presetMap);
    const media = mediaDi(definizione);
    return {
        id,
        nome: definizione.name || definizione.nome || id,
        tipo,
        media,
        // Il tipo che il manifest dichiara a Stremio. Solo la WATCHLIST anime è dichiarata
        // `anime`; uno scaffale del grafo resta del suo medium, anche quando il badge dice
        // «anime». Derivare il tipo dal badge mandava l'interfaccia a chiedere
        // `catalog/anime/yaca_xxx_series`, che il manifest dichiara `series`: anteprima vuota
        // su uno scaffale che ha venti titoli.
        stremioType: (fonte === 'watchlist' && tipo === 'anime') ? 'anime' : (media || 'movie'),
        fonte,
        attivo: contesto.attive.has(id),
        ordine,
        // Perché esiste questo scaffale: solo per le righe del grafo, che sono quelle che
        // nascono da una decisione da spiegare.
        ...(fonte === 'grafo' ? {
            nomeFonte: definizione.nome_fonte || null,
            confidenza: definizione.confidenza ?? null,
            semiRappresentativi: Array.isArray(definizione.semi_rappresentativi) ? definizione.semi_rappresentativi : [],
            semiMembri: Array.isArray(definizione.semi_membri) ? definizione.semi_membri : []
        } : {})
    };
}

function confrontoTesto(a, b) {
    const x = String(a || '');
    const y = String(b || '');
    return x < y ? -1 : (x > y ? 1 : 0);
}

/**
 * Tutto ciò che Esplora disegna per la modalità attiva, in una risposta.
 * I gruppi vuoti sono OMESSI (ticket 05: la riga non compare, non una riga vuota).
 *
 * @param {object} userConfig
 * @returns {Promise<{modo: string, gruppi: object, configVersion: string|null}>}
 */
async function elencaEsplora(userConfig, modo = null) {
    const contesto = await contestoEsplora(userConfig, modo);
    const gruppi = {};

    const suggerimenti = contesto.definizioniGrafo
        .filter(def => servibileNelModo(def, 'grafo', contesto.leve, contesto.presetMap))
        .map(def => voceDi(def, 'grafo', contesto));
    if (suggerimenti.length > 0) gruppi.suggerimenti = suggerimenti;

    const watchlist = WATCHLIST_CATALOGS
        .filter(def => servibileWatchlist(def, contesto.leve))
        .map(def => voceDi(def, 'watchlist', contesto));
    if (watchlist.length > 0) gruppi.watchlist = watchlist;

    const creazioni = (Array.isArray(contesto.userConfig.customCatalogs) ? contesto.userConfig.customCatalogs : [])
        .filter(def => def && def.id && def.isActive !== false)
        .filter(def => servibileNelModo(def, 'creazione', contesto.leve, contesto.presetMap))
        .map(def => voceDi(def, 'creazione', contesto));
    if (creazioni.length > 0) gruppi.creazioni = creazioni;

    // «Tutti»: i preset servibili, raggruppabili per tipo. Ordine deterministico:
    // tipo (film, serie, anime, bambini) e poi nome.
    const tutti = [...contesto.presetMap.values()]
        .filter(def => servibileNelModo(def, 'preset', contesto.leve, contesto.presetMap))
        .map(def => voceDi(def, 'preset', contesto))
        .sort((a, b) => (ORDINE_TIPI.indexOf(a.tipo) - ORDINE_TIPI.indexOf(b.tipo)) || confrontoTesto(a.nome, b.nome));
    if (tutti.length > 0) gruppi.tutti = tutti;

    // Nessuno scarto silenzioso: un id attivo che non compare in nessun gruppo
    // (es. catalogo diventato incompatibile dopo un cambio di modalità) si dichiara.
    const elencati = new Set(Object.values(gruppi).flat().map(v => v.id));
    const orfani = [...contesto.attive.keys()].filter(id => !elencati.has(id));
    if (orfani.length > 0) {
        console.warn(`[Esplora] modalità ${contesto.modo}: ${orfani.length} cataloghi attivi non servibili/non elencati (${orfani.join(', ')})`);
    }

    return {
        modo: contesto.modo,
        gruppi,
        configVersion: contesto.userConfig?.configVersion || null
    };
}

/**
 * Risolve una definizione per id, fra watchlist, scaffali del grafo, preset e
 * creazioni. Restituisce anche la fonte, che decide la servibilità in Bambini.
 */
function trovaDefinizione(id, contesto) {
    if (WATCHLIST_PER_ID.has(id)) return { definizione: WATCHLIST_PER_ID.get(id), fonte: 'watchlist' };

    const daGrafo = contesto.definizioniGrafo.find(def => def.id === id);
    if (daGrafo) return { definizione: daGrafo, fonte: 'grafo' };

    const daCreazione = (Array.isArray(contesto.userConfig.customCatalogs) ? contesto.userConfig.customCatalogs : [])
        .find(def => def && def.id === id);
    if (daCreazione) return { definizione: daCreazione, fonte: 'creazione' };

    const dalPreset = contesto.presetMap.get(id) || contesto.presetMap.get(baseIdDi(id));
    if (dalPreset) return { definizione: dalPreset, fonte: 'preset' };

    // Ultima possibilità: il resolver canonico (profilo/custom/scaffali già in cache).
    const canonica = resolveCatalogDefinition(id, contesto.userConfig, baseIdDi(id));
    if (canonica) return { definizione: canonica, fonte: isHeroCatalogId(id) ? 'grafo' : 'creazione' };

    return null;
}

/**
 * Ricalcola impronta e versione e persiste i cataloghi di UNA modalità.
 * Stessa catena dell'attivazione di una modalità (ticket 04): senza il nuovo
 * `configVersion` + `pendingStremioResync` il riconciliatore non spinge nulla.
 */
async function salvaCataloghi({ userConfig, modo, voci }) {
    const uuid = userConfig?.addonUuid || null;
    if (!uuid) throw new AccountNonTrovatoError();

    const cataloghiPrima = userConfig?.cataloghi && typeof userConfig.cataloghi === 'object'
        ? userConfig.cataloghi
        : {};
    const cataloghi = { ...cataloghiPrima };
    cataloghi[modo] = voci.map((voce, idx) => ({ id: voce.id, ordine: idx }));

    // Il manifest serve la modalità ATTIVA: modificare le liste di un'altra
    // modalità non deve dichiarare una risincronizzazione che non cambierebbe nulla.
    const toccaManifest = modo === modoAttivoStretto(userConfig);
    if (!toccaManifest) {
        await AddonConfig.updateOne({ uuid }, { $set: { 'config.cataloghi': cataloghi } });
        return { modo, configVersion: userConfig?.configVersion || null, manifestChanged: false, cataloghi: cataloghi[modo], attivi: voci.map(v => v.id) };
    }

    const activeProfileId = userConfig?.activeProfileId || null;
    const nextFingerprint = buildManifestFingerprint({
        activeProfileId,
        activeModo: modo,
        cataloghi,
        profiles: userConfig?.profiles || [],
        customCatalogs: userConfig?.customCatalogs || []
    });
    const previousFingerprint = typeof userConfig?.manifestFingerprint === 'string'
        ? userConfig.manifestFingerprint
        : null;
    const manifestChanged = !previousFingerprint || previousFingerprint !== nextFingerprint;
    const configVersion = manifestChanged
        ? nanoid(8)
        : (userConfig?.configVersion || nanoid(8));

    await AddonConfig.updateOne(
        { uuid },
        {
            $set: {
                'config.cataloghi': cataloghi,
                'config.manifestFingerprint': nextFingerprint,
                'config.configVersion': configVersion,
                // «Invalidare» = il manifest va riscritto: senza questo il
                // riconciliatore all'avvio non spinge la nuova collezione.
                'config.pendingStremioResync': true
            }
        }
    );

    return { modo, configVersion, manifestChanged, cataloghi: cataloghi[modo], attivi: voci.map(v => v.id) };
}

/**
 * Attiva o disattiva un catalogo nella modalità attiva. Idempotente: un doppio
 * click non riscrive niente e non bumpa la versione.
 *
 * @param {{userConfig: object, id: unknown, attivo: unknown}} params
 */
async function attivaCatalogo({ userConfig, id, attivo, modo = null } = {}) {
    if (typeof id !== 'string' || !id.trim()) {
        throw errore('catalogo_non_valido', 'Il campo `id` è obbligatorio e deve essere una stringa non vuota.');
    }
    if (typeof attivo !== 'boolean') {
        throw errore('catalogo_non_valido', 'Il campo `attivo` è obbligatorio e deve essere booleano (true/false).');
    }

    const contesto = await contestoEsplora(userConfig, modo);
    const trovato = trovaDefinizione(id.trim(), contesto);
    if (!trovato) {
        throw errore('catalogo_non_valido', `Catalogo sconosciuto: ${id}. Non esiste fra grafo, watchlist, preset e creazioni.`);
    }
    if (!servibileNelModo(trovato.definizione, trovato.fonte, contesto.leve, contesto.presetMap)) {
        throw errore('catalogo_non_servibile', `Il catalogo ${id} non è servibile nella modalità ${contesto.modo}.`);
    }

    const attive = cataloghiDelModo(userConfig, contesto.modo);
    const presente = attive.some(voce => voce.id === id.trim());
    let voci = attive;
    if (attivo && !presente) {
        // In coda, con l'ordine progressivo: l'ultimo attivato sta in fondo.
        voci = [...attive, { id: id.trim(), ordine: attive.length }];
    } else if (!attivo && presente) {
        voci = attive.filter(voce => voce.id !== id.trim());
    }

    const invariato = voci.length === attive.length
        && voci.every((voce, idx) => voce.id === attive[idx].id);
    if (invariato) {
        return {
            modo: contesto.modo,
            id: id.trim(),
            attivo: presente,
            attivi: voci.map(v => v.id),
            configVersion: userConfig?.configVersion || null,
            manifestChanged: false
        };
    }

    return {
        ...(await salvaCataloghi({ userConfig, modo: contesto.modo, voci })),
        id: id.trim(),
        attivo
    };
}

/**
 * Riscrive l'ordine dei cataloghi attivi della modalità. Gli id estranei, i
 * duplicati e gli attivi mancanti sono rifiutati: un riordino non è un modo per
 * disattivare qualcosa di nascosto.
 *
 * @param {{userConfig: object, ids: unknown}} params
 */
async function riordinaCataloghi({ userConfig, ids, modo = null } = {}) {
    if (!Array.isArray(ids)) {
        throw errore('ordine_non_valido', 'Il campo `ids` è obbligatorio e deve essere un array di identificatori.');
    }
    if (ids.some(id => typeof id !== 'string' || !id.trim())) {
        throw errore('ordine_non_valido', 'Ogni elemento di `ids` deve essere una stringa non vuota.');
    }
    if (new Set(ids).size !== ids.length) {
        throw errore('ordine_duplicato', '`ids` contiene duplicati: un catalogo può comparire una sola volta.');
    }

    const contesto = await contestoEsplora(userConfig, modo);
    const attive = cataloghiDelModo(userConfig, contesto.modo);
    const idAttivi = attive.map(voce => voce.id);

    const estranei = ids.filter(id => !idAttivi.includes(id));
    if (estranei.length > 0) {
        throw errore('catalogo_non_attivo', `Non sono attivi nella modalità ${contesto.modo}: ${estranei.join(', ')}.`);
    }
    const mancanti = idAttivi.filter(id => !ids.includes(id));
    if (mancanti.length > 0) {
        throw errore('ordine_incompleto', `Mancano dall'ordine cataloghi attivi: ${mancanti.join(', ')}.`);
    }

    const invariato = ids.every((id, idx) => id === idAttivi[idx]);
    if (invariato) {
        return {
            modo: contesto.modo,
            attivi: idAttivi,
            configVersion: userConfig?.configVersion || null,
            manifestChanged: false
        };
    }

    return salvaCataloghi({
        userConfig,
        modo: contesto.modo,
        voci: ids.map(id => ({ id }))
    });
}

module.exports = {
    ORDINE_TIPI,
    modoAttivoStretto,
    tipoDi,
    mediaDi,
    ePerBambini,
    servibileNelModo,
    servibileWatchlist,
    elencaEsplora,
    attivaCatalogo,
    riordinaCataloghi
};
