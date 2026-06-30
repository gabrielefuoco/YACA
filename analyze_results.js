const fs = require('fs');

try {
    const data = JSON.parse(fs.readFileSync('catalog_state.json', 'utf8'));
    const catalog = data.yaca_preset_preset_anime_simulcast;
    if (!catalog || !catalog.items) {
        console.log("No items found for yaca_preset_preset_anime_simulcast");
        process.exit(1);
    }

    let total = 0;
    let perfectMatch = 0;
    let mismatch = 0;
    let noStreams = 0;
    
    console.log("=== ANALISI CATALOGO SIMULCAST (2 PAGINE) ===\n");

    for (const item of catalog.items) {
        total++;
        const name = item.name;
        const trBadge = item.trBadge || '';
        const expectedEpMatch = trBadge.match(/Ep\s*(\d+)/i) || trBadge.match(/E(\d+)/i);
        const expectedEp = expectedEpMatch ? expectedEpMatch[1] : '?';
        
        const streams = item.streams || [];
        
        if (streams.length === 0 || (streams.length === 1 && streams[0].error)) {
            noStreams++;
            console.log(`[NESSUN STREAM] ${name} (Atteso: ${trBadge})`);
            continue;
        }

        // Analizziamo i titoli dei torrent per trovare riferimenti all'episodio
        // Cerchiamo cose come " - 12 ", " E12 ", " S01E12 ", " 012 "
        const epRegex = new RegExp(`(?:E|Ep| - )0?${expectedEp}(?:\\D|$)`, 'i');
        
        let foundMatch = false;
        let sampleTitle = '';

        for (const s of streams) {
            if (s.title) {
                if (!sampleTitle) sampleTitle = s.title.split('\n')[0].substring(0, 50) + '...';
                if (epRegex.test(s.title)) {
                    foundMatch = true;
                    break;
                }
            }
        }

        if (foundMatch) {
            perfectMatch++;
            console.log(`[OK] ${name.substring(0,30).padEnd(30)} | Badge: ${trBadge.padEnd(8)} | Torrent: MATCH (${sampleTitle})`);
        } else {
            mismatch++;
            console.log(`[MISMATCH] ${name.substring(0,30).padEnd(30)} | Badge: ${trBadge.padEnd(8)} | Torrent: NON TROVATO (Esempio: ${sampleTitle})`);
        }
    }

    console.log("\n=== RIASSUNTO ===");
    console.log(`Totale Analizzati: ${total}`);
    console.log(`Match Perfetti (Badge = Torrent): ${perfectMatch}`);
    console.log(`Mismatch o Dubbi: ${mismatch}`);
    console.log(`Nessun Torrent Trovato: ${noStreams}`);

} catch (e) {
    console.error("Errore durante l'analisi:", e.message);
}
