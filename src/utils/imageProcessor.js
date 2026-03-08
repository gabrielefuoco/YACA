const { createAxiosInstance } = require('./httpClient');

const imageClient = createAxiosInstance('');

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB limite massimo per immagini scaricate
const IMAGEKIT_ID = process.env.IMAGEKIT_ID || 'yaca_placeholder'; // User should provide this

/**
 * Genera un URL di sfocatura delegando a wsrv.nl (proxy esterno gratuito).
 */
function getBlurredImageUrl(imageUrl) {
    return `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&blur=20`;
}

/**
 * Costruisce l'URL ImageKit per aggiungere un badge di testo.
 * Usa il Layer API (l-text) con un "Master Hack" per ottenere il look asimmetrico.
 * Rounding a sx (r-50), Squadrato a dx (masking tramite padding off-canvas).
 */
function getImageKitUrl(imageUrl, text) {
    if (!IMAGEKIT_ID || IMAGEKIT_ID === 'yaca_placeholder') {
        return imageUrl;
    }

    // Encoding Base64 richiesto dal parametro 'ie' di ImageKit
    const b64 = Buffer.from(text).toString('base64').replace(/=/g, '%3D');

    /**
     * MASTER HACK (Premium Look):
     * 1. tr:w-500 -> Blocca il canvas a 500px (standard TMDB) per permettere il clipping precisio.
     * 2. bg-00000080 -> Sfondo nero semi-trasparente (50% alpha).
     * 3. lx-160 -> Inizia il badge a 160px. Abbiamo un margine di ~340px per il testo.
     * 4. r-50 -> Arrotondamento (pillola).
     * 5. pa-15_350_15_30 -> Padding DX di 350px spinge l'estremità arrotondata fuori dai 500px.
     *    Questo crea il bordo squadrato a filo con il margine destro dell'immagine.
     */
    const transformations = `tr:w-500,l-text,ie-${b64},fs-45,co-FFFFFF,bg-00000080,pa-15_350_15_35,r-50,lx-160,ly-0,l-end`;

    return `https://ik.imagekit.io/${IMAGEKIT_ID}/${transformations}/${imageUrl}`;
}

/**
 * Scarica un poster con badge elaborato da ImageKit.
 * Offload totale della trasformazione a ImageKit per risparmiare RAM.
 */
async function addBadgeToImage(imageUrl, badgeText) {
    try {
        const ikUrl = getImageKitUrl(imageUrl, badgeText);

        // Se non abbiamo ImageKitID, restituiamo null per fallimento (index.js farà redirect a URL originale)
        if (ikUrl === imageUrl) return null;

        const response = await imageClient.get(ikUrl, {
            responseType: 'arraybuffer',
            timeout: 15000,
            maxContentLength: MAX_IMAGE_SIZE
        });

        return Buffer.from(response.data);
    } catch (error) {
        console.error('Error fetching image from ImageKit:', error.message);
        return null;
    }
}

module.exports = { getBlurredImageUrl, addBadgeToImage, getImageKitUrl };
