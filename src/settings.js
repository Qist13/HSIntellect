import fs from "fs";
import path from "path";
import { app } from "electron";

const DEFAULTS = {
    overlayVisible: true,
    overlayLocked: true, // locked = click-through, can't be moved
    overlayOpacity: 0.9,
    overlayScale: 1,
    overlayBounds: null,
    deckCode: "",
};

let settings = null;

function getSettingsPath() {
    return path.join(app.getPath("userData"), "settings.json");
}

export function loadSettings() {
    try {
        const raw = fs.readFileSync(getSettingsPath(), "utf-8");
        settings = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
        settings = { ...DEFAULTS };
    }

    return settings;
}

export function getSettings() {
    return settings ?? loadSettings();
}

export function updateSettings(patch) {
    settings = { ...getSettings(), ...patch };

    try {
        fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
        fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 4));
    } catch (err) {
        console.error("[✕] Failed to save settings:", err.message);
    }

    return settings;
}
