# Módulo B · «El tránsito de una voz» + auditoría de `index.html`

This documents two things requested together:

1. **A new visualization module on key `B`** that stages the flows of
   `BiocracyEngine_dossier.tex` in rotatable / zoomable 3-D, and **proves the
   shared ETH-fed drone is also driven by this module.**
2. **An audit of every control/readout in the control surface
   (`src/projector/views/parliament.html` — the "index.html")**, marking what is
   dead and ★ what *replicates* but has **no incidence over the SuperCollider
   instruments.**

---

## 1 · Module B — `Transito`

| Piece | Path |
|---|---|
| Artist module (standalone ES module) | `nw_wrld_local/ecosystems/default_ecosystem/modules/Transito.js` |
| Loader + data bridge | `nw_wrld_local/src/projector/btransito/btransito.ts` |
| Wiring (import, `mountTransitoSlot`, key `b`, keydown regex) | `nw_wrld_local/src/projector/visualizationSwitcher.ts` |

**What it draws** (the four figures of the dossier folded into one diagram):

- **Fig. 1** — the three-RV simplex (Virtual / Vegetal / Validada) with edges
  *barely curved* (so as not to fix Nature as Euclidean objects), ringed by the
  slow **phenological clock** (reloj fenológico).
- **Fig. 2/3** — the autómata as a live path: `SENSED → PRESENT → OVERLAP →
  ADJUDICATED`, then the bifurcation to **INSCRIBED** (BioToken hexagon → cadena
  comunitaria) or **OPAQUE** (a dotted veil the diagram refuses to draw inside).
  The **Overlap Buffer** is the deliberative heart: a dashed aura with
  von-Foerster branches (*+1 opción por futuro*).
- **Fig. 4** — the **desintermediación**: the grey extractive line that leaves
  open toward the Global North (with the `warn` *cut*), versus the vivid
  biocratic **closed loop** that returns value/governance to territory.

**Voices** (the political act) spawn on ETH inflow / eco signals / votes, transit
the machine, and bifurcate. Probability of OPAQUE rises with `(1 − consensus)`
and the season — Glissant's clause as a transition the machine is forbidden to
complete.

**Aesthetic:** 1-bit / Russian-constructivist. The palette is copied verbatim
from the LaTeX preamble (`ink`, `rule`, `virtual`, `vegetal`, `validada`,
`token`, `opaque`, `warn` on `paper`). Flat colour, hard geometric primitives,
`NearestFilter` text sprites, **no glow / no additive bloom.** OrbitControls give
rotate + zoom + pan in the viewport.

### The drone proof
Every module hums the same `\opalDrone`, whose body is driven by the **ETH
inflow** (`eth_sonify.py → /eth/note,/eth/tx_info → SC /tx → transactionInfluence
→ \opalDrone`). Module B *also* drives it: each voice that reaches **INSCRIBED**
raises the machine's `throughput`; the loader reads `getThroughput()` /
`getCoherence()` every 280 ms and pushes them back as

```
/soneth/dronedepth   ← 0.22 + throughput·0.63
/soneth/dronemix     ← 0.30 + throughput·0.50
/soneth/dronefade    ← 0.30 + coherence·0.45
/soneth/dronespace   ← 0.30 + spatialspread·0.45
```

— the exact busses `\opalDrone` reads in `3_synthdefs.scd` / `6_osc_handlers.scd`.
The pushed values are mirrored to `window.__transitoDrone` and printed live on
the module's 1-bit HUD ("DRONE ← tránsito → SC /soneth/*"), so the deliberative
machine is *heard* deepening the same base drone the blockchain feeds.

---

## 2 · `index.html` audit (control surface)

The real SuperCollider instrument surface is the set of OSC addresses with a
handler in `*.scd` (mainly `6_osc_handlers.scd`): all `/soneth/*`, all
`/pheno/*`, and `/parliament/{start,stop,vote,emergency,fx/*}`. Everything below
is judged against that.

### A · KEEP — genuinely drive SuperCollider ✓
- **sonETH · Ambient → SC + VIZ** — all 21 sliders map to live `/soneth/*`
  handlers (`\masterVolume … \droneDepth … \transactionInfluence`). ✓
- **Cámara Fenológica · Bosque / Quórum** — 7 sliders + bancada/season buttons →
  `/pheno/*`. ✓
- **Democratic Actions** — Vote / Start / Stop / Emergency → `/parliament/*`. ✓

### B · ★ REPLICAS WITH NO INCIDENCE OVER THE SC INSTRUMENTS
These were titled "→ SC" but **SuperCollider has no handler for their OSC
address.** They only mutate the browser store + the visualization. They are
*connected to a flow* (the viz), so they were **kept but relabeled `→ VIZ`** to
stop the UI lying about audio:

