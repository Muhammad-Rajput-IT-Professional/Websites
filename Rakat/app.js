/**
 * Rakat & Sajdah Pocket Detector Engine
 * Uses DeviceOrientation (pitch tilt) + Web Speech API + WakeLock & Audio Heartbeat
 */

let isTracking = false;
let rakatCount = 1;
let sajdahInCurrentRakat = 0;
let totalSajdahs = 0;
let targetRakat = 4;

let isInSajdahPosition = false;
let lastSajdahTime = 0;
const SAJDAH_COOLDOWN_MS = 2500; // Minimum delay between sajdahs to prevent false double counts

// Speech Synth setup
const synth = window.speechSynthesis;
let speechVoice = null;

function initVoice() {
  if ('speechSynthesis' in window) {
    const loadVoices = () => {
      const voices = synth.getVoices();
      // Select clear English voice if available
      speechVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Natural')) ||
                    voices.find(v => v.lang.startsWith('en')) ||
                    voices[0];
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

  synth.cancel(); // Cancel any ongoing queue
  const utterance = new SpeechSynthesisUtterance(text);
  if (speechVoice) utterance.voice = speechVoice;
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  synth.speak(utterance);
}

// Keep-Alive audio playback for mobile screen off execution
const silentAudio = document.getElementById('silent-audio');
let wakeLock = null;

async function requestWakeLock() {
  const wakeLockToggle = document.getElementById('wakelock-toggle').checked;
  if (!wakeLockToggle) return;

  // 1. Play silent background audio so mobile browsers keep thread active when locked
  try {
    silentAudio.play();
  } catch (err) {
    console.log("Audio play prevented", err);
  }

  // 2. Request official Screen WakeLock API if available
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      document.getElementById('wake-lock-badge').textContent = 'Background Active';
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
  document.getElementById('wake-lock-badge').textContent = 'Background Off';
  document.getElementById('wake-lock-badge').classList.replace('badge-on', 'badge-off');
}

// Orientation & Pocket Motion Detection
// In front pocket:
// - Vertical Standing / Ruku: Beta pitch is ~70° to 90° (or -70° to -90° depending on orientation)
// - Sajdah (horizontal/prostrate): Thigh tilts horizontal, Beta pitch drops near 0° to 30°
function handleOrientation(event) {
  if (!isTracking) return;

  let pitch = event.beta; // Tilt front-to-back [-180, 180]
  if (pitch === null || pitch === undefined) return;

  const absPitch = Math.abs(pitch);

  // Update Raw Debug Display
  document.getElementById('raw-pitch').textContent = `${Math.round(absPitch)}°`;
  const fillPercentage = Math.min(100, Math.max(5, (absPitch / 90) * 100));
  document.getElementById('pitch-fill').style.height = `${fillPercentage}%`;

  const motionIndicator = document.getElementById('motion-indicator');
  const postureText = document.getElementById('posture-text');

  // Sajdah Detection Threshold:
  // Standing/Sitting: Phone vertical (pitch ~ 65° - 90°)
  // Going into Sajdah: Thigh tilts forward horizontal (pitch < 38°)
  const SAJDAH_ENTER_THRESHOLD = 38; 
  const SAJDAH_EXIT_THRESHOLD = 60;

  const now = Date.now();

  if (absPitch <= SAJDAH_ENTER_THRESHOLD) {
    // Smartphone has entered Sajdah position
    if (!isInSajdahPosition && (now - lastSajdahTime > SAJDAH_COOLDOWN_MS)) {
      isInSajdahPosition = true;
      lastSajdahTime = now;
      motionIndicator.classList.add('active-sajdah');
      postureText.textContent = '🙇 SAJDAH DETECTED';

      onSajdahDetected();
    }
  } else if (absPitch >= SAJDAH_EXIT_THRESHOLD) {
    // Smartphone returned to vertical (Sitting after Sajdah or Standing)
    if (isInSajdahPosition) {
      isInSajdahPosition = false;
      motionIndicator.classList.remove('active-sajdah');
      postureText.textContent = '🧍 Standing / Sitting';
    }
  }
}

function onSajdahDetected() {
  sajdahInCurrentRakat++;
  totalSajdahs++;

  // Update UI
  document.getElementById('sajdah-display').textContent = `${sajdahInCurrentRakat} / 2`;
  document.getElementById('total-sajdah-display').textContent = totalSajdahs;

  if (sajdahInCurrentRakat === 1) {
    // First Sajdah of current Rakat -> Speak "1"
    speak("1");
  } else if (sajdahInCurrentRakat === 2) {
    // Second Sajdah of current Rakat -> Speak "2"
    targetRakat = parseInt(document.getElementById('target-rakat').value, 10);
    
    if (rakatCount < targetRakat) {
      speak(`2. Rakat ${rakatCount} complete.`);
      // Prepare for next Rakat
      setTimeout(() => {
        rakatCount++;
        sajdahInCurrentRakat = 0;
        document.getElementById('rakat-display').textContent = rakatCount;
        document.getElementById('sajdah-display').textContent = `0 / 2`;
      }, 1500);
    } else {
      speak(`2. Prayer finished. ${rakatCount} Rakats completed.`);
      stopTracking();
    }
  }
}

// Sensor Permission Handler (Required for iOS 13+)
async function startTracking() {
  if (isTracking) {
    stopTracking();
    return;
  }

  // Request DeviceOrientation permission on iOS
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
  totalSajdahs = 0;

  document.getElementById('rakat-display').textContent = '1';
  document.getElementById('sajdah-display').textContent = '0 / 2';
  document.getElementById('total-sajdah-display').textContent = '0';
  document.getElementById('motion-indicator').classList.remove('active-sajdah');
  document.getElementById('posture-text').textContent = 'Standing / Ruku';

  if (isTracking) {
    speak("Counter reset");
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  initVoice();

  document.getElementById('start-btn').addEventListener('click', startTracking);
  document.getElementById('reset-btn').addEventListener('click', resetCounter);

  document.getElementById('target-rakat').addEventListener('change', (e) => {
    targetRakat = parseInt(e.target.value, 10);
  });
});
