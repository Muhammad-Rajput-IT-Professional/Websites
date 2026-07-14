const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function element() {
  return {
    addEventListener() {},
    className: "",
    disabled: false,
    focus() {},
    hidden: false,
    open: false,
    close() { this.open = false; },
    showModal() { this.open = true; },
    scrollIntoView() {},
    setAttribute() {},
    style: {},
    textContent: "",
    value: "",
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
  "#noiseSetupButton", "#clearNoiseSetupButton", "#noiseSetupHint",
  "#setupRequiredDialog", "#closeSetupDialogButton", "#setupTitle",
  "#accuracyNoticeDialog", "#acceptAccuracyNoticeButton",
]) {
  elements.set(selector, element());
}

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const sandbox = {
  window: {
    addEventListener() {},
    localStorage: { getItem() { return null; }, setItem() {} },
  },
  document: { querySelector: (selector) => elements.get(selector) },
  navigator: {},
  console,
  Float32Array,
  Float64Array,
  performance,
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const matcher = sandbox.window.DhikrKeywordMatcher;

function sequence(length, frequency, offset = 0) {
  return Array.from({ length }, (_, frame) => Array.from(
    { length: 13 },
    (_, dimension) => Math.sin((frame + offset) * frequency + dimension * 0.21),
  ));
}

const template = matcher.normalizeFeatureSequence(sequence(55, 0.18));
const similar = matcher.normalizeFeatureSequence(sequence(58, 0.18, 0.6));
const unrelated = matcher.normalizeFeatureSequence(sequence(55, 0.47, 2));

const similarDistance = matcher.dtwDistance(template, similar);
const unrelatedDistance = matcher.dtwDistance(template, unrelated);
assert(similarDistance < unrelatedDistance);
assert.strictEqual(
  matcher.findBestTemplateDistance(similar, [{ fingerprint: template }]),
  similarDistance,
);
assert(
  Math.abs(matcher.findTemplateAgreementDistance(similar, [
    { fingerprint: template },
    { fingerprint: unrelated },
    { fingerprint: template },
  ]) - similarDistance) < 1e-12,
);
assert.strictEqual(matcher.isSpeechLike({
  activeMs: 500,
  activeRatio: 0.7,
  continuousVoiceMs: 400,
  crestFactor: 4,
  spectralFlatness: 0.15,
}), true);
assert.strictEqual(matcher.isSpeechLike({
  activeMs: 32,
  activeRatio: 0.05,
  continuousVoiceMs: 32,
  crestFactor: 30,
  spectralFlatness: 0.9,
}), false);

const downsampled = matcher.downsampleAudio(new Float32Array(48000), 48000, 16000);
assert.strictEqual(downsampled.length, 16000);
assert.strictEqual(matcher.median([8, 2, 5]), 5);

console.log("Keyword matcher tests passed");
