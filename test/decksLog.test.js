import { test } from "node:test";
import assert from "node:assert/strict";
import DecksLogParser from "../src/hearthstone/decksLog.js";
import { readFixture } from "./helpers.js";

const HAND_RAFAAM =
    "AAECAcn1Ag7DgweIpQeJpQeKpQeRpQeTpQeUpQeVpQeWpQeXpQeapQet2QeO3Afb4AcNj58EsZ8E56AE054GhJkH0LIHk74H4L4H3dcHsNkHsdkHt9kHjdwHAAA=";

test("finds the deck queued with, ignoring the deck list sent on login", () => {
    const decks = new DecksLogParser().processLines(readFixture("hand-rafaam.Decks.log.gz"));

    assert.deepEqual(decks, [{ time: "01:49:16", name: "Hand Rafaam", code: HAND_RAFAAM }]);
});

test("handles a deck split across reads", () => {
    const lines = readFixture("hand-rafaam.Decks.log.gz").filter(Boolean);
    const parser = new DecksLogParser();

    const split = lines.length - 2; // between the name and the code
    assert.deepEqual(parser.processLines(lines.slice(0, split)), []);
    assert.equal(parser.processLines(lines.slice(split))[0].code, HAND_RAFAAM);
});
