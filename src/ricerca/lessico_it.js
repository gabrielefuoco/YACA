/**
 * src/ricerca/lessico_it.js
 *
 * Il ponte italiano → keyword TMDB (fetta 3 della ricerca a sintassi esplicita).
 *
 * Perché esiste. Le keyword di TMDB sono **in inglese**: il grafo gerarchico sa che `ship` è
 * parente di `sea voyage` e `cargo ship`, ma non sa che «navi» vuol dire `ship`. Nessuna traduzione
 * ufficiale esiste (TMDB non traduce le keyword), quindi il ponte è questo file: poche centinaia di
 * voci, curate a mano, versionate.
 *
 * Perché curate e non generate. Il valore deve essere una keyword che **esiste davvero** nel dump:
 * una voce sbagliata non dà errore, dà una pagina vuota. `scripts/qa/check-lessico.js` verifica ogni
 * valore contro la mappa nome↔id dell'indice (`keywordIdForName`) e stampa i mancanti: si corregge
 * prima del deploy, non dopo.
 *
 * Forma: chiave normalizzata (minuscole, senza accenti, spazi singoli) → una o più keyword inglesi.
 * La prima è l'**ancora**: è quella che il grafo espande (`ship` → `sea voyage`, `cargo ship`, …).
 * Le altre servono quando l'ancora da sola è stretta.
 *
 * Come si estende: aggiungere la voce, lanciare `node scripts/qa/check-lessico.js`, e se il valore
 * è segnalato cercare il nome vero con `node scripts/qa/check-lessico.js --cerca <parola>`.
 */

const { normalizza } = require('../infra/testo');

