import { db } from './db';

export interface RqbitStatus {
  running: boolean;
  listen_addr: string;
  pid?: number;
}

export interface StreamResult {
  torrent_id: number;
  file_index: number;
  file_name: string;
  file_size: number;
  stream_url: string;
}

export interface RqbitTorrentStats {
  id: number;
  name: string;
  progress_bytes: number;
  total_bytes: number;
  download_speed: number;
  upload_speed: number;
  state: 'downloading' | 'paused' | 'seeding' | 'error';
  peers: number;
}

class RqbitService {
  private defaultPort = '3030';
  private cachedListenAddr: string | null = null;

  public async getListenAddr(): Promise<string> {
    if (this.cachedListenAddr) return this.cachedListenAddr;
    const port = await db.getSetting<string>('rqbit_port', this.defaultPort);
    this.cachedListenAddr = `127.0.0.1:${port || this.defaultPort}`;
    return this.cachedListenAddr;
  }

  public setListenPort(port: string): void {
    const cleanPort = (port || '').trim() || this.defaultPort;
    this.cachedListenAddr = `127.0.0.1:${cleanPort}`;
  }

  public isTauri(): boolean {
    return typeof window !== 'undefined' && '__TAURI__' in window;
  }

  private async invokeTauri<T>(cmd: string, args?: Record<string, any>): Promise<T> {
    const tauri = (window as any).__TAURI__;
    if (tauri && tauri.invoke) {
      return await tauri.invoke(cmd, args);
    }
    throw new Error('Tauri IPC not available in standard browser environment');
  }

  /**
   * Start rqbit background server process
   */
  public async startServer(listenAddr?: string, cacheDir?: string): Promise<RqbitStatus> {
    const addr = listenAddr || (await this.getListenAddr());

    if (this.isTauri()) {
      try {
        return await this.invokeTauri<RqbitStatus>('start_rqbit_server', {
          listenAddr: addr,
          cacheDir
        });
      } catch (e: any) {
        console.warn('Tauri start_rqbit_server failed:', e);
        throw new Error(typeof e === 'string' ? e : e?.message || 'Failed to spawn rqbit binary');
      }
    }

    // Direct HTTP ping check
    const status = await this.checkStatus(addr);
    if (!status.running) {
      throw new Error(`rqbit daemon is not listening on ${addr}. Ensure rqbit is installed ('cargo install rqbit') and running in background.`);
    }
    return status;
  }

  /**
   * Stop rqbit background server process
   */
  public async stopServer(): Promise<boolean> {
    if (this.isTauri()) {
      try {
        return await this.invokeTauri<boolean>('stop_rqbit_server');
      } catch (e) {
        console.warn('Tauri stop_rqbit_server error:', e);
      }
    }
    return false;
  }

  /**
   * List all torrents currently active or cached in rqbit
   */
  public async listTorrents(listenAddr?: string): Promise<RqbitTorrentStats[]> {
    const addr = listenAddr || (await this.getListenAddr());
    try {
      const res = await fetch(`http://${addr}/torrents`, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) return [];
      const data = await res.json();
      const rawList: any[] = Array.isArray(data) ? data : (data.torrents || []);

      return rawList.map(t => ({
        id: t.id ?? 0,
        name: t.name || t.details?.name || `Torrent #${t.id}`,
        progress_bytes: t.progress_bytes || t.downloaded_bytes || 0,
        total_bytes: t.total_bytes || t.details?.total_bytes || t.details?.length || 0,
        download_speed: t.download_speed || 0,
        upload_speed: t.upload_speed || 0,
        state: t.state || (t.is_paused ? 'paused' : 'downloading'),
        peers: t.live?.live_peers || t.peers || 0
      }));
    } catch {
      return [];
    }
  }

