# mud-hole

A browser-based text adventure (MUD-style) with a generative ambient soundtrack. Type commands to explore a small dungeon; every room has its own live-coded soundscape.

## Features

- Title screen, then a clerk registers new players on first visit
- Returning players are welcomed back and resume at their last location
- Per-room ambient audio, preloaded so room changes are instant
- Everything is stored locally in your browser; there is no server

## Tech stack

- [Lit](https://lit.dev/) for the UI (`<mud-game>` web component)
- [Strudel](https://strudel.cc/) (`@strudel/web`) for live-coded ambient audio
- IndexedDB for player persistence (name and last location)
- [Vite](https://vite.dev/) for dev server and build

## Getting started

Requires Node.js 20.19+ or 22.12+ (a Vite requirement).

```sh
npm install
npm run dev      # start the dev server
npm run build    # production build into dist/
npm run preview  # serve the production build locally
```

Click the page once to unlock audio (browsers block it until a user gesture). Then type `enter` and follow the clerk.

## Project layout

```
index.html       entry point
src/mud-game.js  game UI, rooms and command handling
src/audio.js     Strudel setup, sample preloading, ambient switching
src/db.js        IndexedDB player storage
```

## Resetting your player

Clear the `mud-hole` database in your browser's DevTools (Application → IndexedDB).

## License

See [LICENSE](LICENSE).
