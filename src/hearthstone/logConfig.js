import fs from "fs";

const LOG_CONFIG = `[Power]
LogLevel=1
FilePrinting=True
ConsolePrinting=False
ScreenPrinting=False
Verbose=True
`;

export default function setupLogConfig(filePath) {
    try {
        fs.writeFileSync(filePath, LOG_CONFIG);
        console.log("[✓] log.config created");
    } catch (err) {
        console.error("[✕] Failed to create log.config:");
        console.error(err.message);
    }
}
