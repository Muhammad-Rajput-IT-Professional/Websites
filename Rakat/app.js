/**
 * Rakat & Sajdah Pocket Detector Engine
 * Refactored for Android Screen-On WakeLock + Dual Orientation Detection (Gamma/Roll & Beta/Pitch)
 * + Standing Up Rakat Announcement Mode ("Rakat X Complete")
 */

let isTracking = false;
let rakatCount = 1;
let sajdahInCurrentRakat = 0;
let totalSajdahs = 0;
let targetRakat = 4;

let isInSajdahPosition = false;
let lastSajdahTime = 0;
/**
 * Rakat Tracker Engine (v6)
 * - Restores reliable v1/v2 beta pitch sensor algorithm
 * - Counts 2 Sajdahs per Rakat
 * - Stays quiet during Sajdahs
 * - Speaks "Starting Rakat X" IMMEDIATELY when standing up for the next Rakat
 * - Includes Voice Selection Dropdown & pitch adjustment
 */

let isTracking = false;
let rakatCount = 1;
let sajdahInCurrentRakat = 0;
let targetRakat = 4;

let isInSajdahPosition = false;
let lastSajdahTime = 0;
const SAJDAH_COOLDOWN_MS = 2500;

// Speech Synth setup - Standard System Voice Engine
const synth = window.speechSynthesis;

function speak(text) {
  const audioEnabled = document.getElementById('audio-toggle').checked;
  if (!audioEnabled || !('speechSynthesis' in window)) return;

  synth.cancel(); // Clear queued utterances
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  synth.speak(utterance);
}

// Keep Screen ON via WakeLock API (Crucial for Android Sensors)
const silentAudio = document.getElementById('silent-audio');
let wakeLock = null;

async function requestWakeLock() {
  try {
    if (silentAudio) silentAudio.play();
  } catch (err) {
    console.log("Audio play error", err);
  }

  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      document.getElementById('wake-lock-badge').textContent = 'Screen Kept Awake';
      document.getElementById('wake-lock-badge').classList.replace('badge-off', 'badge-on');
    } catch (err) {
      console.log('WakeLock error:', err);
    }
  }
}

function releaseWakeLock() {
  if (silentAudio) silentAudio.pause();
  if (wakeLock) {
    wakeLock.release().then(() => { wakeLock = null; });
  }
  document.getElementById('wake-lock-badge').textContent = 'Screen Lock Off';
  document.getElementById('wake-lock-badge').classList.replace('badge-on', 'badge-off');
}

/**
 * Reliable v1 / v2 Front Pocket Orientation Algorithm:
 * - Standing / Ruku: Phone vertical in pocket (Pitch / absBeta ~ 65° - 90°)
 * - Sajdah: Thigh tilts forward horizontal to ground (Pitch / absBeta < 38°)
 */
function handleOrientation(event) {
  if (!isTracking) return;

  let pitch = event.beta; // Tilt front-to-back [-180, 180]
  if (pitch === null || pitch === undefined) return;

  const absPitch = Math.abs(pitch);

  // Update Raw Debug Display
  document.getElementById('raw-pitch').textContent = `${Math.round(absPitch)}° pitch`;
  const fillPercentage = Math.min(100, Math.max(5, (absPitch / 90) * 100));
  document.getElementById('pitch-fill').style.height = `${fillPercentage}%`;

  const motionIndicator = document.getElementById('motion-indicator');
  const postureText = document.getElementById('posture-text');
  const sensorState = document.getElementById('sensor-state');

  // THRESHOLDS:
  // Sajdah trigger: Pitch drops <= 38°
  // Standing trigger: Pitch rises >= 60°
  const SAJDAH_ENTER_THRESHOLD = 38; 
  const SAJDAH_EXIT_THRESHOLD = 60;

  const now = Date.now();

  if (absPitch <= SAJDAH_ENTER_THRESHOLD) {
    // Smartphone entered Sajdah position
    if (!isInSajdahPosition && (now - lastSajdahTime > SAJDAH_COOLDOWN_MS)) {
      isInSajdahPosition = true;
      lastSajdahTime = now;

      sajdahInCurrentRakat++;

      motionIndicator.classList.add('active-sajdah');
      postureText.textContent = `🙇 SAJDAH (${sajdahInCurrentRakat}/2)`;
      sensorState.textContent = `Sajdah ${sajdahInCurrentRakat}`;
    }
  } else if (absPitch >= SAJDAH_EXIT_THRESHOLD) {
    // Smartphone returned to vertical (Standing up)
    if (isInSajdahPosition) {
      isInSajdahPosition = false;

      motionIndicator.classList.remove('active-sajdah');
      postureText.textContent = '🧍 STANDING UPRIGHT';
      sensorState.textContent = 'Standing Upright';

      // Check if we just completed 2 Sajdahs and are now standing up!
      if (sajdahInCurrentRakat >= 2) {
        onStandingUpForNextRakat();
      }
    }
  }
}

