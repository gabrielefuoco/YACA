const express = require('express');
const router = express.Router();
const { richiedeSessione, erroreDominio } = require('../middleware/sessione');
const { cerca, TIPI_TITOLO, TIPI_GENERE, TIPI_KEYWORD, TIPI_PERSONA } = require('../ricerca');

// La ricerca di dominio richiede la sessione
router.use(richiedeSessione);

const TIPI_SUPPORTATI = new Set([
    ...TIPI_TITOLO,
    ...TIPI_GENERE,
    ...TIPI_KEYWORD,
    ...TIPI_PERSONA
]);

/**
 * GET /api/ricerca?tipo=titolo|genere|keyword|persona&q=...
 * Adattatore sottile (thin adapter) sulla porta unica del modulo ricerca: cerca({ q, tipo, contesto, cap }).
 */
router.get('/', async (req, res) => {
    const rawTipo = String(req.query.tipo || '').trim().toLowerCase();
    const rawQ = String(req.query.q || req.query.query || '').trim();

    if (!rawTipo) {
        return erroreDominio(res, 400, 'richiesta_non_valida', 'Parametro "tipo" obbligatorio (titolo, genere, keyword, persona).');
    }

    if (!TIPI_SUPPORTATI.has(rawTipo)) {
        return erroreDominio(res, 400, 'richiesta_non_valida', `Tipo di ricerca non valido: "${rawTipo}". Validi: titolo, genere, keyword, persona.`);
    }

    if (!rawQ) {
        return res.json({ results: [] });
    }

    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey && (TIPI_KEYWORD.has(rawTipo) || TIPI_PERSONA.has(rawTipo))) {
        return erroreDominio(res, 503, 'non_disponibile', 'Servizio di ricerca non configurato.');
    }

    const cap = req.query.limit ? Number(req.query.limit) : 20;
    const contesto = req.contesto || (req.utenteId ? { userId: req.utenteId } : {});

    const { items, motivi } = await cerca({
        q: rawQ,
        tipo: rawTipo,
        contesto,
        cap,
        tmdbApiKey: tmdbKey
    });

    return res.json({
        results: items,
        motivi: motivi && motivi.length > 0 ? motivi : undefined
    });
});

module.exports = router;
