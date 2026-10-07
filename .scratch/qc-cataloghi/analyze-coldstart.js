const fs = require('fs');
const path = require('path');

function median(values) {
    const nums = values.filter(v => typeof v === 'number' && !isNaN(v)).sort((a, b) => a - b);
    if (nums.length === 0) return null;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function jaccard(setA, setB) {
    const sA = new Set(setA);
    const sB = new Set(setB);
    const intersection = new Set([...sA].filter(x => sB.has(x)));
    const union = new Set([...sA, ...sB]);
    if (union.size === 0) return 0;
    return intersection.size / union.size;
}

function parseYear(anno) {
    if (!anno) return null;
    const m = String(anno).match(/\b(19\d\d|20\d\d)\b/);
    return m ? Number(m[1]) : null;
}

async function main() {
    const runDir = path.resolve(process.argv[2] || '.scratch/qc-cataloghi/runs/hero-coldstart-run');
    const enrichedDir = path.resolve(process.argv[3] || path.join(runDir, 'hero-enriched'));
    const fallbackDir = path.resolve('.scratch/qc-cataloghi/runs/fallback-reference/top50');

    // Load fallback references
    const popMovies = JSON.parse(fs.readFileSync(path.join(fallbackDir, 'preset_pop_movies.json'), 'utf8'));
    const popSeries = JSON.parse(fs.readFileSync(path.join(fallbackDir, 'preset_pop_series.json'), 'utf8'));
    const topRatedMovies = JSON.parse(fs.readFileSync(path.join(fallbackDir, 'preset_top_rated_movies.json'), 'utf8'));
    const topRatedSeries = JSON.parse(fs.readFileSync(path.join(fallbackDir, 'preset_top_rated_series.json'), 'utf8'));

    const ref40 = {
        movie_pop: popMovies.items.slice(0, 40).map(i => Number(i.tmdbId)),
        series_pop: popSeries.items.slice(0, 40).map(i => Number(i.tmdbId)),
        movie_top_rated: topRatedMovies.items.slice(0, 40).map(i => Number(i.tmdbId)),
        series_top_rated: topRatedSeries.items.slice(0, 40).map(i => Number(i.tmdbId))
    };

    const profiles = [
        'sim_prof_gen_0', 'sim_prof_gen_50', 'sim_prof_gen_100',
        'sim_prof_otaku_0', 'sim_prof_otaku_50', 'sim_prof_otaku_100'
    ];

    const heroes = [
        'yaca_true_blend_movies',
        'yaca_true_blend_series',
        'yaca_seed_network_movies',
        'yaca_seed_network_series',
        'yaca_hidden_gems_movies',
        'yaca_hidden_gems_series',
        'yaca_trakt_filtered_movies',
        'yaca_trakt_filtered_series'
    ];

    const results = [];
    const disjointnessReport = {};

    for (const p of profiles) {
        const profDir = path.join(enrichedDir, p);
        if (!fs.existsSync(profDir)) {
            console.warn(`Profile dir missing: ${profDir}`);
            continue;
        }

        const movieHeroes = {};
        const seriesHeroes = {};

        for (const h of heroes) {
            const hFile = path.join(profDir, `${h}.json`);
            if (!fs.existsSync(hFile)) continue;
            const data = JSON.parse(fs.readFileSync(hFile, 'utf8'));
            const items = data.items || [];
            const isMovie = h.endsWith('_movies');
            const mediaType = isMovie ? 'movie' : 'series';

            // Top 40 ids for jaccard
            const ids40 = items.slice(0, 40).map(i => Number(i.tmdbId)).filter(Boolean);
            if (isMovie) movieHeroes[h] = ids40;
            else seriesHeroes[h] = ids40;

            const refPop = isMovie ? ref40.movie_pop : ref40.series_pop;
            const refTopRated = isMovie ? ref40.movie_top_rated : ref40.series_top_rated;

            const jaccardPop = jaccard(ids40, refPop);
            const commonPop = ids40.filter(id => refPop.includes(id)).length;
            const jaccardTopRated = jaccard(ids40, refTopRated);
            const commonTopRated = ids40.filter(id => refTopRated.includes(id)).length;

            const animeCount = items.filter(i => i.isAnime).length;
            const itaCount = items.filter(i => i.itaBadge).length;
            const ratings = items.map(i => i.rating).filter(v => v !== null);
            const years = items.map(i => parseYear(i.anno)).filter(v => v !== null);
            const pops = items.map(i => i.popolarita).filter(v => v !== null);

            results.push({
                profile: p,
                hero: h,
                mediaType,
                itemCount: items.length,
                animePercent: items.length > 0 ? (animeCount / items.length) * 100 : 0,
                itaPercent: items.length > 0 ? (itaCount / items.length) * 100 : 0,
                medianRating: median(ratings),
                medianYear: median(years),
                medianPop: median(pops),
                jaccardPop: Number(jaccardPop.toFixed(4)),
                commonPop,
                jaccardTopRated: Number(jaccardTopRated.toFixed(4)),
                commonTopRated
            });
        }

        // Check disjointness among the 4 movie heroes and 4 series heroes
        function checkOverlap(heroMap, type) {
            const keys = Object.keys(heroMap);
            const overlaps = [];
            for (let i = 0; i < keys.length; i++) {
                for (let j = i + 1; j < keys.length; j++) {
                    const h1 = keys[i];
                    const h2 = keys[j];
                    const shared = heroMap[h1].filter(id => heroMap[h2].includes(id));
                    overlaps.push({
                        pair: `${h1} vs ${h2}`,
                        sharedCount: shared.length,
                        sharedIds: shared
                    });
                }
            }
            return overlaps;
        }

        disjointnessReport[p] = {
            movie: checkOverlap(movieHeroes, 'movie'),
            series: checkOverlap(seriesHeroes, 'series')
        };
    }

    const outPath = path.join(runDir, 'coldstart-analysis.json');
    fs.writeFileSync(outPath, JSON.stringify({ results, disjointnessReport }, null, 2), 'utf8');
    console.log(`Analisi salvata in: ${outPath}`);
    console.log(`Numero misure: ${results.length}`);
}

main().catch(err => {
    console.error('Errore analisi:', err);
    process.exit(1);
});
