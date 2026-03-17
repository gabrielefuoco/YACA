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
 * Supporta badge di testo, formato landscape e overlay del logo.
 */
function getImageKitUrl(imageUrl, optionsOrText, imageKitId) {
    const resolvedImageKitId = resolveImageKitId(imageKitId);
    if (
        !resolvedImageKitId ||
        resolvedImageKitId === 'yaca_placeholder' ||
        !imageUrl ||
        typeof imageUrl !== 'string' ||
        imageUrl.length === 0
    ) {
        return imageUrl;
    }

    // Normalizzazione opzioni
    const options = typeof optionsOrText === 'string' 
        ? { text: optionsOrText } 
        : (optionsOrText || {});

    const cleanId = resolvedImageKitId.replace(/\/+$/, '');

    // 1. Base Transformations (Resize & Optimization)
    // Default portrait: 300x450. Landscape: 600x338 (approx 16:9)
    let trParts = options.posterShape === 'landscape' ? ['w-600,h-338'] : ['w-300,h-450'];
    
    // Auto-quality and format optimization
    trParts.push('f-auto,q-80');

    // 2. Logo Overlay
    if (options.addLogo) {
        // Overlay logo_yaca.png from ImageKit media library
        // Positioned at top-left (lx-10, ly-10) with width 80
        trParts.push('l-image,i-logo_yaca.png,w-80,lx-10,ly-10,l-end');
    }

    // 3. Text Badge Overlay (backward compatible)
    if (typeof options.text === 'string' && options.text.length > 0) {
        const b64 = Buffer.from(options.text).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        trParts.push(`l-text,ie-${b64},co-FFFFFF,bg-00000066,pa-10,r-10,lx-N10,ly-10,l-end`);
    }

    const transformations = `tr:${trParts.join(':')}`;

    // Append source URL
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
