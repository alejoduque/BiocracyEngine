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

test("appState.json sanitize enforces stable keys and types", () => {
  const defaultValue = {
    activeTrackId: null,
    activeSetId: null,
    sequencerMuted: false,
    workspacePath: null,
  };
  const input = {
    activeTrackId: "  ",
    activeSetId: 123,
    sequencerMuted: "nope",
    workspacePath: "  /tmp/project  ",
  };
  const res = sanitizeJsonForBridge("appState.json", input, defaultValue);
  assert.deepEqual(res, {
    activeTrackId: null,
    activeSetId: null,
    sequencerMuted: false,
    workspacePath: "/tmp/project",
  });
});

test("appState.json sanitize preserves valid values", () => {
  const defaultValue = {
    activeTrackId: null,
    activeSetId: null,
    sequencerMuted: false,
    workspacePath: null,
  };
  const input = {
    activeTrackId: 1,
    activeSetId: "set_1",
    sequencerMuted: true,
    workspacePath: null,
  };
  const res = sanitizeJsonForBridge("appState.json", input, defaultValue);
  assert.deepEqual(res, input);
});
