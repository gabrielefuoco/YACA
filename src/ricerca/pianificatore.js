/**
 * src/ricerca/pianificatore.js
 *
 * IL PARSER DELLA RICERCA A SINTASSI ESPLICITA (fetta 2).
 *
 * L'utente scrive operatori come parole-prefisso; il parser restituisce **intenti** per il nostro
 * indice. Niente comprensione del linguaggio naturale, niente modelli: è una grammatica di poche
 * righe di tabella, e ogni scelta lascia un motivo.
 *
 *   simili interstellar                 → un titolo, e i suoi vicini
 *   simili got, bridgerton              → due semi della stessa diffusione
 *   cast leonardo dicaprio              → persona
 *   tema horror, navi anno 1980-1989    → concetto + genere + intervallo
 *   anime tema isekai genere fantasy    → flag + concetti + genere
 *   su netflix lingua giapponese        → provider + lingua
 *
 * Due strati, tenuti separati di proposito:
 *
 *   1. `analizza(query)` è **puro**: tokenizza, riconosce gli operatori, separa i valori con le
 *      virgole, interpreta gli anni, mette da parte il testo residuo. Nessun I/O: si testa con una
 *      stringa e un oggetto.
 *   2. `risolvi(analisi, risolutori)` traduce i valori in id usando i risolutori iniettati
 *      (generi, concetti, persone, titoli, provider). Chi li fornisce — indice, people.db, grafo —
 *      sta fuori da questo file, così il parser non conosce il database e il database non conosce
 *      la sintassi.
 *
 * Regole che valgono qui e non altrove:
 *   - **più valori = OR**, tranne `anno` (intervallo) e `simili` (semi della stessa diffusione);
 *   - **la virgola separa i valori**, sempre: se un titolo o un nome non si risolve, `risolvi`
 *     prova a unirlo al frammento successivo (è così che «Amici miei, atto II» resta un titolo);
 *   - **testo senza operatori = ricerca sul titolo**; testo residuo *con* operatori = scartato e
 *     dichiarato in `motivi`;
 *   - gli operatori si riconoscono per parola intera e per le forme elencate in `OPERATORI`, mai
 *     per fuzzy: «tema» e «team» distano una lettera, e sbagliare operatore è peggio che non
 *     riconoscerlo.
 */

const { genereDaNome } = require('./generi');
const { normalizza } = require('../infra/testo');

/** Le forme accettate per ogni operatore: campo canonico → parole. */
const OPERATORI = Object.freeze([
    { chiave: 'simile_a', forme: ['simili', 'simile'], tipo: 'lista' },
    { chiave: 'persone', forme: ['cast', 'attore', 'attori'], tipo: 'lista' },
    { chiave: 'tema', forme: ['tema', 'temi'], tipo: 'lista' },
    { chiave: 'generi', forme: ['generi', 'genere'], tipo: 'lista' },
    { chiave: 'anno', forme: ['anno', 'anni'], tipo: 'valore' },
    { chiave: 'anime', forme: ['anime'], tipo: 'flag' },
    { chiave: 'provider', forme: ['su', 'piattaforma'], tipo: 'valore' },
    { chiave: 'lingua', forme: ['lingua'], tipo: 'valore' },
    { chiave: 'paese', forme: ['paese', 'nazione'], tipo: 'valore' },
    // Aggiunti il 26/11/2026 per allineare il block editor del creator alla sintassi: erano le
    // uniche dimensioni dell'editor che la lingua non sapeva esprimere.
    { chiave: 'testo', forme: ['titolo'], tipo: 'valore' },
    { chiave: 'crew', forme: ['regista', 'registi', 'autore', 'creatore'], tipo: 'lista' },
    { chiave: 'voto', forme: ['voto', 'voti'], tipo: 'numero' },
    { chiave: 'durata', forme: ['durata'], tipo: 'numero' },
    { chiave: 'eta', forme: ['eta', 'certificazione'], tipo: 'valore' },
    { chiave: 'senza', forme: ['senza', 'escludi'], tipo: 'lista' },
    { chiave: 'ordina', forme: ['ordina', 'ordine'], tipo: 'valore' }
]);

/**
 * Gli operatori che accettano solo numeri (o forme d'anno): il loro valore si ferma al primo token
 * che non è un numero, invece di inghiottire parole.
 */
