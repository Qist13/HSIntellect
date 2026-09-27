// Renders build/icon.svg to the PNGs used for the app and tray icons.
// Run with: npm run icons
import fs from "fs";
import path from "path";
import { app, BrowserWindow } from "electron";

const ROOT = path.join(import.meta.dirname, "..");
const svg = fs.readFileSync(path.join(ROOT, "build", "icon.svg"), "utf-8");

const OUTPUTS = [
    { file: path.join(ROOT, "build", "icon.png"), size: 512 },
    { file: path.join(ROOT, "src", "assets", "icon.png"), size: 256 },
    { file: path.join(ROOT, "src", "assets", "tray.png"), size: 32 },
];

// Awaiting app.whenReady() at the top level of an ES module entry deadlocks:
// Electron only fires "ready" once the entry module has finished loading.
async function main() {
    await app.whenReady();

    // Render once at full size, then scale down (windows can't be made as small as 32px)
    const RENDER_SIZE = 512;

    const win = new BrowserWindow({
        width: RENDER_SIZE,
        height: RENDER_SIZE,
        show: false,
        frame: false,
        transparent: true,
        useContentSize: true,
    });

    const html = `<body style="margin:0;background:transparent">
        <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"
             width="${RENDER_SIZE}" height="${RENDER_SIZE}" style="display:block"></body>`;
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString("base64")}`);

    // The first frame may not be painted yet right after loading
    let image;
    for (let attempt = 0; !image; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        try {
            image = await win.webContents.capturePage({
                x: 0,
                y: 0,
                width: RENDER_SIZE,
                height: RENDER_SIZE,
            });
        } catch (err) {
            if (attempt >= 10) throw err;
        }
    }
    win.destroy();

    for (const { file, size } of OUTPUTS) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, image.resize({ width: size, height: size, quality: "best" }).toPNG());
        console.log(`[✓] ${path.relative(ROOT, file)} (${size}x${size})`);
    }

    app.quit();
}

main().catch((err) => {
    console.error("[✕]", err);
    app.exit(1);
});
