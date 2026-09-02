import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  X,
  RotateCcw,
  RotateCw,
  FastForward,
  Activity,
  FolderOpen,
  Link,
  Film,
  Check,
  AlertCircle,
  Radio,
  ChevronLeft,
  ChevronRight,
  Server,
  Layers,
  Sparkles,
  Download,
  Terminal,
  Subtitles,
  Globe,
  Sliders,
  Upload,
  Clock,
  Type,
  Volume1
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { streamService, AnimeStreamSource } from '../services/streamService';
import { sourceService } from '../services/sourceService';
import { rqbitService } from '../services/rqbitService';
import { torrentEngine } from '../services/torrentEngine';
import { Episode, TorrentSource } from '../types/anime';
import { db } from '../services/db';
import {
  subtitleService,
  SubtitleTrack,
  SubtitleCue,
  SubtitleStyleConfig,
  DEFAULT_SUBTITLE_STYLE,
  SUPPORTED_LANGUAGES
} from '../services/subtitleService';

export const PlayerView: React.FC = () => {
  const {
    playerState,
    openPlayer,
    closePlayer,
    setAnimeProgress,
    showToast
  } = useApp();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const subtitleFileInputRef = useRef<HTMLInputElement | null>(null);
  const hlsInstanceRef = useRef<any>(null);

  const [currentVideoSrc, setCurrentVideoSrc] = useState<string>(playerState?.videoUrl || '');
  const [streamMirrors, setStreamMirrors] = useState<AnimeStreamSource[]>([]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [bufferedTime, setBufferedTime] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showStatsForNerds, setShowStatsForNerds] = useState<boolean>(false);
  const [showUrlDialog, setShowUrlDialog] = useState<boolean>(false);
  const [customStreamUrl, setCustomStreamUrl] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [needsUserClickToStart, setNeedsUserClickToStart] = useState<boolean>(false);
  const [autoSkipOp, setAutoSkipOp] = useState<boolean>(false);
  const [hasVideoError, setHasVideoError] = useState<boolean>(false);
  const [showMirrorsDropdown, setShowMirrorsDropdown] = useState<boolean>(false);
  const [activeMirrorTitle, setActiveMirrorTitle] = useState<string>('Connecting Source...');
  const [selectedTorrentRelease, setSelectedTorrentRelease] = useState<TorrentSource | null>(null);

  // Subtitle & Language States
  const [audioMode, setAudioMode] = useState<'sub' | 'dub' | 'dual' | 'all'>('sub');
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [activeSubtitleTrack, setActiveSubtitleTrack] = useState<SubtitleTrack | null>(null);
  const [activeSubtitleCue, setActiveSubtitleCue] = useState<SubtitleCue | null>(null);
  const [subtitleDelayMs, setSubtitleDelayMs] = useState<number>(0);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState<boolean>(false);
  const [subtitleTab, setSubtitleTab] = useState<'tracks' | 'audio' | 'style' | 'sync'>('tracks');
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyleConfig>(DEFAULT_SUBTITLE_STYLE);
  const [customSubtitleUrl, setCustomSubtitleUrl] = useState<string>('');
  const [preferredSubLang, setPreferredSubLang] = useState<string>('en');
  const [preferredAudioLang, setPreferredAudioLang] = useState<string>('ja');

  // Seekbar scrubbing preview state
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPositionX, setHoverPositionX] = useState<number>(0);

  // Live Playback Telemetry
  const [telemetry, setTelemetry] = useState({
    videoWidth: 0,
    videoHeight: 0,
    fps: 0,
    droppedFrames: 0,
    bitrateKbps: 0,
    bufferPercent: 0
  });

  const controlsTimeoutRef = useRef<number | null>(null);
  const lastOpSkipTriggerRef = useRef<boolean>(false);

  // Load language & subtitle styling preferences on mount
  useEffect(() => {
    async function loadPreferences() {
      const savedStyle = await subtitleService.getSubtitleStyle();
      setSubtitleStyle(savedStyle);

      const langPrefs = await subtitleService.getLanguagePreferences();
      setAudioMode(langPrefs.defaultAudioMode);
      setPreferredSubLang(langPrefs.preferredSubLang);
      setPreferredAudioLang(langPrefs.preferredAudioLang);
    }
    loadPreferences();
  }, []);

  // Initialize player state & resolve stream mirrors
  useEffect(() => {
    if (playerState) {
      const initPlayer = async () => {
        setHasVideoError(false);
        const preferExternalMpv = await db.getSetting<boolean>('use_external_mpv', false);

        // 1. If a direct / cached video URL is already present, start playing it immediately
        if (playerState.videoUrl && playerState.videoUrl.trim()) {
          setCurrentVideoSrc(playerState.videoUrl);
          setIsLoadingStream(false);
          setActiveMirrorTitle('Direct Stream');
          if (preferExternalMpv) {
            try {
              await rqbitService.launchExternalMpv(playerState.videoUrl, playerState.anime.title);
              showToast(`Launched external mpv for "${playerState.anime.title}"`, 'success');
            } catch (err: any) {
              showToast(err.message || 'Failed to launch mpv', 'error');
            }
          }
          return;
        }

        // 2. Otherwise dynamically resolve authentic BitTorrent sources & direct streams based on audioMode
        setIsLoadingStream(true);
        try {
          const resolved = await streamService.resolveEpisodeStream(
            {
              id: playerState.anime.id,
              title: playerState.anime.title,
              romajiTitle: playerState.anime.romajiTitle,
              englishTitle: playerState.anime.englishTitle,
              type: playerState.anime.type,
              season: playerState.anime.season,
              year: playerState.anime.year
            },
            playerState.anime.title,
            playerState.anime.romajiTitle,
            playerState.episode.epNumber,
            audioMode
          );
          setStreamMirrors(resolved);

          // Collect subtitle tracks from resolved sources
          const extractedSubs: SubtitleTrack[] = [];
          resolved.forEach(r => {
            if (r.subtitles && r.subtitles.length > 0) {
              r.subtitles.forEach(s => {
                if (!extractedSubs.some(existing => existing.url === s.url || existing.label === s.label)) {
                  extractedSubs.push(s);
                }
              });
            }
          });

          // Add default English sub track if none present
          if (extractedSubs.length > 0) {
            setSubtitleTracks(extractedSubs);
            // Select preferred language or default
            const match = extractedSubs.find(s => s.lang.toLowerCase().includes(preferredSubLang.toLowerCase())) || extractedSubs[0];
            if (match) {
              handleSelectSubtitleTrack(match);
            }
          }

          if (resolved.length > 0) {
            const direct = resolved.find(r => r.url && r.url.trim());
            const torrent = resolved.find(r => r.torrentSource);

            if (direct && direct.url) {
              setCurrentVideoSrc(direct.url);
              setActiveMirrorTitle(direct.server || 'Direct Stream 1080p');
            } else if (torrent && torrent.torrentSource) {
              setSelectedTorrentRelease(torrent.torrentSource);
              setActiveMirrorTitle(torrent.server);
              const uri = sourceService.getSourceUri(torrent.torrentSource);
              if (uri) {
                try {
                  const res = await rqbitService.addTorrentAndGetStream(uri, playerState.anime.title);
                  if (res?.stream_url) {
                    setCurrentVideoSrc(res.stream_url);
                    const retention = await db.getSetting<number>('rqbit_retention_count', 1);
                    rqbitService.autoPruneCache(retention).catch(() => {});
                  }
                } catch {
                  // rqbit daemon not running yet, show torrent connect prompt
                }
              }
            }

            if (preferExternalMpv && direct?.url) {
              try {
                await rqbitService.launchExternalMpv(direct.url, playerState.anime.title);
                showToast(`Launched external mpv for "${playerState.anime.title}"`, 'success');
              } catch (err: any) {
                console.warn('Failed to launch external mpv:', err);
              }
            }
          }
        } catch (err) {
          console.warn('[Player] Stream resolution error:', err);
        } finally {
          setIsLoadingStream(false);
        }
      };

      initPlayer();
    }
  }, [playerState, audioMode]);

  // Handle Video Source and Hls.js setup
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentVideoSrc) return;

    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }

    const hls = streamService.attachHlsPlayer(video, currentVideoSrc, () => {
      video.play().then(() => {
        setIsPlaying(true);
        setNeedsUserClickToStart(false);
        setHasVideoError(false);
      }).catch((err) => {
        console.warn('Autoplay prevented:', err);
        setNeedsUserClickToStart(true);
      });
    });

    if (hls) {
      hlsInstanceRef.current = hls;
    } else {
      video.load();
      video.play().then(() => {
        setIsPlaying(true);
        setNeedsUserClickToStart(false);
        setHasVideoError(false);
      }).catch((err) => {
        console.warn('Autoplay blocked:', err);
        setNeedsUserClickToStart(true);
      });
    }

    return () => {
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }
    };
  }, [currentVideoSrc]);

  // Video time & buffer tracking + Subtitle Cue lookup
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const cur = video.currentTime;
    setCurrentTime(cur);

    // Subtitle cue matching with delay offset
    if (activeSubtitleTrack?.cues && activeSubtitleTrack.cues.length > 0) {
      const cue = subtitleService.getActiveCue(activeSubtitleTrack.cues, cur, subtitleDelayMs);
      setActiveSubtitleCue(cue);
    } else {
      setActiveSubtitleCue(null);
    }

    if (video.buffered.length > 0) {
      const bufEnd = video.buffered.end(video.buffered.length - 1);
      setBufferedTime(bufEnd);
    }

    // Auto Skip Opening (only if valid op timestamps exist and not a movie)
    if (autoSkipOp && playerState?.episode.opSkipStart && playerState?.episode.opSkipEnd && playerState?.anime.type !== 'Movie') {
      const start = playerState.episode.opSkipStart;
      const end = playerState.episode.opSkipEnd;
      if (cur >= start && cur < end && !lastOpSkipTriggerRef.current) {
        lastOpSkipTriggerRef.current = true;
        video.currentTime = end;
        showToast(`Auto-skipped Opening (OP) to ${formatTime(end)}`, 'info');
      } else if (cur < start || cur > end) {
        lastOpSkipTriggerRef.current = false;
      }
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration || 0);
    setTelemetry(prev => ({
      ...prev,
      videoWidth: video.videoWidth || 0,
      videoHeight: video.videoHeight || 0
    }));
  };

  // Video error handling with automatic fallback to next available mirror
  const handleVideoError = () => {
    console.warn(`[Player] Video load error on source: ${currentVideoSrc}`);
    
    // Check if there are other alternative mirrors available
    const otherMirrors = streamMirrors.filter(m => m.url && m.url !== currentVideoSrc);
    if (otherMirrors.length > 0) {
      const nextMirror = otherMirrors[0];
      showToast(`Stream mirror failed. Auto-switching to: ${nextMirror.server}...`, 'info');
      setCurrentVideoSrc(nextMirror.url);
      setActiveMirrorTitle(nextMirror.server);
      setHasVideoError(false);
      return;
    }

    setHasVideoError(true);
    setIsPlaying(false);
  };

  // Switch Stream Mirror / BitTorrent Release
  const handleSwitchMirror = async (mirror: AnimeStreamSource) => {
    setShowMirrorsDropdown(false);

    if (mirror.url && mirror.url.trim()) {
      setCurrentVideoSrc(mirror.url);
      setActiveMirrorTitle(mirror.server);
      setSelectedTorrentRelease(null);
      setHasVideoError(false);

      if (mirror.subtitles && mirror.subtitles.length > 0) {
        setSubtitleTracks(mirror.subtitles);
        const match = mirror.subtitles.find(s => s.lang.toLowerCase().includes(preferredSubLang.toLowerCase())) || mirror.subtitles[0];
        if (match) handleSelectSubtitleTrack(match);
      }

      showToast(`Switched to stream: ${mirror.server}`, 'info');
    } else if (mirror.torrentSource) {
      setSelectedTorrentRelease(mirror.torrentSource);
      setActiveMirrorTitle(mirror.server);
      const uri = sourceService.getSourceUri(mirror.torrentSource);
      if (uri) {
        showToast(`Connecting to BitTorrent stream for ${mirror.server}...`, 'info');
        try {
          const res = await rqbitService.addTorrentAndGetStream(uri, playerState?.anime.title || 'Anime');
          if (res?.stream_url) {
            setCurrentVideoSrc(res.stream_url);
            setHasVideoError(false);
            showToast('Sequential BitTorrent streaming active', 'success');
            return;
          }
        } catch {
          const video = videoRef.current;
          if (video) {
            try {
              await torrentEngine.streamToVideoElement(uri, video, 6000);
              setIsPlaying(true);
              setHasVideoError(false);
              showToast('In-browser WebTorrent swarm active', 'info');
            } catch {
              setHasVideoError(true);
              showToast('Could not connect to rqbit daemon. Please check that rqbit is running on port 3030.', 'error');
            }
          }
        }
      }
    }
  };

  // Switch Sub / Dub Mode
  const handleToggleAudioMode = async (mode: 'sub' | 'dub' | 'dual' | 'all') => {
    setAudioMode(mode);
    await subtitleService.saveLanguagePreferences({ defaultAudioMode: mode });
    showToast(`Switched audio mode to: ${mode.toUpperCase()}`, 'info');
  };

  // Subtitle Selection & Fetching
  const handleSelectSubtitleTrack = async (track: SubtitleTrack | null) => {
    if (!track) {
      setActiveSubtitleTrack(null);
      setActiveSubtitleCue(null);
      showToast('Subtitles disabled', 'info');
      return;
    }

    // If cues are not yet parsed (e.g. from remote URL), fetch and parse them
    if (!track.cues || track.cues.length === 0) {
      if (track.url) {
        try {
          showToast(`Loading subtitles: ${track.label}...`, 'info');
          const fetched = await subtitleService.fetchRemoteSubtitles(track.url, track.label, track.lang);
          track.cues = fetched.cues;
        } catch (err: any) {
          showToast(`Failed to load subtitle file from ${track.url}`, 'error');
        }
      }
    }

    setActiveSubtitleTrack(track);
    showToast(`Active Subtitles: ${track.label}`, 'success');
  };

  // Upload local Subtitle File (.srt, .vtt, .ass)
  const handleLocalSubtitleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsedTrack = await subtitleService.loadFromFile(file);
      setSubtitleTracks(prev => [parsedTrack, ...prev]);
      setActiveSubtitleTrack(parsedTrack);
      showToast(`Loaded local subtitle: "${file.name}" (${parsedTrack.cues?.length || 0} cues)`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to parse subtitle file', 'error');
    }
  };

  // Load Custom Subtitle URL
  const handleLoadCustomSubtitleUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSubtitleUrl.trim()) return;
    try {
      const url = customSubtitleUrl.trim();
      const track = await subtitleService.fetchRemoteSubtitles(url, 'Custom Subtitle URL');
      setSubtitleTracks(prev => [track, ...prev]);
      setActiveSubtitleTrack(track);
      setCustomSubtitleUrl('');
      showToast(`Loaded ${track.cues?.length || 0} subtitle cues from URL!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Could not fetch subtitle URL', 'error');
    }
  };

  // Next / Previous Episode Navigation
  const handleNavigateEpisode = (direction: 'prev' | 'next') => {
    if (!playerState) return;
    const currentNum = playerState.episode.epNumber;
    const targetNum = direction === 'next' ? currentNum + 1 : currentNum - 1;
    const targetEp = playerState.anime.episodes.find(e => e.epNumber === targetNum);

    if (targetEp) {
      setAnimeProgress(playerState.anime.id, currentNum);
      openPlayer(playerState.anime, targetEp);
      showToast(`Loading Episode ${targetEp.epNumber}: ${targetEp.title}`, 'info');
    } else {
      showToast(direction === 'next' ? 'Reached final indexed episode' : 'Already at Episode 1', 'info');
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().then(() => {
        setIsPlaying(true);
        setNeedsUserClickToStart(false);
      }).catch(err => {
        console.warn('Play prevented:', err);
      });
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const targetTime = Math.max(0, Math.min(duration, pos * duration));
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const handleSeekbarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const clampedPos = Math.max(0, Math.min(1, pos));
    setHoverTime(clampedPos * duration);
    setHoverPositionX(e.clientX - rect.left);
  };

  const handleSeekbarMouseLeave = () => {
    setHoverTime(null);
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    showToast(`Playback speed: ${speed}x`, 'info');
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = window.setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3500);
  };

  const handleLocalFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCurrentVideoSrc(url);
      setActiveMirrorTitle(`Local File: ${file.name}`);
      setHasVideoError(false);
      showToast(`Loaded "${file.name}"`, 'success');
    }
  };

  const handleApplyCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStreamUrl.trim()) return;

    const url = customStreamUrl.trim();
    if (url.startsWith('magnet:?') || url.includes('.torrent')) {
      showToast('Connecting magnet via rqbit daemon...', 'info');
      rqbitService.addTorrentAndGetStream(url, playerState?.anime.title || 'Anime')
        .then(res => {
          if (res?.stream_url) {
            setCurrentVideoSrc(res.stream_url);
            setActiveMirrorTitle('Custom Magnet Stream');
            setHasVideoError(false);
            showToast('Started BitTorrent stream!', 'success');
          }
        })
        .catch(() => {
          const video = videoRef.current;
          if (video) {
            torrentEngine.streamToVideoElement(url, video)
              .then(() => {
                setIsPlaying(true);
                setActiveMirrorTitle('In-browser Magnet Stream');
                showToast('Started WebTorrent stream!', 'success');
              })
              .catch(err => {
                showToast(err.message || 'Failed to stream magnet', 'error');
              });
          }
        });
    } else {
      setCurrentVideoSrc(url);
      setActiveMirrorTitle('Custom Stream URL');
      setHasVideoError(false);
      showToast('Loaded custom stream target', 'success');
    }

    setShowUrlDialog(false);
    setCustomStreamUrl('');
  };

  const skipOp = () => {
    const opTarget = (playerState?.episode.opSkipEnd || 90);
    if (videoRef.current) {
      videoRef.current.currentTime = opTarget;
    }
    showToast(`Skipped opening to ${formatTime(opTarget)}`, 'info');
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!playerState) return null;

  return (
    <div
      ref={containerRef}
      className="mpv-player-container"
      onMouseMove={handleMouseMove}
      style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}
    >
      <input
        type="file"
        ref={fileInputRef}
        accept="video/*"
        style={{ display: 'none' }}
        onChange={handleLocalFileSelect}
      />

      <input
        type="file"
        ref={subtitleFileInputRef}
        accept=".srt,.vtt,.ass,.ssa"
        style={{ display: 'none' }}
        onChange={handleLocalSubtitleUpload}
      />

      {/* Native HTML5 / BitTorrent Video Player Surface */}
      <video
        ref={videoRef}
        className="mpv-video-surface"
        onClick={togglePlay}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleVideoError}
        playsInline
      />

      {/* Rendered Subtitles Overlay Canvas */}
      {activeSubtitleCue && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: `${subtitleStyle.bottomOffset}px`,
            transform: 'translateX(-50%)',
            maxWidth: '85%',
            textAlign: 'center',
            zIndex: 35,
            pointerEvents: 'none',
            transition: 'bottom 0.2s ease'
          }}
        >
          <div
            style={{
              display: 'inline-block',
              background: subtitleStyle.backgroundOpacity > 0
                ? `rgba(0, 0, 0, ${subtitleStyle.backgroundOpacity})`
                : 'transparent',
              color: subtitleStyle.textColor,
              fontSize: `${subtitleStyle.fontSize}px`,
              fontFamily: subtitleStyle.fontFamily,
              fontWeight: 700,
              lineHeight: 1.35,
              padding: subtitleStyle.backgroundOpacity > 0 ? '6px 14px' : '2px 6px',
              borderRadius: '8px',
              textShadow: subtitleStyle.textShadow
                ? '0 2px 4px #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 8px rgba(0,0,0,0.8)'
                : 'none',
              whiteSpace: 'pre-line'
            }}
          >
            {activeSubtitleCue.text}
          </div>
        </div>
      )}

      {/* Stream Resolving Overlay */}
      {isLoadingStream && !currentVideoSrc && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.88)',
            backdropFilter: 'blur(16px)',
            zIndex: 36,
            padding: '24px'
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              border: '4px solid rgba(255,255,255,0.1)',
              borderTopColor: 'var(--md-sys-color-primary)',
              animation: 'spin 1s linear infinite',
              marginBottom: '16px'
            }}
          />
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>Connecting BitTorrent / Direct Stream...</h3>
          <p style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)', marginTop: '6px', textAlign: 'center', maxWidth: '440px' }}>
            Locating authentic release for <b>{playerState.anime.title}</b> (EP {playerState.episode.epNumber}) in <b>{audioMode.toUpperCase()}</b>
          </p>

          {streamMirrors.length > 0 && (
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button
                className="section-btn"
                onClick={() => {
                  const target = streamMirrors[0];
                  if (target) handleSwitchMirror(target);
                  setIsLoadingStream(false);
                }}
                style={{ background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none', fontWeight: 700 }}
              >
                <Play size={14} fill="currentColor" />
                <span>Play First Source</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Video / Stream Connection Overlay */}
      {(hasVideoError || (!isLoadingStream && !currentVideoSrc)) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(10, 8, 14, 0.94)',
            backdropFilter: 'blur(16px)',
            zIndex: 36,
            padding: '24px'
          }}
        >
          <AlertCircle size={44} color="var(--md-sys-color-primary)" style={{ marginBottom: '12px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '6px' }}>
            {streamMirrors.length > 0 ? 'BitTorrent Stream Engine' : 'No Direct Stream Found'}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'center', maxWidth: '480px', marginBottom: '20px' }}>
            {streamMirrors.length > 0
              ? 'Select an authentic BitTorrent release below, connect your rqbit daemon, or load a custom video stream:'
              : 'Unable to locate an automatic stream. You can load a local video file, custom URL, or test stream:'}
          </p>

          {/* Release List */}
          {streamMirrors.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '480px', marginBottom: '20px' }}>
              {streamMirrors.map((mirror, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSwitchMirror(mirror)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: currentVideoSrc === mirror.url
                      ? 'var(--md-sys-color-primary-container)'
                      : 'var(--md-sys-color-surface-container-high)',
                    border: '1px solid var(--md-sys-color-outline-variant)',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '13px',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                    <Server size={16} color="var(--md-sys-color-primary)" />
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {mirror.server}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--md-sys-color-primary)', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                    {mirror.quality}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              className="section-btn"
              onClick={() => {
                const sampleHls = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
                setCurrentVideoSrc(sampleHls);
                setActiveMirrorTitle('Direct HLS 1080p Test Stream');
                setHasVideoError(false);
                showToast('Loaded 1080p Direct Test Stream', 'success');
              }}
              style={{ background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none' }}
            >
              <Sparkles size={16} />
              <span>Test 1080p Stream</span>
            </button>

            <button
              className="section-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <FolderOpen size={16} />
              <span>Open Local Video File</span>
            </button>

            <button
              className="section-btn"
              onClick={() => setShowUrlDialog(true)}
            >
              <Link size={16} />
              <span>Custom Stream URL</span>
            </button>
          </div>
        </div>
      )}

      {/* Top HUD Header & Server Selector Pills */}
      <div
        className="mpv-hud-header"
        style={{
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
          zIndex: 40
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="mpv-btn" onClick={closePlayer} title="Back to Yozora">
            <X size={22} />
          </button>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
              {playerState.anime.title}
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)' }}>
              Episode {playerState.episode.epNumber} — {playerState.episode.title}
            </p>
          </div>
        </div>

        {/* Server & Mirror Quick Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Audio Language & Dub/Sub Mode Selector */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', padding: '2px' }}>
            <button
              onClick={() => handleToggleAudioMode('sub')}
              style={{
                background: audioMode === 'sub' ? 'var(--md-sys-color-primary)' : 'transparent',
                color: audioMode === 'sub' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)',
                border: 'none',
                borderRadius: '999px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
              title="Japanese Audio with Subtitles"
            >
              SUB (JP)
            </button>
            <button
              onClick={() => handleToggleAudioMode('dub')}
              style={{
                background: audioMode === 'dub' ? 'var(--md-sys-color-primary)' : 'transparent',
                color: audioMode === 'dub' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)',
                border: 'none',
                borderRadius: '999px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
              title="English / Localized Dubbed Audio"
            >
              DUB (EN)
            </button>
            <button
              onClick={() => handleToggleAudioMode('dual')}
              style={{
                background: audioMode === 'dual' ? 'var(--md-sys-color-primary)' : 'transparent',
                color: audioMode === 'dual' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)',
                border: 'none',
                borderRadius: '999px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
              title="Dual Audio (Both JP + EN Tracks)"
            >
              DUAL
            </button>
          </div>

          {/* Episode Prev / Next */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', padding: '2px 4px' }}>
            <button
              className="mpv-btn"
              style={{ width: '28px', height: '28px', padding: 0 }}
              onClick={() => handleNavigateEpisode('prev')}
              title="Previous Episode"
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '0 8px', color: '#fff' }}>
              EP {playerState.episode.epNumber}
            </span>
            <button
              className="mpv-btn"
              style={{ width: '28px', height: '28px', padding: 0 }}
              onClick={() => handleNavigateEpisode('next')}
              title="Next Episode"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button
            className={`section-btn ${showMirrorsDropdown ? 'active' : ''}`}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              background: showMirrorsDropdown ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-surface-container-high)',
              color: showMirrorsDropdown ? 'var(--md-sys-color-on-primary)' : '#fff',
              border: '1px solid var(--md-sys-color-outline-variant)'
            }}
            onClick={() => setShowMirrorsDropdown(!showMirrorsDropdown)}
            title="Switch Server Mirror / Torrent Release"
          >
            <Server size={14} />
            <span>Sources ({streamMirrors.length})</span>
          </button>

          <button
            className={`section-btn ${showSubtitleMenu ? 'active' : ''}`}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              background: activeSubtitleTrack ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-surface-container-high)',
              color: activeSubtitleTrack ? 'var(--md-sys-color-on-primary)' : '#fff',
              border: '1px solid var(--md-sys-color-outline-variant)'
            }}
            onClick={() => setShowSubtitleMenu(!showSubtitleMenu)}
            title="Subtitle Tracks & Audio Settings"
          >
            <Subtitles size={14} />
            <span>{activeSubtitleTrack ? activeSubtitleTrack.label : 'Subtitles'}</span>
          </button>

          <button
            className="section-btn"
            style={{ padding: '6px 12px', fontSize: '12px' }}
            onClick={() => fileInputRef.current?.click()}
            title="Load local video file"
          >
            <Film size={14} />
            <span>Local File</span>
          </button>

          <button
            className="section-btn"
            style={{ padding: '6px 12px', fontSize: '12px' }}
            onClick={() => setShowUrlDialog(!showUrlDialog)}
            title="Load custom stream URL"
          >
            <Link size={14} />
            <span>URL</span>
          </button>

          <button
            className="section-btn"
            style={{ padding: '6px 12px', fontSize: '12px', background: 'rgba(255,255,255,0.1)' }}
            onClick={skipOp}
            title={playerState.episode.opSkipEnd ? `Skip OP to ${playerState.episode.opSkipEnd}s` : 'Skip OP (90s)'}
          >
            <FastForward size={14} />
            <span>Skip OP</span>
          </button>

          <button
            className={`section-btn ${showStatsForNerds ? 'active' : ''}`}
            style={{ padding: '6px 12px', fontSize: '12px' }}
            onClick={() => setShowStatsForNerds(!showStatsForNerds)}
            title="Stats for Nerds (OSD)"
          >
            <Activity size={14} />
            <span>OSD</span>
          </button>
        </div>
      </div>

      {/* Subtitles & Audio Management Modal */}
      {showSubtitleMenu && (
        <div
          style={{
            position: 'absolute',
            top: '70px',
            right: '24px',
            background: 'rgba(21, 18, 24, 0.96)',
            backdropFilter: 'blur(20px)',
            border: '1px solid var(--md-sys-color-outline-variant)',
            borderRadius: '20px',
            padding: '18px',
            width: '420px',
            maxHeight: '520px',
            overflowY: 'auto',
            zIndex: 44,
            boxShadow: '0 12px 40px rgba(0,0,0,0.7)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Subtitles size={18} color="var(--md-sys-color-primary)" />
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>Subtitles & Audio Preferences</h3>
            </div>
            <button onClick={() => setShowSubtitleMenu(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>

          {/* Subtitle Tabs */}
          <div style={{ display: 'flex', background: 'var(--md-sys-color-surface-container-high)', borderRadius: '12px', padding: '3px', marginBottom: '16px' }}>
            {(['tracks', 'audio', 'style', 'sync'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setSubtitleTab(tab)}
                style={{
                  flex: 1,
                  background: subtitleTab === tab ? 'var(--md-sys-color-primary)' : 'transparent',
                  color: subtitleTab === tab ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)',
                  border: 'none',
                  borderRadius: '9px',
                  padding: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {tab === 'tracks' ? 'Subtitle Tracks' : tab === 'audio' ? 'Audio / Dub' : tab === 'style' ? 'Styling' : 'Sync Offset'}
              </button>
            ))}
          </div>

          {/* Tab 1: Subtitle Tracks */}
          {subtitleTab === 'tracks' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '4px' }}>
                Select a subtitle stream track or load external subtitles:
              </div>

              {/* Turn Off Button */}
              <button
                onClick={() => handleSelectSubtitleTrack(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: activeSubtitleTrack === null ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-container-high)',
                  border: activeSubtitleTrack === null ? '1px solid var(--md-sys-color-primary)' : '1px solid var(--md-sys-color-outline-variant)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                <span>Subtitles Off</span>
                {activeSubtitleTrack === null && <Check size={14} color="var(--md-sys-color-primary)" />}
              </button>

              {/* Subtitle Track Items */}
              {subtitleTracks.map((track, idx) => {
                const isSelected = activeSubtitleTrack?.id === track.id || activeSubtitleTrack?.url === track.url;
                return (
                  <button
                    key={track.id || idx}
                    onClick={() => handleSelectSubtitleTrack(track)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: isSelected ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-container-high)',
                      border: isSelected ? '1px solid var(--md-sys-color-primary)' : '1px solid var(--md-sys-color-outline-variant)',
                      borderRadius: '10px',
                      padding: '8px 12px',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '12px',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Radio size={14} color={isSelected ? 'var(--md-sys-color-primary)' : '#888'} />
                      <span style={{ fontWeight: isSelected ? 700 : 500 }}>{track.label}</span>
                      {track.type && (
                        <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                          {track.type}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check size={14} color="var(--md-sys-color-primary)" />}
                  </button>
                );
              })}

              {/* Load External Subtitle Controls */}
              <div style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '12px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  className="section-btn"
                  onClick={() => subtitleFileInputRef.current?.click()}
                  style={{ width: '100%', justifyContent: 'center', fontSize: '12px' }}
                >
                  <Upload size={14} />
                  <span>Upload Local Subtitles (.srt, .vtt, .ass)</span>
                </button>

                <form onSubmit={handleLoadCustomSubtitleUrl} style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    placeholder="https://.../subtitles.vtt"
                    value={customSubtitleUrl}
                    onChange={(e) => setCustomSubtitleUrl(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'var(--md-sys-color-surface-container-high)',
                      border: '1px solid var(--md-sys-color-outline-variant)',
                      borderRadius: '8px',
                      padding: '6px 10px',
                      color: '#fff',
                      fontSize: '11px'
                    }}
                  />
                  <button type="submit" className="section-btn" style={{ padding: '6px 12px', fontSize: '11px' }}>
                    Load
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Tab 2: Audio & Language */}
          {subtitleTab === 'audio' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#fff', display: 'block', marginBottom: '6px' }}>
                  Audio Track Mode
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    onClick={() => handleToggleAudioMode('sub')}
                    style={{
                      background: audioMode === 'sub' ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-container-high)',
                      border: audioMode === 'sub' ? '1px solid var(--md-sys-color-primary)' : '1px solid var(--md-sys-color-outline-variant)',
                      borderRadius: '10px',
                      padding: '10px',
                      color: '#fff',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>🇯🇵 Sub (Original)</div>
                    <div style={{ fontSize: '10px', color: 'var(--md-sys-color-on-surface-variant)', marginTop: '2px' }}>
                      Japanese audio with subtitles
                    </div>
                  </button>

                  <button
                    onClick={() => handleToggleAudioMode('dub')}
                    style={{
                      background: audioMode === 'dub' ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-container-high)',
                      border: audioMode === 'dub' ? '1px solid var(--md-sys-color-primary)' : '1px solid var(--md-sys-color-outline-variant)',
                      borderRadius: '10px',
                      padding: '10px',
                      color: '#fff',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>🇬🇧 Dub (Localized)</div>
                    <div style={{ fontSize: '10px', color: 'var(--md-sys-color-on-surface-variant)', marginTop: '2px' }}>
                      English / dubbed voice track
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#fff', display: 'block', marginBottom: '6px' }}>
                  Preferred Subtitle Language
                </label>
                <select
                  value={preferredSubLang}
                  onChange={async (e) => {
                    setPreferredSubLang(e.target.value);
                    await subtitleService.saveLanguagePreferences({ preferredSubLang: e.target.value });
                    showToast(`Preferred subtitle language set to: ${e.target.value.toUpperCase()}`, 'info');
                  }}
                  style={{
                    width: '100%',
                    background: 'var(--md-sys-color-surface-container-high)',
                    border: '1px solid var(--md-sys-color-outline-variant)',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    color: '#fff',
                    fontSize: '12px'
                  }}
                >
                  {SUPPORTED_LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code} style={{ background: '#1c1921' }}>
                      {lang.flag} {lang.label} ({lang.nativeLabel})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Tab 3: Subtitle Styling */}
          {subtitleTab === 'style' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                  <span style={{ color: '#fff', fontWeight: 600 }}>Font Size</span>
                  <span style={{ color: 'var(--md-sys-color-primary)', fontWeight: 700 }}>{subtitleStyle.fontSize}px</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[18, 22, 26, 32, 38].map(size => (
                    <button
                      key={size}
                      onClick={async () => {
                        const next = { ...subtitleStyle, fontSize: size };
                        setSubtitleStyle(next);
                        await subtitleService.saveSubtitleStyle(next);
                      }}
                      style={{
                        flex: 1,
                        background: subtitleStyle.fontSize === size ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-surface-container-high)',
                        color: subtitleStyle.fontSize === size ? 'var(--md-sys-color-on-primary)' : '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 0',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {size}px
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#fff', display: 'block', marginBottom: '6px' }}>
                  Text Color
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { label: 'White', color: '#ffffff' },
                    { label: 'Yellow', color: '#ffea00' },
                    { label: 'Cyan', color: '#00e5ff' },
                    { label: 'Green', color: '#76ff03' }
                  ].map(c => (
                    <button
                      key={c.color}
                      onClick={async () => {
                        const next = { ...subtitleStyle, textColor: c.color };
                        setSubtitleStyle(next);
                        await subtitleService.saveSubtitleStyle(next);
                      }}
                      style={{
                        flex: 1,
                        background: 'var(--md-sys-color-surface-container-high)',
                        border: subtitleStyle.textColor === c.color ? '2px solid var(--md-sys-color-primary)' : '1px solid var(--md-sys-color-outline-variant)',
                        borderRadius: '8px',
                        padding: '6px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        color: '#fff',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: c.color }} />
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                  <span style={{ color: '#fff', fontWeight: 600 }}>Background Box Opacity</span>
                  <span style={{ color: 'var(--md-sys-color-primary)', fontWeight: 700 }}>{Math.round(subtitleStyle.backgroundOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={subtitleStyle.backgroundOpacity}
                  onChange={async (e) => {
                    const next = { ...subtitleStyle, backgroundOpacity: parseFloat(e.target.value) };
                    setSubtitleStyle(next);
                    await subtitleService.saveSubtitleStyle(next);
                  }}
                  style={{ width: '100%', accentColor: 'var(--md-sys-color-primary)', cursor: 'pointer' }}
                />
              </div>

              {/* Subtitle Preview Box */}
              <div style={{ marginTop: '6px', background: '#0a080e', padding: '16px', borderRadius: '12px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span
                  style={{
                    display: 'inline-block',
                    background: subtitleStyle.backgroundOpacity > 0 ? `rgba(0,0,0,${subtitleStyle.backgroundOpacity})` : 'transparent',
                    color: subtitleStyle.textColor,
                    fontSize: `${Math.min(22, subtitleStyle.fontSize)}px`,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '6px',
                    textShadow: subtitleStyle.textShadow ? '0 2px 4px #000, -1px -1px 0 #000, 1px -1px 0 #000' : 'none'
                  }}
                >
                  Sample Preview: こんにちは世界 (Hello World)
                </span>
              </div>
            </div>
          )}

          {/* Tab 4: Subtitle Sync & Offset */}
          {subtitleTab === 'sync' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)' }}>
                Adjust subtitle delay if audio and dialogue are out of synchronization:
              </div>

              <div style={{ textAlign: 'center', padding: '16px', background: 'var(--md-sys-color-surface-container-high)', borderRadius: '14px' }}>
                <div style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)' }}>Current Offset</div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--md-sys-color-primary)', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>
                  {subtitleDelayMs >= 0 ? `+${(subtitleDelayMs / 1000).toFixed(2)}s` : `${(subtitleDelayMs / 1000).toFixed(2)}s`}
                </div>
                <div style={{ fontSize: '11px', color: '#888' }}>
                  {subtitleDelayMs > 0 ? 'Subtitles delayed (appear later)' : subtitleDelayMs < 0 ? 'Subtitles advanced (appear earlier)' : 'Exact in-sync (0.00s)'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                <button
                  className="section-btn"
                  onClick={() => setSubtitleDelayMs(prev => prev - 500)}
                  style={{ justifyContent: 'center', fontSize: '11px' }}
                >
                  -0.5s
                </button>
                <button
                  className="section-btn"
                  onClick={() => setSubtitleDelayMs(prev => prev - 100)}
                  style={{ justifyContent: 'center', fontSize: '11px' }}
                >
                  -0.1s
                </button>
                <button
                  className="section-btn"
                  onClick={() => setSubtitleDelayMs(prev => prev + 100)}
                  style={{ justifyContent: 'center', fontSize: '11px' }}
                >
                  +0.1s
                </button>
                <button
                  className="section-btn"
                  onClick={() => setSubtitleDelayMs(prev => prev + 500)}
                  style={{ justifyContent: 'center', fontSize: '11px' }}
                >
                  +0.5s
                </button>
              </div>

              <button
                className="section-btn"
                onClick={() => setSubtitleDelayMs(0)}
                style={{ width: '100%', justifyContent: 'center', fontSize: '12px' }}
              >
                Reset Sync Offset to 0.0s
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mirrors Dropdown Dialog */}
      {showMirrorsDropdown && (
        <div
          style={{
            position: 'absolute',
            top: '70px',
            right: '80px',
            background: 'rgba(21, 18, 24, 0.96)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--md-sys-color-outline-variant)',
            borderRadius: '18px',
            padding: '16px',
            width: '420px',
            maxHeight: '440px',
            overflowY: 'auto',
            zIndex: 42,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Select Stream Source / Release</h4>
              <p style={{ fontSize: '11px', color: 'var(--md-sys-color-on-surface-variant)' }}>
                Active: <span style={{ color: 'var(--md-sys-color-primary)' }}>{activeMirrorTitle}</span>
              </p>
            </div>
            <button onClick={() => setShowMirrorsDropdown(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {streamMirrors.map((mirror, idx) => {
              const isSelected = activeMirrorTitle === mirror.server;
              return (
                <button
                  key={idx}
                  onClick={() => handleSwitchMirror(mirror)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: isSelected ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-container-high)',
                    border: isSelected ? '1px solid var(--md-sys-color-primary)' : '1px solid var(--md-sys-color-outline-variant)',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '12px',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <Radio size={14} color={isSelected ? 'var(--md-sys-color-primary)' : '#888'} />
                    <span style={{ fontWeight: isSelected ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {mirror.server}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--md-sys-color-primary)', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                    {mirror.quality}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Stream URL Input Dialog */}
      {showUrlDialog && (
        <div
          style={{
            position: 'absolute',
            top: '70px',
            right: '24px',
            background: 'rgba(21, 18, 24, 0.94)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--md-sys-color-outline-variant)',
            borderRadius: '18px',
            padding: '16px',
            width: '360px',
            zIndex: 40
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>Load Custom Stream URL / Magnet</span>
            <button onClick={() => setShowUrlDialog(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
          <form onSubmit={handleApplyCustomUrl} style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <input
              type="text"
              placeholder="https://.../video.m3u8 or magnet:?xt=..."
              value={customStreamUrl}
              onChange={(e) => setCustomStreamUrl(e.target.value)}
              style={{
                flex: 1,
                background: 'var(--md-sys-color-surface-container-high)',
                border: '1px solid var(--md-sys-color-outline-variant)',
                borderRadius: '8px',
                padding: '6px 10px',
                color: '#fff',
                fontSize: '12px'
              }}
            />
            <button type="submit" className="section-btn" style={{ padding: '6px 12px', fontSize: '12px' }}>
              Play
            </button>
          </form>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="section-btn"
              style={{ padding: '4px 10px', fontSize: '11px', flex: 1, justifyContent: 'center' }}
              onClick={() => {
                const sampleHls = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
                setCurrentVideoSrc(sampleHls);
                setActiveMirrorTitle('Direct HLS Test Stream');
                setShowUrlDialog(false);
                showToast('Loaded Direct 1080p HLS Test Stream', 'success');
              }}
            >
              <Sparkles size={12} color="var(--md-sys-color-primary)" />
              <span>Test Direct HLS 1080p</span>
            </button>
          </div>
        </div>
      )}

      {/* Stats for Nerds overlay */}
      {showStatsForNerds && (
        <div className="stats-for-nerds" style={{ zIndex: 45 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontWeight: 800, color: 'var(--md-sys-color-primary)' }}>⚡ Yozora Playback Telemetry</span>
            <button onClick={() => setShowStatsForNerds(false)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
          <div className="stats-row">
            <span className="stats-key">Active Source:</span>
            <span className="stats-val">{activeMirrorTitle}</span>
          </div>
          <div className="stats-row">
            <span className="stats-key">Audio / Sub Mode:</span>
            <span className="stats-val">{audioMode.toUpperCase()} ({preferredSubLang.toUpperCase()} subs)</span>
          </div>
          <div className="stats-row">
            <span className="stats-key">Active Subtitle:</span>
            <span className="stats-val">{activeSubtitleTrack ? activeSubtitleTrack.label : 'None'}</span>
          </div>
          <div className="stats-row">
            <span className="stats-key">Engine:</span>
            <span className="stats-val">{selectedTorrentRelease ? 'rqbit Sequential BitTorrent' : 'Direct HTML5 / HLS'}</span>
          </div>
          <div className="stats-row">
            <span className="stats-key">Dimensions:</span>
            <span className="stats-val">{telemetry.videoWidth ? `${telemetry.videoWidth}x${telemetry.videoHeight}` : '1920x1080'}</span>
          </div>
          <div className="stats-row">
            <span className="stats-key">Framerate:</span>
            <span className="stats-val">{telemetry.fps || 60} fps</span>
          </div>
          <div className="stats-row">
            <span className="stats-key">Buffer Window:</span>
            <span className="stats-val">{bufferedTime.toFixed(1)}s ({telemetry.bufferPercent}%)</span>
          </div>
        </div>
      )}

      {/* Bottom HUD Footer */}
      <div
        className="mpv-hud-footer"
        style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? 'auto' : 'none', zIndex: 40 }}
      >
        {/* Seekbar */}
        <div
          className="mpv-seekbar"
          onClick={handleSeek}
          onMouseMove={handleSeekbarMouseMove}
          onMouseLeave={handleSeekbarMouseLeave}
        >
          {hoverTime !== null && (
            <div
              style={{
                position: 'absolute',
                left: `${hoverPositionX}px`,
                bottom: '18px',
                transform: 'translateX(-50%)',
                background: 'rgba(21, 18, 24, 0.95)',
                border: '1px solid var(--md-sys-color-primary)',
                borderRadius: '8px',
                padding: '4px 8px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: '#fff',
                boxShadow: '0 4px 14px rgba(0,0,0,0.6)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap'
              }}
            >
              {formatTime(hoverTime)}
            </div>
          )}

          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${(bufferedTime / (duration || 1)) * 100}%`,
              background: 'rgba(255,255,255,0.4)',
              borderRadius: '3px'
            }}
          />
          <div
            className="mpv-seekbar-progress"
            style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
          >
            <div className="mpv-seekbar-handle" />
          </div>
        </div>

        {/* Controls Bar */}
        <div className="mpv-controls-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="mpv-btn" onClick={togglePlay}>
              {isPlaying ? <Pause size={22} /> : <Play size={22} fill="currentColor" />}
            </button>

            <button
              className="mpv-btn"
              onClick={() => {
                const t = Math.max(0, currentTime - 10);
                setCurrentTime(t);
                if (videoRef.current) videoRef.current.currentTime = t;
              }}
              title="Rewind 10s"
            >
              <RotateCcw size={18} />
            </button>

            <button
              className="mpv-btn"
              onClick={() => {
                const t = Math.min(duration, currentTime + 10);
                setCurrentTime(t);
                if (videoRef.current) videoRef.current.currentTime = t;
              }}
              title="Forward 10s"
            >
              <RotateCw size={18} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px' }}>
              <button
                className="mpv-btn"
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.muted = !isMuted;
                  }
                  setIsMuted(!isMuted);
                }}
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setVolume(v);
                  if (videoRef.current) {
                    videoRef.current.volume = v;
                    videoRef.current.muted = false;
                  }
                  setIsMuted(false);
                }}
                style={{ width: '70px', accentColor: 'var(--md-sys-color-primary)', cursor: 'pointer' }}
              />
            </div>

            <span style={{ fontSize: '12px', color: '#d1d5db', marginLeft: '8px', fontFamily: 'var(--font-mono)' }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Quick Subtitle Toggle Button */}
            <button
              className="mpv-btn"
              onClick={() => setShowSubtitleMenu(!showSubtitleMenu)}
              title="Subtitles & Audio Settings"
              style={{ color: activeSubtitleTrack ? 'var(--md-sys-color-primary)' : '#ccc' }}
            >
              <Subtitles size={18} />
            </button>

            <select
              value={playbackSpeed}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '4px 8px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <option value="0.75" style={{ background: '#222' }}>0.75x</option>
              <option value="1.0" style={{ background: '#222' }}>1.0x</option>
              <option value="1.25" style={{ background: '#222' }}>1.25x</option>
              <option value="1.5" style={{ background: '#222' }}>1.5x</option>
              <option value="2.0" style={{ background: '#222' }}>2.0x</option>
            </select>

            <button className="mpv-btn" onClick={toggleFullscreen} title="Fullscreen">
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
