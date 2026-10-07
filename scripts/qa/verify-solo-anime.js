#!/usr/bin/env node
/**
 * scripts/qa/verify-solo-anime.js
 *
 * Verifica end-to-end dell'invariante del ticket 13: con un profilo `anime: 'only'`,
 * nessun catalogo hero deve servire un titolo non-anime.
 *
 * PERCHE' NON BASTA IL TEST UNITARIO: il difetto (collisione di id fra film e serie)
 * si manifesta **solo a store popolato**, cioè dopo la sync in background. Un processo
 * appena avviato classifica correttamente per caso, quindi la verifica deve forzare la
 * sync PRIMA di costruire. Questo script lo fa.
 *
 * E soprattutto: il giudizio sul contenuto NON usa lo store (sarebbe circolare), usa
 * l'euristica TMDB indipendente — genere 16 (Animazione) o lingua originale `ja`.
 * Un titolo che non ha né l'uno né l'altro è "sospetto" e viene elencato.
 *
 * Uso:
 *   node scripts/qa/verify-solo-anime.js [--profile sim_prof_qc_soloanime] [--context ...] [--catalog yaca_true_blend_movies] [--no-sync]
 *
 * Prerequisiti: profilo di test in Atlas (scripts/qa/simulate.js profiles) e parquet in .cache/tmdb/.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { connectMongo } = require('../../src/utils/mongoConnect');

const GENRE_ANIMATION = 16;

function parseArgs() {
    const args = process.argv.slice(2);
    const opts = {
        profile: 'sim_prof_qc_soloanime',
        addonUuid: 'sim-uuid-yaca',
        catalog: 'yaca_true_blend_movies',
        type: 'movie',
        sync: true
    };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--profile' && args[i + 1]) opts.profile = args[++i];
        else if (args[i] === '--addon-uuid' && args[i + 1]) opts.addonUuid = args[++i];
        else if (args[i] === '--catalog' && args[i + 1]) opts.catalog = args[++i];
        else if (args[i] === '--type' && args[i + 1]) opts.type = args[++i];
        else if (args[i] === '--no-sync') opts.sync = false;
    }
    return opts;
}

(async () => {
    const opts = parseArgs();

    // 1. STORE POPOLATO — è la condizione che fa emergere il bug.
    const store = require('../../src/data/animeMappingStore');
    await store.init();
    if (opts.sync) {
        await store.sync().catch(e => console.warn('[verify] sync fallita:', e.message));
    }
    const sizes = {
        movie: store.animeTmdbIdsMovie?.size ?? '(assente)',
        show: store.animeTmdbIdsShow?.size ?? '(assente)',
        unione: store.animeTmdbIds?.size ?? '(assente)'
    };
    console.log('[verify] store popolato · movie:', sizes.movie, '· show:', sizes.show, '· unione:', sizes.unione);
    if (typeof store.isAnimeTmdbId === 'function') {
        console.log("[verify] isAnimeTmdbId('38251','movie') =", store.isAnimeTmdbId('38251', 'movie'),
            "· isAnimeTmdbId('38251','tv') =", store.isAnimeTmdbId('38251', 'tv'));
    }

    // 2. BUILD REALE del catalogo hero per un profilo Solo Anime.
    await connectMongo(process.env.MONGODB_URI, { mongoose });
    const UserConfig = require('../../src/models/UserConfig');
    const { buildHybridCatalog } = require('../../src/engines/hybrid/catalogStrategies');

    const config = await UserConfig.resolveUserConfig(opts.addonUuid);
    if (!config) throw new Error(`config ${opts.addonUuid} non trovata`);
    const profile = (config.profiles || []).find(p => p.id === opts.profile);
    if (!profile) throw new Error(`profilo ${opts.profile} assente nel config`);

    const t0 = Date.now();
    const items = await buildHybridCatalog(
        config.userId, opts.profile, config.apiKeys?.trakt || null, process.env.TMDB_API_KEY,
        opts.type, false, null, { anime: 'only' }
    );
    console.log(`[verify] ${opts.catalog}: ${items.length} item in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    // 3. IDRATAZIONE: `buildHybridCatalog` restituisce voci di pool (id + matchScore), non schede.
    // Per giudicare il contenuto servito bisogna risolverle come fa il resolver: `getDuckDbMetaDetails`.
    const { getDuckDbMetaDetails } = require('../../src/catalog/providers/DuckDbProvider');
    const tmdbType = opts.type === 'movie' ? 'movie' : 'tv';

    const sospetti = [];
    let senzaScheda = 0;
    for (const entry of items) {
        const rawId = String(typeof entry === 'object' && entry !== null ? entry.id : entry);
        const idNum = Number(rawId.replace(/^tmdb:/, ''));
        if (!Number.isFinite(idNum)) { senzaScheda++; continue; }

        let meta = null;
        try { meta = await getDuckDbMetaDetails(idNum, tmdbType); } catch { meta = null; }
        if (!meta) { senzaScheda++; continue; }

        const genres = (meta.genre_ids || []).map(Number);
        const lang = String(meta.rawTMDB?.original_language || meta.original_language || '').toLowerCase();
        const okPerContenuto = genres.includes(GENRE_ANIMATION) || lang === 'ja';
        if (!okPerContenuto) {
            sospetti.push({
                titolo: meta.name || meta.title || idNum,
                generi: genres,
                lingua: lang,
                marker: meta._isAnime
            });
        }
    }

    console.log('');
    if (senzaScheda > 0) console.log(`[verify] nota: ${senzaScheda} voci di pool non risolte (fuori dal giudizio)`);
    // Una lista corta è un falso PASS: senza item non c'è niente da verificare.
    if (items.length < 5) {
        console.log(`[verify] ❌ FAIL — solo ${items.length} item: la verifica non è significativa (atteso un catalogo pieno)`);
        await mongoose.disconnect().catch(() => {});
        process.exit(1);
    }
    if (sospetti.length === 0) {
        console.log('[verify] ✅ PASS — nessun titolo senza genere 16 né lingua ja nei risultati');
    } else {
        console.log(`[verify] ❌ FAIL — ${sospetti.length}/${items.length} titoli non giustificati dal contenuto:`);
        for (const s of sospetti.slice(0, 15)) {
            console.log(`   · ${String(s.titolo).slice(0, 45).padEnd(47)} generi=${JSON.stringify(s.generi)} lingua=${s.lingua} marker=${s.marker}`);
        }
    }

    await mongoose.disconnect().catch(() => {});
    process.exit(sospetti.length === 0 ? 0 : 1);
})().catch(e => { console.error('[verify] errore:', e.message); process.exit(2); });
