#!/usr/bin/env node
/**
 * scripts/qa/hero-enrich.js
 *
 * Arricchisce le risposte hero scaricate da `simulate.js fetch` con le colonne
 * che il payload Stremio non porta (voti, popolarità, durata) lette dai Parquet
 * di produzione via DuckDB, e le rende un file leggibile per il giudizio manuale.
 *
 * Perche': un hero come "Gemme Nascoste" promette titoli di qualita con
 * popolarita' bassa; il payload non contiene la popolarita', quindi senza questo
 * passaggio la promessa non e' verificabile dal giudice.
 *
 * Riferimenti: .scratch/qc-cataloghi/issues/01-campagna-qc-cataloghi.md (D4)
 *
 * Uso:
 *   node scripts/qa/hero-enrich.js --run <runDir> [--out <dir>] [--only <profileId>] [--limit 50]
 */

const fs = require('fs');
const path = require('path');

const store = require('../../src/db/duckDbStore');

const GENRE_IT = {
    28: 'Azione', 12: 'Avventura', 16: 'Animazione', 35: 'Commedia', 80: 'Crimine', 99: 'Documentario',
    18: 'Dramma', 10751: 'Famiglia', 14: 'Fantasy', 36: 'Storia', 27: 'Horror', 10402: 'Musica',
    9648: 'Mistero', 10749: 'Romantico', 878: 'Fantascienza', 10770: 'Film TV', 53: 'Thriller',
    10752: 'Guerra', 37: 'Western', 10759: 'Azione&Avventura', 10762: 'Kids', 10763: 'News',
    10764: 'Reality', 10765: 'Sci-Fi&Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'Guerra&Politica'
};

const HERO_PROMISE = {
    true_blend: 'Blend personalizzato DNA+qualita\', diversificato (max 3 per genere, 1 per saga)',
    seed_network: 'Rete dei preferiti: titoli collegati ai seed del profilo (attivita\' recente, libreria)',
    hidden_gems: 'Gemme: voto alto, POPOLARITA\' BASSA (<=20), 50-1000 voti (gate del builder: F.minVotes(50), il fallback usa 100), durata >=60\' per i film',
    trakt_filtered: 'Suggeriti dalla Community (Trakt). Senza token Trakt il percorso degrada sul fallback recente/popolare'
};

function parseArgs() {
    const args = process.argv.slice(2);
    const opts = { run: null, out: null, only: null, limit: 50 };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--run' && args[i + 1]) opts.run = args[++i];
        else if (args[i] === '--out' && args[i + 1]) opts.out = args[++i];
        else if (args[i] === '--only' && args[i + 1]) opts.only = args[++i];
        else if (args[i] === '--limit' && args[i + 1]) opts.limit = Number(args[++i]) || 50;
    }
    return opts;
}

function heroKind(catalogId) {
    const m = catalogId.match(/^yaca_(true_blend|seed_network|hidden_gems|trakt_filtered)_/);
    return m ? m[1] : null;
}

const num = v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

