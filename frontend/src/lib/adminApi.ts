export const getAdminPass = () => {
    if (typeof window !== 'undefined') {
        return sessionStorage.getItem('yaca_admin_pass');
    }
    return null;
};

export const setAdminPass = (pass: string) => {
    if (typeof window !== 'undefined') {
        sessionStorage.setItem('yaca_admin_pass', pass);
    }
};

export const clearAdminPass = () => {
    if (typeof window !== 'undefined') {
        sessionStorage.removeItem('yaca_admin_pass');
    }
};

const JSON_HEADERS = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
};

async function adminFetch(url: string, options: RequestInit = {}) {
    const adminPass = getAdminPass();
    const headers = {
        ...JSON_HEADERS,
        ...(options.headers || {}),
        ...(adminPass ? { 'X-Admin-Pass': adminPass } : {})
    };

    const res = await fetch(url, { ...options, headers });
    
    // Se 401, la password è errata o scaduta (o non configurata)
    if (res.status === 401 || res.status === 403) {
        clearAdminPass();
        throw new Error('Non autorizzato. Password errata o sessione scaduta.');
    }
    
    if (res.status === 503) {
        throw new Error('Sezione Admin non configurata sul server (ADMIN_PASS mancante nel .env).');
    }

    return res.json();
}

export const adminApi = {
    getMetrics: () => adminFetch('/api/admin/metrics'),
    
    flushSystem: (namespace: string = 'all') => 
        adminFetch('/api/admin/system/flush', {
            method: 'POST',
            body: JSON.stringify({ namespace })
        }),
        
    triggerScript: (action: string) =>
        adminFetch('/api/admin/scripts/trigger', {
            method: 'POST',
            body: JSON.stringify({ action })
        })
};
