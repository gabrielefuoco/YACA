/**
 * Presentazione degli scaffali YACA (badge, semi, quantizzazione slider).
 * Unico punto di verità per le regole di visualizzazione degli scaffali.
 */

function quantizeSliderValue(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.round(value * 10) / 10;
}

/**
 * Determina il badge visibile e l'etichetta dello switch per uno scaffale.
 *
 * REGOLA ANIME:
 * - Le serie che sono anime (medium/type === 'series' && anime === true) mostrano il badge «Anime».
 * - I FILM anime restano «Film» (anime === true && medium/type === 'movie' -> «Film»).
 * - Il tipo catalogo Stremio sottostante resta 'series' o 'movie'.
 * - Non inferisce MAI dal nome: legge esclusivamente il flag booleano anime === true.
 */
function getShelfBadge(shelf = {}) {
    const rawType = shelf.medium || shelf.type || 'movie';
    const isSeries = rawType === 'series' || rawType === 'tv';
    const isAnime = Boolean(shelf.anime);

    if (isSeries && isAnime) {
        return {
            badge: 'Anime',
            switchLabel: 'ANIME',
            type: 'series'
        };
    }

    if (!isSeries && (rawType === 'movie' || !rawType)) {
        return {
            badge: 'Film',
            switchLabel: 'FILM',
            type: 'movie'
        };
    }

    return {
        badge: 'Serie',
        switchLabel: 'SERIE',
        type: 'series'
    };
}

/**
 * Prepara la lista ordinata dei semi del profilo che attivano lo scaffale.
 * Usa semi_membri come fonte primaria (mantenendo l'ordine originale) e
 * arricchisce con plays ed eta_giorni da semi_rappresentativi quando presenti.
 */
function formatShelfSeeds(shelf = {}) {
    const repList = Array.isArray(shelf.semi_rappresentativi) ? shelf.semi_rappresentativi : [];
    const repMap = new Map();
    for (const r of repList) {
        const key = r.tmdbId ? String(r.tmdbId) : String(r.titolo || '');
        if (key) repMap.set(key, r);
    }

    const memberList = Array.isArray(shelf.semi_membri) && shelf.semi_membri.length > 0
        ? shelf.semi_membri
        : repList;

    return memberList.map(seed => {
        const key = seed.tmdbId ? String(seed.tmdbId) : String(seed.titolo || '');
        const rep = repMap.get(key);

        const plays = seed.plays !== undefined ? seed.plays : (rep?.plays !== undefined ? rep.plays : null);
        const eta_giorni = seed.eta_giorni !== undefined ? seed.eta_giorni : (rep?.eta_giorni !== undefined ? rep.eta_giorni : null);

        return {
            titolo: String(seed.titolo || 'Senza titolo'),
            anno: seed.anno !== undefined && seed.anno !== null ? Number(seed.anno) : (rep?.anno !== undefined ? Number(rep.anno) : null),
            tmdbId: seed.tmdbId !== undefined ? Number(seed.tmdbId) : (rep?.tmdbId !== undefined ? Number(rep.tmdbId) : null),
            medium: seed.medium || rep?.medium || shelf.medium || 'movie',
            plays: plays !== null && plays !== undefined ? Number(plays) : null,
            eta_giorni: eta_giorni !== null && eta_giorni !== undefined ? Math.round(Number(eta_giorni)) : null
        };
    });
}

module.exports = {
    quantizeSliderValue,
    getShelfBadge,
    formatShelfSeeds
};