// Called IMMEDIATELY when standing up after completing 2 Sajdahs
function onStandingUpForNextRakat() {
  targetRakat = parseInt(document.getElementById('target-rakat').value, 10);

  if (rakatCount < targetRakat) {
    rakatCount++;
    sajdahInCurrentRakat = 0;

    document.getElementById('rakat-display').textContent = rakatCount;

    // Immediately announce e.g. "Starting Rakat 2" in male voice as soon as you stand up!
    speak(`Starting Rakat ${rakatCount}`);
  } else {
    speak("Prayer complete");
    stopTracking();
  }
}

// Sensor Permission & Tracking Handler
async function startTracking() {
  if (isTracking) {
    stopTracking();
    return;
  }

  const startBtn = document.getElementById('start-btn');

  // Request Motion/Orientation permission on iOS if required
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const response = await DeviceOrientationEvent.requestPermission();
      if (response !== 'granted') {
        alert('Permission to access motion sensors was denied.');
        return;
      }
    } catch (error) {
      console.error('DeviceOrientation permission error:', error);
    }
  }

  isTracking = true;
  isInSajdahPosition = false;
  sajdahInCurrentRakat = 0;
  lastSajdahTime = Date.now() + 4000; // 4-second Grace Period while putting phone in pocket

  // Immediately update UI states so button turns red instantly
  startBtn.classList.add('active');
  startBtn.innerHTML = '<span class="btn-icon">⏹</span> Stop Tracking';
  
  document.getElementById('sensor-badge').textContent = 'Sensor Active';
  document.getElementById('sensor-badge').classList.replace('badge-off', 'badge-on');

  window.addEventListener('deviceorientation', handleOrientation, true);

  // Non-blocking wake lock request & speech alert
  requestWakeLock().catch(e => console.log(e));
  speak("Tracking started. Place phone in pocket.");
}

function stopTracking() {
  window.removeEventListener('deviceorientation', handleOrientation, true);
  isTracking = false;
  releaseWakeLock();

  const startBtn = document.getElementById('start-btn');
  startBtn.classList.remove('active');
  startBtn.innerHTML = '<span class="btn-icon">▶</span> Start Tracking';

  document.getElementById('sensor-badge').textContent = 'Sensor Standby';
  document.getElementById('sensor-badge').classList.replace('badge-on', 'badge-off');
}

function resetCounter() {
  rakatCount = 1;
  sajdahInCurrentRakat = 0;
  isInSajdahPosition = false;

  document.getElementById('rakat-display').textContent = '1';
  document.getElementById('motion-indicator').classList.remove('active-sajdah');
  document.getElementById('posture-text').textContent = 'Standing / Upright';

  if (isTracking) {
    speak("Counter reset");
  }
}

// Initializer
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('start-btn').addEventListener('click', startTracking);
  document.getElementById('reset-btn').addEventListener('click', resetCounter);

  document.getElementById('target-rakat').addEventListener('change', (e) => {
    targetRakat = parseInt(e.target.value, 10);
  });
});
