# Rakat & Sajdah Tracker 🕌

A progressive web app (PWA) designed to track Sajdahs and Rakats hands-free using your smartphone's **DeviceOrientation sensor** (Pitch & Tilt) and voice announcements. 

## Features
- 📱 **Pocket Sensor Detection**: Automatically detects when you go into Sajdah based on thigh tilt angle.
- 🗣 **Voice Announcements**: Speaks "1" on the first Sajdah and "2. Rakat 1 Complete" on the second Sajdah using Web Speech Synthesis API.
- ⚡ **Works Screen-Off / In Pocket**: Uses background audio keep-alive and Screen Wake Lock to ensure non-stop execution.
- 🔒 **HTTPS Ready**: Fully compatible with GitHub Pages, which provides the HTTPS context required for motion sensor APIs on iOS and Android.

## How to Host on GitHub Pages

1. **Create a GitHub Repository**:
   - Go to [GitHub New Repository](https://github.com/new).
   - Name your repository (e.g. `rakat-tracker`).

2. **Push Code to GitHub**:
   Run the following commands in your terminal:
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/rakat-tracker.git
   git push -u origin main
   ```

3. **Enable GitHub Pages**:
   - In your GitHub repo, go to **Settings** > **Pages** (under Code and automation).
   - Under **Build and deployment** -> **Source**, choose **Deploy from a branch**.
   - Select **Branch**: `main` / `/ (root)` and click **Save**.

4. **Open on Phone**:
   - Visit `https://YOUR-USERNAME.github.io/rakat-tracker/` on Safari (iPhone) or Chrome (Android).
   - Tap **"Start Tracking"**, grant motion sensor permissions if requested, place the phone vertically in your pocket, and begin your prayer!
