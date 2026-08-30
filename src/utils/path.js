import fs from "fs";
import path from "path";
import os from "os";

export default function getLogConfigPath() {
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
