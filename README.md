# Learn2Write

A calm, reward-based writing app for a young autistic learner who loves pictures.
Built as an **Android app for a Lenovo tablet with a stylus**.

**Trace a number → see one picture → see and hear its spelling.**

| | |
|---|---|
| **Android app (APK)** | `docs/download/learn2write.apk` |
| **Presentation** (research, design, mock screens, plan) | `docs/index.html`, published with GitHub Pages |
| **App source** | `app/` (Capacitor project: `app/www` is the app, `app/android` the native shell) |

## What the app does

- **Numbers 1–9 first.** Capital letters A–Z are built in, and you switch them on in the Grown-ups area when he's ready.
- **Tracing in whole strokes.** The blue ink only moves forward along the correct path. If he lifts the pen mid-stroke (longer than a 0.3 s bounce) or goes right off the path, the number fades and starts again from the green dot, so he practises each stroke in one smooth movement. There are no "wrong" sounds. After 3 restarts on one number, "Show me" plays and only that stroke restarts, so he can always finish. Restarts lower his stars. Grown-ups can choose: start the number again (default), start that stroke again, or carry on where he stopped. A dot can demonstrate each stroke ("Show me"), and the voice says each number.
- **One picture per success.** After each turn he sees exactly one picture, with its word in big letter tiles, read out and spelled ("Elephant! E, L, E, P, H, A, N, T"). The 300 everyday pictures come in a shuffled order, and none repeats until all 300 have been seen. There is no picture bank for him to pick from.
- **Grows with him (9 levels).** Level 1 is one very big number with lots of room to wander. As he masters each level, the room shrinks, the numbers get smaller, and more appear per screen (up to 4). The level moves up after 5 turns averaging 4★, and steps back after 3 turns under 2★. Changes only happen between sessions. You can also fix the level yourself.
- **Free writing (Levels 8–9).** No path: he copies a model shown on the left, on writing lines, in pencil-look ink that darkens with pen pressure. When he pauses, the app checks the shape with the $P point-cloud recognizer. If it isn't recognised, the path appears and they trace it together, so the turn still ends in success (counted as help in his stars). Level 9 is three numbers per screen at about school-paper size.
- **Stars per character, for you.** Each try is scored 1–5★ from how closely the pen followed the path (compared with the room at his level), minus a little each time it wandered right off or needed "Show me". The Grown-ups area shows each character's average over the last 5 tries, a trend arrow, "Doing well / Needs practice" lists, his level, and the recent session history.
- **Palm guard, with any stylus.** Lenovo-type pens are recognised automatically, so a resting palm is ignored and a ring shows where the pen is hovering. With a simple stylus (one that works like a finger), the app ignores palm-sized touches, and the pen always takes over from a hand that is resting but not writing. The Grown-ups area has a **touch check** pad to see how the pen and his palm are told apart on your tablet.
- **Pen pressure.** With an active pen (one that pairs with the tablet, such as the Lenovo Tab Pen), the app records how hard he presses. The Grown-ups area shows it as light, comfortable or pressing hard, overall and per character. A plain rubber-tip stylus can't sense pressure, and the app says so.
- **Paper practice.** Print a sheet (or save it as a PDF) of his weakest numbers: a model, two dotted copies with start dots, and three empty boxes per row. When he writes on paper, tap **Done on paper** in the Grown-ups area, optionally rate how it looked, and he gets his one picture, just like on the tablet. Paper ratings show next to his tablet stars.
- **Safe and private.** Full screen, the back button is ignored on his screens, and the Grown-ups area needs a 2-second press on the gear. Works fully offline. No ads, no accounts, and no data leaves the tablet.

## Road to pencil and paper

1. **Tracing with a stylus** (Levels 1–7): guides fade and characters shrink as he masters each level, and pen pressure is measured.
2. **Free writing** (Levels 8–9): copy a model with no path, in pencil-look ink, ending at school-paper size.
3. **Paper turns:** printable sheets of his weakest characters. When he writes one on paper, a grown-up taps "Done on paper" and he gets his one picture, the same as on the tablet.
4. **Alongside:** a short, chunky or triangular pencil, and his OT checking grip and pressure.

## Install on the Lenovo tablet

1. Copy `docs/download/learn2write.apk` to the tablet, or download it from the GitHub Pages site. It installs over the earlier "Picture Pen" version and keeps his stars.
2. Open it and allow installs from that source. Android may warn that it's not from the Play Store; tap *Install anyway*.
3. In Settings, search for **App pinning** and turn it on. Then pin Learn2Write so he stays inside the app.

This is a debug-signed build. A future build made on another computer may need the old app uninstalled first, which resets his stars. To avoid that, set up one permanent signing key and use it for every build.

## Build the APK yourself

You need Node 20+, Java 21 and the Android SDK. Android Studio installs the SDK and asks you to accept its licence.

```bash
cd app
npm install
npm run android:build
# → app/android/app/build/outputs/apk/debug/app-debug.apk
```

Pictures and words live in `app/www/rewards.js`, number and letter shapes in `app/www/letters.js`, and levels, scoring and the shape check in `app/www/app.js`.
After changing anything in `app/www`, run `npm run android:build` again.

To check the screens quickly on a computer: `cd app/www && python3 -m http.server 8000`, then open http://localhost:8000. In a browser, speech uses the browser's own voice.

## Presentation website (GitHub Pages)

Live at **https://kiaanwankhede.github.io/Kiaan_Writing/**, with the Android app at
**https://kiaanwankhede.github.io/Kiaan_Writing/download/learn2write.apk**.

The site is served from the `gh-pages` branch, which is a copy of the `docs/` folder. After changing anything in `docs/`, commit it and publish with:

```bash
git subtree push --prefix docs origin gh-pages
```

## Credits

- Pictures: [Twemoji](https://github.com/jdecked/twemoji) by Twitter/X and contributors, CC BY 4.0.
- Fonts: Nunito and Nunito Sans, SIL Open Font License.
