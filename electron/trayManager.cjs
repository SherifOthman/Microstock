const { Tray, Menu, nativeImage } = require('electron');

/**
 * Generates a crisp 16x16 RGBA nativeImage emblem for the Windows System Tray.
 * Renders a rounded electric-blue / emerald StockFlow badge so the tray icon
 * is always sharp and never fails even when no external .ico asset is bundled.
 */
function createStockFlowTrayIcon(state = 'idle') {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);

  // BGRA/RGBA color palette depending on state
  // 'running' -> emerald (#10b981), 'paused' -> amber (#f59e0b), 'idle' -> sky/indigo (#38bdf8)
  const palette =
    state === 'running'
      ? { r: 16, g: 185, b: 129 }
      : state === 'paused'
      ? { r: 245, g: 158, b: 11 }
      : { r: 56, g: 189, b: 248 };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - 7.5;
      const dy = y - 7.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= 6.8) {
        // Inner white glyph ("S" / upward arrow bar)
        const isGlyph =
          (x >= 7 && x <= 8 && y >= 4 && y <= 11) ||
          (y >= 5 && y <= 6 && x >= 5 && x <= 10) ||
          (y === 11 && x >= 5 && x <= 10);

        if (isGlyph) {
          buf[idx] = 255;
          buf[idx + 1] = 255;
          buf[idx + 2] = 255;
          buf[idx + 3] = 255;
        } else {
          buf[idx] = palette.r;
          buf[idx + 1] = palette.g;
          buf[idx + 2] = palette.b;
          buf[idx + 3] = 255;
        }
      } else {
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 0;
      }
    }
  }

  try {
    return nativeImage.createFromBitmap(buf, { width: size, height: size });
  } catch {
    return nativeImage.createEmpty();
  }
}

const CACHED_TRAY_ICONS = {
  idle: null,
  running: null,
  paused: null,
};

function getCachedTrayIcon(state = 'idle') {
  const key = state === 'running' || state === 'paused' ? state : 'idle';
  if (!CACHED_TRAY_ICONS[key]) {
    CACHED_TRAY_ICONS[key] = createStockFlowTrayIcon(key);
  }
  return CACHED_TRAY_ICONS[key];
}

class StockFlowTrayManager {
  constructor({ getMainWindow, onSendTrayCommand, onRequestForceQuit }) {
    this.getMainWindow = getMainWindow;
    this.onSendTrayCommand = onSendTrayCommand;
    this.onRequestForceQuit = onRequestForceQuit;
    this.tray = null;
    this.tasks = new Map();
    this.lastMenuStatus = null;
    this.lastTooltipText = '';
    this.lastTooltipUpdateMs = 0;
  }

  ensureTray() {
    if (this.tray) return this.tray;
    try {
      const status = this.getAggregateStatus();
      const icon = getCachedTrayIcon(status);
      this.tray = new Tray(icon);
      this.tray.setToolTip('StockFlow Studio — Ready');

      this.tray.on('click', () => {
        this.showMainWindow();
      });

      this.tray.on('double-click', () => {
        this.showMainWindow();
      });

      this.refreshMenu(true);
    } catch (err) {
      console.warn('[TrayManager] Could not initialize system tray:', err.message);
    }
    return this.tray;
  }

  showMainWindow() {
    const win = this.getMainWindow ? this.getMainWindow() : null;
    if (!win || win.isDestroyed()) return;
    try {
      win.setSkipTaskbar(false);
      if (win.isMinimized()) {
        win.restore();
      }
      win.show();
      win.focus();
    } catch (err) {
      console.warn('[TrayManager] showMainWindow error:', err.message);
    }
  }

