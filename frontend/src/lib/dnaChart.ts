/**
 * DNA Chart formatting, percentage calculation, and category grouping helpers.
 * Pure functions without external dependencies.
 */

export type DnaCategoryType = 'genres' | 'keywords' | 'people' | 'companies' | 'networks' | 'countries' | 'other';

export interface DnaCategoryMeta {
  id: DnaCategoryType;
  label: string;
  icon: string;
  title: string;
  order: number;
}

export const DNA_CATEGORIES: Record<DnaCategoryType, DnaCategoryMeta> = {
  genres: { id: 'genres', label: '🎭 GENERI', icon: '🎭', title: 'GENERI', order: 1 },
  keywords: { id: 'keywords', label: '🔑 KEYWORD', icon: '🔑', title: 'KEYWORD', order: 2 },
  people: { id: 'people', label: '👤 PERSONE', icon: '👤', title: 'PERSONE', order: 3 },
  companies: { id: 'companies', label: '🏢 STUDI', icon: '🏢', title: 'STUDI', order: 4 },
  networks: { id: 'networks', label: '📺 NETWORK', icon: '📺', title: 'NETWORK', order: 5 },
  countries: { id: 'countries', label: '🌍 PAESI', icon: '🌍', title: 'PAESI', order: 6 },
  other: { id: 'other', label: '✨ ALTRO', icon: '✨', title: 'ALTRO', order: 7 },
};

export interface DnaItemFormatted {
  key: string;
  name: string;
  weight: number;
  percentage: number;
  category: DnaCategoryType;
}

export interface DnaCategoryGroup {
  id: DnaCategoryType;
  label: string;
  icon: string;
  title: string;
  order: number;
  items: DnaItemFormatted[];
  /** Voci scartate perché sotto soglia o oltre il limite mostrato. */
  hiddenCount: number;
}

/**
 * Categorie mostrate nel grafico DNA.
 * Generi e studi sono leggibili e utili; keyword, persone e nodi interni del grafo
 * (`L1:c_85`…) erano solo codici TMDB, quindi restano fuori dalla vista.
 */
export const DNA_DISPLAY_CATEGORIES: DnaCategoryType[] = ['genres', 'companies', 'networks'];

export interface DnaRawItem {
  key?: string;
  id?: string | number;
  type?: string;
  weight?: number;
  score?: number;
  name?: string;
  label?: string;
}

const PREFIX_MAP: Record<string, string> = {
  g: 'Genere',
  genre: 'Genere',
  genres: 'Genere',
  genere: 'Genere',
  k: 'Keyword',
  keyword: 'Keyword',
  keywords: 'Keyword',
  d: 'Regista',
  director: 'Regista',
  directors: 'Regista',
  regista: 'Regista',
  a: 'Attore',
  actor: 'Attore',
  actors: 'Attore',
  attore: 'Attore',
  p: 'Persona',
  person: 'Persona',
  people: 'Persona',
  persona: 'Persona',
  persone: 'Persona',
  c: 'Casa',
  company: 'Casa',
  companies: 'Casa',
  casa: 'Casa',
  case: 'Casa',
  n: 'Network',
  network: 'Network',
  networks: 'Network',
  o: 'Paese',
  country: 'Paese',
  countries: 'Paese',
  paese: 'Paese',
};

/**
 * Formats a DNA label to ensure it is always human-readable.
 * Raw machine keys like "keyword:210024" or "network 49" are converted
 * to presentable forms like "Keyword #210024" and "Network #49".
 * Valid names like "Animazione" or "Denzel Washington" are preserved.
 * Empty strings return "".
 */
