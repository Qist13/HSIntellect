import path from "path";
import { Menu, Tray, nativeImage } from "electron";

const ICON = path.join(import.meta.dirname, "..", "assets", "tray.png");

/**
 * Tray icon that keeps the app reachable while the control window is closed.
 * getState() returns { overlaysVisible, overlaysLocked, autostart } for the menu checkboxes.
 */
export function createTray({ getState, onOpen, onToggleOverlays, onToggleLock, onToggleAutostart, onQuit }) {
    const tray = new Tray(nativeImage.createFromPath(ICON));
    tray.setToolTip("HSIntellect");

    // Most Linux trays only show the menu, but a click works on Windows and macOS
    tray.on("click", onOpen);

    const update = () => {
        const state = getState();

        tray.setContextMenu(
            Menu.buildFromTemplate([
                { label: "Open HSIntellect", click: onOpen },
                { type: "separator" },
                {
                    label: "Show overlays",
                    type: "checkbox",
                    checked: state.overlaysVisible,
                    click: onToggleOverlays,
                },
                {
                    label: "Lock overlays",
                    type: "checkbox",
                    checked: state.overlaysLocked,
                    click: onToggleLock,
                },
                { type: "separator" },
                {
                    label: "Start at login",
                    type: "checkbox",
                    checked: state.autostart,
                    click: onToggleAutostart,
                },
                { type: "separator" },
                { label: "Quit", click: onQuit },
            ]),
        );
    };

    update();

    return { update, destroy: () => tray.destroy() };
}
