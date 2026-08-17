/**
 * Mat Selfie Mode - Camera Proximity & Salah State Machine (v14)
 *
 * Placed in middle of prayer mat facing up:
 * 1. STANDING / DISTANT: Camera has clear view of ceiling / room (Proximity Low).
 * 2. SAJDAH 1: Body/Torso moves directly over camera (High Proximity Occlusion >= 65% for >= 800ms).
 * 3. SITTING (JALSAH): Body moves back into sitting posture (Proximity Low).
 * 4. SAJDAH 2: Body moves over camera again (High Proximity >= 65% for >= 800ms).
 * 5. READY_FOR_STAND / SITTING: User finishes Sajdah 2.
 * 6. STANDING UP: Camera sees clear unobstructed view for >= 600ms
 *    -> Announce "Starting Rakat X"!
 */

let isSelfieTracking = false;
let selfieRakatCount = 1;
let selfieTargetRakat = 4;
let selfiePrayerState = 'STANDING'; // 'STANDING' -> 'SAJDAH_1' -> 'BETWEEN_SAJDAHS' -> 'SAJDAH_2' -> 'READY_FOR_STAND'

let selfieVideoStream = null;
let selfieAnimationId = null;

let selfieSajdahDownStartTime = 0;
let selfieStandingStartTime = 0;
let selfieLastSajdahExitTime = 0;

let baselineLuminance = null;
let baselineFrames = 0;

// Settings
let proximityThreshold = 0.55; // 55% light drop or frame difference
const MIN_SELFIE_SAJDAH_HOLD_MS = 800;
const MIN_SELFIE_STAND_HOLD_MS = 600;

function speakSelfie(text) {
  try {
    const audioToggle = document.getElementById('audio-toggle');
    const audioEnabled = audioToggle ? audioToggle.checked : true;
    if (!audioEnabled || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error("Speech synthesis error in selfie mode:", err);
  }
}

// Tab Switching Handling
document.addEventListener('DOMContentLoaded', () => {
  const tabPocket = document.getElementById('tab-pocket');
  const tabSelfie = document.getElementById('tab-selfie');
  const pocketView = document.getElementById('pocket-view');
  const selfieView = document.getElementById('selfie-view');

  if (tabPocket && tabSelfie) {
    tabPocket.addEventListener('click', () => {
      tabPocket.classList.add('active');
      tabSelfie.classList.remove('active');
      pocketView.style.display = 'block';
      selfieView.style.display = 'none';

      // If selfie mode was running, stop it
      if (isSelfieTracking) stopSelfieTracking();
    });

    tabSelfie.addEventListener('click', () => {
      tabSelfie.classList.add('active');
      tabPocket.classList.remove('active');
      selfieView.style.display = 'block';
      pocketView.style.display = 'none';

      // If pocket mode was running, stop it via its stop function
      if (typeof stopTracking === 'function' && typeof isTracking !== 'undefined' && isTracking) {
        stopTracking();
      }
    });
  }

  // Button Listeners for Selfie Mode
  const selfieStartBtn = document.getElementById('selfie-start-btn');
  const selfieResetBtn = document.getElementById('selfie-reset-btn');
  const selfieTargetSelect = document.getElementById('selfie-target-rakat');
  const sensitivitySelect = document.getElementById('proximity-sensitivity');

  if (selfieStartBtn) selfieStartBtn.addEventListener('click', toggleSelfieTracking);
  if (selfieResetBtn) selfieResetBtn.addEventListener('click', resetSelfieCounter);
  if (selfieTargetSelect) {
    selfieTargetSelect.addEventListener('change', (e) => {
      selfieTargetRakat = parseInt(e.target.value, 10);
    });
  }
  if (sensitivitySelect) {
    sensitivitySelect.addEventListener('change', (e) => {
      if (e.target.value === 'high') proximityThreshold = 0.40;
      else if (e.target.value === 'low') proximityThreshold = 0.70;
      else proximityThreshold = 0.55;
    });
  }
});

async function toggleSelfieTracking() {
  if (isSelfieTracking) {
    stopSelfieTracking();
  } else {
    await startSelfieTracking();
  }
}

async function startSelfieTracking() {
  const video = document.getElementById('selfie-video');
  const canvas = document.getElementById('selfie-canvas');
  const startBtn = document.getElementById('selfie-start-btn');
  const badge = document.getElementById('sensor-badge');
  const cameraStatus = document.getElementById('camera-status-text');

  try {
    // Request front-facing camera
    selfieVideoStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 320 },
        height: { ideal: 240 }
      },
      audio: false
    });

    if (video) {
      video.srcObject = selfieVideoStream;
      await video.play();
    }

    isSelfieTracking = true;
    selfiePrayerState = 'STANDING';
    selfieSajdahDownStartTime = 0;
    selfieStandingStartTime = 0;
    selfieLastSajdahExitTime = 0;
    baselineLuminance = null;
    baselineFrames = 0;

    if (startBtn) {
      startBtn.classList.add('active');
      startBtn.innerHTML = '<span class="btn-icon">⏹</span> Stop Selfie Tracking';
    }
    if (badge) {
      badge.textContent = 'Camera Active';
      badge.className = 'badge badge-on';
    }
    if (cameraStatus) cameraStatus.textContent = 'Calibrating room light...';

    // Request wake lock so screen stays on on the mat
    if (typeof requestWakeLock === 'function') {
      requestWakeLock().catch(e => console.log(e));
    }

    speakSelfie("Selfie tracking started. Place phone on mat.");

    // Start video processing loop
    processCameraFrame();

  } catch (err) {
    console.error("Camera access error:", err);
    alert("Could not access selfie camera. Please ensure camera permissions are allowed in your browser.");
    stopSelfieTracking();
  }
}

