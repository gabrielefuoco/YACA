const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Cartella dei poster già composti: in produzione è un volume montato in /data/erdb-cache,
// in sviluppo/test la si punta altrove con ERDB_CACHE_DIR.
const DEFAULT_CACHE_DIR = '/data/erdb-cache';

// I file serviti sono immutabili (produotti altrove e copiati sul server): 24 ore va bene.
// Il 404 invece dura pochi minuti, così se il poster arriva dopo compare subito.
const CACHE_CONTROL_HIT = 'public, max-age=86400';
const CACHE_CONTROL_MISS = 'public, max-age=300';

// Uniche estensioni servite: sono le stesse con cui vengono prodotti i poster.
const CONTENT_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
};

// Unica fonte di verità sulla cartella dei poster: la riusa anche il drenatore, così i due
// non possono divergere (se divergessero i file prodotti non sarebbero mai serviti).
const getCacheDir = () => process.env.ERDB_CACHE_DIR || DEFAULT_CACHE_DIR;

// Il parametro della rotta arriva già decodificato (`%2e%2e%2f` è già `../`), quindi qui si
// ragiona sul nome "grezzo": nessun separatore, nessun risalimento, nessun byte null.
const isSafeFileName = (name) => {
    if (typeof name !== 'string' || name.length === 0) return false;
    if (name.includes('/') || name.includes('\\')) return false;
    if (name.includes('..')) return false;
    if (name.includes('\0')) return false;
    return true;
};

// Difesa in profondità: anche con un nome "pulito" (p.es. `C:foo` su Windows) il percorso
// risolto deve restare dentro la cartella, o non viene servito.
const resolveInsideCacheDir = (name) => {
    const base = path.resolve(getCacheDir());
    const resolved = path.resolve(base, name);
    if (!resolved.startsWith(base + path.sep)) return null;
    return resolved;
};

const sendNotFound = (res) => {
    res.setHeader('Cache-Control', CACHE_CONTROL_MISS);
    return res.status(404).json({ error: 'Poster non trovato' });
};

router.get('/erdb-poster/:file', (req, res) => {
    const fileName = req.params.file;

    if (!isSafeFileName(fileName)) {
        console.warn(`[StaticPosters] Nome file rifiutato: ${fileName}`);
        return sendNotFound(res);
    }

    // Estensioni diverse da jpg/jpeg/webp non sono poster: nessun content-type da dichiarare.
    const contentType = CONTENT_TYPES[path.extname(fileName).toLowerCase()];
    if (!contentType) return sendNotFound(res);

    const filePath = resolveInsideCacheDir(fileName);
    if (!filePath) {
        console.warn(`[StaticPosters] Percorso fuori dalla cartella, rifiutato: ${fileName}`);
        return sendNotFound(res);
    }

    // La cartella può non esistere (o non essere ancora montata): non è un errore, è un 404.
    let stats;
    try {
        stats = fs.statSync(filePath);
    } catch {
        return sendNotFound(res);
    }
    if (!stats.isFile()) return sendNotFound(res);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', CACHE_CONTROL_HIT);
    return res.sendFile(filePath, { cacheControl: false, dotfiles: 'deny' }, (err) => {
        // Il file può sparire tra il controllo e l'invio: in quel caso 404, non una mezza risposta.
        if (err && !res.headersSent) sendNotFound(res);
    });
});

/**
 * Registra la rotta GET /erdb-poster/:file sull'app Express.
 * I poster arrivano già composti da fuori e vengono letti dalla cartella indicata da
 * process.env.ERDB_CACHE_DIR (default /data/erdb-cache).
 */
const registerStaticPostersRoute = (app) => {
    app.use(router);
    return router;
};

module.exports = registerStaticPostersRoute;
module.exports.registerStaticPostersRoute = registerStaticPostersRoute;
module.exports.getCacheDir = getCacheDir;
module.exports.DEFAULT_CACHE_DIR = DEFAULT_CACHE_DIR;
