const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');
const https = require('https');

// Forza IPv4 per bypassare problemi di rete IPv6 su Hugging Face Spaces
const httpsAgent = new https.Agent({ family: 4 });

/**
 * Esegue una richiesta HTTP utilizzando curl (utile per aggirare i blocchi TLS di Cloudflare 
 * contro l'impronta JA3 di Node.js su alcuni datacenter come HuggingFace).
 */
function curlRequest(url, method = 'GET', headers = {}, body = null) {
    try {
        // Aggiungiamo -4 per forzare IPv4 in curl
        let command = `curl -4 -s -X ${method} "${url}"`;
        
        for (const [key, value] of Object.entries(headers)) {
            // Rimuoviamo eventuali doppi apici che spaccherebbero bash
            const safeValue = value.replace(/"/g, '\\"');
            command += ` -H "${key}: ${safeValue}"`;
        }

        if (body) {
            const bodyStr = typeof body === 'object' ? JSON.stringify(body) : body;
            const safeBody = bodyStr.replace(/'/g, "'\\''");
            command += ` -d '${safeBody}'`;
        }

        try {
            const output = execSync(command, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10, stdio: ['pipe', 'pipe', 'pipe'] });
            try {
                return JSON.parse(output);
            } catch {
                return output; // Ritorna stringa se non è JSON
            }
        } catch (execError) {
            console.error(`[CF-Deployer] CURL fallito con exit code ${execError.status}.`);
            console.error(`[CF-Deployer] CURL stderr: ${execError.stderr}`);
            throw new Error(`CURL Error: exit code ${execError.status}`);
        }
    } catch (e) {
        throw new Error(`CURL wrapper fallito: ${e.message}`);
    }
}

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
            const subRes = await axios.get(subdomainUrl, {
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Accept': 'application/json'
                },
                timeout: 8000,
                httpsAgent
            });
            if (subRes.data && subRes.data.success && subRes.data.result) {
                subdomain = subRes.data.result.subdomain;
            }
        } catch (e) {
            console.log(`[CF-Deployer] (Fallback) axios GET subdomain failed: ${e.message}, provo con curl...`);
            try {
                const subdomainUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`;
                const subData = curlRequest(subdomainUrl, 'GET', {
                    'Authorization': `Bearer ${apiToken}`,
                    'Accept': 'application/json'
                });
                if (subData && subData.success && subData.result) {
                    subdomain = subData.result.subdomain;
                }
            } catch (err) {
                // Ignore
            }
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
                
                try {
                    await axios.put(uploadUrl, scriptContent, { headers, timeout: 30000, httpsAgent });
                } catch (e) {
                    console.warn(`[CF-Deployer] Axios PUT fallito (${e.message}), provo con curl...`);
                    const uploadRes = curlRequest(uploadUrl, 'PUT', headers, scriptContent);
                    if (uploadRes && uploadRes.success === false) {
                        throw new Error(`Upload fallito via curl: ${JSON.stringify(uploadRes.errors)}`);
                    }
                }

                // 2. Abilita l'accesso su .workers.dev
                console.log(`[CF-Deployer] Abilito il routing su .workers.dev...`);
                const enableDevUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`;
                
                try {
                    await axios.post(enableDevUrl, { enabled: true }, { 
                        headers: { ...headers, 'Content-Type': 'application/json' },
                        timeout: 15000,
                        httpsAgent
                    });
                } catch (e) {
                    console.warn(`[CF-Deployer] Axios POST fallito (${e.message}), provo con curl...`);
                    const enableRes = curlRequest(enableDevUrl, 'POST', { ...headers, 'Content-Type': 'application/json' }, { enabled: true });
                    if (enableRes && enableRes.success === false) {
                        throw new Error(`Enable subdomain fallito via curl: ${JSON.stringify(enableRes.errors)}`);
                    }
                }

                // 3. Scopri il dominio .workers.dev dell'utente
                console.log(`[CF-Deployer] Recupero il sottodominio dell'account...`);
                const subdomainUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`;
                
                let subdomain = null;
                try {
                    const subRes = await axios.get(subdomainUrl, { headers, timeout: 15000, httpsAgent });
                    subdomain = subRes.data?.result?.subdomain;
                } catch (e) {
                    console.warn(`[CF-Deployer] Axios GET fallito (${e.message}), provo con curl...`);
                    const subData = curlRequest(subdomainUrl, 'GET', headers);
                    if (subData && subData.success === false) {
                        throw new Error(`Get subdomain fallito via curl: ${JSON.stringify(subData.errors)}`);
                    }
                    subdomain = subData?.result?.subdomain;
                }

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
