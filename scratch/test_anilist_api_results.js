require('dotenv').config();
const { executeGraphQL } = require('../src/clients/anilist');

const CATALOG_QUERY = `
query ($page: Int, $perPage: Int, $sort: [MediaSort], $season: MediaSeason, $seasonYear: Int, $format: MediaFormat, $format_in: [MediaFormat], $genre: String, $genre_in: [String], $tag_in: [String], $search: String, $status: MediaStatus, $averageScore_greater: Int, $averageScore_lesser: Int, $startDate_greater: FuzzyDateInt, $startDate_lesser: FuzzyDateInt) {
    Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: $sort, season: $season, seasonYear: $seasonYear, format: $format, format_in: $format_in, genre: $genre, genre_in: $genre_in, tag_in: $tag_in, search: $search, status: $status, averageScore_greater: $averageScore_greater, averageScore_lesser: $averageScore_lesser, startDate_greater: $startDate_greater, startDate_lesser: $startDate_lesser, isAdult: false) {
            id
            title { romaji }
        }
    }
}`;

async function test() {
    const vars1 = {
        page: 1, perPage: 20, sort: ['POPULARITY_DESC'],
        tag_in: ['Shounen'], format_in: ['TV', 'TV_SHORT', 'OVA', 'ONA'], startDate_lesser: 20270000
    };
    try {
        const res1 = await executeGraphQL(CATALOG_QUERY, vars1);
        console.dir(res1, { depth: null });
    } catch(e) {
        console.error("Shounen ERROR", e.response?.data);
    }
}
test().catch(console.error);
