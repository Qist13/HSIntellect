const RENDER_URL = "https://art.hearthstonejson.com/v1/render/latest/enUS/256x";

const img = document.getElementById("card");

window.hsi.onPreviewCard((cardId) => {
    const src = `${RENDER_URL}/${cardId}.png`;
    if (img.getAttribute("src") !== src) img.src = src;
});
