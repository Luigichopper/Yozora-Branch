import React from 'react';
import { Sparkles, Settings, Minus, Square, Copy, X, Laptop, Terminal } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { windowService } from '../services/windowService';

export const TitleBar: React.FC = () => {
  const {
    currentView,
    setCurrentView,
    activePalette,
    osMode,
    resolvedOs,
    setOsMode,
    isMaximized,
    setIsMaximized,
    showToast
  } = useApp();

  // Close handler
  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await windowService.closeWindow();
    if (!res.native) {
      showToast('Window close signal triggered (Super+Q / Alt+F4)', 'info');
    }
  };

  // Minimize handler
  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await windowService.minimizeWindow();
    if (!res.native) {
      showToast('Window minimized to taskbar / system tray (Super+M)', 'info');
    }
  };

  // Maximize / Restore handler
  const handleMaximize = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const res = await windowService.toggleMaximizeWindow();
    setIsMaximized(res.isMaximized);
    showToast(
      res.isMaximized
        ? (resolvedOs === 'windows' ? 'Window Maximized (Win+Up)' : 'Window Tiled / Maximized (Super+Space)')
        : (resolvedOs === 'windows' ? 'Window Restored (Win+Down)' : 'Window Floating Restored (Super+Space)'),
      'info'
    );
  };

  // Double click titlebar to toggle maximize
  const handleDoubleClick = () => {
    handleMaximize();
  };

  // Drag handler for Tauri native window
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      windowService.startDragging();
    }
  };

  // Toggle OS layout preference between Arch Linux and Windows
  const toggleOsMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMode = resolvedOs === 'arch' ? 'windows' : 'arch';
    setOsMode(nextMode);
  };

  return resolvedOs === 'windows' ? (
    /* Windows 11 Fluent Titlebar Layout */
    <div
      className="windows-titlebar"
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '42px',
        paddingLeft: '14px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        background: 'rgba(21, 18, 24, 0.8)',
        backdropFilter: 'blur(24px)',
        userSelect: 'none'
      }}
    >
      {/* Left: Windows App Icon & Title & OS Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '4px',
            background: 'var(--md-sys-color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 10px rgba(228, 181, 203, 0.4)'
          }}
        >
          <span style={{ fontSize: '10px', fontWeight: 900, color: 'var(--md-sys-color-on-primary)' }}>夜</span>
        </div>

        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--md-sys-color-on-surface)' }}>
          Yozora
        </span>

        <button
          type="button"
          className="os-badge-btn"
          onClick={toggleOsMode}
          title="Click to switch between Windows 11 Fluent and Arch Linux Hyprland titlebar"
        >
          <Laptop size={11} color="var(--md-sys-color-primary)" />
          <span>windows 11 (fluent)</span>
        </button>
      </div>

      {/* Middle: Theme Chip */}
      <div className="app-title-chip" style={{ cursor: 'pointer' }} onClick={() => setCurrentView('settings')}>
        <div className="pulse-dot" />
        <span>v0.1.0 • {activePalette.name.split(' ')[0]}</span>
      </div>

      {/* Right: Actions & Windows 11 Caption Controls */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        <div className="titlebar-actions" style={{ marginRight: '12px' }}>
          <button
            className="section-btn"
            style={{ padding: '4px 10px', fontSize: '11px', background: 'transparent' }}
            onClick={() => setCurrentView('settings')}
            title="Matugen Dynamic Theming"
          >
            <Sparkles size={13} color="var(--md-sys-color-primary)" />
            <span>Matugen</span>
          </button>

          <button
            className="section-btn"
            style={{ padding: '4px 10px', fontSize: '11px' }}
            onClick={() => setCurrentView('settings')}
            title="App & Window Settings"
          >
            <Settings size={13} />
          </button>

          <div
            className="avatar-badge"
            title="AniDB Profile: Luigi (Connected)"
            onClick={() => setCurrentView('library')}
            style={{
              width: '24px',
              height: '24px',
              backgroundImage: 'url(https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=120&q=80)'
            }}
          />
        </div>

        {/* Windows 11 Caption Buttons */}
        <div className="win-caption-group">
          {/* Minimize */}
          <button
            type="button"
            className="win-caption-btn win-minimize"
            onClick={handleMinimize}
            title="Minimize (Win + Down)"
            aria-label="Minimize"
          >
            <Minus size={14} />
          </button>

          {/* Maximize / Restore */}
          <button
            type="button"
            className="win-caption-btn win-maximize"
            onClick={handleMaximize}
            title={isMaximized ? 'Restore Down (Win + Down)' : 'Maximize (Win + Up)'}
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Copy size={12} style={{ transform: 'rotate(180deg)' }} /> : <Square size={12} />}
          </button>

          {/* Close */}
          <button
            type="button"
            className="win-caption-btn win-close"
            onClick={handleClose}
            title="Close (Alt + F4)"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  ) : (
    /* Arch Linux / Hyprland Wayland Titlebar Layout */
    <div
      className="wayland-titlebar"
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '42px',
        padding: '0 16px',
        userSelect: 'none'
      }}
    >
      {/* Left: Arch Linux Traffic Dots & Wayland Tag */}
      <div className="window-controls">
        <div
          className="window-dot close"
          onClick={handleClose}
          title="Close (Super + Q)"
          role="button"
          tabIndex={0}
        />
        <div
          className="window-dot minimize"
          onClick={handleMinimize}
          title="Minimize to Tray (Super + M)"
          role="button"
          tabIndex={0}
        />
        <div
          className="window-dot maximize"
          onClick={handleMaximize}
          title={isMaximized ? 'Toggle Floating (Super + Space)' : 'Maximize / Tile (Super + Space)'}
          role="button"
          tabIndex={0}
        />

        <button
          type="button"
          className="os-badge-btn"
          onClick={toggleOsMode}
          title="Click to switch between Arch Linux Hyprland and Windows 11 Fluent titlebar"
          style={{ marginLeft: '6px' }}
        >
          <Terminal size={11} color="var(--md-sys-color-primary)" />
          <span>archlinux:wayland (hyprland)</span>
        </button>
      </div>

      {/* Middle: Title Chip */}
      <div className="app-title-chip" style={{ cursor: 'pointer' }} onClick={() => setCurrentView('settings')}>
        <div className="pulse-dot" />
        <span>Yozora v0.1.0 • {activePalette.name.split(' ')[0]}</span>
      </div>

      {/* Right: Actions */}
      <div className="titlebar-actions">
        <button
          className="section-btn"
          style={{ padding: '4px 10px', fontSize: '11px', background: 'transparent' }}
          onClick={() => setCurrentView('settings')}
          title="Matugen Dynamic Theming"
        >
          <Sparkles size={13} color="var(--md-sys-color-primary)" />
          <span>Matugen Sync</span>
        </button>

        <button
          className="section-btn"
          style={{ padding: '4px 10px', fontSize: '11px' }}
          onClick={() => setCurrentView('settings')}
          title="Hyprland & App Settings"
        >
          <Settings size={13} />
        </button>

        <div
          className="avatar-badge"
          title="AniDB Profile: Luigi (Connected)"
          onClick={() => setCurrentView('library')}
          style={{
            backgroundImage: 'url(https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=120&q=80)'
          }}
        />
      </div>
    </div>
  );
};
