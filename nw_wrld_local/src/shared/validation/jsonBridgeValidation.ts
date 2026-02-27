type Jsonish = string | number | boolean | null | undefined | object;

import { sanitizeUserDataForBridge } from "./userDataValidation";
import { sanitizeAppStateForBridge } from "./appStateValidation";

function isPlainObject(value: Jsonish): value is Record<string, Jsonish> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

function isArray(value: Jsonish): value is Jsonish[] {
  return Array.isArray(value);
}

function isFiniteNumber(value: Jsonish): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asNonEmptyString(value: Jsonish): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s ? s : null;
}

function normalizeRecordingDataJson(value: Jsonish): Jsonish {
  if (!isPlainObject(value)) return { recordings: {} };
  const recordingsRaw = value.recordings;
  if (!isPlainObject(recordingsRaw)) return { recordings: {} };

  let changed = false;
  const recordingsOut: Record<string, Jsonish> = {};

  for (const [trackId, recRaw] of Object.entries(recordingsRaw)) {
    if (!isPlainObject(recRaw)) {
      changed = true;
      continue;
    }

    const channelsRaw = isArray(recRaw.channels) ? recRaw.channels : [];
    const channelsOut: Jsonish[] = [];
    if (!isArray(recRaw.channels)) changed = true;

    for (const chRaw of channelsRaw) {
      if (!isPlainObject(chRaw)) {
        changed = true;
        continue;
      }
      const name = asNonEmptyString(chRaw.name);
      if (!name) {
        changed = true;
        continue;
      }
      const sequencesRaw = isArray(chRaw.sequences) ? chRaw.sequences : [];
      const sequencesOut: Jsonish[] = [];
      if (!isArray(chRaw.sequences)) changed = true;

      for (const seqRaw of sequencesRaw) {
        if (!isPlainObject(seqRaw)) {
          changed = true;
          continue;
        }
        const time = isFiniteNumber(seqRaw.time) ? seqRaw.time : null;
        const duration = isFiniteNumber(seqRaw.duration)
          ? seqRaw.duration
          : null;
        if (time == null || duration == null) {
          changed = true;
          continue;
        }
        sequencesOut.push({ time, duration });
        if (seqRaw.time !== time || seqRaw.duration !== duration)
          changed = true;
      }

      const outCh: Record<string, Jsonish> = { name, sequences: sequencesOut };
      channelsOut.push(outCh);
      if (chRaw.name !== name || chRaw.sequences !== sequencesRaw)
        changed = true;
    }

    const sequencerRaw = isPlainObject(recRaw.sequencer)
      ? recRaw.sequencer
      : null;
    const patternRaw =
      sequencerRaw && isPlainObject(sequencerRaw.pattern)
        ? sequencerRaw.pattern
        : null;

    let sequencerOut: Jsonish = undefined;
    if (patternRaw) {
      const patternOut: Record<string, Jsonish> = {};
      for (const [channelKey, stepsRaw] of Object.entries(patternRaw)) {
        const stepsArr = isArray(stepsRaw) ? stepsRaw : [];
        const stepsOut = stepsArr
          .map((s) => (typeof s === "number" && Number.isInteger(s) ? s : null))
          .filter((s): s is number => s != null)
          .filter((s) => s >= 0 && s <= 15);
        if (!stepsOut.length) {
          if (isArray(stepsRaw) && stepsArr.length) changed = true;
          continue;
        }
        patternOut[String(channelKey)] = Array.from(new Set(stepsOut)).sort(
          (a, b) => a - b
        );
        if (stepsOut.length !== stepsArr.length) changed = true;
      }
      sequencerOut = { pattern: patternOut };
      if (recRaw.sequencer !== sequencerRaw) changed = true;
    } else if (recRaw.sequencer != null) {
      changed = true;
      sequencerOut = { pattern: {} };
    } else {
      sequencerOut = undefined;
    }

    const outRec: Record<string, Jsonish> = { channels: channelsOut };
    if (sequencerOut) outRec.sequencer = sequencerOut;
    recordingsOut[String(trackId)] = outRec;
    if (recRaw.channels !== channelsRaw || recRaw.sequencer !== sequencerRaw)
      changed = true;
  }

  if (!changed) return value;
  return { recordings: recordingsOut };
}

export function sanitizeJsonForBridge(
  safeFilename: string,
  value: Jsonish,
  defaultValue: Jsonish
): Jsonish {
  if (safeFilename === "userData.json") {
    return sanitizeUserDataForBridge(value, defaultValue);
  }

  if (safeFilename === "recordingData.json") {
    if (!isPlainObject(defaultValue)) {
      return normalizeRecordingDataJson(value);
    }
    const normalized = normalizeRecordingDataJson(value);
    if (!isPlainObject(normalized)) return defaultValue;
    return normalized;
  }

  if (safeFilename === "appState.json") {
    return sanitizeAppStateForBridge(value, defaultValue);
  }

  if (safeFilename === "config.json") {
    if (!isPlainObject(value)) return defaultValue;
    return value;
  }

  return defaultValue;
}
