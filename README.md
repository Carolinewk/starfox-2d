# Starfox 2D Prototype

A self-contained browser prototype for a retro vertical shooter inspired by the SNES-era Starfox look and pacing.

## Run it

Open `index.html` directly in a browser, or serve the folder with a simple static server:

```bash
python3 -m http.server
```

Then open `http://localhost:8000`.

## Deploy to GitHub Pages

This repo includes a GitHub Actions workflow that deploys the site to GitHub Pages on every push to the `master` branch.

1. In GitHub, open `Settings > Pages`.
2. Under `Build and deployment`, set `Source` to `GitHub Actions`.
3. Push the repo to GitHub.
4. After the `Deploy to GitHub Pages` workflow finishes, the site will be available at:

```text
https://carolinewk.github.io/starfox-2d/
```

Because this is a plain static site with relative asset paths, no extra base-path configuration is needed for the project page URL above.

## Current gameplay

- Vertical scrolling space lane with pixel-art ships and rings
- Player ship movement with keyboard or pointer/touch drag
- Player shots are blue-grey pixel orbs
- Synthesized sound effects via Web Audio
- Adaptive generated music modes for standby, patrol, and boss encounters
- Enemy ships take 5 hits and cost points if they escape
- Gold rings award bonus points when you pass through them
- Enemy ships fire small fireballs
- A boss ship arrives every 60 seconds, fires large fireballs, and takes 10 hits
- The player is invincible, but enemy impacts still reduce score

## Audio hooks

`audio.js` exposes a small hook surface on `window.starfoxAudioHooks` so you can replace the generated soundtrack or connect extra systems later.

Example:

```js
window.starfoxAudioHooks.on("music-mode", (state) => console.log(state.mode));
window.starfoxAudioHooks.on("sfx", ({ name }) => console.log("sfx", name));
window.starfoxAudioHooks.setMusicMode("boss");
window.starfoxAudioHooks.playSfx("boss-incoming");
```
