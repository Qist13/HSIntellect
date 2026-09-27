import { test } from "node:test";
import assert from "node:assert/strict";
import GameTracker from "../src/hearthstone/gameTracker.js";
import { endGame, readFixture, syntheticGame } from "./helpers.js";

/**
 * Feeds lines one at a time, collecting finished games and checking the accounting of
 * our starting deck at the end of every game.
 */
function replay(lines) {
    const tracker = new GameTracker();
    const games = [];

    tracker.on("gameEnd", (game) => {
        games.push(game);

        // The player named Me#1000 must be the one detected as us
        assert.equal(tracker.playerNames.get("Me#1000"), tracker.friendlyPlayer);

        // Every card from our starting deck is either still in the deck or identified
        const starting = [...tracker.entities.values()].filter(
            (e) => e.owner === tracker.friendlyPlayer,
        );
        const unidentified = starting.filter((e) => e.zone !== "DECK" && !e.originalCardId);
        assert.equal(starting.length, 40, "Rafaam decks start with 40 cards");
        assert.equal(unidentified.length, 0, "every card that left the deck is identified");
    });

    tracker.processLines(lines);
    return { tracker, games };
}

const sum = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);

test("three games: results, heroes and turns", () => {
    const { games } = replay(readFixture("three-games.Power.log.gz"));

    assert.deepEqual(
        games.map(({ startTime, result, turns, playerHero, opponentHero, gameType }) => ({
            startTime,
            result,
            turns,
            playerHero,
            opponentHero,
            gameType,
        })),
        [
            {
                startTime: "23:16:05",
                result: "WON",
                turns: 10,
                playerHero: "HERO_07a",
                opponentHero: "HERO_09o",
                gameType: "GT_RANKED",
            },
            {
                startTime: "23:26:18",
                result: "WON",
                turns: 14,
                playerHero: "HERO_07a",
                opponentHero: "HERO_10at",
                gameType: "GT_RANKED",
            },
        ],
    );
});

test("three games: the unfinished third game is tracked", () => {
    const { tracker } = replay(readFixture("three-games.Power.log.gz"));
    const snapshot = tracker.getSnapshot();

    assert.equal(snapshot.inGame, true);
    assert.equal(snapshot.player.cardsInDeck, 21);
    assert.equal(snapshot.opponent.heroCardId, "HERO_09a");
    // Imp Gang Stooge put two 8/8 Demons into the deck, on top of the starting 40
    assert.equal(snapshot.player.knownInDeck.JAIL_399t1, 2);
    assert.equal(snapshot.player.cardsInDeck + sum(snapshot.player.removed), 40 + 2);
});

test("hand rafaam: remaining cards match the real decklist", () => {
    const tracker = new GameTracker();
    let lastInGame = null;
    const games = [];
    tracker.on("gameEnd", (game) => games.push(game));

    for (const line of readFixture("hand-rafaam.Power.log.gz")) {
        tracker.processLine(line);
        if (tracker.inGame) lastInGame = tracker.getSnapshot();
    }

    assert.equal(games.length, 1);
    assert.equal(games[0].result, "LOST");
    assert.equal(games[0].turns, 5);

    assert.equal(lastInGame.player.cardsInDeck, 30);
    assert.equal(sum(lastInGame.player.removed), 10);
});

test("transformed cards count as the card they started as", () => {
    const tracker = new GameTracker();
    tracker.processLines(
        syntheticGame({
            turns: [
                "TAG_CHANGE Entity=4 tag=ZONE value=PLAY",
                "CHANGE_ENTITY - Updating Entity=[entityName=A id=4 zone=PLAY zonePos=1 cardId=CARD_A player=1] CardID=SHEEP",
            ],
        }),
    );

    assert.deepEqual(tracker.getSnapshot().player.removed, { CARD_A: 1 });
});

test("mulliganed cards go back to the deck", () => {
    const tracker = new GameTracker();
    tracker.processLines(
        syntheticGame({
            turns: ["HIDE_ENTITY - Entity=[entityName=A id=4 zone=HAND zonePos=1 cardId=CARD_A player=1] tag=ZONE value=DECK"],
        }),
    );

    const { player } = tracker.getSnapshot();
    assert.deepEqual(player.removed, {});
    assert.equal(player.cardsInDeck, 1);
});

test("stolen cards still count as removed from our deck", () => {
    const tracker = new GameTracker();
    tracker.processLines(
        syntheticGame({
            turns: ["TAG_CHANGE Entity=4 tag=CONTROLLER value=2", "TAG_CHANGE Entity=4 tag=ZONE value=PLAY"],
        }),
    );

    assert.deepEqual(tracker.getSnapshot().player.removed, { CARD_A: 1 });
});

test("a hidden opponent's revealed name is matched to their player", () => {
    const tracker = new GameTracker();
    const games = [];
    tracker.on("gameEnd", (game) => games.push(game));

    // The opponent shows up as "UNKNOWN HUMAN PLAYER" but loses under their real name
    tracker.processLines(syntheticGame({ turns: endGame("Me#1000", "Opponent#2000") }));

    assert.equal(games.length, 1);
    assert.equal(games[0].result, "WON");
    assert.equal(tracker.players.get(2).playState, "LOST");
});

test("losing is reported as LOST", () => {
    const tracker = new GameTracker();
    const games = [];
    tracker.on("gameEnd", (game) => games.push(game));

    tracker.processLines(syntheticGame({ turns: endGame("Opponent#2000", "Me#1000") }));

    assert.equal(games[0].result, "LOST");
});

test("battlegrounds games are not tracked", () => {
    const tracker = new GameTracker();
    const games = [];
    tracker.on("gameEnd", (game) => games.push(game));

    tracker.processLines(syntheticGame({ gameType: "GT_BATTLEGROUNDS", turns: endGame() }));

    assert.equal(tracker.getSnapshot().player, null);
    assert.equal(games.length, 0);
});

test("spectated games are not tracked or recorded", () => {
    const tracker = new GameTracker();
    const games = [];
    tracker.on("gameEnd", (game) => games.push(game));

    tracker.processLines([
        "D 00:00:00.0000000 GameState.DebugPrintPower() - Begin Spectating",
        ...syntheticGame({ turns: endGame() }),
    ]);
    assert.equal(games.length, 0);

    tracker.processLines([
        "D 00:00:00.0000000 GameState.DebugPrintPower() - End Spectator Mode",
        ...syntheticGame({ turns: endGame() }),
    ]);
    assert.equal(games.length, 1);
});
