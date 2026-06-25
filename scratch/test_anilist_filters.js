require('dotenv').config();
const { executeAnilistQuery } = require('../src/clients/anilist');

async function testFilter(keywordString) {
    const query = `
        query ($page: Int, $perPage: Int, $tag_in: [String], $genre_in: [String]) {
            Page(page: $page, perPage: $perPage) {
                media(type: ANIME, tag_in: $tag_in, genre_in: $genre_in) {
                    id
                    title { romaji }
                }
            }
        }
    `;

    const keywords = keywordString.split(/[|,]/).map(c => c.trim()).filter(Boolean);
    const ANILIST_GENRES = new Set([
        'action', 'adventure', 'comedy', 'drama', 'ecchi', 'fantasy', 'horror', 
        'mahou shoujo', 'mecha', 'music', 'mystery', 'psychological', 'romance', 
        'sci-fi', 'slice of life', 'sports', 'supernatural', 'thriller'
    ]);

    const genres = [];
    const tags = [];
    for (const kw of keywords) {
        if (ANILIST_GENRES.has(kw.toLowerCase())) {
            genres.push(kw);
        } else {
            tags.push(kw);
        }
    }

    const variables = { page: 1, perPage: 5 };
    if (genres.length > 0) variables.genre_in = genres;
    if (tags.length > 0) variables.tag_in = tags;

    try {
        const res = await executeAnilistQuery(query, variables);
        console.log(`Keyword '${keywordString}' results:`, res.Page.media.length);
    } catch(e) { console.error("Error", e.message); }
}

async function test() {
    await testFilter('Shounen');
    await testFilter('Slice of Life');
    await testFilter('Isekai');
    await testFilter('Action');
    await testFilter('Kids');
}
test().catch(console.error);
