import fs from "fs";
import path from "path";

const CARD_DB_URL = "https://api.hearthstonejson.com/v1/latest/enUS/cards.json";

const CACHE_FILE_NAME = "cards.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Don't hammer the API when a card is missing from the latest data too
const MIN_REFETCH_INTERVAL_MS = 10 * 60 * 1000;

// Set by the app to a writable per-user folder (the app's own files are read-only once packaged)
let cacheDir = null;

let database = null;
let lastFetchAt = 0;
let pendingFetch = null;

export function setCacheDir(dir) {
    cacheDir = dir;
}

function getCacheFile() {
    if (!cacheDir) throw new Error("Card database cache directory not set");
    return path.join(cacheDir, CACHE_FILE_NAME);
}

/**
 * Returns true if the cache file exists and was written less than CACHE_TTL_MS ago.
 */
function isCacheFresh() {
    try {
        const stats = fs.statSync(getCacheFile());
        return Date.now() - stats.mtimeMs < CACHE_TTL_MS;
    } catch {
        return false;
    }
}

async function fetchCardList() {
    lastFetchAt = Date.now();

    const res = await fetch(CARD_DB_URL);

    if (!res.ok) {
        throw new Error(`Failed to fetch card database: HTTP ${res.status}`);
    }

    const cards = await res.json();

    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(getCacheFile(), JSON.stringify(cards));

    return cards;
}

/**
 * Loads the raw card list array
 */
async function loadCardList() {
    if (isCacheFresh()) {
        const raw = fs.readFileSync(getCacheFile(), "utf-8");

        return JSON.parse(raw);
    }

    return fetchCardList();
}

function buildDatabase(cards) {
    const byDbfId = new Map();
    const byId = new Map();

    for (const card of cards) {
        byDbfId.set(card.dbfId, card);
        byId.set(card.id, card);
    }

    return { byDbfId, byId };
}

/**
 * Returns { byDbfId, byId } lookup maps. Loaded once and kept in memory.
 */
export async function getCardDatabase() {
    database ??= buildDatabase(await loadCardList());

    return database;
}

/**
 * The database if it has been loaded already, otherwise null. For synchronous lookups.
 */
export function getLoadedCardDatabase() {
    return database;
}

/**
 * Downloads the latest card data even if the cache is still fresh, e.g. after a patch.
 */
export async function refreshCardDatabase() {
    // Share one download between concurrent callers
    pendingFetch ??= fetchCardList()
        .then((cards) => (database = buildDatabase(cards)))
        .finally(() => (pendingFetch = null));

    return pendingFetch;
}

/**
 * Refreshes the database if any of the given cards are missing from it,
 * which usually means a patch added new cards since it was cached.
 * Returns true if a refresh happened.
 */
export async function refreshIfMissing({ dbfIds = [], ids = [] }) {
    const db = await getCardDatabase();
    const missing =
        dbfIds.some((dbfId) => !db.byDbfId.has(dbfId)) || ids.some((id) => !db.byId.has(id));

    if (!missing || Date.now() - lastFetchAt < MIN_REFETCH_INTERVAL_MS) return false;

    await refreshCardDatabase();
    return true;
}

export function getCardDatabaseInfo() {
    let updatedAt = null;
    try {
        updatedAt = fs.statSync(getCacheFile()).mtimeMs;
    } catch {
        // Not downloaded yet
    }

    return { cardCount: database?.byId.size ?? 0, updatedAt };
}
