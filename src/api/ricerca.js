const express = require('express');
const router = express.Router();
const { richiedeSessione, erroreDominio } = require('../middleware/sessione');
const { createTmdbClient } = require('../clients/tmdb');
const { sanitizeString } = require('../utils/helpers');

// La ricerca di dominio richiede la sessione
router.use(richiedeSessione);

/**
 * GET /api/ricerca?tipo=titolo|genere|keyword|persona&q=...
 * Una rotta unificata di ricerca per il creator panel.
 * Replaces /api/tmdb/search/{multi,genre,keyword,person}.
 */
router.get('/', async (req, res) => {
    const rawTipo = String(req.query.tipo || '').trim().toLowerCase();
    const rawQ = String(req.query.q || req.query.query || '').trim();

    if (!rawTipo) {
        return erroreDominio(res, 400, 'richiesta_non_valida', 'Parametro "tipo" obbligatorio (titolo, genere, keyword, persona).');
    }

    if (!rawQ) {
        return res.json({ results: [] });
    }

    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) {
        return erroreDominio(res, 503, 'non_disponibile', 'Servizio di ricerca non configurato.');
    }

    const client = createTmdbClient(tmdbKey);
    const query = sanitizeString(rawQ);

    try {
        switch (rawTipo) {
            case 'titolo':
            case 'multi': {
                const response = await client.get('/search/multi', {
                    params: {
                        query,
                        language: 'it-IT',
                        page: 1,
                        include_adult: false
                    }
                });
                return res.json({ results: response.data?.results || [] });
            }

            case 'genere':
            case 'genre': {
                const [movieGenresRes, tvGenresRes] = await Promise.all([
                    client.get('/genre/movie/list', { params: { language: 'it-IT' } }),
                    client.get('/genre/tv/list', { params: { language: 'it-IT' } })
                ]);
                const merged = [...(movieGenresRes.data?.genres || []), ...(tvGenresRes.data?.genres || [])];
                const dedupedById = Array.from(new Map(merged.map(g => [String(g.id), g])).values());
                const filtered = dedupedById.filter(g => String(g.name || '').toLowerCase().includes(query.toLowerCase()));
                return res.json({ results: filtered });
            }

            case 'keyword': {
                const response = await client.get('/search/keyword', {
                    params: {
                        query,
                        page: 1
                    }
                });
                return res.json({ results: response.data?.results || [] });
            }

            case 'persona':
            case 'person': {
                const response = await client.get('/search/person', {
                    params: {
                        query,
                        language: 'it-IT',
                        page: 1,
                        include_adult: false
                    }
                });
                return res.json({ results: response.data?.results || [] });
            }

            default:
                return erroreDominio(res, 400, 'richiesta_non_valida', `Tipo di ricerca non valido: "${rawTipo}". Validi: titolo, genere, keyword, persona.`);
        }
    } catch (err) {
        console.error('[RicercaAPI] Errore ricerca:', err.message);
        return erroreDominio(res, 503, 'motore_giu', 'Errore durante la ricerca dei metadati.');
    }
});

module.exports = router;
