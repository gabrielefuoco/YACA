const dotenv = require('dotenv');
dotenv.config();

const { catalogHandler } = require('./src/handlers/catalogHandler');

async function testCatalog() {
    const args = {
        type: 'movie',
        id: 'yaca_signature_blend_movies', // Usa il tuo signature catalog
        extra: { skip: 0 }
    };
    
    // Simula UserConfig
    const userConfig = {
        userId: 'test_user',
        apiKeys: {
            tmdb: process.env.TMDB_API_KEY,
            imagekit: process.env.IMAGEKIT_ID // iyr3i5hd3
        },
        activeProfileId: 'global',
        config: {}
    };

    console.log("Config ImageKit ID:", process.env.IMAGEKIT_ID);

    try {
        const result = await catalogHandler(args, userConfig, 'http://localhost');
        console.log("Results found:", result.metas ? result.metas.length : 0);
        if (result.metas && result.metas.length > 0) {
            console.log("\nFirst Item ID:", result.metas[0].id);
            console.log("First Item Name:", result.metas[0].name);
            console.log("First Item Source Logo:", result.metas[0].logo);
            console.log("First Item Poster (ImageKit):", result.metas[0].poster);
            console.log("First Item Background:", result.metas[0].background);
        }
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

testCatalog();
