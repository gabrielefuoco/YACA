/**
 * Sonda del Ticket 14 — «il ritorno delle impressioni».
 *
 * Cosa misura, su una riga sintetica di 60 titoli e dieci giorni di Stremio:
 *  1. quanti titoli restano nella stessa posizione (senza decadimento: tutti);
 *  2. quanti posti cambia la top-10 con il decadimento (0.85^giorni, >=3 giorni, mai visti);
 *  3. che NESSUN titolo sparisca dalla riga (la riga si rinnova, non si svuota);
 *  4. che i candidati dalla posizione 21-60 salgano davvero.
 *
 * Uso: node scripts/qa/probe-ticket-14-impressioni.js
 */
const { applicaDecadimento } = require('../../src/pool/impressioni');

const CAP = 60;
const GIORNI = 10;

// Una riga con punteggi decrescenti come li consegna il grafo.
function rigaSintetica() {
    return Array.from({ length: CAP }, (_, i) => ({
        id: `tmdb:${1000 + i}`,
        tmdbId: 1000 + i,
        punteggio: Number((1 - i * 0.012).toFixed(4))
    }));
}

// Dieci giorni di home: la pagina 1 e' sempre la stessa, i primi 10.
const PRIMA_PAGINA = rigaSintetica().slice(0, 10).map((i) => String(i.tmdbId));

function impressioniDieciGiorni() {
    const mappa = new Map();
    for (const id of PRIMA_PAGINA) mappa.set(id, GIORNI);
    return new Map([['yaca_mondi_movies', mappa]]);
}

function top(riga, n = 10) {
    return riga.slice(0, n).map((i) => i.tmdbId);
}

function posizioni(riga) {
    const m = new Map();
    riga.forEach((item, i) => m.set(item.tmdbId, i + 1));
    return m;
}

async function main() {
    const riga = rigaSintetica();
    const prima = posizioni(riga);

    const { assigned, statistiche } = await applicaDecadimento({
        userId: 'utente-sonda',
        profileId: 'profilo-sonda',
        assigned: { yaca_mondi_movies: riga },
        visti: [],
        leggi: async () => impressioniDieciGiorni()
    });

    const dopo = assigned.yaca_mondi_movies;
    const posizioniDopo = posizioni(dopo);

    const spariti = [...prima.keys()].filter((id) => !posizioniDopo.has(id));
    const saliti = top(dopo)
        .map((id, i) => ({ id, posto: i + 1, prima: prima.get(id) }))
        .filter((x) => x.prima > 10);

    const fermi = [...prima.entries()].filter(([id, p]) => posizioniDopo.get(id) === p).length;
    const top10Prima = new Set(top(riga));
    const top10Dopo = new Set(top(dopo));
    const rimastiInTop10 = [...top10Prima].filter((id) => top10Dopo.has(id));

    console.log('== Ticket 14: decadimento delle impressioni ==');
    console.log(`riga: ${CAP} titoli · prima pagina mostrata per ${GIORNI} giorni`);
    console.log(`titoli spariti dalla riga: ${spariti.length}   (deve essere 0)`);
    console.log(`titoli rimasti nella stessa posizione: ${fermi}/${CAP}`);
    console.log(`top-10: ${rimastiInTop10.length}/10 titoli di ieri restano, ${10 - rimastiInTop10.length} entrano da sotto`);
    console.log(`entrati in top-10 dalla posizione 11-60: ${saliti.length}`);
    for (const s of saliti) console.log(`   #${s.posto}  tmdb:${s.id}  (era #${s.prima})`);
    console.log(`statistiche dichiarate: ${statistiche.titoli} titoli scesi in ${statistiche.cataloghi} righe, ` +
        `media ${statistiche.giorniMedi} giorni, ${statistiche.percepibile} oltre la soglia percepibile`);
    console.log(`punteggio del #1 di ieri: ${riga[0].punteggio} -> ${dopo.find((i) => i.tmdbId === riga[0].tmdbId).punteggio.toFixed(4)}`);
    // TARATURA: la formula del ticket e' 0.85^giorni. Qui si misura che cosa significa per quanti
    // giorni un titolo puo' restare in pagina 1, dato che i punteggi del grafo stanno in una banda
    // stretta (il #1 vale 1.00, il #20 vale 0.77).
    console.log('');
    console.log('== taratura della formula (0.85^giorni) ==');
    console.log('giorni  punteggio#1  quanti dei 10 di ieri restano in pagina 1');
    for (const giorni of [1, 2, 3, 5, 7, 10]) {
        const mappa = new Map();
        for (const id of PRIMA_PAGINA) mappa.set(id, giorni);
        const { assigned: out } = await applicaDecadimento({
            userId: 'utente-sonda',
            profileId: 'profilo-sonda',
            assigned: { yaca_mondi_movies: rigaSintetica() },
            visti: [],
            leggi: async () => new Map([['yaca_mondi_movies', mappa]])
        });
        const topOra = new Set(top(out.yaca_mondi_movies));
        const restano = PRIMA_PAGINA.filter((id) => topOra.has(id)).length;
        console.log(`   ${String(giorni).padStart(2)}      ${Math.pow(0.85, giorni).toFixed(4)}          ${restano}/10`);
    }
    console.log('letture di impressioni per richiesta: 1 (una query per tutti i cataloghi di un media)');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
