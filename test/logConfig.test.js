import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeLogConfig, parseLogConfig } from "../src/hearthstone/logConfig.js";

test("creates the Power and Decks sections from nothing", () => {
    const sections = parseLogConfig(mergeLogConfig(""));

    assert.deepEqual(
        sections.map((s) => s.name),
        ["Power", "Decks"],
    );
});

test("keeps other sections and fixes our settings", () => {
    const existing = `[LoadingScreen]
LogLevel=1
FilePrinting=True

[Power]
LogLevel=1
FilePrinting=False
CustomKey=Keep
`;
    const sections = parseLogConfig(mergeLogConfig(existing));

    const loading = sections.find((s) => s.name === "LoadingScreen");
    assert.deepEqual(loading.entries, [
        ["LogLevel", "1"],
        ["FilePrinting", "True"],
    ]);

    const power = Object.fromEntries(sections.find((s) => s.name === "Power").entries);
    assert.equal(power.FilePrinting, "True");
    assert.equal(power.Verbose, "True");
    assert.equal(power.CustomKey, "Keep");
});

test("is unchanged when already correct", () => {
    const once = mergeLogConfig("[Zone]\nLogLevel=1\n");
    assert.equal(mergeLogConfig(once), once);
});
