import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";

/**
 * True if dir looks like a Hearthstone install directory.
 */
export function isHearthstoneDir(dir) {
    if (!dir) return false;

    return ["Hearthstone.exe", "Hearthstone.app", "Hearthstone_Data"].some((name) =>
        fs.existsSync(path.join(dir, name)),
    );
}

/**
 * Accepts the install dir itself, its Logs folder, or the folder containing it.
 * Returns the install dir, or null if none of those match.
 */
export function normalizeHearthstoneDir(dir) {
    const candidates = [dir, path.dirname(dir), path.join(dir, "Hearthstone")];

    return candidates.find(isHearthstoneDir) ?? null;
}

/**
 * Searches the usual install locations. Returns the install dir or null.
 */
export function findHearthstoneDir() {
    const candidates = {
        win32: getWindowsCandidates,
        darwin: getMacCandidates,
        linux: getLinuxCandidates,
    }[process.platform]?.() ?? [];

    return candidates.find(isHearthstoneDir) ?? null;
}

/**
 * Directory containing one Hearthstone_<timestamp> folder per game launch,
 * each holding Power.log, Decks.log, etc.
 */
export function getLogsDir(installDir) {
    return path.join(installDir, "Logs");
}

export function getLogConfigPath(installDir) {
    switch (process.platform) {
        case "win32":
            return path.join(process.env.LOCALAPPDATA, "Blizzard", "Hearthstone", "log.config");

        case "darwin":
            return path.join(
                os.homedir(),
                "Library",
                "Preferences",
                "Blizzard",
                "Hearthstone",
                "log.config",
            );

        case "linux":
            // Under Wine/Proton it lives in the Windows user's AppData inside the same prefix
            return path.join(
                getWineUserDir(installDir),
                "AppData",
                "Local",
                "Blizzard",
                "Hearthstone",
                "log.config",
            );

        default:
            throw new Error(`Unsupported platform: ${process.platform}`);
    }
}

function getWindowsCandidates() {
    const candidates = [];

    // Battle.net registers an uninstall entry with the install location
    for (const key of [
        "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Hearthstone",
        "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Hearthstone",
    ]) {
        try {
            const output = execFileSync("reg", ["query", key, "/v", "InstallLocation"], {
                encoding: "utf-8",
                stdio: ["ignore", "pipe", "ignore"],
            });
            const match = output.match(/InstallLocation\s+REG_SZ\s+(.+)/);
            if (match) candidates.push(match[1].trim());
        } catch {
            // Key doesn't exist
        }
    }

    for (const env of ["ProgramFiles(x86)", "ProgramFiles"]) {
        if (process.env[env]) candidates.push(path.join(process.env[env], "Hearthstone"));
    }

    // Games are often installed on other drives
    for (const drive of "CDEFGHIJ") {
        for (const folder of ["Program Files (x86)", "Program Files", "Games", ""]) {
            candidates.push(path.join(`${drive}:\\`, folder, "Hearthstone"));
        }
    }

    return candidates;
}

function getMacCandidates() {
    return [
        path.join("/Applications", "Hearthstone"),
        path.join(os.homedir(), "Applications", "Hearthstone"),
    ];
}

function getLinuxCandidates() {
    const candidates = [];

    for (const prefix of getWinePrefixes()) {
        for (const programFiles of ["Program Files (x86)", "Program Files"]) {
            candidates.push(path.join(prefix, "drive_c", programFiles, "Hearthstone"));
        }
    }

    return candidates;
}

function listDirs(dir) {
    try {
        return fs
            .readdirSync(dir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
            .map((entry) => path.join(dir, entry.name));
    } catch {
        return [];
    }
}

/**
 * Every Wine prefix we can find: Steam/Proton (Battle.net added as a non-Steam game),
 * Lutris, Bottles, Heroic and plain Wine.
 */
function getWinePrefixes() {
    const home = os.homedir();
    const prefixes = [];

    const steamRoots = [
        path.join(home, ".steam", "steam"),
        path.join(home, ".steam", "root"),
        path.join(home, ".steam", "debian-installation"),
        path.join(home, ".local", "share", "Steam"),
        path.join(home, ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam"),
        path.join(home, "snap", "steam", "common", ".local", "share", "Steam"),
    ];

    for (const root of steamRoots) {
        for (const library of [root, ...getSteamLibraries(root)]) {
            for (const dir of listDirs(path.join(library, "steamapps", "compatdata"))) {
                prefixes.push(path.join(dir, "pfx"));
            }
        }
    }

    prefixes.push(path.join(home, ".wine"));
    prefixes.push(...listDirs(path.join(home, "Games"))); // Lutris default
    prefixes.push(...listDirs(path.join(home, "Games", "Heroic", "Prefixes")));
    prefixes.push(...listDirs(path.join(home, ".local", "share", "bottles", "bottles")));
    prefixes.push(
        ...listDirs(
            path.join(home, ".var", "app", "com.usebottles.bottles", "data", "bottles", "bottles"),
        ),
    );

    // The Steam root paths are often symlinks to each other
    const seen = new Set();
    return prefixes.filter((prefix) => {
        let real;
        try {
            real = fs.realpathSync(path.join(prefix, "drive_c"));
        } catch {
            return false;
        }
        if (seen.has(real)) return false;
        seen.add(real);
        return true;
    });
}

/**
 * Extra Steam library folders listed in libraryfolders.vdf.
 */
function getSteamLibraries(steamRoot) {
    try {
        const vdf = fs.readFileSync(
            path.join(steamRoot, "steamapps", "libraryfolders.vdf"),
            "utf-8",
        );
        return [...vdf.matchAll(/"path"\s+"([^"]+)"/g)].map((m) => m[1]);
    } catch {
        return [];
    }
}

/**
 * Finds the Windows user folder (drive_c/users/<name>) in the prefix containing installDir.
 */
function getWineUserDir(installDir) {
    let driveC = installDir;
    while (path.basename(driveC) !== "drive_c") {
        const parent = path.dirname(driveC);
        if (parent === driveC) {
            throw new Error(`Hearthstone at ${installDir} is not inside a Wine prefix`);
        }
        driveC = parent;
    }

    const users = listDirs(path.join(driveC, "users")).filter(
        (dir) => path.basename(dir) !== "Public",
    );

    // Prefer the user Hearthstone has already written settings for
    return (
        users.find((dir) =>
            fs.existsSync(path.join(dir, "AppData", "Local", "Blizzard", "Hearthstone")),
        ) ??
        users.find((dir) => path.basename(dir) === "steamuser") ??
        users[0] ??
        path.join(driveC, "users", "steamuser")
    );
}
