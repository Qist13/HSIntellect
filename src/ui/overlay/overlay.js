const TILE_URL = "https://art.hearthstonejson.com/v1/tiles";

// "player" or "opponent", set by the main process when loading the page
const kind = new URLSearchParams(location.search).get("kind") ?? "player";

const root = document.getElementById("root");
const titleEl = document.getElementById("title");
const countEl = document.getElementById("count");
const cardsEl = document.getElementById("cards");
const emptyEl = document.getElementById("empty");
const statsEl = document.getElementById("stats");

function applySettings(settings) {
    document.body.classList.toggle("unlocked", !settings.overlayLocked);
    root.style.opacity = settings.overlayOpacity;

    // Scale the content without changing the window size
    const scale = settings.overlayScale;
    root.style.transform = `scale(${scale})`;
    root.style.width = `${100 / scale}%`;
    root.style.height = `${100 / scale}%`;
}

function renderCard(card, bestChance) {
    const li = document.createElement("li");
    li.className = "card";
    li.dataset.id = card.id ?? "";
    if (card.rarity === "LEGENDARY") li.classList.add("legendary");
    if (card.dim) li.classList.add("empty");
    if (card.extra) li.classList.add("extra");

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

    li.append(cost, name);

    if (card.chance !== null && card.chance !== undefined && card.qty > 0) {
        const chance = document.createElement("span");
        chance.className = card.chance === bestChance ? "chance best" : "chance";
        chance.textContent = `${Math.round(card.chance * 100)}%`;
        li.append(chance);
    }

    const qty = document.createElement("span");
    qty.className = "qty";
    qty.textContent = card.star ? "★" : card.qty;
    li.append(qty);

    return li;
}

function renderView(view) {
    titleEl.textContent = view.title;
    countEl.textContent = view.count;
    const bestChance = Math.max(0, ...view.cards.map((card) => card.chance ?? 0)) || null;
    cardsEl.replaceChildren(...view.cards.map((card) => renderCard(card, bestChance)));
    emptyEl.textContent = view.cards.length ? "" : (view.emptyText ?? "");
    statsEl.replaceChildren(
        ...view.stats.map((stat) => {
            const span = document.createElement("span");
            span.textContent = stat;
            return span;
        }),
    );
}

/* Card preview: the main process sends the cursor position while it's over this window */

let hoveredId = null;

window.hsi.onPointer((pointer) => {
    const row = pointer && document.elementFromPoint(pointer.x, pointer.y)?.closest(".card");
    const cardId = row?.dataset.id || null;

    if (cardId === hoveredId) return;
    hoveredId = cardId;

    if (!cardId) {
        window.hsi.sendHover(null);
        return;
    }

    const rect = row.getBoundingClientRect();
    window.hsi.sendHover({ cardId, y: rect.top + rect.height / 2 });
});

window.hsi.onSettings(applySettings);
window.hsi.onOverlayView(renderView);

window.hsi.getState().then(({ settings, views }) => {
    applySettings(settings);
    renderView(views[kind]);
});
