// Preload runs sandboxed, so it has to be CommonJS
const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);

    return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("hsi", {
    getState: () => ipcRenderer.invoke("state:get"),
    setSetting: (key, value) => ipcRenderer.invoke("settings:set", key, value),
    loadDeck: (deckCode) => ipcRenderer.invoke("deck:load", deckCode),
    resetOverlayPositions: () => ipcRenderer.invoke("overlay:reset-position"),
    refreshCardDatabase: () => ipcRenderer.invoke("cards:refresh"),
    browseHearthstoneDir: () => ipcRenderer.invoke("hearthstone:browse"),
    autoDetectHearthstoneDir: () => ipcRenderer.invoke("hearthstone:auto-detect"),
    clearHistory: () => ipcRenderer.invoke("history:clear"),
    quit: () => ipcRenderer.invoke("app:quit"),

    onSettings: (callback) => subscribe("settings:changed", callback),
    onDeck: (callback) => subscribe("deck:changed", callback),
    onHistory: (callback) => subscribe("history:changed", callback),
    onHearthstone: (callback) => subscribe("hearthstone:changed", callback),
    onCardDatabase: (callback) => subscribe("cards:changed", callback),

    // Overlays
    onOverlayView: (callback) => subscribe("overlay:view", callback),
    onPointer: (callback) => subscribe("overlay:pointer", callback),
    sendHover: (hover) => ipcRenderer.send("overlay:hover", hover),

    // Card preview
    onPreviewCard: (callback) => subscribe("preview:card", callback),
});
