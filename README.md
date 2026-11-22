# Picture Pen

A calm, reward-based writing app for a young autistic learner who loves pictures.

**Write a letter → see one picture → see and hear its spelling.**

| | |
|---|---|
| **Presentation** (research, design principles, mock screens, app plan) | `docs/index.html`, published with GitHub Pages |
| **The app** (Android + iPad/iPhone) | `app/` (a Capacitor project) |

## What the app does

- **Errorless tracing.** 26 capital letters plus 4 warm-up strokes (│ — ○ +). The blue ink only moves forward along the right path. If his finger wanders, the ink waits; there are no "wrong" sounds.
- **One picture per success.** Each finished letter shows one picture (A → Apple). The word appears in big letter tiles, and a voice says "A is for Apple. A, P, P, L, E. Apple!"
- **Predictable routine.** The start screen shows *First write → Then picture*. Stars show the turns left, and "All done" gives a clear finish.
- **Picture book.** All 30 earned pictures to collect and revisit.
- **Grown-ups area.** Opens with a 2-second press and hold. It shows progress per letter and lets you set the practice set, turns per session, tracing room, guide strength, demo, voice, chimes and calm motion. You can also put **your own photos** in as rewards (e.g. T → his toy train).
- **Private.** Works offline. No ads, no purchases, no accounts, and no data leaves the device.

## Project layout

```
app/                    Capacitor app (Android + iOS)
  www/                  the app itself: index.html, app.css, app.js, letters.js, img/, fonts/
  android/              native Android project (generated, committed)
  ios/                  native iOS project (generated, committed)
  assets/               icon + splash sources
docs/                   GitHub Pages site: the presentation
  index.html
  assets/               deck styles/script, screenshots of the real app, pictures
```

Letter shapes and reward words live in `app/www/letters.js`. Change a word or picture there.

## Build the Android app (APK)

You need Node 20+, Java 21 and the Android SDK. The easiest way to get the SDK is to install Android Studio, which also asks you to accept the Android SDK licence.

```bash
cd app
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
# → app/android/app/build/outputs/apk/debug/app-debug.apk
```

Copy `app-debug.apk` to the tablet, open it, and allow installs from that source.
Then turn on **App pinning** (Settings → Security → App pinning) so he stays inside the app.

## Build for iPad / iPhone

You need a Mac with Xcode.

```bash
cd app
npm install
npx cap sync ios
npx cap open ios
```

In Xcode, sign in with your Apple ID, pick the iPad and press Run. With a free Apple ID the app must be reinstalled every 7 days; TestFlight and the App Store need a paid Apple Developer account.
Turn on **Guided Access** (Settings → Accessibility → Guided Access) to lock the iPad to the app.

## Quick check in a desktop browser (development only)

```bash
cd app/www && python3 -m http.server 8000   # open http://localhost:8000
```

Speech uses the browser's voice here. In the app it uses the tablet's text-to-speech engine.

## Publish the presentation (GitHub Pages)

Settings → Pages → *Build and deployment* → Source: **Deploy from a branch** → pick this branch and the **`/docs`** folder → Save.
After a minute the presentation is live at `https://kiaanwankhede.github.io/Kiaan_Writing/`.

## Credits

- Pictures: [Twemoji](https://github.com/jdecked/twemoji) by Twitter/X and contributors, CC BY 4.0.
- Fonts: Nunito and Nunito Sans, SIL Open Font License.
