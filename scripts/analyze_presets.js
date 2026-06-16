const { getPresets } = require('../src/data/presets.js');

const TMDB_GENRES = {
    MOVIE: { Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14, History: 36, Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749, SciFi: 878, Thriller: 53, War: 10752, Western: 37 },
    TV: { ActionAdventure: 10759, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18, Family: 10762, Kids: 10762, Mystery: 9648, News: 10763, Reality: 10764, SciFiFantasy: 10765, Soap: 10766, Talk: 10767, WarPolitics: 10768, Western: 37 }
};

const MOVIE_GENRE_VALUES = Object.values(TMDB_GENRES.MOVIE).map(String);
const TV_GENRE_VALUES = Object.values(TMDB_GENRES.TV).map(String);

const presets = getPresets();

const report = {
    similar: [],
    wrong: [],
    tooEmpty: [],
    needsQuality: [],
    needsSorting: []
};

// Find similar
for (let i = 0; i < presets.length; i++) {
    for (let j = i + 1; j < presets.length; j++) {
        const p1 = presets[i];
        const p2 = presets[j];
        if (p1.type === p2.type) {
            const q1 = p1.queries[0] || {};
            const q2 = p2.queries[0] || {};
            if (q1.with_genres === q2.with_genres && q1.with_keywords === q2.with_keywords && q1.with_cast === q2.with_cast && q1.with_crew === q2.with_crew && q1.with_companies === q2.with_companies) {
                // If they only differ slightly
                if (p1.name !== p2.name) {
                    report.similar.push(`${p1.id} (${p1.name}) è quasi identico a ${p2.id} (${p2.name}) - Stessi generi e keyword/crew`);
                }
            }
        }
    }
}

// Check wrong and empty and quality and sorting
presets.forEach(p => {
    const q = p.queries[0] || {};
    
    // 2) WRONG
    // Movie with TV genre or vice versa
    if (q.with_genres) {
        const genres = String(q.with_genres).split(/[|,]/);
        if (p.type === 'movie') {
            const hasTvGenre = genres.some(g => TV_GENRE_VALUES.includes(g) && !MOVIE_GENRE_VALUES.includes(g));
            if (hasTvGenre) report.wrong.push(`${p.id} (${p.name}): Tipo è 'movie' ma contiene un ID di genere TV.`);
        } else if (p.type === 'series') {
            const hasMovieGenre = genres.some(g => MOVIE_GENRE_VALUES.includes(g) && !TV_GENRE_VALUES.includes(g));
            if (hasMovieGenre) report.wrong.push(`${p.id} (${p.name}): Tipo è 'series' ma contiene un ID di genere MOVIE.`);
        }
    }
    
    // Anime exclusion on standard TV series (usually 210024 is anime keyword)
    if (p.type === 'series' && !p.id.includes('anime') && !q.with_keywords?.includes('210024') && q.with_genres !== 16 && q.with_genres !== '16') {
        if (!q.without_keywords || !String(q.without_keywords).includes('210024')) {
            report.wrong.push(`${p.id} (${p.name}): È una serie standard ma non esclude le keyword anime (without_keywords: '210024'). Potrebbe mostrare anime mischiati.`);
        }
    }

    // 3) TOO EMPTY
    let constraints = 0;
    if (q.with_genres) constraints++;
    if (q.with_keywords) constraints++;
    if (q.with_companies || q.with_cast || q.with_crew) constraints++;
    if (q['vote_average.gte'] && q['vote_average.gte'] >= 8) constraints++;
    if (q['vote_count.gte'] && q['vote_count.gte'] > 1000) constraints++;
    if (q.with_original_language) constraints++;
    
    if (constraints >= 4) {
        report.tooEmpty.push(`${p.id} (${p.name}): Troppi filtri applicati, rischio di catalogo quasi vuoto (es. genere + keyword + lingua + vote_average molto alto).`);
    }

    // 4) NEEDS QUALITY FILTERS
    // Missing vote_count when sorting by vote_average
    if (q.sort_by === 'vote_average.desc') {
        if (!q['vote_count.gte'] || q['vote_count.gte'] < 50) {
            report.needsQuality.push(`${p.id} (${p.name}): Ordina per voto ma ha un vote_count.gte assente o troppo basso (${q['vote_count.gte'] || 'assente'}). Risultati falsati da prodotti con pochissimi voti alti.`);
        }
    }
    // Popularity sort but no minimum votes (sometimes okay, but better to have at least 5-10)
    if (q.sort_by === 'popularity.desc' && (!q['vote_count.gte'] || q['vote_count.gte'] < 5)) {
        if (!p.id.includes('new') && !p.id.includes('recent')) {
            report.needsQuality.push(`${p.id} (${p.name}): Ordina per popolarità ma non ha filtri minimi di voti (vote_count.gte < 5). Potrebbe mostrare immondizia recente.`);
        }
    }

    // 5) NEEDS SORTING FILTERS
    if (p.name.toLowerCase().includes('migliori') || p.name.toLowerCase().includes('top') || p.name.toLowerCase().includes('cult')) {
        if (q.sort_by && q.sort_by !== 'vote_average.desc') {
             report.needsSorting.push(`${p.id} (${p.name}): Suggerisce "Migliori/Top/Cult" ma l'ordinamento attuale è '${q.sort_by}' invece di 'vote_average.desc'.`);
        }
    }
    if (p.name.toLowerCase().includes('popolari') || p.name.toLowerCase().includes('trend')) {
        if (q.sort_by && q.sort_by !== 'popularity.desc') {
             report.needsSorting.push(`${p.id} (${p.name}): Suggerisce "Popolari/Trend" ma l'ordinamento attuale è '${q.sort_by}' invece di 'popularity.desc'.`);
        }
    }
    if (!q.sort_by) {
        report.needsSorting.push(`${p.id} (${p.name}): Manca totalmente un criterio di sort_by.`);
    }
});

const fs = require('fs');
fs.writeFileSync('analysis_report.json', JSON.stringify(report, null, 2));
console.log('Report saved to analysis_report.json');
