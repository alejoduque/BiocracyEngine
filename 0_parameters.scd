// SuperCollider Ethereum Sonification - Canonical Parameter Registry
// Loaded FIRST by start_sonification.scd — every other component reads this.
//
// Before this file existed the same parameter metadata lived in four places
// that had drifted apart: ~soundParams (2_midi_control), ~controlSpecs +
// ~controlValues (4_gui), the switch() denormalization table (6_osc_handlers)
// and the SC_TO_CH route table (parliament-bridge.js). Drift symptoms fixed
// by centralizing here:
//   - MIDI wrote to \dronemix / \txInfluence — buses that never existed
//     (they are \droneMix / \transactionInfluence).
//   - MIDI, GUI and OSC disagreed on ranges (spectralShift 60– vs 80–3000,
//     textureDepth 0–1 vs 0–0.6, droneFade 0–1 vs 0.1–5 s, …).
//   - The GUI echoed NATIVE units to the browser, which expects 0–1.
//
// Every control surface (MIDI CC, OSC/HTML slider, SC GUI knob) must call
// ~setParam / ~setParamNorm instead of touching ~buses directly. That single
// write path keeps bus, ~beatParams, ~controlValues, the GUI knob and the
// browser slider in sync — event-driven, no polling.

(
// ─── The registry ───────────────────────────────────────────────────────────
// One Event per parameter:
//   name      \symbol       — bus name in ~buses / key in ~controlValues
//   spec      ControlSpec   — canonical native range + warp (single copy)
//   default   Float         — boot value
//   path      String        — canonical OSC address (browser slider data-osc)
//   aliases   [String]      — extra OSC addresses accepted for compatibility
//   cc        Integer       — Faderfox LC2 MIDI CC (nil = no MIDI mapping)
//   hasBus    Boolean       — false = no control bus (e.g. beatTempo)
//   beatParam \symbol       — mirror writes into ~beatParams[beatParam]
~paramDefs = [
    // ── Row 1: Core Performance (Lawrence English ambient) ──────────────
    (name: \masterVolume,  spec: ControlSpec(0.01, 1, \lin),  default: 0.3,  path: "/soneth/volume",        cc: 0),
    // PITCH: the motors read it as semitones (±24). The voices (kick, perc,
    // pad, drone, dust, samples) read it as TWELFTHS — (p / 12).midiratio —
    // so on them the whole knob is about ±2 semitones (±1 on kick and perc).
    // Kept as it sounds; documented, not changed.
    (name: \pitchShift,    spec: ControlSpec(-24, 24, \lin),  default: 0.0,  path: "/soneth/pitchshift",    cc: 1),
    (name: \timeDilation,  spec: ControlSpec(0.5, 6, \exp),   default: 2.0,  path: "/soneth/timedilation",  cc: 2,
        aliases: ["/parliament/fx/delaytime"]),
    // Ceiling 3000 -> 2400 Hz. This bus is the LPF cutoff in EVERY voice
    // (bell, kick, perc, dust, drone), so its top end sets how bright the
    // whole engine can get. The synths now carry fixed backstops below this
    // anyway; lowering the knob means the useful range of the fader maps onto
    // the range that is actually audible instead of the top third doing nothing.
    (name: \spectralShift, spec: ControlSpec(80, 2400, \exp), default: 1000, path: "/soneth/spectralshift", cc: 3),
    (name: \spatialSpread, spec: ControlSpec(-1, 1, \lin),    default: 0.0,  path: "/soneth/spatialspread", cc: 4),

    // ── Row 2: Ambient Processing ────────────────────────────────────────
    (name: \textureDepth,  spec: ControlSpec(0, 0.6, \lin),   default: 0.2,  path: "/soneth/texturedepth",  cc: 32),
    (name: \atmosphereMix, spec: ControlSpec(0, 0.9, \lin),   default: 0.4,  path: "/soneth/atmospheremix", cc: 33,
        aliases: ["/parliament/fx/reverb"]),
    (name: \memoryFeed,    spec: ControlSpec(0, 0.8, \lin),   default: 0.3,  path: "/soneth/memoryfeed",    cc: 34),
    // Ceiling 8 -> 5. harmonicRich widens the percussion pitch pool AND sets
    // how many harmonics the triad voicing stacks, so its top end was the main
    // route to high metallic pings. It is also driven automatically by the
    // phenology reverse-breath loop, which could push it there unattended.
    (name: \harmonicRich,  spec: ControlSpec(0.1, 5, \exp),   default: 1.0,  path: "/soneth/harmonicrich",  cc: 35),
    (name: \resonantBody,  spec: ControlSpec(0.1, 0.8, \lin), default: 0.4,  path: "/soneth/resonantbody",  cc: 36),

    // ── La cámara · one room instead of forty ────────────────────────────
    //
    // Every voice in this engine carries its own small FreeVerb — thirteen in
    // the SynthDefs, which at a normal voice count is around forty independent
    // little rooms running at once. That is why the mix reads as a set of
    // synthesisers standing near each other rather than as a place: each
    // source arrives with its own private acoustic, and nothing shares an
    // early reflection with anything else.
    //
    // The reference this project names in its own first comment — Lawrence
    // English — is built the other way round. The room is the instrument. What
    // makes those records feel physical is that everything is heard through
    // ONE space, so the drone, the field recording and the noise are the same
    // distance away and belong to the same architecture.
    //
    // chamberMix is how much of the whole engine is heard through that room.
    // chamberSize is how big it is: RT60 from 2 s to 28 s. At the long end it
    // stops being reverb and becomes a resonating body that the material
    // excites — which is the point, and the reason it is a performance control
    // rather than a mastering setting.
    //
    // Defaults are deliberately modest so that adding this does not rewrite
    // the sound of the existing presets. Turn it up on purpose.
    // CC 50/51, not 37/38. Those were taken — droneFade holds 37 and droneSpace
    // holds 38 (see Row 3 below) — so one Faderfox knob was moving two
    // parameters at once, silently, in opposite halves of the engine. 50 and 51
    // are the first free pair; 52 is bowl/china and everything below 50 is
    // spoken for.
    (name: \chamberMix,   spec: ControlSpec(0, 1, \lin),      default: 0.18, path: "/soneth/chambermix",  cc: 50),
    (name: \chamberSize,  spec: ControlSpec(0, 1, \lin),      default: 0.45, path: "/soneth/chambersize", cc: 51),

    // ── Row 3: Drone/Noise Controls ──────────────────────────────────────
    // beatParam mirror added: the beat engine already multiplies
    // ~beatParams.masterAmp into every percussion \amp, but without this field
    // ~setParam never wrote it, so the slider only moved a bus. It trims the
    // SYNTH layers against the rest — drone bed, kick, perc, dust and the
    // motors — but not the pad, the bells or the corpus: hence SYNTH TRIM.
    (name: \masterAmp,     spec: ControlSpec(0, 1, \lin),     default: 0.7,  path: "/soneth/masteramp",     cc: 5,
        beatParam: \masterAmp),
    (name: \filterCutoff,  spec: ControlSpec(0, 1, \lin),     default: 0.6,  path: "/soneth/filtercutoff",  cc: 6),
    (name: \noiseLevel,    spec: ControlSpec(0, 0.5, \lin),   default: 0.1,  path: "/soneth/noiselevel",    cc: 7),
    (name: \noiseFilt,     spec: ControlSpec(0, 1, \lin),     default: 0.5,  path: "/soneth/noisefilt",     cc: 8),
    (name: \droneDepth,    spec: ControlSpec(0, 1, \lin),     default: 0.3,  path: "/soneth/dronedepth",    cc: 9),

    // ── Row 4: Additional Controls ───────────────────────────────────────
    (name: \droneFade,     spec: ControlSpec(0.1, 5, \exp),   default: 2.0,  path: "/soneth/dronefade",     cc: 37),
    (name: \droneSpace,    spec: ControlSpec(0, 1, \lin),     default: 0.5,  path: "/soneth/dronespace",    cc: 38,
        aliases: ["/parliament/fx/room"]),
    (name: \droneMix,      spec: ControlSpec(0, 1, \lin),     default: 0.5,  path: "/soneth/dronemix",      cc: 39),
    (name: \delayFeedback, spec: ControlSpec(0, 0.95, \lin),  default: 0.3,  path: "/soneth/delayfeedback", cc: 40,
        aliases: ["/parliament/fx/decaytime"]),
    (name: \transactionInfluence, spec: ControlSpec(0, 1, \lin), default: 0.3, path: "/soneth/txInfluence", cc: 41,
        beatParam: \transactionInfluence),

    // ── Row 5: Cámara Fenológica de lo Vivo (Capítulo VI) ────────────────
    (name: \activityThreshold, spec: ControlSpec(0.20, 0.85, \lin), default: 0.50, path: "/pheno/activityThreshold", cc: 10),
    (name: \windowWidth,       spec: ControlSpec(0.4, 2.5, \lin),   default: 1.0,  path: "/pheno/windowWidth",       cc: 11),
    (name: \seasonalBias,      spec: ControlSpec(-1.0, 1.0, \lin),  default: 0.0,  path: "/pheno/seasonalBias",      cc: 12),
    (name: \absenceWeight,     spec: ControlSpec(0, 1, \lin),       default: 0.3,  path: "/pheno/absenceWeight",     cc: 13),
    // pulseGain 1.0 → 2.0 is also CORO's level, and opacityFloor from 0.1 is
    // also CINTA (18_motores.scd, Fogata). Below those points both do only
    // what they always did, so every config saved before still sounds the same.
    (name: \pulseGain,         spec: ControlSpec(0.0, 2.0, \lin),   default: 1.0,  path: "/pheno/pulseGain",         cc: 14),
    (name: \opacityFloor,      spec: ControlSpec(0.0, 0.7, \lin),   default: 0.0,  path: "/pheno/opacityFloor",      cc: 15),
    // Five positions: 0 = todas, then one per ecological role the AudioMoth
    // detector actually yields. Art. 43 defines the bancadas taxonomically,
    // but the corpus carries no taxonomy — only roles — so roles are what this
    // filter can honestly act on. dawn and dusk chorus are one bancada: dawn
    // alone has 6 events in 261, too few to convene a seat of its own.
    (name: \bancada,           spec: ControlSpec(0, 4, \lin, 1),    default: 0,    path: "/pheno/bancada",           cc: 16),
    // Ring speed, in phenological days per second (Art. 42: the calendar is a
    // ring of 365, not a line). Exponential because the useful span is four
    // orders of magnitude: 4.0 scrubs the whole year in 91 s; the 0.0167
    // default is one day per minute, so a recorded day lasts exactly as long
    // as one AudioMoth clip and the full ring takes 6h05m; 0.002 is the deep
    // reading where one day is 8 minutes — the same x8 the ultrasonic tier
    // uses, so the bat's time becomes the calendar's.
    // Ceiling lowered 4.0 -> 0.0167 days/s: ONE MINUTE per phenological day is
    // now the FASTEST the ring can turn, not a mid-fader value. The old top
    // scrubbed a day in 0.2 s, which is not a calendar being read, it is a
    // seek bar — and because the spec is exponential, most of the fader's
    // travel sat above the useful range and it was easy to land far too fast.
    // The floor is unchanged, so the slow reading (8 min/day) is still there
    // and the whole fader now spans minute-per-day to eight-minutes-per-day.
    (name: \phenoRate,         spec: ControlSpec(0.002, 0.0167, \exp), default: 0.0167, path: "/pheno/rate",            cc: 21),
    // How often the ring skips a silent day and goes to the next recorded
    // one. Each unrecorded day is a coin toss at this probability, so it is
    // how much absence is heard between recordings, not a switch: at 0 the
    // calendar is read as it is (Art. 44, 331 of 365 days silent), at 0.5
    // about one silent day sits between recordings, at 1 only the days the
    // forest was recorded are heard. The skip lands on the next day that
    // actually admits a clip under UMBRAL/VENTANA/BANCADA/OPACIDAD. It does
    // not make audio up; it only decides how much of the waiting is heard.
    // Default 0, so the honest calendar stays the default reading.
    (name: \phenoSeek,         spec: ControlSpec(0, 1, \lin),       default: 0.0,  path: "/pheno/seek"),
    // Level of the field-recording layer against the synthesis. Its own fader
    // because the corpus is a fourth actor, not an effect on the other three.
    (name: \corpusLevel,       spec: ControlSpec(0, 1, \lin),       default: 0.5,  path: "/pheno/corpusLevel",       cc: 22),
    // How much of the chain's own behaviour is allowed to act on the forest
    // recordings. 0 is the corpus untouched; 1 is fully processed by what the
    // chain is doing — see 17_chain_processing.scd for why this is the shape
    // the coupling takes rather than the chain playing notes.
    (name: \chainProcess,      spec: ControlSpec(0, 1, \lin),       default: 0.45, path: "/chain/process",           cc: 23),
    // How much of the SAMPLE row — TIME STRETCH, PITCH SHIFT, REVERB, DELAY,
    // DELAY TIME, GRAIN SIZE — reaches the corpus. Those six knobs acted on
    // the seven MP3s only; the field recordings played through untouched
    // whatever the performer did. This is the same move chainProcess makes
    // for the chain, given to the performer's hand: every one of the six is
    // interpolated toward its neutral point by it (stretch x1, pitch 0,
    // no echo, no added room), so 0 is the recording as recorded and 1 is
    // the recording as the sample row would treat it.
    (name: \corpusFx,          spec: ControlSpec(0, 1, \lin),       default: 0.6,  path: "/pheno/corpusFx"),
    // How much of the camera-trap and spectrogram register slot C actually
    // projects. This Chamber withholds nothing by default: 1.0 is every clip
    // at full opacity, felids included, and that is where the fader boots.
    //
    // It is deliberately NOT a veil list. The earlier design refused sensitive
    // species in code, which put the decision in a constant no session could
    // reach and made the refusal indistinguishable from missing data. Here the
    // decision is on the surface, reversible, and visibly the Chamber's: turn
    // it down and the register recedes in order of each clip's `sensitivity`
    // (build_cameratrap.py) — the two felids first, insects and rain last, so
    // at 0.0 the ring still shows that something was recorded even where it no
    // longer shows what. Absence stays legible as absence.
    // CRUDO: the day's recordings exactly as they were captured. Bypasses every
    // layer that processes them — pitch, grains, filter, echo and the reverbs
    // inside both corpus voices, the chain processor and the Cámara stage —
    // and adds them to the mix AFTER the room and the tape. Level, the corpus
    // fader, SPREAD and MASTER still apply; the master limiter stays as the
    // safety net. A toggle, so a stepped spec (see the note on \bancada).
    (name: \corpusCrudo,       spec: ControlSpec(0, 1, \lin, 1),     default: 0,    path: "/pheno/crudo",            cc: 64),
    (name: \camaraOpacity,     spec: ControlSpec(0, 1, \lin),       default: 1.0,  path: "/camara/opacity",          cc: 24),

    // ── The two VIZ controls, no longer strangers to this registry ───────
    // /parliament/rotation and /parliament/consensus were the only two
    // sliders on the browser panel with no entry here, and the markup said so
    // in a comment: "VIZ-only: SC has no handler". That had three consequences
    // nobody asked for. A config could not carry them, so the one control that
    // sets how the whole projection moves was the one thing a saved state
    // forgot. Nothing echoed them, so the SC surface could not show or change
    // them. And they could not be reached from MIDI at all.
    //
    // hasBus: false — no synth reads either of them; they are the browser's
    // business. But the REGISTRY is not the audio engine, it is the place a
    // control exists at all, and these are controls.
    //
    // Rotation is the automatic drift rate every module turns at, SIGNED: the
    // centre stops it, below it the modules turn the other way (configs hold
    // real values, 0.25..1.8, so they keep their meaning). Consensus is the
    // chamber's agreement, which the vote already reads.
    (name: \vizRotation,       spec: ControlSpec(-2.0, 2.0, \lin),  default: 1.0,  path: "/parliament/rotation",     cc: 55, hasBus: false),
    (name: \vizConsensus,      spec: ControlSpec(0, 1, \lin),       default: 0.5,  path: "/parliament/consensus",    cc: 56, hasBus: false),

    // ── Row 8: Matrix mixer — one live fader per audible layer ──────────
    // Until now the balance between layers lived only in the hardcoded gain
    // budget of 3_synthdefs.scd (~trimDrone, ~trimPad, …), which is fixed at
    // load and unreachable while playing. Every other control shapes timbre;
    // none of them changed how loud one voice is against another, so there was
    // no way to mix the instrument.
    //
    // Unity is 1.0 and sits mid-fader: at boot these multiply by exactly 1 and
    // the engine sounds as it did before. 0 is a true mute, 2.0 is +6 dB.
    // These multiply the trims, they do not replace them.
    (name: \mixDrone,  spec: ControlSpec(0, 2, \lin), default: 1.0, path: "/mix/drone",  cc: 42),
    (name: \mixPad,    spec: ControlSpec(0, 2, \lin), default: 1.0, path: "/mix/pad",    cc: 43),
    (name: \mixKick,   spec: ControlSpec(0, 2, \lin), default: 1.0, path: "/mix/kick",   cc: 44),
    (name: \mixPerc,   spec: ControlSpec(0, 2, \lin), default: 1.0, path: "/mix/perc",   cc: 45),
    (name: \mixDust,   spec: ControlSpec(0, 2, \lin), default: 1.0, path: "/mix/dust",   cc: 46),
    (name: \mixSample, spec: ControlSpec(0, 2, \lin), default: 1.0, path: "/mix/sample", cc: 47),
    (name: \mixCorpus, spec: ControlSpec(0, 2, \lin), default: 1.0, path: "/mix/corpus", cc: 48),
    (name: \mixUltra,  spec: ControlSpec(0, 2, \lin), default: 1.0, path: "/mix/ultra",  cc: 49),
    // The five motors of 18_motores.scd. MOTOR is their master; each of the
    // five after it is one motor's own layer, and raising it from 0 switches
    // that motor on over whatever config is playing. Same 0-2 / unity-at-mid
    // convention as the eight above, but the five default to 0: no motor
    // sounds until someone asks for it. CC 57-62: the LC2's eight faders are
    // all taken, so these live on the GUI strips, the browser and any
    // controller that sends them.
    (name: \mixMotor,      spec: ControlSpec(0, 2, \lin), default: 1.0, path: "/mix/motor",      cc: 57),
    (name: \mixRemuestreo, spec: ControlSpec(0, 2, \lin), default: 0.0, path: "/mix/remuestreo", cc: 58),
    (name: \mixEspectro,   spec: ControlSpec(0, 2, \lin), default: 0.0, path: "/mix/espectro",   cc: 59),
    (name: \mixCaos,       spec: ControlSpec(0, 2, \lin), default: 0.0, path: "/mix/caos",       cc: 60),
    (name: \mixRuptura,    spec: ControlSpec(0, 2, \lin), default: 0.0, path: "/mix/ruptura",    cc: 61),
    (name: \mixMasa,       spec: ControlSpec(0, 2, \lin), default: 0.0, path: "/mix/masa",       cc: 62),
    // SEQ: the four note sequences of remuestreo on their own, apart from its
    // bed (REMU). Either one above 0 switches remuestreo on, so the sequences
    // can play with no bed and the bed with no sequences.
    (name: \mixSeq,        spec: ControlSpec(0, 2, \lin), default: 0.0, path: "/mix/seq",        cc: 63),
    // GOLPE (19_golpe.scd): distorted hand percussion — darbuka, tabla, riq —
    // overdriven, crushed and dubbed, played from the 32-step grid in the SC
    // GUI. A voice layer like perc, not a motor: linear like the eight above,
    // not under MOTOR. Default 0, so it sounds only where a config asks.
    // CC 65, the first free one.
    (name: \mixGolpe,      spec: ControlSpec(0, 2, \lin), default: 0.0, path: "/mix/golpe",      cc: 65),
    // MEZCLA: how much the mix is CARVED — one owner per band. 0 is the
    // engine exactly as it always sounded (the mud included, and the road to
    // a noise piece); 1 is the professional mix: low cuts per layer, the
    // drone and pad ducked under the kick below 150 Hz, the low mids dipped,
    // the lows in mono, no bass inside the reverbs, the peaks held 12 dB
    // over each layer's own level. Everything crossfades on this one number
    // (3_synthdefs.scd \stemSum, \masterLimiter, \resonantChamber and the
    // voices' reverbs), so any value between is a mix between the two.
    // It is also the DISPOSICIÓN (2026-10-18): the same number places each
    // layer in the dome — the bed all round (drone leaning front, pad even and
    // breathing, dust behind and over, the forest round the sides and back),
    // the hsaing circle round the room by pitch, ultra behind, golpe on the
    // stage, the motors each at home on the ring and stepping forward while
    // they surge (~stemPlace, 3_synthdefs.scd). At 0 everything is front
    // centre, as it always was.
    // Loaded by the MEZCLA_* add-on configs; base configs leave it alone.
    // Boots at 1 since 2026-10-18: the dome is the venue, and the disposition
    // is how the engine should stand in it. MEZCLA_0_Barro still takes it back
    // to the old sound in one load.
    (name: \mixCarve,      spec: ControlSpec(0, 1, \lin), default: 1.0, path: "/mix/carve"),

    // ── Beat engine (no control bus — lives in ~beatParams) ─────────────
    (name: \beatTempo, spec: ControlSpec(0.5, 2.0, \exp), default: 1.0, path: "/soneth/beatTempo",
        hasBus: false, beatParam: \beatTempo),

    // ── Cadencia · how OFTEN each struck layer speaks ───────────────────
    // The matrix mixer (CC 44-49) sets how LOUD a layer is. These three set
    // how OFTEN it occurs, which is the other half of its presence and until
    // now was reachable only by editing 5_beat_engine.scd.
    //
    // The distinction matters musically: turning a layer down and making it
    // rarer sound nothing alike. A quiet kick on every bar is a pulse; a loud
    // kick once a minute is an event. Both were previously collapsed into one
    // fader, which is why the mix controls felt like they did nothing — at one
    // hit per 96 s there was no second hit to hear the change on.
    //
    // hasBus: false — the beat Routine reads ~beatParams directly in sclang
    // (In.kr inside a Routine returns a UGen, not a number), so these mirror
    // there rather than onto a control bus. Same shape as beatTempo above.

    // Bars between guaranteed kicks when the chain is idle. 1 = every bar
    // (~12 s), 8 = the old behaviour (~96 s, effectively absent).
    //
    // NOT a stepped spec, deliberately. ~makeKnob cannot serve one: it rebuilds
    // the spec without its step, ~setParam re-quantises against the real spec
    // and writes the rounded value back into the widget, and a \vert-mode Knob
    // drags RELATIVE to its current value — so the write-back resets the
    // accumulator on every mouse event and the knob can never leave position 0.
    // That is documented at the \bancada row in 4_gui.scd, which had to become
    // a button row for exactly this reason. The beat engine rounds it instead.
    (name: \kickEvery,  spec: ControlSpec(1, 8, \lin),       default: 1,    path: "/cadence/kick",
        hasBus: false, beatParam: \kickEvery,  cc: 25),
    // Base probability numerator for percussion, divided by percDivisor.
    // 0.65 was the old sparse value; 1.5 is the current default.
    // Default 1.5 -> 0.32, and the floor drops to 0.02. The china is now a
    // long, wide, resonant event; at 1.5 it was arriving often enough to be a
    // texture, which is the opposite of what a 24" trash cymbal is for. At
    // 0.32 it lands a few times a minute and each strike is allowed to be an
    // occurrence rather than part of a pulse. The top of the range is
    // unchanged for anyone who does want it dense.
    (name: \percRate,   spec: ControlSpec(0.02, 4.0, \exp),  default: 0.45, path: "/cadence/perc",
        hasBus: false, beatParam: \percRate,   cc: 26),
    // Base probability per tick for dust grains, before tide and excitation.
    (name: \dustRate,   spec: ControlSpec(0.03, 0.95, \exp), default: 0.52, path: "/cadence/dust",
        hasBus: false, beatParam: \dustRate,   cc: 27),
    // Seconds between pad swells. The pad had NO rate control at all — only a
    // level — so its presence could be turned down but never made denser or
    // sparser, which is the control that actually changes what the bed does.
    // 8 s is a near-continuous wash (the envelope runs ~89 s, so voices stack);
    // 120 s is one swell arriving every two minutes over silence.
    (name: \padEvery,   spec: ControlSpec(8.0, 120.0, \exp), default: 34.0, path: "/cadence/pad",
        hasBus: false, beatParam: \padEvery,   cc: 28),
    // ── The pad's register and how fast it moves ────────────────────────
    //
    // The bed was locked to ~droneRoot (55 Hz) and its voices are four detuned
    // Saws and two Pulses. padRatios reaches down to 0.5, so the lowest voices
    // were sawtooths at 27 Hz — which is not a pad, it is a motor, and that is
    // the "little engine".
    //
    // padPitch multiplies the root, so the bed still tracks the drone's
    // harmony and can simply sit higher. Default 2.0: one octave up puts the
    // range at 55-247 Hz instead of 27-124, which is where a pad belongs.
    //
    // padMotion scales \tempo, which every LFO inside \biocratiaPad is
    // multiplied by — the two SinOsc drifts, both filter wobbles and the pan
    // rotation. It was hardcoded at 1.0, so every voice moved at exactly the
    // same rates and they never drifted apart. That is the uniformity: not a
    // lack of modulation but modulation in lockstep.
    // padPitch takes a BUS, unlike the rest of this row. The others are read
    // in sclang when a voice is spawned, which is right for a rate — but a pad
    // voice lives 43-94 s, so a spawn-time pitch meant the control appeared
    // dead: you moved it and waited a minute and a half for the old voices to
    // die before hearing anything. On a bus it reaches voices already sounding
    // and the whole bed glides.
    // Range moved DOWN. 0.5-4.0 put the top at 110-495 Hz, which is not a bed
    // — it is a lead — and the whole point of this layer is the floor under
    // everything else. 0.25-2.0 keeps every position low:
    //
    //     0.125x  18- 15 Hz    below pitch; the bed as pressure
    //     0.250x  18- 31 Hz
    //     0.500x  18- 62 Hz    the new default
    //     1.000x  28-124 Hz    the top, and the old default
    //
    // Default back to 1.0. The "little engine" was diagnosed at this register,
    // but the cause turned out to be padMotion's lockstep — every voice running
    // its LFOs at exactly 1.0 — and that is fixed independently. Raising the
    // pitch was treating the symptom, so the register returns to where the bed
    // belongs and 2.0 is available if the low end ever sits too heavy.
    // 0.125 -> 0.40. The bottom of the old range was dead: at 0.125 the root
    // alone is 55 x 0.125 = 6.9 Hz, so every voice landed on the SynthDef's
    // clip and the whole lower third of the fader produced one identical
    // sound. Measured across the nine pad ratios, 14 of 45 combinations were
    // pinned. From 0.40 the root is 22 Hz and nothing pins; the top is
    // unchanged, since that is the register that was wanted.
    (name: \padPitch,   spec: ControlSpec(0.40, 1.0, \exp), default: 0.6,  path: "/cadence/padpitch",
        beatParam: \padPitch,   cc: 53),
    (name: \padMotion,  spec: ControlSpec(0.1, 4.0, \exp),   default: 1.0,  path: "/cadence/padmotion",
        hasBus: false, beatParam: \padMotion,  cc: 54),
    // How many pad voices may sound at once. This is the other half of pad
    // density and the one that decides whether it is a bed or an event: at 1
    // there are real gaps, at 4 it is a sustained chord. Continuous spec for
    // the same reason kickEvery is — ~makeKnob cannot serve a stepped one.
    (name: \padVoices,  spec: ControlSpec(1, 4, \lin),       default: 2,    path: "/cadence/padvoices",
        hasBus: false, beatParam: \padVoices,  cc: 29),
    // Seconds between BELLS (\elektronBell, the ETH transaction voice) — a
    // different layer from the pad bed above, and until now the only struck
    // voice with no rate control at all.
    //
    // ~padDrainRoutine released one per 1/16 of the block period (~0.75 s),
    // and eth_sonify delivers a whole block as a ~2 s burst every ~12 s, so on
    // any busy chain the queue never emptied and the layer simply ran at 80
    // bells a minute. 6 s is about 10 a minute; the top of the range is one
    // every half minute.
    (name: \bellEvery,  spec: ControlSpec(0.8, 30.0, \exp),  default: 6.0,  path: "/cadence/bell",
        hasBus: false, beatParam: \bellEvery,  cc: 30),

    // ── The struck voice's two halves, each switchable ──────────────────
    // \opalPerc is a hsaing waing (since 2026-10-18; was a Tibetan bowl and a
    // china): BOWL is the tuned circle — bossed gongs on a full strike, pat
    // waing drums on a short one, on a pentatonic over the drone's root — and
    // CHINA the ensemble's cymbals, linkwin and si. These take either half out
    // of the sum entirely, so the voice can be all gong and drum, all cymbal,
    // or both. textureDepth still morphs between them when both are on.
    //
    // CONTINUOUS, not stepped. They were 0-or-1 and the step was never needed:
    // both reach the SynthDef as a plain multiplier — bowlGate and chinaGate,
    // each already Lag.kr'd over 0.4 s — so a value of 0.35 has always been
    // meaningful and the spec was the only thing forbidding it.
    //
    // As faders they stop being "which half exists" and become the balance
    // between the two halves, which is what the voice is actually for: a pure
    // bowl, a pure cymbal, or any mixture, rather than three states. The
    // chinaGate factor now also carries shimmer, wash, chug and both combs, so
    // fading china in brings its colouring up with it instead of switching it.
    //
    // They DO take control buses, unlike the cadence params above, because they
    // are read inside the SynthDef and must reach voices already sounding.
    (name: \bowlOn,     spec: ControlSpec(0, 1, \lin),       default: 1,    path: "/voice/bowl",
        cc: 31),
    (name: \chinaOn,    spec: ControlSpec(0, 1, \lin),       default: 1,    path: "/voice/china",
        cc: 52),

    // ── Marea · arco de densidad (toggles 0/1) ──────────────────────────
    // The rhythm is tidal rather than gridded: onsets are probabilistic and
    // their likelihood follows a slow swell. These pick how long that swell
    // takes. The three arcs are MUTUALLY EXCLUSIVE — enforced in one place,
    // the /tide/ handler in 6_osc_handlers.scd, which unticks the others and
    // echoes all four back. The previous seven rhythm toggles were independent
    // booleans with undefined interactions and no single owner of the state,
    // which is a large part of why they had to be removed.
    // All three off = no arc, flat density.
    (name: \tideShort, exclusiveGroup: \tideArc, spec: ControlSpec(0, 1, \lin, 1), default: 0, path: "/tide/short",
        hasBus: false, beatParam: \tideShort, cc: 17),
    (name: \tideMedia, exclusiveGroup: \tideArc, spec: ControlSpec(0, 1, \lin, 1), default: 1, path: "/tide/media",
        hasBus: false, beatParam: \tideMedia, cc: 18),
    (name: \tideLarga, exclusiveGroup: \tideArc, spec: ControlSpec(0, 1, \lin, 1), default: 0, path: "/tide/larga",
        hasBus: false, beatParam: \tideLarga, cc: 19),
    // Independent axis: the sub-bass heartbeat, one per block, surviving the
    // troughs the tide would otherwise empty.
    (name: \tidePulse, spec: ControlSpec(0, 1, \lin, 1), default: 1, path: "/tide/pulse",
        hasBus: false, beatParam: \tidePulse, cc: 20),

    // ── Laser · which source feeds the pulsar plot ──────────────────────
    // Four independent ticks rather than one selector, because the stack can
    // carry several at once — each source has its own hue, so a mixed stack
    // stays legible. With none ticked the laser falls back to the year ring,
    // which is how that pattern stays reachable without a control of its own.
    //
    // hasBus: false — nothing in SuperCollider reads these. They exist to be
    // echoed to the browser, where the plot is drawn; routing them through the
    // registry is what gives them a GUI toggle, an OSC path, preset save/load
    // and the browser echo for free, on the one write path.
    (name: \laserSrcMix,    spec: ControlSpec(0, 1, \lin, 1), default: 1,
        path: "/laser/src/mix",    hasBus: false),
    (name: \laserSrcCorpus, spec: ControlSpec(0, 1, \lin, 1), default: 0,
        path: "/laser/src/corpus", hasBus: false),
    (name: \laserSrcRing,   spec: ControlSpec(0, 1, \lin, 1), default: 0,
        path: "/laser/src/ring",   hasBus: false),
    (name: \laserSrcChain,  spec: ControlSpec(0, 1, \lin, 1), default: 0,
        path: "/laser/src/chain",  hasBus: false)
];

// ─── Derived lookup tables ──────────────────────────────────────────────────
// Shared voice-onset clock. Declared here, in the first file loaded, because
// three files write it (5_beat_engine, 6_osc_handlers, 10_sample_system) and a
// fourth arbitrates on it (15_slot_voices) — whoever runs first must not have
// to care whether it exists yet.
~lastVoiceAt = ~lastVoiceAt ?? { () };

~paramDefsByName = ();
~paramDefs.do { |def| ~paramDefsByName[def[\name]] = def };

// cc → param name (one flat map instead of five case-ladder MIDIdefs)
~midiCCToParam = ();
~paramDefs.do { |def| if(def[\cc].notNil) { ~midiCCToParam[def[\cc]] = def[\name] } };

// OSC path → param name, canonical paths AND aliases (kept as a Dictionary of
// String keys — same shape 6_osc_handlers / 4_gui historically used)
~oscToParamMap = Dictionary.new;
~paramDefs.do { |def|
    if(def[\path].notNil) { ~oscToParamMap[def[\path]] = def[\name] };
    (def[\aliases] ? []).do { |a| ~oscToParamMap[a] = def[\name] };
};

// GUI-compatible views (4_gui reads these; previously duplicated literals)
~controlSpecs = ();
~controlValues = ();
~paramDefs.do { |def|
    ~controlSpecs[def[\name]] = def[\spec];
    ~controlValues[def[\name]] = def[\default];
};

// The two knobs the Cámara breathes (Art. 45, ~phenoBreath). The breath used
// to overwrite them outright once per ring day, so what a config set for them
// lasted about a minute; now it breathes around the value kept here, which
// only a hand, a controller or a config changes (~setParam, step 3b).
~breathHome = (harmonicRich: ~controlValues[\harmonicRich],
    textureDepth: ~controlValues[\textureDepth]);

// ─── GOLPE · the 32-step grid (19_golpe.scd plays it, 4_gui.scd draws it) ───
// Five rows of hand percussion, 32 sixteenths = two bars. State lives here,
// in the first file, because the GUI (file 4) is built before the sequencer
// (file 19) and the configs (this file) save and load it.
//
// Written as strings, one per row, "x" = hit, "." = rest — the same strings a
// config stores in its "golpe" section, so a preset file shows the rhythm.
// The five rhythms are the darbuka's own (maqsum, baladi, saidi, malfuf,
// ayoub), with the riq and the tabla added the way Muslimgauze stacks them.
~golpeRows = [\dum, \tek, \ka, \tabla, \riq];
~golpeSteps = 32;
~golpeLibrary = (
    maqsum: (dum:   "x.......x.......x.......x..x....",
             tek:   "..x...x.....x.....x...x.....x.x.",
             ka:    "...x......x...x....x......x.....",
             tabla: ".....x...............x..........",
             riq:   "x...x.x.x...x.x.x...x.x.x...x.xx"),
    baladi: (dum:   "x.x.....x.......x.x.....x.......",
             tek:   "......x.....x.........x.....xxx.",
             ka:    "....x.....x...x.....x.....x.....",
             tabla: "...........x...............x....",
             riq:   "x...x.x.x...x.x.x...x.x.x...x.x."),
    saidi:  (dum:   "x.....x.x.......x.....x.xx......",
             tek:   "..x.........x.....x.........x.x.",
             ka:    "....x.....x...x.....x.....x....x",
             tabla: ".......x...............x........",
             riq:   "..x...x...x...x...x...x...x...x."),
    malfuf: (dum:   "x.......x.......x.......x.......",
             tek:   "...x..x....x..x....x..x....x..x.",
             ka:    ".............x...............x..",
             tabla: "................................",
             riq:   "..x...x...x...x...x...x...x...x."),
    ayoub:  (dum:   "x...x...x...x...x...x...x...x...",
             tek:   "......x.......x.......x.......xx",
             ka:    "...x.......x.......x.......x....",
             tabla: "..............x...............x.",
             riq:   "..x....x..x....x..x....x..x....x")
);
~golpeFromString = { |str|
    var s = (str ? "").asString;
    ~golpeSteps.collect { |i| if(s[i] == $x) { 1 } { 0 } }
};
~golpeToString = { |arr| arr.collect { |v| if(v > 0) { "x" } { "." } }.join };
~golpeRefresh = {
    {
        if(~golpeGridView.notNil and: { ~golpeGridView.isClosed.not }) { ~golpeGridView.refresh };
        ~golpeKitRefresh !? { ~golpeKitRefresh.value };
    }.defer;
};

// ─── GOLPE · the kits: one per state of listening ─────────────────────────
// The pattern says WHEN; the kit says WHAT is struck and in what room. The
// voices themselves are in 19_golpe.scd (~golpeKits); the names live here
// because the GUI (file 4) draws them and the configs save them before 19
// has loaded.
//   muslimgauze   dry hand drums pushed into the red, dub
//   deep          Oliveros' cistern: everything rings, little is struck
//   acustemologia Feld: wood and water among the birds, lift-up-over
//   campo         Lawrence English: heard through foliage, at a distance
//   ceremonia     zikr and Gnawa: frame drums and iron, the trance
//   maquina       the computational configs: the machine counting
~golpeKitNames = [\muslimgauze, \deep, \acustemologia, \campo, \ceremonia, \maquina];
~golpeKitLabels = (muslimgauze: "MUSLIM", deep: "DEEP", acustemologia: "ACUST",
    campo: "CAMPO", ceremonia: "CEREM", maquina: "MAQ");
~golpeKit = ~golpeKit ? \muslimgauze;
// Per config, on top of the kit: afinar in semitones (added to PITCH/4), and
// peso, a level per row (1 = the kit's own balance).
~golpeAfinar = ~golpeAfinar ? 0;
~golpePeso = ~golpePeso ?? { (dum: 1, tek: 1, ka: 1, tabla: 1, riq: 1) };
~golpeKitSet = { |name|
    var k = name.asString.asSymbol;
    if(~golpeKitNames.includes(k)) {
        ~golpeKit = k;
        ~stateDirty = true;
        ~golpeRefresh.value;
    };
};
// One box. The grid's mouse and nothing else writes single steps.
~golpeSet = { |row, step, on|
    if(~golpePattern[row].notNil and: { step.inclusivelyBetween(0, ~golpeSteps - 1) }) {
        ~golpePattern[row][step] = if(on > 0) { 1 } { 0 };
        ~stateDirty = true;
        ~golpeRefresh.value;
    };
};
// A whole pattern: a library entry, a config's "golpe" section (String keys
// from parseJSON) or an Event of arrays. Rows it does not name stay as they
// are, like every other section a config leaves out.
//
// A config's section (it names a kit) also restores the tuning and the step
// locks, and resets them when it has none, so configs never inherit each
// other's tuning. A rhythm from the library keeps the row tuning and clears
// the locks: they belonged to the old pattern's steps.
~golpeLoad = { |src|
    var kit = src[\kit] ?? { src["kit"] };
    var afinar = src[\afinar] ?? { src["afinar"] };
    var peso = src[\peso] ?? { src["peso"] };
    if(kit.notNil) {
        ~golpeTuneLoad.(src[\tune] ?? { src["tune"] }, src[\locks] ?? { src["locks"] });
    } {
        ~golpeLocks = ();
    };
    if(kit.notNil) { ~golpeKitSet.(kit) };
    if(afinar.notNil) { ~golpeAfinar = afinar.asFloat.clip(-6, 6) };
    if(peso.notNil) {
        ~golpeRows.do { |row|
            var w = peso[row] ?? { peso[row.asString] };
            if(w.notNil) { ~golpePeso[row] = w.asFloat.clip(0, 2) };
        };
    };
    ~golpeRows.do { |row|
        var v = src[row] ?? { src[row.asString] };
        if(v.notNil) {
            ~golpePattern[row] = if(v.isString) { ~golpeFromString.(v) } {
                ~golpeSteps.collect { |i| if((v[i] ? 0) > 0) { 1 } { 0 } } };
        };
    };
    ~stateDirty = true;
    ~golpeRefresh.value;
};
~golpeClear = { ~golpeRows.do { |row| ~golpePattern[row] = 0 ! ~golpeSteps }; ~golpeLocks = (); ~stateDirty = true; ~golpeRefresh.value };
~golpePattern = ~golpePattern ?? {
    var p = ();
    ~golpeRows.do { |row| p[row] = ~golpeFromString.(~golpeLibrary[\maqsum][row]) };
    p
};

// ─── GOLPE · tuning, per row and per step ─────────────────────────────────
// Five controls, the same five on every row, each adapted to the row's
// material by ~golpeShape (19_golpe.scd):
//   afinar  semitones, -12..12, on the fundamental (RIQ: its jingles)
//   octava  whole octaves, -2..2, added to afinar: a tabla an octave down is
//           a different drum, not a detuned one
//   tono    -1..1: where the brightness sits — crack, palm, the tabla's upper
//           partials and click, the riq's hiss, a grain's filters
//   mod     -1..1: how much it moves — the dum's drop, the tabla's FM ping and
//           glide, the tek's ring, the ka's clap, the riq's double, a grain's
//           drive. Up adds movement even where the kit has none.
//   caida   -1..1, applied as x2^(2c): decay x0.25..x4
// ~golpeTune is the row's base, for every hit of that row. ~golpeLocks holds
// a step's own values (only the controls that were touched; the rest come
// from the row), for whatever that row plays on that step.
//
// There are no knobs of their own. Clicking a row name on the grid (or
// right-clicking a box, for its step) hands four TIMBRE knobs over to it —
// PITCH, HARM, TEXTURE, BODY, the ones that already shape GOLPE's pitch,
// partials, drive and body, and PAD PITCH beside them for the octave — and
// the rest of the surface goes grey until the same name or box is clicked
// again (4_gui.scd). ~setParam routes those five here meanwhile, from the GUI and from MIDI; the breath, configs and
// the browser still write the global values underneath.
~golpeTuneKeys = [\afinar, \tono, \mod, \caida, \octava];
~golpeTuneSpecs = (afinar: ControlSpec(-12, 12, \lin, 0.1), tono: ControlSpec(-1, 1),
    mod: ControlSpec(-1, 1), caida: ControlSpec(-1, 1), octava: ControlSpec(-2, 2, \lin, 1));
~golpeEditKnobs = (pitchShift: \afinar, harmonicRich: \tono, textureDepth: \mod, resonantBody: \caida,
    padPitch: \octava);
~golpeTuneNames = (afinar: "AFINAR", tono: "TONO", mod: "MOD", caida: "CAÍDA", octava: "OCTAVA");
~golpeTuneNeutral = { (afinar: 0, tono: 0, mod: 0, caida: 0, octava: 0) };
// The pitch a row plays at, in semitones: AFINAR plus whole octaves.
~golpeSemis = { |tn| (tn[\afinar] ? 0) + (12 * (tn[\octava] ? 0)) };
~golpeTune = ~golpeTune ?? { var t = (); ~golpeRows.do { |row| t[row] = ~golpeTuneNeutral.value }; t };
~golpeLocks = ~golpeLocks ?? { () };
~golpeEdit = nil;

// What sounds on a row at a step: the row, overridden by the step's lock.
~golpeTuneAt = { |row, step|
    var t = (~golpeTune[row] ?? { ~golpeTuneNeutral.value }).copy;
    var lock = if(step.notNil) { (~golpeLocks[row] ? ())[step] };
    lock !? { lock.keysValuesDo { |k, v| t[k] = v } };
    t
};
~golpeTuneText = { |ctl, v, locked = false|
    var name = ~golpeTuneNames[ctl] ++ if(locked) { "•" } { "" };
    name ++ "\n" ++ switch(ctl,
        \afinar, { (if(v >= 0) { "+" } { "" }) ++ v.round(0.1) ++ " st" },
        \caida,  { "×" ++ (2 ** (2 * v)).round(0.01) },
        \octava, { (if(v >= 0) { "+" } { "" }) ++ v.round.asInteger ++ " oct" },
        { (if(v >= 0) { "+" } { "" }) ++ v.round(0.01) })
};

// Whether ~setParam should hand this write to the tuning, and whether the
// knob is showing the tuning (so ~setParam leaves its face alone).
~golpeTakes = { |name, source| ~golpeEdit.notNil and: { [\gui, \midi].includes(source) }
    and: { ~golpeEditKnobs[name].notNil } };
~golpeShows = { |name| ~golpeEdit.notNil and: { ~golpeEditKnobs[name].notNil } };

// The knobs' faces: the tuning while editing, their own values after.
// moving: the control the hand is turning right now. Its needle is left where
// the hand put it and only its caption follows. OCTAVA rounds to whole
// octaves, so a needle redrawn at the rounded value went back to the centre
// after every small drag and the knob could never leave it.
~golpeEditShow = { |moving|
    {
        ~golpeEditKnobs.keysValuesDo { |name, ctl|
            var knob = (~knobViews ? ())[name];
            var label = (~controlLabels ? ())[name];
            if(~golpeEdit.notNil) {
                var e = ~golpeEdit;
                var v = ~golpeTuneAt.(e[\row], e[\step])[ctl];
                var locked = e[\step].notNil and: { ((~golpeLocks[e[\row]] ? ())[e[\step]] ? ())[ctl].notNil };
                if(knob.notNil and: { knob.isClosed.not } and: { ctl != moving }) { knob.value = ~golpeTuneSpecs[ctl].unmap(v) };
                if(label.notNil and: { label.isClosed.not }) { label.string = ~golpeTuneText.(ctl, v, locked) };
            } {
                var spec = ~paramDefsByName[name][\spec];
                var val = (~controlValues ? ())[name] ? ~paramDefsByName[name][\default];
                if(knob.notNil and: { knob.isClosed.not }) { knob.value = spec.unmap(val) };
                if(label.notNil and: { label.isClosed.not }) { label.string = ~knobText.(name, val) };
            };
        };
        ~guiLookRefresh !? { ~guiLookRefresh.value };
    }.defer;
};

// Pick a row (step nil) or a step to tune; picking the same again leaves.
~golpeEditSet = { |row, step|
    var same = ~golpeEdit.notNil and: { ~golpeEdit[\row] == row } and: { ~golpeEdit[\step] == step };
    ~golpeEdit = if(same) { nil } { (row: row, step: step) };
    ~golpeEditShow.value;
    ~golpeRefresh.value;
};
~golpeEditExit = { if(~golpeEdit.notNil) { ~golpeEdit = nil; ~golpeEditShow.value; ~golpeRefresh.value } };

// One control of what is being tuned, from a knob's 0-1 position. A step
// keeps only what was touched on it. Then a test hit of that row, once the
// hand rests (19_ plays it, only while GOLPE sounds).
~golpeTuneSet = { |ctl, norm|
    var e = ~golpeEdit;
    if(e.notNil and: { ctl.notNil }) {
        var v = ~golpeTuneSpecs[ctl].map(norm.clip(0, 1));
        if(e[\step].isNil) {
            ~golpeTune[e[\row]][ctl] = v;
        } {
            var locks = ~golpeLocks[e[\row]] ?? { ~golpeLocks[e[\row]] = () ; ~golpeLocks[e[\row]] };
            (locks[e[\step]] ?? { locks[e[\step]] = (); locks[e[\step]] })[ctl] = v;
            // The step tuned last: what shift-click pastes (~golpeLockPaste).
            ~golpeLockLast = (row: e[\row], step: e[\step]);
        };
        ~stateDirty = true;
        ~golpeEditShow.(ctl);
        ~golpeRefresh.value;
        ~golpePreviewAt = Main.elapsedTime;
        SystemClock.sched(0.25, {
            if(Main.elapsedTime - (~golpePreviewAt ? 0) >= 0.24) { ~golpePreview !? { ~golpePreview.(e[\row], e[\step]) } };
            nil
        });
    };
};

// Shift-click on a box: the step tuned last is stamped there — its lock
// copied (any row takes any lock: the controls mean the same on every row)
// and the box switched on, so the copy is heard. nil when nothing has been
// tuned yet, or that lock was cleared since: the click is then a plain one.
~golpeLockLast = nil;
~golpeLockPaste = { |row, step|
    var src = ~golpeLockLast !? { |l| (~golpeLocks[l[\row]] ? ())[l[\step]] };
    if(src.isNil) { false } {
        if((~golpeLockLast[\row] != row) or: { ~golpeLockLast[\step] != step }) {
            (~golpeLocks[row] ?? { ~golpeLocks[row] = (); ~golpeLocks[row] })[step] = src.copy;
        };
        if(((~golpePattern[row] ? [])[step] ? 0) == 0) { ~golpeSet.(row, step, 1) };
        ~stateDirty = true;
        ~golpeRefresh.value;
        true
    };
};

// Back to the kit as it is: a row's whole tuning, or a step's lock.
~golpeTuneReset = { |row, step|
    if(step.isNil) { ~golpeTune[row] = ~golpeTuneNeutral.value } {
        (~golpeLocks[row] ? ()).removeAt(step);
    };
    ~stateDirty = true;
    ~golpeEditShow.value;
    ~golpeRefresh.value;
};

// From a config's "tune" and "locks" (String keys from parseJSON); neutral
// where it names nothing.
~golpeTuneLoad = { |tune, locks|
    ~golpeRows.do { |row|
        var src = tune !? { tune[row] ?? { tune[row.asString] } };
        var t = ~golpeTuneNeutral.value;
        src !? { ~golpeTuneKeys.do { |k| (src[k] ?? { src[k.asString] }) !? { |v|
            t[k] = ~golpeTuneSpecs[k].constrain(v.asFloat) } } };
        ~golpeTune[row] = t;
    };
    ~golpeLocks = ();
    locks !? {
        ~golpeRows.do { |row|
            var src = locks[row] ?? { locks[row.asString] };
            src !? {
                var rl = ();
                src.keysValuesDo { |step, vals|
                    var i = step.asString.asInteger;
                    var l = ();
                    ~golpeTuneKeys.do { |k| (vals[k] ?? { vals[k.asString] }) !? { |v|
                        l[k] = ~golpeTuneSpecs[k].constrain(v.asFloat) } };
                    if(i.inclusivelyBetween(0, ~golpeSteps - 1) and: { l.size > 0 }) { rl[i] = l };
                };
                if(rl.size > 0) { ~golpeLocks[row] = rl };
            };
        };
    };
    if(~golpeEdit.notNil) { ~golpeEditShow.value };
};
// And to JSON, for ~saveConfig: rows left neutral and empty locks are omitted.
~golpeTuneJSON = {
    var obj = { |ev| "{ % }".format(~golpeTuneKeys.select { |k| ev[k].notNil }
        .collect { |k| "\"%\": %".format(k, ev[k].asFloat.round(0.01)) }.join(", ")) };
    var rows = ~golpeRows.select { |row| ~golpeTuneKeys.any { |k| (~golpeTune[row][k] ? 0) != 0 } };
    var lrows = ~golpeRows.select { |row| (~golpeLocks[row] ? ()).size > 0 };
    [
        "    \"tune\": { % }".format(rows.collect { |row| "\"%\": %".format(row, obj.(~golpeTune[row])) }.join(", ")),
        "    \"locks\": { % }".format(lrows.collect { |row|
            "\"%\": { % }".format(row, ~golpeLocks[row].keys.asArray.sort.collect { |i|
                "\"%\": %".format(i, obj.(~golpeLocks[row][i])) }.join(", ")) }.join(", "))
    ]
};

// Upper-cases the first letter for GUI labels. Replaces String:capitalize,
// which SC 3.14 does not implement (it threw on every parameter write).
// Display names for knobs whose parameter name does not read well flattened
// to caps. PADEVERY / PADVOICES say nothing about which layer they act on,
// which is the whole question when a rate row sits directly above a level row
// for the same layers.
//
// Overridden here rather than by renaming the parameters: the names are also
// the OSC paths, the preset keys and the ~beatParams mirrors, so renaming
// would break every saved config for a cosmetic gain.
// Extended to EVERY rendered parameter. It held eight entries, and all eight
// belonged to the two rows that were never drawn — so the labels that existed
// were on the controls nobody could see, while all 35 visible knobs fell
// through to `label.asString.toUpper` and printed camelCase run together:
// TRANSACTIONINFLUENCE, ACTIVITYTHRESHOLD, ABSENCEWEIGHT.
//
// Kept under about eleven characters: the knob column is 132 px
// (4_gui.scd:519) and anything longer is truncated or wraps into the value.
//
// Spanish where the group around it is already Spanish — the Cámara row sits
// beside BANCADA and TODAS / NOCTURNA / INSECTOS, and the Marea toggles are
// ARCO CORTO / PULSO — English where the engine's own vocabulary is English
// and the mixer strips already say DRONE, PAD, KICK.
~knobLabels = IdentityDictionary[
    // ── VIZ ─────────────────────────────────────────────────────────────
    \vizRotation          -> "GIRO AUTO",
    \vizConsensus         -> "CONSENSO",
    // ── Núcleo ──────────────────────────────────────────────────────────
    \masterVolume         -> "MASTER VOL",
    \pitchShift           -> "PITCH",
    \timeDilation         -> "TIME DIL",
    // The main LPF cutoff in Hz, in every voice. Named for what it does
    // rather than for the abstraction it is registered under.
    \spectralShift        -> "LPF CUTOFF",
    \spatialSpread        -> "SPREAD",
    \textureDepth         -> "TEXTURE",
    \atmosphereMix        -> "ATMOS MIX",
    // ── Ambiente y ruido ────────────────────────────────────────────────
    \memoryFeed           -> "MEM FEED",
    \harmonicRich         -> "HARMONICS",
    \resonantBody         -> "RES BODY",
    \masterAmp            -> "SYNTH TRIM",
    \filterCutoff         -> "FILT TILT",
    \noiseLevel           -> "NOISE LVL",
    \noiseFilt            -> "NOISE FILT",
    // ── Drone ───────────────────────────────────────────────────────────
    \droneDepth           -> "DRONE SUB",
    \droneFade            -> "DRONE FADE",
    \droneSpace           -> "DRONE SPACE",
    // NOT a second drone level — it is dLayer, the blend BETWEEN the drone's
    // layers (3_synthdefs.scd:1419). The name has read as a fader for as long
    // as it has existed; the label says what it is.
    \droneMix             -> "DRONE LAYER",
    \delayFeedback        -> "DELAY FB",
    \transactionInfluence -> "TX INFL",
    \beatTempo            -> "TEMPO",
    // ── La sala · el recinto compartido ─────────────────────────────────
    // SALA, not CÁMARA: this surface already has a Cámara Fenológica, and two
    // groups called cámara on one screen is worse than a slightly plainer
    // word. RT60 because that is exactly what the control sets, 2-28 s.
    \chamberMix           -> "SALA MIX",
    \chamberSize          -> "SALA RT60",
    // ── Cámara Fenológica ───────────────────────────────────────────────
    \activityThreshold    -> "UMBRAL",
    \windowWidth          -> "VENTANA",
    \seasonalBias         -> "SESGO EST",
    \absenceWeight        -> "AUSENCIA",
    \pulseGain            -> "PULSO·CORO",
    \opacityFloor         -> "OPAC·CINTA",
    \corpusCrudo          -> "CRUDO",
    \phenoRate            -> "RITMO",
    \phenoSeek            -> "BUSCAR",
    // ── Corpus ──────────────────────────────────────────────────────────
    \corpusLevel          -> "CORPUS LVL",
    \chainProcess         -> "CADENA",
    \corpusFx             -> "CORPUS FX",
    \camaraOpacity        -> "OPAC CÁM",
    // ── Cadencia · how often, not how loud ──────────────────────────────
    //
    // percRate and bellEvery fire the SAME SynthDef — \opalPerc, bowl and
    // china together. They differ only in what TRIGGERS them: percRate is the
    // density of strikes from the beat engine, bellEvery the minimum gap
    // between strikes asked for by the chain (~strikeBell, called from the
    // transaction buffer and the OSC handlers). Naming them for their trigger
    // is the only way the pair stops looking like two instruments.
    //
    // "BELL" leaves the vocabulary altogether. There is no bell in this engine
    // and there has not been one since \elektronBell became \opalPerc; the
    // word is what made a rate control for the struck voice read as a
    // different instrument from the other rate control for the same voice.
    \percRate   -> "STRIKE BEAT",
    \bellEvery  -> "STRIKE CHAIN",
    // bar % N — one kick EVERY N bars. "KICK ×BAR" read as N per bar, which is
    // the opposite of what the beat engine does with it.
    \kickEvery  -> "KICK EVERY",
    \padEvery   -> "PAD EVERY",
    \padPitch   -> "PAD PITCH",
    \padMotion  -> "PAD MOTION",
    \padVoices  -> "PAD VOICES",
    // A probability per tick, not a rate in anything per second.
    \dustRate   -> "DUST DENS",
    // ── Las dos mitades de la voz percutida ─────────────────────────────
    \bowlOn     -> "BOWL",
    \chinaOn    -> "CHINA"
];

~labelCase = { |name|
    var s = name.asString;
    // ALL CAPS: the GUI is a 1-bit monospace surface and mixed case broke the
    // grid. Callers that want a sentence build one themselves.
    if(s.size > 0) { s.toUpper } { s };
};

// ── One caption format for every control ───────────────────────────────────
// The name on one line and the value under it. "NAME: value" on one line did
// not fit its own cell: a knob cell is 98 px, and "DRONE LAYER: 0.123" measured
// 107 px in Menlo 10 — Qt clipped both ends of a dozen captions. On two lines
// the longest name (STRIKE CHAIN) is 82 px in the 11 px bitmap face.
//
// Everything that writes a caption goes through this — the widget at build
// time, ~setParam's deferred update, a preset load — or the caption flips
// between formats depending on which surface last touched the control.
//
// A control whose name is already printed beside it registers its own format
// in ~labelFormats: the mixer strips show the value alone under their layer
// caption, and so do the sample knobs under their function label.
~labelFormats = ~labelFormats ?? ();
~knobText = { |name, val|
    var f = ~labelFormats[name];
    if(f.notNil) { f.(name, val) } {
        (~knobLabels[name] ? ~labelCase.(name)) ++ "\n" ++ (val ? 0).round(0.001)
    };
};
~valueOnly = { |name, val| (val ? 0).round(0.001).asString };
// The sample row's PITCH SHIFT reads its value as TWELFTHS of a semitone (the
// voice computes (pitch / 12).midiratio, 10_sample_system.scd), so the ±24
// knob moves a sample ±2 semitones. The sound is kept as it is; the readout
// says what is heard.
~labelFormats[\samplePitch] = { |name, val|
    (~knobLabels[name] ? ~labelCase.(name)) ++ "\n" ++ ((val ? 0) / 12).round(0.01) ++ " st"
};
// GRAIN SIZE is a grain LENGTH, 0.8-4 s, in both the sample voice and the
// corpus (10_, 14_): shorter grains on the forest read as a pulse. Numbers or
// UGens, so the SynthDefs and the readout share one mapping.
~grainLen = { |g| g.clip(0.05, 1.0).linexp(0.05, 1.0, 0.8, 4.0) };
~labelFormats[\grainSize] = { |name, val|
    (~knobLabels[name] ? ~labelCase.(name)) ++ "\n" ++ ~grainLen.(val ? 0.2).round(0.1) ++ " s"
};

// ─── The single write path ──────────────────────────────────────────────────
// source: \midi | \osc | \gui | \code — used for the BRIDGE liveness light.
// Value is in NATIVE units (Hz, semitones, …); use ~setParamNorm for 0–1.
~setParam = { |name, value, source=\code|
    var def = ~paramDefsByName[name];
    case
    { def.isNil } {
        ("~setParam: unknown parameter '%'".format(name)).warn;
        nil
    }
    // 0 · GOLPE tuning (19_golpe.scd): while a row or a step of the grid is
    //     being tuned, PITCH, HARM, TEXTURE and BODY tune it instead — from
    //     the GUI and from MIDI. The breath, configs and the browser still
    //     write the global value underneath.
    { ~golpeTakes.notNil and: { ~golpeTakes.(name, source) } } {
        ~golpeTuneSet.(~golpeEditKnobs[name], def[\spec].unmap(def[\spec].constrain(value)));
        value
    }
    {
        var spec = def[\spec];
        var val = spec.constrain(value);

        // 0a · A hand on a layer's fader lights the knobs that reach that
        //      layer and greys the rest for a moment (4_gui.scd).
        if([\gui, \midi].includes(source)) { ~mixFocusOn !? { ~mixFocusOn.(name) } };

        // 0b · CRUDO glides (14_, ~crudoGlide): its length is taken from the
        //      tempo now, before the bus moves.
        if(name == \corpusCrudo) {
            ~crudoGlide !? { |g| g.set(\time, ~crudoRampTime.value) };
        };

        // 1 · control bus (what the SynthDefs actually read)
        if((def[\hasBus] ? true) and: { ~buses.notNil } and: { ~buses[name].notNil }) {
            ~buses[name].set(val);
        };

        // 2 · beat-engine mirror (routine reads ~beatParams directly)
        if(def[\beatParam].notNil and: { ~beatParams.notNil }) {
            ~beatParams[def[\beatParam]] = val;
        };

        // 2b · exclusive group (radio behaviour)
        //     Enforced HERE rather than in the OSC handler because ~setParam is
        //     the one path every surface already shares — OSC from the browser,
        //     MIDI CC, and the SC GUI button all land here. Enforcing it in the
        //     handler would leave MIDI and the GUI able to tick two arcs at
        //     once. Turning one ON turns its siblings OFF (which recurses once,
        //     harmlessly: val is 0 there, so the branch is not re-entered) and
        //     each sibling echoes its own new state to the browser and the GUI.
        //     Turning one OFF is unconstrained — all-off is a legal state.
        if(def[\exclusiveGroup].notNil and: { val > 0.5 }) {
            ~paramDefs.do { |other|
                if(other[\exclusiveGroup] == def[\exclusiveGroup]
                    and: { other[\name] != name }
                    and: { (~controlValues[other[\name]] ? 0) > 0.5 }) {
                    ~setParam.(other[\name], 0, source);
                };
            };
        };

        // 3 · language-side cache
        if(~controlValues.notNil) { ~controlValues[name] = val };

        // 3b · where the Cámara's breath returns to (14_phenological_corpus,
        //     ~phenoBreath). Every hand, MIDI, OSC or config write sets it;
        //     the breath's own writes (\pheno) never do.
        if(source != \pheno and: { ~breathHome.notNil } and: { ~breathHome.includesKey(name) }) {
            ~breathHome[name] = val;
        };

        // 4 · GUI knob + label (event-driven — replaces the 50ms polling loop;
        //     knob.value = does NOT fire the knob's action, so no feedback loop)
        //     Not while GOLPE tuning has the knob: it shows the tuning then.
        { if(~golpeShows.isNil or: { ~golpeShows.(name).not }) {
            var knob = if(~knobViews.notNil) { ~knobViews[name] };
            var label = if(~controlLabels.notNil) { ~controlLabels[name] };
            if(knob.notNil) { knob.value = spec.unmap(val) };
            if(label.notNil) {
                // String:capitalize does not exist in SC 3.14 — this threw on
                // EVERY ~setParam call (3419 times in one session log), so the
                // knob labels never updated and the flood buried every real
                // error in sclang_log.txt. ~labelCase does the same job.
                // ~knobLabels first: ~labelCase returns the raw parameter
                // name, so every refresh clobbered the widget's own caption —
                // BOWL became BOWLON and TX INFL became TRANSACTIONINFLUENCE
                // the first time anything touched the parameter.
                label.string = ~knobText.(name, val);
            };
        } }.defer;

        // 5 · echo to browser — ALWAYS normalized 0–1 on the CANONICAL path
        //     (HTML sliders are 0–1; setting slider.value fires no input event,
        //     so browser-origin changes echo back harmlessly and keep every
        //     connected client in sync)
        if(~visualsDest.notNil and: { def[\path].notNil }) {
            ~visualsDest.sendMsg(def[\path], spec.unmap(val));
        };

        // 6 · bridge liveness (BRIDGE status light in the main GUI)
        if(source == \osc) { ~lastBrowserOscTime = Main.elapsedTime };

        // 7 · mark state dirty for the 30 s autosaver
        ~stateDirty = true;

        val
    };
};

// Normalized entry point: MIDI (val/127) and OSC/HTML sliders (0–1) call this.
~setParamNorm = { |name, norm, source=\code|
    var def = ~paramDefsByName[name];
    if(def.isNil) {
        ("~setParamNorm: unknown parameter '%'".format(name)).warn;
        nil
    } {
        ~setParam.(name, def[\spec].map(norm.clip(0, 1)), source);
    };
};

// ─── Config persistence ─────────────────────────────────────────────────────
// JSON files in presets/, written by SC (the state hub). Loading a config
// routes every value through ~setParam, which restores the control buses AND
// pushes the SC GUI knobs and the HTML sliders (normalized echo) in one pass.
// presets/_autosave.json is written every 30 s when state changed and is
// restored automatically at the next boot; named configs are saved/loaded
// from the SC GUI CONFIGS row, the browser CONFIGS block, or OSC
// (/preset/save, /preset/load, /preset/list — string argument).

~presetDir = thisProcess.nowExecutingPath.dirname +/+ "presets";
if(File.exists(~presetDir).not) { File.mkdir(~presetDir) };

// File-name safety: keep letters/digits/-/_ — everything else becomes _
~presetNameSafe = { |name|
    name.asString.collect { |c|
        if(c.isAlphaNum or: { "-_".includes(c) }, { c }, { $_ })
    };
};

~listConfigs = {
    (~presetDir +/+ "*.json").pathMatch.collect { |p|
        PathName(p).fileNameWithoutExtension
    }.reject { |n| n == "_autosave" }.sort;
};

~broadcastPresetList = {
    if(~visualsDest.notNil) {
        ~visualsDest.sendMsg("/preset/names", ~listConfigs.value.join(","));
    };
};

// ─── Say the WHOLE state out loud ───────────────────────────────────────────
//
// ~setParam echoes one value on one path, which is right for one knob moving.
// A config load is not one knob moving: it is sixty of them at once, in a tight
// sclang loop, and the browser's picture of the instrument after it is only as
// complete as the least reliable of those sixty datagrams. Nothing retries and
// nothing reconciles, so a single UDP packet lost between sclang and the bridge
// leaves one fader on the panel showing a value the engine is not playing, with
// no way to notice except by moving it.
//
// So the load ENDS by declaring everything, deliberately and in one pass. The
// browser sets slider positions from an echo without firing an input event, so
// a resend is idempotent — the worst it can do is confirm what already arrived.
//
// Also the answer to "the browser connected after SuperCollider did". Until now
// a client arriving late got the preset LIST and nothing else: every fader on
// the panel stayed at its markup default while the engine played the restored
// autosave, and the two surfaces disagreed from the first second.
//
// Paced with a yield every 12 messages rather than fired in one burst. Sixty
// datagrams back to back is precisely the shape that drops one.
~broadcastAllParams = {
    if(~visualsDest.notNil) {
        Routine({
            var n = 0;
            ~paramDefs.do { |def|
                var name = def[\name];
                if(def[\path].notNil) {
                    ~visualsDest.sendMsg(def[\path],
                        def[\spec].unmap(
                            (~controlValues[name] ? def[\default])
                                .clip(def[\spec].minval, def[\spec].maxval)));
                    n = n + 1;
                    if(n % 12 == 0) { 0.02.wait };
                };
            };
        }).play(AppClock);
    };
};

~saveConfig = { |name, quiet=false|
    var safe = ~presetNameSafe.(name ? "unnamed");
    var path = ~presetDir +/+ safe ++ ".json";
    var sections = List.new;
    var jsonSection = { |label, event|
        var body = event.asSortedArray.collect { |pair|
            "    \"%\": %".format(pair[0], pair[1].asFloat)
        }.join(",\n");
        "  \"%\": {\n%\n  }".format(label, body)
    };
    var params = ();
    ~paramDefs.do { |def| params[def[\name]] = ~controlValues[def[\name]] ? def[\default] };
    // The two breathed knobs are saved where the breath returns to, not where
    // it happened to be: otherwise every autosave on an empty day would store
    // the thinned value and the next boot would breathe around that.
    (~breathHome ? ()).keysValuesDo { |k, v| params[k] = v };
    sections.add(jsonSection.(\params, params));
    if(~sampleControlValues.notNil) {
        sections.add(jsonSection.(\sample, ~sampleControlValues));
    };
    // Each stem's pan and auto-pan (3_synthdefs.scd, ~stemPan), as
    // "<stem>_pan" / "<stem>_auto". Written only for layers that were moved.
    if(~stemPan.notNil and: { ~stemPan.size > 0 }) {
        var st = ();
        ~stemPan.keysValuesDo { |name, v|
            st[(name ++ "_pan").asSymbol] = v[\pan] ? 0;
            st[(name ++ "_auto").asSymbol] = v[\auto] ? 0;
        };
        sections.add(jsonSection.(\stems, st));
    };
    // The GOLPE grid, one string per row ("x" hit, "." rest), so the file
    // shows the rhythm. jsonSection writes floats only, hence its own writer.
    if(~golpePattern.notNil) {
        sections.add("  \"golpe\": {\n%\n  }".format((
            ["    \"kit\": \"%\"".format(~golpeKit ? \muslimgauze),
             "    \"afinar\": %".format((~golpeAfinar ? 0).asFloat.round(0.01)),
             "    \"peso\": { % }".format(~golpeRows.collect { |row|
                 "\"%\": %".format(row, ((~golpePeso ? ())[row] ? 1).asFloat.round(0.01)) }.join(", "))]
            ++ (~golpeTuneJSON !? { ~golpeTuneJSON.value } ? [])
            ++ ~golpeRows.collect { |row|
                "    \"%\": \"%\"".format(row, ~golpeToString.(~golpePattern[row]))
            }).join(",\n")));
    };
    // (The "spatial" section — spatialX/Y, roomSize, distanceEffect — is no
    // longer written: those buses fed only the never-played \elektronBell.
    // Old configs still carry it; the loader skips keys with no bus.)
    File.use(path, "w", { |f|
        f.write("{\n  \"meta\": { \"engine\": \"BiocracyEngine\", \"version\": 1, \"saved\": \"%\" },\n%\n}\n"
            .format(Date.getDate.format("%Y-%m-%d %H:%M:%S"), sections.join(",\n")));
    });
    if(quiet.not) {
        ("Config saved: " ++ path).postln;
        ~broadcastPresetList.value;
    };
    safe
};

~loadConfig = { |name, retried=false|
    var safe = ~presetNameSafe.(name ? "_autosave");
    var path = ~presetDir +/+ safe ++ ".json";
    if(File.exists(path).not) {
        ("Config not found: " ++ path).warn;
    } {
        // parseJSON THROWS on malformed JSON (it does not return nil) — a
        // hand-edited or truncated preset file must not take the engine down
        var dict = try {
            File.use(path, "r", { |f| f.readAllString }).parseJSON
        } { |err| nil };
        if(dict.isNil) {
            ("Config unreadable (bad JSON): " ++ path).warn;
        } {
            // Early-boot guard: buses may not exist yet — retry once in 2 s
            if((~buses.isNil or: { ~buses.size == 0 }) and: { retried.not }) {
                ("Config '%' deferred 2s (buses not ready)".format(safe)).postln;
                AppClock.sched(2.0, { ~loadConfig.(safe, true); nil });
            } {
                // ── Safe boot ───────────────────────────────────────────
                //
                // _autosave is not an artistic decision. It is written every
                // 30 s and records wherever the knobs happened to be — so a
                // session spent finding the limits of module 6 becomes the
                // permanent opening state of the instrument, and the engine
                // comes up already saturating with nothing touched. That is
                // what happened: timeDilation and percRate both restored at
                // 100% of range, which is maximum ring length against nine
                // times the default spawn rate, and the two compound.
                //
                // So the autosave gets a ceiling that a NAMED preset does not.
                // A preset the performer saved deliberately is reproduced
                // exactly, extremes and all; the autosave is only allowed to
                // put the instrument back somewhere it can be heard.
                //
                // 0.85 of range, and only for the controls whose ceiling
                // compounds — a rate, a ring length, the transaction latch.
                // Everything else, mix faders included, restores untouched:
                // balance is the performer's business.
                //
                // This LIMITS rather than forbids. Every one of these is still
                // reachable live, at its full range, the moment it is asked
                // for. What is no longer possible is arriving at the extreme by
                // simply starting the program.
                block { |break|
                    var isAuto = (safe == "_autosave");
                    var compounding = [\timeDilation, \percRate, \dustRate,
                                       \bellEvery, \transactionInfluence,
                                       \pulseGain, \windowWidth];
                    var clamped = [];
                    (dict["params"] ?? ()).keysValuesDo { |k, v|
                        var key = k.asSymbol;
                        var val = v.asFloat;
                        // MEZCLA never comes back from the autosave: every
                        // start is the registry default, and only a config
                        // loaded on purpose — MEZCLA_*, or one saved with the
                        // knob moved — changes it. Once restored at boot it
                        // followed every config after it, since base configs
                        // don't carry the key (2026-10-07). The default is 1
                        // since 2026-10-18 (the dome); this line still forced
                        // 0 and undid it at every boot.
                        if(isAuto and: { key == \mixCarve }) {
                            val = (~paramDefsByName[\mixCarve] ? ())[\default] ? 1.0 };
                        if(isAuto and: { compounding.includes(key) }) {
                            var def = ~paramDefs.detect { |d| d[\name] == key };
                            if(def.notNil) {
                                var spec = def[\spec];
                                var norm = spec.unmap(val.clip(spec.minval, spec.maxval));
                                if(norm > 0.85) {
                                    var capped = spec.map(0.85);
                                    clamped = clamped.add(
                                        key.asString ++ " " ++ val.round(0.001)
                                        ++ "->" ++ capped.round(0.001));
                                    val = capped;
                                };
                            };
                        };
                        // A key this engine no longer has (an old config) is
                        // skipped quietly rather than warned about on every load.
                        if(~paramDefsByName[key].notNil) { ~setParam.(key, val, \preset) };
                    };
                    if(clamped.size > 0) {
                        ("⚠ SAFE BOOT: " ++ clamped.size
                            ++ " control(s) held below their ceiling on restore: "
                            ++ clamped.join(", ")).postln;
                        "  The autosave had them at the top. Push them back up if".postln;
                        "  that is where you want them — this only stops the engine".postln;
                        "  from STARTING there.".postln;
                    };
                };

                // Say out loud when a config arrives with layers muted.
                //
                // _autosave persists every 30 s and is restored at boot, so a
                // mute made once during a session becomes the permanent
                // opening state of the piece — and there is nothing on either
                // surface that announces it. A session was lost to exactly
                // this: six of the eight mix faders were saved at 0.0, so the
                // engine came up correct and then went half-silent the moment
                // the config landed, which reads as "the sound broke" rather
                // than "a fader is down".
                //
                // Not overridden — a mute can be deliberate. Just never silent.
                block { |break|
                    // Only layers that are ON by default: the five motor faders
                    // rest at 0, and a config that leaves them there has not
                    // muted anything.
                    var muted = (dict["params"] ?? ()).keys.asArray.select { |k|
                        var def = ~paramDefsByName[k.asSymbol];
                        k.asString.beginsWith("mix")
                            and: { def.notNil and: { def[\default] > 0 } }
                            and: { ((dict["params"][k] ? 1).asFloat) <= 0.001 }
                    }.sort;
                    if(muted.size > 0) {
                        ("⚠ CONFIG '" ++ safe ++ "' MUTES " ++ muted.size
                            ++ " LAYER(S): " ++ muted.join(", ")).postln;
                        "  Those layers will be SILENT until their faders are raised".postln;
                        "  (matrix mixer, CC 42-49, or the browser's right rail).".postln;
                    };
                };
                // And say it just as loudly in the other direction.
                //
                // The mute warning above exists because a fader left at 0.0
                // became the permanent opening state of the piece. A control
                // left at its CEILING does exactly the same thing and was not
                // announced at all — so a session spent pushing module 6 to
                // find its limits was saved at 20:46 and restored at every
                // boot afterwards, and the engine came up already saturating
                // with no interaction at all. Same trap, opposite end, and it
                // cost more because "it clicks from startup" reads as a broken
                // build rather than as a knob that was left up.
                //
                // Only the parameters whose ceiling actually compounds — spawn
                // rates, ring lengths, the transaction latch. A mix fader at
                // maximum is a balance decision and none of this business.
                block { |break|
                    var watch = [\timeDilation, \percRate, \dustRate, \bellEvery,
                                 \transactionInfluence, \pulseGain, \windowWidth];
                    var hot = watch.select { |k|
                        var def = ~paramDefs.detect { |d| d[\name] == k };
                        var v = (dict["params"] ?? ())[k.asString];
                        (def.notNil and: { v.notNil }) and: {
                            var spec = def[\spec];
                            // within 2% of the top of its own range
                            (spec.unmap(v.asFloat.clip(spec.minval, spec.maxval)) >= 0.98)
                        };
                    };
                    if(hot.size > 0) {
                        ("⚠ CONFIG '" ++ safe ++ "' RESTORES " ++ hot.size
                            ++ " CONTROL(S) AT MAXIMUM: " ++ hot.join(", ")).postln;
                        "  These compound — a rate and a ring length at once is what".postln;
                        "  saturates the engine before anything has been touched.".postln;
                    };
                };
                (dict["sample"] ?? ()).keysValuesDo { |k, v|
                    var key = k.asSymbol, val = v.asFloat;
                    if(~sampleBuses.notNil and: { ~sampleBuses[key].notNil }) {
                        ~sampleBuses[key].set(val);
                    };
                    if(~sampleControlValues.notNil) { ~sampleControlValues[key] = val };
                    {
                        if(~sampleKnobViews.notNil and: { ~sampleKnobViews[key].notNil }
                            and: { ~sampleControlSpecs.notNil } and: { ~sampleControlSpecs[key].notNil }) {
                            ~sampleKnobViews[key].value = ~sampleControlSpecs[key].unmap(val);
                        };
                        if(~sampleControlLabels.notNil and: { ~sampleControlLabels[key].notNil }) {
                            ~sampleControlLabels[key].string = ~knobText.(key, val);
                        };
                    }.defer;
                };
                // Stem pans. A config without them leaves the panning where it
                // is, like the motor faders an old config does not mention.
                if(~stemPanSet.notNil) {
                    (dict["stems"] ?? ()).keysValuesDo { |k, v|
                        var parts = k.asString.split($_);
                        if(parts.size == 2) {
                            var name = parts[0].asSymbol;
                            if(parts[1] == "pan") { ~stemPanSet.(name, v.asFloat, nil) };
                            if(parts[1] == "auto") { ~stemPanSet.(name, nil, v.asFloat) };
                        };
                    };
                };
                // The GOLPE grid. A config without it leaves the pattern as
                // it is, like the stems above.
                if(dict["golpe"].notNil and: { ~golpeLoad.notNil }) { ~golpeLoad.(dict["golpe"]) };
                (dict["spatial"] ?? ()).keysValuesDo { |k, v|
                    if(~buses.notNil and: { ~buses[k.asSymbol].notNil }) {
                        ~buses[k.asSymbol].set(v.asFloat);
                    };
                };
                ("Config loaded: " ++ safe).postln;
                // WHICH config, so the browser's dropdown can follow the SC
                // GUI's LOAD button instead of showing whatever was last
                // picked there — and the reverse, since the same line runs
                // when the load came in on /preset/load from the panel.
                if(~visualsDest.notNil) {
                    ~visualsDest.sendMsg("/preset/loaded", safe);
                };
                // And the whole state, once, after every value has landed.
                // See ~broadcastAllParams: sixty echoes fired from a tight loop
                // is exactly the burst that loses one, and a lost one leaves the
                // two surfaces disagreeing with nothing to notice it.
                if(~broadcastAllParams.notNil) { ~broadcastAllParams.value };
                // The SC GUI's own dropdown, when the load came from the
                // browser. ~presetMenu is nil until 4_gui has run.
                {
                    if(~presetMenu.notNil) {
                        // indexOfEqual, NOT indexOf: indexOf compares by
                        // identity (===), and two Strings with the same
                        // letters are different objects — so it always
                        // returned nil and this menu never followed a load
                        // made from the browser.
                        var i = (~listConfigs.value ? []).indexOfEqual(safe);
                        if(i.notNil) { ~presetMenu.value = i };
                    };
                }.defer;
            };
        };
    };
};

// Autosave: every 30 s persist to presets/_autosave.json if anything changed
// since the last save (marked by ~setParam). Restored at next boot by
// start_sonification.scd.
~stateDirty = false;
SystemClock.sched(30, {
    if(~stateDirty == true) {
        ~saveConfig.(\_autosave, quiet: true);
        ~stateDirty = false;
    };
    30
});

"Parameter registry loaded: % parameters, % OSC routes, % MIDI CCs.".format(
    ~paramDefs.size, ~oscToParamMap.size, ~midiCCToParam.size
).postln;
"Config persistence ready: % (%).".format(~presetDir, ~listConfigs.value.join(", ")).postln;
)
