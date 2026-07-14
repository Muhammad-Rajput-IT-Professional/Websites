const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function createElement() {
  const handlers = {};
  return {
    handlers,
    attributes: {},
    className: "",
    disabled: false,
    focus() {},
    hidden: false,
    open: false,
    close() { this.open = false; },
    showModal() { this.open = true; },
    scrollIntoView() {},
    style: {},
    textContent: "",
    value: "",
    addEventListener(name, handler) { handlers[name] = handler; },
    setAttribute(name, value) { this.attributes[name] = value; },
  };
}

const elements = new Map();
for (const selector of [
  "#counter", "#startButton", "#stopButton", "#resetButton", "#calibrateButton",
  "#goalInput", "#setGoalButton", "#clearGoalButton", "#goalProgress", "#restartSetupButton",
  "#phraseInput", "#phraseButton", "#phraseDisplay",
  "#presetAstaghfirullah", "#presetSubhanallah", "#customPhraseButton", "#customPhraseControl",
  "#setupProgress", "#setupHint", "#statusBadge", "#statusText", "#heardText",
  "#micMeterTrack", "#micMeterFill", "#micLevelText",
  "#setupRequiredDialog", "#closeSetupDialogButton", "#setupTitle",
]) {
  elements.set(selector, createElement());
}

let currentProcessor;
let microphoneStops = 0;
const savedValues = new Map();

function audioNode() {
  return { connect() {}, disconnect() {} };
}

class FakeAudioContext {
  constructor() {
    this.state = "running";
    this.sampleRate = 48000;
    this.destination = {};
  }
  createMediaStreamSource() { return audioNode(); }
  createGain() { return { ...audioNode(), gain: { value: 1 } }; }
  createScriptProcessor() {
    const handlers = {};
    currentProcessor = {
      ...audioNode(),
      addEventListener(name, handler) { handlers[name] = handler; },
      removeEventListener() {},
      emit(samples) {
        handlers.audioprocess({ inputBuffer: { getChannelData: () => samples } });
      },
    };
    return currentProcessor;
  }
  close() { return Promise.resolve(); }
}

function rms(samples) {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

const Meyda = {
  extract(names, frame) {
    const energy = rms(frame);
    const mfcc = Array.from({ length: 13 }, (_, dimension) => {
      let value = 0;
      const stride = dimension + 2;
      for (let index = dimension; index < frame.length; index += stride) value += frame[index];
      return value / Math.ceil(frame.length / stride) + dimension * 0.01;
    });
    return { mfcc, rms: energy, spectralFlatness: energy > 0.01 ? 0.12 : 1 };
  },
};

const fakeWindow = {
  Meyda,
  AudioContext: FakeAudioContext,
  addEventListener() {},
  localStorage: {
    getItem(key) { return savedValues.get(key) || null; },
    setItem(key, value) { savedValues.set(key, String(value)); },
  },
};
const sandbox = {
  window: fakeWindow,
  document: { querySelector: (selector) => elements.get(selector) },
  navigator: {
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [{ stop: () => { microphoneStops += 1; } }],
      }),
    },
    vibrate() {},
  },
  console,
  Float32Array,
  Float64Array,
  performance,
};

function voiceBlock(blockIndex) {
  return Float32Array.from({ length: 4096 }, (_, index) => (
    0.055 * Math.sin((index + blockIndex * 4096) * 0.037)
    + 0.025 * Math.sin((index + blockIndex * 4096) * 0.083)
  ));
}

const silenceBlock = new Float32Array(4096);
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

async function recordExample(voiceBlocks = 8) {
  await elements.get("#calibrateButton").handlers.click();
  for (let block = 0; block < voiceBlocks; block += 1) currentProcessor.emit(voiceBlock(block));
  for (let block = 0; block < 4; block += 1) currentProcessor.emit(silenceBlock);
}

