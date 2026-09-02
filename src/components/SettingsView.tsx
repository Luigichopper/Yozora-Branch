import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Terminal, Shield, Rss, Palette, Check, RefreshCw, Copy, ExternalLink, HardDrive, Image as ImageIcon, FileCode, CheckCircle2, Cpu, Play, Trash2, Database, AlertTriangle, Layers, Subtitles, Globe, Type, Sliders, Laptop, Layout } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { MATUGEN_PALETTES } from '../theme/matugen';
import { sourceService, RSSFeedProvider } from '../services/sourceService';
import { matugenService } from '../services/matugenService';
import { rqbitService, RqbitStatus, RqbitTorrentStats } from '../services/rqbitService';
import { anilistService } from '../services/tracking/anilist';
import { db } from '../services/db';
import { subtitleService, SUPPORTED_LANGUAGES, DEFAULT_SUBTITLE_STYLE, SubtitleStyleConfig, LanguagePreferenceConfig } from '../services/subtitleService';

export const SettingsView: React.FC = () => {
  const {
    activePalette,
    setActivePalette,
    blurEnabled,
    setBlurEnabled,
    showToast,
    osMode,
    resolvedOs,
    setOsMode
  } = useApp();
  const [copiedRule, setCopiedRule] = useState(false);
  const [providers, setProviders] = useState<RSSFeedProvider[]>([]);
  const [customRssUrl, setCustomRssUrl] = useState('');
  const [customRssName, setCustomRssName] = useState('');
  const [anilistToken, setAnilistToken] = useState(anilistService.getToken() || '');
  const [matugenJsonInput, setMatugenJsonInput] = useState('');
  const [showJsonDialog, setShowJsonDialog] = useState(false);
  const [rqbitStatus, setRqbitStatus] = useState<RqbitStatus>({ running: false, listen_addr: '127.0.0.1:3030' });
  const [rqbitListenPort, setRqbitListenPort] = useState('3030');
  const [useExternalMpv, setUseExternalMpv] = useState(false);
  const [autoCleanupCache, setAutoCleanupCache] = useState(true);
  const [retentionCount, setRetentionCount] = useState(1);
  const [cachedTorrents, setCachedTorrents] = useState<RqbitTorrentStats[]>([]);
  const [isPurging, setIsPurging] = useState(false);
  const [osTab, setOsTab] = useState<'windows' | 'linux'>('windows');
  const wallpaperInputRef = useRef<HTMLInputElement | null>(null);

  // Subtitle & Language settings state
  const [defaultAudioMode, setDefaultAudioMode] = useState<'sub' | 'dub' | 'dual' | 'all'>('sub');
  const [preferredSubLang, setPreferredSubLang] = useState<string>('en');
  const [preferredAudioLang, setPreferredAudioLang] = useState<string>('ja');
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyleConfig>(DEFAULT_SUBTITLE_STYLE);

  const [anilistApiOnline, setAnilistApiOnline] = useState<boolean>(true);

  // Helper to format bytes
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  // Load active providers, AniList token, and rqbit daemon status on mount
  useEffect(() => {
    async function loadData() {
      const p = await sourceService.getProviders();
      setProviders(p);
      setAnilistToken(anilistService.getToken() || '');

      const savedMpvPref = await db.getSetting<boolean>('use_external_mpv', false);
      setUseExternalMpv(savedMpvPref);

      const savedAutoClean = await db.getSetting<boolean>('auto_cleanup_rqbit_cache', true);
      setAutoCleanupCache(savedAutoClean);

      const savedRetention = await db.getSetting<number>('rqbit_retention_count', 1);
      setRetentionCount(savedRetention);

      const savedPort = await db.getSetting<string>('rqbit_port', '3030');
      setRqbitListenPort(savedPort);

      // Load Subtitle & Language configuration
      const langPrefs = await subtitleService.getLanguagePreferences();
      setDefaultAudioMode(langPrefs.defaultAudioMode);
      setPreferredSubLang(langPrefs.preferredSubLang);
      setPreferredAudioLang(langPrefs.preferredAudioLang);

      const savedSubStyle = await subtitleService.getSubtitleStyle();
      setSubtitleStyle(savedSubStyle);

      const rStatus = await rqbitService.checkStatus(`127.0.0.1:${savedPort}`);
      setRqbitStatus(rStatus);

      if (rStatus.running) {
        const torrents = await rqbitService.listTorrents(`127.0.0.1:${savedPort}`);
        setCachedTorrents(torrents);
      }

      // Measure real AniList GraphQL connectivity
      try {
        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: '{ Page(page: 1, perPage: 1) { media { id } } }' }),
          signal: AbortSignal.timeout(3000)
        });
        setAnilistApiOnline(res.ok);
      } catch {
        setAnilistApiOnline(false);
      }
    }
    loadData();
  }, []);

  const handleToggleAutoCleanup = async () => {
    const nextVal = !autoCleanupCache;
    setAutoCleanupCache(nextVal);
    await db.saveSetting('auto_cleanup_rqbit_cache', nextVal);
    showToast(
      nextVal
        ? 'Zero-Bloat Mode active: Stream cache will be automatically purged on finish.'
        : 'Auto-cleanup disabled: Torrents will be saved to disk.',
      'info'
    );
  };

  const handleSetRetention = async (count: number) => {
    setRetentionCount(count);
    await db.saveSetting('rqbit_retention_count', count);
    showToast(`Retention limit set to ${count === 0 ? 'Ephemeral (0 files)' : `${count} episode(s)`}.`, 'info');
  };

  const handlePurgeAllCache = async () => {
    setIsPurging(true);
    try {
      const res = await rqbitService.purgeAllTorrentsAndCache(`127.0.0.1:${rqbitListenPort}`);
      setCachedTorrents([]);
      showToast(`Purged ${res.deletedCount} torrents and freed ${formatBytes(res.freedBytes)} of disk space!`, 'success');
    } catch (e: any) {
      showToast(e?.message || 'Failed to purge rqbit cache.', 'error');
    } finally {
      setIsPurging(false);
    }
  };

  const handleDeleteTorrent = async (id: number) => {
    const ok = await rqbitService.deleteTorrent(id, true, `127.0.0.1:${rqbitListenPort}`);
    if (ok) {
      setCachedTorrents(prev => prev.filter(t => t.id !== id));
      showToast('Deleted torrent and erased video file from disk.', 'success');
    } else {
      showToast('Failed to delete torrent file.', 'error');
    }
  };

  const handleRefreshCacheList = async () => {
    const torrents = await rqbitService.listTorrents(`127.0.0.1:${rqbitListenPort}`);
    setCachedTorrents(torrents);
    showToast(`Found ${torrents.length} cached releases in rqbit.`, 'info');
  };

  const handleToggleExternalMpv = async () => {
    const nextVal = !useExternalMpv;
    setUseExternalMpv(nextVal);
    await db.saveSetting('use_external_mpv', nextVal);
    showToast(
      nextVal
        ? 'External mpv selected as primary player (10-bit HEVC & ASS subtitles).'
        : 'In-app HTML5 player selected as primary player.',
      'info'
    );
  };

  const handleSaveAniListToken = () => {
    if (anilistToken.trim()) {
      anilistService.setToken(anilistToken.trim());
      showToast('Saved AniList Personal Access Token! Progress will sync automatically.', 'success');
    } else {
      anilistService.clearToken();
      setAnilistToken('');
      showToast('Cleared AniList token (Local-only mode active).', 'info');
    }
  };

  const handleStartRqbit = async () => {
    rqbitService.setListenPort(rqbitListenPort);
    await db.saveSetting('rqbit_port', rqbitListenPort);
    showToast('Starting rqbit background daemon on port ' + rqbitListenPort + '...', 'info');
    try {
      const res = await rqbitService.startServer(`127.0.0.1:${rqbitListenPort}`);
      setRqbitStatus(res);
      if (res.running) {
        showToast('rqbit server online and listening on ' + res.listen_addr, 'success');
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to start rqbit daemon. Is rqbit installed on your system PATH?', 'error');
    }
  };

  const [hyprlandFormat, setHyprlandFormat] = useState<'conf' | 'lua'>('conf');

  const hyprlandConfSnippet = `# Hyprland Window Rules for Yozora (~/.config/hypr/hyprland.conf)
# Place these in your hyprland.conf or rules.conf

windowrulev2 = float, class:^(yozora)$
windowrulev2 = size 1280 840, class:^(yozora)$
windowrulev2 = center, class:^(yozora)$
windowrulev2 = opacity 0.96 0.90, class:^(yozora)$
windowrulev2 = rounding 20, class:^(yozora)$
windowrulev2 = noborder, class:^(yozora)$
windowrulev2 = blur, class:^(yozora)$
windowrulev2 = idleinhibit focus, class:^(yozora)$
windowrulev2 = workspace special:yozora silent, class:^(yozora-tray)$`;

  const hyprlandLuaSnippet = `-- Hyprland Lua Window Rules for Yozora (~/.config/hypr/hyprland.lua)
-- Compatible with hyprland-lua, Lua wrappers, and declarative Hyprland setups

local hypr = require("hyprland")

-- Register window rules for Yozora anime workstation
hypr.windowrulev2({
  { rule = "float", class = "^(yozora)$" },
  { rule = "size 1280 840", class = "^(yozora)$" },
  { rule = "center", class = "^(yozora)$" },
  { rule = "opacity 0.96 0.90", class = "^(yozora)$" },
  { rule = "rounding 20", class = "^(yozora)$" },
  { rule = "noborder", class = "^(yozora)$" },
  { rule = "blur", class = "^(yozora)$" },
  { rule = "idleinhibit focus", class = "^(yozora)$" },
  { rule = "workspace special:yozora silent", class = "^(yozora-tray)$" },
})

-- Table export format (if using declarative return table)
return {
  windowrules = {
    "float, class:^(yozora)$",
    "size 1280 840, class:^(yozora)$",
    "center, class:^(yozora)$",
    "opacity 0.96 0.90, class:^(yozora)$",
    "rounding 20, class:^(yozora)$",
    "noborder, class:^(yozora)$",
    "blur, class:^(yozora)$",
    "idleinhibit focus, class:^(yozora)$",
  }
}`;

  const currentHyprlandSnippet = hyprlandFormat === 'conf' ? hyprlandConfSnippet : hyprlandLuaSnippet;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(currentHyprlandSnippet);
    setCopiedRule(true);
    showToast(`Copied ${hyprlandFormat === 'conf' ? 'hyprland.conf' : 'hyprland.lua'} rules to clipboard!`, 'success');
    setTimeout(() => setCopiedRule(false), 2000);
  };

  const toggleProvider = async (id: string) => {
    const updated = providers.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p);
    setProviders(updated);
    await sourceService.updateProviders(updated);
    showToast('Updated RSS source provider status.', 'info');
  };

  const handleAddRss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customRssUrl.trim()) return;
    const name = customRssName.trim() || new URL(customRssUrl).hostname;
    const newP = await sourceService.addProvider(name, customRssUrl.trim());
    setProviders(prev => [...prev, newP]);
    setCustomRssUrl('');
    setCustomRssName('');
    showToast(`Added RSS Feed: ${name}`, 'success');
  };

  // Extract palette from uploaded desktop wallpaper
  const handleWallpaperUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const extracted = await matugenService.extractPaletteFromImage(file);
    await setActivePalette(extracted);
    showToast(`Extracted Matugen palette from "${file.name}"!`, 'success');
  };

  // Parse pasted Matugen colors.json
  const handleApplyMatugenJson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matugenJsonInput.trim()) return;
    const parsed = matugenService.parseMatugenJson(matugenJsonInput.trim());
    if (parsed) {
      await setActivePalette(parsed);
      setShowJsonDialog(false);
      setMatugenJsonInput('');
      showToast('Applied live Matugen colors.json configuration!', 'success');
    } else {
      showToast('Invalid Matugen colors.json format.', 'error');
    }
  };

  return (
    <div className="settings-container" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <input
        type="file"
        ref={wallpaperInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleWallpaperUpload}
      />

      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--md-sys-color-on-surface)' }}>
          系统与应用设置 • Settings & Theming
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)', marginTop: '4px' }}>
          Matugen dynamic Material You palettes, Hyprland window rules, AniDB API, and BitTorrent source adapters
        </p>
      </div>

      {/* 1. Matugen Dynamic Theme Engine */}
      <div style={{ background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: '24px', padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Palette size={20} color="var(--md-sys-color-primary)" />
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>
              Matugen Dynamic Material You Theming (End4-pC Spec)
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="section-btn"
              onClick={() => wallpaperInputRef.current?.click()}
              title="Pick wallpaper image to extract colors"
            >
              <ImageIcon size={14} />
              <span>Extract from Wallpaper</span>
            </button>

            <button
              className="section-btn"
              onClick={() => setShowJsonDialog(true)}
              title="Import ~/.config/matugen/colors.json"
            >
              <FileCode size={14} />
              <span>Import colors.json</span>
            </button>
          </div>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '18px' }}>
          Yozora consumes Matugen tokens dynamically to restyle with your live wallpaper changes. Choose a curated preset or extract palette tokens directly from your desktop wallpaper.
        </p>

        {/* Palettes Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
          {MATUGEN_PALETTES.map(p => {
            const isSelected = activePalette.id === p.id;
            return (
              <div
                key={p.id}
                style={{
                  background: isSelected ? 'var(--md-sys-color-surface-container-highest)' : 'var(--md-sys-color-surface-container-high)',
                  border: `2px solid ${isSelected ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline-variant)'}`,
                  borderRadius: '16px',
                  padding: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
                onClick={() => setActivePalette(p)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{p.name}</div>
                  {isSelected && (
                    <span style={{ background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={12} />
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '11px', color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '10px' }}>
                  {p.description}
                </div>

                {/* Color swatches */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: p.primary }} title="Primary" />
                  <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: p.primaryContainer }} title="Primary Container" />
                  <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: p.secondary }} title="Secondary" />
                  <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: p.surface }} title="Surface" />
                  <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: p.surfaceContainerHigh }} title="Surface High" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Desktop Platform & Window TitleBar Variance */}
      <div style={{ background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: '24px', padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layout size={20} color="var(--md-sys-color-primary)" />
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>
              Desktop Platform & Window TitleBar Variance
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)' }}>Active Style:</span>
            <span style={{
              background: 'var(--md-sys-color-surface-container-high)',
              border: '1px solid var(--md-sys-color-primary)',
              color: 'var(--md-sys-color-primary)',
              borderRadius: '8px',
              padding: '3px 10px',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)'
            }}>
              {resolvedOs === 'windows' ? 'Windows 11 (Fluent / Caption Buttons)' : 'Arch Linux (Wayland / Hyprland Dots)'}
            </span>
          </div>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '16px' }}>
          Customize whether the top titlebar uses <strong>Arch Linux Hyprland traffic dots</strong> on the left or authentic <strong>Windows 11 Fluent caption buttons</strong> on the right. All buttons (Close, Minimize, Maximize/Restore) are fully functional across both platforms.
        </p>

        {/* OS Selection Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          {/* Option 1: Auto-Detect */}
          <div
            onClick={() => setOsMode('auto')}
            style={{
              background: osMode === 'auto' ? 'var(--md-sys-color-surface-container-highest)' : 'var(--md-sys-color-surface-container-high)',
              border: `2px solid ${osMode === 'auto' ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline-variant)'}`,
              borderRadius: '16px',
              padding: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={14} color="var(--md-sys-color-primary)" />
                <span>Auto-Detect Platform</span>
              </div>
              {osMode === 'auto' && (
                <span style={{ background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={11} />
                </span>
              )}
            </div>
            <p style={{ fontSize: '11px', color: 'var(--md-sys-color-on-surface-variant)', margin: 0 }}>
              Automatically detects Windows vs Linux based on host system environment.
            </p>
          </div>

          {/* Option 2: Arch Linux */}
          <div
            onClick={() => setOsMode('arch')}
            style={{
              background: osMode === 'arch' ? 'var(--md-sys-color-surface-container-highest)' : 'var(--md-sys-color-surface-container-high)',
              border: `2px solid ${osMode === 'arch' ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline-variant)'}`,
              borderRadius: '16px',
              padding: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={14} color="#1793d1" />
                <span>Arch Linux (Hyprland)</span>
              </div>
              {osMode === 'arch' && (
                <span style={{ background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={11} />
                </span>
              )}
            </div>
            <p style={{ fontSize: '11px', color: 'var(--md-sys-color-on-surface-variant)', margin: 0 }}>
              Left-side colored traffic dots with Hyprland Super shortcuts (<code style={{ color: 'var(--md-sys-color-primary)', fontFamily: 'var(--font-mono)' }}>Super+Q</code>, <code style={{ color: 'var(--md-sys-color-primary)', fontFamily: 'var(--font-mono)' }}>Super+Space</code>).
            </p>
          </div>

          {/* Option 3: Windows 11 */}
          <div
            onClick={() => setOsMode('windows')}
            style={{
              background: osMode === 'windows' ? 'var(--md-sys-color-surface-container-highest)' : 'var(--md-sys-color-surface-container-high)',
              border: `2px solid ${osMode === 'windows' ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline-variant)'}`,
              borderRadius: '16px',
              padding: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Laptop size={14} color="#00a4ef" />
                <span>Windows 11 (Fluent / Mica)</span>
              </div>
              {osMode === 'windows' && (
                <span style={{ background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={11} />
                </span>
              )}
            </div>
            <p style={{ fontSize: '11px', color: 'var(--md-sys-color-on-surface-variant)', margin: 0 }}>
              Right-side Windows 11 Fluent caption controls (<code style={{ color: 'var(--md-sys-color-primary)', fontFamily: 'var(--font-mono)' }}>—</code>, <code style={{ color: 'var(--md-sys-color-primary)', fontFamily: 'var(--font-mono)' }}>▢</code>, <code style={{ color: 'var(--md-sys-color-primary)', fontFamily: 'var(--font-mono)' }}>✕</code>) with signature red close hover.
            </p>
          </div>
        </div>

        {/* Shortcut Reference Comparison */}
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid var(--md-sys-color-outline-variant)',
          borderRadius: '12px',
          padding: '12px 16px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          fontSize: '12px'
        }}>
          <div>
            <div style={{ fontWeight: 700, color: '#1793d1', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Terminal size={12} />
              <span>Arch Linux / Hyprland Keybinds</span>
            </div>
            <div style={{ color: 'var(--md-sys-color-on-surface-variant)', fontSize: '11px', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
              • Close: <b>Super + Q</b><br />
              • Toggle Floating/Maximize: <b>Super + Space</b><br />
              • Minimize/Workspace: <b>Super + S</b>
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, color: '#00a4ef', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Laptop size={12} />
              <span>Windows 11 Keybinds</span>
            </div>
            <div style={{ color: 'var(--md-sys-color-on-surface-variant)', fontSize: '11px', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
              • Close: <b>Alt + F4</b><br />
              • Maximize / Snap: <b>Win + Up / Win + Z</b><br />
              • Minimize: <b>Win + Down</b>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Hyprland & Wayland Window Rules */}
      <div style={{ background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: '24px', padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Terminal size={20} color="var(--md-sys-color-primary)" />
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>
              Arch Linux / Hyprland Window Rules
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Format Switcher Tabs */}
            <div style={{ display: 'flex', background: 'var(--md-sys-color-surface-container-high)', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: '12px', padding: '3px' }}>
              <button
                type="button"
                onClick={() => setHyprlandFormat('conf')}
                style={{
                  background: hyprlandFormat === 'conf' ? 'var(--md-sys-color-primary)' : 'transparent',
                  color: hyprlandFormat === 'conf' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)',
                  border: 'none',
                  borderRadius: '9px',
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>hyprland.conf</span>
              </button>
              <button
                type="button"
                onClick={() => setHyprlandFormat('lua')}
                style={{
                  background: hyprlandFormat === 'lua' ? 'var(--md-sys-color-primary)' : 'transparent',
                  color: hyprlandFormat === 'lua' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)',
                  border: 'none',
                  borderRadius: '9px',
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>hyprland.lua</span>
              </button>
            </div>

            <button className="section-btn" onClick={copyToClipboard}>
              {copiedRule ? <Check size={14} color="#4caf50" /> : <Copy size={14} />}
              <span>{copiedRule ? 'Copied to Clipboard!' : `Copy ${hyprlandFormat === 'conf' ? '.conf' : '.lua'}`}</span>
            </button>
          </div>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '12px' }}>
          {hyprlandFormat === 'conf' ? (
            <>
              Add these window rules to your Hyprland configuration (<code style={{ color: 'var(--md-sys-color-primary)', fontFamily: 'var(--font-mono)' }}>~/.config/hypr/hyprland.conf</code>) to enable smooth layer-shell blur, custom corner rounding, floating dimensions, and idle inhibition during playback.
            </>
          ) : (
            <>
              Add these Lua window rules to your Hyprland configuration (<code style={{ color: 'var(--md-sys-color-primary)', fontFamily: 'var(--font-mono)' }}>~/.config/hypr/hyprland.lua</code>) for use with Lua-based setups, hyprland-lua modules, or Neovim/Lua Hyprland wrappers.
            </>
          )}
        </p>

        {/* Path Indicator Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 0, 0, 0.35)',
            border: '1px solid var(--md-sys-color-outline-variant)',
            borderRadius: '10px 10px 0 0',
            padding: '8px 14px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--md-sys-color-primary)',
            borderBottom: 'none'
          }}
        >
          <span>Target File: {hyprlandFormat === 'conf' ? '~/.config/hypr/hyprland.conf' : '~/.config/hypr/hyprland.lua'}</span>
          <span style={{ fontSize: '10px', color: 'var(--md-sys-color-on-surface-variant)', opacity: 0.8 }}>
            Format: {hyprlandFormat === 'conf' ? 'Hyprland Conf (v2)' : 'Lua Table & Function API'}
          </span>
        </div>

        <pre
          style={{
            background: 'var(--md-sys-color-surface-container-high)',
            border: '1px solid var(--md-sys-color-outline-variant)',
            borderRadius: '0 0 14px 14px',
            padding: '14px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: '#a6accd',
            overflowX: 'auto',
            lineHeight: 1.5,
            margin: 0
          }}
        >
          {currentHyprlandSnippet}
        </pre>
      </div>

      {/* 3. Pluggable BitTorrent / RSS Sourcing Aggregators */}
      <div style={{ background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: '24px', padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <Rss size={20} color="var(--md-sys-color-primary)" />
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>
            Content Sourcing Adapters (BitTorrent / RSS)
          </h2>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '16px' }}>
          Per the Yozora architecture spec, content sourcing remains torrent/RSS-shaped and user-configured with zero scraping of unlicensed streaming CDNs.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
          {providers.map(p => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--md-sys-color-surface-container-high)',
                padding: '12px 16px',
                borderRadius: '14px',
                border: '1px solid var(--md-sys-color-outline-variant)'
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{p.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--md-sys-color-on-surface-variant)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  {p.url} • <span style={{ color: '#4caf50' }}>{p.latencyMs}ms latency</span>
                </div>
              </div>

              <input
                type="checkbox"
                checked={p.enabled}
                onChange={() => toggleProvider(p.id)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--md-sys-color-primary)', cursor: 'pointer' }}
              />
            </div>
          ))}
        </div>

        {/* Add custom RSS form */}
        <form onSubmit={handleAddRss} style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            placeholder="Provider Name (e.g. SubsPlease)"
            value={customRssName}
            onChange={(e) => setCustomRssName(e.target.value)}
            style={{
              width: '180px',
              background: 'var(--md-sys-color-surface-container-high)',
              border: '1px solid var(--md-sys-color-outline-variant)',
              borderRadius: '12px',
              padding: '8px 14px',
              color: '#fff',
              fontSize: '13px',
              outline: 'none'
            }}
          />
          <input
            type="url"
            placeholder="RSS feed URL (e.g. https://nyaa.si/?page=rss)"
            value={customRssUrl}
            onChange={(e) => setCustomRssUrl(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--md-sys-color-surface-container-high)',
              border: '1px solid var(--md-sys-color-outline-variant)',
              borderRadius: '12px',
              padding: '8px 14px',
              color: '#fff',
              fontSize: '13px',
              outline: 'none'
            }}
          />
          <button type="submit" className="section-btn">
            <span>Add Feed</span>
          </button>
        </form>
      </div>

      {/* 4. AniList GraphQL Metadata & Account Watch Sync */}
      <div style={{ background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: '24px', padding: '24px', marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <Shield size={20} color="#02a9ff" />
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>
            AniList GraphQL Metadata & Cover Service
          </h2>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '16px' }}>
          Live anime metadata, cover posters, banners, streaming episodes, and seasonal airing schedules are queried directly via the public <strong>AniList GraphQL API</strong> with local 7-day TTL caching.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: anilistApiOnline ? '#4caf50' : '#f44336' }} />
          <span style={{ fontSize: '12px', color: anilistApiOnline ? '#4caf50' : '#f44336', fontWeight: 600 }}>
            {anilistApiOnline ? 'AniList GraphQL Engine Active • 800ms Rate Limit Protection' : 'AniList GraphQL Offline / Unreachable'}
          </span>
        </div>
      </div>

      {/* 4b. AniList Account Watch Progress Sync */}
      <div style={{ background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: '24px', padding: '24px', marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={20} color="var(--md-sys-color-primary)" />
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>
              AniList Account Watch Sync
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: anilistToken ? '#4caf50' : '#888' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: anilistToken ? '#4caf50' : '#aaa' }}>
              {anilistToken ? 'AniList Sync Connected' : 'Unlinked (Local-Only Tracking)'}
            </span>
          </div>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '16px' }}>
          Enter your <strong>AniList Personal Access Token</strong> to automatically sync episode watch progress, completed status, and ratings back to your public AniList profile as you watch.
        </p>

        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="password"
            placeholder="Paste your AniList OAuth / Access Token..."
            value={anilistToken}
            onChange={(e) => setAnilistToken(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--md-sys-color-surface-container-high)',
              border: '1px solid var(--md-sys-color-outline-variant)',
              borderRadius: '12px',
              padding: '8px 14px',
              color: '#fff',
              fontSize: '13px'
            }}
          />
          <button
            type="button"
            className="section-btn"
            onClick={handleSaveAniListToken}
            style={{ padding: '8px 20px' }}
          >
            {anilistToken ? 'Save Token' : 'Clear Token'}
          </button>
        </div>
      </div>

      {/* 5. rqbit BT Streaming Core & Zero-Bloat Storage Engine */}
      <div style={{ background: 'var(--md-sys-color-surface-container)', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: '24px', padding: '24px', marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Cpu size={20} color="var(--md-sys-color-primary)" />
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>
              rqbit BitTorrent Streaming & Zero-Bloat Storage
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: rqbitStatus.running ? '#4caf50' : '#ff9800' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: rqbitStatus.running ? '#4caf50' : '#ff9800' }}>
              {rqbitStatus.running ? `rqbit Daemon Online (Port ${rqbitListenPort})` : 'rqbit Daemon Standby'}
            </span>
          </div>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '16px' }}>
          Yozora uses <strong>rqbit</strong> for high-speed sequential piece streaming. To prevent disk bloating on Windows and Linux, Yozora includes active cache pruning and ephemeral streaming flags.
        </p>

        {/* Windows vs Linux Launch Guide with --tmp anti-bloat flag */}
        <div
          style={{
            background: 'var(--md-sys-color-surface-container-high)',
            border: '1px solid var(--md-sys-color-outline-variant)',
            borderRadius: '16px',
            padding: '16px',
            marginBottom: '18px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <HardDrive size={15} color="var(--md-sys-color-primary)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                Zero-Bloat Startup Command (Prevents Disk Bloat)
              </span>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className={`section-btn ${osTab === 'windows' ? 'active' : ''}`}
                style={{ padding: '3px 10px', fontSize: '11px' }}
                onClick={() => setOsTab('windows')}
              >
                Windows (PowerShell)
              </button>
              <button
                type="button"
                className={`section-btn ${osTab === 'linux' ? 'active' : ''}`}
                style={{ padding: '3px 10px', fontSize: '11px' }}
                onClick={() => setOsTab('linux')}
              >
                Linux / macOS (Bash)
              </button>
            </div>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)', lineHeight: 1.5, margin: '0 0 10px 0' }}>
            {osTab === 'windows' ? (
              <span>
                Adding the <code>--tmp</code> parameter forces rqbit to use Windows's temporary cache directory, ensuring files never accumulate permanently in your user directory.
              </span>
            ) : (
              <span>
                Uses ephemeral <code>/tmp</code> or your user directory with automatic CORS headers for browser player access.
              </span>
            )}
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(0,0,0,0.4)',
              borderRadius: '8px',
              padding: '8px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--md-sys-color-primary)',
              overflowX: 'auto'
            }}
          >
            <span>
              {osTab === 'windows'
                ? 'rqbit server start --tmp -l 0.0.0.0:3030 --http-api-cors-allow-origins "*"'
                : 'rqbit server start --tmp -l 0.0.0.0:3030 --http-api-cors-allow-origins "*"'}
            </span>
            <button
              type="button"
              className="section-btn"
              onClick={() => {
                const cmd = osTab === 'windows'
                  ? 'rqbit server start --tmp -l 0.0.0.0:3030 --http-api-cors-allow-origins "*"'
                  : 'rqbit server start --tmp -l 0.0.0.0:3030 --http-api-cors-allow-origins "*"';
                navigator.clipboard.writeText(cmd);
                showToast('Copied Zero-Bloat launch command!', 'success');
              }}
              style={{ padding: '4px 10px', fontSize: '11px', marginLeft: '10px', whiteSpace: 'nowrap' }}
            >
              <Copy size={12} />
              <span>Copy</span>
            </button>
          </div>
        </div>

        {/* Zero-Bloat Storage & Cache Controls */}
        <div
          style={{
            background: 'var(--md-sys-color-surface-container-high)',
            border: '1px solid var(--md-sys-color-outline-variant)',
            borderRadius: '16px',
            padding: '16px',
            marginBottom: '18px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={16} color="var(--md-sys-color-primary)" />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                Disk Storage & Stream Cache Pruner
              </h3>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="section-btn"
                onClick={handleRefreshCacheList}
                style={{ padding: '4px 10px', fontSize: '11px' }}
                title="Refresh cached torrent list from daemon"
              >
                <RefreshCw size={12} />
                <span>Scan Disk</span>
              </button>

              <button
                type="button"
                className="section-btn"
                onClick={handlePurgeAllCache}
                disabled={isPurging}
                style={{
                  padding: '4px 12px',
                  fontSize: '11px',
                  background: 'rgba(244, 67, 54, 0.15)',
                  color: '#ff5252',
                  borderColor: 'rgba(244, 67, 54, 0.3)',
                  fontWeight: 600
                }}
              >
                <Trash2 size={12} />
                <span>{isPurging ? 'Purging Disk...' : 'Purge All Stream Cache'}</span>
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            {/* Auto cleanup toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--md-sys-color-surface-container-highest)',
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1px solid var(--md-sys-color-outline-variant)'
              }}
            >
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>
                  Auto-Delete Cache on Finish
                </div>
                <div style={{ fontSize: '10px', color: 'var(--md-sys-color-on-surface-variant)', marginTop: '2px' }}>
                  Erase completed video files when switching episodes
                </div>
              </div>

              <input
                type="checkbox"
                checked={autoCleanupCache}
                onChange={handleToggleAutoCleanup}
                style={{ width: '16px', height: '16px', accentColor: 'var(--md-sys-color-primary)', cursor: 'pointer' }}
              />
            </div>

            {/* Retention limit selector */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--md-sys-color-surface-container-highest)',
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1px solid var(--md-sys-color-outline-variant)'
              }}
            >
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>
                  Cache Retention Limit
                </div>
                <div style={{ fontSize: '10px', color: 'var(--md-sys-color-on-surface-variant)', marginTop: '2px' }}>
                  Maximum episodes kept on disk
                </div>
              </div>

              <select
                value={retentionCount}
                onChange={(e) => handleSetRetention(Number(e.target.value))}
                style={{
                  background: 'var(--md-sys-color-surface-container)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  color: '#fff',
                  borderRadius: '8px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value={0}>0 (Ephemeral - Zero Disk)</option>
                <option value={1}>1 Episode (~1.4 GB)</option>
                <option value={3}>3 Episodes (~4.2 GB)</option>
                <option value={5}>5 Episodes (~7.0 GB)</option>
                <option value={999}>Keep All (No Prune)</option>
              </select>
            </div>
          </div>

          {/* Active Cached Torrents in rqbit list */}
          {cachedTorrents.length > 0 ? (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Cached Torrents on Disk ({cachedTorrents.length})</span>
                <span>
                  Total Used: <b style={{ color: 'var(--md-sys-color-primary)' }}>
                    {formatBytes(cachedTorrents.reduce((acc, t) => acc + (t.progress_bytes || t.total_bytes || 0), 0))}
                  </b>
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                {cachedTorrents.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(0,0,0,0.25)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                      <span style={{ color: '#fff', fontWeight: 500 }}>{t.name}</span>
                      <div style={{ fontSize: '10px', color: 'var(--md-sys-color-on-surface-variant)', marginTop: '2px' }}>
                        Downloaded: {formatBytes(t.progress_bytes)} / {formatBytes(t.total_bytes)} • State: {t.state}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteTorrent(t.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ff5252',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px'
                      }}
                      title="Delete torrent and erase file from disk"
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '12px', color: 'var(--md-sys-color-on-surface-variant)', fontSize: '12px' }}>
              {rqbitStatus.running ? '✨ Disk is clean! No cached torrents occupying space.' : 'rqbit daemon is currently offline.'}
            </div>
          )}
        </div>

        {/* Port & Cache Directory Configuration */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)', display: 'block', marginBottom: '4px' }}>
              rqbit HTTP Listen Port
            </label>
            <input
              type="text"
              value={rqbitListenPort}
              onChange={(e) => setRqbitListenPort(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--md-sys-color-surface-container-high)',
                border: '1px solid var(--md-sys-color-outline-variant)',
                borderRadius: '12px',
                padding: '8px 12px',
                color: '#fff',
                fontSize: '13px'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)', display: 'block', marginBottom: '4px' }}>
              Ephemeral Cache Directory
            </label>
            <input
              type="text"
              readOnly
              value={osTab === 'windows' ? '%TEMP%\\rqbit-streams' : '/tmp/rqbit-streams'}
              style={{
                width: '100%',
                background: 'var(--md-sys-color-surface-container-high)',
                border: '1px solid var(--md-sys-color-outline-variant)',
                borderRadius: '12px',
                padding: '8px 12px',
                color: '#a6accd',
                fontSize: '13px',
                fontFamily: 'var(--font-mono)'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
              Default to External mpv Player (Seanime Standard)
            </div>
            <div style={{ fontSize: '11px', color: 'var(--md-sys-color-on-surface-variant)', marginTop: '2px' }}>
              Launch mpv with IPC socket, hardware acceleration, and native 10-bit HEVC / ASS subtitle decoding
            </div>
          </div>

          <input
            type="checkbox"
            checked={useExternalMpv}
            onChange={handleToggleExternalMpv}
            style={{ width: '18px', height: '18px', accentColor: 'var(--md-sys-color-primary)', cursor: 'pointer' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
          <button
            type="button"
            className="section-btn"
            onClick={handleStartRqbit}
            style={{ background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', borderColor: 'var(--md-sys-color-primary)', padding: '8px 18px' }}
          >
            <RefreshCw size={14} />
            <span>{rqbitStatus.running ? 'Restart rqbit Daemon' : 'Test / Start Daemon'}</span>
          </button>

          {rqbitStatus.running && (
            <button
              type="button"
              className="section-btn"
              onClick={async () => {
                await rqbitService.stopServer();
                setRqbitStatus({ running: false, listen_addr: `127.0.0.1:${rqbitListenPort}` });
                showToast('Stopped rqbit daemon.', 'info');
              }}
              style={{ background: 'var(--md-sys-color-surface-container-high)', color: '#ff5252', padding: '8px 18px' }}
            >
              <span>Stop Daemon</span>
            </button>
          )}

          <div style={{ fontSize: '11px', color: 'var(--md-sys-color-on-surface-variant)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
            Endpoint: http://127.0.0.1:{rqbitListenPort}/torrents
          </div>
        </div>
      </div>

      {/* Subtitles & Audio Languages Engine Settings Card */}
      <div className="m3-card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <Subtitles size={20} color="var(--md-sys-color-primary)" />
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>
              Subtitles & Audio Language Preferences
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)' }}>
              Configure automatic Dub/Sub ranking, preferred subtitle language, and custom subtitle rendering typography.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          {/* Default Audio Mode */}
          <div
            style={{
              background: 'var(--md-sys-color-surface-container-high)',
              border: '1px solid var(--md-sys-color-outline-variant)',
              borderRadius: '14px',
              padding: '14px 16px'
            }}
          >
            <label style={{ fontSize: '13px', fontWeight: 700, color: '#fff', display: 'block', marginBottom: '4px' }}>
              Default Audio Track Mode
            </label>
            <p style={{ fontSize: '11px', color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '10px' }}>
              Prioritizes torrent swarms and streams matching your choice:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
              {(['sub', 'dub', 'dual', 'all'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={async () => {
                    setDefaultAudioMode(mode);
                    await subtitleService.saveLanguagePreferences({ defaultAudioMode: mode });
                    showToast(`Default audio mode set to: ${mode.toUpperCase()}`, 'info');
                  }}
                  style={{
                    background: defaultAudioMode === mode ? 'var(--md-sys-color-primary)' : 'rgba(255,255,255,0.06)',
                    color: defaultAudioMode === mode ? 'var(--md-sys-color-on-primary)' : '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textTransform: 'uppercase'
                  }}
                >
                  {mode === 'sub' ? '🇯🇵 Sub (JP)' : mode === 'dub' ? '🇬🇧 Dub (EN)' : mode === 'dual' ? '🎧 Dual Audio' : '🌐 All Sources'}
                </button>
              ))}
            </div>
          </div>

          {/* Preferred Subtitle Language */}
          <div
            style={{
              background: 'var(--md-sys-color-surface-container-high)',
              border: '1px solid var(--md-sys-color-outline-variant)',
              borderRadius: '14px',
              padding: '14px 16px'
            }}
          >
            <label style={{ fontSize: '13px', fontWeight: 700, color: '#fff', display: 'block', marginBottom: '4px' }}>
              Preferred Subtitle Language
            </label>
            <p style={{ fontSize: '11px', color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '10px' }}>
              Auto-selected when opening episodes with multi-subs:
            </p>
            <select
              value={preferredSubLang}
              onChange={async (e) => {
                const lang = e.target.value;
                setPreferredSubLang(lang);
                await subtitleService.saveLanguagePreferences({ preferredSubLang: lang });
                showToast(`Preferred subtitle language: ${lang.toUpperCase()}`, 'info');
              }}
              style={{
                width: '100%',
                background: 'var(--md-sys-color-surface-container-highest)',
                border: '1px solid var(--md-sys-color-outline-variant)',
                borderRadius: '10px',
                padding: '8px 12px',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {SUPPORTED_LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code} style={{ background: '#1c1921' }}>
                  {lang.flag} {lang.label} ({lang.nativeLabel})
                </option>
              ))}
            </select>
          </div>

          {/* Preferred Dubbed Voice Language */}
          <div
            style={{
              background: 'var(--md-sys-color-surface-container-high)',
              border: '1px solid var(--md-sys-color-outline-variant)',
              borderRadius: '14px',
              padding: '14px 16px'
            }}
          >
            <label style={{ fontSize: '13px', fontWeight: 700, color: '#fff', display: 'block', marginBottom: '4px' }}>
              Preferred Dubbed Voice Language
            </label>
            <p style={{ fontSize: '11px', color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '10px' }}>
              For finding international dubs (English, Spanish, German, French, etc.):
            </p>
            <select
              value={preferredAudioLang}
              onChange={async (e) => {
                const lang = e.target.value;
                setPreferredAudioLang(lang);
                await subtitleService.saveLanguagePreferences({ preferredAudioLang: lang });
                showToast(`Preferred audio language: ${lang.toUpperCase()}`, 'info');
              }}
              style={{
                width: '100%',
                background: 'var(--md-sys-color-surface-container-highest)',
                border: '1px solid var(--md-sys-color-outline-variant)',
                borderRadius: '10px',
                padding: '8px 12px',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
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

        {/* Subtitle Typography & Rendering Appearance */}
        <div style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '12px' }}>
            In-Player Subtitle Rendering Typography
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Font Size</span>
                <span style={{ color: 'var(--md-sys-color-primary)', fontWeight: 700 }}>{subtitleStyle.fontSize}px</span>
              </div>
              <input
                type="range"
                min="16"
                max="44"
                step="2"
                value={subtitleStyle.fontSize}
                onChange={async (e) => {
                  const next = { ...subtitleStyle, fontSize: parseInt(e.target.value, 10) };
                  setSubtitleStyle(next);
                  await subtitleService.saveSubtitleStyle(next);
                }}
                style={{ width: '100%', accentColor: 'var(--md-sys-color-primary)', cursor: 'pointer' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Background Opacity</span>
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

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>Bottom Margin</span>
                <span style={{ color: 'var(--md-sys-color-primary)', fontWeight: 700 }}>{subtitleStyle.bottomOffset}px</span>
              </div>
              <input
                type="range"
                min="20"
                max="120"
                step="5"
                value={subtitleStyle.bottomOffset}
                onChange={async (e) => {
                  const next = { ...subtitleStyle, bottomOffset: parseInt(e.target.value, 10) };
                  setSubtitleStyle(next);
                  await subtitleService.saveSubtitleStyle(next);
                }}
                style={{ width: '100%', accentColor: 'var(--md-sys-color-primary)', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Subtitle Live Preview */}
          <div
            style={{
              background: '#0d0a11',
              borderRadius: '12px',
              padding: '18px',
              textAlign: 'center',
              border: '1px solid rgba(255,255,255,0.06)'
            }}
          >
            <span
              style={{
                display: 'inline-block',
                background: subtitleStyle.backgroundOpacity > 0 ? `rgba(0,0,0,${subtitleStyle.backgroundOpacity})` : 'transparent',
                color: subtitleStyle.textColor,
                fontSize: `${Math.min(24, subtitleStyle.fontSize)}px`,
                fontWeight: 700,
                padding: '4px 12px',
                borderRadius: '6px',
                textShadow: subtitleStyle.textShadow ? '0 2px 4px #000, -1px -1px 0 #000, 1px -1px 0 #000' : 'none'
              }}
            >
              Yozora Subtitle Engine — Live Preview
            </span>
          </div>
        </div>
      </div>

      {/* Matugen JSON Dialog */}
      {showJsonDialog && (
        <div className="modal-overlay" onClick={() => setShowJsonDialog(false)}>
          <div className="m3-dialog" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>
                Import Matugen colors.json Config
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '16px' }}>
                Paste the contents of <code style={{ color: 'var(--md-sys-color-primary)' }}>~/.config/matugen/colors.json</code> to apply your live Hyprland theme.
              </p>

              <form onSubmit={handleApplyMatugenJson}>
                <textarea
                  placeholder='{"colors": {"primary": "#e4b5cb", "surface": "#151218", ...}}'
                  value={matugenJsonInput}
                  onChange={(e) => setMatugenJsonInput(e.target.value)}
                  style={{
                    width: '100%',
                    height: '140px',
                    background: 'var(--md-sys-color-surface-container-high)',
                    border: '1px solid var(--md-sys-color-outline-variant)',
                    borderRadius: '12px',
                    padding: '12px',
                    color: '#fff',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                    resize: 'none',
                    marginBottom: '16px'
                  }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="section-btn" onClick={() => setShowJsonDialog(false)}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="section-btn"
                    style={{ background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', borderColor: 'var(--md-sys-color-primary)', fontWeight: 700 }}
                  >
                    Apply Theme
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
