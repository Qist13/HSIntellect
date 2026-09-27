import path from "path";
import { BrowserWindow, screen } from "electron";
import { getSettings, updateSettings } from "../settings.js";

const UI_DIR = path.join(import.meta.dirname, "..", "ui");
const PRELOAD = path.join(import.meta.dirname, "..", "preload.cjs");

const DEFAULT_WIDTH = 240;

// The player's deck sits on the right of the screen, the opponent's on the left
export const OVERLAYS = {
    player: { visibleKey: "overlayVisible", boundsKey: "overlayBounds", side: "right" },
    opponent: {
        visibleKey: "opponentOverlayVisible",
        boundsKey: "opponentOverlayBounds",
        side: "left",
    },
};

export function getDefaultOverlayBounds(kind) {
    const { workArea } = screen.getPrimaryDisplay();
    const height = Math.round(workArea.height * 0.7);
    const x =
        OVERLAYS[kind].side === "right"
            ? workArea.x + workArea.width - DEFAULT_WIDTH - 20
            : workArea.x + 20;

    return {
        x,
        y: workArea.y + Math.round((workArea.height - height) / 2),
        width: DEFAULT_WIDTH,
        height,
    };
}

export function createOverlayWindow(kind) {
    const settings = getSettings();
    const { boundsKey } = OVERLAYS[kind];

    const overlay = new BrowserWindow({
        ...(settings[boundsKey] ?? getDefaultOverlayBounds(kind)),
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

    let saveTimer = null;
    const saveBounds = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            if (!overlay.isDestroyed()) {
                updateSettings({ [boundsKey]: overlay.getBounds() });
            }
        }, 300);
    };
    overlay.on("moved", saveBounds);
    overlay.on("resized", saveBounds);

    overlay.loadFile(path.join(UI_DIR, "overlay", "overlay.html"), { query: { kind } });

    return overlay;
}

/**
 * Applies lock state and visibility. With auto-hide on, overlays only show during a game,
 * except while unlocked so they can still be positioned.
 */
export function applyOverlaySettings(overlay, kind, settings, inGame) {
    if (!overlay || overlay.isDestroyed()) return;

    // Locked: clicks pass through to the game. Unlocked: can be dragged/resized.
    overlay.setIgnoreMouseEvents(settings.overlayLocked, { forward: true });
    overlay.setFocusable(!settings.overlayLocked);
    overlay.setResizable(!settings.overlayLocked);

    const visible =
        settings[OVERLAYS[kind].visibleKey] &&
        (!settings.overlayAutoHide || inGame || !settings.overlayLocked);

    if (visible && !overlay.isVisible()) {
        overlay.showInactive();
    } else if (!visible && overlay.isVisible()) {
        overlay.hide();
    }
}
