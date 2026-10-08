/**
 * .scratch/ocean-prototipo/build-spec-reali.js   —  PROTOTIPO (strumento)
 *
 * Genera la spec per l'harness `scripts/qa/simulate.js` a partire dai profili
 * REALI: clona il DNA e la cronologia vera di ogni contesto sui profili di test
 * (`sim_*`), così gli hero serviti sono quelli che vederebbe quell'utente —
 * senza toccare la sua configurazione.
 *
 * Uso: node .scratch/ocean-prototipo/build-spec-reali.js <out.spec.json>
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
const { connectMongo } = require('../../src/utils/mongoConnect');

const REAL_USER = 'REOZrGNRr3';
const REAL_UUID = 'ff7084d8-904b-42d9-91f5-ea2b4ae37590';
const OUT = process.argv[2] || path.join(__dirname, 'runs', 'profili-reali.spec.json');

const HERO_CATALOGS = [
    'yaca_true_blend_movies', 'yaca_true_blend_series',
    'yaca_seed_network_movies', 'yaca_seed_network_series',
    'yaca_hidden_gems_movies', 'yaca_hidden_gems_series',
    'yaca_trakt_filtered_movies', 'yaca_trakt_filtered_series'
];

(async () => {
    await connectMongo(process.env.MONGODB_URI, { mongoose });
    const db = mongoose.connection.db;

    const profiles = await db.collection('tasteprofiles').find({ owner: REAL_USER }).project({ context: 1 }).toArray();
    const config = await db.collection('addonconfigs').findOne({ uuid: REAL_UUID });
    const byId = new Map((config?.profiles || []).map(p => [p.id, p]));
    const histories = await db.collection('watchhistories').find({ owner: REAL_USER }).toArray();
    const now = Date.now();

    const spec = {
        version: '1.0.0-ocean-prototipo',
        description: 'Profili reali clonati (DNA + cronologia vera) per misurare gli hero serviti: nitidezza della cima e ponte film-serie.',
        target: {
            userId: 'sim_user_yaca',
            email: 'sim@yaca.local',
            addonUuid: 'sim-uuid-yaca',
            configVersion: 'sim-1.0.0',
            defaultProfileId: `sim_prof_ocean_${profiles[0].context}`
        },
        heroCatalogs: HERO_CATALOGS,
        syntheticWatchlist: { items: [] },
        syntheticLists: [],
        profiles: profiles.map(p => {
            const real = byId.get(p.context) || {};
            const history = histories
                .filter(h => h.context === p.context)
                .map(h => ({
                    tmdbId: Number(h.tmdbId),
                    type: (h.type === 'tv' || h.type === 'series' || h.type === 'anime') ? 'tv' : 'movie',
                    episodesWatched: 1,
                    source: 'trakt',
                    daysAgo: Math.max(1, Math.round((now - new Date(h.lastWatchedAt || h.createdAt || now).getTime()) / 86400000))
                }));
            return {
                id: `sim_prof_ocean_${p.context}`,
                name: `${real.name || p.context} [clone]`,
                role: 'realistico',
                typeSelectors: real.settings?.typeSelectors || { film: false, serie: false, anime: null },
                kidsMode: Boolean(real.settings?.kidsMode),
                dna: { source: p.context, note: `Clone del context reale ${p.context}` },
                catalogs: HERO_CATALOGS,
                history
            };
        })
    };

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(spec, null, 2));
    console.log(`spec scritta: ${OUT}`);
    for (const p of spec.profiles) {
        console.log(`  ${p.id.padEnd(24)} ${p.name.padEnd(34)} cronologia: ${String(p.history.length).padStart(3)} · selettori: ${JSON.stringify(p.typeSelectors)} · kids: ${p.kidsMode}`);
    }
    await mongoose.disconnect();
})().catch(err => { console.error('ERRORE:', err.message); process.exit(1); });