export function formatDnaLabel(label?: string | null, rawKey?: string | null): string {
  const cleanLabel = (label ?? '').trim();
  const cleanKey = (rawKey ?? '').trim();
  const target = cleanLabel || cleanKey;
  if (!target) return '';

  // 1. Matches prefix with separator (: or space or _) and numeric ID, e.g.:
  // "keyword:210024", "network 49", "g:28", "Genere 28", "n:49", "k:210024", "company 12"
  const prefixMatch = target.match(/^([a-z_]+)[:\s_]+(\d+)$/i);
  if (prefixMatch) {
    const rawPrefix = prefixMatch[1].toLowerCase();
    const id = prefixMatch[2];
    const mapped = PREFIX_MAP[rawPrefix];
    const prefixName = mapped || (rawPrefix.charAt(0).toUpperCase() + rawPrefix.slice(1));
    return `${prefixName} #${id}`;
  }

  // 2. If target is purely numeric, use rawKey if available or prefix with #
  if (/^\d+$/.test(target)) {
    if (cleanKey && cleanKey !== cleanLabel) {
      return formatDnaLabel(cleanKey);
    }
    return `#${target}`;
  }

  // 3. Single-letter prefix with text identifier (e.g. kitsu "k:isekai")
  const textCodeMatch = target.match(/^([gkdacon]):([a-zA-Z0-9_\-\s]+)$/i);
  if (textCodeMatch) {
    const code = textCodeMatch[1].toLowerCase();
    const textVal = textCodeMatch[2].trim();
    if (/^\d+$/.test(textVal)) {
      const mapped = PREFIX_MAP[code] || code.toUpperCase();
      return `${mapped} #${textVal}`;
    }
    return textVal;
  }

  // 4. Already a clean human name (e.g. "Animazione", "Denzel Washington", "Commedia", "HBO")
  return target;
}

/**
 * Determines the category of a DNA item based on key and optional type.
 */
export function determineDnaCategory(key: string, itemType?: string): DnaCategoryType {
  const normType = (itemType || '').toLowerCase().trim();
  if (normType === 'genre' || normType === 'genres') return 'genres';
  if (normType === 'keyword' || normType === 'keywords') return 'keywords';
  if (['person', 'people', 'actor', 'actors', 'director', 'directors', 'cast', 'crew'].includes(normType)) return 'people';
  if (['company', 'companies', 'production_company', 'production_companies', 'casa', 'case'].includes(normType)) return 'companies';
  if (['network', 'networks'].includes(normType)) return 'networks';
  if (['country', 'countries', 'origin_country', 'paese', 'paesi'].includes(normType)) return 'countries';

  const normKey = (key || '').toLowerCase().trim();
  if (normKey.startsWith('g:') || normKey.startsWith('genre:') || normKey.startsWith('genres:') || normKey.startsWith('with_genres')) return 'genres';
  if (normKey.startsWith('k:') || normKey.startsWith('keyword:') || normKey.startsWith('keywords:') || normKey.startsWith('with_keywords')) return 'keywords';
  if (
    normKey.startsWith('d:') || 
    normKey.startsWith('a:') || 
    normKey.startsWith('p:') || 
    normKey.startsWith('director:') || 
    normKey.startsWith('actor:') || 
    normKey.startsWith('person:') || 
    normKey.startsWith('people:') || 
    normKey.startsWith('with_cast') || 
    normKey.startsWith('with_crew')
  ) {
    return 'people';
  }
  if (
    normKey.startsWith('c:') || 
    normKey.startsWith('company:') || 
    normKey.startsWith('companies:') || 
    normKey.startsWith('casa:') || 
    normKey.startsWith('with_companies')
  ) {
    return 'companies';
  }
  if (
    normKey.startsWith('n:') || 
    normKey.startsWith('network:') || 
    normKey.startsWith('networks:') || 
    normKey.startsWith('with_networks')
  ) {
    return 'networks';
  }
  if (
    normKey.startsWith('o:') || 
    normKey.startsWith('country:') || 
    normKey.startsWith('countries:') || 
    normKey.startsWith('with_origin_country')
  ) {
    return 'countries';
  }

  return 'other';
}

/**
 * Calculates percentage relative to maxWeight (strongest item = 100%).
 */
export function calculatePercentage(weight: number, maxWeight: number): number {
  if (!maxWeight || maxWeight <= 0 || !weight || weight <= 0) return 0;
  const pct = Math.round((weight / maxWeight) * 100);
  return Math.min(100, Math.max(0, pct));
}

/**
 * Computes percentages across a list of items having a weight property.
 */
export function calculateDnaPercentages<T extends { weight: number }>(items: T[], customMax?: number): (T & { percentage: number })[] {
  const maxWeight = (customMax && customMax > 0)
    ? customMax
    : items.reduce((max, item) => Math.max(max, Number(item.weight) || 0), 0);

  return items.map(item => ({
    ...item,
    percentage: calculatePercentage(Number(item.weight) || 0, maxWeight)
  }));
}

