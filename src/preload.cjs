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
    resetOverlayPosition: () => ipcRenderer.invoke("overlay:reset-position"),
    quit: () => ipcRenderer.invoke("app:quit"),

    onSettings: (callback) => subscribe("settings:changed", callback),
    onDeck: (callback) => subscribe("deck:changed", callback),
});
