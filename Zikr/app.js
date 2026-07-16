(function () {
  "use strict";

  const APP_VERSION = "v33";
  const CONFIG = Object.freeze({
    requiredExamples: 3,
    outputSampleRate: 16000,
    calibrationSilenceMs: 320,
    minimumExampleMs: 350,
    maximumExampleMs: 3000,
    minimumThreshold: 0.012,
    noiseMultiplier: 2.8,
    meterBoost: 4.5,
    analysisIntervalMs: 80,
    detectionLookbackMs: 280,
    listeningBufferResetSilenceMs: 160,
    backgroundCalibrationMs: 4000,
    calibratedNoiseMultiplier: 1.65,
    minimumAnalysisWindowRatio: 0.58,
    mfccFrameSize: 512,
    mfccHopSize: 160,
    dtwBandRatio: 0.28,
    refractoryRatio: 0.58,
    minimumNewVoicedRatio: 0.42,
    minimumActiveMs: 220,
    minimumContinuousVoiceMs: 110,
    minimumActiveRatio: 0.22,
    maximumCrestFactor: 14,
    maximumSpectralFlatness: 0.58,
    requiredMatchConfirmations: 1,
  });

  const STORAGE_KEY = "dhikr-counter-profiles-v1";
  const ACCURACY_NOTICE_KEY = "dhikr-counter-accuracy-notice-v1";
  const MAX_COUNTER_VALUE = 999999;
  const PRESETS = Object.freeze({
    astaghfirullah: { label: "أَسْتَغْفِرُ اللَّهَ" },
    subhanallah_wabihamdihi: { label: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ" },
    salawat_durood: { label: "Salawat / Durood" },
  });

  const counterEl = document.querySelector("#counter");
  const appVersionEl = document.querySelector("#appVersion");
  const controlsEl = document.querySelector(".controls");
  const goalPanelEl = document.querySelector(".goal-panel");
  const phrasePickerEl = document.querySelector(".phrase-picker");
  const counterAdjustmentsEl = document.querySelector(".counter-adjustments");
  const setupPanelEl = document.querySelector(".setup-panel");
  const noisePanelEl = document.querySelector(".noise-panel");
  const micMeterEl = document.querySelector(".mic-meter");
  const privacyNoteEl = document.querySelector(".privacy-note");
  const tapToolsButton = document.querySelector("#tapToolsButton");
  const startButton = document.querySelector("#startButton");
  const stopButton = document.querySelector("#stopButton");
  const resetButton = document.querySelector("#resetButton");
  const decrementButton = document.querySelector("#decrementButton");
  const incrementButton = document.querySelector("#incrementButton");
  const counterValueInput = document.querySelector("#counterValueInput");
  const setCounterButton = document.querySelector("#setCounterButton");
  const goalInput = document.querySelector("#goalInput");
  const setGoalButton = document.querySelector("#setGoalButton");
  const clearGoalButton = document.querySelector("#clearGoalButton");
  const goalProgress = document.querySelector("#goalProgress");
  const phraseInput = document.querySelector("#phraseInput");
  const phraseButton = document.querySelector("#phraseButton");
  const phraseDisplay = document.querySelector("#phraseDisplay");
  const presetAstaghfirullah = document.querySelector("#presetAstaghfirullah");
  const presetSubhanallah = document.querySelector("#presetSubhanallah");
  const presetSalawat = document.querySelector("#presetSalawat");
  const customPhraseButton = document.querySelector("#customPhraseButton");
  const customPhraseControl = document.querySelector("#customPhraseControl");
  const calibrateButton = document.querySelector("#calibrateButton");
  const restartSetupButton = document.querySelector("#restartSetupButton");
  const setupProgress = document.querySelector("#setupProgress");
  const setupHint = document.querySelector("#setupHint");
  const statusBadge = document.querySelector("#statusBadge");
  const statusText = document.querySelector("#statusText");
  const heardText = document.querySelector("#heardText");
  const micMeterTrack = document.querySelector("#micMeterTrack");
  const micMeterFill = document.querySelector("#micMeterFill");
  const micLevelText = document.querySelector("#micLevelText");
  const noiseSetupButton = document.querySelector("#noiseSetupButton");
  const clearNoiseSetupButton = document.querySelector("#clearNoiseSetupButton");
  const noiseSetupHint = document.querySelector("#noiseSetupHint");
  const setupRequiredDialog = document.querySelector("#setupRequiredDialog");
  const closeSetupDialogButton = document.querySelector("#closeSetupDialogButton");
  const accuracyNoticeDialog = document.querySelector("#accuracyNoticeDialog");
  const acceptAccuracyNoticeButton = document.querySelector("#acceptAccuracyNoticeButton");
  const installAppButton = document.querySelector("#installAppButton");
  const installHelpDialog = document.querySelector("#installHelpDialog");
  const installHelpText = document.querySelector("#installHelpText");
  const closeInstallHelpButton = document.querySelector("#closeInstallHelpButton");
  const settingsButton = document.querySelector("#settingsButton");
  const settingsDialog = document.querySelector("#settingsDialog");
  const tapToolsDialog = document.querySelector("#tapToolsDialog");
  const tapGoalInput = document.querySelector("#tapGoalInput");
  const tapSetGoalButton = document.querySelector("#tapSetGoalButton");
  const tapClearGoalButton = document.querySelector("#tapClearGoalButton");
  const tapGoalProgress = document.querySelector("#tapGoalProgress");
  const tapPresetAstaghfirullah = document.querySelector("#tapPresetAstaghfirullah");
  const tapPresetSubhanallah = document.querySelector("#tapPresetSubhanallah");
  const tapPresetSalawat = document.querySelector("#tapPresetSalawat");
  const tapCustomPhraseButton = document.querySelector("#tapCustomPhraseButton");
  const tapCustomPhraseControl = document.querySelector("#tapCustomPhraseControl");
  const tapPhraseInput = document.querySelector("#tapPhraseInput");
  const tapPhraseButton = document.querySelector("#tapPhraseButton");
  const closeTapToolsButton = document.querySelector("#closeTapToolsButton");
  const countSoundToggle = document.querySelector("#countSoundToggle");
  const darkModeToggle = document.querySelector("#darkModeToggle");
  const tapCounterToggle = document.querySelector("#tapCounterToggle");
  const closeSettingsButton = document.querySelector("#closeSettingsButton");

  const statusLabels = {
    waiting: "Waiting",
    starting: "Starting",
    calibrating: "Voice setup",
    noise: "Learning background",
    listening: "Listening",
    speech: "Phrase detected",
    unavailable: "Unavailable",
  };

  let count = 0;
  let goal = 0;
  let goalCelebrated = false;
  let activeProfileKey = "astaghfirullah";
  let activePhrase = PRESETS.astaghfirullah.label;
  let profiles = {};
  let mode = "idle";
  let microphoneStream = null;
  let audioContext = null;
  let cueAudioContext = null;
  let sourceNode = null;
  let processorNode = null;
  let silentOutputNode = null;
  let sourceSampleRate = 48000;
  let wakeLock = null;
  let wakeLockDesired = false;
  let deferredInstallPrompt = null;
  let countSoundEnabled = false;
  let darkModeEnabled = false;
  let tapCounterModeEnabled = false;
  let noiseFloor = 0.004;
  let backgroundNoiseLevel = 0;
  let backgroundCalibrationFrames = 0;
  let backgroundCalibrationLevels = [];

  let calibrationSpeaking = false;
  let calibrationSpeechFrames = 0;
  let calibrationSilenceFrames = 0;
  let calibrationBuffers = [];
  let calibrationHoldActive = false;
  let calibrationHoldPointerId = null;

  let templates = [];
  let expectedDurationSamples = 0;
  let minimumTemplateDurationSamples = 0;
  let maximumTemplateDurationSamples = 0;
  let matchThreshold = 0.9;
  let listeningSamples = new Float32Array(0);
  let samplesSinceAnalysis = 0;
  let listeningTimeMs = 0;
  let lastDetectionTime = -Infinity;
  let matchCandidateStreak = 0;
  let lastCandidateTime = -Infinity;
  let voicedSamplesSinceDetection = Infinity;
  let consecutiveSilenceSamples = 0;

  function validTemplates(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((template) => (
      template
      && Array.isArray(template.fingerprint)
      && template.fingerprint.length >= 12
      && Number.isFinite(template.durationSamples)
      && template.durationSamples > 0
    )).slice(0, CONFIG.requiredExamples);
  }

  function supportsDesktopTapTools() {
    if (typeof window.matchMedia === "function") {
      return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    }
    if (typeof window.innerWidth === "number" && window.innerWidth > 0 && window.innerWidth < 768) {
      return false;
    }
    if (typeof navigator.maxTouchPoints === "number") {
      return navigator.maxTouchPoints === 0;
    }
    return true;
  }

  function saveCurrentProfile() {
    profiles[activeProfileKey] = {
      label: activePhrase,
      count,
      goal,
      templates,
    };
  }

  function persistState() {
    saveCurrentProfile();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        activeProfileKey,
        profiles,
        backgroundNoiseLevel,
        settings: {
          countSoundEnabled,
          darkModeEnabled,
          tapCounterModeEnabled,
        },
      }));
    } catch (_) {
      // Counting still works when storage is blocked or full.
    }
  }

  function loadPersistedState() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || !saved.profiles || typeof saved.profiles !== "object" || Array.isArray(saved.profiles)) return;
      profiles = saved.profiles;
      if (saved.settings && typeof saved.settings === "object") {
        countSoundEnabled = saved.settings.countSoundEnabled === true;
        darkModeEnabled = saved.settings.darkModeEnabled === true;
        tapCounterModeEnabled = saved.settings.tapCounterModeEnabled === true;
      }
      if (Number.isFinite(saved.backgroundNoiseLevel) && saved.backgroundNoiseLevel > 0) {
        backgroundNoiseLevel = saved.backgroundNoiseLevel;
        noiseFloor = backgroundNoiseLevel;
      }
      if (typeof saved.activeProfileKey === "string" && profiles[saved.activeProfileKey]) {
        activeProfileKey = saved.activeProfileKey;
      }
    } catch (_) {
      profiles = {};
    }
  }

  function updatePhrasePickerUi() {
    presetAstaghfirullah.className = `preset-button${activeProfileKey === "astaghfirullah" ? " selected" : ""}`;
    presetSubhanallah.className = `preset-button${activeProfileKey === "subhanallah_wabihamdihi" ? " selected" : ""}`;
    presetSalawat.className = `preset-button${activeProfileKey === "salawat_durood" ? " selected" : ""}`;
    const customSelected = activeProfileKey.startsWith("custom:");
    customPhraseButton.className = `preset-button${customSelected ? " selected" : ""}`;
    customPhraseControl.hidden = !customSelected;
    if (customSelected) phraseInput.value = activePhrase;
  }

  function loadProfile(key, fallbackLabel, savePrevious = true) {
    if (savePrevious) saveCurrentProfile();
    mode = "idle";
    stopMicrophone();

    activeProfileKey = key;
    const profile = profiles[key] || {};
    activePhrase = typeof profile.label === "string" && profile.label.trim()
      ? profile.label.trim()
      : fallbackLabel;
    count = Number.isFinite(profile.count) && profile.count >= 0 ? Math.floor(profile.count) : 0;
    goal = Number.isFinite(profile.goal) && profile.goal > 0 ? Math.floor(profile.goal) : 0;
    goalCelebrated = goal > 0 && count >= goal;
    templates = validTemplates(profile.templates);
    resetListeningState();
    if (templates.length >= CONFIG.requiredExamples) finalizeVoiceSetup();

    phraseDisplay.textContent = activePhrase;
    updateCounter();
    updateGoalUi();
    setStatus("waiting");
    updatePhrasePickerUi();
    updateSetupUi();
    updateNoiseSetupUi();
    updateTapToolsUi();
    heardText.textContent = templates.length >= CONFIG.requiredExamples
      ? "Voice setup is ready. Press Start Listening."
      : `Record three examples of "${activePhrase}" to begin.`;
    persistState();
  }

  function setStatus(status) {
    statusBadge.className = `status ${status}`;
    statusText.textContent = statusLabels[status] || statusLabels.waiting;
  }

  async function requestScreenWakeLock() {
    if (
      !wakeLockDesired
      || wakeLock
      || document.visibilityState !== "visible"
      || !navigator.wakeLock
    ) return;

    try {
      const requestedLock = await navigator.wakeLock.request("screen");
      if (!wakeLockDesired || mode !== "listening") {
        await requestedLock.release();
        return;
      }
      wakeLock = requestedLock;
      requestedLock.addEventListener("release", () => {
        if (wakeLock === requestedLock) wakeLock = null;
      });
    } catch (_) {
      wakeLock = null;
    }
  }

  function releaseScreenWakeLock() {
    wakeLockDesired = false;
    const activeLock = wakeLock;
    wakeLock = null;
    if (activeLock) activeLock.release().catch(() => {});
  }

  function updateCounter() {
    counterEl.textContent = String(count);
    updateGoalUi();
    updateTapGoalUi();
  }

  function syncTapCounterUi() {
    const tapMode = tapCounterModeEnabled;
    document.documentElement.dataset.uiMode = tapMode ? "tap" : "audio";
    if (statusBadge) statusBadge.hidden = tapMode;
    if (tapToolsButton) tapToolsButton.hidden = !tapMode || !supportsDesktopTapTools();
    if (controlsEl) controlsEl.hidden = tapMode;
    if (goalPanelEl) goalPanelEl.hidden = tapMode;
    if (phrasePickerEl) phrasePickerEl.hidden = tapMode;
    if (counterAdjustmentsEl) counterAdjustmentsEl.hidden = tapMode;
    if (setupPanelEl) setupPanelEl.hidden = tapMode;
    if (noisePanelEl) noisePanelEl.hidden = tapMode;
    if (micMeterEl) micMeterEl.hidden = tapMode;
    if (privacyNoteEl) privacyNoteEl.hidden = tapMode;
    installAppButton.hidden = tapMode || isRunningAsInstalledApp();
    counterEl.setAttribute("aria-label", tapMode ? "Tap to add one repetition" : "Add one repetition");
    startButton.disabled = tapMode || mode !== "idle";
    stopButton.disabled = true;
    if (tapCounterToggle) tapCounterToggle.checked = tapMode;
    if (tapMode) {
      if (mode !== "idle") {
        mode = "idle";
        stopMicrophone();
        setStatus("waiting");
      }
      heardText.textContent = "Tap counter mode is active. Tap the number to count.";
    } else {
      heardText.textContent = mode === "listening"
        ? "Listening for your calibrated phrase..."
        : templates.length >= CONFIG.requiredExamples
          ? "Voice setup is ready. Press Start Listening."
          : `Record three examples of "${activePhrase}" to begin.`;
      updateSetupUi();
      updateNoiseSetupUi();
      updateInstallButton();
    }
  }

  function applyDisplaySettings() {
    document.documentElement.dataset.theme = darkModeEnabled ? "dark" : "light";
    countSoundToggle.checked = countSoundEnabled;
    darkModeToggle.checked = darkModeEnabled;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", darkModeEnabled ? "#101613" : "#0f6b5f");
    syncTapCounterUi();
  }

  function incrementCount(triggeredByTap = false) {
    const previousCount = count;
    const shouldAnnounceGoal = goal > 0 && count + 1 >= goal && !goalCelebrated;
    applyManualCount(
      count + 1,
      count < MAX_COUNTER_VALUE ? "Counter increased by one." : "Counter is at its maximum value.",
    );
    if (count > previousCount) {
      if (shouldAnnounceGoal) {
        goalCelebrated = true;
        playGoalSound();
        heardText.textContent = `Target of ${goal} reached.`;
        if ("vibrate" in navigator) navigator.vibrate([120, 70, 180]);
        persistState();
      } else {
        playCountSound();
      }
    }
  }

  function applyManualCount(nextCount, message) {
    count = Math.min(MAX_COUNTER_VALUE, Math.max(0, Math.floor(nextCount)));
    goalCelebrated = goal > 0 && count >= goal;
    updateCounter();
    persistState();
    heardText.textContent = message;
  }

  function setCounterFromInput() {
    const nextCount = Number.parseInt(counterValueInput.value, 10);
    if (!Number.isFinite(nextCount) || nextCount < 0 || nextCount > MAX_COUNTER_VALUE) {
      heardText.textContent = `Enter a counter value between 0 and ${MAX_COUNTER_VALUE.toLocaleString()}.`;
      counterValueInput.focus();
      return;
    }
    applyManualCount(nextCount, `Counter set to ${nextCount}.`);
    counterValueInput.value = "";
  }

  decrementButton.addEventListener("click", () => {
    applyManualCount(count - 1, count > 0 ? "Counter reduced by one." : "Counter is already at zero.");
  });

  function incrementManually() {
    incrementCount(false);
  }

  incrementButton.addEventListener("click", incrementManually);
  counterEl.addEventListener("click", () => {
    if (tapCounterModeEnabled) {
      wakeLockDesired = true;
      requestScreenWakeLock();
      incrementCount(true);
      return;
    }
    incrementManually();
  });

  document.addEventListener("click", (event) => {
    if (!tapCounterModeEnabled || isInteractiveTapTarget(event.target)) return;
    wakeLockDesired = true;
    requestScreenWakeLock();
    incrementCount(true);
  });

  document.addEventListener("click", (event) => {
    if (!tapCounterModeEnabled || isInteractiveTapTarget(event.target)) return;
    incrementCount(true);
  });

  setCounterButton.addEventListener("click", setCounterFromInput);
  counterValueInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") setCounterFromInput();
  });

  function updateGoalUi() {
    if (!goal) {
      goalInput.value = "";
      goalProgress.textContent = "No target set";
      clearGoalButton.hidden = true;
      return;
    }
    const remaining = Math.max(0, goal - count);
    goalInput.value = String(goal);
    goalProgress.textContent = remaining
      ? `${count} / ${goal} - ${remaining} remaining`
      : `${goal} reached`;
    clearGoalButton.hidden = false;
  }

  function updateTapGoalUi() {
    if (!tapGoalInput || !tapGoalProgress || !tapClearGoalButton) return;
    if (!goal) {
      tapGoalInput.value = "";
      tapGoalProgress.textContent = "No target set";
      tapClearGoalButton.hidden = true;
      return;
    }
    const remaining = Math.max(0, goal - count);
    tapGoalInput.value = String(goal);
    tapGoalProgress.textContent = remaining
      ? `${count} / ${goal} - ${remaining} remaining`
      : `${goal} reached`;
    tapClearGoalButton.hidden = false;
  }

  function isInteractiveTapTarget(target) {
    return Boolean(target && target.closest && target.closest(
      "button, input, label, dialog, select, textarea, a, summary",
    ));
  }

  function updateSetupUi() {
    const completed = templates.length >= CONFIG.requiredExamples;
    setupProgress.textContent = `${Math.min(templates.length, CONFIG.requiredExamples)} of ${CONFIG.requiredExamples}`;

    if (completed) {
      setupHint.textContent = "Voice setup saved on this device.";
      calibrateButton.textContent = "Hold to redo voice setup";
      calibrateButton.disabled = mode === "starting";
    } else {
      if (templates.length === 1) {
        setupHint.textContent = `Hold the button while saying "${activePhrase}" slowly, then release.`;
      } else if (templates.length === 2) {
        setupHint.textContent = `Hold the button while saying "${activePhrase}" at your fastest comfortable speed, then release.`;
      } else {
        setupHint.textContent = `Hold the button while saying "${activePhrase}" once at a natural speed, then release.`;
      }
      calibrateButton.textContent = `Hold to record example ${templates.length + 1}`;
      calibrateButton.disabled = mode === "starting";
    }
    restartSetupButton.hidden = completed || (
      templates.length === 0 && mode !== "calibrating" && mode !== "starting"
    );
    restartSetupButton.disabled = mode === "noise-calibrating";
    startButton.disabled = mode !== "idle";
    stopButton.disabled = mode !== "listening";
    if (tapCounterModeEnabled) stopButton.disabled = true;
    updateNoiseSetupUi();
  }

  function updateTapToolsUi() {
    if (!tapToolsDialog) return;
    if (tapPresetAstaghfirullah) {
      tapPresetAstaghfirullah.className = `preset-button${activeProfileKey === "astaghfirullah" ? " selected" : ""}`;
    }
    if (tapPresetSubhanallah) {
      tapPresetSubhanallah.className = `preset-button${activeProfileKey === "subhanallah_wabihamdihi" ? " selected" : ""}`;
    }
    if (tapPresetSalawat) {
      tapPresetSalawat.className = `preset-button${activeProfileKey === "salawat_durood" ? " selected" : ""}`;
    }
    const customSelected = activeProfileKey.startsWith("custom:");
    if (tapCustomPhraseButton) {
      tapCustomPhraseButton.className = `preset-button${customSelected ? " selected" : ""}`;
    }
    if (tapCustomPhraseControl) tapCustomPhraseControl.hidden = !customSelected;
    if (customSelected && tapPhraseInput) tapPhraseInput.value = activePhrase;
    updateTapGoalUi();
  }

  function updateNoiseSetupUi() {
    if (mode === "noise-starting") {
      noiseSetupButton.textContent = "Opening microphone...";
      noiseSetupButton.disabled = true;
      clearNoiseSetupButton.hidden = true;
      return;
    }
    if (mode === "noise-calibrating") {
      noiseSetupButton.textContent = "Cancel background recording";
      noiseSetupButton.disabled = false;
      clearNoiseSetupButton.hidden = true;
      return;
    }
    noiseSetupButton.textContent = backgroundNoiseLevel
      ? "Redo background recording"
      : "Record background";
    noiseSetupButton.disabled = mode !== "idle";
    clearNoiseSetupButton.hidden = !backgroundNoiseLevel;
    noiseSetupHint.textContent = backgroundNoiseLevel
      ? "Background filtering is active. Redo it when the environment changes."
      : "In a noisy place, record four seconds without speaking so the counter can learn the background level.";
  }

  function getVoiceEnergyThreshold() {
    const multiplier = backgroundNoiseLevel
      ? CONFIG.calibratedNoiseMultiplier
      : CONFIG.noiseMultiplier;
    return Math.max(CONFIG.minimumThreshold, noiseFloor * multiplier);
  }

  function showSetupRequired() {
    if (typeof setupRequiredDialog.showModal === "function" && !setupRequiredDialog.open) {
      setupRequiredDialog.showModal();
    }
    else heardText.textContent = "Complete all three voice setup recordings first.";
  }

  function showFirstVisitNotice() {
    try {
      if (window.localStorage.getItem(ACCURACY_NOTICE_KEY)) return;
    } catch (_) {
      // Show the notice when storage is unavailable.
    }
    if (typeof accuracyNoticeDialog.showModal === "function" && !accuracyNoticeDialog.open) {
      accuracyNoticeDialog.showModal();
    }
  }

  async function ensureMicrophone() {
    if (microphoneStream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Microphone access requires a modern browser on an HTTPS page.");
    }
    if (!window.Meyda) throw new Error("The local audio matcher did not load. Refresh and try again.");

    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
    });

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error("Audio processing is not supported in this browser.");

    audioContext = new AudioContext();
    if (audioContext.state === "suspended") await audioContext.resume();

    sourceSampleRate = audioContext.sampleRate;
    sourceNode = audioContext.createMediaStreamSource(microphoneStream);
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    silentOutputNode = audioContext.createGain();
    silentOutputNode.gain.value = 0;
    processorNode.addEventListener("audioprocess", handleAudioProcess);
    sourceNode.connect(processorNode);
    processorNode.connect(silentOutputNode);
    silentOutputNode.connect(audioContext.destination);

    window.Meyda.sampleRate = CONFIG.outputSampleRate;
    window.Meyda.bufferSize = CONFIG.mfccFrameSize;
    window.Meyda.melBands = 26;
    window.Meyda.numberOfMFCCCoefficients = 13;
  }

  function handleAudioProcess(event) {
    const input = new Float32Array(event.inputBuffer.getChannelData(0));
    const rms = calculateRms(input);
    updateMeter(rms);

    const threshold = getVoiceEnergyThreshold();
    const hasVoiceEnergy = rms >= threshold;
    if (!backgroundNoiseLevel && !hasVoiceEnergy && !calibrationSpeaking) {
      noiseFloor = noiseFloor * 0.96 + rms * 0.04;
    }

    if (mode === "noise-calibrating") {
      processBackgroundCalibration(input.length, rms);
    } else if (mode === "calibrating") {
      processCalibrationBlock(input, hasVoiceEnergy);
    } else if (mode === "listening") {
      processListeningBlock(input, hasVoiceEnergy);
    }
  }

  function processBackgroundCalibration(frameCount, rms) {
    backgroundCalibrationFrames += frameCount;
    backgroundCalibrationLevels.push(rms);
    const elapsedMs = framesToMs(backgroundCalibrationFrames);
    const remainingSeconds = Math.max(0, Math.ceil((CONFIG.backgroundCalibrationMs - elapsedMs) / 1000));
    noiseSetupHint.textContent = remainingSeconds
      ? `Stay quiet for ${remainingSeconds} more second${remainingSeconds === 1 ? "" : "s"}...`
      : "Finishing background setup...";

    if (elapsedMs < CONFIG.backgroundCalibrationMs) return;

    backgroundNoiseLevel = Math.max(0.001, percentile(backgroundCalibrationLevels, 0.75));
    noiseFloor = backgroundNoiseLevel;
    backgroundCalibrationFrames = 0;
    backgroundCalibrationLevels = [];
    mode = "idle";
    stopMicrophone();
    persistState();
    setStatus("waiting");
    heardText.textContent = "Background noise setup complete. Voice matching is ready.";
    updateSetupUi();
  }

  function processCalibrationBlock(input, hasVoiceEnergy) {
    if (!calibrationSpeaking && !hasVoiceEnergy) return;

    if (!calibrationSpeaking) {
      calibrationSpeaking = true;
      calibrationSpeechFrames = 0;
      calibrationSilenceFrames = 0;
      calibrationBuffers = [];
      heardText.textContent = "Recording this example...";
    }

    calibrationBuffers.push(input);
    if (hasVoiceEnergy) {
      calibrationSpeechFrames += input.length;
      calibrationSilenceFrames = 0;
      setStatus("calibrating");
    } else {
      calibrationSilenceFrames += input.length;
    }

    const totalFrames = calibrationBuffers.reduce((total, buffer) => total + buffer.length, 0);
    const totalMs = framesToMs(totalFrames);
    if (totalMs >= CONFIG.maximumExampleMs) finishCalibrationExample();
  }

  function finishCalibrationExample() {
    calibrationHoldActive = false;
    calibrationHoldPointerId = null;
    const trailingFrames = Math.min(calibrationSilenceFrames, calibrationBuffers.reduce((sum, item) => sum + item.length, 0));
    const merged = concatenateBuffers(calibrationBuffers);
    const trimmed = merged.slice(0, Math.max(0, merged.length - trailingFrames));
    const speechMs = framesToMs(calibrationSpeechFrames);
    resetCalibrationCapture();

    if (speechMs < CONFIG.minimumExampleMs) {
      mode = "idle";
      heardText.textContent = "That example was too short. Try saying the full phrase.";
      setStatus("waiting");
      updateSetupUi();
      return;
    }

    const downsampled = downsampleAudio(trimmed, sourceSampleRate, CONFIG.outputSampleRate);
    const fingerprint = extractFingerprint(downsampled);
    if (!fingerprint || fingerprint.length < 12) {
      mode = "idle";
      heardText.textContent = "That example was not clear enough. Please try again.";
      setStatus("waiting");
      updateSetupUi();
      return;
    }

    templates.push({
      fingerprint,
      durationSamples: downsampled.length,
      speechShape: analyzeSpeechShape(downsampled),
    });
    persistState();
    mode = "idle";

    if (templates.length >= CONFIG.requiredExamples) {
      finalizeVoiceSetup();
      heardText.textContent = "Voice setup complete. Press Start Listening.";
      setStatus("waiting");
      stopMicrophone();
    } else {
      heardText.textContent = `Example ${templates.length} saved on this device.`;
      setStatus("waiting");
    }
    updateSetupUi();
  }

  function finalizeVoiceSetup() {
    const templateDurations = templates.map((template) => template.durationSamples);
    expectedDurationSamples = Math.round(median(templateDurations));
    minimumTemplateDurationSamples = Math.min(...templateDurations);
    maximumTemplateDurationSamples = Math.max(...templateDurations);
    const positiveDistances = [];
    for (let left = 0; left < templates.length; left += 1) {
      for (let right = left + 1; right < templates.length; right += 1) {
        positiveDistances.push(dtwDistance(templates[left].fingerprint, templates[right].fingerprint));
      }
    }
    const baseline = median(positiveDistances);
    matchThreshold = Math.min(1.25, Math.max(0.7, baseline * 1.25));
  }

  function processListeningBlock(input, hasVoiceEnergy) {
    const downsampled = downsampleAudio(input, sourceSampleRate, CONFIG.outputSampleRate);
    listeningSamples = appendAndLimit(
      listeningSamples,
      downsampled,
      Math.ceil(Math.max(expectedDurationSamples * 1.6, maximumTemplateDurationSamples * 1.2)),
    );
    samplesSinceAnalysis += downsampled.length;
    listeningTimeMs += (downsampled.length / CONFIG.outputSampleRate) * 1000;
    if (hasVoiceEnergy) {
      consecutiveSilenceSamples = 0;
      if (Number.isFinite(voicedSamplesSinceDetection)) {
        voicedSamplesSinceDetection += downsampled.length;
      }
      setStatus("listening");
    } else {
      consecutiveSilenceSamples += downsampled.length;
      setStatus("listening");
      matchCandidateStreak = 0;
      const resetAfterSamples = Math.round(
        (CONFIG.listeningBufferResetSilenceMs / 1000) * CONFIG.outputSampleRate,
      );
      if (consecutiveSilenceSamples >= resetAfterSamples) {
        listeningSamples = new Float32Array(0);
        samplesSinceAnalysis = 0;
        lastCandidateTime = -Infinity;
      }
      return;
    }
    const intervalSamples = Math.round((CONFIG.analysisIntervalMs / 1000) * CONFIG.outputSampleRate);
    if (
      samplesSinceAnalysis < intervalSamples
      || listeningSamples.length < minimumTemplateDurationSamples * 0.8
    ) return;
    samplesSinceAnalysis = 0;
    analyzeListeningWindow();
  }

  function analyzeListeningWindow() {
    if (calculateRms(listeningSamples) < CONFIG.minimumThreshold * 0.75) return;

    let bestPreliminaryDistance = Infinity;
    let bestCandidate = null;
    let bestNearestTemplate = null;
    let bestShape = null;
    let bestDurationSamples = expectedDurationSamples;
    let bestEndOffsetSamples = 0;
    const durationCandidates = new Set();
    const durationSeeds = [
      expectedDurationSamples,
      minimumTemplateDurationSamples,
      maximumTemplateDurationSamples,
      ...templates.map((template) => template.durationSamples),
    ];
    for (const seed of durationSeeds) {
      [0.62, 0.75, 0.88, 1, 1.12].forEach((scale) => {
        durationCandidates.add(Math.round(seed * scale));
      });
    }

    const lookbackSamples = Math.round((CONFIG.detectionLookbackMs / 1000) * CONFIG.outputSampleRate);
    const endOffsets = new Set([
      0,
      Math.round(CONFIG.analysisIntervalMs * 0.5 / 1000 * CONFIG.outputSampleRate),
      Math.round(CONFIG.analysisIntervalMs / 1000 * CONFIG.outputSampleRate),
      Math.round(CONFIG.analysisIntervalMs * 1.5 / 1000 * CONFIG.outputSampleRate),
      Math.round(CONFIG.analysisIntervalMs * 2 / 1000 * CONFIG.outputSampleRate),
      lookbackSamples,
    ]);

    const sampleCounts = [...durationCandidates]
      .map((requestedSampleCount) => Math.min(listeningSamples.length, requestedSampleCount))
      .filter((sampleCount) => sampleCount >= CONFIG.mfccFrameSize);
    if (!sampleCounts.length) return;

    const validEndOffsets = [...endOffsets]
      .filter((offset) => offset >= 0 && offset < listeningSamples.length - CONFIG.mfccFrameSize)
      .sort((left, right) => left - right);
    const longestSampleCount = Math.max(...sampleCounts);
    const longestAnalysisSamples = Math.min(
      listeningSamples.length,
      longestSampleCount + Math.max(...validEndOffsets),
    );
    const analysisStartSample = listeningSamples.length - longestAnalysisSamples;
    const longestSamples = listeningSamples.slice(analysisStartSample);
    const rawSequence = extractRawFeatureSequence(longestSamples);

    for (const endOffsetSamples of validEndOffsets) {
      const endSample = listeningSamples.length - endOffsetSamples;
      const endFrame = Math.floor((endSample - analysisStartSample - CONFIG.mfccFrameSize) / CONFIG.mfccHopSize) + 1;
      if (endFrame <= 0 || endFrame > rawSequence.length) continue;

      for (const sampleCount of new Set(sampleCounts)) {
        if (sampleCount > endSample) continue;
        const frameCount = Math.floor(
          (sampleCount - CONFIG.mfccFrameSize) / CONFIG.mfccHopSize,
        ) + 1;
        const startFrame = endFrame - frameCount;
        if (startFrame < 0) continue;

        const candidate = normalizeFeatureSequence(rawSequence.slice(startFrame, endFrame));
        if (!candidate.length) continue;
        const nearestTemplate = templates.reduce(
          (nearest, template) => (
            Math.abs(template.durationSamples - sampleCount)
              < Math.abs(nearest.durationSamples - sampleCount)
              ? template
              : nearest
          ),
          templates[0],
        );
        const preliminaryDistance = dtwDistance(candidate, nearestTemplate.fingerprint);
        if (preliminaryDistance < bestPreliminaryDistance) {
          bestPreliminaryDistance = preliminaryDistance;
          bestCandidate = candidate;
          bestNearestTemplate = nearestTemplate;
          bestDurationSamples = sampleCount;
          bestEndOffsetSamples = endOffsetSamples;
        }
      }
    }

    let bestDistance = Infinity;
    if (bestCandidate) {
      bestDistance = findTemplateAgreementDistanceWithKnown(
        bestCandidate,
        templates,
        bestNearestTemplate,
        bestPreliminaryDistance,
      );
      const bestEndSample = listeningSamples.length - bestEndOffsetSamples;
      const bestSamples = listeningSamples.slice(bestEndSample - bestDurationSamples, bestEndSample);
      const shape = analyzeSpeechShape(bestSamples);
      if (isSpeechLike(shape)) bestShape = shape;
    }

    const now = listeningTimeMs;
    const candidateTime = now - (bestEndOffsetSamples / CONFIG.outputSampleRate) * 1000;
    const matchedDurationMs = (bestDurationSamples / CONFIG.outputSampleRate) * 1000;
    const outsideRefractory = candidateTime - lastDetectionTime >= matchedDurationMs * CONFIG.refractoryRatio;
    const enoughNewVoice = voicedSamplesSinceDetection >= bestDurationSamples * CONFIG.minimumNewVoicedRatio;

    const candidateMatched = bestShape && bestDistance <= matchThreshold;
    const confirmationWindowMs = CONFIG.analysisIntervalMs * 2.8;

    if (candidateMatched && outsideRefractory && enoughNewVoice) {
      matchCandidateStreak = now - lastCandidateTime <= confirmationWindowMs
        ? matchCandidateStreak + 1
        : 1;
      lastCandidateTime = now;

      if (matchCandidateStreak >= CONFIG.requiredMatchConfirmations) {
        lastDetectionTime = candidateTime;
        matchCandidateStreak = 0;
        voicedSamplesSinceDetection = 0;
        incrementCount(false);
        if (goalCelebrated && goal && count >= goal) {
          setStatus("speech");
          return;
        }
        setStatus("speech");
        heardText.textContent = `${activePhrase} matched.`;
        if ("vibrate" in navigator) navigator.vibrate(30);
      }
    } else if (outsideRefractory) {
      matchCandidateStreak = 0;
      heardText.textContent = "Listening for your calibrated phrase...";
    }
  }

  function analyzeSpeechShape(samples) {
    const frameSize = CONFIG.mfccFrameSize;
    const hopSize = Math.floor(frameSize / 2);
    const activityThreshold = getVoiceEnergyThreshold();
    let activeFrames = 0;
    let longestRun = 0;
    let currentRun = 0;
    let flatnessTotal = 0;
    let peak = 0;

    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));

    for (let offset = 0; offset + frameSize <= samples.length; offset += hopSize) {
      const frame = samples.slice(offset, offset + frameSize);
      const features = window.Meyda.extract(["rms", "spectralFlatness"], frame);
      const active = features && features.rms >= activityThreshold;
      if (active) {
        activeFrames += 1;
        currentRun += 1;
        longestRun = Math.max(longestRun, currentRun);
        flatnessTotal += Number.isFinite(features.spectralFlatness) ? features.spectralFlatness : 1;
      } else {
        currentRun = 0;
      }
    }

    const totalFrames = Math.max(1, Math.floor((samples.length - frameSize) / hopSize) + 1);
    const hopMs = (hopSize / CONFIG.outputSampleRate) * 1000;
    const signalRms = calculateRms(samples);
    return {
      activeMs: activeFrames * hopMs,
      activeRatio: activeFrames / totalFrames,
      continuousVoiceMs: longestRun * hopMs,
      crestFactor: peak / Math.max(signalRms, 1e-6),
      spectralFlatness: activeFrames ? flatnessTotal / activeFrames : 1,
    };
  }

  function isSpeechLike(shape) {
    return shape.activeMs >= CONFIG.minimumActiveMs
      && shape.activeRatio >= CONFIG.minimumActiveRatio
      && shape.continuousVoiceMs >= CONFIG.minimumContinuousVoiceMs
      && shape.crestFactor <= CONFIG.maximumCrestFactor
      && shape.spectralFlatness <= CONFIG.maximumSpectralFlatness;
  }

  function extractFingerprint(samples) {
    const sequence = extractRawFeatureSequence(samples);
    return sequence.length ? normalizeFeatureSequence(sequence) : null;
  }

  function extractRawFeatureSequence(samples) {
    if (!window.Meyda || samples.length < CONFIG.mfccFrameSize) return [];
    const sequence = [];

    for (
      let offset = 0;
      offset + CONFIG.mfccFrameSize <= samples.length;
      offset += CONFIG.mfccHopSize
    ) {
      const frame = samples.slice(offset, offset + CONFIG.mfccFrameSize);
      const features = window.Meyda.extract(["mfcc", "rms"], frame);
      if (!features || !features.mfcc) continue;
      sequence.push([
        ...features.mfcc.slice(1, 13),
        Math.log10((features.rms || 0) + 1e-6),
      ]);
    }
    return sequence;
  }

  function normalizeFeatureSequence(sequence) {
    if (!sequence.length) return [];
    const dimensions = sequence[0].length;
    const means = new Array(dimensions).fill(0);
    const deviations = new Array(dimensions).fill(0);

    for (const frame of sequence) {
      for (let dimension = 0; dimension < dimensions; dimension += 1) means[dimension] += frame[dimension];
    }
    for (let dimension = 0; dimension < dimensions; dimension += 1) means[dimension] /= sequence.length;
    for (const frame of sequence) {
      for (let dimension = 0; dimension < dimensions; dimension += 1) {
        const difference = frame[dimension] - means[dimension];
        deviations[dimension] += difference * difference;
      }
    }
    for (let dimension = 0; dimension < dimensions; dimension += 1) {
      deviations[dimension] = Math.sqrt(deviations[dimension] / sequence.length) || 1;
    }
    return sequence.map((frame) => frame.map(
      (value, dimension) => (value - means[dimension]) / deviations[dimension],
    ));
  }

  function dtwDistance(left, right) {
    if (!left.length || !right.length) return Infinity;
    const rows = left.length;
    const columns = right.length;
    const band = Math.max(Math.abs(rows - columns), Math.ceil(Math.max(rows, columns) * CONFIG.dtwBandRatio));
    let previous = new Float64Array(columns + 1).fill(Infinity);
    let current = new Float64Array(columns + 1);
    previous[0] = 0;

    for (let row = 1; row <= rows; row += 1) {
      current.fill(Infinity);
      const start = Math.max(1, row - band);
      const end = Math.min(columns, row + band);
      for (let column = start; column <= end; column += 1) {
        const cost = featureDistance(left[row - 1], right[column - 1]);
        current[column] = cost + Math.min(previous[column], current[column - 1], previous[column - 1]);
      }
      const swap = previous;
      previous = current;
      current = swap;
    }
    return previous[columns] / Math.max(rows, columns);
  }

  function featureDistance(left, right) {
    const dimensions = Math.min(left.length, right.length);
    let sumSquares = 0;
    for (let index = 0; index < dimensions; index += 1) {
      const difference = left[index] - right[index];
      sumSquares += difference * difference;
    }
    return Math.sqrt(sumSquares / dimensions);
  }

  function findBestTemplateDistance(candidate, storedTemplates) {
    let best = Infinity;
    for (const template of storedTemplates) best = Math.min(best, dtwDistance(candidate, template.fingerprint));
    return best;
  }

  function findTemplateAgreementDistance(candidate, storedTemplates) {
    const distances = storedTemplates
      .map((template) => dtwDistance(candidate, template.fingerprint))
      .sort((left, right) => left - right);
    const closest = distances[0] ?? Infinity;
    return closest * 0.65 + median(distances) * 0.35;
  }

  function findTemplateAgreementDistanceWithKnown(candidate, storedTemplates, knownTemplate, knownDistance) {
    const distances = storedTemplates
      .map((template) => (
        template === knownTemplate ? knownDistance : dtwDistance(candidate, template.fingerprint)
      ))
      .sort((left, right) => left - right);
    const closest = distances[0] ?? Infinity;
    return closest * 0.65 + median(distances) * 0.35;
  }

  function resetCalibrationCapture() {
    calibrationSpeaking = false;
    calibrationSpeechFrames = 0;
    calibrationSilenceFrames = 0;
    calibrationBuffers = [];
  }

  function resetVoiceSetup() {
    templates = [];
    expectedDurationSamples = 0;
    minimumTemplateDurationSamples = 0;
    maximumTemplateDurationSamples = 0;
    matchThreshold = 0.9;
    listeningSamples = new Float32Array(0);
    listeningTimeMs = 0;
    matchCandidateStreak = 0;
    lastCandidateTime = -Infinity;
    resetCalibrationCapture();
    updateSetupUi();
  }

  function resetListeningState() {
    expectedDurationSamples = 0;
    matchThreshold = 0.9;
    listeningSamples = new Float32Array(0);
    samplesSinceAnalysis = 0;
    listeningTimeMs = 0;
    lastDetectionTime = -Infinity;
    matchCandidateStreak = 0;
    lastCandidateTime = -Infinity;
    voicedSamplesSinceDetection = Infinity;
    consecutiveSilenceSamples = 0;
    resetCalibrationCapture();
  }

  function playGoalSound() {
    try {
      const playbackContext = audioContext && audioContext.state === "running"
        ? audioContext
        : cueAudioContext || new (window.AudioContext || window.webkitAudioContext)();
      if (!audioContext && !cueAudioContext) {
        cueAudioContext = playbackContext;
      }
      if (playbackContext.state === "suspended") playbackContext.resume().catch(() => {});
      if (playbackContext.state !== "running") return;
      const startAt = playbackContext.currentTime;
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        const oscillator = playbackContext.createOscillator();
        const gain = playbackContext.createGain();
        const noteStart = startAt + index * 0.14;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.16, noteStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.22);
        oscillator.connect(gain);
        gain.connect(playbackContext.destination);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + 0.23);
      });
    } catch (_) {
      // Vibration and the on-screen message still signal completion.
    }
  }

  function playCountSound() {
    if (!countSoundEnabled) return;
    try {
      const playbackContext = audioContext && audioContext.state === "running"
        ? audioContext
        : cueAudioContext || new (window.AudioContext || window.webkitAudioContext)();
      if (!audioContext && !cueAudioContext) {
        cueAudioContext = playbackContext;
      }
      if (playbackContext.state === "suspended") playbackContext.resume().catch(() => {});
      if (playbackContext.state !== "running") return;
      const startAt = playbackContext.currentTime;
      const oscillator = playbackContext.createOscillator();
      const gain = playbackContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, startAt);
      oscillator.frequency.exponentialRampToValueAtTime(660, startAt + 0.11);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.11, startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.13);
      oscillator.connect(gain);
      gain.connect(playbackContext.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.14);
    } catch (_) {
      // Optional feedback must never interrupt counting.
    }
  }

  function checkGoalReached() {
    if (!goal || count < goal || goalCelebrated) return false;
    goalCelebrated = true;
    playGoalSound();
    heardText.textContent = `Target of ${goal} reached.`;
    if ("vibrate" in navigator) navigator.vibrate([120, 70, 180]);
    persistState();
    return true;
  }

  function stopMicrophone() {
    if (processorNode) {
      processorNode.removeEventListener("audioprocess", handleAudioProcess);
      processorNode.disconnect();
    }
    if (sourceNode) sourceNode.disconnect();
    if (silentOutputNode) silentOutputNode.disconnect();
    processorNode = null;
    sourceNode = null;
    silentOutputNode = null;

    if (microphoneStream) {
      for (const track of microphoneStream.getTracks()) track.stop();
      microphoneStream = null;
    }
    if (audioContext) audioContext.close().catch(() => {});
    audioContext = null;
    updateMeter(0, true);
  }

  function updateMeter(rms, off = false) {
    const level = Math.min(1, rms * CONFIG.meterBoost);
    const percent = Math.round(level * 100);
    micMeterFill.style.transform = `scaleX(${level.toFixed(3)})`;
    micMeterTrack.setAttribute("aria-valuenow", String(percent));
    micLevelText.textContent = off ? "Off" : percent < 3 ? "Quiet" : `${percent}%`;
  }

  function calculateRms(samples) {
    if (!samples.length) return 0;
    let sumSquares = 0;
    for (const sample of samples) sumSquares += sample * sample;
    return Math.sqrt(sumSquares / samples.length);
  }

  function concatenateBuffers(buffers) {
    const length = buffers.reduce((total, buffer) => total + buffer.length, 0);
    const result = new Float32Array(length);
    let offset = 0;
    for (const buffer of buffers) {
      result.set(buffer, offset);
      offset += buffer.length;
    }
    return result;
  }

  function appendAndLimit(existing, addition, limit) {
    const keep = Math.min(existing.length, Math.max(0, limit - addition.length));
    const result = new Float32Array(keep + addition.length);
    if (keep) result.set(existing.slice(existing.length - keep));
    result.set(addition, keep);
    return result;
  }

  function downsampleAudio(input, inputRate, outputRate) {
    if (inputRate === outputRate) return input;
    const ratio = inputRate / outputRate;
    const outputLength = Math.floor(input.length / ratio);
    const output = new Float32Array(outputLength);
    for (let index = 0; index < outputLength; index += 1) {
      const start = Math.floor(index * ratio);
      const end = Math.min(input.length, Math.floor((index + 1) * ratio));
      let sum = 0;
      for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) sum += input[sourceIndex];
      output[index] = sum / Math.max(1, end - start);
    }
    return output;
  }

  function framesToMs(frames) {
    return (frames / sourceSampleRate) * 1000;
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function percentile(values, ratio) {
    if (!values.length) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
    return sorted[index];
  }

  async function beginBackgroundCalibration() {
    if (mode === "noise-calibrating") {
      mode = "idle";
      backgroundCalibrationFrames = 0;
      backgroundCalibrationLevels = [];
      stopMicrophone();
      setStatus("waiting");
      heardText.textContent = "Background recording cancelled.";
      updateSetupUi();
      return;
    }

    if (mode !== "idle") return;
    mode = "noise-starting";
    setStatus("starting");
    heardText.textContent = "Opening the microphone for background setup...";
    updateSetupUi();
    try {
      await ensureMicrophone();
      mode = "noise-calibrating";
      backgroundCalibrationFrames = 0;
      backgroundCalibrationLevels = [];
      setStatus("noise");
      heardText.textContent = "Stay quiet while the background is measured.";
      updateSetupUi();
    } catch (error) {
      mode = "idle";
      stopMicrophone();
      setStatus("unavailable");
      heardText.textContent = error.name === "NotAllowedError"
        ? "Microphone permission was denied. Allow it in browser settings and try again."
        : error.message || "The microphone could not be started.";
      updateSetupUi();
    }
  }

  noiseSetupButton.addEventListener("click", beginBackgroundCalibration);

  clearNoiseSetupButton.addEventListener("click", () => {
    backgroundNoiseLevel = 0;
    noiseFloor = 0.004;
    persistState();
    heardText.textContent = "Background noise setup cleared.";
    updateNoiseSetupUi();
  });

  async function beginCalibration() {
    calibrationHoldActive = true;
    if (templates.length >= CONFIG.requiredExamples) {
      resetVoiceSetup();
      persistState();
    }
    mode = "starting";
    setStatus("starting");
    heardText.textContent = "Opening the microphone...";
    updateSetupUi();
    try {
      await ensureMicrophone();
      if (!calibrationHoldActive) {
        mode = "idle";
        stopMicrophone();
        setStatus("waiting");
        heardText.textContent = `Hold the button while saying "${activePhrase}", then release to save.`;
        updateSetupUi();
        return;
      }
      mode = "calibrating";
      setStatus("calibrating");
      heardText.textContent = `Release when you finish saying "${activePhrase}".`;
      updateSetupUi();
    } catch (error) {
      mode = "idle";
      stopMicrophone();
      setStatus("unavailable");
      heardText.textContent = error.name === "NotAllowedError"
        ? "Microphone permission was denied. Allow it in browser settings and try again."
        : error.message || "The microphone could not be started.";
      updateSetupUi();
    }
  }

  function endCalibrationHold() {
    calibrationHoldActive = false;
    if (calibrationHoldPointerId !== null) {
      calibrationHoldPointerId = null;
    }
    if (mode !== "calibrating") {
      return;
    }
    if (!calibrationSpeaking) {
      mode = "idle";
      stopMicrophone();
      resetCalibrationCapture();
      setStatus("waiting");
      heardText.textContent = `Hold the button while saying "${activePhrase}", then release to save.`;
      updateSetupUi();
      return;
    }
    finishCalibrationExample();
  }

  calibrateButton.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    calibrationHoldPointerId = event.pointerId;
    if (typeof calibrateButton.setPointerCapture === "function") {
      try {
        calibrateButton.setPointerCapture(event.pointerId);
      } catch (_) {
        // Pointer capture is optional.
      }
    }
    beginCalibration();
  });

  calibrateButton.addEventListener("pointerup", (event) => {
    if (calibrationHoldPointerId !== null && event.pointerId !== calibrationHoldPointerId) return;
    event.preventDefault();
    endCalibrationHold();
  });

  calibrateButton.addEventListener("pointercancel", () => {
    endCalibrationHold();
  });

  calibrateButton.addEventListener("lostpointercapture", () => {
    endCalibrationHold();
  });

  calibrateButton.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (!calibrationHoldActive) beginCalibration();
  });

  calibrateButton.addEventListener("keyup", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    endCalibrationHold();
  });

  restartSetupButton.addEventListener("click", () => {
    mode = "idle";
    stopMicrophone();
    resetVoiceSetup();
    persistState();
    setStatus("waiting");
    heardText.textContent = `Voice setup restarted for "${activePhrase}". Record example 1.`;
  });

  closeSetupDialogButton.addEventListener("click", () => {
    setupRequiredDialog.close();
    const setupPanel = document.querySelector("#setupTitle");
    if (setupPanel && typeof setupPanel.scrollIntoView === "function") {
      setupPanel.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  acceptAccuracyNoticeButton.addEventListener("click", () => {
    try {
      window.localStorage.setItem(ACCURACY_NOTICE_KEY, "seen");
    } catch (_) {
      // The notice can still be closed if storage is blocked.
    }
    accuracyNoticeDialog.close();
  });

  function applyPhrase() {
    const nextPhrase = phraseInput.value.trim();
    if (!nextPhrase) {
      heardText.textContent = "Enter a dhikr phrase first.";
      phraseInput.focus();
      return;
    }
    const key = `custom:${nextPhrase.toLocaleLowerCase()}`;
    loadProfile(key, nextPhrase);
  }

  phraseButton.addEventListener("click", applyPhrase);
  phraseInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") applyPhrase();
  });

  presetAstaghfirullah.addEventListener("click", () => {
    loadProfile("astaghfirullah", PRESETS.astaghfirullah.label);
  });

  presetSubhanallah.addEventListener("click", () => {
    loadProfile("subhanallah_wabihamdihi", PRESETS.subhanallah_wabihamdihi.label);
  });

  presetSalawat.addEventListener("click", () => {
    loadProfile("salawat_durood", PRESETS.salawat_durood.label);
  });

  customPhraseButton.addEventListener("click", () => {
    customPhraseControl.hidden = false;
    phraseInput.focus();
  });

  startButton.addEventListener("click", async () => {
    if (templates.length < CONFIG.requiredExamples) {
      showSetupRequired();
      return;
    }
    mode = "starting";
    setStatus("starting");
    startButton.disabled = true;
    heardText.textContent = "Opening the microphone...";
    try {
      await ensureMicrophone();
      mode = "listening";
      listeningSamples = new Float32Array(0);
      samplesSinceAnalysis = 0;
      listeningTimeMs = 0;
      lastDetectionTime = -Infinity;
      matchCandidateStreak = 0;
      lastCandidateTime = -Infinity;
      voicedSamplesSinceDetection = Infinity;
      consecutiveSilenceSamples = 0;
      wakeLockDesired = true;
      requestScreenWakeLock();
      setStatus("listening");
      stopButton.disabled = mode !== "listening";
      heardText.textContent = "Listening for your calibrated phrase...";
    } catch (error) {
      mode = "idle";
      stopMicrophone();
      setStatus("unavailable");
      heardText.textContent = error.message || "The microphone could not be started.";
      updateSetupUi();
    }
  });

  stopButton.addEventListener("click", () => {
    if (templates.length < CONFIG.requiredExamples) {
      showSetupRequired();
      return;
    }
    if (mode !== "listening") {
      heardText.textContent = "The microphone is not currently listening.";
      return;
    }
    mode = "idle";
    stopMicrophone();
    setStatus("waiting");
    heardText.textContent = "Listening stopped.";
    updateSetupUi();
    persistState();
  });

  resetButton.addEventListener("click", () => {
    count = 0;
    goalCelebrated = false;
    if (mode === "listening") {
      listeningSamples = new Float32Array(0);
      samplesSinceAnalysis = 0;
      listeningTimeMs = 0;
      lastDetectionTime = -Infinity;
      matchCandidateStreak = 0;
      lastCandidateTime = -Infinity;
      voicedSamplesSinceDetection = Infinity;
      consecutiveSilenceSamples = 0;
    }
    updateCounter();
    persistState();
    heardText.textContent = mode === "listening"
      ? "Listening for your calibrated phrase..."
      : templates.length >= CONFIG.requiredExamples
        ? "Voice setup is ready."
        : "Complete voice setup to begin.";
  });

  function setGoal() {
    const nextGoal = Number.parseInt(goalInput.value, 10);
    if (!Number.isFinite(nextGoal) || nextGoal < 1 || nextGoal > 100000) {
      heardText.textContent = "Enter a target between 1 and 100,000.";
      goalInput.focus();
      return;
    }
    goal = nextGoal;
    goalCelebrated = false;
    goalInput.value = String(goal);
    updateGoalUi();
    persistState();
    heardText.textContent = `Target set to ${goal}.`;
    checkGoalReached();
  }

  setGoalButton.addEventListener("click", setGoal);
  goalInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") setGoal();
  });

  clearGoalButton.addEventListener("click", () => {
    goal = 0;
    goalCelebrated = false;
    goalInput.value = "";
    updateGoalUi();
    persistState();
    heardText.textContent = "Target cleared.";
  });

  function isRunningAsInstalledApp() {
    const standaloneDisplay = typeof window.matchMedia === "function"
      && window.matchMedia("(display-mode: standalone)").matches;
    return standaloneDisplay || navigator.standalone === true;
  }

  function updateInstallButton() {
    installAppButton.hidden = tapCounterModeEnabled || isRunningAsInstalledApp();
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButton();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installAppButton.hidden = true;
    heardText.textContent = "Dhikr Counter installed.";
  });

  installAppButton.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice && choice.outcome === "accepted") {
        heardText.textContent = "Installing Dhikr Counter...";
      }
      return;
    }

    const userAgent = navigator.userAgent || "";
    const isAppleMobile = /iPhone|iPad|iPod/i.test(userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    installHelpText.textContent = isAppleMobile
      ? "In Safari, tap the Share button, choose Add to Home Screen, then confirm Add."
      : "Open your browser menu and choose Install app or Add to Home Screen.";
    if (typeof installHelpDialog.showModal === "function" && !installHelpDialog.open) {
      installHelpDialog.showModal();
    }
  });

  closeInstallHelpButton.addEventListener("click", () => {
    installHelpDialog.close();
  });

  settingsButton.addEventListener("click", () => {
    countSoundToggle.checked = countSoundEnabled;
    darkModeToggle.checked = darkModeEnabled;
    if (tapCounterToggle) tapCounterToggle.checked = tapCounterModeEnabled;
    if (typeof settingsDialog.showModal === "function" && !settingsDialog.open) {
      settingsDialog.showModal();
    }
  });

  countSoundToggle.addEventListener("change", () => {
    countSoundEnabled = countSoundToggle.checked;
    persistState();
    if (countSoundEnabled) playCountSound();
  });

  darkModeToggle.addEventListener("change", () => {
    darkModeEnabled = darkModeToggle.checked;
    applyDisplaySettings();
    persistState();
  });

  if (tapCounterToggle) {
    tapCounterToggle.addEventListener("change", () => {
      tapCounterModeEnabled = tapCounterToggle.checked;
      syncTapCounterUi();
      wakeLockDesired = true;
      requestScreenWakeLock();
      persistState();
    });
  }

  closeSettingsButton.addEventListener("click", () => {
    settingsDialog.close();
  });

  if (tapToolsButton) {
    tapToolsButton.addEventListener("click", () => {
      updateTapToolsUi();
      if (typeof tapToolsDialog.showModal === "function" && !tapToolsDialog.open) {
        tapToolsDialog.showModal();
      }
    });
  }

  if (closeTapToolsButton) {
    closeTapToolsButton.addEventListener("click", () => {
      if (tapToolsDialog.open) {
        tapToolsDialog.close();
      }
    });
  }

  if (tapToolsDialog) {
    tapToolsDialog.addEventListener("close", () => {
      updateTapToolsUi();
    });
  }

  if (tapSetGoalButton) {
    tapSetGoalButton.addEventListener("click", () => {
      goalInput.value = tapGoalInput.value;
      setGoal();
      updateTapToolsUi();
    });
  }

  if (tapClearGoalButton) {
    tapClearGoalButton.addEventListener("click", () => {
      goal = 0;
      goalCelebrated = false;
      goalInput.value = "";
      updateGoalUi();
      persistState();
      heardText.textContent = "Target cleared.";
      updateTapToolsUi();
    });
  }

  if (tapPresetAstaghfirullah) {
    tapPresetAstaghfirullah.addEventListener("click", () => {
      loadProfile("astaghfirullah", PRESETS.astaghfirullah.label);
      updateTapToolsUi();
    });
  }

  if (tapPresetSubhanallah) {
    tapPresetSubhanallah.addEventListener("click", () => {
      loadProfile("subhanallah_wabihamdihi", PRESETS.subhanallah_wabihamdihi.label);
      updateTapToolsUi();
    });
  }

  if (tapPresetSalawat) {
    tapPresetSalawat.addEventListener("click", () => {
      loadProfile("salawat_durood", PRESETS.salawat_durood.label);
      updateTapToolsUi();
    });
  }

  if (tapCustomPhraseButton) {
    tapCustomPhraseButton.addEventListener("click", () => {
      tapCustomPhraseControl.hidden = false;
      tapPhraseInput.focus();
    });
  }

  if (tapPhraseButton) {
    tapPhraseButton.addEventListener("click", () => {
      const nextPhrase = tapPhraseInput.value.trim();
      if (!nextPhrase) {
        tapPhraseInput.focus();
        return;
      }
      phraseInput.value = nextPhrase;
      applyPhrase();
      updateTapToolsUi();
    });
  }

  if (tapPhraseInput) {
    tapPhraseInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") tapPhraseButton.click();
    });
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }

  window.addEventListener("pagehide", () => {
    persistState();
    mode = "idle";
    stopMicrophone();
    releaseScreenWakeLock();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      wakeLockDesired = true;
      requestScreenWakeLock();
    }
  });

  loadPersistedState();
  if (appVersionEl) appVersionEl.textContent = APP_VERSION;
  applyDisplaySettings();
  wakeLockDesired = true;
  syncTapCounterUi();
  const initialPreset = PRESETS[activeProfileKey];
  const initialProfile = profiles[activeProfileKey];
  loadProfile(
    activeProfileKey,
    initialPreset ? initialPreset.label : initialProfile && initialProfile.label || "Custom dhikr",
    false,
  );
  showFirstVisitNotice();
  updateInstallButton();

  window.DhikrKeywordMatcher = {
    normalizeFeatureSequence,
    dtwDistance,
    findBestTemplateDistance,
    findTemplateAgreementDistance,
    isSpeechLike,
    downsampleAudio,
    median,
  };
})();
