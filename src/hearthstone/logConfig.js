import fs from "fs";
import path from "path";

const LOG_CONFIG = `[Power]
LogLevel=1
FilePrinting=True
ConsolePrinting=False
ScreenPrinting=False
Verbose=True

[Decks]
LogLevel=1
FilePrinting=True
ConsolePrinting=False
ScreenPrinting=False
Verbose=False
`;

export default function setupLogConfig(filePath) {
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, LOG_CONFIG);
        console.log("[✓] log.config created");
        return true;
    } catch (err) {
        console.error("[✕] Failed to create log.config:");
        console.error(err.message);
        return false;
    }
}
