import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

const DIR_POLL_MS = 2000;
const FILE_POLL_MS = 250;

/**
 * Tails log files inside the newest Logs/Hearthstone_<timestamp> directory.
 * Hearthstone creates a new directory on every launch, so we keep checking for newer ones.
 *
 * Events:
 *   "session" (dir)          a new log directory was picked up; any game state is stale
 *   "lines"   (file, lines)  new complete lines appended to <file>
 */
export default class LogWatcher extends EventEmitter {
    constructor(logsDir, files) {
        super();
        this.logsDir = logsDir;
        this.files = files;
        this.sessionDir = null;
        this.tails = new Map();
        this.timers = [];
    }

    start() {
        this.checkSessionDir();
        this.timers.push(setInterval(() => this.checkSessionDir(), DIR_POLL_MS));
        this.timers.push(setInterval(() => this.readAll(), FILE_POLL_MS));
    }

    stop() {
        for (const timer of this.timers) clearInterval(timer);
        this.timers = [];
    }

    checkSessionDir() {
        let newest;
        try {
            // Timestamped names (Hearthstone_YYYY_MM_DD_HH_MM_SS) sort chronologically
            newest = fs
                .readdirSync(this.logsDir)
                .filter((name) => name.startsWith("Hearthstone_"))
                .sort()
                .at(-1);
        } catch {
            return; // Logs dir doesn't exist yet
        }

        if (!newest) return;

        const dir = path.join(this.logsDir, newest);
        if (dir === this.sessionDir) return;

        this.sessionDir = dir;
        this.tails = new Map(this.files.map((file) => [file, { offset: 0, partial: "" }]));
        this.emit("session", dir);
        this.readAll();
    }

    readAll() {
        if (!this.sessionDir) return;

        for (const [file, tail] of this.tails) {
            this.readFile(file, tail);
        }
    }

    readFile(file, tail) {
        const filePath = path.join(this.sessionDir, file);

        let size;
        try {
            size = fs.statSync(filePath).size;
        } catch {
            return; // Not created yet
        }

        if (size < tail.offset) {
            // File was truncated, start over
            tail.offset = 0;
            tail.partial = "";
        }
        if (size === tail.offset) return;

        const buffer = Buffer.alloc(size - tail.offset);
        const fd = fs.openSync(filePath, "r");
        try {
            fs.readSync(fd, buffer, 0, buffer.length, tail.offset);
        } finally {
            fs.closeSync(fd);
        }
        tail.offset = size;

        // Hold back the trailing partial line until it's finished being written
        const lines = (tail.partial + buffer.toString("utf-8")).split(/\r?\n/);
        tail.partial = lines.pop();

        if (lines.length) this.emit("lines", file, lines);
    }
}
