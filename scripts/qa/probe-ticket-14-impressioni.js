/**
 * Sonda del Ticket 14 — «il ritorno delle impressioni».
 *
 * Cosa misura, su una riga sintetica di 60 titoli e dieci giorni di Stremio:
 *  1. che senza impressioni la riga esca IDENTICA (la linea di base si esegue, non si enuncia);
 *  2. quanti titoli restano nella stessa posizione e quanti cambiano posto con il decadimento;
 *  3. che NESSUN titolo sparisca dalla riga (la riga si rinnova, non si svuota);
 *  4. che un titolo dalla posizione 25 arrivi in pagina 1 (pagina = `ITEMS_PER_PAGE`, come il prodotto);
 *  5. la taratura: per quanti giorni un titolo puo' restare in cima prima di scendere.
 *
 * ATTENZIONE alla provenienza dei numeri: la rampa dei punteggi qui sotto e' SINTETICA
 * (`1 - 0.012*i`). Non e' la banda del grafo: il contratto documentato in
 * `docs/RECOMMENDATION_GRAPH.md` mostra punteggi reali tipo 0.421503 / 0.312940. La conclusione sul
 * turnover dipende dal RAPPORTO fra il primo e il ventunesimo punteggio, non dalla scala: la
 * condizione e' `s1 / s21 > 1 / 0.85^giorni` (vedi il blocco finale).
 *
 * Uso: node scripts/qa/probe-ticket-14-impressioni.js
 */
const { applicaDecadimento } = require('../../src/pool/impressioni');
const { ITEMS_PER_PAGE } = require('../../src/config');

const CAP = 60;
const GIORNI = 10;
const PAGINA = ITEMS_PER_PAGE;

// Una riga con punteggi decrescenti come li consegna il grafo (rampa SINTETICA).
function rigaSintetica() {
    return Array.from({ length: CAP }, (_, i) => ({
        id: `tmdb:${1000 + i}`,
        tmdbId: 1000 + i,
        punteggio: Number((1 - i * 0.012).toFixed(4))
    }));
}

// Gli id come STRINGHE, una volta sola: confrontare stringhe con numeri e' il difetto che questa
// sonda ha avuto (la colonna "restano in pagina 1" stampava 0/10 anche senza decadimento).
function primaPagina(riga = rigaSintetica()) {
    return riga.slice(0, PAGINA).map((i) => String(i.tmdbId));
}

function posizioni(riga) {
    const m = new Map();
    riga.forEach((item, i) => m.set(String(item.tmdbId), i + 1));
    return m;
}

function primi(riga) {
    return riga.slice(0, PAGINA).map((i) => String(i.tmdbId));
}

function impressioniPerGiorni(giorni, ids = primaPagina()) {
    const mappa = new Map();
    for (const id of ids) mappa.set(id, giorni);
    return new Map([['yaca_mondi_movies', mappa]]);
}

async function decadi(impressioni) {
    return applicaDecadimento({
        userId: 'utente-sonda',
        profileId: 'profilo-sonda',
        assigned: { yaca_mondi_movies: rigaSintetica() },
        visti: [],
        leggi: async () => impressioni
    });
}

