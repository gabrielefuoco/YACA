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

module.exports = { blurImage };
