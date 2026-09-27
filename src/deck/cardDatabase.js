import fs from "fs";
import path from "path";

const CARD_DB_URL = "https://api.hearthstonejson.com/v1/latest/enUS/cards.json";

// Resolve relative to src/ so the cache location doesn't depend on the cwd
const CACHE_DIR = path.join(import.meta.dirname, "..", ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "cards.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Returns true if the cache file exists and was written less than CACHE_TTL_MS ago.
 */
function isCacheFresh() {
    try {
        const stats = fs.statSync(CACHE_FILE);
        return Date.now() - stats.mtimeMs < CACHE_TTL_MS;
    } catch {
        return false;
    }
}

/**
 * Loads the raw card list array
 */
async function loadCardList() {
    if (isCacheFresh()) {
        const raw = fs.readFileSync(CACHE_FILE, "utf-8");

        return JSON.parse(raw);
    }

    const res = await fetch(CARD_DB_URL);

    if (!res.ok) {
        throw new Error(`Failed to fetch card database: HTTP ${res.status}`);
    }

    const cards = await res.json();

    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cards));

    return cards;
}

export async function getCardDatabase() {
    const cards = await loadCardList();
    const map = new Map();

    for (const card of cards) {
        map.set(card.dbfId, card);
    }

    return map;
}
