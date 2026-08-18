/**
 * Mat Camera Mode - Camera Proximity & Salah State Machine (v15)
 *
 * Placed in middle of prayer mat facing up:
 * 1. STANDING / DISTANT: Camera has clear view of ceiling / room (Proximity Low).
 * 2. SAJDAH 1: Body/Torso moves directly over camera (High Proximity Occlusion >= 55% for >= 800ms).
 * 3. SITTING (JALSAH): Body moves back into sitting posture (Proximity Low).
 * 4. SAJDAH 2: Body moves over camera again (High Proximity >= 55% for >= 800ms).
 * 5. READY_FOR_STAND / SITTING: User finishes Sajdah 2.
 * 6. STANDING UP: Camera sees clear unobstructed view for >= 600ms
 *    -> Announce "Starting Rakat X" (if voice toggle enabled)!
 */

let isCameraTracking = false;
let cameraRakatCount = 1;
let cameraSajdahCount = 0;
let cameraTargetRakat = 4;
let cameraPrayerState = 'STANDING'; // 'STANDING' -> 'SAJDAH_1' -> 'BETWEEN_SAJDAHS' -> 'SAJDAH_2' -> 'READY_FOR_STAND'

let cameraVideoStream = null;
let cameraAnimationId = null;

let cameraSajdahDownStartTime = 0;
let cameraStandingStartTime = 0;
let cameraLastSajdahExitTime = 0;

let baselineLuminance = null;
let baselineFrames = 0;

// Settings
let proximityThreshold = 0.55; // 55% light drop or frame difference
const MIN_CAMERA_SAJDAH_HOLD_MS = 800;
const MIN_CAMERA_STAND_HOLD_MS = 600;

