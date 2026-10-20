/**
 * Sonda del Ticket 21 — la taratura del decadimento (alpha del giorno + reset).
 *
 * Simula `GIORNI` giornate di home su una riga di 60 titoli: ogni giorno i titoli della pagina 1
 * (`ITEMS_PER_PAGE`) ricevono un'impressione, e il giorno dopo si riapplica il decadimento.
 * Confronta tre configurazioni:
 *   A. il ticket 14 da solo (nessun alpha, nessun reset);
 *   B. + l'alpha del giorno (ticket 21a);
 *   C. + il reset (ticket 21b) — la configurazione in vigore.
 *
 * Misura: quanti titoli DIVERSI passano dalla pagina 1 in `GIORNI` giorni (rotazione) e quanti TORNANO
 * dopo essere usciti (il reset). Con A la rotazione e' a blocchi e nessuno torna.
 *
 * ATTENZIONE: la rampa dei punteggi e' SINTETICA (`1 - 0.012·i`). Non e' la banda del grafo.
 *
 * Uso: node scripts/qa/probe-ticket-21-taratura.js
 */
const { applicaDecadimento } = require('../../src/pool/impressioni');
const { ITEMS_PER_PAGE } = require('../../src/config');

const CAP = 60;
const GIORNI = 10;
const PAGINA = ITEMS_PER_PAGE;

function rigaSintetica() {
    return Array.from({ length: CAP }, (_, i) => ({
        id: `tmdb:${1000 + i}`,
        tmdbId: 1000 + i,
        punteggio: Number((1 - i * 0.012).toFixed(4))
    }));
}

function giornoDi(base, offset) {
    return new Date(base.getTime() + offset * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

/**
 * Una simulazione: per ogni giorno calcola le voci di impressione (giorni distinti e ultimo giorno in
 * home) e applica decadimento + alpha. Ritorna la sequenza delle pagine 1.
 */
async function simula({ alphaBanda, resetGiorniFuori, etichetta, stampa = true }) {
    const riga = rigaSintetica();
    const visto = new Map();          // id -> Set di giorni (offset)
    const pagina1 = [];               // per giorno: array di id
    const base = new Date(Date.now() - GIORNI * 24 * 60 * 60 * 1000);

    for (let g = 0; g < GIORNI; g += 1) {
        const oggi = giornoDi(base, g);
        const voci = new Map();
        for (const item of riga) {
            const giorni = visto.get(String(item.tmdbId));
            if (!giorni || giorni.size === 0) continue;
            const ultimo = Math.max(...giorni);
            voci.set(String(item.tmdbId), { giorni: giorni.size, ultimo: giornoDi(base, ultimo) });
        }
        const { assigned } = await applicaDecadimento({
            userId: 'sonda',
            profileId: 'sonda',
            assigned: { yaca_mondi_movies: riga },
            visti: [],
            oggi,
            alphaBanda,
            resetGiorniFuori,
            leggi: async () => new Map([['yaca_mondi_movies', voci]])
        });
        const page = assigned.yaca_mondi_movies.slice(0, PAGINA).map((i) => String(i.tmdbId));
        pagina1.push(page);
        for (const id of page) {
            if (!visto.has(id)) visto.set(id, new Set());
            visto.get(id).add(g);
        }
    }

    const distinti = new Set(pagina1.flat());
    // «rientrati»: in pagina 1, poi fuori almeno un giorno, poi di nuovo dentro. Con il reset il rientro e'
    // RAPIDO (2 giorni): contare solo le assenze lunghe nasconderebbe proprio l'effetto del ticket 21.
    let rientrati = 0;
    let rientriTotali = 0;
    for (const id of distinti) {
        const presenze = pagina1.map((p, g) => (p.includes(id) ? g : -1)).filter((g) => g >= 0);
        let rientri = 0;
        for (let i = 1; i < presenze.length; i += 1) {
            if (presenze[i] - presenze[i - 1] >= 2) rientri += 1;   // fuori per almeno un giorno
        }
        if (rientri > 0) rientrati += 1;
        rientriTotali += rientri;
    }
    // quanto cambia la pagina da un giorno all'altro
    const sovrapposizioni = [];
    for (let g = 1; g < pagina1.length; g += 1) {
        const ieri = new Set(pagina1[g - 1]);
        sovrapposizioni.push(pagina1[g].filter((id) => ieri.has(id)).length);
    }
    const media = Number((sovrapposizioni.reduce((a, b) => a + b, 0) / sovrapposizioni.length).toFixed(1));
    if (stampa) {
        console.log(`${etichetta.padEnd(28)} diversi in pagina 1: ${String(distinti.size).padStart(2)}/${CAP}` +
            ` · rientrati dopo un'uscita: ${String(rientrati).padStart(2)} (rientri ${rientriTotali})` +
            ` · restano da ieri: ${media}/${PAGINA}`);
    }
    return { distinti: distinti.size, rientrati, rientriTotali, sovrapposizioneMedia: media, pagina1 };
}

async function main() {
    console.log('== Ticket 21: taratura del decadimento (10 giornate simulate) ==');
    console.log(`riga ${CAP} titoli · pagina 1 = ${PAGINA} · rampa dei punteggi SINTETICA`);
    console.log('');

    await simula({ alphaBanda: 0, resetGiorniFuori: 9999, etichetta: 'A. solo decadimento (14)' });
    await simula({ alphaBanda: 0.05, resetGiorniFuori: 9999, etichetta: 'B. + alpha del giorno' });
    const c = await simula({ alphaBanda: 0.05, resetGiorniFuori: 4, etichetta: 'C. + reset (in vigore)' });

    console.log('');
    console.log('letture:');
    console.log('- A non cambia quasi mai pagina finche\' il decadimento non scatta, poi la rinnova a blocchi,');
    console.log('  e chi esce non torna: il reset e\' quello che riporta in gioco i titoli utili.');
    console.log('- B muove l\'ordine ogni giorno dentro la banda: due refresh dello stesso giorno danno lo stesso');
    console.log('  ordine (alpha deterministico da giorno+id), il giorno dopo no.');
    console.log('- C e\' la configurazione decisa: alpha + reset. Nessun titolo esce dalla riga, solo dalla pagina.');
    console.log(`verifica: in C la pagina 1 del primo giorno e\' ${c.pagina1[0].length} titoli, del decimo ${c.pagina1[GIORNI - 1].length}.`);

    // Il reset ha un rischio: se e' troppo corto, un titolo torna a punteggio pieno, resta in home 3 giorni,
    // decade, esce 2 giorni, si azzera, torna... un pendolo. Si misura l'oscillazione al variare della soglia.
    console.log('');
    console.log('== la soglia del reset (giorni fuori prima di azzerare) ==');
    console.log('soglia  diversi in pagina 1  rientri  restano da ieri');
    for (const soglia of [2, 3, 4, 5, 6]) {
        const r = await simula({ alphaBanda: 0.05, resetGiorniFuori: soglia, etichetta: `${soglia}`, stampa: false });
        console.log(`   ${soglia}          ${String(r.distinti).padStart(2)}/60              ` +
            `${String(r.rientriTotali).padStart(2)}     ${r.sovrapposizioneMedia}/${PAGINA}`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
