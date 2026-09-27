import path from "path";
import { BrowserWindow, ipcMain, screen } from "electron";

const UI_DIR = path.join(import.meta.dirname, "..", "ui");
const PRELOAD = path.join(import.meta.dirname, "..", "preload.cjs");

// HearthstoneJSON 256x card renders
const PREVIEW_WIDTH = 256;
const PREVIEW_HEIGHT = 388;
const POLL_MS = 50;

/**
 * Shows a full card image next to an overlay when hovering a card row.
 *
 * Locked overlays ignore the mouse (and Linux doesn't forward mouse events to them),
 * so instead of relying on DOM hover we poll the cursor position and send it to the
 * overlay under it. The overlay works out which row that is and reports back.
 */
export function startCardPreview({ getOverlays, isEnabled }) {
    const preview = new BrowserWindow({
        width: PREVIEW_WIDTH,
        height: PREVIEW_HEIGHT,
        show: false,
        frame: false,
        transparent: true,
        hasShadow: false,
        resizable: false,
        focusable: false,
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
    preview.setAlwaysOnTop(true, "screen-saver");
    preview.setIgnoreMouseEvents(true);
    preview.loadFile(path.join(UI_DIR, "preview", "preview.html"));

    let hovered = null; // overlay window currently under the cursor

    const setHovered = (overlay) => {
        if (hovered && hovered !== overlay && !hovered.isDestroyed()) {
            hovered.webContents.send("overlay:pointer", null);
        }
        hovered = overlay;
    };

    const timer = setInterval(() => {
        if (!isEnabled()) {
            setHovered(null);
            if (preview.isVisible()) preview.hide();
            return;
        }

        const cursor = screen.getCursorScreenPoint();
        const overlay = getOverlays().find((win) => {
            if (!win || win.isDestroyed() || !win.isVisible()) return false;
            const b = win.getBounds();
            return (
                cursor.x >= b.x && cursor.x < b.x + b.width && cursor.y >= b.y && cursor.y < b.y + b.height
            );
        });

        setHovered(overlay ?? null);
        if (overlay) {
            const b = overlay.getBounds();
            overlay.webContents.send("overlay:pointer", { x: cursor.x - b.x, y: cursor.y - b.y });
        } else if (preview.isVisible()) {
            preview.hide();
        }
    }, POLL_MS);

    ipcMain.on("overlay:hover", (event, hover) => {
        const overlay = BrowserWindow.fromWebContents(event.sender);
        if (!hover || !overlay || overlay !== hovered) {
            preview.hide();
            return;
        }

        const b = overlay.getBounds();
        const { workArea } = screen.getDisplayMatching(b);

        // Put the preview on whichever side of the overlay has room
        const x =
            b.x + b.width + PREVIEW_WIDTH <= workArea.x + workArea.width
                ? b.x + b.width
                : b.x - PREVIEW_WIDTH;
        const y = Math.min(
            Math.max(b.y + Math.round(hover.y) - PREVIEW_HEIGHT / 2, workArea.y),
            workArea.y + workArea.height - PREVIEW_HEIGHT,
        );

        preview.setBounds({ x, y, width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT });
        preview.webContents.send("preview:card", hover.cardId);
        if (!preview.isVisible()) preview.showInactive();
    });

    return {
        destroy() {
            clearInterval(timer);
            if (!preview.isDestroyed()) preview.destroy();
        },
    };
}
