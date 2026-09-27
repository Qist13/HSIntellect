const $ = (id) => document.getElementById(id);

const visibleInput = $("overlay-visible");
const lockedInput = $("overlay-locked");
const opacityInput = $("overlay-opacity");
const scaleInput = $("overlay-scale");
const deckCodeInput = $("deck-code");
const loadDeckButton = $("load-deck");
const deckStatus = $("deck-status");
const deckPreview = $("deck-preview");

function formatShortcut(accelerator) {
    const isMac = navigator.platform.startsWith("Mac");
    return accelerator.replace("CommandOrControl", isMac ? "Cmd" : "Ctrl");
}

function applySettings(settings) {
    visibleInput.checked = settings.overlayVisible;
    lockedInput.checked = settings.overlayLocked;
    opacityInput.value = settings.overlayOpacity;
    scaleInput.value = settings.overlayScale;
    $("opacity-value").textContent = `${Math.round(settings.overlayOpacity * 100)}%`;
    $("scale-value").textContent = `${Math.round(settings.overlayScale * 100)}%`;
}

function renderDeck(deck) {
    if (!deck) {
        deckPreview.replaceChildren();
        return;
    }

    const total = deck.cards.reduce((sum, c) => sum + c.count, 0);
    deckStatus.className = "";
    deckStatus.textContent = `${deck.heroes.join(", ")} · ${total} cards`;

    deckPreview.replaceChildren(
        ...deck.cards.map((card) => {
            const li = document.createElement("li");
            for (const [cls, text] of [
                ["cost", card.cost],
                ["name", card.name],
                ["qty", `x${card.count}`],
            ]) {
                const span = document.createElement("span");
                span.className = cls;
                span.textContent = text;
                li.append(span);
            }
            return li;
        }),
    );
}

visibleInput.addEventListener("change", () =>
    window.hsi.setSetting("overlayVisible", visibleInput.checked),
);
lockedInput.addEventListener("change", () =>
    window.hsi.setSetting("overlayLocked", lockedInput.checked),
);
opacityInput.addEventListener("input", () =>
    window.hsi.setSetting("overlayOpacity", Number(opacityInput.value)),
);
scaleInput.addEventListener("input", () =>
    window.hsi.setSetting("overlayScale", Number(scaleInput.value)),
);

$("reset-position").addEventListener("click", () => window.hsi.resetOverlayPosition());
$("quit").addEventListener("click", () => window.hsi.quit());

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
        // Strip Electron's "Error invoking remote method ..." prefix
        deckStatus.textContent = err.message.replace(/^.*Error: /, "");
    } finally {
        loadDeckButton.disabled = false;
    }
});

window.hsi.onSettings(applySettings);
window.hsi.onDeck(renderDeck);

window.hsi.getState().then(({ settings, deck, shortcuts }) => {
    applySettings(settings);
    renderDeck(deck);
    deckCodeInput.value = settings.deckCode;
    $("kbd-toggle").textContent = formatShortcut(shortcuts.toggleOverlay);
    $("kbd-lock").textContent = formatShortcut(shortcuts.toggleLock);
});
