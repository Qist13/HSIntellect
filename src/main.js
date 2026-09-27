import { app, globalShortcut, ipcMain } from "electron";
import getLogConfigPath from "./utils/path.js";
import setupLogConfig from "./hearthstone/logConfig.js";
import { extractDeckCode, resolveDeck } from "./deck/deckParser.js";
import { getSettings, loadSettings, updateSettings } from "./settings.js";
import {
    applyOverlaySettings,
    createOverlayWindow,
    getDefaultOverlayBounds,
} from "./windows/overlayWindow.js";
import { createControlWindow } from "./windows/controlWindow.js";

const TOGGLE_OVERLAY_SHORTCUT = "CommandOrControl+Shift+H";
const TOGGLE_LOCK_SHORTCUT = "CommandOrControl+Shift+L";

// Settings the control window is allowed to change
const SETTING_KEYS = new Set([
    "overlayVisible",
    "overlayLocked",
    "overlayOpacity",
    "overlayScale",
]);

// Needed for transparent windows on some Linux compositors
if (process.platform === "linux") {
    app.commandLine.appendSwitch("enable-transparent-visuals");
}

let overlay = null;
let control = null;
let currentDeck = null;

function broadcast(channel, payload) {
    for (const win of [overlay, control]) {
        if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    }
}

function setSetting(key, value) {
    const settings = updateSettings({ [key]: value });
    applyOverlaySettings(overlay, settings);
    broadcast("settings:changed", settings);

    return settings;
}

async function loadDeck(deckCode) {
    const code = extractDeckCode(deckCode);
    currentDeck = await resolveDeck(code);
    updateSettings({ deckCode: code });
    broadcast("deck:changed", currentDeck);

    return currentDeck;
}

function registerIpc() {
    ipcMain.handle("state:get", () => ({
        settings: getSettings(),
        deck: currentDeck,
        shortcuts: {
            toggleOverlay: TOGGLE_OVERLAY_SHORTCUT,
            toggleLock: TOGGLE_LOCK_SHORTCUT,
        },
    }));

    ipcMain.handle("settings:set", (_event, key, value) => {
        if (!SETTING_KEYS.has(key)) throw new Error(`Unknown setting: ${key}`);

        return setSetting(key, value);
    });

    ipcMain.handle("deck:load", (_event, deckCode) => loadDeck(deckCode));

    ipcMain.handle("overlay:reset-position", () => {
        const bounds = getDefaultOverlayBounds();
        overlay?.setBounds(bounds);
        updateSettings({ overlayBounds: bounds });
    });

    ipcMain.handle("app:quit", () => app.quit());
}

function registerShortcuts() {
    globalShortcut.register(TOGGLE_OVERLAY_SHORTCUT, () =>
        setSetting("overlayVisible", !getSettings().overlayVisible),
    );
    globalShortcut.register(TOGGLE_LOCK_SHORTCUT, () =>
        setSetting("overlayLocked", !getSettings().overlayLocked),
    );
}

function openControlWindow() {
    if (control && !control.isDestroyed()) {
        control.show();
        control.focus();
        return;
    }

    control = createControlWindow();
    // The overlay alone can't be interacted with, so closing the control window quits
    control.on("closed", () => {
        control = null;
        app.quit();
    });
}

async function main() {
    try {
        setupLogConfig(getLogConfigPath());
    } catch (err) {
        console.error("[✕] Could not locate Hearthstone:", err.message);
    }

    await app.whenReady();

    const settings = loadSettings();
    registerIpc();
    registerShortcuts();

    overlay = createOverlayWindow();
    openControlWindow();

    if (settings.deckCode) {
        loadDeck(settings.deckCode).catch((err) =>
            console.error("[✕] Failed to load saved deck:", err.message),
        );
    }

    app.on("activate", openControlWindow);
    app.on("will-quit", () => globalShortcut.unregisterAll());
}

main();
