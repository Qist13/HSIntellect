import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDeckCode, extractDeckName, parseDeckFromCode } from "../src/deck/deckParser.js";

const CODE =
    "AAECAcn1Ag7DgweIpQeJpQeKpQeRpQeTpQeUpQeVpQeWpQeXpQeapQet2QeO3Afb4AcNj58EsZ8E56AE054GhJkH0LIHk74H4L4H3dcHsNkHsdkHt9kHjdwHAAA=";

test("decodes a deck code", () => {
    const deck = parseDeckFromCode(CODE);

    assert.equal(deck.heroes.length, 1);
    assert.equal(
        deck.cards.reduce((sum, card) => sum + card.count, 0),
        40,
    );
});

test("rejects garbage", () => {
    assert.throws(() => parseDeckFromCode("not a deck code"), /Invalid deck code/);
    assert.throws(() => parseDeckFromCode("AAEC"), /Invalid deck code/);
});

test("reads the code and name from text copied out of Hearthstone", () => {
    const text = `### Hand Rafaam
# Class: Warlock
# Format: Standard
#
# 2x (0) Cursed Catacombs
#
${CODE}
#
# To use this deck, copy it to your clipboard and create a new deck in Hearthstone`;

    assert.equal(extractDeckCode(text), CODE);
    assert.equal(extractDeckName(text), "Hand Rafaam");
    assert.equal(extractDeckName(CODE), null);
});
