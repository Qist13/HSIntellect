import path from "path";
import { BrowserWindow, screen } from "electron";
import { getSettings, updateSettings } from "../settings.js";

const UI_DIR = path.join(import.meta.dirname, "..", "ui");
const PRELOAD = path.join(import.meta.dirname, "..", "preload.cjs");

const DEFAULT_WIDTH = 240;

export function getDefaultOverlayBounds() {
    const { workArea } = screen.getPrimaryDisplay();
    const height = Math.round(workArea.height * 0.7);

    return {
        x: workArea.x + workArea.width - DEFAULT_WIDTH - 20,
        y: workArea.y + Math.round((workArea.height - height) / 2),
        width: DEFAULT_WIDTH,
        height,
    };
}

export function createOverlayWindow() {
    const settings = getSettings();

    const overlay = new BrowserWindow({
        ...(settings.overlayBounds ?? getDefaultOverlayBounds()),
        minWidth: 160,
        minHeight: 200,
        show: false,
        frame: false,
        transparent: true,
        hasShadow: false,
        resizable: true,
        skipTaskbar: true,
        alwaysOnTop: true,
        backgroundColor: "#00000000",
        webPreferences: {
            preload: PRELOAD,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    // Stay above fullscreen games
    overlay.setAlwaysOnTop(true, "screen-saver");
    overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    applyOverlaySettings(overlay, settings);

    let saveTimer = null;
    const saveBounds = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            if (!overlay.isDestroyed()) {
                updateSettings({ overlayBounds: overlay.getBounds() });
            }
        }, 300);
    };
    overlay.on("moved", saveBounds);
    overlay.on("resized", saveBounds);

    overlay.once("ready-to-show", () => {
        if (getSettings().overlayVisible) overlay.showInactive();
    });

    overlay.loadFile(path.join(UI_DIR, "overlay", "overlay.html"));

    return overlay;
}

export function applyOverlaySettings(overlay, settings) {
    if (!overlay || overlay.isDestroyed()) return;

    // Locked: clicks pass through to the game. Unlocked: can be dragged/resized.
    overlay.setIgnoreMouseEvents(settings.overlayLocked, { forward: true });
    overlay.setFocusable(!settings.overlayLocked);
    overlay.setResizable(!settings.overlayLocked);

    if (settings.overlayVisible && !overlay.isVisible()) {
        overlay.showInactive();
    } else if (!settings.overlayVisible && overlay.isVisible()) {
        overlay.hide();
    }
}
