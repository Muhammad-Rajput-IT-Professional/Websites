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
const SAJDAH_COOLDOWN_MS = 3000; // Minimum delay between sajdahs to avoid false double hits

// Speech Synth setup
const synth = window.speechSynthesis;
let speechVoice = null;

function initVoice() {
  if ('speechSynthesis' in window) {
    const loadVoices = () => {
      const voices = synth.getVoices();
      // Search specifically for male English voices (e.g. David, George, Guy, James, Male, etc.)
      const maleVoice = voices.find(v => v.lang.startsWith('en') && (
        v.name.toLowerCase().includes('male') ||
        v.name.toLowerCase().includes('david') ||
        v.name.toLowerCase().includes('george') ||
        v.name.toLowerCase().includes('guy') ||
        v.name.toLowerCase().includes('james') ||
        v.name.toLowerCase().includes('ryan') ||
        v.name.toLowerCase().includes('daniel') ||
        v.name.toLowerCase().includes('alex')
      ));

      speechVoice = maleVoice || voices.find(v => v.lang.startsWith('en')) || voices[0];
    };
    loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }
  }
}

function speak(text) {
  const audioEnabled = document.getElementById('audio-toggle').checked;
  if (!audioEnabled || !('speechSynthesis' in window)) return;

  synth.cancel(); // Clear queued utterances
  const utterance = new SpeechSynthesisUtterance(text);
  if (speechVoice) utterance.voice = speechVoice;
  utterance.rate = 0.95;
  utterance.pitch = 0.85; // Deeper pitch for clear male voice tone
  utterance.volume = 1.0;
  synth.speak(utterance);
}

// Keep Screen ON via WakeLock API (Crucial for Android Sensors)
const silentAudio = document.getElementById('silent-audio');
let wakeLock = null;

