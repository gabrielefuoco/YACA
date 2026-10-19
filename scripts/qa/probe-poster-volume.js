#!/usr/bin/env node
/**
 * scripts/qa/probe-poster-volume.js
 *
 * Sonda QA per il contratto sul volume poster e la verifica del caso silenzioso (Ticket 57).
 *
 * Dimostra:
 *   (a) Il volume dichiara la sua versione tramite `versioni.json` (disegno + convenzione),
 *       scritta dal produttore e verificata dall'app tramite `GET /erdb-poster/health`.
 *   (b) I poster validi presenti nel volume continuano a essere serviti normalmente (stessi byte, status 200).
 *   (c) Il caso silenzioso (il client o l'app chiede un poster il cui nome non corrisponde a nessun file
 *       nel volume) OGGI non produce più un silenzio invisibile, ma viene osservato e registrato:
 *       - contatore `mancanti` incrementato in memoria
 *       - evento anomalo archiviato negli `ultimiMancanti`
 *       - log strutturato `[StaticPosters] ANOMALIA: poster richiesto non presente nel volume`
 *       - stato osservabile via `GET /erdb-poster/health`
 *   (d) Dimostrazione di veridicità (Decisione 34): se la verifica viene disabilitata
 *       (flag `--disable-verification`, patchando l'observer dall'esterno), la sonda fallisce (exit 1)
 *       dimostrando che senza la verifica il sistema tornerebbe a tacere (0 errori, 0 anomalie registrate).
 *
 * Utilizzo:
 *   node scripts/qa/probe-poster-volume.js                          -> SUCCESSO (exit code 0)
 *   node scripts/qa/probe-poster-volume.js --disable-verification   -> FALLIMENTO DIMOSTRATIVO (exit code 1)
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const registerStaticPostersRoute = require('../../src/api/staticPosters');
const {
    scriviVersioniVolume,
    leggiVersioniVolume,
    getStatoVolume,
    getStatistichePoster,
    azzeraStatistichePoster,
    volumeObserver,
    VERSIONI_FILE_NAME
} = require('../../src/posters/volumeContract');
const { BADGE_IMG_VERSION } = require('../../src/stremio/formatters/posterBadgeVersion');

const JPEG_SAMPLE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x01, 0x99]);

async function runProbe() {
    const disableVerification = process.argv.includes('--disable-verification');

    console.log('=======================================================');
    console.log('[SONDA QA] Contratto Volume Poster & Verifica Caso Silenzioso (Ticket 57)');
    console.log(`Modalità: ${disableVerification ? 'DIMOSTRAZIONE FALLIMENTO (Verifica Disattivata)' : 'VERIFICA NORMALE (Verifica Attiva)'}`);
    console.log('=======================================================');

    const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-qa-poster-vol-' + Date.now()));
    const previousEnv = process.env.ERDB_CACHE_DIR;
    process.env.ERDB_CACHE_DIR = probeDir;

    const capturedLogs = [];
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    console.log = (...args) => {
        capturedLogs.push({ level: 'log', text: args.join(' ') });
        origLog(...args);
    };
    console.warn = (...args) => {
        capturedLogs.push({ level: 'warn', text: args.join(' ') });
        origWarn(...args);
    };
    console.error = (...args) => {
        capturedLogs.push({ level: 'error', text: args.join(' ') });
        origError(...args);
    };

    let server;
    let baseUrl;

    try {
        // -----------------------------------------------------------------
        // (a) Setup del volume con versione dichiarata
        // -----------------------------------------------------------------
        console.log('\n--- (a) Materializzazione del volume con versione dichiarata (versioni.json) ---');
        await scriviVersioniVolume(probeDir, { produttore: 'erdb-builder-offline' });
        const vInfo = leggiVersioniVolume(probeDir);
        console.log(`[Probe] File ${VERSIONI_FILE_NAME} presente: ${vInfo.presente}, valido: ${vInfo.valido}, disegno: ${vInfo.versioni?.disegno}`);

        // Inizializza server Express
        azzeraStatistichePoster();
        const app = express();
        registerStaticPostersRoute(app);
        server = await new Promise((resolve) => {
            const s = app.listen(0, '127.0.0.1', () => resolve(s));
        });
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        console.log(`[Probe] Server HTTP attivo su ${baseUrl}`);

        const request = (urlPath) => new Promise((resolve, reject) => {
            http.get(`${baseUrl}${urlPath}`, (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks),
                    json: () => {
                        try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
                        catch { return null; }
                    }
                }));
            }).on('error', reject);
        });

        // Verifica endpoint di salute iniziale
        const healthRes = await request('/erdb-poster/health');
        const healthData = healthRes.json();
        console.log(`[Probe] /erdb-poster/health status: ${healthRes.status}, ok: ${healthData?.ok}, contratto: ${healthData?.contratto}`);
        if (healthRes.status !== 200 || !healthData?.ok) {
            throw new Error(`Health check iniziale fallito: ${JSON.stringify(healthData)}`);
        }

        // -----------------------------------------------------------------
        // (b) Servizio di un poster presente nel volume (nessuna alterazione)
        // -----------------------------------------------------------------
        console.log('\n--- (b) Servire un file presente nel volume (invarianza) ---');
        const realPosterName = 'tmdb-movie-27205-460b8042_ITA.jpg';
        fs.writeFileSync(path.join(probeDir, realPosterName), JPEG_SAMPLE);

        const realRes = await request(`/erdb-poster/${realPosterName}`);
        const realStats = getStatistichePoster();
        console.log(`[Probe] Richiesta "${realPosterName}": HTTP ${realRes.status}, trovati: ${realStats.trovati}, mancanti: ${realStats.mancanti}`);
        if (realRes.status !== 200 || !realRes.body.equals(JPEG_SAMPLE)) {
            throw new Error('Il file presente non è stato servito con gli stessi byte originari!');
        }

        // -----------------------------------------------------------------
        // (c) Richiesta di un poster con nome inventato / assente nel volume
        // -----------------------------------------------------------------
        console.log('\n--- (c) Caso critico: richiesta di un nome che non corrisponde a nessun file ---');
        const ghostPoster = 'tmdb-movie-9999999-deadbeef_ITA.jpg';
        const fallbackUrl = 'https://image.tmdb.org/t/p/w500/fallback-sample.jpg';

        // Decisione 34: se la sonda è lanciata con --disable-verification,
        // disabilitiamo l'observer DALLA SONDA tramite patch dell'istanza.
        if (disableVerification) {
            volumeObserver.registraRichiesta = () => ({ registrato: false, trovato: false });
            console.log('[Probe] Observer disabilitato tramite patch esterna della sonda.');
        }

        capturedLogs.length = 0;
        const ghostRes = await request(`/erdb-poster/${ghostPoster}?fallback=${encodeURIComponent(fallbackUrl)}`);
        console.log(`[Probe] Richiesta "${ghostPoster}": HTTP ${ghostRes.status} (redirect verso fallback: ${ghostRes.headers.location})`);

        const statsAfter = getStatistichePoster();
        const sawAnomalyLog = capturedLogs.some((l) =>
            l.level === 'warn' && l.text.includes(`ANOMALIA: poster richiesto non presente nel volume: ${ghostPoster}`)
        );

        console.log(`[Probe] Statistiche post-richiesta: mancanti=${statsAfter.mancanti}, logANOMALIA=${sawAnomalyLog ? 'EMESSO' : 'NON EMESSO'}`);

        // -----------------------------------------------------------------
        // (d) Valutazione dell'esito in base alla modalità
        // -----------------------------------------------------------------
        if (disableVerification) {
            // In modalità fallimento dimostrativo:
            // Senza la nostra verifica, mancanti è 0 e nessun warning è emesso -> silenzio totale.
            const silentBreakage = (statsAfter.mancanti === 0 && !sawAnomalyLog);
            if (!silentBreakage) {
                throw new Error('[ANOMALIA] La verifica era disabilitata ma il sistema ha comunque registrato l\'anomalia!');
            }

            console.log('\n=======================================================');
            console.log('[Probe] ANOMALIA DIMOSTRATA CON SUCCESSO:');
            console.log(`  - Con verifica disabilitata, la richiesta di "${ghostPoster}" è passata in totale silenzio.`);
            console.log('  - Mancanti contati: 0');
            console.log('  - Nessun log di anomalia emesso.');
            console.log('  - Il volume non conteneva ciò che il nome prometteva, e nessuno se ne è accorto.');
            console.log('Esito Sonda: FALLIMENTO DIMOSTRATIVO ACCERTATO (exit code 1)');
            console.log('=======================================================');
            process.exit(1);
        }

        // Modalità normale (Verifica Attiva):
        if (statsAfter.mancanti !== 1) {
            throw new Error(`Attesa anomalia conteggiata mancanti=1, trovati invece ${statsAfter.mancanti}`);
        }
        if (!sawAnomalyLog) {
            throw new Error('Manca il log obbligatorio "[StaticPosters] ANOMALIA: poster richiesto non presente nel volume"');
        }
        if (statsAfter.ultimiMancanti.length === 0 || statsAfter.ultimiMancanti[0].fileName !== ghostPoster) {
            throw new Error(`ultimiMancanti non contiene il file anomalo atteso: ${JSON.stringify(statsAfter.ultimiMancanti)}`);
        }

        // Verifica che anche l'endpoint health esponga l'anomalia
        const healthAfterRes = await request('/erdb-poster/health');
        const healthAfterData = healthAfterRes.json();
        console.log(`[Probe] /erdb-poster/health dopo miss: mancanti=${healthAfterData.statistiche?.mancanti}`);
        if (healthAfterData.statistiche?.mancanti !== 1) {
            throw new Error('L\'endpoint /erdb-poster/health non riporta i mancanti aggiornati!');
        }

        console.log('\n=======================================================');
        console.log('[Probe] SUCCESSO:');
        console.log(`  - Il nome richiesto che non corrisponde a nessun file (${ghostPoster}) è stato rilevato.`);
        console.log(`  - Log strutturato emesso e intercettato.`);
        console.log(`  - Contatore anomalie incrementato a ${statsAfter.mancanti}.`);
        console.log(`  - File registrato in ultimiMancanti.`);
        console.log(`  - Endpoint /erdb-poster/health allineato.`);
        console.log('Esito Sonda: SUCCESSO (exit code 0)');
        console.log('=======================================================');
        process.exit(0);

    } finally {
        console.log = origLog;
        console.warn = origWarn;
        console.error = origError;

        if (server) {
            await new Promise((r) => server.close(r));
        }
        if (previousEnv === undefined) {
            delete process.env.ERDB_CACHE_DIR;
        } else {
            process.env.ERDB_CACHE_DIR = previousEnv;
        }
        if (probeDir && fs.existsSync(probeDir)) {
            try {
                fs.rmSync(probeDir, { recursive: true, force: true });
            } catch (_) {}
        }
    }
}

runProbe()
    .catch((err) => {
        console.error('\n[Probe] ERRORE durante l\'esecuzione della sonda:', err.message);
        process.exit(1);
    });
