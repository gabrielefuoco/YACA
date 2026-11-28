/**
 * scripts/backfill-runtime-ignoto.js
 *
 * Riallinea i film la cui durata è ignota.
 *
 * TMDB risponde `runtime: 0` quando non conosce la durata, e fino al 28/11/2026 il daemon scriveva
 * quello zero nel dump: 653 film indistinguibili da film da zero minuti. Il filtro in lettura ora
 * li esclude (`runtime BETWEEN 1 AND N`), ma nel file «non lo so» resta scritto 0 invece di NULL.
 *
 * Questo script rilegge quei film da TMDB e riscrive la riga completa: se nel frattempo la durata
 * è arrivata mette il valore vero, altrimenti `null`. Il daemon invece non li rileggerebbe mai —
 * scrive solo gli id nuovi e quelli che TMDB ha modificato, e un film fermo da mesi non si muove
 * solo perché è cambiato il nostro modo di mappare il campo.
 *
 * Uso (dentro il container del daemon, dove vivono dump e chiave):
 *   node scripts/backfill-runtime-ignoto.js --secco          prova a vuoto: legge TMDB, non scrive
 *   node scripts/backfill-runtime-ignoto.js                  riscrive le righe nel master JSONL
 *   node scripts/backfill-runtime-ignoto.js --limite 50      solo i primi 50 (ripetibile: riprende)
 *
 * La scrittura passa da `TmdbDumpStore.upsert` (spool + claim-by-rename), la stessa strada del
 * daemon: nessuna corsa con un giro in corso. La conversione Parquet → DuckDB la fa il daemon al
 * giro successivo, oppure `scripts/convert_to_parquet.js` + `indice.rebuildAndSwap()` a mano.
 *
 * Nessuna funzione qui solleva: ogni film che non si riesce a rileggere resta com'è e viene contato.
 */

require('dotenv').config();

const TmdbDumpClient = require('../services/tmdb-daemon/tmdbDumpClient');
const TmdbDumpStore = require('../services/tmdb-daemon/tmdbDumpStore');

const argomenti = process.argv.slice(2);
const SECCO = argomenti.includes('--secco') || argomenti.includes('--dry-run');
const LIMITE = (() => {
    const i = argomenti.findIndex(a => a === '--limite' || a === '--limit');
    const valore = i >= 0 ? Number(argomenti[i + 1]) : null;
    return Number.isFinite(valore) && valore > 0 ? valore : null;
})();

const CONCORRENZA = 4;
const DIMENSIONE_LOTTO = 100;

async function idsDaRileggere() {
    const indice = require('../src/indice');
    await indice.init();
    try {
        // `ORDER BY popularity DESC`: se si interrompe, ha già sistemato i titoli che la gente vede.
        const righe = await indice.queryRaw(
            'SELECT id, title FROM movies WHERE runtime = 0 ORDER BY popularity DESC'
        );
        return righe.map(r => ({ id: Number(r.id), titolo: r.title }));
    } finally {
        await indice.close?.().catch(() => {});
    }
}

async function rileggiCliente(elenco) {
    const chiave = process.env.TMDB_API_KEY;
    if (!chiave) throw new Error('TMDB_API_KEY assente: impossibile rileggere i dettagli');
    const client = new TmdbDumpClient(chiave);

    const esiti = { ok: 0, durataTrovata: 0, ancoraIgnota: 0, scartato: 0, errore: 0 };
    const righe = [];
    const errori = [];

    let prossimo = 0;
    async function lavoratore() {
        while (prossimo < elenco.length) {
            const indiceCorrente = prossimo++;
            const { id, titolo } = elenco[indiceCorrente];
            let esito;
            try {
                esito = await client.fetchMovieOutcome(id);
            } catch (err) {
                esiti.errore += 1;
                errori.push(`${id} (${titolo}): ${err.message}`);
                continue;
            }
            if (esito.status !== 'ok' || !esito.row) {
                // `filtered_vote_floor`, `adult_filtered`, `not_found`, `errore`: la riga non si tocca.
                if (esito.status === 'errore' || esito.status === 'not_found') {
                    esiti.errore += 1;
                    errori.push(`${id} (${titolo}): ${esito.status}`);
                } else {
                    esiti.scartato += 1;
                }
                continue;
            }
            esiti.ok += 1;
            if (Number(esito.row.runtime) > 0) esiti.durataTrovata += 1;
            else { esiti.ancoraIgnota += 1; esito.row.runtime = null; }
            righe.push(esito.row);
        }
    }

    await Promise.all(Array.from({ length: Math.min(CONCORRENZA, elenco.length || 1) }, lavoratore));
    return { esiti, righe, errori };
}

(async () => {
    const t0 = Date.now();
    console.log(`[Backfill runtime] avvio${SECCO ? ' — PROVA A VUOTO, nessuna scrittura' : ''}`);

    const elenco = await idsDaRileggere();
    const daFare = LIMITE ? elenco.slice(0, LIMITE) : elenco;
    console.log(`[Backfill runtime] film con durata ignota (runtime = 0): ${elenco.length} · da rileggere ora: ${daFare.length}`);
    if (daFare.length === 0) {
        console.log('[Backfill runtime] niente da fare.');
        return;
    }

    const { esiti, righe, errori } = await rileggiCliente(daFare);

    console.log(`[Backfill runtime] riletti: ${esiti.ok}/${daFare.length} · durata trovata: ${esiti.durataTrovata} · ancora ignota: ${esiti.ancoraIgnota} · scartati: ${esiti.scartato} · errori: ${esiti.errore}`);
    if (errori.length) {
        console.log('[Backfill runtime] primi errori:');
        for (const e of errori.slice(0, 5)) console.log(`  · ${e}`);
    }

    if (SECCO) {
        console.log('[Backfill runtime] prova a vuoto: nessuna riga scritta. Rilanciare senza --secco per applicare.');
        return;
    }
    if (righe.length === 0) {
        console.log('[Backfill runtime] nessuna riga da scrivere.');
        return;
    }

    const store = new TmdbDumpStore();
    for (let i = 0; i < righe.length; i += DIMENSIONE_LOTTO) {
        const lotto = righe.slice(i, i + DIMENSIONE_LOTTO);
        await store.upsert(lotto, 'movie');
        console.log(`[Backfill runtime] scritti ${Math.min(i + DIMENSIONE_LOTTO, righe.length)}/${righe.length}`);
    }

    console.log(`[Backfill runtime] fatto in ${((Date.now() - t0) / 1000).toFixed(1)}s. La conversione Parquet → DuckDB la fa il giro successivo del daemon.`);
})().catch(err => {
    console.error('[Backfill runtime] errore:', err.message);
    process.exit(1);
});