async function requestWakeLock() {
  // 1. Play silent loop audio to keep audio session alive
  try {
    if (silentAudio) silentAudio.play();
  } catch (err) {
    console.log("Audio play error", err);
  }

  // 2. Request official Screen WakeLock API to keep screen awake (prevents Android sensor freeze)
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      document.getElementById('wake-lock-badge').textContent = 'Screen Kept Awake';
      document.getElementById('wake-lock-badge').classList.replace('badge-off', 'badge-on');
      
      wakeLock.addEventListener('release', () => {
        if (isTracking) {
          // Re-request if released unexpectedly
          requestWakeLock();
        }
      });
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
 * Orientation Pocket Algorithm:
 * When phone is in front trouser pocket:
 * - STANDING: Phone is vertical (tilt angle relative to horizontal ground is 65° ~ 90°).
 * - SAJDAH: Thigh becomes horizontal (tilt angle relative to ground drops to 0° ~ 35°).
 *
 * We calculate true 3D tilt angle off horizontal plane using both Beta (front-back tilt) and Gamma (left-right tilt).
 */
function handleOrientation(event) {
  if (!isTracking) return;

  const beta = event.beta;   // Front-back tilt [-180, 180]
  const gamma = event.gamma; // Left-right tilt [-90, 90]

  if (beta === null || beta === undefined) return;

  // Compute angle of the phone's long axis relative to vertical standing plane
  // When standing upright: beta is ~80° - 90°, or ~ -80° - -90° (if placed upside down in pocket)
  const absBeta = Math.abs(beta);
  const absGamma = Math.abs(gamma || 0);

  // Effective vertical tilt angle (90° = perfectly upright standing, 0° = completely flat horizontal in Sajdah)
  // If phone is upright in pocket, absBeta measures tilt towards ground
  let tiltFromVertical = 90 - absBeta;
  if (absBeta > 90) tiltFromVertical = absBeta - 90; // Handing upside down in pocket

  // Also factor gamma if phone rotated sideways in pocket
  const effectiveSajdahTilt = Math.sqrt(tiltFromVertical * tiltFromVertical + (absGamma * 0.3) * (absGamma * 0.3));

  // Update Raw Debug Display
  document.getElementById('raw-pitch').textContent = `${Math.round(effectiveSajdahTilt)}° tilt`;
  const fillPercentage = Math.min(100, Math.max(5, (effectiveSajdahTilt / 60) * 100));
  document.getElementById('pitch-fill').style.height = `${fillPercentage}%`;

  const motionIndicator = document.getElementById('motion-indicator');
  const postureText = document.getElementById('posture-text');
  const sensorState = document.getElementById('sensor-state');

  // THRESHOLDS:
  // Sajdah trigger: effective tilt angle drops < 35° (thigh flat on ground/prostrate)
  // Standing trigger: effective tilt angle rises > 55° (thigh vertical)
  const SAJDAH_THRESHOLD = 35;
  const STANDING_THRESHOLD = 55;

  const now = Date.now();

  if (effectiveSajdahTilt <= SAJDAH_THRESHOLD) {
    // Smartphone has entered Sajdah position
    if (!isInSajdahPosition && (now - lastSajdahTime > SAJDAH_COOLDOWN_MS)) {
      isInSajdahPosition = true;
      lastSajdahTime = now;
      
      motionIndicator.classList.add('active-sajdah');
      postureText.textContent = '🙇 SAJDAH DETECTED';
      sensorState.textContent = 'In Sajdah';

      onSajdahEntered();
    }
  } else if (effectiveSajdahTilt >= STANDING_THRESHOLD) {
    // Smartphone returned to Standing / Upright posture
    if (isInSajdahPosition) {
      isInSajdahPosition = false;
      motionIndicator.classList.remove('active-sajdah');
      postureText.textContent = '🧍 STANDING UP';
      sensorState.textContent = 'Standing Upright';

      onStandingUp();
    }
  }
}

// Triggered when phone tilts flat (Sajdah)
function onSajdahEntered() {
  sajdahInCurrentRakat++;
  totalSajdahs++;

  // Update UI
  document.getElementById('sajdah-display').textContent = `${sajdahInCurrentRakat} / 2`;
  document.getElementById('total-sajdah-display').textContent = totalSajdahs;

  const announceMode = document.getElementById('announcement-mode').value;

  if (announceMode === 'sajdah') {
    if (sajdahInCurrentRakat === 1) {
      speak("1");
    } else if (sajdahInCurrentRakat === 2) {
      speak("2");
    }
  }
  // If mode is 'standing', stay completely quiet while sitting/doing Sajdah!
}

// Triggered ONLY when user stands back up fully upright
function onStandingUp() {
  const announceMode = document.getElementById('announcement-mode').value;
  targetRakat = parseInt(document.getElementById('target-rakat').value, 10);

  if (sajdahInCurrentRakat >= 2) {
    // 2 Sajdahs completed for this Rakat and now user stood up for next Rakat!
    if (rakatCount < targetRakat) {
      // Advance to Next Rakat first
      rakatCount++;
      sajdahInCurrentRakat = 0;
      
      document.getElementById('rakat-display').textContent = rakatCount;
      document.getElementById('sajdah-display').textContent = `0 / 2`;

      // Announce ONLY the next rakat number (e.g., "2", "3", "4") in a clear male voice while standing
      speak(`${rakatCount}`);
    } else {
      speak("Done");
      stopTracking();
    }
  }
}

// Sensor Permission & Tracking Handler
async function startTracking() {
  if (isTracking) {
    stopTracking();
    return;
  }

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

  window.addEventListener('deviceorientation', handleOrientation, true);
  
  isTracking = true;
  await requestWakeLock();

  const startBtn = document.getElementById('start-btn');
  startBtn.classList.add('active');
  startBtn.innerHTML = '<span class="btn-icon">⏹</span> Stop Tracking';
  
  document.getElementById('sensor-badge').textContent = 'Sensor Active';
  document.getElementById('sensor-badge').classList.replace('badge-off', 'badge-on');

  speak("Tracking started. Put phone in pocket.");
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
  totalSajdahs = 0;
  isInSajdahPosition = false;

  document.getElementById('rakat-display').textContent = '1';
  document.getElementById('sajdah-display').textContent = '0 / 2';
  document.getElementById('total-sajdah-display').textContent = '0';
  document.getElementById('motion-indicator').classList.remove('active-sajdah');
  document.getElementById('posture-text').textContent = 'Standing / Ruku';

  if (isTracking) {
    speak("Counter reset");
  }
}

// Initializer
document.addEventListener('DOMContentLoaded', () => {
  initVoice();

  document.getElementById('start-btn').addEventListener('click', startTracking);
  document.getElementById('reset-btn').addEventListener('click', resetCounter);

  document.getElementById('target-rakat').addEventListener('change', (e) => {
    targetRakat = parseInt(e.target.value, 10);
  });
});
