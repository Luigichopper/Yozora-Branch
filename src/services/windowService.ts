/**
 * Cross-platform Window Management Service
 * Supports native Tauri window API (Windows / Arch Linux / macOS) with browser fallback
 */

export type OsMode = 'auto' | 'arch' | 'windows';
export type DetectedPlatform = 'arch' | 'windows' | 'linux' | 'macos' | 'web';

class WindowService {
  private isTauriEnv(): boolean {
    return typeof window !== 'undefined' && ('__TAURI_IPC__' in window || '__TAURI__' in window);
  }

  public detectPlatform(): DetectedPlatform {
    if (typeof navigator === 'undefined') return 'arch';
    const ua = navigator.userAgent.toLowerCase();
    const plat = (navigator.platform || '').toLowerCase();

    if (ua.includes('win') || plat.includes('win')) {
      return 'windows';
    }
    if (ua.includes('linux') || plat.includes('linux')) {
      return 'arch';
    }
    if (ua.includes('mac') || plat.includes('mac')) {
      return 'macos';
    }
    return 'arch';
  }

  /**
   * Minimize the application window
   */
  public async minimizeWindow(): Promise<{ success: boolean; native: boolean }> {
    if (this.isTauriEnv()) {
      try {
        const { appWindow } = await import('@tauri-apps/api/window');
        await appWindow.minimize();
        return { success: true, native: true };
      } catch (err) {
        console.warn('[WindowService] Tauri minimize error:', err);
      }
    }

    // Web Fallback: minimize or notify
    return { success: true, native: false };
  }

  /**
   * Maximize or toggle maximize for the window
   */
  public async toggleMaximizeWindow(): Promise<{ isMaximized: boolean; native: boolean }> {
    if (this.isTauriEnv()) {
      try {
        const { appWindow } = await import('@tauri-apps/api/window');
        await appWindow.toggleMaximize();
        const max = await appWindow.isMaximized();
        return { isMaximized: max, native: true };
      } catch (err) {
        console.warn('[WindowService] Tauri maximize error:', err);
      }
    }

    // Web Fallback: Toggle document fullscreen
    if (typeof document !== 'undefined') {
      if (!document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen();
          return { isMaximized: true, native: false };
        } catch {
          // Fullscreen might be restricted by iframe
          return { isMaximized: true, native: false };
        }
      } else {
        try {
          await document.exitFullscreen();
          return { isMaximized: false, native: false };
        } catch {
          return { isMaximized: false, native: false };
        }
      }
    }

    return { isMaximized: false, native: false };
  }

  /**
   * Close the application window
   */
  public async closeWindow(): Promise<{ success: boolean; native: boolean }> {
    if (this.isTauriEnv()) {
      try {
        const { appWindow } = await import('@tauri-apps/api/window');
        await appWindow.close();
        return { success: true, native: true };
      } catch (err) {
        console.warn('[WindowService] Tauri close error:', err);
      }
    }

    // Web Fallback: Attempt window.close or signal
    return { success: true, native: false };
  }

  /**
   * Start dragging the native Tauri window
   */
  public async startDragging(): Promise<void> {
    if (this.isTauriEnv()) {
      try {
        const { appWindow } = await import('@tauri-apps/api/window');
        await appWindow.startDragging();
      } catch {
        // Ignore drag errors in webview
      }
    }
  }

  /**
   * Query current maximization state
   */
  public async isMaximized(): Promise<boolean> {
    if (this.isTauriEnv()) {
      try {
        const { appWindow } = await import('@tauri-apps/api/window');
        return await appWindow.isMaximized();
      } catch {
        return false;
      }
    }
    return Boolean(typeof document !== 'undefined' && document.fullscreenElement);
  }
}

export const windowService = new WindowService();
