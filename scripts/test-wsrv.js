require('dotenv').config();
const axios = require('axios');

async function testCFDomain() {
    const cfUrl = 'https://d3gtl9l2a4fn1j.cloudfront.net/t/p/w500/8066vW266AOfI7vY5LpIezmP76U.jpg';
    console.log(`Testing CF: ${cfUrl}`);

    try {
        const res = await axios.get(cfUrl, { timeout: 10000 });
        console.log(`--- SUCCESS! ---`);
        console.log(`Status: ${res.status}`);
    } catch (e) {
        console.log(`--- FAILED ---`);
        console.log(`Error: ${e.message} (Status: ${e.response?.status})`);
    }
}

testCFDomain();
