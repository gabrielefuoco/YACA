/**
 * Parsa i parametri "extra" stile Stremio (es. "search=avengers&skip=20")
 */
function parseExtra(extraString) {
    if (!extraString) return {};
    const extra = {};
    const params = extraString.split('&');
    for (const p of params) {
        const [k, v] = p.split('=');
        if (k && v) extra[k] = decodeURIComponent(v);
    }
    return extra;
}

/**
 * Rimuove tag HTML e caratteri pericolosi per prevenire XSS.
 * Utilizza un approccio a singola passata più robusto rispetto alla regex ricorsiva.
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/<[^>]*>?/gm, '') // Rimuove i tag HTML
        .replace(/[<>"'&]/g, '');   // Neutralizza caratteri speciali residui
}


/**
 * Verifica che un URL punti a un host consentito (protezione SSRF).
 * Blocca anche indirizzi IP privati/interni.
 */
function isAllowedUrl(url, allowedHosts) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return false;
        }
        const hostname = parsed.hostname;
        // Blocca indirizzi privati/interni (RFC 1918 + link-local + loopback)
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' ||
            hostname.startsWith('10.') || hostname.startsWith('192.168.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
            hostname === '169.254.169.254' || hostname === '[::1]' || hostname.endsWith('.local')) {
            return false;
        }
        if (allowedHosts && allowedHosts.length > 0) {
            return allowedHosts.includes(hostname);
        }
        return true;
    } catch (_e) {
        return false;
    }
}

function getProfileDnaFilters(userConfig, profileId) {
    const profileSettings = userConfig?.profiles?.find((p) => p.id === profileId)?.settings || {};
    const orderedDna = [
        ...(profileSettings.manualDNA || []),
        ...(profileSettings.suggestedDNA || [])
    ];
    const seen = new Set();
    return orderedDna.filter((item) => {
        if (!item?.type || item?.id === undefined || item?.id === null) return false;
        const key = `${item.type}:${String(item.id)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function resolveHostUrl(req) {
    let host = '';

    // 1. Explicitly configured URL (Highest priority)
    const explicitHost = process.env.HOST_URL || process.env.RENDER_EXTERNAL_URL;
    if (explicitHost) {
        host = explicitHost;
    } else if (process.env.SPACE_HOST) {
        // 2. Hugging Face Spaces detection
        // SPACE_HOST is typically "username-spacename.hf.space"
        host = `https://${process.env.SPACE_HOST}`;
    } else {
        // 3. Reverse Proxy Headers
        const forwardedHost = req.headers?.['x-forwarded-host'];
        const forwardedProto = req.headers?.['x-forwarded-proto'];
        
        if (forwardedHost) {
            const proto = forwardedProto || req.protocol || 'https';
            host = `${proto}://${String(forwardedHost).split(',')[0].trim()}`;
        } else {
            // 4. Fallback to Local Host
            host = `${req.protocol}://${req.get('host')}`;
        }
    }

    // Force HTTPS for non-local environments to avoid Mixed Content issues
    // Hugging Face and Render always terminate SSL at the proxy
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
        host = host.replace(/^http:\/\//, 'https://');
    }

    // Clean up trailing slash
    return host.replace(/\/+$/, '');
}

module.exports = { parseExtra, sanitizeString, isAllowedUrl, getProfileDnaFilters, resolveHostUrl };
