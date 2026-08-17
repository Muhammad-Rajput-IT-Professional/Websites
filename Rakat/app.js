/**
 * Rakat Tracker Engine (v13 - Robust 3-Phase Salah State Machine)
 *
 * Physical cycle in pocket:
 * 1. STANDING / QIYAM: Pitch is upright (~55° to 90°).
 * 2. SAJDAH 1: Pitch tilts forward flat (<= 38°). Must stay down for >= 800ms.
 * 3. SITTING / JALSAH: User sits between sajdahs (~40° - 65°).
 * 4. SAJDAH 2: Pitch tilts forward flat again (<= 38°). Must stay down for >= 800ms.
 * 5. SITTING (Tashahhud) or STANDING:
 *    When user rises back to STANDING (pitch >= 58° for >= 700ms) AFTER completing Sajdah 2:
 *    -> Promptly announce "Starting Rakat X"!
 */

let isTracking = false;
let rakatCount = 1;
let targetRakat = 4;

// States: 'STANDING' -> 'SAJDAH_1' -> 'BETWEEN_SAJDAHS' -> 'SAJDAH_2' -> 'READY_FOR_STAND'
let prayerState = 'STANDING';

let sajdahDownStartTime = 0;
let standingStartTime = 0;
let lastSajdahExitTime = 0;

const SAJDAH_ENTER_THRESHOLD = 38; // Thigh tilts horizontal (< 38°)
const STANDING_ENTER_THRESHOLD = 58; // Thigh upright in pocket (> 58°)
const MIN_SAJDAH_HOLD_MS = 800; // Must stay in sajdah for at least 0.8s to avoid transient leg movements
const MIN_STAND_HOLD_MS = 600; // Must stand upright for at least 0.6s to confirm actual standing up

function speak(text) {
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
    console.error("Speech synthesis error:", err);
  }
}

// Keep Screen ON via WakeLock API
let wakeLock = null;

async function requestWakeLock() {
  const silentAudio = document.getElementById('silent-audio');
  if (silentAudio) {
    try {
      silentAudio.play();
    } catch (err) {
      console.log("Silent audio play error:", err);
    }
  }

  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      const badge = document.getElementById('wake-lock-badge');
      if (badge) {
        badge.textContent = 'Screen Kept Awake';
        badge.className = 'badge badge-on';
      }
    } catch (err) {
      console.log('WakeLock error:', err);
    }
  }
}

function releaseWakeLock() {
  const silentAudio = document.getElementById('silent-audio');
  if (silentAudio) silentAudio.pause();
  if (wakeLock) {
    wakeLock.release().then(() => { wakeLock = null; });
  }
  const badge = document.getElementById('wake-lock-badge');
  if (badge) {
    badge.textContent = 'Screen Lock Off';
    badge.className = 'badge badge-off';
  }
}

function handleOrientation(event) {
  if (!isTracking) return;

  let pitch = event.beta; // Tilt front-to-back [-180, 180]
  if (pitch === null || pitch === undefined) return;

  const absPitch = Math.abs(pitch);
  const now = Date.now();

  // Update UI Meters
  const rawPitchEl = document.getElementById('raw-pitch');
  const pitchFillEl = document.getElementById('pitch-fill');
  if (rawPitchEl) rawPitchEl.textContent = `${Math.round(absPitch)}° pitch`;
  if (pitchFillEl) {
    const fillPercentage = Math.min(100, Math.max(5, (absPitch / 90) * 100));
    pitchFillEl.style.height = `${fillPercentage}%`;
  }

  const motionIndicator = document.getElementById('motion-indicator');
  const postureText = document.getElementById('posture-text');
  const sensorState = document.getElementById('sensor-state');

  const isFlat = absPitch <= SAJDAH_ENTER_THRESHOLD;
  const isUpright = absPitch >= STANDING_ENTER_THRESHOLD;

  // Phase 1: In Standing / Qiyam -> looking for Sajdah 1
  if (prayerState === 'STANDING') {
    if (isFlat) {
      if (sajdahDownStartTime === 0) sajdahDownStartTime = now;
      if (now - sajdahDownStartTime >= MIN_SAJDAH_HOLD_MS) {
        prayerState = 'SAJDAH_1';
        sajdahDownStartTime = 0;
        if (motionIndicator) motionIndicator.classList.add('active-sajdah');
        if (postureText) postureText.textContent = '🙇 SAJDAH 1';
        if (sensorState) sensorState.textContent = 'In Sajdah 1';
      }
    } else {
      sajdahDownStartTime = 0;
    }
  }

  // Phase 2: In Sajdah 1 -> looking for rising into sitting / Jalsah
  else if (prayerState === 'SAJDAH_1') {
    if (!isFlat) {
      // User sat up from Sajdah 1
      prayerState = 'BETWEEN_SAJDAHS';
      lastSajdahExitTime = now;
      if (motionIndicator) motionIndicator.classList.remove('active-sajdah');
      if (postureText) postureText.textContent = '🧎 SITTING (JALSAH)';
      if (sensorState) sensorState.textContent = 'Sitting between Sajdahs';
    }
  }

  // Phase 3: In Sitting / Between Sajdahs -> looking for Sajdah 2
  else if (prayerState === 'BETWEEN_SAJDAHS') {
    // Cooldown of at least 800ms before accepting Sajdah 2
    if (isFlat && (now - lastSajdahExitTime > 800)) {
      if (sajdahDownStartTime === 0) sajdahDownStartTime = now;
      if (now - sajdahDownStartTime >= MIN_SAJDAH_HOLD_MS) {
        prayerState = 'SAJDAH_2';
        sajdahDownStartTime = 0;
        if (motionIndicator) motionIndicator.classList.add('active-sajdah');
        if (postureText) postureText.textContent = '🙇 SAJDAH 2';
        if (sensorState) sensorState.textContent = 'In Sajdah 2';
      }
    } else {
      sajdahDownStartTime = 0;
    }
  }

  // Phase 4: In Sajdah 2 -> looking for rising (into sitting or standing)
  else if (prayerState === 'SAJDAH_2') {
    if (!isFlat) {
      prayerState = 'READY_FOR_STAND';
      standingStartTime = 0;
      if (motionIndicator) motionIndicator.classList.remove('active-sajdah');
      if (postureText) postureText.textContent = '⏳ COMPLETED 2 SAJDAHS';
      if (sensorState) sensorState.textContent = 'Waiting for Standing Up';
    }
  }

  // Phase 5: Ready for standing -> User is either in Tashahhud or getting up
  else if (prayerState === 'READY_FOR_STAND') {
    if (isUpright) {
      if (standingStartTime === 0) standingStartTime = now;
      if (now - standingStartTime >= MIN_STAND_HOLD_MS) {
        // CONFIRMED FULL STANDING UP FOR NEXT RAKAT!
        onStandingUpForNextRakat();
      }
    } else {
      standingStartTime = 0;
    }
  }
}

