/**
 * Il merge della colonna `ita` nel parquet (ticket 06 della mappa doppiaggio-ita).
 *
 * Verifica **sulla query vera** (DuckDB, non su una sua imitazione) che:
 *  - `true` resti `true`, `null` resti `null` (il terzo stato non si appiattisce) e la riga assente
 *    valga `false`;
 *  - la chiave sia `(tipo, id)`: un'annotazione `tv` non contamina il parquet dei film;
 *  - senza annotazioni la colonna sia `false` su tutto (degrado deciso, non un errore).
 *
 * Il caso `COALESCE(ann.ita, false)` — che distruggerebbe il `null` — è la ragione per cui questo test
 * esiste: con quel `COALESCE` il filtro "solo ITA" mostrerebbe tutto il catalogo come doppiato.
 */

const duckdb = require('duckdb');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildConversionSelect } = require('../scripts/convert_to_parquet');

function all(con, sql) {
    return new Promise((resolve, reject) => con.all(sql, (err, rows) => (err ? reject(err) : resolve(rows))));
}

describe('merge della colonna `ita` nel parquet', () => {
    let dir;
    let jsonlFile;
    let annotationsFile;

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doppiaggi-merge-'));
        jsonlFile = path.join(dir, 'master_movies.jsonl');
        annotationsFile = path.join(dir, 'ita_annotations.jsonl');

        fs.writeFileSync(jsonlFile, [
            JSON.stringify({ id: 1, title: 'Doppiato', popularity: 5, vote_count: 100 }),
            JSON.stringify({ id: 2, title: 'Indeciso', popularity: 4, vote_count: 90 }),
            JSON.stringify({ id: 3, title: 'Non doppiato', popularity: 3, vote_count: 80 })
        ].join('\n') + '\n', 'utf8');

        fs.writeFileSync(annotationsFile, [
            JSON.stringify({ t: 'movie', id: 1, ita: true }),
            JSON.stringify({ t: 'movie', id: 2, ita: null }),
            JSON.stringify({ t: 'tv', id: 3, ita: true }) // serie omonima: non deve valere per i film
        ].join('\n') + '\n', 'utf8');
    });

    async function mergeAndRead(options) {
        const db = new duckdb.Database(':memory:');
        const con = db.connect();
        try {
            const rows = await all(con, buildConversionSelect(jsonlFile, false, options));
            return Object.fromEntries(rows.map((r) => [Number(r.id), r.ita]));
        } finally {
            db.close();
        }
    }

    test('tre stati: true, null, e riga assente = false', async () => {
        const byId = await mergeAndRead({ annotationsPath: annotationsFile, mediaType: 'movie' });

        expect(byId[1]).toBe(true);
        expect(byId[2]).toBe(null); // il terzo stato sopravvive al merge
        expect(byId[3]).toBe(false); // riga assente: nessuna traccia di doppiaggio
    });

    test('la chiave è (tipo, id): l\'annotazione tv non contamina i film', async () => {
        const byId = await mergeAndRead({ annotationsPath: annotationsFile, mediaType: 'tv' });

        // Per il parquet delle serie solo l'annotazione `tv` conta.
        expect(byId[3]).toBe(true);
        expect(byId[1]).toBe(false);
    });

    test('senza annotazioni la colonna è false su tutto', async () => {
        const byId = await mergeAndRead({ annotationsPath: null, mediaType: 'movie' });

        expect(byId[1]).toBe(false);
        expect(byId[2]).toBe(false);
        expect(byId[3]).toBe(false);
    });

    test('senza il mediaType (chiamata incompleta) la colonna è false, non un errore', async () => {
        const byId = await mergeAndRead({ annotationsPath: annotationsFile, mediaType: null });
        expect(byId[1]).toBe(false);
    });

    test('il resto del record resta intatto (la colonna si aggiunge, non sostituisce)', async () => {
        const db = new duckdb.Database(':memory:');
        const con = db.connect();
        try {
            const rows = await all(con, buildConversionSelect(jsonlFile, false, { annotationsPath: annotationsFile, mediaType: 'movie' }));
            const first = rows.find((r) => Number(r.id) === 1);
            expect(first.title).toBe('Doppiato');
            expect(Number(first.vote_count)).toBe(100);
        } finally {
            db.close();
        }
    });
});
