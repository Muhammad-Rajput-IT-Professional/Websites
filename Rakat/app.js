/**
 * Rakat Tracker Engine (v10 - Clean Fixed)
 */

let isTracking = false;
let rakatCount = 1;
let sajdahInCurrentRakat = 0;
let targetRakat = 4;

let isInSajdahPosition = false;
let lastSajdahTime = 0;
const SAJDAH_COOLDOWN_MS = 2500;

// Speech Synth setup - Standard System Voice Engine
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

  const SAJDAH_ENTER_THRESHOLD = 38; 
  const SAJDAH_EXIT_THRESHOLD = 60;

  const now = Date.now();

  if (absPitch <= SAJDAH_ENTER_THRESHOLD) {
    // Smartphone entered Sajdah position
    if (!isInSajdahPosition && (now - lastSajdahTime > SAJDAH_COOLDOWN_MS)) {
      isInSajdahPosition = true;
      lastSajdahTime = now;

      sajdahInCurrentRakat++;

      if (motionIndicator) motionIndicator.classList.add('active-sajdah');
      if (postureText) postureText.textContent = `🙇 SAJDAH (${sajdahInCurrentRakat}/2)`;
      if (sensorState) sensorState.textContent = `Sajdah ${sajdahInCurrentRakat}`;
    }
  } else if (absPitch >= SAJDAH_EXIT_THRESHOLD) {
    // Smartphone returned to vertical (Standing up upright)
    if (isInSajdahPosition) {
      isInSajdahPosition = false;
      lastSajdahTime = now; // Update timestamp when rising up

      if (motionIndicator) motionIndicator.classList.remove('active-sajdah');
      if (postureText) postureText.textContent = '🧍 STANDING UPRIGHT';
      if (sensorState) sensorState.textContent = 'Standing Upright';

      // Check if 2 Sajdahs were completed AND user is now standing back up upright!
      if (sajdahInCurrentRakat >= 2) {
        onStandingUpForNextRakat();
      }
    }
  }
}

// Called IMMEDIATELY when standing up after completing 2 Sajdahs
function onStandingUpForNextRakat() {
  const targetSelect = document.getElementById('target-rakat');
  targetRakat = targetSelect ? parseInt(targetSelect.value, 10) : 4;

  if (rakatCount < targetRakat) {
    rakatCount++;
    sajdahInCurrentRakat = 0;

    const rakatDisplay = document.getElementById('rakat-display');
    if (rakatDisplay) rakatDisplay.textContent = rakatCount;

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

  // Request Motion/Orientation permission on iOS if required
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
  isInSajdahPosition = false;
  sajdahInCurrentRakat = 0;
  lastSajdahTime = Date.now() + 4000; // 4-second Grace Period while putting phone in pocket

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

  // Support both standard deviceorientation and Firefox fallback
  window.addEventListener('deviceorientation', handleOrientation, true);
  window.addEventListener('deviceorientationabsolute', handleOrientation, true);

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
  sajdahInCurrentRakat = 0;
  isInSajdahPosition = false;

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
