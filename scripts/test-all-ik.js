require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const IMAGEKIT_ID = process.env.IMAGEKIT_ID;
const ENDPOINT_URL = `https://ik.imagekit.io/${IMAGEKIT_ID}`;

function testPattern(name, transformations, imageUrl, useQuery = false) {
    const url = useQuery
        ? `${ENDPOINT_URL}/${imageUrl}?tr=${transformations}`
        : `${ENDPOINT_URL}/${transformations}/${imageUrl}`;

    return { name, url };
}

async function runTests() {
    const tmdbUrl = 'https://image.tmdb.org/t/p/w500/8066vW266AOfI7vY5LpIezmP76U.jpg';
    const text = "S1 E1";
    const encodedText = encodeURIComponent(Buffer.from(text).toString('base64')).replace(/=/g, '%3D');

    const patterns = [
        // 1. Direct from guide (co instead of fc)
        testPattern("Guide Path", `tr:l-text,ie-${encodedText},fs-40,co-FFFFFF,bg-00000080,pa-20,r-max,lfo-top_right,l-end`, tmdbUrl),
        // 2. Query param style
        testPattern("Guide Query", `l-text,ie-${encodedText},fs-40,co-FFFFFF,bg-00000080,pa-20,r-max,lfo-top_right,l-end`, tmdbUrl, true),
        // 3. Super minimal l-text
        testPattern("Minimal l-text", `tr:l-text,i-S1E1,l-end`, tmdbUrl),
        // 4. Old ot- syntax (just to see if it still works)
        testPattern("Old ot- sync", `tr:ot-S1E1,otc-FFFFFF`, tmdbUrl)
    ];

    for (const p of patterns) {
        console.log(`\n--- Testing Pattern: ${p.name} ---`);
        console.log(`URL: ${p.url}`);
        try {
            const res = await axios.get(p.url, { timeout: 8000 });
            console.log(`  SUCCESS! Status: ${res.status}`);
        } catch (e) {
            console.log(`  FAILED: ${e.message} (Status: ${e.response?.status})`);
            if (e.response && e.response.headers['ik-error']) {
                console.log(`  IK-ERROR: ${e.response.headers['ik-error']}`);
            }
        }
    }
}

runTests();