  updateTaskState(payload = {}) {
    const moduleId = String(payload.moduleId || 'ftp');
    const isRunning = Boolean(payload.isRunning);
    const isPaused = Boolean(payload.isPaused);
    const progressPercent = Number(payload.progressPercent || 0);
    const statusLabel = String(payload.statusLabel || '');

    const prevStatus = this.getAggregateStatus();

    if (!isRunning && !isPaused) {
      this.tasks.delete(moduleId);
    } else {
      this.tasks.set(moduleId, {
        moduleId,
        isRunning,
        isPaused,
        progressPercent,
        statusLabel,
        updatedAt: Date.now(),
      });
    }

    this.ensureTray();
    const nextStatus = this.getAggregateStatus();
    const statusChanged = prevStatus !== nextStatus || this.lastMenuStatus !== nextStatus;
    this.refreshMenu(statusChanged);
    return this.getSummary();
  }

  hasActiveOrPausedTasks() {
    for (const task of this.tasks.values()) {
      if (task.isRunning || task.isPaused) {
        return true;
      }
    }
    return false;
  }

  getAggregateStatus() {
    let anyRunning = false;
    let anyPaused = false;
    for (const task of this.tasks.values()) {
      if (task.isRunning && !task.isPaused) anyRunning = true;
      if (task.isPaused) anyPaused = true;
    }
    if (anyRunning) return 'running';
    if (anyPaused) return 'paused';
    return 'idle';
  }

  getSummary() {
    const status = this.getAggregateStatus();
    const activeList = Array.from(this.tasks.values());
    const primary =
      activeList.find((t) => t.isRunning && !t.isPaused) || activeList[0] || null;
    return {
      status,
      hasActiveOrPaused: this.hasActiveOrPausedTasks(),
      activeCount: activeList.length,
      primaryLabel: primary
        ? primary.statusLabel ||
          `${primary.moduleId.toUpperCase()}: ${
            primary.isPaused ? 'Paused' : `Running (${primary.progressPercent}%)`
          }`
        : 'Idle — Ready',
    };
  }

  refreshMenu(forceRebuild = false) {
    if (!this.tray) return;
    try {
      const summary = this.getSummary();
      const now = Date.now();
      const nextTooltip = `StockFlow — ${summary.primaryLabel}`;

      // Throttle tooltip updates to once every 3s unless status changed
      if (
        forceRebuild ||
        (nextTooltip !== this.lastTooltipText && now - this.lastTooltipUpdateMs >= 3000)
      ) {
        this.tray.setToolTip(nextTooltip);
        this.lastTooltipText = nextTooltip;
        this.lastTooltipUpdateMs = now;
      }

      // Only rebuild native Win32 Tray image & context menu when status ('idle' | 'running' | 'paused') changes
      if (!forceRebuild && this.lastMenuStatus === summary.status) {
        return;
      }

      this.lastMenuStatus = summary.status;
      const icon = getCachedTrayIcon(summary.status);
      this.tray.setImage(icon);

      const isRunning = summary.status === 'running';
      const isPaused = summary.status === 'paused';
      const statusHeader =
        summary.status === 'running'
          ? 'StockFlow — Active Task Running'
          : summary.status === 'paused'
          ? 'StockFlow — Task Paused'
          : 'StockFlow — Idle & Ready';

      const menuTemplate = [
        {
          label: statusHeader,
          enabled: false,
        },
        { type: 'separator' },
        {
          label: 'Show App',
          click: () => {
            this.showMainWindow();
          },
        },
        {
          label: isPaused ? 'Resume Tasks' : 'Pause Tasks',
          enabled: isRunning || isPaused,
          click: () => {
            if (typeof this.onSendTrayCommand === 'function') {
              this.onSendTrayCommand(isPaused ? 'resume-all' : 'pause-all');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Quit StockFlow',
          click: () => {
            if (typeof this.onRequestForceQuit === 'function') {
              this.onRequestForceQuit();
            }
          },
        },
      ];

      const contextMenu = Menu.buildFromTemplate(menuTemplate);
      this.tray.setContextMenu(contextMenu);
    } catch (err) {
      console.warn('[TrayManager] refreshMenu error:', err.message);
    }
  }

  destroy() {
    if (this.tray) {
      try {
        this.tray.destroy();
      } catch {
        // ignore
      }
      this.tray = null;
    }
  }
}

module.exports = { StockFlowTrayManager };
