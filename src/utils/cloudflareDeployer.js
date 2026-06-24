const { createAxiosInstance } = require('./httpClient');
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
            'Content-Type': 'application/javascript'
        };

        const client = createAxiosInstance(undefined, { timeout: 30000 }); // timeout più lungo per deploy
        const maxRetries = 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // 1. Carica lo script
                console.log(`[CF-Deployer] Eseguo l'upload del worker '${scriptName}' (tentativo ${attempt}/${maxRetries})...`);
                const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`;
                await client.put(uploadUrl, scriptContent, { headers });

                // 2. Abilita l'accesso su .workers.dev
                console.log(`[CF-Deployer] Abilito il routing su .workers.dev...`);
                const enableDevUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`;
                await client.post(enableDevUrl, { enabled: true }, { 
                    headers: { ...headers, 'Content-Type': 'application/json' } 
                });

                // 3. Scopri il dominio .workers.dev dell'utente
                console.log(`[CF-Deployer] Recupero il sottodominio dell'account...`);
                const subdomainUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`;
                const subRes = await client.get(subdomainUrl, { headers });
                const subdomain = subRes.data?.result?.subdomain;

                if (!subdomain) {
                    throw new Error('Impossibile recuperare il sottodominio .workers.dev');
                }

                const finalUrl = `https://${scriptName}.${subdomain}.workers.dev`;
                console.log(`[CF-Deployer] ✅ Deploy completato con successo! URL: ${finalUrl}`);
                
                return finalUrl;
            } catch (err) {
                if (attempt === maxRetries) {
                    throw err; // Lancia l'errore se abbiamo esaurito i tentativi
                }
                console.warn(`[CF-Deployer] ⚠️ Tentativo ${attempt} fallito, riprovo tra poco: ${err.message}`);
                await new Promise(res => setTimeout(res, 2000)); // Attende 2 secondi prima del riavvio
            }
        }
    } catch (error) {
        console.error('[CF-Deployer] ❌ Errore durante il deploy automatico:', error.response?.data || error.message);
        return null;
    }
}

module.exports = { deployCloudflareWorker };
