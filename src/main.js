import path from "path";
import { app, dialog, globalShortcut, ipcMain } from "electron";
import {
    findHearthstoneDir,
    getLogConfigPath,
    getLogsDir,
    isHearthstoneDir,
    normalizeHearthstoneDir,
} from "./utils/path.js";
import setupLogConfig from "./hearthstone/logConfig.js";
import LogWatcher from "./hearthstone/logWatcher.js";
import GameTracker from "./hearthstone/gameTracker.js";
import DecksLogParser from "./hearthstone/decksLog.js";
import { extractDeckCode, extractDeckName, resolveDeck } from "./deck/deckParser.js";
import {
    getCardDatabase,
    getCardDatabaseInfo,
    getLoadedCardDatabase,
    refreshCardDatabase,
    refreshIfMissing,
    setCacheDir,
} from "./deck/cardDatabase.js";
import { getSettings, loadSettings, updateSettings } from "./settings.js";
import { clearHistory, getHistorySummary, recordGame } from "./history.js";
import {
    OVERLAYS,
    applyOverlaySettings,
    createOverlayWindow,
    getDefaultOverlayBounds,
} from "./windows/overlayWindow.js";
import { createControlWindow } from "./windows/controlWindow.js";
import { startCardPreview } from "./windows/cardPreview.js";

const TOGGLE_OVERLAY_SHORTCUT = "CommandOrControl+Shift+H";
const TOGGLE_LOCK_SHORTCUT = "CommandOrControl+Shift+L";

// Settings the control window is allowed to change
const SETTING_KEYS = new Set([
    "overlayVisible",
    "opponentOverlayVisible",
    "overlayAutoHide",
    "overlayLocked",
    "overlayOpacity",
    "overlayScale",
    "showDrawChance",
    "showCardPreview",
]);

const CLASS_NAMES = {
    DEATHKNIGHT: "Death Knight",
    DEMONHUNTER: "Demon Hunter",
};

// Needed for transparent windows on some Linux compositors
if (process.platform === "linux") {
    app.commandLine.appendSwitch("enable-transparent-visuals");
}

const overlays = { player: null, opponent: null };
let control = null;
let currentDeck = null;

const tracker = new GameTracker();
let trackerSnapshot = tracker.getSnapshot();

let watcher = null;
let sessionDir = null;
let queuedDecks = []; // decks queued with this log session, from Decks.log
let hearthstone = { dir: null, auto: true, found: false, error: null };

function broadcast(channel, payload) {
    for (const win of [...Object.values(overlays), control]) {
        if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    }
}

function sendToControl(channel, payload) {
    if (control && !control.isDestroyed()) control.webContents.send(channel, payload);
}

function applyAllOverlaySettings() {
    const settings = getSettings();
    for (const [kind, overlay] of Object.entries(overlays)) {
        applyOverlaySettings(overlay, kind, settings, trackerSnapshot.inGame);
    }
}

function setSetting(key, value) {
    const settings = updateSettings({ [key]: value });
    applyAllOverlaySettings();
    broadcast("settings:changed", settings);
    publish();

    return settings;
}

/* ---------- Cards ---------- */

function formatClass(cardClass) {
    if (!cardClass) return null;
    return CLASS_NAMES[cardClass] ?? cardClass[0] + cardClass.slice(1).toLowerCase();
}

let refreshingForMissing = false;

function getCardInfo(cardId) {
    const card = getLoadedCardDatabase()?.byId.get(cardId);

    // Probably a card from a patch newer than our cached data
    if (!card && !refreshingForMissing) {
        refreshingForMissing = true;
        refreshIfMissing({ ids: [cardId] })
            .then((refreshed) => refreshed && publish())
            .catch((err) => console.error("[✕] Failed to refresh card database:", err.message))
            .finally(() => (refreshingForMissing = false));
    }

    return {
        id: cardId,
        name: card?.name ?? cardId,
        cost: card?.cost ?? 0,
        rarity: card?.rarity ?? null,
        cardClass: card?.cardClass ?? null,
    };
}

const byCostThenName = (a, b) => a.cost - b.cost || a.name.localeCompare(b.name);

/* ---------- Views ---------- */

/**
 * The loaded deck combined with live game state, for the control window.
 */
