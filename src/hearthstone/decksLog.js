/*
When queueing for a game, Decks.log prints the deck being used:
    I 01:26:40.1234567 Finding Game With Deck:
    I 01:26:40.1234567 ### My Deck
    I 01:26:40.1234567 # Deck ID: 123456789
    I 01:26:40.1234567 AAECAa0GBqIJ...
*/

const LINE_RE = /^[A-Z] [\d:.]+ (.*)$/;
const DECK_HEADER_RE = /With Deck:$/;
const DECK_CODE_RE = /^[A-Za-z0-9+/=]+$/;

export default class DecksLogParser {
    constructor() {
        this.expectingDeck = false;
    }

    /**
     * Returns the last deck code queued with in these lines, or null.
     */
    processLines(lines) {
        let deckCode = null;

        for (const line of lines) {
            const message = line.match(LINE_RE)?.[1]?.trim();
            if (!message) continue;

            if (DECK_HEADER_RE.test(message)) {
                this.expectingDeck = true;
            } else if (this.expectingDeck && !message.startsWith("#")) {
                if (DECK_CODE_RE.test(message)) deckCode = message;
                this.expectingDeck = false;
            }
        }

        return deckCode;
    }
}