function speakCamera(text) {
  try {
    const audioToggle = document.getElementById('camera-audio-toggle');
    const audioEnabled = audioToggle ? audioToggle.checked : true;
    if (!audioEnabled || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error("Speech synthesis error in camera mode:", err);
  }
}

// Tab Switching Handling
document.addEventListener('DOMContentLoaded', () => {
  const tabPocket = document.getElementById('tab-pocket');
  const tabCamera = document.getElementById('tab-camera');
  const pocketView = document.getElementById('pocket-view');
  const cameraView = document.getElementById('camera-view');

  if (tabPocket && tabCamera) {
    tabPocket.addEventListener('click', () => {
      tabPocket.classList.add('active');
      tabCamera.classList.remove('active');
      pocketView.style.display = 'block';
      cameraView.style.display = 'none';

      // If camera mode was running, stop it
      if (isCameraTracking) stopCameraTracking();
    });

    tabCamera.addEventListener('click', () => {
      tabCamera.classList.add('active');
      tabPocket.classList.remove('active');
      cameraView.style.display = 'block';
      pocketView.style.display = 'none';

      // If pocket mode was running, stop it via its stop function
      if (typeof stopTracking === 'function' && typeof isTracking !== 'undefined' && isTracking) {
        stopTracking();
      }
    });
  }

  // Button Listeners for Camera Mode
  const cameraStartBtn = document.getElementById('camera-start-btn');
  const cameraResetBtn = document.getElementById('camera-reset-btn');
  const cameraTargetSelect = document.getElementById('camera-target-rakat');
  const sensitivitySelect = document.getElementById('proximity-sensitivity');

  if (cameraStartBtn) cameraStartBtn.addEventListener('click', toggleCameraTracking);
  if (cameraResetBtn) cameraResetBtn.addEventListener('click', resetCameraCounter);
  if (cameraTargetSelect) {
    cameraTargetSelect.addEventListener('change', (e) => {
      cameraTargetRakat = parseInt(e.target.value, 10);
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

async function toggleCameraTracking() {
  if (isCameraTracking) {
    stopCameraTracking();
  } else {
    await startCameraTracking();
  }
}

async function startCameraTracking() {
  const video = document.getElementById('camera-video');
  const startBtn = document.getElementById('camera-start-btn');
  const badge = document.getElementById('sensor-badge');
  const cameraStatus = document.getElementById('camera-status-text');

  try {
    // Request front-facing camera
    cameraVideoStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 320 },
        height: { ideal: 240 }
      },
      audio: false
    });

    if (video) {
      video.srcObject = cameraVideoStream;
      await video.play();
    }

    isCameraTracking = true;
    cameraPrayerState = 'STANDING';
    cameraSajdahCount = 0;
    cameraSajdahDownStartTime = 0;
    cameraStandingStartTime = 0;
    cameraLastSajdahExitTime = 0;
    baselineLuminance = null;
    baselineFrames = 0;

    updateCameraSajdahDisplay(0);

    if (startBtn) {
      startBtn.classList.add('active');
      startBtn.innerHTML = '<span class="btn-icon">⏹</span> Stop Camera Tracking';
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

    speakCamera("Camera tracking started. Place phone on mat.");

    // Start video processing loop
    processCameraFrame();

  } catch (err) {
    console.error("Camera access error:", err);
    alert("Could not access camera. Please ensure camera permissions are allowed in your browser.");
    stopCameraTracking();
  }
}

function stopCameraTracking() {
  isCameraTracking = false;

  if (cameraVideoStream) {
    cameraVideoStream.getTracks().forEach(track => track.stop());
    cameraVideoStream = null;
  }

  if (cameraAnimationId) {
    cancelAnimationFrame(cameraAnimationId);
    cameraAnimationId = null;
  }

  const startBtn = document.getElementById('camera-start-btn');
  if (startBtn) {
    startBtn.classList.remove('active');
    startBtn.innerHTML = '<span class="btn-icon">📷</span> Start Camera Tracking';
  }

  const badge = document.getElementById('sensor-badge');
  if (badge) {
    badge.textContent = 'Standby';
    badge.className = 'badge badge-off';
  }

  const cameraStatus = document.getElementById('camera-status-text');
  if (cameraStatus) cameraStatus.textContent = 'Camera Standby';

  const motionIndicator = document.getElementById('camera-motion-indicator');
  if (motionIndicator) motionIndicator.classList.remove('active-sajdah');

  const postureText = document.getElementById('camera-posture-text');
  if (postureText) postureText.textContent = 'Standing / Distant';
}

function updateCameraSajdahDisplay(count) {
  cameraSajdahCount = count;
  const sajdahDisplay = document.getElementById('camera-sajdah-display');
  if (sajdahDisplay) {
    sajdahDisplay.textContent = `${count} / 2`;
  }
}

function resetCameraCounter() {
  cameraRakatCount = 1;
  cameraSajdahCount = 0;
  cameraPrayerState = 'STANDING';
  cameraSajdahDownStartTime = 0;
  cameraStandingStartTime = 0;
  cameraLastSajdahExitTime = 0;

  const rakatDisplay = document.getElementById('camera-rakat-display');
  if (rakatDisplay) rakatDisplay.textContent = '1';

  updateCameraSajdahDisplay(0);

  const motionIndicator = document.getElementById('camera-motion-indicator');
  if (motionIndicator) motionIndicator.classList.remove('active-sajdah');

  const postureText = document.getElementById('camera-posture-text');
  if (postureText) postureText.textContent = 'Standing / Distant';

  const rawProxEl = document.getElementById('camera-raw-prox');
  if (rawProxEl) rawProxEl.textContent = '0%';

  if (isCameraTracking) {
    speakCamera("Counter reset");
  }
}

/**
 * Optical Proximity & Occlusion Detection Algorithm
 * Computes average brightness (luminance) of the front camera.
 * When standing/sitting, room ceiling light reaches camera (High Baseline Luminance).
 * When body descends into Sajdah right above phone, proximity blocks ~55-90% of light.
 */
function processCameraFrame() {
  if (!isCameraTracking) return;

  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');

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
      // Slowly adapt baseline when clearly uncovered/distant
      if (avgLuminance >= baselineLuminance * 0.85) {
        baselineLuminance = baselineLuminance * 0.98 + avgLuminance * 0.02;
      }
    }

    // Calculate proximity occlusion: 0% = far away/open light, 100% = completely covered by body
    const lightDrop = Math.max(0, baselineLuminance - avgLuminance);
    const proximityRatio = baselineLuminance > 5 ? (lightDrop / baselineLuminance) : (avgLuminance < 15 ? 0.9 : 0.1);
    const proximityPercent = Math.min(100, Math.round(proximityRatio * 100));

    // Update Proximity UI elements
    const rawProxEl = document.getElementById('camera-raw-prox');
    const proxFill = document.getElementById('camera-proximity-fill');
    const proxMetric = document.getElementById('proximity-metric');
    if (rawProxEl) rawProxEl.textContent = `${proximityPercent}%`;
    if (proxFill) proxFill.style.height = `${Math.max(5, proximityPercent)}%`;
    if (proxMetric) proxMetric.textContent = `Proximity: ${proximityPercent}%`;

    // Process Salah Lifecycle
    evaluateCameraPrayerLogic(proximityRatio);
  }

  cameraAnimationId = requestAnimationFrame(processCameraFrame);
}

function evaluateCameraPrayerLogic(proximityRatio) {
  const now = Date.now();
  const motionIndicator = document.getElementById('camera-motion-indicator');
  const postureText = document.getElementById('camera-posture-text');
  const sensorState = document.getElementById('camera-sensor-state');

  const isCovered = proximityRatio >= proximityThreshold;
  const isClear = proximityRatio < (proximityThreshold * 0.65);

  // Phase 1: Standing -> looking for Sajdah 1
  if (cameraPrayerState === 'STANDING') {
    if (isCovered) {
      if (cameraSajdahDownStartTime === 0) cameraSajdahDownStartTime = now;
      if (now - cameraSajdahDownStartTime >= MIN_CAMERA_SAJDAH_HOLD_MS) {
        cameraPrayerState = 'SAJDAH_1';
        cameraSajdahDownStartTime = 0;
        updateCameraSajdahDisplay(1);
        if (motionIndicator) motionIndicator.classList.add('active-sajdah');
        if (postureText) postureText.textContent = '🙇 SAJDAH 1 (PROXIMITY)';
        if (sensorState) sensorState.textContent = 'In Sajdah 1';
      }
    } else {
      cameraSajdahDownStartTime = 0;
    }
  }

  // Phase 2: In Sajdah 1 -> looking for rising into sitting / Jalsah
  else if (cameraPrayerState === 'SAJDAH_1') {
    if (isClear) {
      cameraPrayerState = 'BETWEEN_SAJDAHS';
      cameraLastSajdahExitTime = now;
      if (motionIndicator) motionIndicator.classList.remove('active-sajdah');
      if (postureText) postureText.textContent = '🧎 SITTING (JALSAH)';
      if (sensorState) sensorState.textContent = 'Sitting between Sajdahs';
    }
  }

  // Phase 3: In Sitting -> looking for Sajdah 2
  else if (cameraPrayerState === 'BETWEEN_SAJDAHS') {
    if (isCovered && (now - cameraLastSajdahExitTime > 800)) {
      if (cameraSajdahDownStartTime === 0) cameraSajdahDownStartTime = now;
      if (now - cameraSajdahDownStartTime >= MIN_CAMERA_SAJDAH_HOLD_MS) {
        cameraPrayerState = 'SAJDAH_2';
        cameraSajdahDownStartTime = 0;
        updateCameraSajdahDisplay(2);
        if (motionIndicator) motionIndicator.classList.add('active-sajdah');
        if (postureText) postureText.textContent = '🙇 SAJDAH 2 (PROXIMITY)';
        if (sensorState) sensorState.textContent = 'In Sajdah 2';
      }
    } else {
      cameraSajdahDownStartTime = 0;
    }
  }

  // Phase 4: In Sajdah 2 -> looking for rising
  else if (cameraPrayerState === 'SAJDAH_2') {
    if (isClear) {
      cameraPrayerState = 'READY_FOR_STAND';
      cameraStandingStartTime = 0;
      if (motionIndicator) motionIndicator.classList.remove('active-sajdah');
      if (postureText) postureText.textContent = '⏳ COMPLETED 2 SAJDAHS';
      if (sensorState) sensorState.textContent = 'Waiting for Standing Up';
    }
  }

  // Phase 5: Ready for stand -> confirms camera is clear for standing duration
  else if (cameraPrayerState === 'READY_FOR_STAND') {
    if (isClear) {
      if (cameraStandingStartTime === 0) cameraStandingStartTime = now;
      if (now - cameraStandingStartTime >= MIN_CAMERA_STAND_HOLD_MS) {
        onCameraStandingUpForNextRakat();
      }
    } else {
      cameraStandingStartTime = 0;
    }
  }
}

function onCameraStandingUpForNextRakat() {
  const targetSelect = document.getElementById('camera-target-rakat');
  cameraTargetRakat = targetSelect ? parseInt(targetSelect.value, 10) : 4;

  if (cameraRakatCount < cameraTargetRakat) {
    cameraRakatCount++;
    cameraPrayerState = 'STANDING';
    cameraSajdahDownStartTime = 0;
    cameraStandingStartTime = 0;
    updateCameraSajdahDisplay(0);

    const rakatDisplay = document.getElementById('camera-rakat-display');
    if (rakatDisplay) rakatDisplay.textContent = cameraRakatCount;

    const postureText = document.getElementById('camera-posture-text');
    if (postureText) postureText.textContent = '🧍 STANDING / DISTANT';

    const sensorState = document.getElementById('camera-sensor-state');
    if (sensorState) sensorState.textContent = `Rakat ${cameraRakatCount} Started`;

    speakCamera(`Starting Rakat ${cameraRakatCount}`);
  } else {
    speakCamera("Prayer complete");
    stopCameraTracking();
  }
}
