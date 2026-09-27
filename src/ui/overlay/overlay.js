const TILE_URL = "https://art.hearthstonejson.com/v1/tiles";

const root = document.getElementById("root");
const heroEl = document.getElementById("hero");
const countEl = document.getElementById("count");
const cardsEl = document.getElementById("cards");

function applySettings(settings) {
    document.body.classList.toggle("unlocked", !settings.overlayLocked);
    root.style.opacity = settings.overlayOpacity;

    // Scale the content without changing the window size
    const scale = settings.overlayScale;
    root.style.transform = `scale(${scale})`;
    root.style.width = `${100 / scale}%`;
    root.style.height = `${100 / scale}%`;
}

function renderCard(card) {
    const li = document.createElement("li");
    li.className = "card";
    if (card.rarity === "LEGENDARY") li.classList.add("legendary");
    if (card.count <= 0) li.classList.add("empty");

    if (card.id) {
        const tile = document.createElement("img");
        tile.className = "tile";
        tile.src = `${TILE_URL}/${card.id}.png`;
        tile.onerror = () => tile.remove();
        li.append(tile);
    }

    const cost = document.createElement("span");
    cost.className = "cost";
    cost.textContent = card.cost;

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = card.name;

    const qty = document.createElement("span");
    qty.className = "qty";
    qty.textContent = card.rarity === "LEGENDARY" && card.count === 1 ? "★" : card.count;

    li.append(cost, name, qty);

    return li;
}

function renderDeck(deck) {
    if (!deck) {
        heroEl.textContent = "No deck loaded";
        countEl.textContent = "";
        cardsEl.replaceChildren();
        return;
    }

    const total = deck.cards.reduce((sum, c) => sum + c.count, 0);
    heroEl.textContent = deck.heroes.join(", ");
    countEl.textContent = total;
    cardsEl.replaceChildren(...deck.cards.map(renderCard));
}

window.hsi.onSettings(applySettings);
window.hsi.onDeck(renderDeck);

window.hsi.getState().then(({ settings, deck }) => {
    applySettings(settings);
    renderDeck(deck);
});
