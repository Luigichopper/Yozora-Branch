import Hls from 'hls.js';
import { sourceService } from './sourceService';
import { rqbitService } from './rqbitService';
import { activeProvider } from './providers';
import { TorrentSource } from '../types/anime';
import { SubtitleTrack } from './subtitleService';

export interface AnimeStreamSource {
  url: string;
  isHls: boolean;
  quality: string;
  server: string;
  subOrDub?: 'sub' | 'dub' | 'dual' | 'raw';
  subtitles?: SubtitleTrack[];
  torrentSource?: TorrentSource;
  torrentId?: number;
}

class StreamService {
  /**
   * Resolve authentic video releases & direct streams for an anime episode
   */
  public async resolveEpisodeStream(
    animeId: string,
    animeTitle: string,
    romajiTitle?: string,
    episodeNum = 1,
    audioMode: 'sub' | 'dub' | 'dual' | 'all' = 'all'
  ): Promise<AnimeStreamSource[]> {
    const streamSources: AnimeStreamSource[] = [];

    // 1. Fetch real BitTorrent releases from RSS indexers (Nyaa, SubsPlease, Anime Garden, Mikan)
    try {
      const sources = await sourceService.getSourcesForAnime(
        animeId || animeTitle,
        animeTitle,
        romajiTitle,
        audioMode
      );
      if (sources && sources.length > 0) {
        const epSources = sources.filter(s => s.episodeNum === episodeNum || !s.episodeNum);
        const targetSources = epSources.length > 0 ? epSources : sources;

        for (let i = 0; i < Math.min(targetSources.length, 12); i++) {
          const src = targetSources[i];
          const subDubBadge = src.subOrDub === 'dub' ? '[DUB]' : src.subOrDub === 'dual' ? '[DUAL-AUDIO]' : '[SUB]';
          streamSources.push({
            url: '',
            isHls: false,
            quality: `${src.resolution} (${src.codec || 'x264'})`,
            server: `${subDubBadge} [BT] ${src.group || 'Release'} (${src.resolution}) ▲${src.seeders || 0}`,
            subOrDub: src.subOrDub || 'sub',
            torrentSource: src
          });
        }
      }
    } catch (err) {
      console.warn('[StreamService] Torrent RSS fetch error:', err);
    }

    // 2. Direct Anime Scraper & Stream Extractor for direct HTML5 HLS video (if available)
    const searchTerms = [romajiTitle, animeTitle].filter((t): t is string => Boolean(t && t.trim()));
    for (const term of searchTerms) {
      try {
        const searchResults = await activeProvider.search(term);
        if (searchResults && searchResults.length > 0) {
          // If dub requested, try to find dub match first
          let bestMatch = searchResults[0];
          if (audioMode === 'dub') {
            const dubMatch = searchResults.find(r => r.subOrDub === 'dub' || r.title.toLowerCase().includes('dub'));
            if (dubMatch) bestMatch = dubMatch;
          }

          const episodes = await activeProvider.fetchEpisodes(bestMatch.id);
          const targetEp = episodes.find(e => e.number === episodeNum) || episodes[episodeNum - 1] || episodes[0];
          
          if (targetEp) {
            const streamData = await activeProvider.fetchSources(targetEp.id);
            if (streamData.sources && streamData.sources.length > 0) {
              const mappedSubs: SubtitleTrack[] = (streamData.subtitles || []).map((sub, idx) => ({
                id: `prov_sub_${idx}_${sub.lang}`,
                url: sub.url,
                lang: sub.lang,
                label: sub.label || sub.lang || 'Subtitles',
                isDefault: sub.isDefault || sub.lang?.toLowerCase() === 'english'
              }));

              for (const source of streamData.sources) {
                if (source.url && source.url.trim()) {
                  streamSources.unshift({
                    url: source.url,
                    isHls: source.isM3U8 || source.url.includes('.m3u8'),
                    quality: source.quality || 'Direct HLS 1080p',
                    server: `Direct Stream (${bestMatch.title}) • EP ${targetEp.number}`,
                    subOrDub: bestMatch.subOrDub,
                    subtitles: mappedSubs
                  });
                }
              }
            }
          }
          if (streamSources.some(s => s.url)) break;
        }
      } catch {
        // Continue
      }
    }

    return streamSources;
  }

  /**
   * Universal playback handler: Starts sequential stream if magnet/torrent and optionally spawns hardware-accelerated MPV
   */
  public async playAnimeStream(
    magnetOrUrl: string,
    title: string,
    preferredPlayer: 'mpv' | 'webview' = 'webview'
  ): Promise<{ streamUrl: string; launchedMpv: boolean }> {
    let resolvedStreamUrl = magnetOrUrl;

    // 1. If input is a magnet link or .torrent URL, start sequential download in rqbit backend
    if (magnetOrUrl.startsWith('magnet:?') || magnetOrUrl.endsWith('.torrent') || magnetOrUrl.includes('/download/')) {
      try {
        const res = await rqbitService.addTorrentAndGetStream(magnetOrUrl, title);
        if (res && res.stream_url) {
          resolvedStreamUrl = res.stream_url;
        }
      } catch (err) {
        console.warn('[StreamService] Failed to start rqbit stream for torrent:', err);
        throw err;
      }
    }

    // 2. If external MPV is preferred (or if URL is raw 10-bit MKV), launch MPV directly
    if (preferredPlayer === 'mpv') {
      try {
        await rqbitService.launchExternalMpv(resolvedStreamUrl, title);
        return { streamUrl: resolvedStreamUrl, launchedMpv: true };
      } catch (mpvErr) {
        console.warn('[StreamService] Failed to launch external mpv, falling back to webview:', mpvErr);
      }
    }

    return { streamUrl: resolvedStreamUrl, launchedMpv: false };
  }

  /**
   * Attach video element with HLS.js or direct playback
   */
  public attachHlsPlayer(videoElement: HTMLVideoElement, streamUrl: string, onReady?: () => void): Hls | null {
    if (streamUrl.includes('.m3u8')) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(videoElement);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          onReady?.();
        });
        return hls;
      } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        videoElement.src = streamUrl;
        onReady?.();
      }
    } else {
      videoElement.src = streamUrl;
    }
    return null;
  }
}

export const streamService = new StreamService();
