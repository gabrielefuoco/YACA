import { CatalogKind, TypeSelectors } from '@/types';

const ALWAYS_VISIBLE_IDS = new Set([
  'yaca_search_standard',
  'yaca_search_ai',
  'yaca_watchlist_movies',
  'yaca_watchlist_series',
  'yaca_watchlist_anime',
]);

const HERO_REGISTRY: Record<string, CatalogKind> = {
  yaca_true_blend_movies: { mediaSet: ['film'], anime: 'no' },
  yaca_true_blend_series: { mediaSet: ['serie'], anime: 'no' },
  yaca_seed_network_movies: { mediaSet: ['film'], anime: 'no' },
  yaca_seed_network_series: { mediaSet: ['serie'], anime: 'no' },
  yaca_hidden_gems_movies: { mediaSet: ['film'], anime: 'no' },
  yaca_hidden_gems_series: { mediaSet: ['serie'], anime: 'no' },
  yaca_trakt_filtered_movies: { mediaSet: ['film'], anime: 'no' },
  yaca_trakt_filtered_series: { mediaSet: ['serie'], anime: 'no' },
};

function stripPresetPrefix(id?: string): string {
  if (!id) return '';
  return id.startsWith('yaca_preset_') ? id.replace('yaca_preset_', '') : id;
}

export function isAlwaysVisible(id?: string): boolean {
  if (!id) return false;
  return ALWAYS_VISIBLE_IDS.has(id) || ALWAYS_VISIBLE_IDS.has(stripPresetPrefix(id));
}

export function getFrontendCatalogKind(catalog: any): CatalogKind {
  if (!catalog) {
    return { mediaSet: ['film', 'serie'], anime: 'mixed' };
  }

  if (catalog.kind && Array.isArray(catalog.kind.mediaSet) && catalog.kind.anime) {
    return catalog.kind;
  }

  const id = catalog.id || '';
  const baseId = stripPresetPrefix(id);

  if (HERO_REGISTRY[id]) return HERO_REGISTRY[id];
  if (HERO_REGISTRY[baseId]) return HERO_REGISTRY[baseId];

  if (catalog.type === 'anime') {
    return { mediaSet: ['film', 'serie'], anime: 'yes' };
  }

  const isAnime = Boolean(catalog.isAnime);
  const type = catalog.type;

  let mediaSet: ('film' | 'serie')[];
  if (type === 'movie') {
    mediaSet = ['film'];
  } else if (type === 'series') {
    mediaSet = ['serie'];
  } else if (type === 'both') {
    mediaSet = ['film', 'serie'];
  } else {
    if (id.endsWith('_movies')) mediaSet = ['film'];
    else if (id.endsWith('_series')) mediaSet = ['serie'];
    else mediaSet = ['film', 'serie'];
  }

  return {
    mediaSet,
    anime: isAnime ? 'yes' : 'no'
  };
}

export function isCatalogConformant(catalog: any, typeSelectors?: TypeSelectors | null): boolean {
  const id = typeof catalog === 'string' ? catalog : catalog?.id;
  if (id && isAlwaysVisible(id)) {
    return true;
  }

  if (!typeSelectors) {
    return true;
  }

  const film = Boolean(typeSelectors.film);
  const serie = Boolean(typeSelectors.serie);
  const anime = typeSelectors.anime || null;

  if (!film && !serie && !anime) {
    return true;
  }

  const kind = getFrontendCatalogKind(catalog);

  let mediaAmmessi: Set<string>;
  if ((!film && !serie) || (film && serie)) {
    mediaAmmessi = new Set(['film', 'serie']);
  } else if (film && !serie) {
    mediaAmmessi = new Set(['film']);
  } else {
    mediaAmmessi = new Set(['serie']);
  }

  const mediaSet = kind.mediaSet || [];
  if (mediaSet.length > 0 && !mediaSet.every((m) => mediaAmmessi.has(m))) {
    return false;
  }

  if (anime === 'only' && kind.anime !== 'yes') {
    return false;
  }
  if (anime === 'exclude' && kind.anime !== 'no') {
    return false;
  }

  return true;
}

export function getIncompatibilityReason(catalog: any, typeSelectors?: TypeSelectors | null): string | null {
  if (isCatalogConformant(catalog, typeSelectors)) {
    return null;
  }

  const film = Boolean(typeSelectors?.film);
  const serie = Boolean(typeSelectors?.serie);
  const anime = typeSelectors?.anime || null;

  const kind = getFrontendCatalogKind(catalog);

  let mediaAmmessi: Set<string>;
  if ((!film && !serie) || (film && serie)) {
    mediaAmmessi = new Set(['film', 'serie']);
  } else if (film && !serie) {
    mediaAmmessi = new Set(['film']);
  } else {
    mediaAmmessi = new Set(['serie']);
  }

  const mediaSet = kind.mediaSet || [];
  if (mediaSet.length > 0 && !mediaSet.every((m) => mediaAmmessi.has(m))) {
    if (film && !serie) return 'Non compatibile: profilo Solo Film';
    if (!film && serie) return 'Non compatibile: profilo Solo Serie';
  }

  if (anime === 'only' && kind.anime !== 'yes') {
    return 'Non compatibile: profilo Solo Anime';
  }
  if (anime === 'exclude' && kind.anime !== 'no') {
    return 'Non compatibile: profilo No Anime';
  }

  return 'Non compatibile coi selettori';
}
