(function () {
  "use strict";

  const CONFIG = Object.freeze({
    requiredExamples: 3,
    outputSampleRate: 16000,
    calibrationSilenceMs: 320,
    minimumExampleMs: 500,
    maximumExampleMs: 3000,
    minimumThreshold: 0.012,
    noiseMultiplier: 2.8,
    meterBoost: 4.5,
    analysisIntervalMs: 120,
    mfccFrameSize: 512,
    mfccHopSize: 160,
    dtwBandRatio: 0.28,
    refractoryRatio: 0.72,
    minimumActiveMs: 300,
    minimumContinuousVoiceMs: 150,
    minimumActiveRatio: 0.26,
    maximumCrestFactor: 14,
    maximumSpectralFlatness: 0.58,
    requiredMatchConfirmations: 1,
  });

  const counterEl = document.querySelector("#counter");
  const startButton = document.querySelector("#startButton");
  const stopButton = document.querySelector("#stopButton");
  const resetButton = document.querySelector("#resetButton");
  const phraseInput = document.querySelector("#phraseInput");
  const phraseButton = document.querySelector("#phraseButton");
  const phraseDisplay = document.querySelector("#phraseDisplay");
  const calibrateButton = document.querySelector("#calibrateButton");
  const setupProgress = document.querySelector("#setupProgress");
  const setupHint = document.querySelector("#setupHint");
  const statusBadge = document.querySelector("#statusBadge");
  const statusText = document.querySelector("#statusText");
  const heardText = document.querySelector("#heardText");
  const micMeterTrack = document.querySelector("#micMeterTrack");
  const micMeterFill = document.querySelector("#micMeterFill");
  const micLevelText = document.querySelector("#micLevelText");

  const statusLabels = {
    waiting: "Waiting",
    starting: "Starting",
    calibrating: "Voice setup",
    listening: "Listening",
    speech: "Sound detected",
    unavailable: "Unavailable",
  };

  let count = 0;
  let activePhrase = "Astaghfirullah";
  let mode = "idle";
  let microphoneStream = null;
  let audioContext = null;
  let sourceNode = null;
  let processorNode = null;
  let silentOutputNode = null;
  let sourceSampleRate = 48000;
  let noiseFloor = 0.004;

  let calibrationSpeaking = false;
  let calibrationSpeechFrames = 0;
  let calibrationSilenceFrames = 0;
  let calibrationBuffers = [];

  let templates = [];
  let expectedDurationSamples = 0;
  let matchThreshold = 0.9;
  let listeningSamples = new Float32Array(0);
  let samplesSinceAnalysis = 0;
  let listeningTimeMs = 0;
  let lastDetectionTime = -Infinity;
  let matchCandidateStreak = 0;
  let lastCandidateTime = -Infinity;

  function setStatus(status) {
    statusBadge.className = `status ${status}`;
    statusText.textContent = statusLabels[status] || statusLabels.waiting;
  }

  function updateCounter() {
    counterEl.textContent = String(count);
  }

  function updateSetupUi() {
    const completed = templates.length >= CONFIG.requiredExamples;
    setupProgress.textContent = `${Math.min(templates.length, CONFIG.requiredExamples)} of ${CONFIG.requiredExamples}`;

    if (completed) {
      setupHint.textContent = "Voice setup complete for this session.";
      calibrateButton.textContent = "Redo voice setup";
      calibrateButton.disabled = false;
      startButton.disabled = mode === "listening";
    } else {
      if (templates.length === 1) {
        setupHint.textContent = `For example 2, say "${activePhrase}" slowly, then pause.`;
      } else if (templates.length === 2) {
        setupHint.textContent = `For example 3, say "${activePhrase}" at your fastest comfortable speed, then pause.`;
      } else {
        setupHint.textContent = `Say "${activePhrase}" once at a natural speed, then briefly pause.`;
      }
      calibrateButton.textContent = `Record example ${templates.length + 1}`;
      calibrateButton.disabled = mode === "calibrating" || mode === "starting";
      startButton.disabled = true;
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

    const threshold = Math.max(CONFIG.minimumThreshold, noiseFloor * CONFIG.noiseMultiplier);
    const hasVoiceEnergy = rms >= threshold;
    if (!hasVoiceEnergy && !calibrationSpeaking) noiseFloor = noiseFloor * 0.96 + rms * 0.04;

    if (mode === "calibrating") {
      processCalibrationBlock(input, hasVoiceEnergy);
    } else if (mode === "listening") {
      processListeningBlock(input, hasVoiceEnergy);
    }
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
    const silenceMs = framesToMs(calibrationSilenceFrames);
    const totalMs = framesToMs(totalFrames);
    if (silenceMs >= CONFIG.calibrationSilenceMs || totalMs >= CONFIG.maximumExampleMs) finishCalibrationExample();
  }

  function finishCalibrationExample() {
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
    mode = "idle";

    if (templates.length >= CONFIG.requiredExamples) {
      finalizeVoiceSetup();
      heardText.textContent = "Voice setup complete. Press Start Listening.";
      setStatus("waiting");
      stopMicrophone();
    } else {
      heardText.textContent = `Example ${templates.length} saved in memory.`;
      setStatus("waiting");
    }
    updateSetupUi();
  }

  function finalizeVoiceSetup() {
    expectedDurationSamples = Math.round(median(templates.map((template) => template.durationSamples)));
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
      Math.ceil(expectedDurationSamples * 1.6),
    );
    samplesSinceAnalysis += downsampled.length;
    listeningTimeMs += (downsampled.length / CONFIG.outputSampleRate) * 1000;

    if (hasVoiceEnergy) setStatus("speech");
    const intervalSamples = Math.round((CONFIG.analysisIntervalMs / 1000) * CONFIG.outputSampleRate);
    if (samplesSinceAnalysis < intervalSamples || listeningSamples.length < expectedDurationSamples * 0.8) return;
    samplesSinceAnalysis = 0;
    analyzeListeningWindow();
  }

  function analyzeListeningWindow() {
    if (calculateRms(listeningSamples) < CONFIG.minimumThreshold * 0.75) return;

    let bestDistance = Infinity;
    let bestShape = null;
    let bestDurationSamples = expectedDurationSamples;
    for (const durationFactor of [0.62, 0.78, 1, 1.15, 1.38]) {
      const sampleCount = Math.min(
        listeningSamples.length,
        Math.round(expectedDurationSamples * durationFactor),
      );
      const samples = listeningSamples.slice(listeningSamples.length - sampleCount);
      const candidate = extractFingerprint(samples);
      if (!candidate) continue;
      const shape = analyzeSpeechShape(samples);
      if (!isSpeechLike(shape)) continue;
      const distance = findTemplateAgreementDistance(candidate, templates);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestShape = shape;
        bestDurationSamples = sampleCount;
      }
    }

    const now = listeningTimeMs;
    const matchedDurationMs = (bestDurationSamples / CONFIG.outputSampleRate) * 1000;
    const outsideRefractory = now - lastDetectionTime >= matchedDurationMs * CONFIG.refractoryRatio;

    const candidateMatched = bestShape && bestDistance <= matchThreshold;
    const confirmationWindowMs = CONFIG.analysisIntervalMs * 2.8;

    if (candidateMatched && outsideRefractory) {
      matchCandidateStreak = now - lastCandidateTime <= confirmationWindowMs
        ? matchCandidateStreak + 1
        : 1;
      lastCandidateTime = now;

      if (matchCandidateStreak >= CONFIG.requiredMatchConfirmations) {
        lastDetectionTime = now;
        matchCandidateStreak = 0;
        count += 1;
        updateCounter();
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
    const activityThreshold = Math.max(CONFIG.minimumThreshold, noiseFloor * CONFIG.noiseMultiplier);
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
    if (!window.Meyda || samples.length < CONFIG.mfccFrameSize) return null;
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
    return normalizeFeatureSequence(sequence);
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
    previous[0] = 0;

    for (let row = 1; row <= rows; row += 1) {
      const current = new Float64Array(columns + 1).fill(Infinity);
      const start = Math.max(1, row - band);
      const end = Math.min(columns, row + band);
      for (let column = start; column <= end; column += 1) {
        const cost = featureDistance(left[row - 1], right[column - 1]);
        current[column] = cost + Math.min(previous[column], current[column - 1], previous[column - 1]);
      }
      previous = current;
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

  function resetCalibrationCapture() {
    calibrationSpeaking = false;
    calibrationSpeechFrames = 0;
    calibrationSilenceFrames = 0;
    calibrationBuffers = [];
  }

  function resetVoiceSetup() {
    templates = [];
    expectedDurationSamples = 0;
    matchThreshold = 0.9;
    listeningSamples = new Float32Array(0);
    listeningTimeMs = 0;
    matchCandidateStreak = 0;
    lastCandidateTime = -Infinity;
    resetCalibrationCapture();
    updateSetupUi();
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

  async function beginCalibration() {
    if (templates.length >= CONFIG.requiredExamples) resetVoiceSetup();
    mode = "starting";
    setStatus("starting");
    calibrateButton.disabled = true;
    heardText.textContent = "Opening the microphone...";
    try {
      await ensureMicrophone();
      mode = "calibrating";
      setStatus("calibrating");
      heardText.textContent = `Say "${activePhrase}" once, then pause.`;
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

  calibrateButton.addEventListener("click", beginCalibration);

  function applyPhrase() {
    const nextPhrase = phraseInput.value.trim();
    if (!nextPhrase) {
      heardText.textContent = "Enter a dhikr phrase first.";
      phraseInput.focus();
      return;
    }
    if (nextPhrase === activePhrase) return;

    mode = "idle";
    stopMicrophone();
    activePhrase = nextPhrase;
    phraseDisplay.textContent = activePhrase;
    count = 0;
    updateCounter();
    stopButton.disabled = true;
    setStatus("waiting");
    resetVoiceSetup();
    heardText.textContent = `Record three examples of "${activePhrase}" to begin.`;
  }

  phraseButton.addEventListener("click", applyPhrase);
  phraseInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") applyPhrase();
  });

  startButton.addEventListener("click", async () => {
    if (templates.length < CONFIG.requiredExamples) return;
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
      setStatus("listening");
      stopButton.disabled = false;
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
    mode = "idle";
    stopMicrophone();
    stopButton.disabled = true;
    setStatus("waiting");
    heardText.textContent = "Listening stopped.";
    updateSetupUi();
  });

  resetButton.addEventListener("click", () => {
    count = 0;
    updateCounter();
    heardText.textContent = mode === "listening"
      ? "Listening for your calibrated phrase..."
      : templates.length >= CONFIG.requiredExamples
        ? "Voice setup is ready."
        : "Complete voice setup to begin.";
  });

  window.addEventListener("pagehide", () => {
    mode = "idle";
    stopMicrophone();
    templates = [];
  });

  updateSetupUi();

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
