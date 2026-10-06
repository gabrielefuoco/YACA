/**
 * libraryCanonical.ts
 *
 * Logica per il calcolo della chiave canonica degli elementi della libreria.
 * Utilizzata dalla dashboard per evitare che la deduplica UI:
 * 1. Confonda film e serie che condividono lo stesso ID numerico TMDB (es. TMDB 155).
 * 2. Sia cieca alle differenze di namespace (tt... vs tmdb:... vs kitsu:...).
 */

export function getCanonicalLibraryKey(item: any): string {
  if (!item) return '';
  if (item.canonicalKey) return String(item.canonicalKey);

  const rawId = String(item._id || item.itemId || '').trim();
  const rawType = String(item.type || '').trim().toLowerCase();
  const normalizedType = (rawType === 'movie') ? 'movie' : (rawType === 'series' || rawType === 'tv') ? 'tv' : rawType;

  // 1. Identificatore IMDb globale (tt...): univoco nello spazio dei media
  const imdbMatch = rawId.match(/tt\d{5,}/i);
  if (imdbMatch) {
    return imdbMatch[0].toLowerCase();
  }

  // 2. ID TMDB esplicito o prefisso tmdb: numerico
  // Tassativo qualificare col tipo (movie vs tv) per prevenire collisioni tra serie e film!
  const tmdbNumeric = item.tmdbId || rawId.replace(/^tmdb:(?:tv:|movie:)?/i, '').match(/^\d+$/)?.[0];
  if (tmdbNumeric) {
    return `tmdb:${normalizedType || 'unknown'}:${tmdbNumeric}`;
  }

  // 3. Namespace kitsu
  const kitsuMatch = rawId.match(/^kitsu:(\d+)/i);
  if (kitsuMatch) {
    return `kitsu:${kitsuMatch[1]}`;
  }

  // 4. Fallback: tipo qualificato + id
  return normalizedType ? `${normalizedType}:${rawId.toLowerCase()}` : rawId.toLowerCase();
}
