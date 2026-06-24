const fs = require('fs');
const path = require('path');

async function deployCloudflareWorker() {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    if (!apiToken || !accountId) {
        return null;
    }

    try {
        console.log('[CF-Deployer] Token Cloudflare rilevato. Inizio auto-deploy del Worker...');
        
        const workerScriptPath = path.join(__dirname, '../../cloudflare/worker.js');
        const scriptContent = fs.readFileSync(workerScriptPath, 'utf8');

        const scriptName = 'yaca-proxy-worker';
        const headers = {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/javascript',
            'User-Agent': 'YACA-Deployer/1.0.0 (https://github.com/gabrielefuoco/YACA)',
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
                    body: scriptContent
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
                    body: JSON.stringify({ enabled: true })
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
                    headers: headers
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
                await new Promise(res => setTimeout(res, 2000));
            }
        }
    } catch (error) {
        console.error('[CF-Deployer] ❌ Errore durante il deploy automatico:', error.message);
        return null;
    }
}

module.exports = { deployCloudflareWorker };
