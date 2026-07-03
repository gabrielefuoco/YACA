const sharp = require('sharp');
const axios = require('axios');

const badgeText = 'ITA';
const textToSVG = null;

const createBadgeSvg = (text, isTopLeft) => {
    const textLen = text.length;
    const fontSize = 30; // +15% from 26
    const badgeWidth = Math.max(isTopLeft ? 80 : 115, Math.round(textLen * 17.5 + 42)); // +15% proportional
    const badgeHeight = 50; // +15% from 44
    const rx = Math.round(badgeHeight / 2);

    let svgContent = '';
    const xmlEscapedBadgeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    svgContent = `<text x="${badgeWidth / 2}" y="${badgeHeight / 2}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${xmlEscapedBadgeText}</text>`;
    
    return {
        width: badgeWidth,
        height: badgeHeight,
        rx: rx,
        content: svgContent
    };
};

const buildSvg = (badgeData) => `<svg width="${badgeData.width}" height="${badgeData.height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="apple-glass-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.12" />
            <stop offset="100%" stop-color="#ffffff" stop-opacity="0.04" />
        </linearGradient>
        <linearGradient id="apple-glass-border" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.25" />
            <stop offset="100%" stop-color="#ffffff" stop-opacity="0.10" />
        </linearGradient>
        <filter id="apple-glass-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.8" />
            <feOffset dx="0" dy="3.2" result="offsetblur" />
            <feFlood flood-color="#000000" flood-opacity="0.54" result="glowcolor" />
            <feComposite in="glowcolor" in2="offsetblur" operator="in" result="glow" />
            <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
            </feMerge>
        </filter>
        <filter id="text-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.8" result="blur" />
            <feOffset dx="0" dy="1.2" in="blur" result="offsetBlur" />
            <feComponentTransfer in="offsetBlur" result="shadow">
                <feFuncA type="linear" slope="0.85" />
            </feComponentTransfer>
            <feMerge>
                <feMergeNode in="shadow" />
                <feMergeNode in="SourceGraphic" />
            </feMerge>
        </filter>
    </defs>
    <rect x="0.5" y="0.5" width="${badgeData.width - 1}" height="${badgeHeight - 1}" rx="${badgeData.rx}" fill="url(#apple-glass-fill)" filter="url(#apple-glass-shadow)" />
    <rect x="0.5" y="0.5" width="${badgeData.width - 1}" height="${badgeHeight - 1}" rx="${badgeData.rx}" fill="none" stroke="url(#apple-glass-border)" stroke-width="1" />
    <g filter="url(#text-shadow)">
        ${badgeData.content}
    </g>
</svg>`;

axios.get('https://easyratingsdb.com/Tk-0a06cc663523d0c0c78a5ae9539b8da161e6222e59750287/poster/tmdb:movie:50531.jpg', { responseType: 'arraybuffer' }).then(async res => {
    try {
        const rightBadge = createBadgeSvg(badgeText, false);
        const W = 342;
        const badgeLeft = Math.max(0, W - rightBadge.width - 16);
        const composites = [{
            input: Buffer.from(buildSvg(rightBadge)),
            top: 24,
            left: badgeLeft
        }];
        const out = await sharp(Buffer.from(res.data)).composite(composites).jpeg({ quality: 90 }).toBuffer();
        console.log('Success, out size:', out.length);
    } catch(err) {
        console.error('Sharp error:', err);
    }
});
