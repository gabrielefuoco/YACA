const DEFAULT_IMAGEKIT_ID = process.env.IMAGEKIT_ID || 'yaca_placeholder';

function resolveImageKitId(imageKitId) {
    return imageKitId || DEFAULT_IMAGEKIT_ID;
}

/**
 * Genera un URL di sfocatura delegando a wsrv.nl (proxy esterno gratuito).
 */
function getBlurredImageUrl(imageUrl) {
    return `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&blur=20`;
}

/**
 * Costruisce un URL ImageKit stateless per un poster remoto.
 * Il poster sorgente viene codificato nell'URL e ImageKit applica resize/ottimizzazione.
 * Se è presente un badge, viene aggiunta anche la trasformazione del testo.
 */
function getImageKitUrl(imageUrl, text, imageKitId) {
    const resolvedImageKitId = resolveImageKitId(imageKitId);
    if (
        !resolvedImageKitId ||
        resolvedImageKitId === 'yaca_placeholder' ||
        typeof imageUrl !== 'string' ||
        imageUrl.length === 0
    ) {
        return imageUrl;
    }

    const encodedSource = encodeURIComponent(Buffer.from(imageUrl).toString('base64'));
    const hasBadgeText = typeof text === 'string' && text.length > 0;
    const transformations = hasBadgeText
        ? `tr=w-300,h-450,l-text,ie-${Buffer.from(text).toString('base64').replace(/=/g, '%3D')},co-FFFFFF,bg-000000,pa-10,br-10`
        : 'tr=w-300,h-450';
    return `https://ik.imagekit.io/${resolvedImageKitId}/${encodedSource}?${transformations}`;
}

/**
 * Genera l'URL CDN ImageKit per un poster con badge di testo.
 * Non scarica l'immagine: restituisce direttamente l'URL di ImageKit.
 * Il client (Smart TV, browser) scaricherà l'immagine dalla CDN globale,
 * azzerando il consumo di banda del server YACA.
 *
 * @returns {string|null} URL ImageKit con badge, oppure null se il badge non è valido o ImageKit non è configurato
 */
function addBadgeToImage(imageUrl, badgeText, imageKitId) {
    if (typeof badgeText !== 'string' || badgeText.length === 0) return null;

    const ikUrl = getImageKitUrl(imageUrl, badgeText, imageKitId);

    // Se non abbiamo ImageKitID, restituiamo null (il chiamante farà fallback all'URL originale)
    if (ikUrl === imageUrl) return null;

    return ikUrl;
}

module.exports = { getBlurredImageUrl, addBadgeToImage, getImageKitUrl };
