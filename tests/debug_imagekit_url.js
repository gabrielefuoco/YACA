const { getImageKitUrl } = require('../src/utils/imageProcessor');

const logoUrl = 'https://image.tmdb.org/t/p/w500/7Uqhv24pGJs4Ns31NoOPWFJGWNG.png';
const posterUrl = 'https://image.tmdb.org/t/p/w500/pB8BM79vS6vMvP9I0O67N3nrJ3i.jpg';

const fs = require('fs');

function getB64(url) {
    return Buffer.from(url).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

const logoB64 = getB64(logoUrl);

function testSyntax(name, logoPart) {
    const logoTransform = `l-image,${logoPart},w-200,lfo-bottom_left,lx-10,ly-10,l-end`;
    const transformations = `tr:w-600,h-338:f-auto,q-80:${logoTransform}`;
    const cleanSource = posterUrl.replace('https://', '').replace(/^\/+/, '');
    const finalUrl = `https://ik.imagekit.io/test_id/${transformations}/${cleanSource}`;
    console.log(`${name}: ${finalUrl}`);
    return finalUrl;
}

testSyntax('Current (Colon)', `i-base64:${logoB64}`);
testSyntax('Comma', `i-base64,${logoB64}`);
testSyntax('IE Param', `ie-${logoB64}`);

// Prova anche senza base64-url mapping (standard b64 encoded URL might fail if it has /)
const standardB64 = Buffer.from(logoUrl).toString('base64');
testSyntax('Standard B64 Comma', `i-base64,${standardB64}`);

