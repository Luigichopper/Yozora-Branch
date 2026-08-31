import { AnimeEpisode, StreamData } from '../../types/anime';

export interface AnimeProvider {
  name: string;
  search(query: string): Promise<{ id: string; title: string; subOrDub: 'sub' | 'dub' }[]>;
  fetchEpisodes(animeId: string): Promise<AnimeEpisode[]>;
  fetchSources(episodeId: string, server?: string): Promise<StreamData>;
}

// Multi-instance public Consumet, Aniwatch, and Anime API endpoints
const PUBLIC_ANIME_API_ENDPOINTS = [
  'https://api.consumet.stream/anime',
  'https://consumet-api.vercel.app/anime',
  'https://api-consumet.vercel.app/anime',
  'https://anime-api-consumet.onrender.com/anime',
  'https://api.amvstr.me/api/v2',
  'https://api.anify.tv'
];

export class ConsumetProvider implements AnimeProvider {
  public name = 'Anime Stream Resolver & Direct CDN';
  private defaultUrls = PUBLIC_ANIME_API_ENDPOINTS;

  private getBaseUrls(): string[] {
    if (typeof localStorage !== 'undefined') {
      const custom = localStorage.getItem('yozora_consumet_api_url');
      if (custom && custom.trim()) {
        return [custom.trim().replace(/\/$/, ''), ...this.defaultUrls];
      }
    }
    return this.defaultUrls;
  }

  private cleanTitle(title: string): string {
    return (title || '')
      .replace(/\(TV\)/gi, '')
      .replace(/\(Season \d+\)/gi, '')
      .replace(/Season \d+/gi, '')
      .replace(/Part \d+/gi, '')
      .replace(/2nd Season|3rd Season|4th Season/gi, '')
      .replace(/:\s*Chapter.*$/gi, '')
      .replace(/:\s*Arc.*$/gi, '')
      .trim();
  }

  private async fetchWithFailover(path: string, timeoutMs = 3000): Promise<any> {
    const urls = this.getBaseUrls();
    for (const base of urls) {
      try {
        const fullUrl = `${base}/${path}`;
        const res = await fetch(fullUrl, { signal: AbortSignal.timeout(timeoutMs) });
        if (res.ok) {
          const data = await res.json();
          if (data && (Array.isArray(data) || Object.keys(data).length > 0)) {
            return data;
          }
        }
      } catch {
        // Try next endpoint
      }
    }

    // Try via CORS proxy if direct endpoints were blocked
    for (const base of urls.slice(0, 2)) {
      try {
        const target = `${base}/${path}`;
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;
        const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(3500) });
        if (res.ok) {
          const data = await res.json();
          if (data) return data;
        }
      } catch {
        // Continue
      }
    }
    return null;
  }

  async search(query: string): Promise<{ id: string; title: string; subOrDub: 'sub' | 'dub' }[]> {
    const cleaned = this.cleanTitle(query);
    const searchVariants = Array.from(new Set([query, cleaned])).filter(Boolean);
    const providers = ['gogoanime', 'zoro', 'animepahe'];

    for (const q of searchVariants) {
      for (const provider of providers) {
        try {
          const data = await this.fetchWithFailover(`${provider}/${encodeURIComponent(q)}`, 2500);
          const results = data?.results || (Array.isArray(data) ? data : []);
          if (results && results.length > 0) {
            return results.map((item: any) => ({
              id: `${provider}:${item.id}`,
              title: item.title || item.name || q,
              subOrDub: item.subOrDub || 'sub',
            }));
          }
        } catch {
          // Try next variant/provider
        }
      }
    }
    return [];
  }

  async fetchEpisodes(compoundId: string): Promise<AnimeEpisode[]> {
    const [provider, id] = compoundId.includes(':') ? compoundId.split(':') : ['gogoanime', compoundId];
    const data = await this.fetchWithFailover(`${provider}/info/${encodeURIComponent(id)}`, 3500);
    
    if (data && data.episodes && Array.isArray(data.episodes)) {
      return data.episodes.map((ep: any) => ({
        id: `${provider}:${ep.id}`,
        number: ep.number,
        title: ep.title || `Episode ${ep.number}`,
        description: ep.description,
        image: ep.image,
        isFiller: Boolean(ep.isFiller),
      }));
    }
    return [];
  }

  async fetchSources(compoundEpisodeId: string): Promise<StreamData> {
    const [provider, epId] = compoundEpisodeId.includes(':') 
      ? compoundEpisodeId.split(':') 
      : ['gogoanime', compoundEpisodeId];
      
    const data = await this.fetchWithFailover(`${provider}/watch/${encodeURIComponent(epId)}`, 4000);
    
    if (data && data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
      const subtitles = (data.subtitles || []).map((sub: any) => ({
        url: sub.url,
        lang: sub.lang || 'Unknown',
        label: sub.label || sub.lang || 'Subtitles',
        isDefault: sub.lang?.toLowerCase() === 'english' || sub.default === true,
      }));

      return {
        headers: data.headers || {},
        sources: data.sources.map((s: any) => ({
          url: s.url,
          isM3U8: s.isM3U8 || s.url.includes('.m3u8'),
          quality: s.quality || '1080p',
        })),
        subtitles,
        download: data.download,
        intro: data.intro ? { start: data.intro.start, end: data.intro.end } : undefined,
        outro: data.outro ? { start: data.outro.start, end: data.outro.end } : undefined,
      };
    }

    // Return empty sources rather than fake placeholder videos
    return {
      headers: {},
      sources: [],
      subtitles: []
    };
  }
}

export const activeProvider = new ConsumetProvider();
