import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import LogWatcher from "../src/hearthstone/logWatcher.js";

function setup() {
    const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), "hsi-logs-"));
    const watcher = new LogWatcher(logsDir, ["Power.log"]);
    const events = [];
    watcher.on("session", (dir) => events.push(["session", path.basename(dir)]));
    watcher.on("lines", (_file, lines) => events.push(["lines", lines]));

    const session = (name, content) => {
        fs.mkdirSync(path.join(logsDir, name));
        fs.writeFileSync(path.join(logsDir, name, "Power.log"), content);
    };

    return { logsDir, watcher, events, session };
}

test("emits complete lines and holds back a partial one", () => {
    const { logsDir, watcher, events, session } = setup();
    session("Hearthstone_2026_01_01_10_00_00", "a\nb\npart");

    watcher.checkSessionDir();
    fs.appendFileSync(path.join(logsDir, "Hearthstone_2026_01_01_10_00_00", "Power.log"), "ial\nc\n");
    watcher.readAll();

    assert.deepEqual(events, [
        ["session", "Hearthstone_2026_01_01_10_00_00"],
        ["lines", ["a", "b"]],
        ["lines", ["partial", "c"]],
    ]);
});

test("switches to a newer session and ignores older ones", () => {
    const { watcher, events, session } = setup();
    session("Hearthstone_2026_01_01_10_00_00", "old\n");
    session("Hearthstone_2026_01_02_10_00_00", "new\n");

    watcher.checkSessionDir();
    session("Hearthstone_2026_01_03_10_00_00", "newest\n");
    watcher.checkSessionDir();

    assert.deepEqual(events, [
        ["session", "Hearthstone_2026_01_02_10_00_00"],
        ["lines", ["new"]],
        ["session", "Hearthstone_2026_01_03_10_00_00"],
        ["lines", ["newest"]],
    ]);
});

test("starts over when the file is truncated", () => {
    const { logsDir, watcher, events, session } = setup();
    session("Hearthstone_2026_01_01_10_00_00", "first line\n");
    watcher.checkSessionDir();

    fs.writeFileSync(path.join(logsDir, "Hearthstone_2026_01_01_10_00_00", "Power.log"), "x\n");
    watcher.readAll();

    assert.deepEqual(events.at(-1), ["lines", ["x"]]);
});
