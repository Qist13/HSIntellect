import path from "path";
import { BrowserWindow } from "electron";

const UI_DIR = path.join(import.meta.dirname, "..", "ui");
const PRELOAD = path.join(import.meta.dirname, "..", "preload.cjs");
const ICON = path.join(import.meta.dirname, "..", "assets", "icon.png");

export function createControlWindow() {
    const control = new BrowserWindow({
        width: 420,
        height: 620,
        minWidth: 360,
        minHeight: 480,
        title: "HSIntellect",
        icon: ICON,
        backgroundColor: "#16181d",
        autoHideMenuBar: true,
        webPreferences: {
            preload: PRELOAD,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    control.loadFile(path.join(UI_DIR, "control", "control.html"));

    return control;
}
