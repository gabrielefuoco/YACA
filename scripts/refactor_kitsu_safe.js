const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/clients/kitsu.js');
let text = fs.readFileSync(filePath, 'utf8');

// 1. Imports
text = text.replace(
    "const { createAxiosInstance } = require('../utils/httpClient');",
    "const { createAxiosClient } = require('../utils/axiosClient');"
);
text = text.replace(
    "const kitsuClient = createAxiosInstance(KITSU_ENDPOINT || 'https://kitsu.io/api/edge');",
    "const kitsuClient = createAxiosClient(KITSU_ENDPOINT || 'https://kitsu.io/api/edge', {}, 2);"
);

// 2. enrichWithTmdb
const enrichOld = `        const cacheKey = \`\${mapping.type}:\${mapping.tmdbId}\`;
        const { value: cached, status } = await kitsuTmdbBasicCache.getWithStatus(cacheKey);

        let tmdbData = cached;
        if (status === 'miss') {
            const tmdbKey = process.env.TMDB_API_KEY;
            if (!tmdbKey) return;
            const tmdbClient = createTmdbClient(tmdbKey);
            const endpoint = mapping.type === 'movie' ? \`/movie/\${mapping.tmdbId}\` : \`/tv/\${mapping.tmdbId}\`;
            try {
                const tmdbRes = await tmdbClient.get(endpoint, {
                    params: {
                        language: 'it-IT',
                        append_to_response: 'images',
                        include_image_language: 'it,en,null'
                    }
                });
                tmdbData = tmdbRes.data;
                if (tmdbData) {
                    await kitsuTmdbBasicCache.set(cacheKey, tmdbData);
                }
            } catch (e) {
                // Ignore silent failure
            }
        }`;

const enrichNew = `        const cacheKey = \`\${mapping.type}:\${mapping.tmdbId}\`;
        const tmdbData = await kitsuTmdbBasicCache.getOrFetch(cacheKey, async () => {
            const tmdbKey = process.env.TMDB_API_KEY;
            if (!tmdbKey) return null;
            const tmdbClient = createTmdbClient(tmdbKey);
            const endpoint = mapping.type === 'movie' ? \`/movie/\${mapping.tmdbId}\` : \`/tv/\${mapping.tmdbId}\`;
            try {
                const tmdbRes = await tmdbClient.get(endpoint, {
                    params: {
                        language: 'it-IT',
                        append_to_response: 'images',
                        include_image_language: 'it,en,null'
                    }
                });
                return tmdbRes.data;
            } catch (e) {
                return null;
            }
        });`;
text = text.replace(enrichOld, enrichNew);

fs.writeFileSync(filePath, text);
console.log("kitsu.js successfully updated (enrichWithTmdb)!");