| Control | Emits | SC handler? | Action |
|---|---|---|---|
| ★ Rotation Spd | `/parliament/rotation` | none | relabeled `Parliament → VIZ` |
| ★ Consensus | `/parliament/consensus` | none | relabeled `Parliament → VIZ` |
| ★ Species Activity (n sliders) | `/agents/species/activity` | none | relabeled `→ VIZ` |
| ★ Species Presence (n sliders) | `/agents/species/presence` | none | relabeled `→ VIZ` |
| ★ eDNA Biodiversity (n sliders) | `/agents/edna/biodiversity` | none | relabeled `→ VIZ` |

Extra tell: the store ingests `/agent/*` (singular) while these sliders emit
`/agents/*` (plural); **SC handles neither.**

### C · REMOVED — dead, no input path at all
- **"Fungi Networks"** (`#fungi-tele`, `fg-bar-*`)
- **"Gaia AI Core"** (`bar/val-ai-c`, `bar/val-ai-o`)

Both fed from `/agent/fungi/state` and `/agent/ai/state`, which **have no emitter
anywhere in the repo** (verified across `*.scd`, `*.py`, `*.js`), and their
former control sliders were already replaced by the Cámara Fenológica panels.
They displayed frozen defaults only. `setBar`/`setVal` null-guard, so the
orphaned writes are harmless no-ops.

### D · CORRECTED — static labels that were misleading/incomplete
- `#footer-bridge` — hardcoded `UDP:57120`, never updated, and wrong from the
  browser's view → `WS:3334 · UDP:57120` (the actual hop chain).
- `#viz-hint` — `0–9 · switch viz` omitted the letter slots → `0–9 · P · F · B ·
  switch viz`.

### E · BUG FIXED (a different kind of "no effect")
Nine sonETH sliders reach SC fine but their **numeric readout never updated on
drag** because they were missing from `SLIDER_DISP_PREFIX` in
`parliamentEntry.ts` (`masteramp, filtercutoff, noiselevel, noisefilt,
dronedepth, dronefade, dronespace, dronemix, delayfeedback`). The 9 mappings were
added, so every sound-altering slider now shows its live value.

### Left untouched (live, correct)
Header readouts, Parliament State bars, BioToken V3 (computed in-browser),
Acoustic Species / eDNA Sites tele (move via the VIZ sliders + biome highlight),
spectrogram, structural containers.

---

## 3 · Follow-up: real audio incidence + a connection fix

### Replica sliders now bias the instrument (browser-side macros)
The §B sliders kept their VIZ role **and** now drive SuperCollider, each routed
to the conceptually-matching `/soneth/*` fader (which reaches SC through the
proven `browser → bridge(:3334) → SC(:57120)` path). The fine-tune slider visibly
moves too, so the macro is legible. Implemented in `parliamentEntry.ts`
(`REPLICA_MACROS` + `driveSonethSlider`):

| Replica | Drives `/soneth/…` | Rationale |
|---|---|---|
| Rotation Spd | `beatTempo` | the assembly's turning = the cyclical pulse |
| Consensus | `harmonicrich` ↑ + `noiselevel` ↓ | agreement = harmonic resolution, quieter floor |
| Species Activity | `texturedepth` | liveliness = granular density |
| Species Presence | `atmospheremix` | being-there = enveloping bloom |
| eDNA Biodiversity | `spectralshift` | biodiversity = brighter, more open spectrum |

### Connection failure found + fixed: `/bio/*` vs `/eco/*`
The engine **does** run, but the browser was listening on the wrong addresses:
SC emits `/bio/{nutrient,consensus,density}` (`5_beat_engine.scd`,
`6_osc_handlers.scd` → `~visualsDest = 127.0.0.1:3333`), while `parliamentStore`
only consumed `/eco/*` and `/agent/*`, **which have no emitter anywhere**. Result:
Eco Signals telemetry and every ecosystem module's eco-coupling (DarkForest *and*
Transito) were starved even with ETH flowing.

Fix (`parliamentStore.ts`, additive — `/eco/*` kept): ingest `/bio/*` →
`eco.co2/mycoPulse/nitrogen/phosphorus` + `consensusWave`. Now real transaction
throughput drives the eco triggers → Transito spawns voice bursts → throughput →
`/soneth/drone*` → the same `\opalDrone` the ETH inflow feeds. The live loop
closes.

### `start_ecosystem.sh` review
Solid overall (dependency checks, project-scoped teardown, port frees, health
gates on `:9001` and `CONTROL BUS SETUP COMPLETE`, unified cleanup trap).
- **Verified connected:** ETH→SC `:57120`, browser→SC via bridge, SC→bridge `:3333`,
  UI opened only after SC boot.
- **Fixed:** added `3335` (bridge DIAG http) to the orphan-port free list — a
  wedged bridge holding it would make the new bridge fail to bind and silently
  drop every slider→SC message.
- **Optional next step (not applied):** after Paso 1.5, health-check
  `curl -sf http://localhost:3335/diag` before booting SC, so a dead bridge is
  caught immediately rather than surfacing as "the sliders feel dead."
