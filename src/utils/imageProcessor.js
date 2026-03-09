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
     * 3. oa-top_right -> Ancora il badge all'angolo in alto a destra.
     * 4. r-50 -> Arrotondamento (pillola).
     * 5. pa-15_350_15_35 -> Padding DX di 350px spinge l'estremità arrotondata fuori dai 500px.
     *    Questo crea il bordo squadrato a filo con il margine destro dell'immagine.
     *    Il badge si espande naturalmente verso sinistra in base al testo.
     */
    const transformations = `tr:w-500,l-text,ie-${b64},fs-45,co-FFFFFF,bg-00000080,pa-15_350_15_35,r-50,oa-top_right,lx-0,ly-0,l-end`;

    return `https://ik.imagekit.io/${IMAGEKIT_ID}/${transformations}/${imageUrl}`;
}

/**
 * Genera l'URL CDN ImageKit per un poster con badge di testo.
 * Non scarica l'immagine: restituisce direttamente l'URL di ImageKit.
 * Il client (Smart TV, browser) scaricherà l'immagine dalla CDN globale,
 * azzerando il consumo di banda del server YACA.
 *
 * @returns {string|null} URL ImageKit con badge, oppure null se ImageKit non è configurato
 */
function addBadgeToImage(imageUrl, badgeText) {
    const ikUrl = getImageKitUrl(imageUrl, badgeText);

    // Se non abbiamo ImageKitID, restituiamo null (il chiamante farà fallback all'URL originale)
    if (ikUrl === imageUrl) return null;

    return ikUrl;
}

module.exports = { getBlurredImageUrl, addBadgeToImage, getImageKitUrl };
