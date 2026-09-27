/*
Rebuilds game state from Power.log.

Every card in the game is an entity with a numeric ID. At CREATE_GAME both decks are
created as hidden entities in the DECK zone (no CardID). As the game goes on we see:
    SHOW_ENTITY    a hidden entity is revealed (e.g. we draw it), followed by its tags
    HIDE_ENTITY    a revealed entity is hidden again (e.g. mulliganed back into the deck)
    CHANGE_ENTITY  an entity transforms into a different card
    TAG_CHANGE     a single tag changes, e.g. ZONE: DECK -> HAND
    FULL_ENTITY    a new entity is created mid-game (e.g. generated cards)

The log contains the same power history twice, once as GameState.DebugPrintPower
and again as PowerTaskList.DebugPrintPower. We only read the GameState copy.

Events:
    "gameEnd" ({ startTime, gameType, formatType, turns, result, playerHero, opponentHero })
*/

import { EventEmitter } from "events";

const POWER_LINE_RE =
    /^[A-Z] ([\d:]+)[\d.]* GameState\.DebugPrint(Power|PowerList|Game)\(\) - \s*(.*)$/;

const CREATE_GAME_RE = /^CREATE_GAME$/;
const GAME_ENTITY_RE = /^GameEntity EntityID=(\d+)/;
const PLAYER_RE = /^Player EntityID=(\d+) PlayerID=(\d+)/;
const FULL_ENTITY_RE = /^FULL_ENTITY - (?:Creating ID=(\d+)|Updating (.+)) CardID=(\S*)$/;
const SHOW_ENTITY_RE = /^SHOW_ENTITY - Updating Entity=(.+) CardID=(\S*)$/;
const CHANGE_ENTITY_RE = /^CHANGE_ENTITY - Updating Entity=(.+) CardID=(\S*)$/;
const HIDE_ENTITY_RE = /^HIDE_ENTITY - Entity=(.+) tag=(\S+) value=(\S*)$/;
const TAG_CHANGE_RE = /^TAG_CHANGE Entity=(.+) tag=(\S+) value=(\S*)/;
const TAG_RE = /^tag=(\S+) value=(\S*)$/;

const GAME_TYPE_RE = /^GameType=(\S+)$/;
const FORMAT_TYPE_RE = /^FormatType=(\S+)$/;
const PLAYER_NAME_RE = /^PlayerID=(\d+), PlayerName=(.+)$/;

// Hidden opponents show up under this name until their BattleTag is revealed
const UNKNOWN_PLAYER_NAME = "UNKNOWN HUMAN PLAYER";

// Modes without a normal constructed deck, where tracking cards makes no sense
const UNTRACKED_GAME_TYPES = /BATTLEGROUNDS|MERCENARIES/;

export default class GameTracker extends EventEmitter {
    constructor() {
        super();
        this.reset();
    }

    reset() {
        this.entities = new Map();
        this.players = new Map(); // playerId -> player entity
        this.playerNames = new Map(); // name -> playerId
        this.inGame = false;
        this.startTime = null;
        this.gameType = null;
        this.formatType = null;
        this.friendlyPlayer = null;
        this.inSetup = false; // true while the initial CREATE_GAME entities are being created
        this.current = null; // entity that indented tag= lines apply to
        this.currentAction = null;
    }

    get isTrackable() {
        return !UNTRACKED_GAME_TYPES.test(this.gameType ?? "");
    }

    get opponentPlayer() {
        if (this.friendlyPlayer === null) return null;
        return [...this.players.keys()].find((id) => id !== this.friendlyPlayer) ?? null;
    }

    getEntity(id) {
        let entity = this.entities.get(id);
        if (!entity) {
            entity = { id, cardId: "", zone: null, controller: null, cardType: null };
            this.entities.set(id, entity);
        }
        return entity;
    }

