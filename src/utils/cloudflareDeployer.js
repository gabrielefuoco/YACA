const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

async function isWorkerAlive(url) {
    try {
        const res = await fetch(url, { 
            headers: defaultHeaders,
            signal: AbortSignal.timeout(5000)
        });
        return res.status === 400 || res.status === 200 || res.status === 404;
    } catch (e) {
        return false;
    }
}

async function getCachedSubdomainFromDB() {
    try {
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
    const scriptName = 'yaca-proxy-worker';
    const cacheFilePath = path.join(__dirname, '.cf_worker_url.json');

    // 1. Forza l'utilizzo della variabile d'ambiente anche se il server non riesce a raggiungerla (Cloudflare block su HF)
    if (process.env.CF_WORKER_SUBDOMAIN) {
        const envUrl = `https://${scriptName}.${process.env.CF_WORKER_SUBDOMAIN}.workers.dev`;
        console.log(`[CF-Deployer] CF_WORKER_SUBDOMAIN configurato da env. Verifico se è online...`);
        const isAlive = await isWorkerAlive(envUrl);
        if (isAlive) {
            console.log(`[CF-Deployer] ✅ Worker online (via CF_WORKER_SUBDOMAIN)! URL: ${envUrl}`);
        } else {
            console.log(`[CF-Deployer] ⚠️ Worker non raggiungibile dal server (possibile blocco IP), ma verrà utilizzato comunque per i client. URL: ${envUrl}`);
        }
        return envUrl;
    }

    if (!apiToken || !accountId) {
        return null;
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
            try {
                fs.writeFileSync(cacheFilePath, JSON.stringify({ url: dbUrl }), 'utf8');
            } catch (e) {}
            return dbUrl;
        }
    }

    // 4. Se offline o non trovato, prova a recuperare il sottodominio dalle API Cloudflare
    const headers = {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/javascript',
        ...defaultHeaders
    };

    let subdomain = null;
    try {
        console.log('[CF-Deployer] Recupero il sottodominio via API per verificare lo stato del worker...');
        const subdomainUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`;
        const subRes = await fetch(subdomainUrl, { headers, signal: AbortSignal.timeout(8000) });
        if (subRes.ok) {
            const data = await subRes.json();
            subdomain = data?.result?.subdomain;

            if (subdomain) {
                await saveSubdomainToDB(subdomain);
                const expectedUrl = `https://${scriptName}.${subdomain}.workers.dev`;
                console.log(`[CF-Deployer] Verifico lo stato su: ${expectedUrl}`);
                if (await isWorkerAlive(expectedUrl)) {
                    console.log(`[CF-Deployer] ✅ Worker già online su Cloudflare! Salto il deploy. URL: ${expectedUrl}`);
                    try { fs.writeFileSync(cacheFilePath, JSON.stringify({ url: expectedUrl }), 'utf8'); } catch (e) {}
                    return expectedUrl;
                }
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

        console.log(`[CF-Deployer] Eseguo l'upload del worker '${scriptName}'...`);
        const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`;
        const uploadRes = await fetch(uploadUrl, { method: 'PUT', headers, body: scriptContent });
        if (!uploadRes.ok) throw new Error(`Upload fallito: ${uploadRes.status} ${uploadRes.statusText}`);

        console.log(`[CF-Deployer] Abilito il routing su .workers.dev...`);
        const enableDevUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`;
        const enableRes = await fetch(enableDevUrl, { 
            method: 'POST', 
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: true })
        });
        if (!enableRes.ok) throw new Error(`Enable fallito: ${enableRes.status} ${enableRes.statusText}`);

        if (!subdomain) {
            console.log(`[CF-Deployer] Recupero il sottodominio dell'account...`);
            const subdomainUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`;
            const subRes = await fetch(subdomainUrl, { headers });
            if (subRes.ok) {
                const data = await subRes.json();
                subdomain = data?.result?.subdomain;
                if (subdomain) await saveSubdomainToDB(subdomain);
            }
        }

        if (!subdomain) throw new Error('Impossibile recuperare il sottodominio .workers.dev');

        const finalUrl = `https://${scriptName}.${subdomain}.workers.dev`;
        console.log(`[CF-Deployer] ✅ Deploy completato con successo! URL: ${finalUrl}`);
        
        try { fs.writeFileSync(cacheFilePath, JSON.stringify({ url: finalUrl }), 'utf8'); } catch (e) {}

        return finalUrl;
    } catch (error) {
        console.error('[CF-Deployer] ❌ Errore durante il deploy automatico:', error.message);
        // Fallback: se il db o la cache hanno un dominio, e il deploy fallisce per blocchi IP, restituiamo quello in cache
        if (dbSubdomain) {
            console.log(`[CF-Deployer] ⚠️ Restituisco l'ultimo URL noto dal DB come fallback: https://${scriptName}.${dbSubdomain}.workers.dev`);
            return `https://${scriptName}.${dbSubdomain}.workers.dev`;
        }
        return null;
    }
}

module.exports = { deployCloudflareWorker };
