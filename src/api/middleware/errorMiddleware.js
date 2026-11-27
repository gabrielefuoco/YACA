/**
 * Centralized error handling middleware.
 * Ensures consistent error response format across the API.
 */
const errorMiddleware = (err, req, res, next) => {
    // Un `%` non codificato non è un guasto del server: Express non riesce a decodificare il
    // parametro della rotta e solleva un URIError con `status` 400 (non `statusCode`), quindi
    // senza questo ramo la risposta era un 500. Per Stremio la risposta giusta è quella vuota
    // del protocollo; per il resto basta un 400 onesto.
    const mancataDecodifica = err instanceof URIError
        || /Failed to decode param/i.test(String((err && err.message) || ''));
    if (mancataDecodifica) {
        const percorso = String(req.originalUrl || req.url || '');
        if (percorso.includes('/catalog/')) return res.status(200).json({ metas: [] });
        if (percorso.includes('/meta/')) return res.status(200).json({ meta: null });
        return res.status(400).json({
            error: 'Richiesta non valida',
            status: 400,
            path: percorso,
            timestamp: new Date().toISOString()
        });
    }

    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Errore interno del server';
    
    // Log error details for debugging (avoid logging sensitive info in production if needed)
    console.error(`[Error] ${req.method} ${req.url}: ${message}`, {
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        userId: req.user?.userId
    });

    res.status(statusCode).json({
        error: message,
        status: statusCode,
        path: req.url,
        timestamp: new Date().toISOString()
    });
};

module.exports = errorMiddleware;
