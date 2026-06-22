const { fetchKitsuCatalog, fetchKitsuEpisodes } = require('../../clients/kitsu');
const { rateLimitedMap } = require('../../utils/rateLimiter');

async function getKitsuCatalog(id, skip, shouldBadge = false) {
    const kitsuParams = { sort: 'popularityRank' };
    
    if (id === 'yaca_anime_ova') kitsuParams['filter[subtype]'] = 'OVA';
    if (id === 'yaca_anime_ona') kitsuParams['filter[subtype]'] = 'ONA';
    if (id === 'yaca_anime_specials') kitsuParams['filter[subtype]'] = 'special';

    try {
        const results = await fetchKitsuCatalog('/anime', skip, kitsuParams);
        
        if (shouldBadge) {
            await rateLimitedMap(
                results,
                async (item) => {
                    const kitsuId = item?.id?.replace('kitsu:', '');
                    if (!kitsuId) return;
                    const episodes = await fetchKitsuEpisodes(kitsuId);
                    item.videos = episodes || [];
                },
                { batchSize: 3, delayMs: 100 }
            );
        }

        return results;
    } catch (e) {
        return [];
    }
}

async function getKitsuCatalogFromFilters(filters, type, skip, shouldBadge = false) {
    let kitsuParams = { sort: 'popularityRank' };
    
    if (filters.text_search || filters.keyword) {
        kitsuParams['filter[text]'] = filters.text_search || filters.keyword;
    }
    
    if (filters._keywordNames) {
        const categories = filters._keywordNames
            .split(/[|,]/)
            .map(c => c.trim().replace(/\s+/g, '-'))
            .filter(Boolean)
            .join(',')
            .toLowerCase();
        kitsuParams['filter[categories]'] = categories;
    }
    
    if (type === 'movie') {
        kitsuParams['filter[subtype]'] = 'movie';
    } else if (type === 'series') {
        kitsuParams['filter[subtype]'] = 'TV';
    }

    if (filters.status) {
        kitsuParams['filter[status]'] = filters.status;
    }

    // Map TMDB Date Filters to Kitsu seasonYear
    const gteDate = filters['first_air_date.gte'] || filters['primary_release_date.gte'];
    const lteDate = filters['first_air_date.lte'] || filters['primary_release_date.lte'];
    
    const currentYear = new Date().getFullYear();
    
    if (gteDate || lteDate) {
        const startYear = gteDate ? gteDate.substring(0, 4) : '1900';
        const endYear = lteDate ? lteDate.substring(0, 4) : '2030';
        kitsuParams['filter[seasonYear]'] = `${startYear}..${endYear}`;
    } else {
        // Exclude future anime by default using seasonYear instead of status 
        // because Kitsu API ignores subtype filters when status is used!
        kitsuParams['filter[seasonYear]'] = `1900..${currentYear}`;
    }

    // Map TMDB vote average to Kitsu averageRating (0..100)
    const voteMin = filters.voteMin !== undefined && filters.voteMin !== null ? filters.voteMin : (filters['vote_average.gte'] !== undefined ? filters['vote_average.gte'] : null);
    const voteMax = filters.voteMax !== undefined && filters.voteMax !== null ? filters.voteMax : (filters['vote_average.lte'] !== undefined ? filters['vote_average.lte'] : null);
    if (voteMin !== null || voteMax !== null) {
        const minRating = voteMin !== null ? Math.round(Number(voteMin) * 10) : 0;
        const maxRating = voteMax !== null ? Math.round(Number(voteMax) * 10) : 100;
        if (minRating > 0 || maxRating < 100) {
            kitsuParams['filter[averageRating]'] = `${minRating}..${maxRating}`;
        }
    }

    // Map TMDB certification (Censura) to Kitsu ageRating
    const certificationLte = filters.certificationLte || filters['certification.lte'];
    if (certificationLte) {
        if (certificationLte === 'G') {
            kitsuParams['filter[ageRating]'] = 'G';
        } else if (certificationLte === 'PG') {
            kitsuParams['filter[ageRating]'] = 'G,PG';
        } else if (certificationLte === 'PG-13' || certificationLte === 'R') {
            kitsuParams['filter[ageRating]'] = 'G,PG,R';
        } else if (certificationLte === 'NC-17') {
            kitsuParams['filter[ageRating]'] = 'G,PG,R,R18';
        }
    }


    if (filters.sort_by) {
        const sortBy = filters.sort_by;
        if (sortBy === 'popularity.desc' || sortBy === 'popularityRank') {
            kitsuParams.sort = 'popularityRank';
        } else if (sortBy === 'popularity.asc' || sortBy === '-popularityRank') {
            kitsuParams.sort = '-popularityRank';
        } else if (sortBy === 'vote_average.desc' || sortBy === '-averageRating' || sortBy === 'ratingRank') {
            kitsuParams.sort = '-averageRating';
        } else if (sortBy === 'vote_average.asc' || sortBy === 'averageRating' || sortBy === '-ratingRank') {
            kitsuParams.sort = 'averageRating';
        } else if (sortBy === 'release_date.desc' || sortBy === 'first_air_date.desc' || sortBy === '-startDate') {
            kitsuParams.sort = '-startDate';
        } else if (sortBy === 'release_date.asc' || sortBy === 'first_air_date.asc' || sortBy === 'startDate') {
            kitsuParams.sort = 'startDate';
        }
    }

    try {
        let results = [];
        let currentSkip = skip;
        let maxPages = 3;

        for (let i = 0; i < maxPages; i++) {
            let pageResults = await fetchKitsuCatalog('/anime', currentSkip, kitsuParams);
            if (pageResults.length === 0) break;
            
            // POST-FETCH FILTER: Kitsu API sometimes ignores filter[subtype] when combined with multiple filters (e.g. status + categories).
            // To guarantee accuracy for Movie vs Series catalogs, we enforce it locally.
            if (type === 'movie') {
                pageResults = pageResults.filter(item => item._kitsu_subtype === 'movie' || item._kitsu_subtype === 'special');
            } else if (type === 'series') {
                pageResults = pageResults.filter(item => item._kitsu_subtype === 'TV' || item._kitsu_subtype === 'ONA' || item._kitsu_subtype === 'OVA');
            }

            results = results.concat(pageResults);
            if (results.length >= 15) break; // We have enough for a decent row
            currentSkip += 20; // Try next page
        }

        // Limit to 20 just in case we overshot significantly
        results = results.slice(0, 20);

        if (shouldBadge) {
            await rateLimitedMap(
                results,
                async (item) => {
                    const kitsuId = item?.id?.replace('kitsu:', '');
                    if (!kitsuId) return;
                    const episodes = await fetchKitsuEpisodes(kitsuId);
                    item.videos = episodes || [];
                },
                { batchSize: 3, delayMs: 100 }
            );
        }

        return results;
    } catch (e) {
        return [];
    }
}

module.exports = { getKitsuCatalog, getKitsuCatalogFromFilters };
