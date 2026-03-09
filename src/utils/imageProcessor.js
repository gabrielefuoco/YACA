const IMAGEKIT_ID = process.env.IMAGEKIT_ID || 'yaca_placeholder';

/**
 * Genera un URL di sfocatura delegando a wsrv.nl (proxy esterno gratuito).
 */
function getBlurredImageUrl(imageUrl) {
    return `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&blur=20`;
}

/**
 * Costruisce un URL ImageKit stateless per un poster remoto.
 * Il poster sorgente viene codificato nell'URL e il badge è applicato via trasformazioni CDN.
 */
function getImageKitUrl(imageUrl, text) {
    if (!IMAGEKIT_ID || IMAGEKIT_ID === 'yaca_placeholder' || !imageUrl || !text) {
        return imageUrl;
    }

    const encodedSource = encodeURIComponent(Buffer.from(imageUrl).toString('base64'));
    const encodedText = Buffer.from(text).toString('base64').replace(/=/g, '%3D');
    const transformations = `tr=l-text,ie-${encodedText},co-FFFFFF,bg-000000,pa-10,br-10`;
    return `https://ik.imagekit.io/${IMAGEKIT_ID}/${encodedSource}?${transformations}`;
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
