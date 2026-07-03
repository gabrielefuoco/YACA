const sharp = require('sharp');
const axios = require('axios');
const url = 'https://easyratingsdb.com/Tk-0a06cc663523d0c0c78a5ae9539b8da161e6222e59750287/poster/tmdb:movie:50531.jpg';

axios.get(url, { responseType: 'arraybuffer' }).then(async res => {
    try {
        const badgeWidth = 100;
        const badgeHeight = 50;
        const rx = 25;
        const svgContent = '<text x="50" y="25">ITA</text>';
        const svg = `<svg width="${badgeWidth}" height="${badgeHeight}" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="${badgeWidth - 1}" height="${badgeHeight - 1}" rx="${rx}" fill="red" /><g>${svgContent}</g></svg>`;
        const composites = [{
            input: Buffer.from(svg),
            top: 24,
            left: 16
        }];
        const out = await sharp(Buffer.from(res.data)).composite(composites).jpeg().toBuffer();
        console.log('Success, out size:', out.length);
    } catch(err) {
        console.error('Sharp error:', err);
    }
});
