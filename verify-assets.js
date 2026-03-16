const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 7000;
const BASE_URL = `http://localhost:${PORT}`;

const tests = [
    { name: 'Root Manifest', path: '/manifest.json', expectedType: 'application/json' },
    { name: 'Logo Asset', path: '/logo_yaca.png', expectedType: 'image/png' },
    { name: 'Flame Asset', path: '/fiamma_yaca.png', expectedType: 'image/png' }
];

async function runTests() {
    console.log(`\n🔍 Avvio Diagnostica YACA su ${BASE_URL}\n`);

    for (const test of tests) {
        try {
            const url = `${BASE_URL}${test.path}`;
            console.log(`Testing ${test.name}: ${url}`);
            
            const res = await new Promise((resolve, reject) => {
                const req = http.request(url, { method: 'GET' }, (res) => {
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, data }));
                });
                req.on('error', reject);
                req.end();
            });

            console.log(`  - Status: ${res.statusCode}`);
            console.log(`  - Content-Type: ${res.headers['content-type']}`);
            console.log(`  - CORS (Access-Control-Allow-Origin): ${res.headers['access-control-allow-origin'] || 'MISSING'}`);

            if (res.statusCode !== 200) {
                console.error(`  ❌ ERRORE: Status non è 200!`);
            }

            if (res.headers['content-type'] && !res.headers['content-type'].includes(test.expectedType)) {
                console.error(`  ❌ ERRORE MIME TYPE: Mi aspettavo ${test.expectedType}, ricevuto ${res.headers['content-type']}`);
                if (res.data.includes('<!DOCTYPE html>')) {
                    console.error(`     Il server ha risposto con HTML invece del file! Shadowing rilevato.`);
                }
            }

        } catch (err) {
            console.error(`  ❌ ERRORE CRITICO: Impossibile connettersi a ${test.path}. Il server è acceso?`);
            console.error(`     Dettagli: ${err.message}`);
        }
        console.log('-----------------------------------');
    }
}

console.log('Verifica file locali...');
const localFiles = [
    'public/logo_yaca.png',
    'public/fiamma_yaca.png',
    'frontend/out/logo_yaca.png',
    'frontend/out/fiamma_yaca.png'
];

localFiles.forEach(f => {
    const p = path.join(__dirname, f);
    if (fs.existsSync(p)) {
        const stats = fs.statSync(p);
        console.log(`✅ [File OK] ${f} (${stats.size} bytes)`);
    } else {
        console.error(`❌ [File MANCANTE] ${f}`);
    }
});

runTests();
