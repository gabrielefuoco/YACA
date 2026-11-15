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
 * Estrae il token immutabile dell'immagine sorgente (es. "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg" -> "f89U3ADr1oiB1s9GkdPOEpXUk5H")
 * così variazioni di dominio o dimensione (w342 vs w500) producono lo stesso identico hash.
 */
function estraiTokenSorgente(source) {
    if (!source || typeof source !== 'string') return '';
    const clean = source.split('?')[0].trim().replace(/\\/g, '/');
    const base = path.posix.basename(clean).replace(/\.(jpg|jpeg|webp|png)$/i, '');
    return /^[A-Za-z0-9_-]{6,}$/.test(base) ? base : '';
}

/**
 * Versione del poster composto specifico: dipende dal disegno (BADGE_IMG_VERSION),
 * dall'identificatore del titolo (id ERDB), dal badge testuale, e dal token canonico
 * dell'immagine sorgente se disponibile.
 * Se source non è disponibile (o non produce un token valido), l'hash resta identico a prima.
 */
function calcolaVersionePoster({ erdbId, badge, source } = {}) {
    const token = estraiTokenSorgente(source);
    const payload = token
        ? `${BADGE_IMG_VERSION}|${erdbId || ''}|${badge || ''}|${token}`
        : `${BADGE_IMG_VERSION}|${erdbId || ''}|${badge || ''}`;
    return crypto.createHash('sha1')
        .update(payload)
        .digest('hex')
        .slice(0, 8);
}

module.exports = {
    BADGE_IMG_VERSION,
    estraiTokenSorgente,
    calcolaVersionePoster,
    calcolaVersioneDisegno
};
