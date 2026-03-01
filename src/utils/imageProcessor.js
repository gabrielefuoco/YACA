const sharp = require('sharp');
const axios = require('axios');
const LRUCache = require('./LRUCache');

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB limite massimo per immagini scaricate
const imageCache = new LRUCache({ max: 100 });

/**
 * Genera un URL di sfocatura delegando a wsrv.nl (proxy esterno gratuito).
 * Non scarica né elabora l'immagine in locale.
 */
function getBlurredImageUrl(imageUrl) {
    return `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&blur=20`;
}

/**
 * Scarica un poster e aggiunge un badge con testo (es. numero episodio) in sovraimpressione.
 * Usa una cache LRU per proteggere la RAM (max 100 immagini).
 */
async function addBadgeToImage(imageUrl, badgeText) {
    const cacheKey = `${imageUrl}:${badgeText}`;
    const cached = imageCache.get(cacheKey);
    if (cached) return cached;

    try {
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
            maxContentLength: MAX_IMAGE_SIZE
        });

        const imageBuffer = Buffer.from(response.data);
        const metadata = await sharp(imageBuffer).metadata();
        const width = metadata.width || 500;
        const height = metadata.height || 750;

        const badgeW = Math.round(width * 0.28);
        const badgeH = Math.round(badgeW * 0.6);
        const fontSize = Math.round(badgeH * 0.55);
        const radius = Math.round(badgeH * 0.2);
        const margin = Math.round(width * 0.04);

        const svgOverlay = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
            <rect x="${width - badgeW - margin}" y="${margin}"
                  width="${badgeW}" height="${badgeH}"
                  rx="${radius}"
                  fill="rgba(0,0,0,0.75)" stroke="white" stroke-width="2"/>
            <text x="${width - badgeW / 2 - margin}" y="${margin + badgeH / 2 + fontSize / 3}"
                  font-size="${fontSize}" font-weight="bold" fill="white"
                  text-anchor="middle" font-family="Arial, sans-serif">${badgeText}</text>
        </svg>`;

        const result = await sharp(imageBuffer)
            .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
            .jpeg({ quality: 85 })
            .toBuffer();

        if (result) imageCache.set(cacheKey, result);
        return result;
    } catch (error) {
        console.error('Error adding badge to image:', error.message);
        return null;
    }
}

module.exports = { getBlurredImageUrl, addBadgeToImage };
