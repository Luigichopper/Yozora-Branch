import { db } from './db';

export interface SubtitleCue {
  id?: string;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
}

export interface SubtitleTrack {
  id: string;
  url?: string;
  lang: string;
  label: string;
  isDefault?: boolean;
  isCustom?: boolean;
  cues?: SubtitleCue[];
  type?: 'vtt' | 'srt' | 'ass' | 'embedded';
}

export interface SubtitleStyleConfig {
  fontSize: number; // px (e.g. 24)
  textColor: string; // e.g. '#ffffff'
  backgroundColor: string; // e.g. 'rgba(0,0,0,0.75)'
  backgroundOpacity: number; // 0 to 1
  textShadow: boolean;
  fontFamily: string;
  bottomOffset: number; // px
  syncDelayMs: number; // milliseconds (-5000 to +5000)
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyleConfig = {
  fontSize: 24,
  textColor: '#ffffff',
  backgroundColor: 'rgba(0,0,0,0.75)',
  backgroundOpacity: 0.6,
  textShadow: true,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  bottomOffset: 48,
  syncDelayMs: 0
};

export interface LanguageOption {
  code: string;
  label: string;
  nativeLabel: string;
  flag?: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', flag: '🇬🇧' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語', flag: '🇯🇵' },
  { code: 'es', label: 'Spanish (LatAm)', nativeLabel: 'Español Latino', flag: '🇲🇽' },
  { code: 'es-es', label: 'Spanish (Spain)', nativeLabel: 'Español Castellano', flag: '🇪🇸' },
  { code: 'fr', label: 'French', nativeLabel: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', label: 'Portuguese (Brazil)', nativeLabel: 'Português Brasileiro', flag: '🇧🇷' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano', flag: '🇮🇹' },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский', flag: '🇷🇺' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', flag: '🇸🇦' },
  { code: 'zh', label: 'Chinese (Simplified)', nativeLabel: '简体中文', flag: '🇨🇳' },
  { code: 'zh-tw', label: 'Chinese (Traditional)', nativeLabel: '繁體中文', flag: '🇹🇼' },
  { code: 'id', label: 'Indonesian', nativeLabel: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'ko', label: 'Korean', nativeLabel: '한국어', flag: '🇰🇷' },
  { code: 'vi', label: 'Vietnamese', nativeLabel: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'th', label: 'Thai', nativeLabel: 'ไทย', flag: '🇹🇭' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', flag: '🇮🇳' }
];

export interface LanguagePreferenceConfig {
  defaultAudioMode: 'sub' | 'dub' | 'dual' | 'all';
  preferredAudioLang: string;
  preferredSubLang: string;
  autoEnableSubtitles: boolean;
}

class SubtitleService {
  /**
   * Parse timestamp in HH:MM:SS.mmm or MM:SS.mmm or HH:MM:SS,mmm to seconds
   */
  public parseTimestamp(str: string): number {
    const clean = str.trim().replace(',', '.');
    const parts = clean.split(':');
    if (parts.length === 3) {
      const h = parseFloat(parts[0]);
      const m = parseFloat(parts[1]);
      const s = parseFloat(parts[2]);
      return h * 3600 + m * 60 + s;
    } else if (parts.length === 2) {
      const m = parseFloat(parts[0]);
      const s = parseFloat(parts[1]);
      return m * 60 + s;
    }
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
  }

  /**
   * Parse WebVTT content into SubtitleCues
   */
  public parseWebVTT(content: string): SubtitleCue[] {
    const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const cues: SubtitleCue[] = [];
    let i = 0;

    // Skip WEBVTT header
    while (i < lines.length && !lines[i].includes('-->')) {
      i++;
    }

    while (i < lines.length) {
      const line = lines[i].trim();
      if (line.includes('-->')) {
        const [startStr, endStr] = line.split('-->');
        const start = this.parseTimestamp(startStr.split(' ')[0] || '');
        const end = this.parseTimestamp((endStr || '').trim().split(' ')[0] || '');

        i++;
        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '') {
          // Clean HTML/VTT tags like <c.yellow>, <v Speaker>, <b>, </i>
          const cleanedLine = lines[i]
            .replace(/<\/?[^>]+(>|$)/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();
          if (cleanedLine) {
            textLines.push(cleanedLine);
          }
          i++;
        }

        if (textLines.length > 0 && end > start) {
          cues.push({
            start,
            end,
            text: textLines.join('\n')
          });
        }
      }
      i++;
    }

    return cues;
  }

