/**
 * .scratch/ocean-prototipo/export-judge-pack.js   —  PROTOTIPO (strumento)
 *
 * Costruisce il pacchetto per il giudizio CIECO delle due dosi di fusione.
 * Le due liste di ogni coppia sono etichettate A/B con assegnazione casuale
 * (deterministica) e la chiave sta in un file separato che i giudici non vedono.
 *
 * Uso: node .scratch/ocean-prototipo/export-judge-pack.js <runA> <runB> <outDir>
 *      (runA = dose di produzione, runB = dose candidata)
 */
const fs = require('fs');
const path = require('path');
const duckdb = require('duckdb');
const { GENRE_ID_TO_NAME } = require('../../src/utils/tmdbNameResolver');

const [RUN_A, RUN_B, OUT_DIR] = process.argv.slice(2);
const PARQUET_DIR = path.join(__dirname, '../../.cache/tmdb').split(String.fromCharCode(92)).join('/');
const PROFILE_NAMES = {
    global: 'Generale (nessun catalogo configurato: profilo generico)',
    '4159713d': 'Generale (Tutto)',
    '1c1da0af': '🎌 Otaku Hardcore (Anime)',
    '0465f104': 'Solo Serie TV',
    '3f2f4afd': '🧛 Horror Night'
};
const CATALOG_PROMISE = {
    yaca_true_blend: '⭐ «Scelti per Te»: scelte personali, il meglio per questo profilo',
    yaca_hidden_gems: '💎 «Gemme Nascoste»: titoli di qualità poco conosciuti (bassa popolarità), ma pertinenti al profilo',
    yaca_seed_network: '🕸️ «La Rete dei tuoi Preferiti»: titoli legati a quelli già visti/piaciuti',
    yaca_trakt_filtered: '🌐 «Suggeriti dalla Community»: quanto va di moda presso chi ha gusti simili'
};

// Le 6 coppie scelte: le più cambiate fra le due dosi + una di controllo (quasi identica).
const PAIRS = [
    { profile: '4159713d', catalog: 'yaca_hidden_gems_series' },
    { profile: '4159713d', catalog: 'yaca_true_blend_movies' },
    { profile: '3f2f4afd', catalog: 'yaca_hidden_gems_movies' },
    { profile: '1c1da0af', catalog: 'yaca_hidden_gems_series' },
    { profile: '0465f104', catalog: 'yaca_true_blend_movies' },
    { profile: '3f2f4afd', catalog: 'yaca_true_blend_series' }   // CONTROLLO: liste quasi identiche
];

const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);
const all = (db, sql) => new Promise((res, rej) => db.all(sql, (e, r) => (e ? rej(e) : res(r))));

function readRun(dir, profile, catalog) {
    const rawDir = path.join(dir, 'raw', `sim_prof_ocean_${profile}`);
    if (!fs.existsSync(rawDir)) return null;
    const file = fs.readdirSync(rawDir).find(f => f.startsWith(catalog) && f.endsWith('.json') && !f.startsWith('_'));
    if (!file) return null;
    const data = JSON.parse(fs.readFileSync(path.join(rawDir, file), 'utf8'));
    const ids = [];
    for (const page of data.rawPages || []) for (const m of page?.data?.metas || []) ids.push(String(m.id).replace(/^tmdb:/, ''));
    return { ids: ids.filter(id => /^\d+$/.test(id)), file };
}

(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const db = new duckdb.Database(':memory:');
    const movieRows = await all(db, `SELECT id, title AS name, release_date, vote_average, vote_count, genres, original_language FROM read_parquet('${PARQUET_DIR}/movies.parquet')`);
    const tvRows = await all(db, `SELECT id, name, first_air_date AS release_date, vote_average, vote_count, genres, original_language FROM read_parquet('${PARQUET_DIR}/tv.parquet')`);
    const meta = new Map();
    for (const r of movieRows) meta.set(`movie:${Number(r.id)}`, r);
    for (const r of tvRows) meta.set(`tv:${Number(r.id)}`, r);

    const genreNames = parsed => (parse(parsed) || []).map(g => GENRE_ID_TO_NAME[String(g.id)] || g.name || g.id).join(', ');
    let seed = 77123;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

    const key = [];
    const sections = [];
    // Assegnazione A/B BILANCIATA (3 e 3) e mescolata: con 5 su 6 uguali un giudice
    // potrebbe dedurre quale sia la dose di produzione e sbilanciarsi per posizione.
    const assignment = [true, true, true, false, false, false];
    for (let i = assignment.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [assignment[i], assignment[j]] = [assignment[j], assignment[i]]; }
    PAIRS.forEach((pair, index) => {
        const a = readRun(RUN_A, pair.profile, pair.catalog);
        const b = readRun(RUN_B, pair.profile, pair.catalog);
        if (!a || !b) { console.warn(`coppia ${index + 1} incompleta, salto`); return; }
        const swap = assignment[index];                 // chi è "A"? bilanciato e registrato nella chiave
        const listA = swap ? b.ids : a.ids;
        const listB = swap ? a.ids : b.ids;
        key.push({ coppia: index + 1, profile: pair.profile, catalog: pair.catalog, A: swap ? RUN_B : RUN_A, B: swap ? RUN_A : RUN_B });

        const isMovie = !pair.catalog.includes('series');
        const promise = CATALOG_PROMISE[pair.catalog.replace(/_(movies|series)$/, '')] || '(promessa non definita)';
        const table = items => {
            const lines = ['| # | titolo | anno | voto | voti | generi | lingua |', '|---|---|---|---|---|---|---|'];
            items.forEach((id, i) => {
                const m = meta.get(`${isMovie ? 'movie' : 'tv'}:${id}`);
                if (!m) { lines.push(`| ${i + 1} | (id ${id}: metadati assenti) | | | | | |`); return; }
                lines.push(`| ${i + 1} | ${m.name} | ${String(m.release_date || '').slice(0, 4)} | ${Number(m.vote_average).toFixed(1)} | ${m.vote_count} | ${genreNames(m.genres)} | ${m.original_language} |`);
            });
            return lines.join('\n');
        };

        sections.push(`## Coppia ${index + 1} — profilo «${PROFILE_NAMES[pair.profile]}»\n\n`
            + `**Catalogo**: \`${pair.catalog}\` — ${promise}\n\n`
            + `**Contesto del profilo**: ${pair.profile === '3f2f4afd' ? 'utente appassionato di horror' : pair.profile === '1c1da0af' ? 'utente appassionato di anime' : pair.profile === '0465f104' ? 'utente che guarda quasi solo serie TV' : 'utente generalista'}, ${isMovie ? 'film' : 'serie TV'}.\n\n`
            + `**Lista A** (${listA.length} titoli)\n\n${table(listA)}\n\n`
            + `**Lista B** (${listB.length} titoli)\n\n${table(listB)}\n`);
    });

    fs.writeFileSync(path.join(OUT_DIR, 'chiave.json'), JSON.stringify(key, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, 'liste.md'), sections.join('\n---\n\n'));
    console.log(`pacchetto scritto in ${OUT_DIR}`);
    console.log(`coppie: ${key.length} · chiave in chiave.json (vietata ai giudici) · liste in liste.md`);
    console.log('assegnazione A/B:', key.map(k => `${k.coppia}:A=${path.basename(k.A)}`).join(' · '));
    db.close();
})();
