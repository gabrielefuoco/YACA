import { HeroCatalogUiGroup, ShelfMemberSeed, ShelfRepresentativeSeed } from '@/types';

export function quantizeSliderValue(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

export interface ShelfBadgeResult {
  badge: 'Anime' | 'Serie' | 'Film';
  switchLabel: 'ANIME' | 'SERIE' | 'FILM';
  type: 'series' | 'movie';
}

/**
 * Determina il badge visibile e l'etichetta dello switch per uno scaffale.
 *
 * REGOLA ANIME:
 * - Le serie che sono anime (medium/type === 'series' && anime === true) mostrano il badge «Anime».
 * - I FILM anime restano «Film» (anime === true && medium/type === 'movie' -> «Film»).
 * - Il tipo catalogo Stremio sottostante resta 'series' o 'movie'.
 * - Non inferisce MAI dal nome: legge esclusivamente il flag booleano anime === true.
 */
export function getShelfBadge(shelf: { type?: string; medium?: string; anime?: boolean }): ShelfBadgeResult {
  const rawType = shelf.medium || shelf.type || 'movie';
  const isSeries = rawType === 'series' || (rawType as string) === 'tv';
  const isAnime = Boolean(shelf.anime);

  if (isSeries && isAnime) {
    return {
      badge: 'Anime',
      switchLabel: 'ANIME',
      type: 'series',
    };
  }

  if (!isSeries && (rawType === 'movie' || !rawType)) {
    return {
      badge: 'Film',
      switchLabel: 'FILM',
      type: 'movie',
    };
  }

  return {
    badge: 'Serie',
    switchLabel: 'SERIE',
    type: 'series',
  };
}

export interface FormattedShelfSeed {
  titolo: string;
  anno: number | null;
  tmdbId: number | null;
  medium: string;
  plays: number | null;
  eta_giorni: number | null;
}

/**
 * Prepara la lista ordinata dei semi del profilo che attivano lo scaffale.
 * Usa semi_membri come fonte primaria (mantenendo l'ordine originale) e
 * arricchisce con plays ed eta_giorni da semi_rappresentativi quando presenti.
 */
export function formatShelfSeeds(shelf: {
  semiMembri?: ShelfMemberSeed[];
  semi_membri?: ShelfMemberSeed[];
  semiRappresentativi?: ShelfRepresentativeSeed[];
  semi_rappresentativi?: ShelfRepresentativeSeed[];
  medium?: string;
}): FormattedShelfSeed[] {
  const repList = Array.isArray(shelf.semiRappresentativi)
    ? shelf.semiRappresentativi
    : Array.isArray(shelf.semi_rappresentativi)
    ? shelf.semi_rappresentativi
    : [];
  const repMap = new Map<string, ShelfRepresentativeSeed>();
  for (const r of repList) {
    const key = r.tmdbId ? String(r.tmdbId) : String(r.titolo || '');
    if (key) repMap.set(key, r);
  }

  const memberList = Array.isArray(shelf.semiMembri) && shelf.semiMembri.length > 0
    ? shelf.semiMembri
    : Array.isArray(shelf.semi_membri) && shelf.semi_membri.length > 0
    ? shelf.semi_membri
    : repList;

  return memberList.map((seed) => {
    const key = seed.tmdbId ? String(seed.tmdbId) : String(seed.titolo || '');
    const rep = repMap.get(key);

    const rawPlays = seed.plays !== undefined && seed.plays !== null ? seed.plays : (rep?.plays !== undefined && rep?.plays !== null ? rep.plays : null);
    const rawEta = seed.eta_giorni !== undefined && seed.eta_giorni !== null ? seed.eta_giorni : (rep?.eta_giorni !== undefined && rep?.eta_giorni !== null ? rep.eta_giorni : null);

    const plays = rawPlays !== null && rawPlays !== undefined && Number.isFinite(Number(rawPlays)) ? Number(rawPlays) : null;
    const eta_giorni = rawEta !== null && rawEta !== undefined && Number.isFinite(Number(rawEta)) ? Math.round(Number(rawEta)) : null;

    return {
      titolo: String(seed.titolo || 'Senza titolo'),
      anno: seed.anno !== undefined && seed.anno !== null ? Number(seed.anno) : (rep?.anno !== undefined && rep?.anno !== null ? Number(rep.anno) : null),
      tmdbId: seed.tmdbId !== undefined && seed.tmdbId !== null ? Number(seed.tmdbId) : (rep?.tmdbId !== undefined && rep?.tmdbId !== null ? Number(rep.tmdbId) : null),
      medium: seed.medium || rep?.medium || shelf.medium || 'movie',
      plays,
      eta_giorni,
    };
  });
}
