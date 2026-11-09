import { CatalogoEsploraVoce, CatalogCardData } from '@/types';

export type TipoFamiglia = 'film' | 'serie' | 'anime' | 'bambini';

export interface TipoMeta {
  label: string;
  icon: string;
  badgeLabel: string;
}

export const TIPI_CATALOGO_MAP: Record<TipoFamiglia, TipoMeta> = {
  film: { label: 'Film', icon: '🎬', badgeLabel: 'Film' },
  serie: { label: 'Serie TV', icon: '📺', badgeLabel: 'Serie' },
  anime: { label: 'Anime', icon: '🏮', badgeLabel: 'Anime' },
  bambini: { label: 'Bambini & Famiglia', icon: '🧸', badgeLabel: 'Bambini' },
};

export const ORDINE_TIPI: readonly TipoFamiglia[] = ['film', 'serie', 'anime', 'bambini'] as const;

export const FONTI_CATALOGO_MAP: Record<string, { label: string }> = {
  preset: { label: 'Preset' },
  grafo: { label: 'Suggerito' },
  watchlist: { label: 'Watchlist' },
  mylist: { label: 'Mia Lista' },
  creazione: { label: 'Creato' },
};

/**
 * Adapter condiviso da CatalogoEsploraVoce a CatalogCardData.
 * Nota: `tipo` è la famiglia (film/serie/anime/bambini), non il medium.
 * L'API restituisce `media: 'movie' | 'series' | null`.
 * Usiamo `media` per type, icone e anteprime.
 */
export function catalogoVoceToCard(voce: CatalogoEsploraVoce): CatalogCardData {
  const resolvedType: 'movie' | 'series' | 'both' =
    voce.media === 'series'
      ? 'series'
      : voce.media === 'movie'
      ? 'movie'
      : voce.media === null
      ? 'both'
      : (voce.tipo === 'serie' ? 'series' : 'movie');

  return {
    id: voce.id,
    name: voce.nome,
    type: resolvedType,
    media: voce.media,
    stremioType: voce.stremioType,
    tipo: voce.tipo,
    fonte: voce.fonte,
    attivo: voce.attivo,
    ordine: voce.ordine,
    emoji: voce.emoji,
    description: voce.description,
    isAnime: voce.tipo === 'anime',
    nome_fonte: voce.nome_fonte,
    confidenza: voce.confidenza,
    semi_membri: voce.semi_membri,
    semi_rappresentativi: voce.semi_rappresentativi,
  };
}
