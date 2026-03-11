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
 * Rimuove tag HTML/script e caratteri pericolosi da una stringa per prevenire XSS.
 * Applica la rimozione dei tag in loop per evitare bypass tramite tag annidati
 * (es. "<scr<script>ipt>" che dopo un solo passaggio riformerebbe "<script>").
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    let result = str;
    let prev;
    do {
        prev = result;
        result = result.replace(/<[^>]*>/g, '');
    } while (result !== prev);
    return result.replace(/[<>"'&]/g, '');
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
        ...(profileSettings.suggestedDNA || []),
        ...(profileSettings.pendingDNASuggestions || [])
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

module.exports = { parseExtra, sanitizeString, isAllowedUrl, getProfileDnaFilters };