async function main() {
    const opts = parseArgs();
    if (!opts.run) {
        console.error('Uso: node scripts/qa/hero-enrich.js --run <runDir> [--out <dir>] [--only <profileId>]');
        process.exit(1);
    }
    const runDir = path.resolve(opts.run);
    const rawDir = path.join(runDir, 'raw');
    if (!fs.existsSync(rawDir)) {
        console.error(`Nessuna cartella raw/ in ${runDir}`);
        process.exit(1);
    }
    const outDir = path.resolve(opts.out || path.join(runDir, 'hero-enriched'));

    await store.init();

    const profiles = fs.readdirSync(rawDir).filter(d => fs.statSync(path.join(rawDir, d)).isDirectory());
    const summary = [];

    for (const profileId of profiles) {
        if (opts.only && opts.only !== profileId) continue;
        const files = fs.readdirSync(path.join(rawDir, profileId)).filter(f => f.endsWith('.json') && !f.startsWith('_'));
        const entries = [];

        for (const file of files) {
            const payload = JSON.parse(fs.readFileSync(path.join(rawDir, profileId, file), 'utf8'));
            const catalogId = payload.catalog?.id || file.replace(/\.json$/, '');
            const mediaType = payload.catalog?.type || (file.includes('-series') ? 'series' : 'movie');
            const rows = [];
            for (const page of payload.rawPages || []) {
                for (const meta of page.data?.metas || []) rows.push(meta);
            }
            const items = rows.slice(0, opts.limit).map((meta, i) => ({
                pos: i + 1,
                tmdbId: num(String(meta.id || '').replace(/^tmdb:/, '')),
                titolo: meta.name || null,
                anno: meta.releaseInfo || null,
                tipo: meta.type || mediaType,
                rating: meta.imdbRating !== undefined ? num(meta.imdbRating) : null,
                generi: (meta.genre_ids || []).map(g => GENRE_IT[Number(g)] || String(g)),
                lingua: meta.original_language || null,
                isAnime: meta._isAnime === true,
                itaBadge: Boolean(meta._itaBadge),
                match: num(meta._yacaMatch),
                voti: null,
                popolarita: null,
                durata: null,
                descrizione: (meta.description || '').slice(0, 180) || null
            }));

            // Arricchimento dai Parquet: voti, popolarita', durata
            const ids = items.map(i => i.tmdbId).filter(v => v !== null);
            if (ids.length) {
                const table = mediaType === 'movie' ? 'movies' : 'tv';
                const runtimeCol = mediaType === 'movie' ? '"runtime"' : 'NULL';
                const sql = `SELECT id, vote_count, popularity, vote_average, ${runtimeCol} AS runtime FROM ${table} WHERE id IN (${ids.join(',')})`;
                const res = await store.query(sql);
                const byId = new Map(res.map(r => [num(r.id), r]));
                for (const it of items) {
                    const r = byId.get(it.tmdbId);
                    if (!r) continue;
                    it.voti = num(r.vote_count);
                    it.popolarita = num(r.popularity);
                    it.durata = num(r.runtime);
                    if (it.rating === null && r.vote_average !== null) it.rating = Number(r.vote_average);
                }
            }

            const kind = heroKind(catalogId);
            const content = {
                profileId,
                catalogId,
                mediaType,
                kind,
                promessa: kind ? HERO_PROMISE[kind] : null,
                itemsCount: items.length,
                fetchedAt: payload.fetchedAt || null,
                mode: payload.mode || null,
                items
            };
            entries.push(content);

            const dir = path.join(outDir, profileId);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, `${catalogId}.json`), JSON.stringify(content, null, 1), 'utf8');

            const md = [];
            md.push(`### ${catalogId}  ·  ${mediaType}  ·  ${kind || '?'}`);
            md.push('');
            md.push(`- **Promessa dell'hero**: ${content.promessa || 'n/d'}`);
            md.push(`- **Item**: ${items.length} (top ${opts.limit})  ·  **mode**: ${content.mode || 'n/d'}  ·  **fetched**: ${content.fetchedAt || 'n/d'}`);
            const an = items.filter(i => i.isAnime).length;
            const ita = items.filter(i => i.itaBadge).length;
            md.push(`- **Anime**: ${an}/${items.length}  ·  **badge ITA**: ${ita}/${items.length}`);
            md.push('');
            md.push('| # | Titolo (anno) | Rating | Voti | Pop | Durata | Generi | Lingua | Anime | ITA | match |');
            md.push('|---|---|---|---|---|---|---|---|---|---|---|');
            for (const it of items) {
                md.push(`| ${it.pos} | ${String(it.titolo || '').replace(/\|/g, '\\|')}${it.anno ? ` (${it.anno})` : ''} | ${it.rating ?? ''} | ${it.voti ?? ''} | ${it.popolarita !== null ? it.popolarita.toFixed(1) : ''} | ${it.durata ?? ''} | ${it.generi.join(', ')} | ${it.lingua || ''} | ${it.isAnime ? 'X' : ''} | ${it.itaBadge ? 'X' : ''} | ${it.match ?? ''} |`);
            }
            md.push('');
            fs.writeFileSync(path.join(dir, `${catalogId}.md`), md.join('\n'), 'utf8');
        }

        const byKind = {};
        for (const e of entries) byKind[e.kind || '?'] = e.itemsCount;
        summary.push({ profileId, catalogs: entries.length, byKind });
    }

    fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), run: runDir, summary }, null, 2), 'utf8');
    console.log('[hero-enrich] profili:', summary.map(s => `${s.profileId}(${s.catalogs})`).join(', '));
    console.log('[hero-enrich] out:', outDir);
    process.exit(0);
}

main().catch(e => { console.error('[hero-enrich] errore fatale:', e); process.exit(1); });
