# HSIntellect

A Hearthstone deck tracker. It reads the game's log files and shows an always-on-top overlay with the cards left in your deck, what your opponent has played, and your win rate per deck.

Works on Linux (Steam/Proton, Lutris, Bottles, Heroic, Wine), Windows and macOS.

## Features

- **Deck tracker**: your decklist with copies left, faded out as cards leave your deck. Also shows the chance to draw each card next, and cards added to your deck during the game.
- **Opponent tracker**: the opponent's class, the cards they've played from their deck, and their hand, deck and secret counts.
- **Automatic deck detection**: picks up the deck you queue with, no copy-pasting needed. You can also paste a deck code (or the full text copied from Hearthstone).
- **Card previews**: hover a card in the overlay to see the full card.
- **Match history**: results per deck, with win rate and recent games.
- **Stays out of the way**: overlays only show during games and let clicks pass through to the game while locked. The app runs in the tray and can start at login.

## Install

### Linux

Download the latest build, or build it yourself (see [Development](#development)):

- **AppImage**: make it executable and run it:
  ```sh
  chmod +x HSIntellect-*.AppImage
  ./HSIntellect-*.AppImage
  ```
- **Debian/Ubuntu**:
  ```sh
  sudo apt install ./hsintellect_*_amd64.deb
  ```

### Windows / macOS

Build with `npm run dist:win` or `npm run dist:mac` on that platform.

## Getting started

1. Start HSIntellect. It finds your Hearthstone install and turns on the game logs it needs.
2. **Restart Hearthstone** if it was already running. Hearthstone only reads its log settings at launch.
3. Queue a game. The deck you queue with is loaded automatically and the overlays appear when the game starts.

Hearthstone not found? Open the control window and use **Hearthstone → Choose folder…** to pick the install folder (the one containing `Hearthstone.exe` / `Hearthstone_Data`).

## Using it

The overlays are **locked** by default: clicks go straight through to the game. Unlock them to drag and resize them, then lock them again.

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+H` | Show / hide the overlays |
| `Ctrl+Shift+L` | Lock / unlock the overlays |

Closing the control window keeps HSIntellect running in the tray. Use the tray menu to reopen it, toggle the overlays, turn **Start at login** on or off, or quit.

The control window also has settings for opacity, scale, draw chance, card previews, and showing overlays outside of games.

### Updating

A packaged app is a snapshot of the code when it was built. To update, build again and replace the AppImage (or reinstall the `.deb`). Settings, match history and the card cache are kept, because they live separately from the app:

- Linux: `~/.config/hsintellect`
- Windows: `%APPDATA%\hsintellect`
- macOS: `~/Library/Application Support/hsintellect`

## How it works

With logging enabled in `log.config`, Hearthstone writes a new `Logs/Hearthstone_<timestamp>/` folder each time it launches. HSIntellect follows two files in the newest one:

- **`Power.log`**: every change in the game. Each card is an entity that is revealed, moved between zones (deck, hand, play, graveyard…), transformed, and so on. The tracker rebuilds this state to work out which cards have left each deck. When the app starts mid-game, it replays the log to catch up.
- **`Decks.log`**: the deck you queued with, including its name.

Only the `[Power]` and `[Decks]` sections of `log.config` are touched; any other log settings you have are left alone.

Card names, costs and art come from [HearthstoneJSON](https://hearthstonejson.com). The card data is cached for a day and refreshed automatically when an unknown card shows up (e.g. after a patch), or manually with **Card database → Refresh now**.

## Development

Requires Node.js 22+.

```sh
npm install
npm start          # run from source
npm test           # run the tests
npm run icons      # regenerate the PNG icons from build/icon.svg
npm run dist:linux # build the AppImage and .deb into dist/
```

Running from source and the packaged app share the same settings folder.

### Project structure

```
src/
  main.js                 Electron main process: windows, IPC, wiring it all together
  hearthstone/
    gameTracker.js        Rebuilds game state from Power.log
    decksLog.js           Finds the queued deck in Decks.log
    logWatcher.js         Follows the newest log folder
    logConfig.js          Enables the logs we need in log.config
  deck/
    deckParser.js         Decodes deck codes
    cardDatabase.js       Card data from HearthstoneJSON, cached locally
  windows/                Overlay, control, card preview and tray
  ui/                     HTML/CSS/JS for each window
  utils/
    path.js               Finds Hearthstone on each platform
    autostart.js          Start at login
test/                     Tests, with anonymized real logs in fixtures/
build/                    App icon source
scripts/                  Icon generator
```

### Tests

The tracker is tested against trimmed copies of real `Power.log` files (in `test/fixtures/`, with BattleTags and account IDs replaced by placeholders) and small synthetic games for specific cases. These tests catch it if a Hearthstone patch changes the log format.

## License

ISC

HSIntellect is not affiliated with or endorsed by Blizzard Entertainment. Hearthstone is a trademark of Blizzard Entertainment, Inc.