  /**
   * Delete a torrent and permanently wipe its downloaded files from disk
   */
  public async deleteTorrent(torrentId: number, deleteFiles = true, listenAddr?: string): Promise<boolean> {
    const addr = listenAddr || (await this.getListenAddr());
    try {
      const res = await fetch(`http://${addr}/torrents/${torrentId}?delete_files=${deleteFiles}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(3000)
      });
      return res.ok;
    } catch (e) {
      console.warn(`[rqbit] Failed to delete torrent ${torrentId}:`, e);
      return false;
    }
  }

  /**
   * Purge all torrents and permanently erase all cached video files from disk to prevent storage bloat
   */
  public async purgeAllTorrentsAndCache(listenAddr?: string): Promise<{ deletedCount: number; freedBytes: number }> {
    const torrents = await this.listTorrents(listenAddr);
    let deletedCount = 0;
    let freedBytes = 0;

    for (const t of torrents) {
      freedBytes += (t.progress_bytes || t.total_bytes || 0);
      const ok = await this.deleteTorrent(t.id, true, listenAddr);
      if (ok) deletedCount++;
    }

    return { deletedCount, freedBytes };
  }

  /**
   * Auto-prune older torrents to keep disk usage strictly below retention limit
   */
  public async autoPruneCache(keepLatestCount = 1, listenAddr?: string): Promise<void> {
    const autoClean = await db.getSetting<boolean>('auto_cleanup_rqbit_cache', true);
    if (!autoClean) return;

    const torrents = await this.listTorrents(listenAddr);
    if (torrents.length > keepLatestCount) {
      // Delete older torrents, keeping only the most recent keepLatestCount
      const toDelete = torrents.slice(0, torrents.length - keepLatestCount);
      for (const t of toDelete) {
        await this.deleteTorrent(t.id, true, listenAddr);
      }
    }
  }

  /**
   * Check if rqbit REST API is listening (silent check without error spam)
   */
  public async checkStatus(listenAddr?: string): Promise<RqbitStatus> {
    const addr = listenAddr || (await this.getListenAddr());

    if (this.isTauri()) {
      try {
        return await this.invokeTauri<RqbitStatus>('get_rqbit_status', { listenAddr: addr });
      } catch (e) {
        // Fallthrough to direct fetch
      }
    }

    try {
      const res = await fetch(`http://${addr}/torrents`, {
        signal: AbortSignal.timeout(800)
      });
      return {
        running: res.ok,
        listen_addr: addr
      };
    } catch {
      return {
        running: false,
        listen_addr: addr
      };
    }
  }

  /**
   * Add magnet/torrent URL and get sequential stream endpoint for mpv / HTML5 player
   */
  public async addTorrentAndGetStream(
    torrentUriOrMagnet: string,
    animeTitle: string,
    listenAddr?: string
  ): Promise<StreamResult> {
    const payload = (torrentUriOrMagnet || '').trim();
    if (!payload) {
      throw new Error('No valid magnet link or .torrent URL provided for streaming');
    }

    const addr = listenAddr || (await this.getListenAddr());

    // 1. If running under Tauri, ensure daemon is running
    if (this.isTauri()) {
      try {
        const status = await this.checkStatus(addr);
        if (!status.running) {
          try {
            await this.startServer(addr);
            // Brief pause for server socket binding
            await new Promise(r => setTimeout(r, 600));
          } catch (startErr) {
            console.warn('Auto-starting rqbit server failed:', startErr);
          }
        }

        return await this.invokeTauri<StreamResult>('add_torrent_stream', {
          listenAddr: addr,
          magnet: payload
        });
      } catch (e: any) {
        console.warn('Tauri add_torrent_stream error:', e);
      }
    }

    // 2. In browser environment, check if rqbit daemon is actually listening before attempting requests
    const daemonStatus = await this.checkStatus(addr);
    if (!daemonStatus.running) {
      throw new Error(`rqbit background engine is not running on ${addr}. Start rqbit on your system for direct BitTorrent sequential streaming.`);
    }

    // 3. Direct HTTP REST API with accurate infoHash resolution
    try {
      const match = payload.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
      const targetHash = match ? match[1].toLowerCase() : '';
      let torrentId: number | null = null;
      let initialFiles: any[] = [];

      // Check if already registered in rqbit (strict infoHash match only)
      try {
        const listRes = await fetch(`http://${addr}/torrents`, { signal: AbortSignal.timeout(2000) });
        if (listRes.ok) {
          const listData = await listRes.json();
          const torrents: any[] = Array.isArray(listData) ? listData : (listData.torrents || []);
          const found = targetHash ? torrents.find((t: any) => {
            const h = (t.info_hash || t.infoHash || '').toLowerCase();
            return h === targetHash;
          }) : null;
          if (found && found.id !== undefined) {
            torrentId = found.id;
          }
        }
      } catch {}

      // If not yet registered, POST to rqbit (rqbit accepts magnet:?, http://, https://, or local file)
      if (torrentId === null) {
        const res = await fetch(`http://${addr}/torrents?overwrite=true`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: payload,
          signal: AbortSignal.timeout(4000)
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.id !== undefined) {
            torrentId = data.id;
          } else if (data?.details?.id !== undefined) {
            torrentId = data.details.id;
          }
          if (data?.details?.files && Array.isArray(data.details.files)) {
            initialFiles = data.details.files;
          }
        }
      }

      if (torrentId !== null) {
        let targetFileIndex = 0;
        let fileName = `${animeTitle}.mkv`;
        let fileSize = 0;

        // Query file details to ensure we stream the primary media file
        try {
          let files: any[] = initialFiles;
          if (files.length === 0) {
            const detailsRes = await fetch(`http://${addr}/torrents/${torrentId}`, { signal: AbortSignal.timeout(2000) });
            if (detailsRes.ok) {
              const details = await detailsRes.json();
              files = details.files || [];
            }
          }
          if (files.length > 0) {
            let bestIdx = 0;
            let maxLen = 0;
            let bestFile = files[0];

            // 1. Prioritize video files
            for (let idx = 0; idx < files.length; idx++) {
              const f = files[idx];
              const isVid = /\.(mkv|mp4|webm|avi|ts)$/i.test(f.name || '');
              const len = f.length || 0;
              if (isVid && len > maxLen) {
                maxLen = len;
                bestIdx = idx;
                bestFile = f;
              }
            }

            // 2. Fallback to largest file overall
            if (maxLen === 0) {
              for (let idx = 0; idx < files.length; idx++) {
                const f = files[idx];
                const len = f.length || 0;
                if (len > maxLen) {
                  maxLen = len;
                  bestIdx = idx;
                  bestFile = f;
                }
              }
            }

            targetFileIndex = bestIdx;
            fileName = bestFile.name || fileName;
            fileSize = bestFile.length || fileSize;
          }
        } catch {}

        return {
          torrent_id: torrentId,
          file_index: targetFileIndex,
          file_name: fileName,
          file_size: fileSize,
          stream_url: `http://${addr}/torrents/${torrentId}/stream/${targetFileIndex}`
        };
      }
    } catch {}

    throw new Error(`Failed to resolve sequential stream for this release.`);
  }

  /**
   * Launch external mpv binary with hardware acceleration and IPC
   */
  public async launchExternalMpv(streamUrl: string, title: string): Promise<boolean> {
      if (this.isTauri()) {
        try {
          return await this.invokeTauri<boolean>('launch_external_mpv', {
            streamUrl,
            title
          });
        } catch (e: any) {
          console.warn('Failed to launch external mpv:', e);
          throw new Error(typeof e === 'string' ? e : e?.message || 'Failed to spawn mpv process');
        }
      }
      return false;
    }

  /**
   * Open mpv player alias
   */
  public async openMpvPlayer(streamUrl: string, title: string): Promise<void> {
    await this.launchExternalMpv(streamUrl, title);
  }
}

export const rqbitService = new RqbitService();

