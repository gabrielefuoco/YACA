/**
 * parse.js
 * Estrazione e normalizzazione dei titoli dalle pagine d'indice di antoniogenna.net.
 *
 * Tre regole misurate sul sito (obbligatorie):
 * (a) I tag HTML si rimuovono SENZA inserire spazi: <b>A</b>capulco Bay -> Acapulco Bay.
 * (b) Articolo invertito: Titolo (Il) -> Il Titolo, e vale anche per l'inglese: Old Guard 2 (The) -> The Old Guard 2.
 * (c) (1983) fra parentesi finale = anno di disambiguazione, conservato a parte per match esatto.
 */

const ARTICLES = "il|lo|la|l'|l’|i|gli|le|un|uno|una|un'|the|a|an";
const ARTICLE_RE = new RegExp(`^(.*?)\\s*\\((${ARTICLES})\\)$`, 'i');
const YEAR_RE = /\s*\((\d{4})\)\s*$/;

// Cartelle che non rappresentano titoli di opere doppiate (speciali, memorabilia, videogiochi, etc.)
const EXCLUDED_DIRS = new Set([
    'game', 'speciali', 'memorab', 'interviste', 'foto', 'adescr', 'ombra', 'gpdopp', 'romics', 'awards'
]);

/**
 * Rimuove i tag HTML senza inserire spazi e decodifica entità HTML di base.
 * @param {string} rawHtml 
 * @returns {string}
 */
function stripTags(rawHtml) {
    if (!rawHtml) return '';
    return String(rawHtml)
        .replace(/<[^>]*>/g, '') // Nessuno spazio: <b>A</b>capulco -> Acapulco
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Normalizzazione di base per matching lessicale (lowercase, rimozione accenti e punteggiatura).
 * @param {string} s 
 * @returns {string}
 */
function normBase(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[’'`"«»]/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Applica la normalizzazione specifica di Antonio Genna:
 * - estrae l'anno di disambiguazione finale (1983)
 * - inverte l'articolo in coda (Italiano o Inglese)
 * - calcola il titolo pulito leggibile e la chiave di match
 * @param {string} rawTitle 
 * @returns {{ cleanTitle: string, key: string, year: number|null }}
 */
function normalizeAgTitle(rawTitle) {
    if (!rawTitle) {
        return { cleanTitle: '', key: '', year: null };
    }

    // (c) Anno di disambiguazione finale: (1983)
    let s = rawTitle.trim();
    let year = null;
    const yearMatch = s.match(YEAR_RE);
    if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
        s = s.replace(YEAR_RE, '').trim();
    }

    // (b) Articolo invertito: "Titolo (Il)" o "Old Guard 2 (The)" o "Gadget (L')"
    let cleanTitle = s;
    const artMatch = s.match(ARTICLE_RE);
    if (artMatch) {
        const mainPart = artMatch[1].trim();
        const article = artMatch[2].trim();
        const capArticle = article.charAt(0).toUpperCase() + article.slice(1);
        if (article.endsWith("'") || article.endsWith("’")) {
            cleanTitle = `${capArticle} ${mainPart}`;
        } else {
            cleanTitle = `${capArticle} ${mainPart}`;
        }
        s = `${article} ${mainPart}`;
    }

    return {
        cleanTitle,
        key: normBase(s),
        year
    };
}

/**
 * Mappa la zona (o prefisso file) nel tipo catalogo YACA ('movie' o 'series').
 * @param {string} zone 
 * @returns {'movie'|'series'}
 */
function zoneToType(zone) {
    const z = String(zone || '').toLowerCase();
    if (z.startsWith('film')) return 'movie';
    return 'series'; // telefilm, anim, soap
}

/**
 * Estrae tutte le voci di doppiaggio da una pagina HTML d'indice di Antonio Genna.
 * @param {string} html Contenuto HTML (decodificato windows-1252 o stringa)
 * @param {string} [zoneOrFile='film'] Nome della zona o del file per determinare il tipo
 * @returns {Array<{ href: string, rawTitle: string, cleanTitle: string, key: string, year: number|null, zone: string, type: 'movie'|'series' }>}
 */
function parseIndexPage(html, zoneOrFile = 'film') {
    if (!html) return [];

    const zone = zoneOrFile.split('-')[0].replace(/\.htm$/i, '').toLowerCase();
    const type = zoneToType(zone);

    const re = /<a[^>]*href\s*=\s*["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
    const entries = [];
    let m;

    while ((m = re.exec(html))) {
        const href = m[1].trim();

        // Deve essere un link a una scheda in una sottocartella, es. film1/xxx.htm o telefilm/xxx.htm
        const matchHref = href.match(/^([\w.-]+)\/([^/]+\.htm)$/i);
        if (!matchHref) continue;

        const subDir = matchHref[1].toLowerCase();
        if (EXCLUDED_DIRS.has(subDir)) continue;

        // (a) I tag si rimuovono SENZA spazi: <b>A</b>capulco -> Acapulco
        const rawTitle = stripTags(m[2]);
        if (!rawTitle) continue;

        const { cleanTitle, key, year } = normalizeAgTitle(rawTitle);
        if (!key) continue;

        entries.push({
            href,
            rawTitle,
            cleanTitle,
            key,
            year,
            zone,
            type
        });
    }

    return entries;
}

module.exports = {
    stripTags,
    normBase,
    normalizeAgTitle,
    zoneToType,
    parseIndexPage,
    ARTICLES,
    EXCLUDED_DIRS
};
