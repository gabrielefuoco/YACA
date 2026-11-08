/**
 * src/profile/modo.js
 *
 * Fondamenta del modello «il profilo è una modalità» (ticket 01 e 02).
 *
 * Questo modulo è ADDITIVO: nessun percorso vivo lo chiama ancora. Serve a
 * fissare in un solo posto tre cose che altrimenti verrebbero duplicate quando
 * dashboard, manifest e pool cominceranno a leggere le modalità:
 *
 * 1. `derivaLeve(modo)` è l'UNICA funzione che traduce una modalità nelle leve
 *    tecniche (medium, politica anime, kids). I booleani non sono input: sono
 *    uscite.
 * 2. `materializzaModi(addonConfig)` crea pigramente le cinque caselle mancanti,
 *    senza toccare i profili esistenti (la migrazione è un one-off successivo).
 * 3. `leggiSliders` / `scriviSliders` spostano i cursori a livello account con
 *    fallback di lettura sui valori ancora salvati nel profilo attivo.
 *
 * La regola di immutabilità del modo vive qui (`applicaImmutabilitaModo`) e
 * viene applicata dal percorso di update in `src/models/UserConfig.js`.
 */

const MODI = Object.freeze(['generale', 'film', 'serie', 'anime', 'bambini']);
const MODI_SET = new Set(MODI);

/** Nome fisso della modalità: la sola cosa personalizzabile è l'emoji. */
const NOMI_MODI = Object.freeze({
    generale: 'Generale',
    film: 'Film',
    serie: 'Serie',
    anime: 'Anime',
    bambini: 'Bambini'
});

/** Prefisso deterministico degli ID creati da `materializzaModi`. */
const PREFISSO_ID_MODO = 'modo_';

/**
 * Leve tecniche per modalità. Oggetto congelato: chi legge non può mutare la
 * tabella, e `derivaLeve` restituisce sempre una copia.
 */
const LEVE_PER_MODO = Object.freeze({
    generale: Object.freeze({ medium: null, anime: 'neutral', kids: false }),
    film: Object.freeze({ medium: 'movie', anime: 'exclude', kids: false }),
    serie: Object.freeze({ medium: 'series', anime: 'exclude', kids: false }),
    anime: Object.freeze({ medium: null, anime: 'only', kids: false }),
    bambini: Object.freeze({ medium: null, anime: 'neutral', kids: true })
});

function isModoValido(modo) {
    return typeof modo === 'string' && MODI_SET.has(modo);
}

function normalizzaModo(modo) {
    return typeof modo === 'string' ? modo.trim().toLowerCase() : modo;
}

/**
 * Traduce una modalità nelle sue leve tecniche.
 *
 * @param {'generale'|'film'|'serie'|'anime'|'bambini'} modo
 * @returns {{medium: 'movie'|'series'|null, anime: 'neutral'|'exclude'|'only', kids: boolean}}
 * @throws {TypeError} se il modo non è uno dei cinque
 */
function derivaLeve(modo) {
    const normalizzato = normalizzaModo(modo);
    const leve = LEVE_PER_MODO[normalizzato];
    if (!leve) {
        throw new TypeError(`Modo non valido: ${modo}`);
    }
    return { ...leve };
}

/**
 * Ponte di sola migrazione/retrocompatibilità: dai vecchi selettori al modo più
 * vicino. NON è usato dai percorsi vivi. Le leve definitive restano quelle di
 * `derivaLeve`; questo serve solo a leggere i profili legacy senza inventare
 * una seconda tabella di verità.
 *
 * Nota: `anime: null` con `film`/`serie` non distingue una modalità di medium,
 * perché le vecchie caselle non filtravano il medium. In quel caso il ponte
 * sceglie 'generale' invece di attribuire un'esclusione che l'utente non ha
 * mai chiesto.
 *
 * @param {object|null} typeSelectors
 * @param {boolean} kidsMode
 * @returns {'generale'|'film'|'serie'|'anime'|'bambini'}
 */
function modoDaSelettori(typeSelectors = null, kidsMode = false) {
    if (kidsMode) return 'bambini';
    const selettori = typeSelectors && typeof typeSelectors === 'object' ? typeSelectors : {};
    if (selettori.anime === 'only') return 'anime';
    if (selettori.anime === 'exclude') {
        if (selettori.film === true && selettori.serie !== true) return 'film';
        if (selettori.serie === true && selettori.film !== true) return 'serie';
    }
    return 'generale';
}

/**
 * Leve effettive di un profilo legacy, passando dal ponte e poi dall'unica
 * tabella. Utile per i test di caratterizzazione e per una futura migrazione.
 */
function leveDaSelettori(typeSelectors = null, kidsMode = false) {
    return derivaLeve(modoDaSelettori(typeSelectors, kidsMode));
}

function idsProfili(profiles) {
    const ids = new Set();
    for (const profilo of profiles) {
        if (profilo && profilo.id !== undefined && profilo.id !== null) {
            ids.add(String(profilo.id));
        }
    }
    return ids;
}

function idLiberoPerModo(profiles, modo) {
    const ids = idsProfili(profiles);
    const base = `${PREFISSO_ID_MODO}${modo}`;
    if (!ids.has(base)) return base;
    let suffisso = 2;
    while (ids.has(`${base}_${suffisso}`)) suffisso += 1;
    return `${base}_${suffisso}`;
}

function profiloModo(modo) {
    return {
        id: null, // riempito dal chiamante, che conosce gli ID già occupati
        name: NOMI_MODI[modo],
        emoji: '',
        modo,
        catalogs: [],
        settings: {},
        raw_ui_state: {}
    };
}

