const sharp = require('sharp');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function testBadge() {
    // Using a more reliable image source or creating a placeholder
    const imageUrl = 'https://via.placeholder.com/500x750.jpg?text=Poster+Placeholder';
    const badgeText = 'S3E8';
    const outputPath = path.join(__dirname, 'test-badge-output.jpg');

    console.log(`Downloading image from ${imageUrl}...`);
    try {
        let inputBuffer;
        try {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 5000 });
            inputBuffer = Buffer.from(response.data);
        } catch (e) {
            console.log("Failed to download image, creating a local placeholder instead...");
            inputBuffer = await sharp({
                create: {
                    width: 500,
                    height: 750,
                    channels: 3,
                    background: { r: 100, g: 100, b: 100 }
                }
            }).jpeg().toBuffer();
        }

        console.log(`Applying badge "${badgeText}"...`);

        // Define SVG overlay
        // We use a high-contrast badge in the top-right corner
        const svgBadge = `
            <svg width="500" height="750" xmlns="http://www.w3.org/2000/svg">
                <style>
                    .badge-bg { fill: rgba(0, 0, 0, 0.8); }
                    .badge-text { fill: white; font-family: sans-serif; font-size: 32px; font-weight: bold; }
                </style>
                <rect x="350" y="20" width="130" height="60" rx="12" ry="12" class="badge-bg" />
                <text x="415" y="60" text-anchor="middle" class="badge-text">${badgeText}</text>
            </svg>
        `;

        const outputBuffer = await sharp(inputBuffer)
            .composite([{
                input: Buffer.from(svgBadge),
                top: 0,
                left: 0
            }])
            .jpeg()
            .toBuffer();

        fs.writeFileSync(outputPath, outputBuffer);
        console.log(`Success! Badge image saved to ${outputPath}`);
        console.log(`Final image size: ${outputBuffer.length} bytes`);

        // Final verification of the buffer
        const metadata = await sharp(outputBuffer).metadata();
        console.log(`Verified metadata: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);
    } catch (error) {
        console.error('Error during processing:', error.message);
        console.error(error.stack);
    }
}

testBadge();
