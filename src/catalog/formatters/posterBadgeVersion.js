const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Versione del disegno del badge.
 * Sostituisce il numero manuale (24) con un hash derivato dal contenuto dell'asset del badge
 * (la font con cui si compone l'immagine).
 * Cambia automaticamente quando cambia l'asset grafico, in questo punto solo (ticket 30, sessione 2).
 */
function calcolaVersioneDisegno() {
    try {
        const fontPath = path.join(__dirname, '../../assets/fonts/noto-sans.ttf');
        if (fs.existsSync(fontPath)) {
            const fontBytes = fs.readFileSync(fontPath);
            return crypto.createHash('sha1').update(fontBytes).digest('hex').slice(0, 8);
        }
    } catch {
        // Fallback di sicurezza
    }
    return crypto.createHash('sha1').update('noto-sans-badge-v1').digest('hex').slice(0, 8);
}

const BADGE_IMG_VERSION = calcolaVersioneDisegno();

/**
 * Versione del poster composto specifico: dipende dal disegno (BADGE_IMG_VERSION),
 * dall'identificatore del titolo (id ERDB), dal badge testuale e dall'immagine sorgente.
 * Cambia quando cambia l'immagine sorgente o il badge, garantendo cache-busting on demand.
 */
function calcolaVersionePoster({ erdbId, id, type, badge, source } = {}) {
    const rawErdbId = erdbId || id || '';
    const rawType = type || '';
    const rawBadge = badge || '';
    const rawSource = String(source || '').trim();

    return crypto.createHash('sha1')
        .update(`${BADGE_IMG_VERSION}|${rawErdbId}|${rawType}|${rawBadge}|${rawSource}`)
        .digest('hex')
        .slice(0, 8);
}

module.exports = {
    BADGE_IMG_VERSION,
    calcolaVersionePoster,
    calcolaVersioneDisegno
};


