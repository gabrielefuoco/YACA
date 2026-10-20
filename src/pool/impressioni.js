// src/pool/impressioni.js

/**
 * IL RITORNO DELLE IMPRESSIONI (Ticket 14).
 *
 * `src/profile/impressions.js` scrive da sempre quali titoli sono stati serviti in pagina 1, e nessuno li
 * rileggeva: chi apre Stremio per dieci giorni vedeva gli stessi titoli in cima. Qui si legge la finestra
 * recente e si applica un **decadimento sul punteggio**, mai una cancellazione:
 *
 *     punteggio_effettivo = punteggio * 0.85 ** giorni_mostrato
 *
 * solo per i titoli mostrati in pagina 1 per almeno `GIORNI_MINIMI` giorni distinti e **mai visti**.
 * Il titolo scende, i candidati dalla posizione 21-60 salgono: una riga che si rinnova senza perdere
 * qualità. Il decadimento si applica **dopo** la cache delle righe (una lettura per richiesta), quindi
 * non invalida il lavoro del grafo.
 */

const { leggiImpressioniRecenti, IMPRESSIONI_GIORNI_MINIMI, IMPRESSIONI_FATTORE_GIORNO } = require('../profile/impressions');

/** Sotto questa soglia il decadimento non cambia l'ordine in modo percepibile: si dichiara comunque. */
const DECADIMENTO_SOGLIA_PERCETTIBILE = 0.01;

function tmdbDi(item) {
    const raw = item?.tmdbId ?? item?.id;
    return String(raw ?? '').replace(/^tmdb:/, '');
}

/**
 * Applica il decadimento a un assegnato di cataloghi. NON muta gli input (le righe vengono dalla cache:
 * mutarle avvelenerebbe la cache) e NON toglie nessun titolo.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.profileId
 * @param {Object<string, Array<object>>} params.assigned
 * @param {Set<string>|string[]} [params.visti] i titoli che l'utente ha gia' visto (i semi del grafo)
 * @param {number} [params.giorniMinimi]
 * @param {number} [params.fattore]
 * @returns {Promise<{assigned: Object, statistiche: {titoli: number, cataloghi: number, giorniMedi: number}}>}
 */
async function applicaDecadimento({
    userId,
    profileId,
    assigned,
    visti = [],
    giorniMinimi = IMPRESSIONI_GIORNI_MINIMI,
    fattore = IMPRESSIONI_FATTORE_GIORNO,
    leggi = leggiImpressioniRecenti
} = {}) {
    const statistiche = { titoli: 0, cataloghi: 0, giorniMedi: 0, percepibile: 0 };
    if (!assigned || typeof assigned !== 'object' || !userId) return { assigned, statistiche };

    const cataloghi = Object.keys(assigned);
    const impressioni = await leggi({
        userId,
        profileId,
        catalogIds: cataloghi,
        giorni: undefined
    });
    if (!impressioni || impressioni.size === 0) return { assigned, statistiche };

    const vistiSet = new Set((visti instanceof Set ? [...visti] : (visti || [])).map((id) => String(id).replace(/^tmdb:/, '')));
    const risultato = {};
    let sommaGiorni = 0;

    for (const catalogo of cataloghi) {
        const riga = Array.isArray(assigned[catalogo]) ? assigned[catalogo] : [];
        const giorniPerTitolo = impressioni.get(catalogo);
        if (!giorniPerTitolo || giorniPerTitolo.size === 0) {
            risultato[catalogo] = riga;
            continue;
        }

        let toccati = 0;
        const nuova = riga.map((item) => {
            const id = tmdbDi(item);
            const giorni = giorniPerTitolo.get(id) || 0;
            if (giorni < giorniMinimi || vistiSet.has(id)) return item;
            const punteggio = Number(item?.punteggio);
            if (!Number.isFinite(punteggio)) return item;
            const effettivo = punteggio * Math.pow(fattore, giorni);
            toccati += 1;
            sommaGiorni += giorni;
            if (punteggio - effettivo >= DECADIMENTO_SOGLIA_PERCETTIBILE) statistiche.percepibile += 1;
            return { ...item, punteggio: effettivo, punteggio_grafo: punteggio, giorni_in_home: giorni };
        });

        if (toccati > 0) {
            statistiche.titoli += toccati;
            statistiche.cataloghi += 1;
            // Ordine per punteggio effettivo, stabile: i pari merito restano nell'ordine del grafo.
            nuova.sort((a, b) => (Number(b?.punteggio) || 0) - (Number(a?.punteggio) || 0));
        }
        risultato[catalogo] = nuova;
    }

    statistiche.giorniMedi = statistiche.titoli > 0 ? Number((sommaGiorni / statistiche.titoli).toFixed(2)) : 0;
    return { assigned: risultato, statistiche };
}

module.exports = {
    applicaDecadimento,
    DECADIMENTO_SOGLIA_PERCETTIBILE,
    // ri-esportati: un solo posto per le costanti del decadimento
    IMPRESSIONI_GIORNI_MINIMI,
    IMPRESSIONI_FATTORE_GIORNO
};
