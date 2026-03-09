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

    const cleanId = resolvedImageKitId.replace(/\/+$/, '');

    let transformations = 'tr:w-300,h-450';
    if (typeof text === 'string' && text.length > 0) {
        // Use URL-safe Base64 for the text overlay content
        const b64 = Buffer.from(text).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        // Using r instead of radius, and manual positioning (lx-N10 = 10px from right)
        // Mandatory l-end to close the layer correctly
        // bg-00000066 = Black with 40% transparency (Balanced Look)
        transformations += `,l-text,ie-${b64},co-FFFFFF,bg-00000066,pa-10,r-10,lx-N10,ly-10,l-end`;
    }

    // Append source URL as part of the path (as per user's "hooking" description)
    // IMPORTANT for iyr3i5hd3: Use the full protocol (https://) without replacement.
    const cleanSource = imageUrl.replace(/^\/+/, '');
    return `https://ik.imagekit.io/${cleanId}/${transformations}/${cleanSource}`;
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
