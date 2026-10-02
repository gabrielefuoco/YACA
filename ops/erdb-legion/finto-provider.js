// Interlocutore finto per ERDB: risponde a qualsiasi richiesta dichiarando che non c'e'
// nessuno stream. Serve a NON far ritentare ERDB (4 tentativi per poster, ~2s l'uno) e a
// ottenere esattamente la decisione della mappa: nessun badge di risoluzione, zero torrent.
require('http').createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url.includes('manifest.json')) {
        res.end(JSON.stringify({ id: 'nessuno', version: '1.0.0', name: 'Nessuno stream', resources: ['stream'], types: ['movie', 'series'] }));
    } else {
        res.end('{"streams":[]}');
    }
}).listen(3112, () => console.log('finto provider su 3112'));
