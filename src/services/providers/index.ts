import { AnimeEpisode, StreamData } from '../../types/anime';
import { AnimeMatcher } from '../animeMatcher';

export interface AnimeSearchResult {
  id: string;
  title: string;
  subOrDub: 'sub' | 'dub';
  provider: string;
  image?: string;
  releaseDate?: string;
}

export interface AnimeProvider {
  name: string;
  search(query: string, targetMeta?: { title: string; englishTitle?: string; romajiTitle?: string; type?: string; season?: string; year?: number }, audioMode?: 'sub' | 'dub' | 'dual' | 'all'): Promise<AnimeSearchResult[]>;
  fetchEpisodes(animeId: string): Promise<AnimeEpisode[]>;
  fetchSources(episodeId: string, server?: string): Promise<StreamData>;
}

// Multi-instance public Consumet, Aniwatch, Gogoanime and Anime Stream API mirrors
const PUBLIC_ANIME_API_ENDPOINTS = [
  'https://api.consumet.org/anime',
  'https://consumet.stream/anime',
  'https://api.amvstr.me/api/v2',
  'https://api-consumet.vercel.app/anime',
  'https://anime-api-consumet.onrender.com/anime',
  'https://api.anify.tv'
];

export class FastConsumetProvider implements AnimeProvider {
  public name = 'Direct High-Speed CDN & Mirror Resolver';
  private defaultUrls = PUBLIC_ANIME_API_ENDPOINTS;
  private fastestWorkingEndpoint: string | null = null;
  private lastProbeTime = 0;

  private getBaseUrls(): string[] {
    if (typeof localStorage !== 'undefined') {
      const custom = localStorage.getItem('yozora_consumet_api_url');
      if (custom && custom.trim()) {
        return [custom.trim().replace(/\/$/, ''), ...this.defaultUrls];
      }
    }
    // If we have a cached fastest endpoint, place it first
    if (this.fastestWorkingEndpoint) {
      return [this.fastestWorkingEndpoint, ...this.defaultUrls.filter(u => u !== this.fastestWorkingEndpoint)];
    }
    return this.defaultUrls;
  }

