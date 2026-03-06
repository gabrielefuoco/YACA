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
 * Usa le trasformazioni di ImageKit per evitare l'uso di Sharp e RAM locale.
 * Documentazione: https://docs.imagekit.io/features/image-transformations/overlay
 */
function getImageKitUrl(imageUrl, text) {
    if (!IMAGEKIT_ID || IMAGEKIT_ID === 'yaca_placeholder') {
        return imageUrl; // Fallback se non configurato
    }

    // Encoding speciale per ImageKit (testo nell'URL)
    const safeText = encodeURIComponent(text).replace(/,/g, '%2C');

    // Configura i parametri dell'overlay
    // ot: testo, otc: colore bianco, ots: dimensione font, otbg: sfondo nero semitrasparente
    // otp: posizione (top_right), oty/otx: offset
    const transformations = `tr:ot-${safeText},otc-FFFFFF,ots-35,otbg-00000080,otp-top_right,otx-10,oty-10`;

    // ImageKit richiede l'URL originale come parte del path o query
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