  /**
   * Parse SubRip (.srt) content into SubtitleCues
   */
  public parseSRT(content: string): SubtitleCue[] {
    const blocks = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n/);
    const cues: SubtitleCue[] = [];

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length >= 2) {
        // Find line with '-->'
        const arrowIdx = lines.findIndex(l => l.includes('-->'));
        if (arrowIdx !== -1) {
          const [startStr, endStr] = lines[arrowIdx].split('-->');
          const start = this.parseTimestamp(startStr.trim());
          const end = this.parseTimestamp(endStr.trim());

          const textLines = lines.slice(arrowIdx + 1).map(l =>
            l.replace(/<\/?[^>]+(>|$)/g, '').trim()
          ).filter(Boolean);

          if (textLines.length > 0 && end > start) {
            cues.push({
              start,
              end,
              text: textLines.join('\n')
            });
          }
        }
      }
    }

    return cues;
  }

  /**
   * Parse Advanced SubStation Alpha (.ass / .ssa) content into SubtitleCues
   */
  public parseASS(content: string): SubtitleCue[] {
    const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const cues: SubtitleCue[] = [];
    let formatKeys: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Format:')) {
        formatKeys = trimmed.replace('Format:', '').split(',').map(k => k.trim().toLowerCase());
      } else if (trimmed.startsWith('Dialogue:')) {
        const rawValues = trimmed.replace('Dialogue:', '').trim();
        // The text part may contain commas, so only split up to formatKeys length - 1
        const parts: string[] = [];
        let curr = '';
        let splitCount = 0;
        const maxSplits = formatKeys.length > 0 ? formatKeys.length - 1 : 9;

        for (let idx = 0; idx < rawValues.length; idx++) {
          const char = rawValues[idx];
          if (char === ',' && splitCount < maxSplits) {
            parts.push(curr.trim());
            curr = '';
            splitCount++;
          } else {
            curr += char;
          }
        }
        parts.push(curr.trim());

        const startIdx = formatKeys.indexOf('start');
        const endIdx = formatKeys.indexOf('end');
        const textIdx = formatKeys.indexOf('text');

        const startStr = startIdx !== -1 ? parts[startIdx] : parts[1];
        const endStr = endIdx !== -1 ? parts[endIdx] : parts[2];
        const textRaw = textIdx !== -1 ? parts[textIdx] : parts[parts.length - 1];

        if (startStr && endStr && textRaw) {
          const start = this.parseTimestamp(startStr);
          const end = this.parseTimestamp(endStr);
          // Strip ASS override tags like {\an8\pos(100,200)\c&H00FFFF&} and handle line breaks \N
          const cleanText = textRaw
            .replace(/\{[^}]+\}/g, '')
            .replace(/\\N/g, '\n')
            .replace(/\\n/g, '\n')
            .replace(/\\h/g, ' ')
            .trim();

          if (cleanText && end > start) {
            cues.push({
              start,
              end,
              text: cleanText
            });
          }
        }
      }
    }

    return cues;
  }

  /**
   * Auto-detect subtitle format and parse string content into cues
   */
  public parseSubtitleContent(content: string, filenameOrUrl = ''): SubtitleCue[] {
    const lower = (filenameOrUrl + '\n' + content.slice(0, 300)).toLowerCase();
    if (lower.includes('[events]') || lower.includes('dialogue:') || filenameOrUrl.endsWith('.ass') || filenameOrUrl.endsWith('.ssa')) {
      return this.parseASS(content);
    }
    if (lower.includes('webvtt') || filenameOrUrl.endsWith('.vtt')) {
      return this.parseWebVTT(content);
    }
    if (filenameOrUrl.endsWith('.srt') || /^\d+\s*\n\d\d:\d\d/m.test(content)) {
      return this.parseSRT(content);
    }
    // Fallback: try WebVTT then SRT
    const vtt = this.parseWebVTT(content);
    if (vtt.length > 0) return vtt;
    return this.parseSRT(content);
  }

  /**
   * Fetch remote subtitle file and parse
   */
  public async fetchRemoteSubtitles(url: string, label = 'Subtitles', lang = 'en'): Promise<SubtitleTrack> {
    const fetchWithTimeout = async (targetUrl: string): Promise<string> => {
      const res = await fetch(targetUrl, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    };

    let rawText = '';
    const fetchAttempts = [
      // 1. Direct fetch
      () => fetchWithTimeout(url),
      // 2. AllOrigins CORS proxy
      () => fetchWithTimeout(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`),
      // 3. Corsproxy.io fallback
      () => fetchWithTimeout(`https://corsproxy.io/?url=${encodeURIComponent(url)}`),
      // 4. CodeTab CORS proxy
      () => fetchWithTimeout(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`)
    ];

    for (const attempt of fetchAttempts) {
      try {
        const text = await attempt();
        if (text && text.trim().length > 10) {
          rawText = text;
          break;
        }
      } catch {
        // Try next proxy
      }
    }

    if (!rawText) {
      throw new Error(`Failed to load subtitle file from remote source.`);
    }

    const cues = this.parseSubtitleContent(rawText, url);
    return {
      id: `remote_${encodeURIComponent(url).slice(-20)}_${Date.now()}`,
      url,
      lang,
      label,
      cues,
      type: url.endsWith('.vtt') ? 'vtt' : url.endsWith('.ass') ? 'ass' : 'srt'
    };
  }

  /**
   * Read a local subtitle File object from user input
   */
  public async loadFromFile(file: File): Promise<SubtitleTrack> {
    const text = await file.text();
    const cues = this.parseSubtitleContent(text, file.name);
    
    // Guess language from filename
    let lang = 'en';
    let label = file.name.replace(/\.(vtt|srt|ass|ssa)$/i, '');

    for (const l of SUPPORTED_LANGUAGES) {
      if (file.name.toLowerCase().includes(l.code) || file.name.toLowerCase().includes(l.label.toLowerCase())) {
        lang = l.code;
        label = `${l.label} (Local File)`;
        break;
      }
    }

    return {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      lang,
      label: label.length > 30 ? label.slice(0, 27) + '...' : label,
      isCustom: true,
      cues,
      type: file.name.endsWith('.ass') ? 'ass' : file.name.endsWith('.vtt') ? 'vtt' : 'srt'
    };
  }

  /**
   * Find active cue for current playback time with sync offset applied
   */
  public getActiveCue(cues: SubtitleCue[] | undefined, currentTime: number, syncDelayMs = 0): SubtitleCue | null {
    if (!cues || cues.length === 0) return null;
    const adjustedTime = currentTime + (syncDelayMs / 1000);
    
    // Quick search
    return cues.find(c => adjustedTime >= c.start && adjustedTime <= c.end) || null;
  }

  /**
   * Generate downloadable WebVTT blob URL
   */
  public cuesToWebVTTBlobUrl(cues: SubtitleCue[]): string {
    const formatVttTime = (secs: number) => {
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = Math.floor(secs % 60);
      const ms = Math.floor((secs % 1) * 1000);
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    };

    let vtt = 'WEBVTT\n\n';
    cues.forEach((c, idx) => {
      vtt += `${idx + 1}\n${formatVttTime(c.start)} --> ${formatVttTime(c.end)}\n${c.text}\n\n`;
    });

    const blob = new Blob([vtt], { type: 'text/vtt' });
    return URL.createObjectURL(blob);
  }

  /**
   * Load Subtitle Style preferences from database
   */
  public async getSubtitleStyle(): Promise<SubtitleStyleConfig> {
    return await db.getSetting<SubtitleStyleConfig>('subtitle_style', DEFAULT_SUBTITLE_STYLE);
  }

  /**
   * Save Subtitle Style preferences to database
   */
  public async saveSubtitleStyle(style: SubtitleStyleConfig): Promise<void> {
    await db.saveSetting('subtitle_style', style);
  }

  /**
   * Get Preferred Audio & Subtitle Language preferences
   */
  public async getLanguagePreferences(): Promise<LanguagePreferenceConfig> {
    const defaultAudioMode = await db.getSetting<'sub' | 'dub' | 'dual' | 'all'>('default_audio_mode', 'sub');
    const preferredAudioLang = await db.getSetting<string>('preferred_audio_lang', 'ja');
    const preferredSubLang = await db.getSetting<string>('preferred_sub_lang', 'en');
    const autoEnableSubtitles = await db.getSetting<boolean>('auto_enable_subtitles', true);

    return {
      defaultAudioMode,
      preferredAudioLang,
      preferredSubLang,
      autoEnableSubtitles
    };
  }

  /**
   * Save Preferred Audio & Subtitle Language preferences
   */
  public async saveLanguagePreferences(prefs: {
    defaultAudioMode?: 'sub' | 'dub' | 'dual' | 'all';
    preferredAudioLang?: string;
    preferredSubLang?: string;
    autoEnableSubtitles?: boolean;
  }): Promise<void> {
    if (prefs.defaultAudioMode !== undefined) {
      await db.saveSetting('default_audio_mode', prefs.defaultAudioMode);
    }
    if (prefs.preferredAudioLang !== undefined) {
      await db.saveSetting('preferred_audio_lang', prefs.preferredAudioLang);
    }
    if (prefs.preferredSubLang !== undefined) {
      await db.saveSetting('preferred_sub_lang', prefs.preferredSubLang);
    }
    if (prefs.autoEnableSubtitles !== undefined) {
      await db.saveSetting('auto_enable_subtitles', prefs.autoEnableSubtitles);
    }
  }
}

export const subtitleService = new SubtitleService();
