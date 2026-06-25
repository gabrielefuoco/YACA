const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const https = require('https');


async function isWorkerAlive(url) {
    try {
        const res = await axios.get(url, { 
            timeout: 5000,
            headers: { 'Connection': 'close' }
        });
        return res.status === 400 || res.status === 200 || res.status === 404;
    } catch (e) {
        if (e.response && (e.response.status === 400 || e.response.status === 200 || e.response.status === 404)) {
            return true;
        }
        return false;
    }
}

async function getCachedSubdomainFromDB() {
    try {
        // Attendi che la connessione MongoDB sia pronta (max 5 secondi)
        let retries = 5;
        while (mongoose.connection.readyState !== 1 && retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            retries--;
        }
        if (mongoose.connection.readyState === 1) {
            const collection = mongoose.connection.db.collection('system_settings');
            const doc = await collection.findOne({ key: 'cf_subdomain' });
            return doc ? doc.value : null;
        }
    } catch (e) {
        console.log(`[CF-Deployer] Errore lettura sottodominio da DB: ${e.message}`);
    }
    return null;
}

async function saveSubdomainToDB(subdomain) {
    try {
        if (mongoose.connection.readyState === 1) {
            const collection = mongoose.connection.db.collection('system_settings');
            await collection.updateOne(
                { key: 'cf_subdomain' },
                { $set: { value: subdomain, updatedAt: new Date() } },
                { upsert: true }
            );
            console.log(`[CF-Deployer] Sottodominio '${subdomain}' salvato nel database MongoDB.`);
        }
    } catch (e) {
        console.log(`[CF-Deployer] Errore salvataggio sottodominio nel DB: ${e.message}`);
    }
}

async function deployCloudflareWorker() {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    if (!apiToken || !accountId) {
        return null;
    }

    const scriptName = 'yaca-proxy-worker';
    const cacheFilePath = path.join(__dirname, '.cf_worker_url.json');

    // 1. Prova a verificare l'URL da variabile d'ambiente CF_WORKER_SUBDOMAIN
    if (process.env.CF_WORKER_SUBDOMAIN) {
        const envUrl = `https://${scriptName}.${process.env.CF_WORKER_SUBDOMAIN}.workers.dev`;
        console.log(`[CF-Deployer] CF_WORKER_SUBDOMAIN configurato da env. Verifico se è online...`);
        if (await isWorkerAlive(envUrl)) {
            console.log(`[CF-Deployer] ✅ Worker già online (via CF_WORKER_SUBDOMAIN)! Salto il deploy. URL: ${envUrl}`);
            return envUrl;
        }
    }

    // 2. Prova a verificare l'URL salvato in cache locale
    if (fs.existsSync(cacheFilePath)) {
        try {
            const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
            if (cacheData && cacheData.url) {
                console.log(`[CF-Deployer] Trovato URL in cache locale: ${cacheData.url}. Verifico se è online...`);
                if (await isWorkerAlive(cacheData.url)) {
                    console.log(`[CF-Deployer] ✅ Worker già online (cache locale)! Salto il deploy. URL: ${cacheData.url}`);
                    return cacheData.url;
                }
            }
        } catch (e) {
            // ignore
        }
    }

    // 3. Prova a verificare l'URL memorizzato nel database MongoDB
    const dbSubdomain = await getCachedSubdomainFromDB();
    if (dbSubdomain) {
        const dbUrl = `https://${scriptName}.${dbSubdomain}.workers.dev`;
        console.log(`[CF-Deployer] Trovato sottodominio nel database MongoDB: ${dbSubdomain}. Verifico se è online...`);
        if (await isWorkerAlive(dbUrl)) {
            console.log(`[CF-Deployer] ✅ Worker già online (via MongoDB)! Salto il deploy. URL: ${dbUrl}`);
            // Ripristina la cache locale per velocizzare i prossimi riavvii
            try {
                fs.writeFileSync(cacheFilePath, JSON.stringify({ url: dbUrl }), 'utf8');
            } catch (e) {}
            return dbUrl;
        }
    }

    // 4. Se offline o non trovato, prova a recuperare il sottodominio dalle API Cloudflare
    const headers = {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/javascript'
    };

    let subdomain = null;
    try {
        console.log('[CF-Deployer] Recupero il sottodominio via API per verificare lo stato del worker...');
        const subdomainUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`;
        const subRes = await axios.get(subdomainUrl, { headers, timeout: 8000 });
        subdomain = subRes.data?.result?.subdomain;

        if (subdomain) {
            await saveSubdomainToDB(subdomain);
            const expectedUrl = `https://${scriptName}.${subdomain}.workers.dev`;
            console.log(`[CF-Deployer] Verifico lo stato su: ${expectedUrl}`);
            if (await isWorkerAlive(expectedUrl)) {
                console.log(`[CF-Deployer] ✅ Worker già online su Cloudflare! Salto il deploy. URL: ${expectedUrl}`);
                try {
                    fs.writeFileSync(cacheFilePath, JSON.stringify({ url: expectedUrl }), 'utf8');
                } catch (e) {}
                return expectedUrl;
            }
        }
    } catch (error) {
        console.log(`[CF-Deployer] Impossibile verificare lo stato del worker tramite API (${error.message}). Procedo al deploy...`);
    }

    // 5. Esegui il deploy completo
    try {
        console.log('[CF-Deployer] Inizio auto-deploy del Worker...');
        
        const workerScriptPath = path.join(__dirname, '../../cloudflare/worker.js');
        const scriptContent = fs.readFileSync(workerScriptPath, 'utf8');

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

        // 3. Scopri il dominio .workers.dev dell'utente se non recuperato prima
        if (!subdomain) {
            console.log(`[CF-Deployer] Recupero il sottodominio dell'account...`);
            const subdomainUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`;
            const subRes = await axios.get(subdomainUrl, { headers });
            subdomain = subRes.data?.result?.subdomain;
            if (subdomain) {
                await saveSubdomainToDB(subdomain);
            }
        }

        if (!subdomain) {
            throw new Error('Impossibile recuperare il sottodominio .workers.dev');
        }

        const finalUrl = `https://${scriptName}.${subdomain}.workers.dev`;
        console.log(`[CF-Deployer] ✅ Deploy completato con successo! URL: ${finalUrl}`);
        
        try {
            fs.writeFileSync(cacheFilePath, JSON.stringify({ url: finalUrl }), 'utf8');
        } catch (e) {}

        return finalUrl;
    } catch (error) {
        console.error('[CF-Deployer] ❌ Errore durante il deploy automatico:', error.response?.data || error.message);
        return null;
    }
}

module.exports = { deployCloudflareWorker };
