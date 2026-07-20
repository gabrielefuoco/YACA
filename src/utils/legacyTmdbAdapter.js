const { F, S, SortExpr, desc, asc } = require('../data/filters');

function mapSortBy(s, yacaSort) {
    if (yacaSort) {
        if (yacaSort.includes('LOG10')) return S.BAYESIAN;
        if (yacaSort.includes('ASC')) return asc(SortExpr.roi);
        if (yacaSort.includes('DESC')) return desc(SortExpr.roi);
    }
    if (!s) return S.POPULAR;
    if (s === 'popularity.desc') return S.POPULAR;
    if (s === 'vote_average.desc') return S.TOP_RATED;
    if (s === 'revenue.desc') return S.REVENUE;
    return s.replace('.desc', ' DESC NULLS LAST').replace('.asc', ' ASC NULLS LAST');
}

function processTmdbQueryToPreset(q, type) {
    const where = [];
    if (!q) return { type, where, orderBy: S.POPULAR };

    if (q._search) {
        where.push({ _fts: q._search });
    }

    if (q.yaca_sql_where) {
        if (q.yaca_sql_where.includes('anime_mappings')) where.push(F.anime);
        if (q.yaca_sql_where.includes('revenue > 1000000')) where.push(F.validBoxOffice);
        if (q.yaca_sql_where.includes('runtime BETWEEN')) where.push(F.shortFilm);
        if (q.yaca_sql_where.includes('collection_id')) where.push(F.franchise);
    }

    if (q['vote_count.gte']) where.push(F.minVotes(q['vote_count.gte']));
    if (q['vote_average.gte']) where.push(F.minScore(q['vote_average.gte']));
    
    if (q.with_original_language) {
        const langs = q.with_original_language.split('|');
        if (langs.length === 1) where.push(F.lang(langs[0]));
        else where.push(F.any(...langs.map(l => F.lang(l))));
    }

    if (q.with_origin_country) {
        where.push(F.country(q.with_origin_country));
    }

    if (q.with_genres) {
        const str = String(q.with_genres);
        if (str.includes('|')) {
            where.push(F.genre(...str.split('|').map(Number)));
        } else if (str.includes(',')) {
            where.push(F.allGenres(...str.split(',').map(Number)));
        } else {
            where.push(F.genre(Number(str)));
        }
    }

    if (q.without_genres) {
        where.push(F.notGenre(...String(q.without_genres).split(/[,|]/).map(Number)));
    }

    if (q.with_keywords) {
        const str = String(q.with_keywords);
        if (str.includes('|')) {
            where.push(F.keyword(...str.split('|').map(Number)));
        } else if (str.includes(',')) {
            where.push(F.allKeywords(...str.split(',').map(Number)));
        } else {
            where.push(F.keyword(Number(str)));
        }
    }

    if (q.without_keywords) {
        where.push(F.notKeyword(...String(q.without_keywords).split(/[,|]/).map(Number)));
    }

    if (q.with_crew) where.push(F.crew(q.with_crew));
    if (q.with_cast) where.push(F.actor(q.with_cast));
    if (q.with_companies) where.push(F.company(q.with_companies));
    if (q.with_networks) where.push(F.network(q.with_networks));

    if (q['primary_release_date.gte']) where.push(`"release_date" >= '${q['primary_release_date.gte']}'`);
    if (q['primary_release_date.lte']) where.push(`"release_date" <= '${q['primary_release_date.lte']}'`);
    if (q['first_air_date.gte']) where.push(`"first_air_date" >= '${q['first_air_date.gte']}'`);
    if (q['first_air_date.lte']) where.push(`"first_air_date" <= '${q['first_air_date.lte']}'`);

    return {
        type,
        where,
        orderBy: mapSortBy(q.sort_by, q.yaca_sql_sort)
    };
}

module.exports = { processTmdbQueryToPreset };
