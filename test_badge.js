const sharp = require('sharp');
const axios = require('axios');
const fs = require('fs');

async function generateBadgeImage(url, badgeText) {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    const baseImageBuffer = Buffer.from(response.data);

    const imgMeta = await sharp(baseImageBuffer).metadata();
    const W = imgMeta.width || 342;
    const H = imgMeta.height || 513;

    const textLen = badgeText.length;
    const fontSize = 24;
    const badgeWidth = Math.max(110, textLen * 14 + 36);
    const badgeHeight = 44;
    const rx = Math.round(badgeHeight / 2);

    const svg = `<svg width="${badgeWidth}" height="${badgeHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${badgeWidth}" height="${badgeHeight}" rx="${rx}" fill="#0f172a"/>
        <rect x="2" y="2" width="${badgeWidth - 4}" height="${badgeHeight - 4}" rx="${rx - 2}" fill="none" stroke="#f59e0b" stroke-width="3"/>
        <text x="${badgeWidth / 2}" y="${badgeHeight / 2}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${badgeText}</text>
    </svg>`;

    const offset = 12;
    const badgeLeft = Math.max(0, W - badgeWidth - offset);
    const badgeTop = offset;

    const buf = await sharp(baseImageBuffer)
        .composite([{
            input: Buffer.from(svg),
            top: badgeTop,
            left: badgeLeft
        }])
        .jpeg({ quality: 90 })
        .toBuffer();
        
    fs.writeFileSync('C:\\Users\\gabri\\APP\\Streaming\\YACA\\test_badge.jpg', buf);
    console.log('Done SVG with Arial');
    
    // Now original SVG (sans-serif)
    const svgOrig = `<svg width="${badgeWidth}" height="${badgeHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${badgeWidth}" height="${badgeHeight}" rx="${rx}" fill="#0f172a"/>
        <rect x="2" y="2" width="${badgeWidth - 4}" height="${badgeHeight - 4}" rx="${rx - 2}" fill="none" stroke="#f59e0b" stroke-width="3"/>
        <text x="${badgeWidth / 2}" y="${badgeHeight / 2}" font-family="sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${badgeText}</text>
    </svg>`;
    const bufOrig = await sharp(baseImageBuffer)
        .composite([{
            input: Buffer.from(svgOrig),
            top: badgeTop,
            left: badgeLeft
        }])
        .jpeg({ quality: 90 })
        .toBuffer();
    fs.writeFileSync('C:\\Users\\gabri\\APP\\Streaming\\YACA\\test_badge_orig.jpg', bufOrig);
}
generateBadgeImage('https://image.tmdb.org/t/p/w500/8kOWDBK6XlPUzckuHDo3wwVRFwt.jpg', 'S 1 Ep 24').catch(console.error);
