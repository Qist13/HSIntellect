const $ = (id) => document.getElementById(id);

const switches = document.querySelectorAll("input[data-setting]");
const opacityInput = $("overlay-opacity");
const scaleInput = $("overlay-scale");
const deckCodeInput = $("deck-code");
const loadDeckButton = $("load-deck");
const deckStatus = $("deck-status");
const deckPreview = $("deck-preview");

// Strip Electron's "Error invoking remote method ..." prefix
const errorMessage = (err) => err.message.replace(/^.*Error: /, "");

function formatShortcut(accelerator) {
    const isMac = navigator.platform.startsWith("Mac");
    return accelerator.replace("CommandOrControl", isMac ? "Cmd" : "Ctrl");
}

function formatDate(ms) {
    return new Date(ms).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function makeRow(parts) {
    const li = document.createElement("li");
    for (const [cls, text] of parts) {
        const span = document.createElement("span");
        span.className = cls;
        span.textContent = text;
        li.append(span);
    }
    return li;
}

/* ---------- Settings ---------- */

function applySettings(settings) {
    for (const input of switches) input.checked = settings[input.dataset.setting];

    opacityInput.value = settings.overlayOpacity;
    scaleInput.value = settings.overlayScale;
    $("opacity-value").textContent = `${Math.round(settings.overlayOpacity * 100)}%`;
    $("scale-value").textContent = `${Math.round(settings.overlayScale * 100)}%`;
}

for (const input of switches) {
    input.addEventListener("change", () =>
        window.hsi.setSetting(input.dataset.setting, input.checked),
    );
}
opacityInput.addEventListener("input", () =>
    window.hsi.setSetting("overlayOpacity", Number(opacityInput.value)),
);
scaleInput.addEventListener("input", () =>
    window.hsi.setSetting("overlayScale", Number(scaleInput.value)),
);

$("reset-position").addEventListener("click", () => window.hsi.resetOverlayPositions());
$("quit").addEventListener("click", () => window.hsi.quit());

/* ---------- Deck ---------- */

function renderDeck(deck) {
    if (!deck) {
        deckPreview.replaceChildren();
        return;
    }

    const total = deck.cards.reduce((sum, c) => sum + c.count, 0);
    deckStatus.className = "";
    deckStatus.textContent =
        deck.inGame && deck.cardsInDeck !== null
            ? `${deck.heroes.join(", ")} · in game, ${deck.cardsInDeck} left in deck`
            : `${deck.heroes.join(", ")} · ${total} cards`;

    // The deck may have been picked up automatically from Decks.log
    if (document.activeElement !== deckCodeInput) deckCodeInput.value = deck.code;

    deckPreview.replaceChildren(
        ...deck.cards.map((card) =>
            makeRow([
                ["cost", card.cost],
                ["name", card.name],
                ["qty", `x${card.count}`],
            ]),
        ),
    );
}

loadDeckButton.addEventListener("click", async () => {
    const code = deckCodeInput.value.trim();
    if (!code) return;

    loadDeckButton.disabled = true;
    deckStatus.className = "";
    deckStatus.textContent = "Loading…";

    try {
        await window.hsi.loadDeck(code);
    } catch (err) {
        deckStatus.className = "error";
        deckStatus.textContent = errorMessage(err);
    } finally {
        loadDeckButton.disabled = false;
    }
});

/* ---------- Stats ---------- */

function renderHistory(history) {
    const { wins, losses } = history.deck;
    const played = wins + losses;
    $("deck-record").textContent = played
        ? `${wins}W – ${losses}L (${Math.round((wins / played) * 100)}%)`
        : "No games yet";

    $("recent-games").replaceChildren(
        ...history.recent.map((game) => {
            const result = { WON: "W", LOST: "L", TIED: "T" }[game.result] ?? "?";
            const li = makeRow([
                ["result", result],
                ["matchup", `${game.playerClass ?? "?"} vs ${game.opponentClass ?? "?"}`],
                ["meta", `${game.turns} turns · ${formatDate(game.date)}`],
            ]);
            li.firstChild.classList.add(game.result.toLowerCase());
            return li;
        }),
    );
}

$("clear-history").addEventListener("click", () => window.hsi.clearHistory());

/* ---------- Hearthstone location ---------- */

function renderHearthstone(hs) {
    $("hs-status").textContent = !hs.found
        ? "Hearthstone not found. Choose its install folder."
        : hs.auto
          ? "Found automatically"
          : "Using selected folder";
    $("hs-path").textContent = hs.dir ?? "";
    $("hs-error").textContent = hs.error ?? "";
}

async function runHearthstoneAction(action) {
    try {
        renderHearthstone(await action());
    } catch (err) {
        $("hs-error").textContent = errorMessage(err);
    }
}

$("hs-browse").addEventListener("click", () =>
    runHearthstoneAction(window.hsi.browseHearthstoneDir),
);
$("hs-auto").addEventListener("click", () =>
    runHearthstoneAction(window.hsi.autoDetectHearthstoneDir),
);

/* ---------- Card database ---------- */

function renderCardDatabase(info) {
    $("cards-info").textContent = info.updatedAt
        ? `${info.cardCount.toLocaleString()} cards · updated ${formatDate(info.updatedAt)}`
        : "Not downloaded yet";
}

$("cards-refresh").addEventListener("click", async () => {
    const button = $("cards-refresh");
    button.disabled = true;
    $("cards-info").textContent = "Downloading…";

    try {
        renderCardDatabase(await window.hsi.refreshCardDatabase());
    } catch (err) {
        $("cards-info").textContent = errorMessage(err);
    } finally {
        button.disabled = false;
    }
});

/* ---------- Init ---------- */

window.hsi.onSettings(applySettings);
window.hsi.onDeck(renderDeck);
window.hsi.onHistory(renderHistory);
window.hsi.onHearthstone(renderHearthstone);
window.hsi.onCardDatabase(renderCardDatabase);

window.hsi.getState().then((state) => {
    applySettings(state.settings);
    renderDeck(state.deck);
    renderHistory(state.history);
    renderHearthstone(state.hearthstone);
    renderCardDatabase(state.cardDatabase);
    if (!state.deck) deckCodeInput.value = state.settings.deckCode;
    $("kbd-toggle").textContent = formatShortcut(state.shortcuts.toggleOverlay);
    $("kbd-lock").textContent = formatShortcut(state.shortcuts.toggleLock);
});
