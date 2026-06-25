const http = require('http');

const data = JSON.stringify({
    id: "yaca_preset_pop_movies",
    type: "movie"
});

const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/catalog/preview-catalog',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
}, (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
        console.log("STATUS:", res.statusCode);
        console.log("RESPONSE:", raw.substring(0, 500));
    });
});
req.on('error', e => console.error(e));
req.write(data);
req.end();
