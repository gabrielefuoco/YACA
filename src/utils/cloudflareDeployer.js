const axios = require('axios');
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

        // 1. Carica lo script
        console.log(`[CF-Deployer] Eseguo l'upload del worker '${scriptName}'...`);
        const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`;
        await axios.put(uploadUrl, scriptContent, { headers });

        // 2. Abilita l'accesso su .workers.dev
        console.log(`[CF-Deployer] Abilito il routing su .workers.dev...`);
        const enableDevUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`;
        await axios.post(enableDevUrl, { enabled: true }, { 
            headers: { ...headers, 'Content-Type': 'application/json' } 
        });

        // 3. Scopri il dominio .workers.dev dell'utente
        console.log(`[CF-Deployer] Recupero il sottodominio dell'account...`);
        const subdomainUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`;
        const subRes = await axios.get(subdomainUrl, { headers });
        const subdomain = subRes.data?.result?.subdomain;

        if (!subdomain) {
            throw new Error('Impossibile recuperare il sottodominio .workers.dev');
        }

        const finalUrl = `https://${scriptName}.${subdomain}.workers.dev`;
        console.log(`[CF-Deployer] ✅ Deploy completato con successo! URL: ${finalUrl}`);
        
        return finalUrl;
    } catch (error) {
        console.error('[CF-Deployer] ❌ Errore durante il deploy automatico:', error.response?.data || error.message);
        return null;
    }
}

module.exports = { deployCloudflareWorker };
