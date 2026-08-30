const fs = require("fs");
const path = require("path");
const os = require("os");

const LOG_CONFIG = `[Power]
LogLevel=1
FilePrinting=True
ConsolePrinting=False
ScreenPrinint=False
Verbose=True
`;

function getLogConfigPath() {
    switch (process.platform) {
        case "win32":
            return path.join(
                process.env.LOCALAPPDATA,
                "Blizzard",
                "Hearthstone",
                "log.config",
            );

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
            return getLinuxLogConfigPath();

        default:
            throw new Error(`Unsupported platform: ${process.platform}`);
    }
}

function getLinuxLogConfigPath() {
    const compatData = path.join(
        os.homedir(),
        ".steam",
        "debian-installation",
        "steamapps",
        "compatdata",
    );

    const ids = fs.readdirSync(compatData);

    for (const id of ids) {
        const hearthstoneDir = path.join(
            compatData,
            id,
            "pfx",
            "drive_c",
            "users",
            "steamuser",
            "Local Settings",
            "Application Data",
            "Blizzard",
            "Hearthstone",
        );

        if (fs.existsSync(hearthstoneDir)) {
            return path.join(hearthstoneDir, "log.config");
        }
    }

    throw new Error("Could not find Hearthstone Proton directory");
}

try {
    const filePath = getLogConfigPath();

    fs.writeFileSync(filePath, LOG_CONFIG);
    console.log(`[*] log.config file created at: ${filePath}`);
} catch (err) {
    console.log("[!] Failed to create log.config file");
    console.error(err.message);
}
