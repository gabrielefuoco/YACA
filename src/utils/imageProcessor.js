const sharp = require('sharp');
const axios = require('axios');

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB limite massimo per immagini scaricate

async function blurImage(imageUrl) {
    try {
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
            maxContentLength: MAX_IMAGE_SIZE
        });

        const processedImageBuffer = await sharp(response.data)
            .blur(20)
            .toBuffer();

        return processedImageBuffer;
    } catch (error) {
        console.error('Error processing image:', error.message);
        return null;
    }
}

/**
 * Scarica un poster e aggiunge un badge con testo (es. numero episodio) in sovraimpressione.
 */
async function addBadgeToImage(imageUrl, badgeText) {
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
        <svg width="${width}" height="${height}">
            <rect x="${width - badgeW - margin}" y="${margin}"
                  width="${badgeW}" height="${badgeH}"
                  rx="${radius}"
                  fill="rgba(0,0,0,0.75)" stroke="white" stroke-width="2"/>
            <text x="${width - badgeW / 2 - margin}" y="${margin + badgeH / 2 + fontSize / 3}"
                  font-size="${fontSize}" font-weight="bold" fill="white"
                  text-anchor="middle" font-family="Arial, sans-serif">${badgeText}</text>
        </svg>`;

        return sharp(imageBuffer)
            .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
            .jpeg({ quality: 85 })
            .toBuffer();
    } catch (error) {
        console.error('Error adding badge to image:', error.message);
        return null;
    }
}

module.exports = { blurImage, addBadgeToImage };
