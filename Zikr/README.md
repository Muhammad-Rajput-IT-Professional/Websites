# Dhikr Counter

A simple static web app that counts dhikr repetitions from microphone input.

The current version uses personalized keyword spotting instead of speech recognition. The user can name any dhikr phrase, then records one natural, one slow, and one fast example during a quick voice setup. The app converts them into temporary MFCC sound fingerprints, then compares rolling microphone windows at several speeds while the user continues speaking.

Audio and fingerprints remain in memory and are discarded on refresh. Nothing is recorded, saved, or uploaded. The app has no paid services or custom backend and can be hosted on GitHub Pages. Browser support is best in current Chrome or Edge; microphone access requires HTTPS (as provided by GitHub Pages) or `localhost`.

## Run locally

Serve the directory over HTTP so mobile browsers allow microphone access:

```powershell
node dev-server.js
```

Then open `http://localhost:5173`.

For phone testing, deploy the folder to GitHub Pages or another HTTPS static host. A plain local-network IP address is not treated as a secure context, so mobile browsers normally block its microphone access.

## Tuning

Calibration, rolling-window matching, and timing values are implemented in `app.js`. MFCC audio features are extracted locally with the MIT-licensed Meyda browser library.
