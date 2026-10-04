/**
 * .scratch/t12/2-census.js — gira IN LOCALE (non tocca la produzione).
 *
 *   node .scratch/t12/2-census.js
 *
 * Incrocia tre fonti, tutte di sola lettura:
 *   - `state.json`          → l'uscita di `1-dump-state.js` (Mongo + parquet + annotazioni);
 *   - `fribb-mini.json`     → la copia di `docker exec yaca-anime-source cat /app/.cache/fribb-mini.json`
 *                             (dichiara `themoviedb_id.tv` / `themoviedb_id.movie`);
 *   - `anibridge-mappings.json` → idem (dichiara i nodi `tmdb_show:` / `tmdb_movie:`).
 *   - `tvdb-tmdb-cache.json`    → la cache del bridge TVDB, che conserva `mediaType` e non lo usa mai.
 *
 * Produce i numeri del report `misura-tipo-ita.md` e scrive `dir1.json` / `films_ok.json`
 * (le liste di id che il terzo script verifica sui poster di produzione).
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const state = JSON.parse(fs.readFileSync(path.join(DIR, 'state.json'), 'utf8'));
const annSet = new Set(state.annotations.filter(a => a.ita === true).map(a => `${a.t}:${a.id}`));

const docs = state.docs.map(d => ({ ...d, annTv: annSet.has(`tv:${d.id}`), annMv: annSet.has(`movie:${d.id}`) }));

/** Il tipo dichiarato dalla fonte, per tmdb id. `null` = nessuna fonte lo sa. */
const declared = new Map();
const put = (id, source, kind) => { if (!known(id)) declared.set(id, { source, kind }); };
function known(id) { return declared.has(id) && !Number.isNaN(id); }

let fribbCounts = { tv: 0, movie: 0, scalar: 0, none: 0 };
for (const it of JSON.parse(fs.readFileSync(path.join(DIR, 'fribb-mini.json'), 'utf8'))) {
    const v = it.themoviedb_id;
    if (!v) { fribbCounts.none++; continue; }
    if (typeof v === 'object') {
        if (v.tv) { put(Number(v.tv), 'fribb', 'tv'); fribbCounts.tv++; }
        else if (v.movie) { put(Number(v.movie), 'fribb', 'movie'); fribbCounts.movie++; }
        else fribbCounts.scalar++;
    } else fribbCounts.scalar++;
}

let anibridgeCounts = { tv: 0, movie: 0 };
for (const [cluster, mappings] of Object.entries(JSON.parse(fs.readFileSync(path.join(DIR, 'anibridge-mappings.json'), 'utf8')))) {
    if (cluster === '$meta' || !mappings || typeof mappings !== 'object') continue;
    for (const key of Object.keys(mappings)) {
        const m = /^tmdb_(show|movie):(\d+)/.exec(key);
        if (!m) continue;
        anibridgeCounts[m[1] === 'show' ? 'tv' : 'movie']++;
        put(Number(m[2]), 'anibridge', m[1] === 'show' ? 'tv' : 'movie');
    }
}

let bridgeCounts = { tv: 0, movie: 0 };
for (const v of Object.values(JSON.parse(fs.readFileSync(path.join(DIR, 'tvdb-tmdb-cache.json'), 'utf8')))) {
    if (!v) continue;
    bridgeCounts[v.mediaType] = (bridgeCounts[v.mediaType] || 0) + 1;
    if (v.tmdbId) put(Number(v.tmdbId), 'bridge_tvdb', v.mediaType);
}

/** Il film in `movies.parquet` è davvero il titolo del documento? (romaji del doc vs italiano/giapponese del dump) */
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
function sameDoc(d, row) {
    const cand = [d.title, d.titles && d.titles.romaji, d.titles && d.titles.english, ...(d.srcTitles || [])].filter(Boolean).map(norm);
    const other = [row.title, row.orig].filter(Boolean).map(norm);
    return cand.some(c => c.length >= 4 && other.some(o => o.length >= 4 && (c === o || c.includes(o) || o.includes(c))));
}

/**
 * Il match automatico NON serve qui: il titolo del documento è romaji ("Kaze no Tani no Nausicaä")
 * e la riga del dump è italiana e giapponese ("Nausicaä della Valle del vento" / "風の谷のナウシカ"),
 * quindi il confronto di stringhe non può decidere. La lista sotto è il **verdetto manuale**:
 * per ogni id, `titolo del documento` ↔ `title / original_title` di movies.parquet, letti uno a uno.
 * Id esclusi: `44725` (Ie Naki Ko → la riga 44725 è "One Piece - Il tesoro del re") e
 * `114478` (Star Wars: Visions → la riga 114478 è "Starship Troopers - L'invasione"): qui
 * è l'id a monte a essere sbagliato, non il tipo.
 */
