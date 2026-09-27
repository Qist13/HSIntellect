import { screen } from "electron";
import x11 from "x11";

/**
 * Tracks the global cursor position.
 *
 * On Linux, Electron's screen.getCursorScreenPoint() only updates while the pointer is
 * over one of our own windows. Locked overlays let the mouse pass through to the game,
 * so it would never see the cursor move over them. Instead we ask the X server directly
 * (also works for XWayland windows such as Hearthstone under Proton).
 *
 * Everywhere else, or if the X server can't be reached, falls back to Electron.
 */
export function createCursorTracker({ pollMs }) {
    let point = null;
    let client = null;
    let timer = null;
    let pending = false;

    if (process.platform === "linux" && process.env.DISPLAY) {
        try {
            x11.createClient((err, display) => {
                if (err) {
                    console.error("[✕] Could not connect to X server for cursor tracking:", err.message);
                    return;
                }

                client = display.client;
                client.on("error", (error) => console.error("[✕] X11 error:", error.message));
                const root = display.screen[0].root;

                timer = setInterval(() => {
                    if (pending) return;
                    pending = true;

                    client.QueryPointer(root, (error, reply) => {
                        pending = false;
                        if (error || !reply) return;

                        // X reports physical pixels, window bounds are in DIPs
                        const { scaleFactor } = screen.getPrimaryDisplay();
                        point = {
                            x: Math.round(reply.rootX / scaleFactor),
                            y: Math.round(reply.rootY / scaleFactor),
                        };
                    });
                }, pollMs);
            });
        } catch (err) {
            console.error("[✕] Could not start X11 cursor tracking:", err.message);
        }
    }

    return {
        getPoint: () => point ?? screen.getCursorScreenPoint(),
        destroy() {
            clearInterval(timer);
            client?.terminate();
        },
    };
}
