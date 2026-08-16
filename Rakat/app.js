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
 * Clean Rakat State Machine
 * State 0: Standing / Upright (Initial)
 * State 1: Down / Horizontal (Thigh bent for Ruku & Sajdah)
 * State 2: Returning Upright -> Immediately announce next Rakat!
 */
let isDown = false;
let lastStateChangeTime = 0;
const STATE_COOLDOWN_MS = 2500; // Prevent rapid flicker

function handleOrientation(event) {
  if (!isTracking) return;

  const beta = event.beta; // Front-back tilt [-180, 180]
  if (beta === null || beta === undefined) return;

  const absBeta = Math.abs(beta);
  
  // Calculate tilt angle relative to ground (0° = horizontal, 90° = vertical standing)
  let tiltAngle = absBeta;
  if (absBeta > 90) tiltAngle = 180 - absBeta;

  // Debug meter
  document.getElementById('raw-pitch').textContent = `${Math.round(tiltAngle)}° tilt`;
  const fillPercentage = Math.min(100, Math.max(5, (tiltAngle / 90) * 100));
  document.getElementById('pitch-fill').style.height = `${fillPercentage}%`;

  const motionIndicator = document.getElementById('motion-indicator');
  const postureText = document.getElementById('posture-text');
  const sensorState = document.getElementById('sensor-state');

  // THRESHOLDS FOR POCKET TILT:
  // Down Position threshold: < 45° tilt (bent down for Ruku/Sajdah)
  // Upright Standing threshold: > 70° tilt (standing straight)
  const DOWN_THRESHOLD = 45;
  const UPRIGHT_THRESHOLD = 70;

  const now = Date.now();

  if (tiltAngle <= DOWN_THRESHOLD) {
    // User went down
    if (!isDown && (now - lastStateChangeTime > STATE_COOLDOWN_MS)) {
      isDown = true;
      lastStateChangeTime = now;

      motionIndicator.classList.add('active-sajdah');
      postureText.textContent = '🙇 DOWN (BENT / SAJDAH)';
      sensorState.textContent = 'Down';
    }
  } else if (tiltAngle >= UPRIGHT_THRESHOLD) {
    // User stood back UP!
    if (isDown && (now - lastStateChangeTime > STATE_COOLDOWN_MS)) {
      isDown = false;
      lastStateChangeTime = now;

      motionIndicator.classList.remove('active-sajdah');
      postureText.textContent = '🧍 STANDING UPRIGHT';
      sensorState.textContent = 'Standing Upright';

      onStoodUpForNextRakat();
    }
  }
}

// Called IMMEDIATELY as soon as leg reaches vertical standing posture
function onStoodUpForNextRakat() {
  targetRakat = parseInt(document.getElementById('target-rakat').value, 10);

  if (rakatCount < targetRakat) {
    rakatCount++;
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
  isDown = false;
  lastStateChangeTime = 0;

  document.getElementById('rakat-display').textContent = '1';
  document.getElementById('motion-indicator').classList.remove('active-sajdah');
  document.getElementById('posture-text').textContent = 'Standing / Upright';

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
