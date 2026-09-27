import fs from "fs";
import path from "path";
import zlib from "zlib";

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures");

/**
 * Lines of a gzipped log fixture. Fixtures are real logs trimmed to the lines we parse,
 * with BattleTags and account IDs anonymized (the player is always "Me#1000").
 */
export function readFixture(name) {
    const gz = fs.readFileSync(path.join(FIXTURES_DIR, name));
    return zlib.gunzipSync(gz).toString("utf-8").split(/\r?\n/);
}

const power = (body) => `D 00:00:00.0000000 GameState.DebugPrintPower() - ${body}`;
const powerList = () => "D 00:00:00.0000000 GameState.DebugPrintPowerList() - Count=1";
const gameInfo = (body) => `D 00:00:00.0000000 GameState.DebugPrintGame() - ${body}`;

/**
 * A minimal synthetic game: players 1 (Me#1000) and 2 (hidden opponent),
 * each with one card in their starting deck (entities 4 and 5).
 * `turns` is a list of log bodies played after setup.
 */
export function syntheticGame({ gameType = "GT_RANKED", turns = [] } = {}) {
    return [
        powerList(),
        power("CREATE_GAME"),
        power("    GameEntity EntityID=1"),
        power("        tag=CARDTYPE value=GAME"),
        power("    Player EntityID=2 PlayerID=1 GameAccountId=[hi=0 lo=0]"),
        power("        tag=CONTROLLER value=1"),
        power("        tag=HERO_ENTITY value=10"),
        power("    Player EntityID=3 PlayerID=2 GameAccountId=[hi=0 lo=0]"),
        power("        tag=CONTROLLER value=2"),
        power("        tag=HERO_ENTITY value=11"),
        power("FULL_ENTITY - Creating ID=4 CardID="),
        power("    tag=ZONE value=DECK"),
        power("    tag=CONTROLLER value=1"),
        power("FULL_ENTITY - Creating ID=5 CardID="),
        power("    tag=ZONE value=DECK"),
        power("    tag=CONTROLLER value=2"),
        power("FULL_ENTITY - Creating ID=10 CardID=HERO_07"),
        power("    tag=ZONE value=PLAY"),
        power("    tag=CONTROLLER value=1"),
        power("FULL_ENTITY - Creating ID=11 CardID=HERO_08"),
        power("    tag=ZONE value=PLAY"),
        power("    tag=CONTROLLER value=2"),
        gameInfo(`GameType=${gameType}`),
        gameInfo("FormatType=FT_STANDARD"),
        gameInfo("PlayerID=1, PlayerName=Me#1000"),
        gameInfo("PlayerID=2, PlayerName=UNKNOWN HUMAN PLAYER"),
        powerList(),
        // Draw our card
        power("SHOW_ENTITY - Updating Entity=4 CardID=CARD_A"),
        power("    tag=ZONE value=HAND"),
        ...turns.map((body) => (body.startsWith("RAW ") ? body.slice(4) : power(body))),
    ];
}

export const endGame = (winner = "Me#1000", loser = "Opponent#2000") => [
    `TAG_CHANGE Entity=${winner} tag=PLAYSTATE value=WON`,
    `TAG_CHANGE Entity=${loser} tag=PLAYSTATE value=LOST`,
    "TAG_CHANGE Entity=GameEntity tag=STATE value=COMPLETE",
];