function onStandingUpForNextRakat() {
  const targetSelect = document.getElementById('target-rakat');
  targetRakat = targetSelect ? parseInt(targetSelect.value, 10) : 4;

  if (rakatCount < targetRakat) {
    rakatCount++;
    prayerState = 'STANDING';
    sajdahDownStartTime = 0;
    standingStartTime = 0;

    const rakatDisplay = document.getElementById('rakat-display');
    if (rakatDisplay) rakatDisplay.textContent = rakatCount;

    const postureText = document.getElementById('posture-text');
    if (postureText) postureText.textContent = '🧍 STANDING UPRIGHT';

    const sensorState = document.getElementById('sensor-state');
    if (sensorState) sensorState.textContent = `Rakat ${rakatCount} Started`;

    speak(`Starting Rakat ${rakatCount}`);
  } else {
    speak("Prayer complete");
    stopTracking();
  }
}

// Sensor Permission & Tracking Handler
function startTracking() {
  if (isTracking) {
    stopTracking();
    return;
  }

  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(response => {
      if (response === 'granted') {
        enableTrackingEngine();
      } else {
        alert('Permission to access motion sensors was denied.');
      }
    }).catch(error => {
      console.error('DeviceOrientation permission error:', error);
      enableTrackingEngine();
    });
  } else {
    enableTrackingEngine();
  }
}

function enableTrackingEngine() {
  isTracking = true;
  prayerState = 'STANDING';
  sajdahDownStartTime = 0;
  standingStartTime = 0;
  lastSajdahExitTime = 0;

  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    startBtn.classList.add('active');
    startBtn.innerHTML = '<span class="btn-icon">⏹</span> Stop Tracking';
  }
  
  const badge = document.getElementById('sensor-badge');
  if (badge) {
    badge.textContent = 'Sensor Active';
    badge.className = 'badge badge-on';
  }

  // Initial 3.5-second placement grace period
  setTimeout(() => {
    window.addEventListener('deviceorientation', handleOrientation, true);
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
  }, 3500);

  requestWakeLock().catch(e => console.log(e));
  speak("Tracking started. Place phone in pocket.");
}

function stopTracking() {
  window.removeEventListener('deviceorientation', handleOrientation, true);
  window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
  isTracking = false;
  releaseWakeLock();

  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    startBtn.classList.remove('active');
    startBtn.innerHTML = '<span class="btn-icon">▶</span> Start Tracking';
  }

  const badge = document.getElementById('sensor-badge');
  if (badge) {
    badge.textContent = 'Sensor Standby';
    badge.className = 'badge badge-off';
  }
}

function resetCounter() {
  rakatCount = 1;
  prayerState = 'STANDING';
  sajdahDownStartTime = 0;
  standingStartTime = 0;
  lastSajdahExitTime = 0;

  const rakatDisplay = document.getElementById('rakat-display');
  if (rakatDisplay) rakatDisplay.textContent = '1';

  const motionIndicator = document.getElementById('motion-indicator');
  if (motionIndicator) motionIndicator.classList.remove('active-sajdah');

  const postureText = document.getElementById('posture-text');
  if (postureText) postureText.textContent = 'Standing / Upright';

  if (isTracking) {
    speak("Counter reset");
  }
}

// Initializer
document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('start-btn');
  const resetBtn = document.getElementById('reset-btn');
  const targetRakatSelect = document.getElementById('target-rakat');

  if (startBtn) startBtn.addEventListener('click', startTracking);
  if (resetBtn) resetBtn.addEventListener('click', resetCounter);
  if (targetRakatSelect) {
    targetRakatSelect.addEventListener('change', (e) => {
      targetRakat = parseInt(e.target.value, 10);
    });
  }
});
