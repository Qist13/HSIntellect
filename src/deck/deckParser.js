/*
A Hearthstone deckstring is encoded as follows:
    Deck information -> Raw binary bytes -> Base64 encoded Deck Code ("AAECAqE512...")
We can decode the deck information by reversing this encoding process

The first conversion can be done trivially by using Buffer.from(..., "base64")

The second conversion requires us to read through the bytes manually.
Hearthstone uses a variable number of bytes depending on how large the number is
Each byte gives us 7 bits of the number and the remaining 1 bit tells us whether another byte follows
ex:
    10110101
    │└─────┘
    │ 7 data bits
    │
    └─ continuation bit
0xxxxxxx this is the last byte
1xxxxxxx another byte follows
*/

import { getCardDatabase, refreshIfMissing } from "./cardDatabase.js";

function readVarint(data, pos) {
    let result = 0;
    let shift = 0;
    let byte;

    do {
        if (pos.i >= data.length) throw new Error("Invalid deck code");
        byte = data[pos.i++];
        result += (byte & 0x7f) * Math.pow(2, shift);
        shift += 7;
    } while (byte & 0x80);

    return result;
}

function parseDeckFromCode(deckCode) {
    const data = Buffer.from(deckCode, "base64");
    const pos = { i: 0 };

    const reserved = data[pos.i++];
    if (reserved !== 0) throw new Error("Invalid deck code");
    const version = readVarint(data, pos);
    const format = readVarint(data, pos);

    const heroCount = readVarint(data, pos);
    const heroes = [];
    for (let i = 0; i < heroCount; i++) {
        heroes.push(readVarint(data, pos));
    }

    const cards = [];

    const singleCount = readVarint(data, pos);
    for (let i = 0; i < singleCount; i++) {
        cards.push({ dbfId: readVarint(data, pos), count: 1 });
    }

    const doubleCount = readVarint(data, pos);
    for (let i = 0; i < doubleCount; i++) {
        cards.push({ dbfId: readVarint(data, pos), count: 2 });
    }

    const multiCount = readVarint(data, pos);
    for (let i = 0; i < multiCount; i++) {
        const dbfId = readVarint(data, pos);
        const count = readVarint(data, pos);
        cards.push({ dbfId, count });
    }

    return { reserved, version, format, heroes, cards };
}

/**
 * Pulls the deckstring out of text copied from the Hearthstone client,
 * which wraps it in "### Deck Name" / "# comment" lines.
 */
export function extractDeckCode(text) {
    const line = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith("#"));

    if (!line) throw new Error("No deck code found");

    return line;
}

export async function resolveDeck(deckCode) {
    const decoded = parseDeckFromCode(extractDeckCode(deckCode));

    // A deck with cards we don't know about probably uses cards from a new patch
    await refreshIfMissing({
        dbfIds: [...decoded.heroes, ...decoded.cards.map((c) => c.dbfId)],
    });
    const { byDbfId } = await getCardDatabase();

    const heroes = decoded.heroes.map(
        (dbfId) => byDbfId.get(dbfId)?.name ?? `Unknown (${dbfId})`,
    );

    const cards = decoded.cards
        .map(({ dbfId, count }) => {
            const card = byDbfId.get(dbfId);

            return {
                dbfId,
                id: card?.id ?? null,
                name: card?.name ?? `Unknown (${dbfId})`,
                cost: card?.cost ?? 0,
                rarity: card?.rarity ?? null,
                count,
            };
        })
        .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));

    return {
        format: decoded.format,
        heroes,
        heroClass: byDbfId.get(decoded.heroes[0])?.cardClass ?? null,
        cards,
    };
}