async function main() {
    const riga = rigaSintetica();
    const prima = posizioni(riga);
    const idsPrimaPagina = primaPagina(riga);

    // 1. La linea di base non si enuncia, si esegue.
    const { assigned: senza } = await decadi(new Map());
    const fermiBase = [...prima.entries()].filter(([id, p]) => posizioni(senza.yaca_mondi_movies).get(id) === p).length;

    // 2. Dieci giorni di home: la pagina 1 e' sempre la stessa.
    const { assigned, statistiche } = await decadi(impressioniPerGiorni(GIORNI));
    const dopo = assigned.yaca_mondi_movies;
    const posizioniDopo = posizioni(dopo);

    const spariti = [...prima.keys()].filter((id) => !posizioniDopo.has(id));
    const fermi = [...prima.entries()].filter(([id, p]) => posizioniDopo.get(id) === p).length;
    const pagePrima = new Set(idsPrimaPagina);
    const pageDopo = new Set(primi(dopo));
    const rimastiInPagina = [...pagePrima].filter((id) => pageDopo.has(id));
    const entrati = primi(dopo)
        .map((id, i) => ({ id, posto: i + 1, prima: prima.get(id) }))
        .filter((x) => x.prima > PAGINA);

    console.log('== Ticket 14: decadimento delle impressioni ==');
    console.log(`riga: ${CAP} titoli · pagina 1 = ${PAGINA} titoli · prima pagina mostrata per ${GIORNI} giorni`);
    console.log(`titoli spariti dalla riga: ${spariti.length}   (deve essere 0)`);
    console.log(`titoli rimasti nella stessa posizione: ${fermi}/${CAP}   (senza decadimento: ${fermiBase}/${CAP})`);
    console.log(`pagina 1: ${rimastiInPagina.length}/${PAGINA} titoli di ieri restano, ${PAGINA - rimastiInPagina.length} entrano da sotto`);
    console.log(`entrati in pagina 1 da oltre la posizione ${PAGINA}: ${entrati.length}`);
    for (const s of entrati.slice(0, 5)) console.log(`   #${s.posto}  tmdb:${s.id}  (era #${s.prima})`);
    if (entrati.length > 5) console.log(`   ... (${entrati.length - 5} altri)`);
    console.log(`statistiche dichiarate: ${statistiche.titoli} titoli scesi in ${statistiche.cataloghi} righe, ` +
        `media ${statistiche.giorniMedi} giorni, ${statistiche.spostamenti} cambi di posizione, ` +
        `${statistiche.righeNonOrdinate} righe non riordinate`);
    console.log(`punteggio del #1 di ieri: ${riga[0].punteggio} -> ${dopo.find((i) => i.tmdbId === riga[0].tmdbId).punteggio.toFixed(4)}`);

    // 3. La promozione del ticket: un titolo dalla posizione 25 deve poter entrare in pagina 1.
    const venticinquesimo = String(riga[PAGINA + 4].tmdbId);
    const postoOra = posizioniDopo.get(venticinquesimo);
    console.log(`il #${PAGINA + 5} di ieri (tmdb:${venticinquesimo}) oggi e' #${postoOra}` +
        `${postoOra <= PAGINA ? ' -> IN PAGINA 1' : ' -> fuori pagina 1'}`);

    // 4. Taratura: la condizione di sorpasso e' s1/s21 > 1/0.85^giorni.
    console.log('');
    console.log('== taratura della formula (0.85^giorni) ==');
    console.log('giorni  punteggio#1  restano in pagina 1   soglia s1/s21 perche\' il #1 scenda');
    for (const giorni of [1, 2, 3, 5, 7, 10]) {
        const { assigned: out } = await decadi(impressioniPerGiorni(giorni));
        const pageOra = new Set(primi(out.yaca_mondi_movies));
        const restano = idsPrimaPagina.filter((id) => pageOra.has(id)).length;
        const soglia = (1 / Math.pow(0.85, giorni)).toFixed(2);
        console.log(`   ${String(giorni).padStart(2)}      ${Math.pow(0.85, giorni).toFixed(4)}          ` +
            `${String(restano).padStart(2)}/${PAGINA}             > ${soglia}`);
    }
    const rapportoRampa = riga[0].punteggio / riga[PAGINA].punteggio;
    console.log(`rapporto s1/s${PAGINA + 1} di questa rampa SINTETICA: ${rapportoRampa.toFixed(2)}`);
    console.log('la banda VERA del grafo va misurata sul contratto (`docs/RECOMMENDATION_GRAPH.md`): con i punteggi');
    console.log('d\'esempio 0.421503 / 0.312940 il rapporto e\' 1.35, quindi il sorpasso scatta da 3 giorni in su.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
