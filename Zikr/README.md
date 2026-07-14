# Dhikr Counter

A simple static web app that counts dhikr repetitions from microphone input.

The current version uses personalized keyword spotting instead of speech recognition. It includes Arabic presets for Astaghfirullah and SubhanAllahi wa bihamdihi, plus a custom phrase option. For each dhikr, the user records one natural, one slow, and one fast example during a quick voice setup. The setup can be restarted at any point. The app converts the examples into MFCC sound fingerprints, then compares rolling microphone windows at several speeds while the user continues speaking.

Each dhikr can also have its own target count. Reaching the target plays a short local chime, vibrates supported phones, and displays a completion message.

The counter can be set to a custom starting value or adjusted one count at a time with the minus and plus controls. Manual changes are saved with the selected dhikr profile.

During listening, a short silence clears the rolling comparison window. This prevents a later keyboard tap, movement, or other sound from retriggering the last valid phrase.

Fast repetitions are analyzed from shorter rolling windows and do not require a long pause between phrases. The natural, slow, and fast setup examples remain important because they define the user's expected range.

An optional four-second background setup can learn a sustained environmental noise level, such as steady wind. It stores only the derived numeric level, not audio. The setup should be redone or cleared when the environment changes; unpredictable gusts can still affect accuracy.

On browsers that support the Screen Wake Lock API, the display is kept awake while the counter is listening. The lock is released when listening stops and reacquired when an active listening tab becomes visible again. This requires HTTPS or `localhost`.

The site is an installable PWA with a local manifest, icons, and an offline app shell. Its Install app button opens the native browser prompt when available and gives Add to Home Screen instructions on iPhone and other browsers without a programmatic prompt.

First-time visitors see an accuracy notice explaining that a quiet environment and consistent microphone distance improve results, but local sound-pattern matching can still miss or add counts.

Audio is never recorded, saved, or uploaded. Counts and derived sound fingerprints are stored in the browser's local storage so each phrase remains ready after refresh. The data stays on that browser and device and is removed if the user clears site data. The app has no paid services or custom backend and can be hosted on GitHub Pages. Browser support is best in current Chrome or Edge; microphone access requires HTTPS (as provided by GitHub Pages) or `localhost`.

## Run locally

Serve the directory over HTTP so mobile browsers allow microphone access:

```powershell
node dev-server.js
```

Then open `http://localhost:5173`.

For phone testing, deploy the folder to GitHub Pages or another HTTPS static host. A plain local-network IP address is not treated as a secure context, so mobile browsers normally block its microphone access.

## Tuning

Calibration, rolling-window matching, and timing values are implemented in `app.js`. MFCC audio features are extracted locally with the MIT-licensed Meyda browser library.
