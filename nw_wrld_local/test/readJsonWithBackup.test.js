const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const { readJsonWithBackup, readJsonWithBackupSync } = require(path.join(
  __dirname,
  "..",
  "dist",
  "runtime",
  "shared",
  "json",
  "readJsonWithBackup.js"
));

test("readJsonWithBackup uses primary when valid", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nw_wrld_jsonbackup_"));
  const p = path.join(dir, "x.json");
  fs.writeFileSync(p, JSON.stringify({ ok: 1 }), "utf-8");
  const res = await readJsonWithBackup(p, { ok: 0 });
  assert.deepEqual(res, { ok: 1 });
});

test("readJsonWithBackup falls back to .backup when primary invalid", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nw_wrld_jsonbackup_"));
  const p = path.join(dir, "x.json");
  fs.writeFileSync(p, "{not json", "utf-8");
  fs.writeFileSync(p + ".backup", JSON.stringify({ ok: 2 }), "utf-8");
  const res = await readJsonWithBackup(p, { ok: 0 });
  assert.deepEqual(res, { ok: 2 });
});

test("readJsonWithBackupSync returns default when both primary and backup fail", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nw_wrld_jsonbackup_"));
  const p = path.join(dir, "x.json");
  const res = readJsonWithBackupSync(p, { ok: 0 });
  assert.deepEqual(res, { ok: 0 });
});