    setCardId(entity, cardId) {
        if (!cardId) return;

        entity.cardId = cardId;
        // Transforms change cardId; remember what the card was when we first saw it
        entity.originalCardId ??= cardId;
    }

    /**
     * Entity references are either a bare ID ("40"), a bracketed description
     * ("[entityName=Hellfire id=23 zone=HAND ... player=1]"), "GameEntity", or a player name.
     */
    resolveEntity(ref) {
        if (/^\d+$/.test(ref)) return this.getEntity(Number(ref));
        if (ref === "GameEntity") return this.getEntity(1);

        const match = ref.match(/\bid=(\d+)/);
        if (match) return this.getEntity(Number(match[1]));

        return this.resolvePlayerName(ref);
    }

    resolvePlayerName(name) {
        let playerId = this.playerNames.get(name);

        // A hidden opponent's real name gets revealed mid-game
        if (playerId === undefined) {
            playerId = this.playerNames.get(UNKNOWN_PLAYER_NAME);
            if (playerId === undefined) return null;

            this.playerNames.delete(UNKNOWN_PLAYER_NAME);
            this.playerNames.set(name, playerId);
        }

        return this.players.get(playerId) ?? null;
    }

    processLines(lines) {
        for (const line of lines) this.processLine(line);
    }

    processLine(line) {
        const match = line.match(POWER_LINE_RE);
        if (!match) return;

        const [, time, kind, body] = match;

        if (kind === "PowerList") {
            // A new batch of powers means the initial game creation is over
            if (this.entities.size) this.inSetup = false;
            return;
        }

        if (kind === "Game") {
            this.processGameInfo(body);
            return;
        }

        let m;

        if ((m = body.match(TAG_RE))) {
            if (this.current) this.setTag(this.current, m[1], m[2], this.currentAction);
            return;
        }

        this.current = null;
        this.currentAction = null;

        if (CREATE_GAME_RE.test(body)) {
            this.reset();
            this.inGame = true;
            this.inSetup = true;
            this.startTime = time;
        } else if ((m = body.match(GAME_ENTITY_RE))) {
            this.current = this.getEntity(Number(m[1]));
        } else if ((m = body.match(PLAYER_RE))) {
            const entity = this.getEntity(Number(m[1]));
            entity.playerId = Number(m[2]);
            this.players.set(entity.playerId, entity);
            this.current = entity;
        } else if ((m = body.match(FULL_ENTITY_RE))) {
            const entity = m[1] ? this.getEntity(Number(m[1])) : this.resolveEntity(m[2]);
            if (!entity) return;

            if (this.inSetup && entity.createdInSetup === undefined) {
                entity.createdInSetup = true;
            }
            this.setCardId(entity, m[3]);

            this.current = entity;
            this.currentAction = "FULL_ENTITY";
        } else if ((m = body.match(SHOW_ENTITY_RE)) || (m = body.match(CHANGE_ENTITY_RE))) {
            const entity = this.resolveEntity(m[1]);
            if (!entity) return;

            this.setCardId(entity, m[2]);

            this.current = entity;
            this.currentAction = body.startsWith("SHOW") ? "SHOW_ENTITY" : "CHANGE_ENTITY";
        } else if ((m = body.match(HIDE_ENTITY_RE)) || (m = body.match(TAG_CHANGE_RE))) {
            const entity = this.resolveEntity(m[1]);
            if (entity) this.setTag(entity, m[2], m[3], null);
        } else if (body.startsWith("BLOCK_START")) {
            this.inSetup = false;
        }
    }

    processGameInfo(body) {
        let m;

        if ((m = body.match(GAME_TYPE_RE))) {
            this.gameType = m[1];
        } else if ((m = body.match(FORMAT_TYPE_RE))) {
            this.formatType = m[1];
        } else if ((m = body.match(PLAYER_NAME_RE))) {
            this.playerNames.set(m[2], Number(m[1]));
        }
    }

