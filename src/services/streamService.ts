import Hls from 'hls.js';
import { sourceService } from './sourceService';
import { rqbitService } from './rqbitService';
import { activeProvider } from './providers';
import { TorrentSource } from '../types/anime';
import { SubtitleTrack } from './subtitleService';
import { AnimeMatcher } from './animeMatcher';

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

export interface AnimeMetadataQuery {
  id: string;
  title: string;
  romajiTitle?: string;
  englishTitle?: string;
  type?: string;
  season?: string;
  year?: number;
}

class StreamService {
  /**
   * Resolve authentic video releases & direct streams for an anime episode with parallel acceleration & precision matching
   */
  public async resolveEpisodeStream(
    animeOrId: string | AnimeMetadataQuery,
    animeTitle?: string,
    romajiTitle?: string,
    episodeNum = 1,
    audioMode: 'sub' | 'dub' | 'dual' | 'all' = 'all'
  ): Promise<AnimeStreamSource[]> {
    // Construct normalized metadata target object
    let targetMeta: AnimeMetadataQuery;
    if (typeof animeOrId === 'object') {
      targetMeta = animeOrId;
    } else {
      targetMeta = {
        id: animeOrId,
        title: animeTitle || animeOrId,
        romajiTitle,
        englishTitle: animeTitle
      };
    }

    const primaryTitle = targetMeta.title || targetMeta.romajiTitle || targetMeta.id;
    const streamSources: AnimeStreamSource[] = [];

    // Run Direct Scraper Resolution and BitTorrent RSS Fetching in PARALLEL for maximum speed
    const [directResult, torrentResult] = await Promise.allSettled([
      this.resolveDirectHlsStreams(targetMeta, episodeNum, audioMode),
      this.resolveTorrentRssSources(targetMeta, episodeNum, audioMode)
    ]);

    // 1. Add Direct High-Speed CDN & HLS streams FIRST (for instant < 1s playback)
    if (directResult.status === 'fulfilled' && directResult.value.length > 0) {
      streamSources.push(...directResult.value);
    }

    // 2. Append BitTorrent RSS releases
    if (torrentResult.status === 'fulfilled' && torrentResult.value.length > 0) {
      streamSources.push(...torrentResult.value);
    }

    return streamSources;
  }

  /**
   * Direct scraper & CDN HLS stream resolution with precision season & episode disambiguation
   */
  private async resolveDirectHlsStreams(
    targetMeta: AnimeMetadataQuery,
    episodeNum = 1,
    audioMode: 'sub' | 'dub' | 'dual' | 'all' = 'all'
  ): Promise<AnimeStreamSource[]> {
    const directSources: AnimeStreamSource[] = [];
    const searchTerms = [
      targetMeta.title,
      targetMeta.englishTitle,
      targetMeta.romajiTitle
    ].filter((t): t is string => Boolean(t && t.trim()));

    const uniqueTerms = Array.from(new Set(searchTerms));

    for (const term of uniqueTerms) {
      try {
        const searchResults = await activeProvider.search(term, targetMeta, audioMode);
        if (searchResults && searchResults.length > 0) {
          // Use AnimeMatcher to select the genuinely correct season/show match
          const { match: bestMatch } = AnimeMatcher.pickBestMatch(targetMeta, searchResults, audioMode);
          
          if (bestMatch) {
            const episodes = await activeProvider.fetchEpisodes(bestMatch.id);
            if (episodes && episodes.length > 0) {
              // Exact episode match
              const targetEp = episodes.find(e => e.number === episodeNum) ||
                               episodes.find(e => e.id.endsWith(`-${episodeNum}`) || e.id.endsWith(`_${episodeNum}`)) ||
                               episodes[episodeNum - 1] ||
                               episodes[0];

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
                      const qualityLabel = source.quality || 'Direct 1080p';
                      const subDubBadge = bestMatch.subOrDub === 'dub' ? '[DUB]' : '[SUB]';
                      directSources.push({
                        url: source.url,
                        isHls: source.isM3U8 || source.url.includes('.m3u8'),
                        quality: qualityLabel,
                        server: `${subDubBadge} Direct Stream (${bestMatch.title}) • EP ${targetEp.number}`,
                        subOrDub: bestMatch.subOrDub,
                        subtitles: mappedSubs
                      });
                    }
                  }
                }
              }
            }
          }
          if (directSources.length > 0) break;
        }
      } catch (err) {
        console.warn('[StreamService] Direct stream scrape attempt failed:', err);
      }
    }

    return directSources;
  }

  /**
   * Fetch BitTorrent RSS releases
   */
  private async resolveTorrentRssSources(
    targetMeta: AnimeMetadataQuery,
    episodeNum = 1,
    audioMode: 'sub' | 'dub' | 'dual' | 'all' = 'all'
  ): Promise<AnimeStreamSource[]> {
    const torrentStreams: AnimeStreamSource[] = [];
    try {
      const sources = await sourceService.getSourcesForAnime(
        targetMeta.id,
        targetMeta.title,
        targetMeta.romajiTitle,
        audioMode
      );

      if (sources && sources.length > 0) {
        const epSources = sources.filter(s => s.episodeNum === episodeNum || !s.episodeNum);
        const targetSources = epSources.length > 0 ? epSources : sources;

        for (let i = 0; i < Math.min(targetSources.length, 10); i++) {
          const src = targetSources[i];
          const subDubBadge = src.subOrDub === 'dub' ? '[DUB]' : src.subOrDub === 'dual' ? '[DUAL-AUDIO]' : '[SUB]';
          torrentStreams.push({
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
    return torrentStreams;
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
          lowLatencyMode: true,
          backBufferLength: 90,
          maxBufferLength: 30,
          maxMaxBufferLength: 60
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