export interface GroupDnaOptions {
  maxItemsPerCategory?: number;
  customMaxWeight?: number;
  /** Categorie da mostrare (default: generi + studi/network). */
  allowedCategories?: DnaCategoryType[];
  /** Soglia minima in percentuale: sotto questa le voci non vengono mostrate (default 1). */
  minPercentage?: number;
}

/**
 * Groups DNA items into ordered categories, sorts them by weight descending,
 * calculates relative percentages (max = 100%), and eliminates empty ghost categories.
 */
export function groupDnaItems(
  rawInput: Record<string, number> | DnaRawItem[] | null | undefined,
  getLabel?: ((key: string, rawItem?: DnaRawItem) => string) | null,
  options?: GroupDnaOptions
): DnaCategoryGroup[] {
  if (!rawInput) return [];

  // 1. Flatten input to uniform item list
  const rawList: Array<{ key: string; weight: number; name?: string; type?: string }> = [];

  if (Array.isArray(rawInput)) {
    for (const item of rawInput) {
      if (!item) continue;
      const key = item.key || (item.type && item.id ? `${item.type}:${item.id}` : String(item.id || ''));
      const weight = Number(item.weight ?? item.score ?? 0);
      if (!key || isNaN(weight) || weight <= 0) continue;
      rawList.push({
        key,
        weight,
        name: item.name || item.label,
        type: item.type,
      });
    }
  } else if (typeof rawInput === 'object') {
    for (const [key, rawWeight] of Object.entries(rawInput)) {
      const weight = Number(rawWeight);
      if (!key || isNaN(weight) || weight <= 0) continue;
      rawList.push({ key, weight });
    }
  }

  if (rawList.length === 0) return [];

  // 2. Global max weight (the strongest item in profile = 100%)
  const maxWeight = (options?.customMaxWeight && options.customMaxWeight > 0)
    ? options.customMaxWeight
    : rawList.reduce((max, item) => Math.max(max, item.weight), 0);

  // 3. Process items with labels, categories, percentages
  const processedItems: DnaItemFormatted[] = rawList.map(item => {
    const rawResolvedName = getLabel ? getLabel(item.key, item) : (item.name || item.key);
    const cleanName = formatDnaLabel(rawResolvedName, item.key);
    const category = determineDnaCategory(item.key, item.type);
    const percentage = calculatePercentage(item.weight, maxWeight);

    return {
      key: item.key,
      name: cleanName || formatDnaLabel(item.key),
      weight: item.weight,
      percentage,
      category,
    };
  });

  // 4. Group items by category
  const groupsMap = new Map<DnaCategoryType, DnaItemFormatted[]>();
  processedItems.forEach(item => {
    const list = groupsMap.get(item.category) || [];
    list.push(item);
    groupsMap.set(item.category, list);
  });

  // 5. Build category groups
  const result: DnaCategoryGroup[] = [];
  const allowed = options?.allowedCategories ?? DNA_DISPLAY_CATEGORIES;
  const minPercentage = options?.minPercentage ?? 1;

  groupsMap.forEach((items, catId) => {
    // Crucial: avoid ghost sections when a category has 0 items
    if (!items || items.length === 0) return;
    // Categorie rumorose (keyword, persone, nodi interni) non vengono mostrate
    if (!allowed.includes(catId)) return;

    // Sort descending by weight; secondary sort by name
    items.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));

    // Le voci irrilevanti (0-1%) sparivano in righe inutili a "0%": meglio raggrupparle.
    const relevant = items.filter(item => item.percentage >= minPercentage);
    const belowThreshold = items.length - relevant.length;

    const limited = (options?.maxItemsPerCategory && options.maxItemsPerCategory > 0)
      ? relevant.slice(0, options.maxItemsPerCategory)
      : relevant;

    if (limited.length === 0) return;

    const meta = DNA_CATEGORIES[catId] || {
      id: catId,
      label: catId.toUpperCase(),
      icon: '📌',
      title: catId.toUpperCase(),
      order: 99,
    };

    result.push({
      id: catId,
      label: meta.label,
      icon: meta.icon,
      title: meta.title,
      order: meta.order,
      items: limited,
      hiddenCount: belowThreshold + (relevant.length - limited.length),
    });
  });

  // Sort groups by canonical order
  result.sort((a, b) => a.order - b.order);

  return result;
}
