import fs from "fs";
import os from "os";
import path from "path";
import { app } from "electron";

// Passed when launched at login, so the app starts in the tray without opening a window
export const HIDDEN_ARG = "--hidden";

const DESKTOP_FILE = path.join(os.homedir(), ".config", "autostart", "hsintellect.desktop");

/**
 * The command that starts this app: the AppImage when running from one, the installed
 * binary when packaged, or electron + the project folder when running from source.
 */
function getLaunchCommand() {
    if (process.env.APPIMAGE) return [process.env.APPIMAGE];
    if (app.isPackaged) return [process.execPath];
    return [process.execPath, app.getAppPath()];
}

const quote = (arg) => (/[\s"\\]/.test(arg) ? `"${arg.replace(/(["\\])/g, "\\$1")}"` : arg);

export function isAutostartEnabled() {
    if (process.platform === "linux") return fs.existsSync(DESKTOP_FILE);

    return app.getLoginItemSettings().openAtLogin;
}

export function setAutostartEnabled(enabled) {
    if (process.platform !== "linux") {
        // args is Windows only; macOS reports wasOpenedAtLogin instead
        app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_ARG] });
        return;
    }

    if (!enabled) {
        fs.rmSync(DESKTOP_FILE, { force: true });
        return;
    }

    const exec = [...getLaunchCommand(), HIDDEN_ARG].map(quote).join(" ");
    fs.mkdirSync(path.dirname(DESKTOP_FILE), { recursive: true });
    fs.writeFileSync(
        DESKTOP_FILE,
        `[Desktop Entry]
Type=Application
Name=HSIntellect
Comment=Hearthstone deck tracker
Exec=${exec}
Terminal=false
X-GNOME-Autostart-enabled=true
`,
    );
}

/**
 * True if this launch should start in the tray without opening the control window.
 */
export function shouldStartHidden() {
    if (process.argv.includes(HIDDEN_ARG)) return true;
    return process.platform === "darwin" && app.getLoginItemSettings().wasOpenedAtLogin;
}