function getDeckView() {
    if (!currentDeck) return null;

    return {
        ...currentDeck,
        inGame: trackerSnapshot.inGame,
        cardsInDeck: trackerSnapshot.player?.cardsInDeck ?? null,
    };
}

/**
 * Rows for the player's overlay: the decklist with copies left, plus known cards that
 * were added to the deck during the game (e.g. shuffled in).
 */
function getPlayerOverlayView() {
    if (!currentDeck) {
        return { title: "No deck loaded", count: "", cards: [], stats: [] };
    }

    const player = trackerSnapshot.player;
    const showChance = getSettings().showDrawChance && player?.cardsInDeck > 0;
    const chance = (qty) => (showChance ? qty / player.cardsInDeck : null);

    const cards = currentDeck.cards.map((card) => {
        const qty = player ? Math.max(0, card.count - (player.removed[card.id] ?? 0)) : card.count;

        return {
            id: card.id,
            name: card.name,
            cost: card.cost,
            rarity: card.rarity,
            qty,
            star: card.rarity === "LEGENDARY" && card.count === 1 && qty === 1,
            dim: qty <= 0,
            chance: chance(qty),
        };
    });

    if (player) {
        const deckIds = new Set(currentDeck.cards.map((card) => card.id));

        for (const [cardId, qty] of Object.entries(player.knownInDeck)) {
            if (deckIds.has(cardId)) continue;

            cards.push({ ...getCardInfo(cardId), qty, extra: true, chance: chance(qty) });
        }
    }

    const total = currentDeck.cards.reduce((sum, card) => sum + card.count, 0);

    return {
        title: currentDeck.name ?? currentDeck.heroes.join(", "),
        // During a game, show what's actually left in the deck (includes cards shuffled in)
        count: player ? player.cardsInDeck : total,
        cards: cards.sort(byCostThenName),
        stats: player ? [`Hand ${player.handCount}`] : [],
    };
}

/**
 * Rows for the opponent's overlay: cards from their deck we've seen them play.
 */
function getOpponentOverlayView() {
    const opponent = trackerSnapshot.opponent;

    if (!opponent) {
        return { title: "Opponent", count: "", cards: [], stats: ["Waiting for game…"] };
    }

    const hero = opponent.heroCardId ? getCardInfo(opponent.heroCardId) : null;

    const cards = Object.entries(opponent.removed)
        .map(([cardId, qty]) => ({ ...getCardInfo(cardId), qty }))
        .sort(byCostThenName);

    const stats = [`Hand ${opponent.handCount}`, `Deck ${opponent.cardsInDeck}`];
    if (opponent.secretCount) stats.push(`Secrets ${opponent.secretCount}`);

    return {
        title: formatClass(hero?.cardClass) ?? hero?.name ?? "Opponent",
        count: opponent.cardsInDeck,
        cards,
        stats,
        emptyText: "No cards played yet",
    };
}

function publish() {
    const views = { player: getPlayerOverlayView(), opponent: getOpponentOverlayView() };

    for (const [kind, overlay] of Object.entries(overlays)) {
        if (overlay && !overlay.isDestroyed()) {
            overlay.webContents.send("overlay:view", views[kind]);
        }
    }

    sendToControl("deck:changed", getDeckView());
}

/* ---------- Deck ---------- */

/**
 * Accepts a bare deck code or the full text copied from Hearthstone (which includes the name).
 */
async function loadDeck(deckText, name = extractDeckName(deckText)) {
    const code = extractDeckCode(deckText);
    currentDeck = { code, name, ...(await resolveDeck(code)) };
    updateSettings({ deckCode: code, deckName: name });

    publish();
    sendToControl("history:changed", getHistorySummary(code));

    return getDeckView();
}

/* ---------- Game tracking ---------- */

function updateTracking() {
    const snapshot = tracker.getSnapshot();
    if (JSON.stringify(snapshot) === JSON.stringify(trackerSnapshot)) return;

    const inGameChanged = snapshot.inGame !== trackerSnapshot.inGame;
    trackerSnapshot = snapshot;

    if (inGameChanged) applyAllOverlaySettings();
    publish();
}

/**
 * Log folders are named Hearthstone_YYYY_MM_DD_HH_MM_SS and log lines only have a time,
 * so combine them to get the full date of a log line.
 */
