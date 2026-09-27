/*
When queueing for a game, Decks.log prints the deck being used:
    I 01:49:16.3290312 Finding Game With Deck:
    I 01:49:16.3290312 ### Hand Rafaam
    I 01:49:16.3290312 # Deck ID: 3374540855
    I 01:49:16.3290312 AAECAcn1Ag7DgweIpQeJpQeKpQeRpQeTpQeUpQeVpQeWpQeXpQeapQet2QeO3Afb4AcNj58E...

It also lists every deck on login under "Deck Contents Received:", which we ignore.
*/

const LINE_RE = /^[A-Z] ([\d:]+)[\d.]* (.*)$/;
const DECK_HEADER_RE = /With Deck:$/;
const DECK_NAME_RE = /^### (.*)$/;
const DECK_CODE_RE = /^[A-Za-z0-9+/=]+$/;

export default class DecksLogParser {
    constructor() {
        this.pending = null; // deck being read after a "With Deck:" header
    }

    /**
     * Returns the decks queued with in these lines, as [{ time, name, code }].
     */
    processLines(lines) {
        const decks = [];

        for (const line of lines) {
            const match = line.match(LINE_RE);
            if (!match) continue;

            const [, time, rawMessage] = match;
            const message = rawMessage.trim();

            if (DECK_HEADER_RE.test(message)) {
                this.pending = { time, name: null };
            } else if (this.pending) {
                const name = message.match(DECK_NAME_RE);

                if (name) {
                    this.pending.name = name[1];
                } else if (!message.startsWith("#")) {
                    if (DECK_CODE_RE.test(message)) decks.push({ ...this.pending, code: message });
                    this.pending = null;
                }
            }
        }

        return decks;
    }
}