/**
 * Crea, in memoria, le modalità mancanti di un AddonConfig. Idempotente.
 *
 * Non tocca i profili esistenti: se un profilo non ha `modo`, resta esattamente
 * com'è. Se una modalità è già rappresentata, non viene duplicata. La funzione è
 * sicura da chiamare a ogni lettura; la persistenza è del chiamante.
 *
 * @template T
 * @param {T} addonConfig
 * @returns {T} lo stesso oggetto, con `profiles` eventualmente esteso
 */
function materializzaModi(addonConfig) {
    const config = addonConfig && typeof addonConfig === 'object' ? addonConfig : {};
    if (!Array.isArray(config.profiles)) {
        config.profiles = [];
    }

    const presenti = new Set(
        config.profiles
            .map(profilo => profilo && profilo.modo)
            .filter(isModoValido)
    );

    for (const modo of MODI) {
        if (presenti.has(modo)) continue;
        const nuovo = profiloModo(modo);
        nuovo.id = idLiberoPerModo(config.profiles, modo);
        config.profiles.push(nuovo);
        presenti.add(modo);
    }

    return config;
}

function numeroFinito(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const numero = Number(value);
    return Number.isFinite(numero) ? numero : fallback;
}

function configDi(addonConfig) {
    if (!addonConfig || typeof addonConfig !== 'object') return {};
    if (!addonConfig.config || typeof addonConfig.config !== 'object') {
        addonConfig.config = {};
    }
    return addonConfig.config;
}

function profiliDi(addonConfig) {
    if (Array.isArray(addonConfig?.profiles)) return addonConfig.profiles;
    if (Array.isArray(addonConfig?.config?.profiles)) return addonConfig.config.profiles;
    return [];
}

function profiloAttivoDi(addonConfig) {
    const config = addonConfig?.config || addonConfig || {};
    const profiles = profiliDi(addonConfig);
    const activeProfileId = config.activeProfileId
        || addonConfig?.activeProfileId
        || 'global';

    return profiles.find(profilo => profilo && String(profilo.id) === String(activeProfileId))
        || profiles.find(profilo => profilo?.modo === 'generale')
        || profiles[0]
        || null;
}

/**
 * Valori dei cursori ancora salvati sul profilo attivo, nella forma d'account.
 * Accetta sia i nomi nuovi (`tonalita`/`notorieta`) sia quelli oggi salvati
 * dalla dashboard (`cozy`/`canone`).
 */
function slidersDelProfiloAttivo(addonConfig) {
    const profilo = profiloAttivoDi(addonConfig);
    const source = profilo?.settings?.sliders
        || profilo?.settings?.slider
        || profilo?.sliders
        || profilo?.slider
        || {};

    return {
        tonalita: numeroFinito(source.tonalita, numeroFinito(source.cozy, 0)),
        notorieta: numeroFinito(source.notorieta, numeroFinito(source.canone, 0))
    };
}

/**
 * Legge i cursori d'account. Se `config.sliders` è assente (o un singolo campo
 * manca), ricade sui valori correnti del profilo attivo.
 *
 * @param {object|null} addonConfig
 * @returns {{tonalita: number, notorieta: number}}
 */
function leggiSliders(addonConfig) {
    const fallback = slidersDelProfiloAttivo(addonConfig);
    const account = addonConfig?.config?.sliders || addonConfig?.sliders || null;

    return {
        tonalita: numeroFinito(account?.tonalita, fallback.tonalita),
        notorieta: numeroFinito(account?.notorieta, fallback.notorieta)
    };
}

/**
 * Scrive i cursori a livello account, in memoria. Il chiamante persiste
 * l'AddonConfig; qui non si tocca il profilo attivo.
 *
 * @param {object} addonConfig
 * @param {{tonalita?: number, notorieta?: number}} sliders
 * @returns {object} lo stesso addonConfig
 */
function scriviSliders(addonConfig, sliders = {}) {
    const target = addonConfig && typeof addonConfig === 'object' ? addonConfig : {};
    const config = configDi(target);
    const attuali = config.sliders && typeof config.sliders === 'object' ? config.sliders : {};

    config.sliders = {
        tonalita: numeroFinito(sliders?.tonalita, numeroFinito(attuali.tonalita, 0)),
        notorieta: numeroFinito(sliders?.notorieta, numeroFinito(attuali.notorieta, 0))
    };

    return target;
}

/**
 * Regola di immutabilità del modo applicata al merge degli update.
 *
 * Scelta: IGNORARE il cambio, non rifiutare il salvataggio. Il percorso di update
 * è un merge dell'intero documento usato dalla dashboard: un 400 per un campo
 * che il client non possiede ancora bloccherebbe anche i salvataggi legittimi
 * (cataloghi, cursori, sync Stremio). Un modo già impostato vince sempre; un
 * valore invalido su un profilo senza modo viene scartato.
 *
 * @param {object|null} esistente profilo già persistito
 * @param {object|null} inArrivo profilo del payload
 * @returns {object} copia del profilo in arrivo con il modo corretto
 */
function applicaImmutabilitaModo(esistente, inArrivo) {
    const risultato = { ...(inArrivo && typeof inArrivo === 'object' ? inArrivo : {}) };

    if (isModoValido(esistente?.modo)) {
        risultato.modo = esistente.modo;
    } else if (risultato.modo !== undefined && !isModoValido(risultato.modo)) {
        delete risultato.modo;
    }

    return risultato;
}

module.exports = {
    MODI,
    NOMI_MODI,
    PREFISSO_ID_MODO,
    LEVE_PER_MODO,
    isModoValido,
    derivaLeve,
    modoDaSelettori,
    leveDaSelettori,
    materializzaModi,
    leggiSliders,
    scriviSliders,
    slidersDelProfiloAttivo,
    applicaImmutabilitaModo
};