function getLogDate(time) {
    const match = path
        .basename(sessionDir ?? "")
        .match(/(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})/);
    if (!match || !time) return Date.now();

    const [, year, month, day, ...sessionTime] = match.map(Number);
    const [hours, minutes, seconds] = time.split(":").map(Number);

    const date = new Date(year, month - 1, day, hours, minutes, seconds);
    const sessionStart = new Date(year, month - 1, day, ...sessionTime);
    if (date < sessionStart) date.setDate(date.getDate() + 1); // Game after midnight

    return date.getTime();
}

/**
 * Works out which deck a finished game was played with: the last deck queued before
 * it started (from Decks.log), or else the loaded deck. When the app starts it replays
 * the whole log session, so the loaded deck isn't necessarily the one an earlier game used.
 */
async function getDeckForGame(date) {
    const queued = queuedDecks.filter((deck) => deck.date <= date).at(-1);
    if (queued) {
        const resolved = await resolveDeck(queued.code);
        return { code: queued.code, name: queued.name ?? resolved.heroes.join(", "), ...resolved };
    }

    return currentDeck && { ...currentDeck, name: currentDeck.name ?? currentDeck.heroes.join(", ") };
}

async function onGameEnd(game) {
    const date = getLogDate(game.startTime);
    const playerClass = game.playerHero ? getCardInfo(game.playerHero).cardClass : null;

    // Only attribute the game to a deck if the class matches
    const deck = await getDeckForGame(date);
    const deckMatches = deck && deck.heroClass === playerClass;

    const recorded = recordGame({
        key: `${path.basename(sessionDir ?? "")}|${game.startTime}`,
        date,
        deckCode: deckMatches ? deck.code : null,
        deckName: deckMatches ? deck.name : null,
        playerClass: formatClass(playerClass),
        opponentClass: formatClass(
            game.opponentHero ? getCardInfo(game.opponentHero).cardClass : null,
        ),
        result: game.result,
        turns: game.turns,
        gameType: game.gameType,
        formatType: game.formatType,
    });

    if (recorded) sendToControl("history:changed", getHistorySummary(currentDeck?.code));
}

tracker.on("gameEnd", (game) =>
    onGameEnd(game).catch((err) => console.error("[✕] Failed to record game:", err.message)),
);

/* ---------- Hearthstone location ---------- */

/**
 * Finds Hearthstone (the configured folder, or auto-detected), makes sure logging is
 * enabled and starts watching its logs.
 */
function connectHearthstone() {
    watcher?.stop();
    watcher = null;
    sessionDir = null;
    queuedDecks = [];
    tracker.reset();
    updateTracking();

    const configured = getSettings().hearthstoneDir;
    const dir = configured && isHearthstoneDir(configured) ? configured : findHearthstoneDir();

    hearthstone = { dir, auto: !configured, found: Boolean(dir), error: null };

    if (configured && dir !== configured) {
        hearthstone.error = "The selected folder no longer contains Hearthstone";
    }

    if (dir) {
        try {
            if (!setupLogConfig(getLogConfigPath(dir))) {
                hearthstone.error = "Could not write log.config, tracking may not work";
            }
        } catch (err) {
            hearthstone.error = err.message;
        }

        startLogWatcher(getLogsDir(dir));
    } else {
        console.error("[✕] Could not locate Hearthstone");
    }

    sendToControl("hearthstone:changed", hearthstone);
    return hearthstone;
}

function startLogWatcher(logsDir) {
    const decksParser = new DecksLogParser();
    watcher = new LogWatcher(logsDir, ["Decks.log", "Power.log"]);

    watcher.on("session", (dir) => {
        console.log("[✓] Watching", dir);
        sessionDir = dir;
        queuedDecks = [];
        tracker.spectating = false;
        tracker.reset();
        updateTracking();
    });

    watcher.on("lines", (file, lines) => {
        if (file === "Power.log") {
            tracker.processLines(lines);
            updateTracking();
            return;
        }

        const decks = decksParser.processLines(lines);
        for (const deck of decks) queuedDecks.push({ ...deck, date: getLogDate(deck.time) });

        // Automatically switch to whatever deck was just queued with
        const latest = decks.at(-1);
        if (latest && latest.code !== currentDeck?.code) {
            loadDeck(latest.code, latest.name).catch((err) =>
                console.error("[✕] Failed to load deck from Decks.log:", err.message),
            );
        }
    });

    watcher.start();
}

