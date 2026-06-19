require('dotenv').config();
const mongoose = require('mongoose');
const UserAccount = require('../src/db/models/UserAccount');
const TasteProfile = require('../src/models/TasteProfile');
const UserConfig = require('../src/models/UserConfig');
const { buildDnaDescription } = require('../src/ai/querySynthesizer');
const { resolveAiQueryToTmdbParams } = require('../src/engines/hybrid/scoringEngine');
const tmdb = require('../src/clients/tmdb');

async function analyze() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    
    const account = await UserAccount.findOne().lean();
    if (!account) {
        console.error("❌ No user accounts found!");
        await mongoose.disconnect();
        return;
    }
    console.log(`✅ User Account: ${account.userId}`);
    
    const userConfig = await UserConfig.resolveUserConfig(account.userId);
    if (!userConfig) {
        console.error("❌ resolveUserConfig returned null!");
        await mongoose.disconnect();
        return;
    }
    
    const profileObj = userConfig.profiles.find(p => p.name === 'test') || userConfig.profiles[0];
    console.log(`✅ Selected Profile: "${profileObj.name}" (ID: ${profileObj.id})`);
    
    const profile = await TasteProfile.findOne({ owner: account.userId, context: profileObj.id });
    if (!profile) {
        console.error("❌ TasteProfile not found in DB!");
        await mongoose.disconnect();
        return;
    }
    
    const context = profileObj.id;
    const dnaDesc = buildDnaDescription(profile, userConfig, context);
    console.log("\n=================== 🧬 INPUT: USER TASTE DNA SENT TO AI ===================");
    console.log(dnaDesc);
    
    const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
    const tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
    
    // We define the exact query bricks (i mattoncini) that the AI would generate for this DNA.
    // This allows us to trace and inspect the keyword translation and discover output manually.
    const trueBlendBricks = [
        {
            vibe: "Emotional Anime Drama",
            genre_ids: [16, 18], // Animation (16), Drama (18)
            keyword: "anime|drama"
        },
        {
            vibe: "Fantasy Anime Adventure",
            genre_ids: [16, 12, 14], // Animation (16), Adventure (12), Fantasy (14)
            keyword: "anime|fantasy"
        },
        {
            vibe: "Comedy Slice of Life Anime",
            genre_ids: [16, 35], // Animation (16), Comedy (35)
            keyword: "anime|slice of life"
        }
    ];
    
    const hiddenGemsBricks = [
        {
            vibe: "Niche Dark Fantasy Anime",
            genre_ids: [16, 14], // Animation (16), Fantasy (14)
            keyword: "anime,dark fantasy"
        },
        {
            vibe: "Niche Psychological Thriller Anime",
            genre_ids: [16, 9648], // Animation (16), Mystery (9648)
            keyword: "anime,psychological thriller"
        },
        {
            vibe: "Niche Cyberpunk Anime",
            genre_ids: [16, 878], // Animation (16), Sci-Fi (878)
            keyword: "anime,cyberpunk"
        }
    ];
    
    const scenarios = [
        { name: "🎯 True Blend - Film (AI)", mode: "trueBlend", bricks: trueBlendBricks, isMovie: true },
        { name: "🎯 True Blend - Serie (AI)", mode: "trueBlend", bricks: trueBlendBricks, isMovie: false },
        { name: "💎 Hidden Gems - Film (AI)", mode: "hiddenGems", bricks: hiddenGemsBricks, isMovie: true },
        { name: "💎 Hidden Gems - Serie (AI)", mode: "hiddenGems", bricks: hiddenGemsBricks, isMovie: false }
    ];
    
    for (const sc of scenarios) {
        console.log(`\n=================== 📁 CATALOGO: ${sc.name} ===================`);
        const types = sc.isMovie ? 'movie' : 'tv';
        const endpoint = `/discover/${types}`;
        
        // Quality filters applied for Hidden Gems
        const qualityFilters = sc.mode === 'hiddenGems' ? {
            'vote_count.gte': 100,
            'vote_count.lte': 3000,
            'vote_average.gte': 7.0,
            'popularity.lte': 80
        } : {};
        if (sc.mode === 'hiddenGems' && sc.isMovie) {
            qualityFilters['with_runtime.gte'] = 60;
        }
        
        for (let idx = 0; idx < sc.bricks.length; idx++) {
            const brick = sc.bricks[idx];
            console.log(`\n🧱 Brick #${idx + 1}: [Vibe: "${brick.vibe}"]`);
            console.log(`   - AI Genre IDs:`, brick.genre_ids);
            console.log(`   - AI Keywords: "${brick.keyword}"`);
            
            // 1. Resolve parameters: translate keyword string to TMDB numerical IDs
            const resolvedParams = await resolveAiQueryToTmdbParams(brick, tmdbApiKey, types);
            const finalParams = {
                ...resolvedParams,
                ...qualityFilters,
                sort_by: 'popularity.desc',
                page: 1
            };
            
            console.log(`   - Resolved TMDB Params:`, finalParams);
            
            // 2. Fetch TMDB results and output first 5 elements for comparison
            try {
                const res = await tmdbClient.get(endpoint, { params: finalParams });
                const items = res.data.results || [];
                console.log(`   - TMDB Output matches: (Total found: ${res.data.total_results || 0})`);
                
                if (items.length > 0) {
                    items.slice(0, 5).forEach((item, itemIdx) => {
                        const title = item.title || item.name || "Senza Titolo";
                        console.log(`     [${itemIdx + 1}] Title: "${title}"`);
                        console.log(`         TMDB ID: ${item.id} | Original Lang: "${item.original_language}"`);
                        console.log(`         Genres: ${item.genre_ids.join(', ')}`);
                        console.log(`         Popularity: ${item.popularity} | Vote Avg: ${item.vote_average} (${item.vote_count} votes)`);
                        console.log(`         Overview: ${item.overview ? item.overview.substring(0, 100) + '...' : 'Nessuna descrizione'}`);
                    });
                } else {
                    console.log("     ⚠️ Nessun risultato trovato per questo mattoncino con questi parametri!");
                }
            } catch (err) {
                console.error(`   ❌ Error querying TMDB:`, err.message);
            }
        }
    }
    
    console.log("\n=================== ANALYSIS COMPLETE ===================");
    await mongoose.disconnect();
}

analyze().catch(err => {
    console.error("Analysis failed:", err);
});