    setTag(entity, tag, value, action) {
        switch (tag) {
            case "ZONE":
                // The first card revealed as it's drawn from deck to hand must be ours;
                // opponent draws are never revealed.
                if (
                    action === "SHOW_ENTITY" &&
                    value === "HAND" &&
                    entity.zone === "DECK" &&
                    this.friendlyPlayer === null
                ) {
                    this.friendlyPlayer = entity.controller;
                }

                entity.zone = value;
                if (entity.createdInSetup && value === "DECK") entity.startingDeck = true;
                this.recordOwner(entity);
                break;

            case "CONTROLLER":
                entity.controller = Number(value);
                this.recordOwner(entity);
                break;

            case "CARDTYPE":
                entity.cardType = value;
                break;

            case "HERO_ENTITY":
                entity.heroEntity = Number(value);
                break;

            case "PLAYSTATE":
                entity.playState = value;
                break;

            case "TURN":
                if (entity.id === 1) entity.turn = Number(value);
                break;

            case "STATE":
                if (entity.id === 1 && value === "COMPLETE" && this.inGame) {
                    this.inGame = false;
                    this.emitGameEnd();
                }
                break;
        }
    }

    /**
     * Everything created during setup in the DECK zone is a card from a starting deck.
     * Remember whose deck it started in, since cards can be stolen later.
     */
    recordOwner(entity) {
        if (entity.startingDeck && entity.owner === undefined && entity.controller !== null) {
            entity.owner = entity.controller;
        }
    }

    getHeroCardId(playerId) {
        const heroId = this.players.get(playerId)?.heroEntity;
        return heroId ? (this.entities.get(heroId)?.cardId ?? null) : null;
    }

    emitGameEnd() {
        if (!this.isTrackable || this.friendlyPlayer === null) return;

        const result = this.players.get(this.friendlyPlayer)?.playState;

        this.emit("gameEnd", {
            startTime: this.startTime,
            gameType: this.gameType,
            formatType: this.formatType,
            turns: Math.ceil((this.entities.get(1)?.turn ?? 0) / 2),
            result: ["WON", "LOST", "TIED"].includes(result) ? result : "UNKNOWN",
            playerHero: this.getHeroCardId(this.friendlyPlayer),
            opponentHero: this.getHeroCardId(this.opponentPlayer),
        });
    }

    /**
     * Card counts for one player:
     *   removed      starting-deck cards that have left the deck, by original card ID
     *   knownInDeck  cards currently in the deck whose identity we know
     */
    getPlayerSnapshot(playerId) {
        const removed = {};
        const knownInDeck = {};
        let cardsInDeck = 0;
        let handCount = 0;
        let secretCount = 0;

        for (const entity of this.entities.values()) {
            if (entity.cardType === "ENCHANTMENT") continue;

            const controlled = entity.controller === playerId;

            if (controlled && entity.zone === "DECK") {
                cardsInDeck++;
                if (entity.cardId) {
                    knownInDeck[entity.cardId] = (knownInDeck[entity.cardId] ?? 0) + 1;
                }
            } else if (entity.owner === playerId && entity.originalCardId) {
                removed[entity.originalCardId] = (removed[entity.originalCardId] ?? 0) + 1;
            }

            if (controlled && entity.zone === "HAND") handCount++;
            if (controlled && entity.zone === "SECRET") secretCount++;
        }

        return {
            heroCardId: this.getHeroCardId(playerId),
            cardsInDeck,
            handCount,
            secretCount,
            removed,
            knownInDeck,
        };
    }

    getSnapshot() {
        const inGame = this.inGame && this.isTrackable;

        if (!inGame || this.friendlyPlayer === null) {
            return { inGame, player: null, opponent: null };
        }

        return {
            inGame,
            player: this.getPlayerSnapshot(this.friendlyPlayer),
            opponent: this.getPlayerSnapshot(this.opponentPlayer),
        };
    }
}
