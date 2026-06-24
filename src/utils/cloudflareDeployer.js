const fs = require('fs');
const path = require('path');

/**
 * Verifica se il Worker è già raggiungibile con un semplice health-check.
 * @param {string} workerUrl - URL del worker da verificare
 * @returns {Promise<boolean>}
 */
async function isWorkerAlive(workerUrl) {
    try {
        const res = await fetch(workerUrl, { method: 'GET', signal: AbortSignal.timeout(5000) });
        // Il worker risponde 400 con "Missing url parameter" se raggiungibile senza parametri
        return res.status === 400 || res.ok;
    } catch {
        return false;
    }
}

async function deployCloudflareWorker() {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    if (!apiToken || !accountId) {
        return null;
    }

    const scriptName = 'yaca-proxy-worker';

    // ── STEP 0: Prova a recuperare il sottodominio dall'account e verifica se il worker è già online ──
    try {
        console.log('[CF-Deployer] Verifico se il worker è già online...');
        
        // Costruisci l'URL atteso del worker
        // Prima proviamo a scoprire il subdomain via API
        let subdomain = null;
        try {
            const subdomainUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`;
            const subRes = await fetch(subdomainUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Accept': 'application/json'
                },
                signal: AbortSignal.timeout(8000)
            });
            if (subRes.ok) {
                const subData = await subRes.json();
                subdomain = subData?.result?.subdomain;
            }
        } catch {
            // API non raggiungibile - proviamo col subdomain hardcoded dal .env o pattern noto
        }

        // Se non riusciamo a ottenere il subdomain via API, proviamo pattern comuni
        if (!subdomain) {
            // Prova a indovinare il subdomain dall'account ID o da un valore noto
            // Il CF_WORKER_URL potrebbe essere stato salvato in precedenza
            const knownUrls = [
                process.env.CF_WORKER_URL_CACHED, // Se salvato da un deploy precedente
            ].filter(Boolean);

            for (const url of knownUrls) {
                if (await isWorkerAlive(url)) {
                    console.log(`[CF-Deployer] ✅ Worker già online (cached): ${url}`);
                    return url;
                }
            }
        }

        if (subdomain) {
            const expectedUrl = `https://${scriptName}.${subdomain}.workers.dev`;
            if (await isWorkerAlive(expectedUrl)) {
                console.log(`[CF-Deployer] ✅ Worker già online! Skip deploy. URL: ${expectedUrl}`);
                return expectedUrl;
            }
            console.log('[CF-Deployer] Worker non risponde. Procedo con il deploy...');
        } else {
            console.log('[CF-Deployer] Impossibile verificare lo stato del worker. Procedo con il deploy...');
        }
    } catch (e) {
        console.log(`[CF-Deployer] Health-check fallito (${e.message}). Procedo con il deploy...`);
    }

    // ── STEP 1-3: Deploy completo (solo se il worker non è già online) ──
    try {
        const workerScriptPath = path.join(__dirname, '../../cloudflare/worker.js');
        const scriptContent = fs.readFileSync(workerScriptPath, 'utf8');

        const headers = {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/javascript',
            'User-Agent': 'YACA-Deployer/1.0.0',
            'Accept': 'application/json'
        };

        const maxRetries = 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // 1. Carica lo script
                console.log(`[CF-Deployer] Eseguo l'upload del worker '${scriptName}' (tentativo ${attempt}/${maxRetries})...`);
                const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`;
                
                let res = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: headers,
                    body: scriptContent,
                    signal: AbortSignal.timeout(30000)
                });
                
                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(`Upload fallito: ${res.status} ${text}`);
                }

                // 2. Abilita l'accesso su .workers.dev
                console.log(`[CF-Deployer] Abilito il routing su .workers.dev...`);
                const enableDevUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`;
                
                res = await fetch(enableDevUrl, {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled: true }),
                    signal: AbortSignal.timeout(15000)
                });

                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(`Enable subdomain fallito: ${res.status} ${text}`);
                }

                // 3. Scopri il dominio .workers.dev dell'utente
                console.log(`[CF-Deployer] Recupero il sottodominio dell'account...`);
                const subdomainUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`;
                
                res = await fetch(subdomainUrl, {
                    method: 'GET',
                    headers: headers,
                    signal: AbortSignal.timeout(15000)
                });

                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(`Get subdomain fallito: ${res.status} ${text}`);
                }

                const subData = await res.json();
                const subdomain = subData?.result?.subdomain;

                if (!subdomain) {
                    throw new Error('Impossibile recuperare il sottodominio .workers.dev');
                }

                const finalUrl = `https://${scriptName}.${subdomain}.workers.dev`;
                console.log(`[CF-Deployer] ✅ Deploy completato con successo! URL: ${finalUrl}`);
                
                return finalUrl;
            } catch (err) {
                if (attempt === maxRetries) {
                    throw err;
                }
                console.warn(`[CF-Deployer] ⚠️ Tentativo ${attempt} fallito, riprovo tra poco: ${err.message}`);
                await new Promise(res => setTimeout(res, 3000));
            }
        }
    } catch (error) {
        console.error('[CF-Deployer] ❌ Errore durante il deploy automatico:', error.message);
        return null;
    }
}

module.exports = { deployCloudflareWorker };
