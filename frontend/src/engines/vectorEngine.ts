/**
 * Vector Engine (Client-Side)
 * The mathematical heart of the VSM Recommendation Engine.
 */

export interface VectorAxis {
  [id: string]: number;
}

export interface CompiledVector {
  V_final: VectorAxis;
  [key: string]: VectorAxis;
}

export interface WatchHistoryItem {
  tmdbId: number;
  type: 'movie' | 'tv';
  episodesWatched: number;
  lastWatchedAt: string;
}

export interface TmdbMetadata {
  genres?: Array<{ id: number; name: string }>;
  keywords?: { keywords?: Array<{ id: number; name: string }>; results?: Array<{ id: number; name: string }> };
  credits?: { 
    crew?: Array<{ job: string; id: number; name: string }>;
    cast?: Array<{ id: number; name: string }>;
  };
}

export interface RawProfileData {
  history: WatchHistoryItem[];
  staticCatalogs: any[];
  globalVectors: CompiledVector | null;
  subProfileVectors: Array<{ profileId: string; vectors: CompiledVector }>;
  excludedProfileIds: string[];
}

const HALF_LIFE_DAYS = 45;

export class VectorEngine {
  /**
   * Calculates hyperbolic time decay based on an 45-day half-life.
   */
  static applyTimeDecay(date: string | Date): number {
    const now = new Date().getTime();
    const watched = new Date(date).getTime();
    const diffDays = Math.max(0, (now - watched) / (1000 * 60 * 60 * 24));
    return Math.pow(0.5, diffDays / HALF_LIFE_DAYS);
  }

  /**
   * Caps the influence of long series or repetitive watching.
   */
  static calculateSeriesCap(episodes: number): number {
    // 1 episode = 0.2, 5 episodes = 1.0, 15+ episodes = cap at 3.0 (significant but not overwhelming)
    // Linear scaling up to 5, then slower growth
    if (episodes <= 5) return episodes * 0.2;
    return 1.0 + Math.log2(1 + (episodes - 5) / 5);
  }

  /**
   * Extracts features from TMDB metadata and adds them to a vector with prefix keys.
   */
  static addMetadataToVector(vector: VectorAxis, metadata: TmdbMetadata, weight: number) {
    // Genres (g:)
    metadata.genres?.forEach(g => {
      const key = `g:${g.id}`;
      vector[key] = (vector[key] || 0) + weight;
    });

    // Keywords (k:) - lower weight for keywords as they are many and noisy
    const keywords = metadata.keywords?.keywords || metadata.keywords?.results || [];
    keywords.forEach(k => {
      const key = `k:${k.id}`;
      vector[key] = (vector[key] || 0) + (weight * 0.4);
    });

    // Directors (d:)
    metadata.credits?.crew?.filter(c => c.job === 'Director').forEach(d => {
      const key = `d:${d.id}`;
      vector[key] = (vector[key] || 0) + (weight * 0.8);
    });

    // Actors (a:)
    metadata.credits?.cast?.slice(0, 5).forEach(a => {
      const key = `a:${a.id}`;
      vector[key] = (vector[key] || 0) + (weight * 0.2);
    });
  }

  /**
   * Normalizes a vector using Max-Scaling (0-1).
   */
  static normalize(vector: VectorAxis): VectorAxis {
    const keys = Object.keys(vector);
    if (keys.length === 0) return {};

    const max = Math.max(...Object.values(vector));
    if (max === 0) return {};

    const normalized: VectorAxis = {};
    keys.forEach(k => {
      normalized[k] = parseFloat((vector[k] / max).toFixed(4));
    });
    return normalized;
  }

  /**
   * Fuses active (history) and static (DNA) vectors.
   */
  static fuse(active: VectorAxis, staticV: VectorAxis, staticWeight = 1.5): VectorAxis {
    const fused: VectorAxis = { ...active };
    
    Object.entries(staticV).forEach(([key, weight]) => {
      fused[key] = (fused[key] || 0) + (weight * staticWeight);
    });

    return fused;
  }

  /**
   * Dynamic Percentile Pruning to keep vectors representatively lean.
   */
  static prune(vector: VectorAxis): VectorAxis {
    if (Object.keys(vector).length <= 20) return vector;

    // Group by prefix to apply type-specific pruning
    const groups: Record<string, Array<{ key: string; val: number }>> = {};
    Object.entries(vector).forEach(([key, val]) => {
      const prefix = key.split(':')[0];
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push({ key, val });
    });

    const pruned: VectorAxis = {};

    Object.entries(groups).forEach(([prefix, items]) => {
      items.sort((a, b) => b.val - a.val);
      
      const minCount = prefix === 'k' ? 8 : 4;
      if (items.length <= minCount) {
        items.forEach(it => pruned[it.key] = it.val);
        return;
      }

      // Adaptive percentile logic
      let threshold = this.getPercentile(items.map(i => i.val), 0.75);
      let count = items.filter(i => i.val >= threshold).length;

      if (count < minCount) {
        threshold = this.getPercentile(items.map(i => i.val), 0.60);
        count = items.filter(i => i.val >= threshold).length;
      }

      if (count < minCount) {
        threshold = this.getPercentile(items.map(i => i.val), 0.50);
      }

      items.forEach(it => {
        if (it.val >= threshold) pruned[it.key] = it.val;
      });
    });

    return pruned;
  }

  private static getPercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(percentile * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Final production of vectors for a profile.
   */
  static computeProfileVectors(
    history: WatchHistoryItem[],
    metadataMap: Record<number, TmdbMetadata>,
    staticDNA: VectorAxis = {}
  ): { V_active: VectorAxis; V_static: VectorAxis; V_final: VectorAxis } {
    
    // 1. Compute V_active from history
    const activeRaw: VectorAxis = {};
    history.forEach(item => {
      const metadata = metadataMap[item.tmdbId];
      if (!metadata) return;

      const decay = this.applyTimeDecay(item.lastWatchedAt);
      const cap = this.calculateSeriesCap(item.episodesWatched);
      const weight = decay * cap;

      this.addMetadataToVector(activeRaw, metadata, weight);
    });

    const V_active = this.normalize(activeRaw);
    const V_static = this.normalize(staticDNA);

    // 2. Initial Fusion (Local Base)
    let V_final = this.fuse(V_active, V_static);
    V_final = this.normalize(V_final);
    V_final = this.prune(V_final);

    return { V_active, V_static, V_final };
  }

  /**
   * Applies cross-contamination between specific profile and global taste.
   */
  static applyContamination(
    localFinal: VectorAxis,
    globalFinal: VectorAxis,
    ratio = 0.1
  ): VectorAxis {
    const contaminated: VectorAxis = { ...localFinal };

    Object.entries(globalFinal).forEach(([key, weight]) => {
      // Contaminate local with global
      contaminated[key] = (contaminated[key] || 0) * (1 - ratio) + (weight * ratio);
    });

    return this.normalize(contaminated);
  }
}
