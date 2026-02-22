const { Mistral } = require('@mistralai/mistralai');

// ============================================
// SYSTEM PROMPTS
// ============================================

const PARSE_TMDB_FILTERS_PROMPT = `
Sei un assistente per un catalogo cinematografico (API TheMovieDB).
Il tuo obiettivo è leggere la richiesta utente ed estrarne i filtri di ricerca in formato JSON.

Esempio:
Utente: "Commedie romantiche natalizie"
JSON Output:
{
    "genre_ids": "35,10749",
    "keyword": "christmas"
}

Restituisci ESCLUSIVAMENTE un blocco JSON valido con questi campi (usali solo se esplicitati dalla richiesta):
- "genre_ids": (stringa di id separati da virgola. Azione=28, Avventura=12, Animazione=16, Commedia=35, Crime=80, Documentario=99, Dramma=18, Famiglia=10751, Fantasy=14, Storia=36, Horror=27, Musica=10402, Mistero=9648, Romance=10749, Fantascienza=878, TV Movie=10770, Thriller=53, Guerra=10752, Western=37)
- "primary_release_year": (numero intero)
- "primary_release_date.gte": (data stringa YYYY-MM-DD per indicare un decennio "anni 80" faresti .gte 1980-01-01 e .lte 1989-12-31)
- "primary_release_date.lte": (data stringa YYYY-MM-DD)
- "sort_by": (stringa, e.g. "popularity.desc", "vote_average.desc", "revenue.desc") - DEFAULT A "popularity.desc"

Se l'utente parla di un tema o keyword generico (es: "alieni", "spazio", "babbi natale", "zombie"), non devi farti problemi, puoi inserire "keyword": "stringa". Esempio: "alien". 
(Il backend poi sbroglierà la keyword in tmdb ID, tu scrivi solo la parola chiave in INGLESE).

Non aggiungere commenti o testo fuori dal blocco JSON.
`;

const ROUTER_PROMPT = `
Sei un router intelligente per un catalogo multimediale Stremio.
Hai tre database a disposizione:
1) "TMDB" (Perfetto per Film di Hollywood, Serie TV generali, registi, attori, generi).
2) "KITSU" (Perfetto per ANIME, Manga, roba giapponese/otaku).
3) "TRAKT" (Usa solo se chiede esplicitamente trending globali o "Cose più viste").

Leggi la richiesta utente e decidi la destinazione migliore ("target"). 
Se il target è TMDB, estrai una search string ("query"). Se per KITSU, usa "query".
Rispondi SOLO in JSON:
{
  "target": "tmdb" | "kitsu" | "trakt",
  "query": "stringa da cercare (lascia vuoto se non serve search diretta)"
}
`;


// ============================================
// FUNCTIONS
// ============================================

/**
 * Utilizzato durante la fase di CONFIG per le liste custom.
 * @param {string} prompt "Film horror anni 80 sulle navi"
 * @param {string} mistralKey La chiave mistral dell'utente
 * @returns Object (Filtri TMDB JSON)
 */
async function generateTmdbFiltersFromPrompt(prompt, mistralKey) {
    try {
        const client = new Mistral({ apiKey: mistralKey });

        const response = await client.chat.complete({
            model: "mistral-small-latest",
            messages: [
                { role: "system", content: PARSE_TMDB_FILTERS_PROMPT },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        });

        const rawJson = response.choices[0].message.content;
        return JSON.parse(rawJson);
    } catch (err) {
        console.error("Errore Fallback in generateTmdbFiltersFromPrompt (ritorno vuoto):", err.message);
        return { sort_by: "popularity.desc" }; // Filtro fallback di sicurezza
    }
}

/**
 * Utilizzato durante la live search di Stremio per decidere dove instradare la query AI Libera.
 * @param {string} searchQuery La ricerca battuta in stremio
 * @param {string} mistralKey 
 * @returns Object { target: string, query: string }
 */
async function routeLiveStremioSearch(searchQuery, mistralKey) {
    try {
        const client = new Mistral({ apiKey: mistralKey });

        const response = await client.chat.complete({
            model: "mistral-small-latest",
            messages: [
                { role: "system", content: ROUTER_PROMPT },
                { role: "user", content: searchQuery }
            ],
            response_format: { type: "json_object" }
        });

        const rawJson = response.choices[0].message.content;
        return JSON.parse(rawJson);
    } catch (err) {
        console.error("Errore Router AI, fallback su TMDB Search:", err.message);
        return { target: "tmdb", query: searchQuery };
    }
}

module.exports = {
    generateTmdbFiltersFromPrompt,
    routeLiveStremioSearch
};