function stopSelfieTracking() {
  isSelfieTracking = false;

  if (selfieVideoStream) {
    selfieVideoStream.getTracks().forEach(track => track.stop());
    selfieVideoStream = null;
  }

  if (selfieAnimationId) {
    cancelAnimationFrame(selfieAnimationId);
    selfieAnimationId = null;
  }

  const startBtn = document.getElementById('selfie-start-btn');
  if (startBtn) {
    startBtn.classList.remove('active');
    startBtn.innerHTML = '<span class="btn-icon">📷</span> Start Selfie Tracking';
  }

  const badge = document.getElementById('sensor-badge');
  if (badge) {
    badge.textContent = 'Standby';
    badge.className = 'badge badge-off';
  }

  const cameraStatus = document.getElementById('camera-status-text');
  if (cameraStatus) cameraStatus.textContent = 'Camera Standby';

  const motionIndicator = document.getElementById('selfie-motion-indicator');
  if (motionIndicator) motionIndicator.classList.remove('active-sajdah');

  const postureText = document.getElementById('selfie-posture-text');
  if (postureText) postureText.textContent = 'Standing / Distant';
}

function resetSelfieCounter() {
  selfieRakatCount = 1;
  selfiePrayerState = 'STANDING';
  selfieSajdahDownStartTime = 0;
  selfieStandingStartTime = 0;
  selfieLastSajdahExitTime = 0;

  const rakatDisplay = document.getElementById('selfie-rakat-display');
  if (rakatDisplay) rakatDisplay.textContent = '1';

  const motionIndicator = document.getElementById('selfie-motion-indicator');
  if (motionIndicator) motionIndicator.classList.remove('active-sajdah');

  const postureText = document.getElementById('selfie-posture-text');
  if (postureText) postureText.textContent = 'Standing / Distant';

  const rawProxEl = document.getElementById('selfie-raw-prox');
  if (rawProxEl) rawProxEl.textContent = '0%';

  if (isSelfieTracking) {
    speakSelfie("Counter reset");
  }
}

/**
 * Optical Proximity & Occlusion Detection Algorithm
 * Computes average brightness (luminance) of the front camera.
 * When standing/sitting, room ceiling light reaches camera (High Baseline Luminance).
 * When body descends into Sajdah right above phone, proximity blocks ~60-90% of light (High Proximity Occlusion).
 */
function processCameraFrame() {
  if (!isSelfieTracking) return;

  const video = document.getElementById('selfie-video');
  const canvas = document.getElementById('selfie-canvas');

  if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = 64;  // Sample small thumbnail for maximum FPS & zero CPU lag
    canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    let totalLuminance = 0;
    const pixelCount = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      // Standard perceptual luminance formula: 0.299*R + 0.587*G + 0.114*B
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      totalLuminance += lum;
    }

    const avgLuminance = totalLuminance / pixelCount;

    // Establish dynamic baseline for room lighting during first 20 frames
    if (baselineLuminance === null || baselineFrames < 20) {
      baselineLuminance = baselineLuminance === null ? avgLuminance : (baselineLuminance * 0.8 + avgLuminance * 0.2);
      baselineFrames++;
      document.getElementById('camera-status-text').textContent = 'Tracking Active';
    } else {
      // Slowly adapt baseline when clearly uncovered/distant (to account for natural daylight shift)
      if (avgLuminance >= baselineLuminance * 0.85) {
        baselineLuminance = baselineLuminance * 0.98 + avgLuminance * 0.02;
      }
    }

    // Calculate proximity occlusion: 0% = far away/open light, 100% = completely covered by body
    const lightDrop = Math.max(0, baselineLuminance - avgLuminance);
    const proximityRatio = baselineLuminance > 5 ? (lightDrop / baselineLuminance) : (avgLuminance < 15 ? 0.9 : 0.1);
    const proximityPercent = Math.min(100, Math.round(proximityRatio * 100));

    // Update Proximity UI elements
    const rawProxEl = document.getElementById('selfie-raw-prox');
    const proxFill = document.getElementById('selfie-proximity-fill');
    const proxMetric = document.getElementById('proximity-metric');
    if (rawProxEl) rawProxEl.textContent = `${proximityPercent}%`;
    if (proxFill) proxFill.style.height = `${Math.max(5, proximityPercent)}%`;
    if (proxMetric) proxMetric.textContent = `Proximity: ${proximityPercent}%`;

    // Process Salah Lifecycle
    evaluateSelfiePrayerLogic(proximityRatio);
  }

  selfieAnimationId = requestAnimationFrame(processCameraFrame);
}

