import fs from "fs";
import path from "path";

// Log sections we need. Any other sections already in log.config are left alone.
const REQUIRED_SECTIONS = {
    Power: {
        LogLevel: "1",
        FilePrinting: "True",
        ConsolePrinting: "False",
        ScreenPrinting: "False",
        Verbose: "True",
    },
    Decks: {
        LogLevel: "1",
        FilePrinting: "True",
        ConsolePrinting: "False",
        ScreenPrinting: "False",
        Verbose: "False",
    },
};

/**
 * Parses log.config into [{ name, entries: [[key, value], ...] }], keeping section order.
 */
export function parseLogConfig(text) {
    const sections = [];
    let current = null;

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;

        const header = line.match(/^\[(.+)\]$/);
        if (header) {
            current = { name: header[1], entries: [] };
            sections.push(current);
        } else if (current && line.includes("=")) {
            const index = line.indexOf("=");
            current.entries.push([line.slice(0, index).trim(), line.slice(index + 1).trim()]);
        }
    }

    return sections;
}

export function serializeLogConfig(sections) {
    return (
        sections
            .map(({ name, entries }) =>
                [`[${name}]`, ...entries.map(([key, value]) => `${key}=${value}`)].join("\n"),
            )
            .join("\n\n") + "\n"
    );
}

/**
 * Returns the log.config contents with our required sections added or updated.
 */
export function mergeLogConfig(existing) {
    const sections = parseLogConfig(existing);

    for (const [name, required] of Object.entries(REQUIRED_SECTIONS)) {
        let section = sections.find((s) => s.name === name);
        if (!section) {
            section = { name, entries: [] };
            sections.push(section);
        }

        for (const [key, value] of Object.entries(required)) {
            const entry = section.entries.find(([k]) => k === key);
            if (entry) entry[1] = value;
            else section.entries.push([key, value]);
        }
    }

    return serializeLogConfig(sections);
}

export default function setupLogConfig(filePath) {
    try {
        let existing = "";
        try {
            existing = fs.readFileSync(filePath, "utf-8");
        } catch {
            // No log.config yet
        }

        const merged = mergeLogConfig(existing);
        if (merged === existing) return true;

        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, merged);
        console.log("[✓] log.config updated");
        return true;
    } catch (err) {
        console.error("[✕] Failed to update log.config:");
        console.error(err.message);
        return false;
    }
}
