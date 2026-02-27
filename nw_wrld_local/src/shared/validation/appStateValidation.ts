type Jsonish = string | number | boolean | null | undefined | object;

function isPlainObject(value: Jsonish): value is Record<string, Jsonish> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

function asTrimmedStringOrNull(value: Jsonish): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s ? s : null;
}

function normalizeActiveId(value: Jsonish): string | number | null {
  if (typeof value === "string") {
    const s = value.trim();
    return s ? s : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function defaultAppState(defaultValue: Jsonish): Record<string, Jsonish> {
  if (isPlainObject(defaultValue)) return defaultValue;
  return {
    activeTrackId: null,
    activeSetId: null,
    sequencerMuted: false,
    workspacePath: null,
  };
}

export function sanitizeAppStateForBridge(
  value: Jsonish,
  defaultValue: Jsonish
): Jsonish {
  const fallback = defaultAppState(defaultValue);
  if (!isPlainObject(value)) return fallback;

  let changed = false;
  let out: Record<string, Jsonish> = value;
  const ensure = () => {
    if (out === value) out = { ...value };
    changed = true;
  };

  const activeTrackId = normalizeActiveId(out.activeTrackId);
  if (out.activeTrackId !== activeTrackId) {
    ensure();
    out.activeTrackId = activeTrackId;
  }

  const activeSetId = asTrimmedStringOrNull(out.activeSetId);
  if (out.activeSetId !== activeSetId) {
    ensure();
    out.activeSetId = activeSetId;
  }

  const sequencerMuted = out.sequencerMuted === true;
  if (out.sequencerMuted !== sequencerMuted) {
    ensure();
    out.sequencerMuted = sequencerMuted;
  }

  const workspacePath = asTrimmedStringOrNull(out.workspacePath);
  if (out.workspacePath !== workspacePath) {
    ensure();
    out.workspacePath = workspacePath;
  }

  return changed ? out : value;
}