function evaluateSelfiePrayerLogic(proximityRatio) {
  const now = Date.now();
  const motionIndicator = document.getElementById('selfie-motion-indicator');
  const postureText = document.getElementById('selfie-posture-text');
  const sensorState = document.getElementById('selfie-sensor-state');

  const isCovered = proximityRatio >= proximityThreshold;
  const isClear = proximityRatio < (proximityThreshold * 0.65);

  // Phase 1: Standing -> looking for Sajdah 1
  if (selfiePrayerState === 'STANDING') {
    if (isCovered) {
      if (selfieSajdahDownStartTime === 0) selfieSajdahDownStartTime = now;
      if (now - selfieSajdahDownStartTime >= MIN_SELFIE_SAJDAH_HOLD_MS) {
        selfiePrayerState = 'SAJDAH_1';
        selfieSajdahDownStartTime = 0;
        if (motionIndicator) motionIndicator.classList.add('active-sajdah');
        if (postureText) postureText.textContent = '🙇 SAJDAH 1 (PROXIMITY)';
        if (sensorState) sensorState.textContent = 'In Sajdah 1';
      }
    } else {
      selfieSajdahDownStartTime = 0;
    }
  }

  // Phase 2: In Sajdah 1 -> looking for rising into sitting / Jalsah
  else if (selfiePrayerState === 'SAJDAH_1') {
    if (isClear) {
      selfiePrayerState = 'BETWEEN_SAJDAHS';
      selfieLastSajdahExitTime = now;
      if (motionIndicator) motionIndicator.classList.remove('active-sajdah');
      if (postureText) postureText.textContent = '🧎 SITTING (JALSAH)';
      if (sensorState) sensorState.textContent = 'Sitting between Sajdahs';
    }
  }

  // Phase 3: In Sitting -> looking for Sajdah 2
  else if (selfiePrayerState === 'BETWEEN_SAJDAHS') {
    if (isCovered && (now - selfieLastSajdahExitTime > 800)) {
      if (selfieSajdahDownStartTime === 0) selfieSajdahDownStartTime = now;
      if (now - selfieSajdahDownStartTime >= MIN_SELFIE_SAJDAH_HOLD_MS) {
        selfiePrayerState = 'SAJDAH_2';
        selfieSajdahDownStartTime = 0;
        if (motionIndicator) motionIndicator.classList.add('active-sajdah');
        if (postureText) postureText.textContent = '🙇 SAJDAH 2 (PROXIMITY)';
        if (sensorState) sensorState.textContent = 'In Sajdah 2';
      }
    } else {
      selfieSajdahDownStartTime = 0;
    }
  }

  // Phase 4: In Sajdah 2 -> looking for rising
  else if (selfiePrayerState === 'SAJDAH_2') {
    if (isClear) {
      selfiePrayerState = 'READY_FOR_STAND';
      selfieStandingStartTime = 0;
      if (motionIndicator) motionIndicator.classList.remove('active-sajdah');
      if (postureText) postureText.textContent = '⏳ COMPLETED 2 SAJDAHS';
      if (sensorState) sensorState.textContent = 'Waiting for Standing Up';
    }
  }

  // Phase 5: Ready for stand -> confirms camera is clear for standing duration
  else if (selfiePrayerState === 'READY_FOR_STAND') {
    if (isClear) {
      if (selfieStandingStartTime === 0) selfieStandingStartTime = now;
      if (now - selfieStandingStartTime >= MIN_SELFIE_STAND_HOLD_MS) {
        onSelfieStandingUpForNextRakat();
      }
    } else {
      selfieStandingStartTime = 0;
    }
  }
}

function onSelfieStandingUpForNextRakat() {
  const targetSelect = document.getElementById('selfie-target-rakat');
  selfieTargetRakat = targetSelect ? parseInt(targetSelect.value, 10) : 4;

  if (selfieRakatCount < selfieTargetRakat) {
    selfieRakatCount++;
    selfiePrayerState = 'STANDING';
    selfieSajdahDownStartTime = 0;
    selfieStandingStartTime = 0;

    const rakatDisplay = document.getElementById('selfie-rakat-display');
    if (rakatDisplay) rakatDisplay.textContent = selfieRakatCount;

    const postureText = document.getElementById('selfie-posture-text');
    if (postureText) postureText.textContent = '🧍 STANDING / DISTANT';

    const sensorState = document.getElementById('selfie-sensor-state');
    if (sensorState) sensorState.textContent = `Rakat ${selfieRakatCount} Started`;

    speakSelfie(`Starting Rakat ${selfieRakatCount}`);
  } else {
    speakSelfie("Prayer complete");
    stopSelfieTracking();
  }
}