(async () => {
  await elements.get("#startButton").handlers.click();
  assert.strictEqual(elements.get("#setupRequiredDialog").open, true);
  elements.get("#closeSetupDialogButton").handlers.click();
  elements.get("#stopButton").handlers.click();
  assert.strictEqual(elements.get("#setupRequiredDialog").open, true);
  elements.get("#closeSetupDialogButton").handlers.click();

  elements.get("#customPhraseButton").handlers.click();
  elements.get("#phraseInput").value = "My Dhikr";
  elements.get("#phraseButton").handlers.click();
  assert.strictEqual(elements.get("#phraseDisplay").textContent, "My Dhikr");
  assert.strictEqual(elements.get("#setupProgress").textContent, "0 of 3");

  await recordExample();
  assert.strictEqual(elements.get("#setupProgress").textContent, "1 of 3");
  elements.get("#restartSetupButton").handlers.click();
  assert.strictEqual(elements.get("#setupProgress").textContent, "0 of 3");

  await recordExample();
  await recordExample(11);
  await recordExample(6);

  assert.strictEqual(elements.get("#setupProgress").textContent, "3 of 3");
  assert.strictEqual(elements.get("#startButton").disabled, false);
  assert.strictEqual(microphoneStops, 2);

  elements.get("#goalInput").value = "1";
  elements.get("#setGoalButton").handlers.click();
  assert.strictEqual(elements.get("#goalProgress").textContent, "0 / 1 - 1 remaining");

  await elements.get("#startButton").handlers.click();

  const snapBlock = new Float32Array(4096);
  snapBlock[100] = 0.9;
  for (let block = 0; block < 12; block += 1) currentProcessor.emit(snapBlock);
  assert.strictEqual(Number(elements.get("#counter").textContent), 0);

  for (let block = 0; block < 30; block += 1) currentProcessor.emit(voiceBlock(block % 8));

  assert(Number(elements.get("#counter").textContent) >= 1);
  const normalCount = Number(elements.get("#counter").textContent);
  assert.strictEqual(elements.get("#goalProgress").textContent, "1 reached");

  for (let block = 0; block < 8; block += 1) currentProcessor.emit(silenceBlock);
  assert.strictEqual(Number(elements.get("#counter").textContent), normalCount);

  for (let block = 0; block < 36; block += 1) currentProcessor.emit(voiceBlock(block % 6));
  const fastCount = Number(elements.get("#counter").textContent);
  assert(fastCount >= normalCount + 2, `normal=${normalCount}, after-fast=${fastCount}`);

  for (let block = 0; block < 55; block += 1) currentProcessor.emit(voiceBlock(block % 11));
  const slowCount = Number(elements.get("#counter").textContent);
  assert(slowCount >= fastCount + 2, `after-fast=${fastCount}, after-slow=${slowCount}`);
  assert.strictEqual(elements.get("#startButton").disabled, true);

  elements.get("#stopButton").handlers.click();
  assert.strictEqual(elements.get("#micLevelText").textContent, "Off");
  assert.strictEqual(microphoneStops, 3);

  const saved = JSON.parse(savedValues.get("dhikr-counter-profiles-v1"));
  assert.strictEqual(saved.profiles["custom:my dhikr"].count, slowCount);
  assert.strictEqual(saved.profiles["custom:my dhikr"].goal, 1);
  assert.strictEqual(saved.profiles["custom:my dhikr"].templates.length, 3);

  elements.get("#presetSubhanallah").handlers.click();
  assert.strictEqual(Number(elements.get("#counter").textContent), 0);
  assert.strictEqual(elements.get("#setupProgress").textContent, "0 of 3");

  elements.get("#customPhraseButton").handlers.click();
  elements.get("#phraseInput").value = "My Dhikr";
  elements.get("#phraseButton").handlers.click();
  assert.strictEqual(Number(elements.get("#counter").textContent), slowCount);
  assert.strictEqual(elements.get("#setupProgress").textContent, "3 of 3");
  assert.strictEqual(elements.get("#startButton").disabled, false);

  console.log("Listening flow tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