const OPERATORI_NUMERICI = Object.freeze({
    anno: /^['’]?[0-9]{1,4}([-–—][0-9]{1,4})?s?$/,
    voto: /^[-+.,0-9]+$/,
    durata: /^[-+.,0-9]+$/
});

/**
 * I comparatori del linguaggio comune: `voto > 7`, `durata < 90`, `voto ≥ 8`.
 *
 * Sono il caso in cui il numero da solo direbbe il contrario di quello che l'utente ha chiesto:
 * `durata < 90` letto come «minimo 90» restituisce film di due ore e mezza. Si accettano sciolti
 * (`>` da solo, poi il numero) e attaccati al numero (`<90`), e le forme tipografiche `≤ ≥`.
 */
const COMPARATORE = /^(<=|>=|<|>|≤|≥|=)$/;
const COMPARATORE_CON_NUMERO = /^(<=|>=|<|>|≤|≥=|=)[-+.,0-9]+$/;
const PREFISSO_COMPARATORE = /^(<=|>=|<|>|≤|≥)([-+]?[0-9]*[.,]?[0-9]+)$/;

/** parola normalizzata → operatore. */
const INDICE_OPERATORI = (() => {
    const mappa = new Map();
    for (const operatore of OPERATORI) {
        for (const forma of operatore.forme) mappa.set(normalizza(forma), operatore);
    }
    return mappa;
})();

/** Lingue scritte in italiano → codice ISO 639-1 (quello di `original_language`). */
const LINGUE = Object.freeze({
    italiano: 'it', italiana: 'it', italiane: 'it', italiani: 'it',
    inglese: 'en', inglesi: 'en', americano: 'en', americana: 'en', americani: 'en', americane: 'en',
    francese: 'fr', francesi: 'fr',
    tedesco: 'de', tedesca: 'de', tedeschi: 'de',
    spagnolo: 'es', spagnola: 'es', spagnoli: 'es',
    giapponese: 'ja', giapponesi: 'ja',
    coreano: 'ko', coreana: 'ko', coreani: 'ko',
    cinese: 'zh', cinesi: 'zh',
    russo: 'ru', russa: 'ru', russi: 'ru',
    turco: 'tr', turca: 'tr', turchi: 'tr',
    portoghese: 'pt', portoghesi: 'pt',
    hindi: 'hi', indiano: 'hi',
    arabo: 'ar', araba: 'ar',
    danese: 'da', svedese: 'sv', norvegese: 'no', olandese: 'nl', polacco: 'pl', greco: 'el',
    thailandese: 'th', indonesiano: 'id', ebraico: 'he', persiano: 'fa', ucraino: 'uk'
});

/** Paesi in italiano → ISO 3166-1 alpha-2 (quello di `production_countries`). */
const PAESI = Object.freeze({
    italia: 'IT', italiano: 'IT', italiana: 'IT',
    usa: 'US', america: 'US', americano: 'US', americana: 'US', 'stati uniti': 'US',
    francia: 'FR', francese: 'FR',
    germania: 'DE', tedesco: 'DE', tedesca: 'DE',
    spagna: 'ES', spagnolo: 'ES', spagnola: 'ES',
    giappone: 'JP', giapponese: 'JP',
    corea: 'KR', 'corea del sud': 'KR', coreano: 'KR', coreana: 'KR',
    cina: 'CN', cinese: 'CN',
    'regno unito': 'GB', inghilterra: 'GB', britannico: 'GB', britannica: 'GB', uk: 'GB', gb: 'GB',
    india: 'IN', indiano: 'IN',
    russia: 'RU', russo: 'RU', russa: 'RU',
    messico: 'MX', brasile: 'BR', canada: 'CA', australia: 'AU',
    svezia: 'SE', danimarca: 'DK', norvegia: 'NO', irlanda: 'IE', polonia: 'PL',
    turchia: 'TR', argentina: 'AR', portogallo: 'PT', grecia: 'GR',
    thailandia: 'TH', indonesia: 'ID', israele: 'IL', iran: 'IR', ucraina: 'UA', egitto: 'EG'
});

/**
 * I nomi che l'utente scrive dopo `ordina` → il `sort_by` della DSL.
 * `data` diventa la data giusta per il tipo nel compilatore.
 */
const ORDINI = Object.freeze({
    popolarita: 'popularity.desc', popolare: 'popularity.desc',
    voto: 'vote_average.desc', voti: 'vote_average.desc',
    data: 'primary_release_date.desc', recente: 'primary_release_date.desc', uscita: 'primary_release_date.desc',
    incasso: 'revenue.desc'
});

/**
 * `lingua` e `paese` accettano anche il codice: `ja`, `it`, `it-IT`, `JP`. Il nome italiano resta la
 * forma comoda; il codice è quella che l'editor e i cataloghi salvati usano già.
 */
function codiceLingua(valore) {
    const pulito = String(valore || '').trim().toLowerCase();
    if (/^[a-z]{2}(-[a-z]{2})?$/.test(pulito)) return pulito.slice(0, 2);
    return null;
}

function codicePaese(valore) {
    const pulito = String(valore || '').trim().toLowerCase();
    if (/^[a-z]{2}(-[a-z]{2})?$/.test(pulito)) return pulito.slice(-2).toUpperCase();
    return null;
}

/** Un anno a due cifre: `80` → 1980, `10` → 2010. Sotto 30 è questo secolo. */
function annoDueCifre(valore) {
    const numero = Number(valore);
    if (!Number.isFinite(numero) || numero < 0 || numero > 99) return null;
    return numero >= 30 ? 1900 + numero : 2000 + numero;
}

/**
 * Interpreta il valore di `anno`.
 *
 *   1997        → [1997, 1997]
 *   1990-2000   → [1990, 2000]
 *   1990 2000   → [1990, 2000]
 *   80 / '80    → [1980, 1989]   (decennio)
 *   80-90       → [1980, 1999]
 *   1980-89     → [1980, 1989]
 *
 * @returns {{ anno: [number, number]|null, motivo: string|null }}
 */
function interpretaAnno(valore) {
    let pulito = String(valore || '').replace(/['’\s]/g, '').replace(/[–—]/g, '-');
    if (!pulito) return { anno: null, motivo: 'anno_non_valido: (vuoto)' };

    // `anno 1990 2000`: due anni separati da spazio, che lo span ha unito in un valore.
    const dueAnni = pulito.match(/^(\d{4})(\d{4})$/);
    if (dueAnni) pulito = `${dueAnni[1]}-${dueAnni[2]}`;

    const intervallo = pulito.match(/^(\d{1,4})-(\d{1,4})$/);
    if (intervallo) {
        const da = intervallo[1].length <= 2 ? annoDueCifre(intervallo[1]) : Number(intervallo[1]);
        if (!da) return { anno: null, motivo: `anno_non_valido: ${valore}` };
        let a = intervallo[2].length <= 2 ? annoDueCifre(intervallo[2]) : Number(intervallo[2]);
        if (!a) return { anno: null, motivo: `anno_non_valido: ${valore}` };
        // La seconda estremità a due cifre è la FINE (`80-90` = 1980-1999, `1980-89` = 1980-1989).
        if (intervallo[2].length <= 2 && intervallo[1].length <= 2) a += 9;
        if (a < da) return { anno: null, motivo: `anno_non_valido: ${valore}` };
        return { anno: [da, a], motivo: null };
    }

    const singolo = pulito.match(/^(\d{1,4})s?$/);
    if (!singolo) return { anno: null, motivo: `anno_non_valido: ${valore}` };
    if (singolo[1].length <= 2) {
        const inizio = annoDueCifre(singolo[1]);
        if (!inizio) return { anno: null, motivo: `anno_non_valido: ${valore}` };
        return { anno: [inizio, inizio + 9], motivo: null };
    }
    if (singolo[1].length !== 4) return { anno: null, motivo: `anno_non_valido: ${valore}` };
    const anno = Number(singolo[1]);
    return { anno: [anno, anno], motivo: null };
}

function numeroDa(testo) {
    const pulito = String(testo === null || testo === undefined ? '' : testo).trim();
    if (!/^[0-9]+([.][0-9]+)?$/.test(pulito)) return null;
    const numero = Number(pulito);
    return Number.isFinite(numero) ? numero : null;
}

/**
 * `7+` → [7, null] · `7-9` → [7, 9] · `4-` → [null, 4] · `7` → [7, null]
 * Il numero secco è un minimo: è la forma che l'editor non usa (manda sempre un estremo esplicito),
 * quindi non c'è ambiguità da sciogliere.
 *
 * @returns {{ intervallo: [number|null, number|null]|null, motivo: string|null }}
 */
function interpretaIntervallo(valore) {
    const pulito = String(valore === null || valore === undefined ? '' : valore).replace(/,/g, '.').replace(/\s+/g, '');
    if (!pulito) return { intervallo: null, motivo: 'numero_non_valido: (vuoto)' };

    // `> 7`, `<90`, `≥ 8`: il comparatore decide il verso. Senza, `7` è un minimo (il caso più
    // frequente) — ma un `<` non può essere letto come un `>` senza dire bugie.
    const conComparatore = pulito.match(PREFISSO_COMPARATORE);
    if (conComparatore) {
        const verso = conComparatore[1];
        const numero = numeroDa(conComparatore[2]);
        if (numero === null) return { intervallo: null, motivo: `numero_non_valido: ${valore}` };
        // `>` e `>=` coincidono qui: i filtri dell'indice conoscono solo gte/lte, e arrotondare
        // per eccesso (7.1 per un `> 7`) inventerebbe un decimale che nessuno ha chiesto.
        return { intervallo: ['<', '<=', '≤'].includes(verso) ? [null, numero] : [numero, null], motivo: null };
    }
    // Un comparatore davanti a un intervallo (`< 4-9`) non ha un significato ovvio: si rifiuta.
    if (COMPARATORE.test(pulito) || COMPARATORE_CON_NUMERO.test(pulito)) {
        return { intervallo: null, motivo: `numero_non_valido: ${valore}` };
    }

    if (pulito.endsWith('+')) {
        const minimo = numeroDa(pulito.slice(0, -1));
        return minimo === null ? { intervallo: null, motivo: `numero_non_valido: ${valore}` } : { intervallo: [minimo, null], motivo: null };
    }
    if (pulito.startsWith('-')) {
        const massimo = numeroDa(pulito.slice(1));
        return massimo === null ? { intervallo: null, motivo: `numero_non_valido: ${valore}` } : { intervallo: [null, massimo], motivo: null };
    }
    const parti = pulito.split('-');
    if (parti.length === 2) {
        // `4-` = massimo 4, `90-` = minimo 90: l'estremo vuoto è un estremo aperto.
        const minimo = parti[0] ? numeroDa(parti[0]) : null;
        const massimo = parti[1] ? numeroDa(parti[1]) : null;
        if ((parti[0] && minimo === null) || (parti[1] && massimo === null)) {
            return { intervallo: null, motivo: `numero_non_valido: ${valore}` };
        }
        if (minimo === null && massimo === null) return { intervallo: null, motivo: `numero_non_valido: ${valore}` };
        if (minimo !== null && massimo !== null && minimo > massimo) return { intervallo: null, motivo: `numero_non_valido: ${valore}` };
        return { intervallo: [minimo, massimo], motivo: null };
    }
    const secco = numeroDa(pulito);
    return secco === null ? { intervallo: null, motivo: `numero_non_valido: ${valore}` } : { intervallo: [secco, null], motivo: null };
}

/** `senza genere horror, commedia` → [{tipo:'genere', nome:'horror'}, {tipo:'genere', nome:'commedia'}] */
function interpretaSenza(valori) {
    const esclusi = [];
    let tipoCorrente = 'tema';
    for (const valore of Array.isArray(valori) ? valori : []) {
        const parole = String(valore).trim().split(/\s+/).filter(Boolean);
        if (parole.length === 0) continue;
        const primo = normalizza(parole[0]);
        if (primo === 'genere' || primo === 'generi') {
            tipoCorrente = 'genere';
            parole.shift();
        } else if (primo === 'tema' || primo === 'temi') {
            tipoCorrente = 'tema';
            parole.shift();
        }
        const nome = parole.join(' ').trim();
        if (nome) esclusi.push({ tipo: tipoCorrente, nome });
    }
    return esclusi;
}

/** L'intento canonico, vuoto: un solo posto in cui si vede la forma completa. */
function intentoVuoto() {
    return {
        generi: [],
        anno: null,
        concetti: [],
        persone: [],
        crew: [],
        provider: null,
        lingua: null,
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
    };
}

/**
 * Lo strato PURO: da una stringa a un'intenzione lessicale (valori come li ha scritti l'utente).
 *
 * @param {string} query
 * @returns {{ grezzo: Object, testo: string|null, motivi: string[] }}
 */
function analizza(query) {
    const originale = String(query || '').trim();
    const motivi = [];
    const grezzo = {
        simile_a: [],
        persone: [],
        crew: [],
        tema: [],
        generi: [],
        senza: [],
        anno: null,
        voto: null,
        durata: null,
        eta: null,
        ordina: null,
        testo: null,
        anime: null,
        provider: null,
        lingua: null,
        paese: null
    };

    if (!originale) return { grezzo, testo: null, motivi: ['query_vuota'] };

    // Le virgole diventano token propri: separano i valori dentro un operatore.
    const token = originale.replace(/,/g, ' , ').split(/\s+/).filter(Boolean);

    let operatoreCorrente = null;
    let buffer = [];
    const testoLibero = [];
    let operatoriTrovati = 0;

    const assegnaValoreSingolo = (chiave, valore) => {
        if (grezzo[chiave] !== null) motivi.push(`operatore_ripetuto: ${chiave}`);
        grezzo[chiave] = valore;
    };

    const chiudiValore = () => {
        const valore = buffer.join(' ').trim();
        const operatore = operatoreCorrente;
        buffer = [];
        if (!operatore) return;
        if (!valore) {
            if (operatore.tipo === 'valore' || operatore.tipo === 'numero') motivi.push(`valore_mancante: ${operatore.chiave}`);
            return;
        }
        if (operatore.tipo === 'lista') grezzo[operatore.chiave].push(valore);
        else assegnaValoreSingolo(operatore.chiave, valore);
    };

    for (const pezzo of token) {
        if (pezzo === ',') {
            chiudiValore();
            continue;
        }

        const parolaNormalizzata = normalizza(pezzo);

        // Due valori sono fatti di parole che sono anche operatori:
        //   `senza genere horror`  → «genere» è il tipo dell'esclusione, non l'operatore generi
        //   `ordina voto`          → «voto» è il criterio, non l'operatore voto
        // Dentro quegli span la parola resta un valore.
        const dentroSenza = operatoreCorrente
            && operatoreCorrente.chiave === 'senza'
            && ['genere', 'generi', 'tema', 'temi'].includes(parolaNormalizzata);
        const dentroOrdina = operatoreCorrente && operatoreCorrente.chiave === 'ordina';
        if ((dentroSenza || dentroOrdina) && buffer.length === 0) {
            buffer.push(pezzo);
            continue;
        }

        const operatore = INDICE_OPERATORI.get(parolaNormalizzata);
        if (operatore) {
            chiudiValore();
            operatoriTrovati += 1;
            if (operatore.tipo === 'flag') {
                grezzo[operatore.chiave] = true;
                // Il flag non consuma valori: i token successivi restano liberi finché non arriva
                // un altro operatore.
                operatoreCorrente = null;
            } else {
                operatoreCorrente = operatore;
            }
            continue;
        }

        if (operatoreCorrente) {
            // Gli operatori numerici non si mangiano le parole che seguono: senza questa guardia
            // «anni 80 sulle navi» diventava un anno chiamato «80 sulle navi» (non valido) e il
            // resto andava perso.
            // Un comparatore è parte del valore, non testo da buttare: si accumula nel buffer
            // insieme al numero che segue, e `interpretaIntervallo` lo usa per la direzione.
            const numerico = OPERATORI_NUMERICI[operatoreCorrente.chiave];
            if (!numerico) {
                buffer.push(pezzo);
                continue;
            }
            const attendeNumero = buffer.length > 0 && COMPARATORE.test(buffer[buffer.length - 1]);
            if (COMPARATORE.test(pezzo) || COMPARATORE_CON_NUMERO.test(pezzo)) buffer.push(pezzo);
            else if (attendeNumero && numerico.test(pezzo)) buffer.push(pezzo);
            else if (buffer.length > 0) testoLibero.push(pezzo);
            else if (!numerico.test(pezzo)) testoLibero.push(pezzo);
            else buffer.push(pezzo);
        } else testoLibero.push(pezzo);
    }
    chiudiValore();

    let testo = null;
    const testoResiduo = testoLibero.join(' ').trim();

    if (operatoriTrovati === 0) {
        // Nessun operatore: è una ricerca sul titolo, come sempre.
        testo = originale;
    } else if (testoResiduo) {
        motivi.push(`ignorato: ${testoResiduo}`);
    }

    if (grezzo.anno !== null) {
        const { anno, motivo } = interpretaAnno(grezzo.anno);
        grezzo.anno = anno;
        if (motivo) motivi.push(motivo);
    }

    for (const campo of ['voto', 'durata']) {
        if (grezzo[campo] === null) continue;
        const { intervallo, motivo } = interpretaIntervallo(grezzo[campo]);
        grezzo[campo] = intervallo;
        if (motivo) motivi.push(`${campo}_${motivo}`);
    }

    if (grezzo.senza.length > 0) grezzo.senza = interpretaSenza(grezzo.senza);

    if (grezzo.ordina !== null) {
        const chiave = ORDINI[normalizza(grezzo.ordina)] || null;
        if (!chiave) motivi.push(`ordine_non_riconosciuto: ${grezzo.ordina}`);
        grezzo.ordina = chiave;
    }

    if (grezzo.eta !== null) {
        const eta = String(grezzo.eta).trim().toUpperCase().replace(/[^A-Z0-9+-]/g, '');
        if (!eta) motivi.push(`eta_non_valida: ${grezzo.eta}`);
        grezzo.eta = eta || null;
    }

    return { grezzo, testo, motivi };
}

async function prova(resolver, valore, motivi) {
    try {
        return await resolver(valore);
    } catch (err) {
        motivi.push(`risolutore_in_errore: ${err.message || 'sconosciuto'}`);
        return null;
    }
}

function normalizzaRisultato(risultato) {
    if (Array.isArray(risultato)) return risultato.filter(v => v !== null && v !== undefined && v !== '');
    if (risultato === null || risultato === undefined || risultato === '') return [];
    return [risultato];
}

/**
 * Risolve un elenco di valori in id, con la regola del **match più lungo**.
 *
 * La virgola separa i valori, ma un titolo può contenerla: «Amici miei, atto II» e «Amici miei»
 * sono due film diversi, quindi unire *solo quando un frammento non si risolve* non basta —
 * «amici miei» si risolve benissimo, e si sceglierebbe il film sbagliato. Si prova quindi il
 * prefisso più lungo che il risolutore conosce e si scende: con «got, bridgerton» nessuna unione
 * risolve e si separa; con «amici miei, atto ii» l'unione risolve e resta un titolo solo.
 *
 * @param {string[]} valori
 * @param {(valore: string) => Array|string|number|null} resolver
 * @param {string[]} motivi
 * @param {string} etichetta per il motivo di scarto
 * @returns {Array<string|number>}
 */
async function risolviLista(valori, resolver, motivi, etichetta) {
    const elenco = Array.isArray(valori) ? valori : [];
    if (typeof resolver !== 'function') {
        for (const valore of elenco) motivi.push(`${etichetta}_non_risolto: ${valore} (risolutore assente)`);
        return [];
    }

    const risolti = [];
    let i = 0;
    while (i < elenco.length) {
        let risultato = null;
        let fine = i;

        // Dal più lungo al più corto: il primo che il risolutore conosce vince.
        for (let j = elenco.length - 1; j >= i && !risultato; j--) {
            risultato = await prova(resolver, elenco.slice(i, j + 1).join(' '), motivi);
            if (risultato) fine = j;
        }

        if (!risultato) {
            motivi.push(`${etichetta}_non_risolto: ${elenco[i]}`);
            i += 1;
            continue;
        }
        for (const id of normalizzaRisultato(risultato)) {
            if (!risolti.includes(id)) risolti.push(id);
        }
        i = fine + 1;
    }
    return risolti;
}

/** Risolve un singolo valore senza sporcare i motivi: serve alle prove con ripiego. */
async function provaSingola(resolver, valore) {
    if (typeof resolver !== 'function') return [];
    try {
        return normalizzaRisultato(await resolver(valore));
    } catch (_err) {
        return [];
    }
}

/**
 * Lo strato con I/O, tutto iniettato: dai valori grezzi agli intenti canonici.
 *
 * @param {{ grezzo: Object, testo: string|null, motivi: string[] }} analisi
 * @param {Object} [risolutori]
 * @param {(nome: string) => number|null} [risolutori.genere]
 * @param {(nome: string) => string[]} [risolutori.concetto] nomi canonici di keyword (espansi)
 * @param {(nome: string) => Array} [risolutori.persona]
 * @param {(nome: string) => Array} [risolutori.titolo]
 * @param {(nome: string) => Array} [risolutori.provider]
 * @returns {Promise<{ intenti: Object[], motivi: string[] }>}
 */
async function risolvi(analisi, risolutori = {}) {
    const { grezzo, testo } = analisi || {};
    const motivi = [...((analisi && analisi.motivi) || [])];
    if (!grezzo) return { intenti: [], motivi };

    const intento = intentoVuoto();
    // `titolo X` è il testo libero *inside* gli operatori: vince su quello fuori (che con gli
    // operatori presenti viene scartato).
    intento.testo = (typeof grezzo.testo === 'string' && grezzo.testo.trim()) ? grezzo.testo.trim() : (testo || null);
    intento.anno = Array.isArray(grezzo.anno) ? grezzo.anno : null;
    intento.anime = grezzo.anime === true ? true : null;
    intento.voto = Array.isArray(grezzo.voto) ? grezzo.voto : null;
    intento.durata = Array.isArray(grezzo.durata) ? grezzo.durata : null;
    intento.eta = grezzo.eta || null;
    intento.ordina = grezzo.ordina || null;

    if (grezzo.lingua) {
        intento.lingua = LINGUE[normalizza(grezzo.lingua)] || codiceLingua(grezzo.lingua) || null;
        if (!intento.lingua) motivi.push(`lingua_non_riconosciuta: ${grezzo.lingua}`);
    }
    if (grezzo.paese) {
        intento.paese = PAESI[normalizza(grezzo.paese)] || codicePaese(grezzo.paese) || null;
        if (!intento.paese) motivi.push(`paese_non_riconosciuto: ${grezzo.paese}`);
    }
    if (grezzo.provider) {
        intento.provider = await risolviLista([grezzo.provider], risolutori.provider, motivi, 'provider');
        if (intento.provider.length === 0) intento.provider = null;
    }

    // Entrambi gli operatori provano **prima il genere**: se una parola è un genere TMDB, quello è
    // il suo significato, e non c'è motivo di trattarla come keyword. Differiscono nel ripiego:
    // `tema` dichiara «genere o keyword», `generi` dichiara «solo generi» e quando ripiega lo dice
    // (`genere_degradato_a_tema`). Così `generi isekai` funziona invece di fallire, e si vede che
    // l'utente ha scritto una keyword in un campo di generi.
    for (const valore of grezzo.generi || []) {
        const id = genereRisolto(valore, risolutori);
        if (id !== null) {
            if (!intento.generi.includes(id)) intento.generi.push(id);
            continue;
        }
        const concetti = await provaSingola(risolutori.concetto, valore);
        if (concetti.length > 0) {
            motivi.push(`genere_degradato_a_tema: ${valore}`);
            for (const nome of concetti) if (!intento.concetti.includes(nome)) intento.concetti.push(nome);
            continue;
        }
        motivi.push(`genere_non_riconosciuto: ${valore}`);
    }

    for (const valore of grezzo.tema || []) {
        const id = genereRisolto(valore, risolutori);
        if (id !== null) {
            if (!intento.generi.includes(id)) intento.generi.push(id);
            continue;
        }
        const concetti = await provaSingola(risolutori.concetto, valore);
        if (concetti.length > 0) {
            for (const nome of concetti) if (!intento.concetti.includes(nome)) intento.concetti.push(nome);
            continue;
        }
        motivi.push(`tema_non_riconosciuto: ${valore}`);
    }

    // Con le virgole che uniscono i frammenti: titoli e nomi possono contenerle.
    intento.persone = await risolviLista(grezzo.persone, risolutori.persona, motivi, 'persona');
    intento.crew = await risolviLista(grezzo.crew, risolutori.crew, motivi, 'regista');
    intento.simile_a = await risolviLista(grezzo.simile_a, risolutori.titolo, motivi, 'titolo');

    // `senza genere …` e `senza tema …`: stessi risolutori, lato esclusione.
    for (const escluso of grezzo.senza || []) {
        if (escluso.tipo === 'genere') {
            const id = genereRisolto(escluso.nome, risolutori);
            if (id === null) motivi.push(`genere_non_riconosciuto: ${escluso.nome}`);
            else if (!intento.senzaGeneri.includes(id)) intento.senzaGeneri.push(id);
            continue;
        }
        const concetti = await provaSingola(risolutori.concetto, escluso.nome);
        if (concetti.length === 0) motivi.push(`tema_non_riconosciuto: ${escluso.nome}`);
        else for (const nome of concetti) if (!intento.senzaConcetti.includes(nome)) intento.senzaConcetti.push(nome);
    }

    // Un intento senza nessuna condizione non è una ricerca: chi chiama deve poterlo dire invece
    // di mostrare il catalogo popolare e chiamarlo «risultato».
    const haCondizioni = Boolean(
        intento.testo ||
        intento.generi.length ||
        intento.concetti.length ||
        intento.persone.length ||
        intento.simile_a.length ||
        intento.crew.length ||
        intento.senzaGeneri.length ||
        intento.senzaConcetti.length ||
        intento.anno ||
        intento.voto ||
        intento.durata ||
        intento.eta ||
        intento.ordina ||
        intento.provider ||
        intento.lingua ||
        intento.paese ||
        intento.anime
    );
    if (!haCondizioni) motivi.push('nessuna_condizione');

    return { intenti: [intento], motivi };
}

/** Il genere di un valore: dal risolutore se c'è, altrimenti dal dizionario dei 19. */
function genereRisolto(valore, risolutori) {
    if (typeof risolutori.genere === 'function') {
        let risultato;
        try {
            risultato = risolutori.genere(valore);
        } catch (_err) {
            return null;
        }
        if (Array.isArray(risultato)) risultato = risultato[0] !== undefined ? risultato[0] : null;
        return risultato === null || risultato === undefined || risultato === '' ? null : risultato;
    }
    return genereDaNome(valore);
}

/**
 * La porta del parser: stringa in, intenti (e motivi) out. Nessuna eccezione.
 *
 * **Una riga = una intenzione.** In Stremio la ricerca è una riga sola; nel form di creazione
 * cataloghi una riga per blocco, così la sintassi esprime anche il catalogo multi-blocco
 * (`intenti: [i1, i2]`, che il compilatore esegue e il consensus fonde) senza inventare operatori.
 * Le righe vuote si saltano; i motivi di una riga portano il numero quando le righe sono più d'una.
 *
 * @param {string} query
 * @param {{ risolutori?: Object }} [opzioni]
 * @returns {Promise<{ intenti: Object[], motivi: string[] }>}
 */
async function pianifica(query, { risolutori = {} } = {}) {
    try {
        // Una riga = una intenzione. `String.fromCharCode(10)` invece di una regex con gli escape:
        // qui il testo attraversa piu' strumenti e un backslash mangiato rompe il file in silenzio.
        const righe = String(query === null || query === undefined ? '' : query)
            .split(String.fromCharCode(10))
            .map(riga => riga.trim())
            .filter(Boolean);

        if (righe.length === 0) return { intenti: [], motivi: ['query_vuota'] };
        if (righe.length === 1) return await risolvi(analizza(righe[0]), risolutori);

        const intenti = [];
        const motivi = [];
        for (let i = 0; i < righe.length; i++) {
            const esito = await risolvi(analizza(righe[i]), risolutori);
            for (const intento of esito.intenti || []) intenti.push(intento);
            for (const motivo of esito.motivi || []) motivi.push(`riga ${i + 1}: ${motivo}`);
        }
        return { intenti, motivi };
    } catch (err) {
        return { intenti: [], motivi: [`errore_parser: ${err.message || 'sconosciuto'}`] };
    }
}

module.exports = {
    OPERATORI,
    LINGUE,
    PAESI,
    analizza,
    risolvi,
    pianifica,
    interpretaAnno,
    risolviLista,
    intentoVuoto
};
