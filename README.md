# Picture Pen

A calm, reward-based writing app for a young autistic learner who loves pictures.
Built as an **Android app for a Lenovo tablet with a stylus**.

**Trace a number → see one picture → see and hear its spelling.**

| | |
|---|---|
| **Android app (APK)** | `docs/download/picture-pen.apk` |
| **Presentation** (research, design, mock screens, plan) | `docs/index.html`, published with GitHub Pages |
| **App source** | `app/` (Capacitor project: `app/www` is the app, `app/android` the native shell) |

## What the app does

- **Numbers 1–9 first.** Capital letters A–Z are built in, and you switch them on in the Grown-ups area when he's ready.
- **Errorless tracing.** The blue ink only moves forward along the correct path. If the pen wanders, the ink waits; there are no "wrong" sounds. A dot can demonstrate each stroke ("Show me"), and the voice says each number.
- **One picture per success.** After each turn he sees exactly one picture, with its word in big letter tiles, read out and spelled ("Elephant! E, L, E, P, H, A, N, T"). The 300 everyday pictures come in a shuffled order, and none repeats until all 300 have been seen. There is no picture bank for him to pick from.
- **Grows with him (7 levels).** Level 1 is one very big number with lots of room to wander. As he masters each level, the room shrinks, the numbers get smaller, and more appear per screen (up to 4). The level moves up after 5 turns averaging 4★, and steps back after 3 turns under 2★. Changes only happen between sessions. You can also fix the level yourself.
- **Stars per character, for you.** Each try is scored 1–5★ from how closely the pen followed the path (compared with the room at his level), minus a little each time it wandered right off or needed "Show me". The Grown-ups area shows each character's average over the last 5 tries, a trend arrow, "Doing well / Needs practice" lists, his level, and the recent session history.
- **Made for a stylus.** A palm guard ignores fingers and a resting palm while the pen is in use, and a ring shows where the pen is hovering.
- **Safe and private.** Full screen, the back button is ignored on his screens, and the Grown-ups area needs a 2-second press on the gear. Works fully offline. No ads, no accounts, and no data leaves the tablet.

## Install on the Lenovo tablet

1. Copy `docs/download/picture-pen.apk` to the tablet, or download it from the GitHub Pages site.
2. Open it and allow installs from that source. Android may warn that it's not from the Play Store; tap *Install anyway*.
3. In Settings, search for **App pinning** and turn it on. Then pin Picture Pen so he stays inside the app.

This is a debug-signed build. A future build made on another computer may need the old app uninstalled first, which resets his stars. To avoid that, set up one permanent signing key and use it for every build.

## Build the APK yourself

You need Node 20+, Java 21 and the Android SDK. Android Studio installs the SDK and asks you to accept its licence.

```bash
cd app
npm install
npm run android:build
# → app/android/app/build/outputs/apk/debug/app-debug.apk
```

Pictures and words live in `app/www/rewards.js`, number and letter shapes in `app/www/letters.js`, and levels and scoring at the top of `app/www/app.js`.
After changing anything in `app/www`, run `npm run android:build` again.

To check the screens quickly on a computer: `cd app/www && python3 -m http.server 8000`, then open http://localhost:8000. In a browser, speech uses the browser's own voice.

## Publish the presentation (GitHub Pages)

Settings → Pages → *Build and deployment* → Source: **Deploy from a branch** → pick this branch and the **`/docs`** folder → Save.
The presentation will be at `https://kiaanwankhede.github.io/Kiaan_Writing/` and the APK at `…/download/picture-pen.apk`.

## Credits

- Pictures: [Twemoji](https://github.com/jdecked/twemoji) by Twitter/X and contributors, CC BY 4.0.
- Fonts: Nunito and Nunito Sans, SIL Open Font License.