  /**
   * Fast parallel fetch with race & failover across multiple API mirrors (max 1500ms timeout per probe)
   */
  private async fetchWithFastRace(path: string, timeoutMs = 2500): Promise<any> {
    const urls = this.getBaseUrls();

    // 1. Try fastest working endpoint first if available with very short timeout
    if (this.fastestWorkingEndpoint) {
      try {
        const fullUrl = `${this.fastestWorkingEndpoint}/${path}`;
        const res = await fetch(fullUrl, { signal: AbortSignal.timeout(1800) });
        if (res.ok) {
          const data = await res.json();
          if (data && (Array.isArray(data) || Object.keys(data).length > 0)) {
            return data;
          }
        }
      } catch {
        // Fast endpoint had a hiccup, will race all below
      }
    }

    // 2. Race top working endpoints concurrently with Promise.any
    const candidates = urls.slice(0, 4).map(async (base) => {
      const fullUrl = `${base}/${path}`;
      const res = await fetch(fullUrl, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new Error('Empty payload');
      }
      // Record as fastest endpoint
      this.fastestWorkingEndpoint = base;
      return data;
    });

    try {
      return await Promise.any(candidates);
    } catch {
      // 3. Fallback: Try remaining endpoints or CORS proxies in parallel
      const fallbackCandidates = [
        ...urls.slice(4).map(async (base) => {
          const res = await fetch(`${base}/${path}`, { signal: AbortSignal.timeout(2500) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        }),
        ...urls.slice(0, 2).map(async (base) => {
          const target = `${base}/${path}`;
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;
          const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(2800) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        })
      ];

      try {
        return await Promise.any(fallbackCandidates);
      } catch {
        return null;
      }
    }
  }

  /**
   * Search for anime with multi-provider parallel querying and intelligent title preservation
   */
  async search(
    query: string,
    targetMeta?: {
      title: string;
      englishTitle?: string;
      romajiTitle?: string;
      type?: string;
      season?: string;
      year?: number;
    },
    audioMode: 'sub' | 'dub' | 'dual' | 'all' = 'all'
  ): Promise<AnimeSearchResult[]> {
    if (!query || !query.trim()) return [];

    // Construct search variants without aggressively destroying season info
    const variants: string[] = [query.trim()];
    
    // Add specific season searches if target meta exists
    if (targetMeta) {
      if (targetMeta.englishTitle && !variants.includes(targetMeta.englishTitle.trim())) {
        variants.push(targetMeta.englishTitle.trim());
      }
      if (targetMeta.romajiTitle && !variants.includes(targetMeta.romajiTitle.trim())) {
        variants.push(targetMeta.romajiTitle.trim());
      }

      // Add a clean alphanumeric variant
      const cleanAlpha = query.replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
      if (cleanAlpha && !variants.includes(cleanAlpha)) {
        variants.push(cleanAlpha);
      }
    }

    const providers = ['gogoanime', 'zoro', 'animepahe'];
    const collectedResults: AnimeSearchResult[] = [];
    const seenIds = new Set<string>();

    // Query primary search variants in parallel across providers
    const searchPromises = providers.flatMap(provider =>
      variants.slice(0, 2).map(async q => {
        try {
          const data = await this.fetchWithFastRace(`${provider}/${encodeURIComponent(q)}`, 2000);
          const results = data?.results || (Array.isArray(data) ? data : []);
          if (Array.isArray(results)) {
            return results.map((item: any) => ({
              id: `${provider}:${item.id}`,
              title: item.title || item.name || q,
              subOrDub: item.subOrDub === 'dub' || /\bdub\b/i.test(item.title || '') ? ('dub' as const) : ('sub' as const),
              provider,
              image: item.image || item.poster,
              releaseDate: item.releaseDate
            }));
          }
        } catch {
          // Continue
        }
        return [];
      })
    );

    const outcomes = await Promise.allSettled(searchPromises);
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled' && outcome.value) {
        for (const item of outcome.value) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            collectedResults.push(item);
          }
        }
      }
    }

    // If target metadata is supplied, rank results through AnimeMatcher
    if (targetMeta && collectedResults.length > 0) {
      return collectedResults.sort((a, b) => {
        const scoreA = AnimeMatcher.calculateMatchScore(targetMeta, a.title, a.subOrDub, audioMode);
        const scoreB = AnimeMatcher.calculateMatchScore(targetMeta, b.title, b.subOrDub, audioMode);
        return scoreB - scoreA;
      });
    }

    return collectedResults;
  }

  /**
   * Fetch all episodes with fast failover and episode number sorting
   */
  async fetchEpisodes(compoundId: string): Promise<AnimeEpisode[]> {
    const [provider, id] = compoundId.includes(':') ? compoundId.split(':') : ['gogoanime', compoundId];
    const data = await this.fetchWithFastRace(`${provider}/info/${encodeURIComponent(id)}`, 2500);
    
    if (data && data.episodes && Array.isArray(data.episodes) && data.episodes.length > 0) {
      return data.episodes
        .map((ep: any) => ({
          id: `${provider}:${ep.id}`,
          number: typeof ep.number === 'number' ? ep.number : parseInt(ep.number || '1', 10),
          title: ep.title || `Episode ${ep.number}`,
          description: ep.description,
          image: ep.image,
          isFiller: Boolean(ep.isFiller),
        }))
        .sort((a: AnimeEpisode, b: AnimeEpisode) => a.number - b.number);
    }
    return [];
  }

  /**
   * Fetch direct HLS video sources and subtitles
   */
  async fetchSources(compoundEpisodeId: string, server?: string): Promise<StreamData> {
    const [provider, epId] = compoundEpisodeId.includes(':') 
      ? compoundEpisodeId.split(':') 
      : ['gogoanime', compoundEpisodeId];
      
    const path = server
      ? `${provider}/watch/${encodeURIComponent(epId)}?server=${encodeURIComponent(server)}`
      : `${provider}/watch/${encodeURIComponent(epId)}`;

    const data = await this.fetchWithFastRace(path, 3000);
    
    if (data && data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
      const subtitles = (data.subtitles || []).map((sub: any) => ({
        url: sub.url,
        lang: sub.lang || 'English',
        label: sub.label || sub.lang || 'English Subtitles',
        isDefault: sub.lang?.toLowerCase() === 'english' || sub.default === true,
      }));

      return {
        headers: data.headers || {},
        sources: data.sources.map((s: any) => ({
          url: s.url,
          isM3U8: s.isM3U8 || s.url?.includes('.m3u8') || false,
          quality: s.quality || 'Direct CDN 1080p',
        })),
        subtitles,
        download: data.download,
        intro: data.intro ? { start: data.intro.start, end: data.intro.end } : undefined,
        outro: data.outro ? { start: data.outro.start, end: data.outro.end } : undefined,
      };
    }

    return {
      headers: {},
      sources: [],
      subtitles: []
    };
  }
}

export const activeProvider = new FastConsumetProvider();