const LESSICO_IT = Object.freeze({
    // ─── Natura, animali, mare ───
    navi: ['ship'],
    nave: ['ship'],
    naufragio: ['shipwreck'],
    pirati: ['pirate'],
    pirata: ['pirate'],
    balene: ['whale'],
    balena: ['whale'],
    squali: ['shark'],
    squalo: ['shark'],
    sottomarino: ['submarine'],
    dinosauri: ['dinosaur'],
    dinosauro: ['dinosaur'],
    animali: ['animal'],
    cani: ['dog'],
    cane: ['dog'],
    gatti: ['cat'],
    gatto: ['cat'],
    cavalli: ['horse'],
    cavallo: ['horse'],
    orsi: ['bear'],
    lupi: ['wolf'],
    lupo: ['wolf'],
    leoni: ['lion'],
    uccelli: ['bird'],
    insetti: ['insect'],
    ragni: ['spider'],
    serpenti: ['snake'],
    api: ['bee'],
    giungla: ['jungle'],
    deserto: ['desert'],
    montagna: ['mountain'],
    isola: ['island'],
    foresta: ['forest'],
    oceano: ['ocean'],
    spazio: ['outer space'],
    'viaggio nello spazio': ['space travel'],
    marte: ['mars'],
    marziani: ['mars'],

    // ─── Soprannaturale, fantastico, orrore ───
    zombie: ['zombie'],
    vampiri: ['vampire'],
    vampiro: ['vampire'],
    fantasmi: ['ghost'],
    fantasma: ['ghost'],
    mostri: ['monster'],
    mostro: ['monster'],
    alieni: ['alien'],
    alieno: ['alien'],
    robot: ['robot'],
    draghi: ['dragon'],
    drago: ['dragon'],
    maghi: ['wizard'],
    mago: ['wizard'],
    magia: ['witchcraft'],
    streghe: ['witch'],
    strega: ['witch'],
    maledizione: ['curse'],
    licantropi: ['werewolf'],
    diavolo: ['devil'],
    angeli: ['angel'],
    inferno: ['hell'],
    paradiso: ['heaven'],
    immortale: ['immortality'],
    supereroi: ['superhero'],
    supereroe: ['superhero'],
    apocalisse: ['apocalypse'],
    distopia: ['dystopia'],
    cyberpunk: ['cyberpunk'],
    steampunk: ['steampunk'],
    'viaggi nel tempo': ['time travel'],
    'viaggio nel tempo': ['time travel'],
    'loop temporale': ['time loop'],
    cloni: ['cloning'],
    clonazione: ['cloning'],
    'intelligenza artificiale': ['artificial intelligence (a.i.)'],
    hacker: ['hacker'],
    'videogiochi': ['video game'],

    // ─── Società, crimine, giustizia ───
    mafia: ['mafia'],
    rapine: ['heist'],
    rapina: ['heist'],
    vendetta: ['revenge'],
    'serial killer': ['serial killer'],
    detective: ['detective'],
    polizia: ['police'],
    prigione: ['prison'],
    carcere: ['prison'],
    tribunale: ['courtroom'],
    avvocati: ['lawyer'],
    politica: ['politics'],
    giornalismo: ['journalist'],
    giornalista: ['journalist'],
    spie: ['spy'],
    spionaggio: ['spy'],
    ninja: ['ninja'],
    samurai: ['samurai'],
    schiavitu: ['slavery'],
    apartheid: ['apartheid'],
    razzismo: ['racism'],
    immigrazione: ['immigration'],
    prostituzione: ['prostitution'],
    droga: ['drug addiction'],
    alcolismo: ['alcoholism'],
    bullismo: ['bullying'],

    // ─── Storia ───
    'seconda guerra mondiale': ['world war ii'],
    'prima guerra mondiale': ['world war i'],
    vietnam: ['vietnam war'],
    olocausto: ['holocaust'],
    medioevo: ['middle ages'],
    'antica roma': ['ancient rome'],
    'roma antica': ['ancient rome'],
    egitto: ['ancient egypt'],
    vichinghi: ['vikings (norsemen)'],
    gladiatori: ['gladiator'],
    cavalieri: ['knight'],
    nobilta: ['royalty'],
    regina: ['queen'],
    principessa: ['princess'],
    re: ['king'],

    // ─── Famiglia, amore, crescere ───
    natale: ['christmas'],
    natalizio: ['christmas'],
    natalizi: ['christmas'],
    'vigilia di natale': ['christmas eve'],
    halloween: ['halloween'],
    pasqua: ['easter'],
    matrimonio: ['wedding'],
    gravidanza: ['pregnancy'],
    bambini: ['children'],
    adolescenza: ['teenager'],
    'scuola superiore': ['high school'],
    superiori: ['high school'],
    liceo: ['high school'],
    universita: ['college'],
    collegio: ['boarding school'],
    amicizia: ['friendship'],
    amore: ['love'],
    solitudine: ['loneliness'],
    riscatto: ['redemption'],
    'seconda possibilita': ['second chance'],

    // ─── Lavoro, arte, cultura ───
    ospedale: ['hospital'],
    cucina: ['cooking'],
    cuoco: ['cooking'],
    chef: ['cooking'],
    vino: ['wine'],
    cibo: ['food'],
    boxe: ['boxing'],
    calcio: ['soccer players'],
    basket: ['basketball'],
    baseball: ['baseball'],
    'football americano': ['american football'],
    olimpiadi: ['olympics'],
    maratona: ['marathon'],
    concerto: ['concert'],
    ballo: ['dancing'],
    moda: ['fashion'],
    fotografia: ['photographer'],
    pittura: ['painter'],
    scrittore: ['writer'],
    poesia: ['poetry'],
    teatro: ['theater'],
    radio: ['radio'],
    televisione: ['television'],
    circo: ['circus'],
    carnevale: ['carnival'],

    // ─── Viaggi, mezzi, avventura ───
    treno: ['train'],
    automobile: ['car'],
    auto: ['car'],
    moto: ['motorcycle'],
    aereo: ['airplane'],
    'viaggio su strada': ['road trip'],
    sopravvivenza: ['survival'],
    rapimento: ['kidnapping'],
    fuga: ['escape'],
    inseguimento: ['chase'],
    sparatoria: ['shootout'],

    // ─── Temi astratti ───
    sogni: ['dream'],
    memoria: ['memory'],
    amnesia: ['amnesia'],
    fede: ['religion'],
    religione: ['religion'],
    nostalgia: ['nostalgia'],
    'metafora della vita': ['existentialism']
});

/** La voce esatta del lessico, o `null`. */
function concettiDaNome(nome) {
    const cercato = normalizza(nome);
    if (!cercato) return null;
    const voci = LESSICO_IT[cercato];
    return Array.isArray(voci) && voci.length > 0 ? voci : null;
}

/** Le chiavi del lessico, già normalizzate: servono al ripiego fuzzy. */
function chiaviLessico() {
    return Object.keys(LESSICO_IT);
}

module.exports = {
    LESSICO_IT,
    concettiDaNome,
    chiaviLessico
};