/* ---------- IPC ---------- */

function registerIpc() {
    ipcMain.handle("state:get", () => ({
        settings: getSettings(),
        deck: getDeckView(),
        views: { player: getPlayerOverlayView(), opponent: getOpponentOverlayView() },
        history: getHistorySummary(currentDeck?.code),
        hearthstone,
        cardDatabase: getCardDatabaseInfo(),
        shortcuts: {
            toggleOverlay: TOGGLE_OVERLAY_SHORTCUT,
            toggleLock: TOGGLE_LOCK_SHORTCUT,
        },
    }));

    ipcMain.handle("settings:set", (_event, key, value) => {
        if (!SETTING_KEYS.has(key)) throw new Error(`Unknown setting: ${key}`);

        return setSetting(key, value);
    });

    ipcMain.handle("deck:load", (_event, deckCode) => loadDeck(deckCode));

    ipcMain.handle("overlay:reset-position", () => {
        for (const [kind, overlay] of Object.entries(overlays)) {
            const bounds = getDefaultOverlayBounds(kind);
            overlay?.setBounds(bounds);
            updateSettings({ [OVERLAYS[kind].boundsKey]: bounds });
        }
    });

    ipcMain.handle("cards:refresh", async () => {
        await refreshCardDatabase();
        if (currentDeck) await loadDeck(currentDeck.code);
        publish();

        const info = getCardDatabaseInfo();
        sendToControl("cards:changed", info);
        return info;
    });

    ipcMain.handle("hearthstone:browse", async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(control, {
            title: "Select your Hearthstone folder",
            properties: ["openDirectory"],
        });
        if (canceled || !filePaths.length) return hearthstone;

        const dir = normalizeHearthstoneDir(filePaths[0]);
        if (!dir) throw new Error("That folder doesn't contain Hearthstone");

        updateSettings({ hearthstoneDir: dir });
        return connectHearthstone();
    });

    ipcMain.handle("hearthstone:auto-detect", () => {
        updateSettings({ hearthstoneDir: null });
        return connectHearthstone();
    });

    ipcMain.handle("history:clear", () => {
        clearHistory();
        const summary = getHistorySummary(currentDeck?.code);
        sendToControl("history:changed", summary);
        return summary;
    });

    ipcMain.handle("app:quit", () => app.quit());
}

function registerShortcuts() {
    globalShortcut.register(TOGGLE_OVERLAY_SHORTCUT, () => {
        // Toggle both overlays together
        const { overlayVisible, opponentOverlayVisible } = getSettings();
        const visible = !(overlayVisible || opponentOverlayVisible);
        updateSettings({ overlayVisible: visible });
        setSetting("opponentOverlayVisible", visible);
    });
    globalShortcut.register(TOGGLE_LOCK_SHORTCUT, () =>
        setSetting("overlayLocked", !getSettings().overlayLocked),
    );
}

/* ---------- Windows ---------- */

function openControlWindow() {
    if (control && !control.isDestroyed()) {
        control.show();
        control.focus();
        return;
    }

    control = createControlWindow();
    // The overlays alone can't be interacted with, so closing the control window quits
    control.on("closed", () => {
        control = null;
        app.quit();
    });
}

async function main() {
    await app.whenReady();

    const settings = loadSettings();
    setCacheDir(path.join(app.getPath("userData"), "cache"));
    registerIpc();
    registerShortcuts();

    try {
        await getCardDatabase();
    } catch (err) {
        console.error("[✕] Failed to load card database:", err.message);
    }

    for (const kind of Object.keys(OVERLAYS)) {
        overlays[kind] = createOverlayWindow(kind);
        overlays[kind].once("ready-to-show", applyAllOverlaySettings);
    }
    openControlWindow();

    const preview = startCardPreview({
        getOverlays: () => Object.values(overlays),
        isEnabled: () => getSettings().showCardPreview,
    });

    // Load the saved deck first so a deck detected from Decks.log isn't overwritten by it
    if (settings.deckCode) {
        await loadDeck(settings.deckCode, settings.deckName).catch((err) =>
            console.error("[✕] Failed to load saved deck:", err.message),
        );
    }

    connectHearthstone();

    app.on("activate", openControlWindow);
    app.on("will-quit", () => {
        globalShortcut.unregisterAll();
        watcher?.stop();
        preview.destroy();
    });
}

main();