const VERIFICATI_FILM = new Set([
    1430394, 135531, 507477, 4935, 58704, 8392, 823, 16859, 129, 950863, 14069, 43967,
    1163907, 10515, 482810, 512443, 64809, 60843, 81, 79082, 21036, 10494, 128, 8953,
    507569, 13398, 266116, 44587, 153577
]);
const ID_SBAGLIATO = new Set([44725, 114478]);
const isMovie = (d) => VERIFICATI_FILM.has(d.id);
const mismatched = (d) => ID_SBAGLIATO.has(d.id);

const R = docs.map(d => ({ ...d, src: declared.get(d.id) || null }));
const dubbed = R.filter(d => d.dubbed);
const films = R.filter(d => d.src && d.src.kind === 'movie');
const sers = R.filter(d => d.src && d.src.kind === 'tv');

const line = (s, n) => console.log(String(s).padEnd(58) + n);

line('documenti in anime_airing_state', R.length);
line('  doppiati (producono annotazione)', dubbed.length);
line('righe ita_annotations.jsonl', state.annotations.length);
line('  tv: / movie: (ita=true)', `${state.annotations.filter(a => a.ita === true && a.t === 'tv').length} / ${state.annotations.filter(a => a.ita === true && a.t === 'movie').length}`);
line('parquet tv / movies', `${state.parquet.tv} / ${state.parquet.movies}`);
console.log('');
line('fribb: themoviedb_id {tv} / {movie} / altro', `${fribbCounts.tv} / ${fribbCounts.movie} / ${fribbCounts.scalar + fribbCounts.none}`);
line('anibridge: nodi tmdb_show: / tmdb_movie:', `${anibridgeCounts.tv} / ${anibridgeCounts.movie}`);
line('bridge TVDB: cache con mediaType (tv/movie)', `${bridgeCounts.tv || 0} / ${bridgeCounts.movie || 0}  <- mai letta`);
console.log('');
line('doppiati: la fonte dichiara FILM', films.filter(d => d.dubbed).length);
line('doppiati: la fonte dichiara SERIE', sers.filter(d => d.dubbed).length);
line('doppiati: nessuna fonte dichiara il tipo', dubbed.filter(d => !d.src).length);
console.log('');

const agrees = (d) => d.src && ((d.src.kind === 'movie' && d.annMv) || (d.src.kind === 'tv' && d.annTv));
const dir1 = films.filter(d => d.annTv && !d.annMv);
const dir2 = sers.filter(d => d.annMv && !d.annTv);
line('concordi (writer = fonte)', dubbed.filter(agrees).length);
line('DISACCORDI', dubbed.filter(d => d.src && !agrees(d)).length);
line('  DIR 1: film dichiarati, annotati `tv` (badge perso)', dir1.length);
line('  DIR 2: serie dichiarate, annotate `movie` (badge a caso)', dir2.length);
line('    di cui con la riga film in movies.parquet', dir1.filter(d => d.inMv).length);
line('    di cui film VERIFICATO (titolo del doc = film del dump)', dir1.filter(isMovie).length);
line('    di cui id sbagliato a monte (la card film e un altro titolo)', dir1.filter(mismatched).length);
line('    di cui nessuna card (film assente dal parquet)', dir1.filter(d => !d.inMv).length);

console.log('\n-- DIR 1, film annotati `tv` --');
for (const d of dir1) {
    console.log(`  ${String(d.id).padStart(7)} | ${d.title} | film: ${d.mv ? `${d.mv.title} [${d.mv.orig}] ${String(d.mv.date).slice(0, 4)}` : 'ASSENTE'} | serie omonima: ${d.tv ? `${d.tv.title} [${d.tv.eps}ep]` : 'ASSENTE'} | ep ${d.maxEp}`);
}
console.log('\n-- DIR 2, serie annotate `movie` --');
for (const d of dir2) {
    console.log(`  ${String(d.id).padStart(7)} | ${d.title} | film: ${d.mv ? `${d.mv.title} [${d.mv.orig}]` : 'ASSENTE'} | serie: ${d.tv ? d.tv.title : 'ASSENTE'} | ep ${d.maxEp}`);
}

fs.writeFileSync(path.join(DIR, 'dir1.json'), JSON.stringify(dir1.map(d => d.id)));
fs.writeFileSync(path.join(DIR, 'films_ok.json'), JSON.stringify(films.filter(d => d.annMv).map(d => d.id)));
console.log('\nscritte dir1.json e films_ok.json (id per il controllo dei poster)');
