require('dotenv').config();
const { executeGraphQL } = require('../src/clients/anilist');

const CATALOG_QUERY = `
query ($tag_in: [String]) {
    Page(page: 1, perPage: 5) {
        media(type: ANIME, tag_in: $tag_in) {
            id
            title { romaji }
        }
    }
}`;

async function test() {
    console.log("Testing lowercase shounen...");
    const res1 = await executeGraphQL(CATALOG_QUERY, { tag_in: ["shounen"] });
    console.log("shounen:", res1.data?.Page?.media?.length);

    console.log("Testing capitalized Shounen...");
    const res2 = await executeGraphQL(CATALOG_QUERY, { tag_in: ["Shounen"] });
    console.log("Shounen:", res2.data?.Page?.media?.length);

    console.log("Testing uppercase SHOUNEN...");
    const res3 = await executeGraphQL(CATALOG_QUERY, { tag_in: ["SHOUNEN"] });
    console.log("SHOUNEN:", res3.data?.Page?.media?.length);
    
    console.log("Testing seinen...");
    const res4 = await executeGraphQL(CATALOG_QUERY, { tag_in: ["seinen"] });
    console.log("seinen:", res4.data?.Page?.media?.length);
    
    console.log("Testing Seinen...");
    const res5 = await executeGraphQL(CATALOG_QUERY, { tag_in: ["Seinen"] });
    console.log("Seinen:", res5.data?.Page?.media?.length);
}
test().catch(console.error);
