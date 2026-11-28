/**
 * Il daemon non apre mai il database vivo.
 *
 * DuckDB ammette **un solo processo** con il file aperto in scrittura. L'app lo tiene aperto per
 * servire i cataloghi; il daemon lo apriva all'avvio `per essere pronto`, e da lì nasceva il lock
 * conteso (`Conflicting lock is held`, tre tentativi da due secondi) che al riavvio lasciava l'app
 * senza indice per un'ora.
 *
 * La regola ora è: il daemon scrive solo su staging (`rebuildAndSwap`) e scambia i file; l'unico
 * momento in cui i due processi si toccano è il `rename`, che è atomico. Questo test la difende
 * leggendo il sorgente: un `indice.init()` reintrodotto qui è un ritorno del difetto.
 */
const fs = require('fs');
const path = require('path');

const radice = path.join(__dirname, '..');
const leggi = (rel) => fs.readFileSync(path.join(radice, rel), 'utf8');

describe('il daemon lavora su staging, non sul database vivo', () => {
    it('non apre né chiude l\'indice (lo fa solo l\'app)', () => {
        const sorgente = leggi('services/tmdb-daemon/tmdbDumpDaemon.js');
        expect(sorgente).not.toMatch(/indice\.init\s*\(/);
        expect(sorgente).not.toMatch(/indice\.close\s*\(/);
    });

    it('ricostruisce con rebuildAndSwap (staging + swap)', () => {
        const sorgente = leggi('services/tmdb-daemon/tmdbDumpDaemon.js');
        expect(sorgente).toMatch(/indice\.rebuildAndSwap\s*\(/);
    });
});

describe('il Tier 2 non scrive più un parquet che nessuno legge', () => {
    it('niente artefatto tier2_titles.parquet nel codice', () => {
        const sorgente = leggi('src/indice/tier2.js');
        // La stringa può restare solo in un commento che spiega perché non c'è più.
        const righeDiCodice = sorgente
            .split('\n')
            .filter(r => r.includes('tier2_titles.parquet') && !r.trim().startsWith('//') && !r.trim().startsWith('*'));
        expect(righeDiCodice).toEqual([]);
    });
});
