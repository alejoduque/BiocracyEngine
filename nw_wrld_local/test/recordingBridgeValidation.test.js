const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { sanitizeJsonForBridge } = require(path.join(
  __dirname,
  "..",
  "dist",
  "runtime",
  "shared",
  "validation",
  "jsonBridgeValidation.js"
));

test("recordingData.json sanitize normalizes invalid top-level value", () => {
  const res = sanitizeJsonForBridge("recordingData.json", null, { recordings: {} });
  assert.deepEqual(res, { recordings: {} });
});

test("recordingData.json sanitize drops invalid sequences and clamps pattern", () => {
  const input = {
    recordings: {
      t1: {
        channels: [
          {
            name: "ch1",
            sequences: [
              { time: 0.1, duration: 0.1 },
              { time: "x", duration: 0.2 },
            ],
          },
        ],
        sequencer: { pattern: { "1": [0, "x", 16, -1, 2, 2] } },
      },
    },
  };

  const res = sanitizeJsonForBridge("recordingData.json", input, { recordings: {} });
  assert.deepEqual(res, {
    recordings: {
      t1: {
        channels: [{ name: "ch1", sequences: [{ time: 0.1, duration: 0.1 }] }],
        sequencer: { pattern: { "1": [0, 2] } },
      },
    },
  });
});

test("recordingData.json sanitize preserves valid shape", () => {
  const input = {
    recordings: {
      "123": {
        channels: [{ name: "ch2", sequences: [{ time: 1, duration: 0.1 }] }],
        sequencer: { pattern: { "2": [0, 3, 7] } },
      },
    },
  };
  const res = sanitizeJsonForBridge("recordingData.json", input, { recordings: {} });
  assert.deepEqual(res, input);
});
