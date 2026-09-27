import fs from "fs";
import path from "path";
import { app } from "electron";

const MAX_GAMES = 1000;

let games = null;

function getHistoryPath() {
    return path.join(app.getPath("userData"), "history.json");
}

function loadHistory() {
    try {
        games = JSON.parse(fs.readFileSync(getHistoryPath(), "utf-8"));
    } catch {
        games = [];
    }

    return games;
}

function saveHistory() {
    try {
        fs.mkdirSync(path.dirname(getHistoryPath()), { recursive: true });
        fs.writeFileSync(getHistoryPath(), JSON.stringify(games, null, 4));
    } catch (err) {
        console.error("[✕] Failed to save match history:", err.message);
    }
}

/**
 * Adds a finished game. Games are identified by `key`, so replaying an old log
 * doesn't record the same game twice. Returns false if it was already recorded.
 */
export function recordGame(game) {
    games ??= loadHistory();
    if (games.some((g) => g.key === game.key)) return false;

    games.push(game);
    games.sort((a, b) => a.date - b.date);
    if (games.length > MAX_GAMES) games = games.slice(-MAX_GAMES);

    saveHistory();
    return true;
}

export function clearHistory() {
    games = [];
    saveHistory();
}

/**
 * Win/loss record for a deck plus the most recent games overall.
 */
export function getHistorySummary(deckCode) {
    games ??= loadHistory();

    const deckGames = deckCode ? games.filter((g) => g.deckCode === deckCode) : [];
    const wins = deckGames.filter((g) => g.result === "WON").length;
    const losses = deckGames.filter((g) => g.result === "LOST").length;

    return {
        deck: { wins, losses, games: deckGames.length },
        total: games.length,
        recent: games.slice(-10).reverse(),
    };
}
