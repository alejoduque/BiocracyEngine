// s8MemoryHierarchy.ts — slot 8 · Memory Hierarchy · POLVO · stage 5/6 INSCRIBED
import * as THREE from "three";
import type { ParliamentState } from "../parliament/parliamentStore";
import { getVizMotion, readVoteFlash, isAlarm } from "../vizMotion";
import { getScAudio } from "../scAudio";
import { getSources } from "../sources";
import { makeExcursionEmitter } from "../slotVoice";
import { makeResonatorBank } from "../resonators";
import {
    makeNodeField, makeTubeLinks, makeParticles, makeLabelField, makeSpectrumRings,
    makeSpectrumBars, makeWaveRibbon, makePeakCaps, makeLevelRail, makeCalm, attachPicker,
} from "../slotThree";
import { mountSlotTicker } from "../slotTicker";
import { Viz, pickSpecies, showStage } from "../visualizationSwitcher";
import { INSTRUMENTS, SLOT_NOUNS, readInstrument, makeOnsetEdge, lerp, fixed2 } from "./instruments";
import { makeSlotStage, makeKnobs } from "./stage";
import { pendulum } from "./turns";

// ─── Slot 8: Memory Hierarchy ─────────────────────────────────────────────────
// Concept preserved: 3 layers of memory blocks; hex noise matrix background;
//   drop lines between layers; glitch displacement.
// Three.js: layers as wireframe box meshes; hex labels as canvas textures;
//   drop lines as LineSegments.
// 20-knob mapping:
//   volume        → block alpha + label brightness
//   pitchshift    → layer vertical offset
//   timedilation  → noise refresh speed + layer animation
//   spectralshift → layer color (amber↔cyan)
//   spatialspread → layer horizontal width ratio
//   texturedepth  → block count density + inner grid
//   atmospheremix → background fade
//   memoryfeed    → drop line weight + persistence
//   harmonicrich  → crosshatch density
//   resonantbody  → block border weight
//   masteramp     → global brightness
//   filtercutoff  → background hex brightness
//   noiselevel    → faulting block displacement amplitude
//   noisefilt     → drop line count between layers
//   dronedepth    → inner animated box visible depth
//   dronefade     → hex label color warmth
//   dronespace    → vertical layer gap
//   dronemix      → drop line color saturation
//   delayfeedback → ghost persistence (hero param)
//   txInfluence   → faulting probability + chromatic aberration

export function mountMemoryHierarchy(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(4);

    const stage = makeSlotStage(stageEl, "s8", {
        bloom: [0.4, 0.4, 0.6],
        afterimage: 0.88, chromatic: true,
        inst: INSTRUMENTS.s8,
        probe: () => (layerBorders.reduce( (a: number, b: any) => a + b.rotation.z + (b.material?.opacity ?? 0) * 10, 0)),
    });
    const { W, H, renderer, scene, camera, controls, afterimage } = stage;
    const bloom = stage.bloom!;
    const chromatic = stage.chromatic!;
    const kn = makeKnobs({ memFeed: 0.5, resBody: 0.5 });
    // Everything this slot draws hangs off one root group. That is what
    // makes the rebuild possible: depth is distributed across its children
    // and the whole world can be lifted or turned without touching the
    // camera, which now belongs to the viewer.
    const root8 = new THREE.Group();
    const turn8 = pendulum();
    scene.add(root8);

    // Instrumental identity. Six slots, six voices of the engine, no
    // repeats — this one is mountMemoryHierarchy. The name was drawn into the scene as
    // a sprite; it is gone. The binding it announced is the real one and
    // survives: this slot reads inst8's band and its voice's onsets.
    const inst8 = INSTRUMENTS.s8;
    // The constellation backdrop for this slot, coloured by inst8's hue
    // and driven by its band. See mountSlotField.
    // ── No constellation on this slot ─────────────────────────────────────
    // The animal field ran on all five of 5-9, which made it the wallpaper of
    // the right-hand half of the instrument rather than something that means
    // anything where it appears. It is kept on two: slot 5, the one field that
    // still answers the sound, and slot 9, where the animal whose clip is
    // playing is the animal that lights. Here the depth belongs to the
    // structure.
    //
    // The onset edge stays — that is the voice, not the sky. See makeOnsetEdge.
    const onsetOf8 = makeOnsetEdge(inst8);
    // POLVO. Many modes, high and fast-dying: not one gesture but a cloud of
    // small independent ones, which is what granular synthesis is. damp 0.86
    // is the shortest of the five — each grain is over before the next lands.
    const ring8 = makeResonatorBank({ n: 40, baseFreq: 0.031, freqRatio: 1.11, damp: 0.86, spread: 0.7 });
    const emitSpill8 = makeExcursionEmitter("dust");

    // ── No glitch pass on this slot ──────────────────────────────────────
    //
    // There was one: block displacement plus an RGB tear, driven by spectral
    // flux and chain priority. It went, and the reason is worth keeping.
    //
    // A full-screen displacement destroys the one thing this slot exists to
    // show. The rings and the bars ARE the spectrum — their shape is the
    // reading — and a pass that slides rows of the finished image sideways
    // makes that shape unreliable at exactly the moments it carries the most
    // information, since the pass fired on flux, which is to say on every
    // transient. It also tore the captions, which have numbers in them.
    //
    // What the tear was reaching for — this slot should look like a machine
    // under load — is now in the geometry instead, where it can be read: the
    // waveform ribbon, the peak-hold caps and the level rail below all move
    // with the sound and none of them makes the rest of the picture illegible.

    const LAYERS = 3;

    // Layer outer wireframe borders
    const layerBorders: THREE.LineLoop[] = [];
    for (let j = 0; j < LAYERS; j++) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
            -1, -1, 0,   1, -1, 0,   1, 1, 0,   -1, 1, 0
        ]), 3));
        geo.setIndex([0, 1, 2, 3, 0]);
        const mat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true });
        const loop = new THREE.LineLoop(geo, mat);
        root8.add(loop);
        layerBorders.push(loop);
    }

    // ── Blocks are blocks ────────────────────────────────────────────────
    //
    // These were BoxGeometry(1,1,1) scaled to (cw, baseH-20, 1): a box with a
    // depth of one unit against a width of two hundred, which is a rectangle
    // with rounding error. And each was its own Mesh with its own material —
    // LAYERS x roster of them, every one a separate draw call.
    //
    // One InstancedMesh with real depth per block. A memory hierarchy is the
    // one structure here that is genuinely about VOLUME — how much fits at
    // each level — so a level that is full should look full.
    const BLOCK_CAP = LAYERS * Math.max(1, activeRoster.length);
    const blocks8 = makeNodeField(root8, BLOCK_CAP, 0.5, 2,
        { wireframe: true, opacity: 0.85 });
    blocks8.count = BLOCK_CAP;
    const pick8 = attachPicker(renderer.domElement, blocks8.mesh, controls);

    // Drops carry the layer's own depth now. They were written at a constant
    // z = 2 while the levels they fall between travel to -j*90*(...) — so an
    // eviction was drawn in front of the hierarchy rather than inside it.
    const MAX_DROPS = 24;
    const drops8 = makeTubeLinks(root8, MAX_DROPS, 0xc8ffe6, 0.5);
    const dropMat = drops8.material;
    const _t8a = new THREE.Vector3();
    const _t8b = new THREE.Vector3();
    const _q8  = new THREE.Quaternion();
    const _e8  = new THREE.Euler();
    const _s8  = new THREE.Vector3();
    const motes8 = makeParticles(root8, 900, Math.max(W, H) * 1.5, 0xc8ffe6);
    // L1..Ln, nearest level first. A cache hierarchy's whole subject is WHICH
    // level you reached, and nothing on screen said.
    // Glitched on purpose, and only here. POLVO is the granular voice and this
    // is the slot whose backdrop is machine memory — an RGB split on the type
    // is the one place in the six where that reads as the subject rather than
    // as an effect. The offset is derived from the text itself, so a caption
    // tears the same way every time it is drawn instead of boiling.
    const tags8 = makeLabelField(root8, LAYERS, 0xc8ffe6, 13, {
        font: "700 26px ui-monospace, 'SF Mono', Menlo, monospace",
        tracking: 2.5,
        plate: true,
        // Live values here too — anchored so the digits turn over in place.
        anchorLeft: true,
    });
    const sala8Was = new Float32Array(LAYERS).fill(-1);
    /** Smoothed magnitude of each level's mode. See the note in animate(). */
    const ringS8 = new Float32Array(LAYERS);
    /** When each caption was last rasterised, so it cannot step faster than 6 Hz. */
    const sala8At = new Float64Array(LAYERS);

    // ── An audio visualiser for the master bus ───────────────────────────
    //
    // This slot is POLVO, the granular voice, and its hierarchy is the machine
    // looking at its own memory — which makes it the right one of the six to
    // also look at the machine's own SOUND. \masterScope analyses the master
    // bus AFTER the limiter and sends sixteen log-spaced bands at 20 Hz; that
    // is the real output of the instrument, not a file and not a microphone.
    //
    // Three concentric rings, each deformed by its own third of the spectrum,
    // plus one bar per band standing off a circle. Both in world space rather
    // than on a canvas overlay: a 2-D layer cannot be orbited, cannot be
    // occluded by the levels in front of it, and does not catch the bloom —
    // which is the whole reason these slots have depth at all.
    const spectrum8 = makeSpectrumRings(root8, Math.min(W, H) * 0.30, 3, 96, 0xffaa00);
    const bars8 = makeSpectrumBars(root8, 16, 0xc8ffe6);
    // Peak holds on the bars. One float per band, and the single most legible
    // addition a spectrum display can have: a transient leaves a mark that
    // outlives the bar under it, so a fast passage stops being a blur.
    const caps8 = makePeakCaps(root8, 16, 0xffffff);
    // The level HISTORY, which nothing else on the slot shows. Everything here
    // reports the present instant; the ribbon is the only thing that says what
    // the last few seconds sounded like.
    const wave8 = makeWaveRibbon(root8, 160, Math.min(W, H) * 1.15,
        Math.min(W, H) * 0.085, 0xffaa00);
    // And the one absolute reading: how close the master bus is to the
    // ceiling. \masterScope analyses after the limiter, so a pinned rail is
    // the limiter working — visible without turning round to look at SC.
    const rail8 = makeLevelRail(root8, Math.min(W, H) * 0.62, 7);
    // Smoothed per band. The scope sends 20 frames a second and the display
    // draws 60, so the raw array steps three frames out of four — the same
    // mistake the chain data made, and the same fix.
    const band8 = new Float32Array(16).fill(0);
    const calm8 = makeCalm();
    const ticker8 = mountSlotTicker(stageEl,
        "POLVO · opalDust · JERARQUÍA DE NIVELES  ·  LA PROFUNDIDAD ES OCUPACIÓN",
        "rgba(200,255,230,");

    // Hex noise background — canvas texture updated per frame
    const hexCanvas = document.createElement("canvas");
    hexCanvas.width = 512; hexCanvas.height = 512;
    const hexCtx = hexCanvas.getContext("2d")!;
    const hexTexture = new THREE.CanvasTexture(hexCanvas);
    const hexPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(W, H),
        new THREE.MeshBasicMaterial({ map: hexTexture, transparent: true, opacity: 0.25, depthWrite: false })
    );
    hexPlane.position.z = -5;
    root8.add(hexPlane);

    // Hex noise data
    let hexData: string[] = [];
    // Seeded once, deterministically, then overwritten cell by cell with live
    // chain values as they arrive (see the refresh below). A fixed seed rather
    // than 120 random words so the backdrop is the same on every mount until
    // the chain says otherwise — the field is data, and data that differs every
    // time you open the slot is not data.
    for (let i = 0; i < 120; i++)
        hexData.push((((i * 2654435761) >>> 16) & 0xffff)
            .toString(16).padStart(4, "0").toUpperCase());

    // The rings, split by source (sources.ts): the inner ring is the forest,
    // the middle the machine, the outer the bed — each 32 points of its own
    // spectrum, smoothed like the bars. The bars stay the whole master bus.
    const srcRing8 = new Float32Array(96);
    for (let r = 0; r < 3; r++) {
        ((spectrum8.group.children[r] as THREE.Line).material as THREE.LineBasicMaterial)
            .color.set([0x7fd6b0, 0xffa040, 0x8a6cc8][r]);
    }
    // The hex backdrop is redrawn and uploaded only when a word or its style
    // changes, and at most six times a second. It was cleared, refilled and
    // re-uploaded (512 × 512) on every frame.
    let hexSig = -1, hexDirty = true, hexAt = 0;

    let rafId: number;
    let frame = 0;

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        const onset8 = onsetOf8(st);
        const sp8 = (window as any).__slot8Soneth ?? {};

        // Shared idle drift + vote flash. These six slots had NO vote channel
        // at all — no onState, no store subscription, no listener — so the top
        // of animate() is the only hook they have, and it is the same idiom
        // slots 1 and 3 already use.
        const vm8 = getVizMotion();
        const vf8 = readVoteFlash();

        // ── This slot's own instrument ───────────────────────────────────
        // level is the energy in ITS register of the master spectrum, env the
        // decaying attack of ITS last note. Reading the whole mix would make a
        // kick visual brighten because a bell rang; reading control values
        // (which is all these six ever did) makes it react to the intention
        // rather than to the sound.
        const au8 = readInstrument(inst8);
        // Stepped in TIME, not in frames. The bank's freqs are cycles per
        // frame, so an unscaled step runs the whole body 2.4x fast on a
        // 144 Hz panel — the same patch shaking on one display and
        // swinging on another. `speed` normalises against 60 Hz.
        ring8.step(calm8.dt * 60);
        if (onset8 > 0) {
            ring8.strike(onset8, au8.tone);
            // Dust does not arrive from a point. Scattered origin per grain, so
            // the sky is stirred rather than struck.
        }

        const { vol, pitchSh, tDil, specS, spatSp, texDep, atmMix, memFeed, harmR, resBody,
            masterA, filtC, noiseL, noiseF, droneD, dronFd, droneSpace, droneMix, delayFb,
            txInf } = kn.read(sp8);
        const aiOpt    = st?.ai?.optimization ?? 10;

        afterimage.uniforms["damp"].value = lerp(0.82, 0.97, delayFb);
        chromatic.uniforms["amount"].value = txInf * 0.006;
        bloom.strength = lerp(0.10, 0.38, resBody * masterA);

        // Stepped and read HERE: the hex backdrop below is the chain's own
        // data now, so the frame needs the reading before it draws anything.
        calm8.step("__slot8Soneth");
        const e8b = calm8.eth;
        const c8 = calm8.chain;
        // Hex noise — beatTempo speeds churn (stored in sp8.beatTempo if present, else tDil proxy)
        const beatT = sp8.beatTempo ?? 0.5;
        const hexRefresh = Math.max(1, Math.floor(8 - tDil * 4 - beatT * 5));
        if (frame % hexRefresh === 0) {
            // ── The hex is the CHAIN's hex ────────────────────────────────
            // 120 random 16-bit words standing in for data, on a slot whose
            // backdrop is meant to be the machine's own memory. These are the
            // live values instead — the counterparty signature, the block hash,
            // the nonce, what moved — rendered as the hex they actually are.
            // Which cell turns over walks with the block, so the field churns
            // when the chain does and holds when it does not.
            const idx = Math.floor(
                ((e8b.hash * 4093 + e8b.nonce * 131 + frame * 0.017) % 1) * hexData.length);
            const word = [e8b.addr, e8b.hash, e8b.value, e8b.calldata][
                Math.floor(e8b.index * 4) % 4];
            const hw = Math.floor(word * 65535).toString(16)
                .padStart(4, "0").toUpperCase();
            if (hw !== hexData[idx]) { hexData[idx] = hw; hexDirty = true; }
        }
        const wR = Math.floor(lerp(102, 220, dronFd));
        const wG = Math.floor(lerp(51, 130, dronFd));
        const hexA = Math.round((0.3 + texDep * 0.4 + filtC * 0.2) * 50) / 50;
        const hexPx = 7 + Math.floor(texDep * 4);
        const hexCount = Math.floor(20 + texDep * 50);
        const sig = ((wR * 256 + wG) * 64 + Math.round(hexA * 50)) * 2048 + hexPx * 128 + hexCount;
        const nowHex = performance.now();
        if ((hexDirty || sig !== hexSig) && nowHex - hexAt > 160) {
        hexSig = sig; hexDirty = false; hexAt = nowHex;
        hexCtx.clearRect(0, 0, 512, 512);
        hexCtx.fillStyle = `rgba(${wR},${wG},0,${hexA})`;
        hexCtx.font = `${hexPx}px monospace`;
        // Fixed positions, changing CONTENT. Every word was being redrawn at a
        // fresh random point each frame, so the backdrop was a snowstorm rather
        // than a field of data — and the whole 512x512 texture was re-uploaded
        // to the GPU sixty times a second to achieve it. A hash-derived grid
        // holds still; hexData mutating one cell per refresh is what moves.
        for (let i = 0; i < hexCount; i++) {
            const hx = ((i * 97) % 23) / 23 * 496 + 4;
            const hy = ((i * 61) % 29) / 29 * 496 + 4;
            hexCtx.fillText(hexData[i % hexData.length], hx, hy);
        }
        hexTexture.needsUpdate = true;
        }
        (hexPlane.material as THREE.MeshBasicMaterial).opacity = (0.15 + texDep * 0.2 + filtC * 0.1) * masterA;

        // ── Consensus + vote, slot 8 ─────────────────────────────────────
        // This was the ONLY slot of the sixteen receiving neither: it read
        // ai.optimization and species presence and nothing else from the
        // parliament. Both now land in its own vocabulary — a memory
        // hierarchy has coherence and it has flushes.
        //
        // CONSENSUS = cache coherence: agreement makes the layers line up
        // and read cool/aligned, disagreement makes them ragged and warm.
        const consensus8 = typeof st?.consensus === "number" ? st.consensus : 0.5;
        // VOTE = a flush wave travelling DOWN the hierarchy, L1 first. Each
        // layer lights as the front passes it, which is what a flush looks
        // like from outside: the fast levels give up their lines first.
        const flushFront = vf8 ? (1 - vf8.flash) * (LAYERS + 1) : -1;

        // Layer layout
        const baseH = H / (LAYERS + 1.5);
        const layerGap = 30 + pitchSh * 40 + droneSpace * 20;
        const aiOpt100 = aiOpt / 100;

        let cy = -H / 2 + 30 + pitchSh * 40;
        // The ring's quorum is the chamber's occupancy, and occupancy is
        // absorption — Sabine. Read defensively: slot 8 has no other reason to
        // touch the phenological cursor.
        let quorum8 = 0.5;
        try {
            quorum8 = Math.min(1, (window as unknown as {
                __phenoCursor?: { quorum?: number };
            }).__phenoCursor?.quorum ?? 0.5);
        } catch { /* ignore */ }
        const chMix8 = sp8.chambermix ?? 0.18;
        const chSize8 = sp8.chambersize ?? 0.45;

        // Drop lines between layers
        let dIdx = 0;

        drops8.begin();
        pick8.update(camera);
        const dropCount = Math.floor(3 + noiseF * 5);
        // What POLVO actually listens for. dIdx was the obvious candidate and
        // it is worthless: dropCount depends only on the noiseFilt fader and
        // the loop runs it once per layer, so dIdx is the same integer on every
        // frame and the emitter never fired once. A dead emitter is worse than
        // a noisy one, because nothing announces it.
        //
        // A layer OVERFLOWING is a real event and a real cache eviction: the
        // blocks are laid out left to right by species presence times a noise
        // term, so whether they fit inside their level genuinely varies.
        let overflow8 = 0;

        for (let j = 0; j < LAYERS; j++) {
            const wRatio = lerp(0.95 * (0.8 + spatSp * 0.2), 0.25 + spatSp * 0.15, j / Math.max(LAYERS - 1, 1));
            let bw = W * wRatio * (0.8 + calm8.drift(j + 11, 0) * 0.16
                * (0.4 + calm8.swell * 1.2));
            let bx = -bw / 2;

            // The level slips when the chain is under pressure. priority is
            // how far over base fee the last actor bid — urgency — and it is a
            // far better reading of "the system is straining" than a random
            // number was. (`glitchProb` and a raw `calm8.eth` read sat here
            // too, both left over from the version that displaced on
            // Math.random(); neither was used by anything.)
            if (aiOpt < 50 && c8.priority > 0.35) {
                bx += calm8.drift(j * 3, 0) * (c8.priority - 0.35) * 1.5
                    * 70 * noiseL * (1 - aiOpt100) * (1 + txInf);
            }

            // Layer border
            const border = layerBorders[j];
            border.scale.set(bw, baseH, 1);
            border.position.set(bx + bw / 2, cy + baseH / 2, 0);
            const t = specS * (j / 3);
            const lr = lerp(1.0, 0.31, t); const lg = lerp(0.67, 0.9, t); const lb = lerp(0.0, 0.78, t);
            (border.material as THREE.LineBasicMaterial).color.setRGB(lr, lg, lb);
            // Coherence tightens the borders; the flush front blows through them.
            const flushHit = flushFront < 0 ? 0
              : Math.max(0, 1 - Math.abs(flushFront - j) * 1.4);
            (border.material as THREE.LineBasicMaterial).opacity =
              (0.5 + resBody * 0.5) * (0.4 + vol * 0.6) * masterA
              * (0.55 + consensus8 * 0.45) + flushHit * 0.6;
            if (flushHit > 0.01) {
              const fc = isAlarm(vf8?.type);
              (border.material as THREE.LineBasicMaterial).color.setRGB(
                lr + flushHit * (fc ? 0.9 : 0.4),
                lg + flushHit * (fc ? -0.3 : 0.6),
                lb + flushHit * (fc ? -0.2 : 0.5)
              );
            }
            // Idle drift: the whole stack leans, very slowly, like a shelf
            // settling. A hierarchy should not spin — this is its idiom.
            // The grain term is added below, once rz8 exists.
            // POLVO. The hierarchy stood in a plane; each level now sits at
            // its own depth so the cache reads as a stack you could walk into.
            // The high band —where granular dust lives— scatters the levels
            // apart, and a grain firing pushes its level forward.
            // Each layer takes a DIFFERENT mode, so the levels shimmer against
            // one another instead of pumping together. Granular density is many
            // uncorrelated small events; one shared envelope is precisely the
            // wrong shape for it.
            // ── The level moves at a rate you can watch ──────────────────
            // `ring8.value(j * 7)` reached modes 0, 7 and 14 of a bank whose
            // ratio is 1.11 per mode from a base of 0.031 cycles per FRAME.
            // Mode 14 therefore runs at 0.031 * 1.11^14 = 0.135 cycles/frame —
            // about EIGHT HERTZ on a 60 Hz display, and faster on a faster
            // one. That is not a level settling, it is a level buzzing, and it
            // carried the blocks and the captions with it.
            //
            // Two changes. The modes read are adjacent (0, 1, 2) rather than
            // seven apart, which keeps the three levels distinguishable
            // without reaching the top of the bank; and the displacement goes
            // through a follower, so the level shows the ENVELOPE of its mode
            // rather than the mode's own oscillation. The bank still rings at
            // its own rate — that is what makes POLVO's dust the right voice
            // for this slot — and the geometry now reads its magnitude.
            const rz8 = ring8.value(j);
            const kR8 = 1 - Math.exp(-calm8.dt / 0.14);
            ringS8[j] += (Math.abs(rz8) - ringS8[j]) * kR8;
            const rs8 = ringS8[j];
            border.position.z = -j * 90 * (0.3 + au8.level * 1.8) + rs8 * 70 * au8.amp;
            border.position.x = rs8 * 10;
            border.rotation.z = Math.sin(vm8.angle * 0.5) * 0.035 + rs8 * 0.05;
            // The room, level by level. SALA MIX and SALA RT60 are the shared
            // chamber every voice is heard through; the deeper levels print
            // what that room is doing — its occupancy from the quorum, and the
            // tail that follows from it.
            {
                const k8 = j % 6;
                const q8 = k8 === 0 ? chMix8
                    : k8 === 1 ? chSize8
                    : k8 === 2 ? quorum8
                    : k8 === 3 ? c8.entropy
                    : k8 === 4 ? chSize8 * (0.4 + chMix8 * 0.6)
                    : Math.min(1, atmMix);
                // Deadband plus a minimum interval, the same as slot 5's
                // captions and for the same reason: rasterising on every 0.01
                // crossing of a value fed from a 20 Hz stream relaid the string
                // several times a second, which reads as the type moving. Six
                // times a second is still live and is legible.
                const now8 = performance.now();
                if (Math.abs(q8 - sala8Was[j]) > 0.008 && now8 - sala8At[j] > 160) {
                    sala8Was[j] = q8;
                    sala8At[j] = now8;
                    tags8.text(j, `${SLOT_NOUNS.s8.one(j)} ${fixed2(q8)}`);
                }
            }
            _t8b.set(bx - 26, cy + baseH / 2, border.position.z);
            tags8.set(j, _t8b, (0.25 + vol * 0.5) * masterA);

            // Species blocks inside layer, as solids at the layer's own depth.
            // They used to sit at a constant z = 1 with a depth of one unit
            // while the border they belong to travelled to -j*90 — the blocks
            // were on a different plane from their own level.
            let blockCX = bx + 10;
            for (let i = 0; i < activeRoster.length; i++) {
                const pres = st?.species?.[i]?.presence ?? 0.5;
                const act  = st?.species?.[i]?.activity ?? 0.5;
                const cw = (bw - 20) * (pres / LAYERS)
                    * (0.5 + calm8.drift(i * 7 + j, 0) * 0.22 * (0.4 + calm8.swell * 1.1));
                const bi = j * activeRoster.length + i;
                const hov8 = (bi === pick8.hover);
                const grb8 = (bi === pick8.grabbed);
                // Depth is OCCUPANCY. A hierarchy is about how much fits at
                // each level, so a block holding more is a thicker block —
                // the one dimension the old rectangles could not express.
                // Depth is occupancy, and how full the BLOCK is says how much
                // the hierarchy is holding. A full block is a deep level.
                const bd = 12 + pres * 70 + act * 26
                    + c8.fullness * 40 + c8.txEnv * 14;
                _e8.set(0, 0, act * calm8.drift(i + j * 10, 2) * 0.09 * txInf);
                _q8.setFromEuler(_e8);
                _t8a.set(blockCX + cw / 2, cy + baseH / 2, border.position.z + bd * 0.35);
                // BoxGeometry in makeNodeField is built at radius*1.5 per side,
                // so the divisor turns a world extent into a scale factor.
                blocks8.setBox(bi, _t8a,
                    Math.max(cw, 5) / 0.75,
                    (baseH - 20) / 0.75,
                    bd / 0.75 * (grb8 ? 1.5 : hov8 ? 1.2 : 1),
                    _q8);
                blocks8.tint(bi,
                    hov8 || grb8 ? 1 : lerp(0.78, 1.0, harmR),
                    hov8 || grb8 ? 1 : lerp(1.0, 0.67, harmR),
                    lerp(0.9, 0.0, harmR));
                blockCX += cw + 5;
            }
            // Past the right edge of its own level: this layer has spilled.
            if (blockCX > (bx + bw)) overflow8++;

            // Drop lines to next layer
            if (j < LAYERS - 1) {
                for (let k = 0; k < dropCount && dIdx < MAX_DROPS; k++) {
                    // Deterministic per drop, so a spill is a path between two
                    // levels that stays put long enough to be read. A fresh
                    // random x every frame made twenty-four lines that shared
                    // nothing from one frame to the next.
                    const dropX = bx + (calm8.drift(j * 31 + k, 0) * 0.5 + 0.5) * bw;
                    const gx1 = calm8.drift(j * 31 + k, 1) * 22 * txInf;
                    const gx2 = calm8.drift(j * 31 + k, 2) * 22 * txInf;
                    // A spill falls between two levels that stand at different
                    // depths, so it runs between those depths. Constant z = 2
                    // drew every eviction in front of the whole hierarchy.
                    const zA = border.position.z;
                    const zB = zA - 90 * (0.3 + au8.level * 1.8);
                    _t8a.set(dropX + gx1, cy + baseH, zA);
                    _t8b.set(dropX + gx2, cy + baseH + layerGap - 2, zB);
                    drops8.add(_t8a, _t8b, 0.5 + memFeed * 1.1);
                    dIdx++;
                }
            }

            cy += baseH + layerGap;
        }
        // ── POLVO speaks ──────────────────────────────────────────────────
        // Drop lines are what spills from one level of the hierarchy to the
        // next — an eviction. Granular is exactly the register for it: each
        // spill is a grain, and a hierarchy under pressure swarms.
        emitSpill8(overflow8, 0.3 + Math.min(1, overflow8 / LAYERS) * 0.55,
            Math.min(1, overflow8 / LAYERS));
        drops8.end();
        blocks8.mesh.material.opacity = (0.18 + vol * 0.40) * masterA
            * (0.72 + c8.gasN * 0.45 + c8.blockEnv * 0.22);

        // ── The master bus, seen ──────────────────────────────────────────
        {
            const a8 = getScAudio();
            const raw8 = a8.bands;
            // One-pole per band toward the incoming frame. 20 Hz in, 60 Hz out:
            // without this the rings step three frames out of four.
            const kb = 1 - Math.exp(-(1 / 60) / 0.09);
            // Sixteen bars over however many bands SC sends (96): each
            // bar is the mean of its slice. Reading raw8[i] directly drew only
            // the first sixteen bands — the bottom few hundred hertz.
            const n8 = raw8.length || 1;
            for (let i = 0; i < band8.length; i++) {
                const j0 = Math.floor((i * n8) / band8.length);
                const j1 = Math.max(j0 + 1, Math.floor(((i + 1) * n8) / band8.length));
                let sum = 0;
                for (let j = j0; j < j1; j++) sum += raw8[j] ?? 0;
                band8[i] += (sum / (j1 - j0) - band8[i]) * kb;
            }
            const src8 = getSources();
            for (let r = 0; r < 3; r++) {
                const sp = src8.spec[r];
                for (let i = 0; i < 32; i++) {
                    const v = (sp[i * 3] + sp[i * 3 + 1] + sp[i * 3 + 2]) / 3;
                    srcRing8[r * 32 + i] += (v - srcRing8[r * 32 + i]) * kb;
                }
            }
            // The rings sit behind the hierarchy and turn against it, so the
            // sound is the room the structure stands in rather than a panel
            // bolted to the front of it.
            spectrum8.group.position.z = -LAYERS * 45;
            spectrum8.group.rotation.z = -vm8.angle * 0.22;
            spectrum8.update(src8.live ? srcRing8 : band8, 0.55 + resBody * 0.7, 0.22 + spatSp * 0.5);
            spectrum8.setOpacity((0.10 + vol * 0.30) * masterA
                * (0.6 + a8.rms * 1.6));

            bars8.mesh.position.z = -LAYERS * 45;
            bars8.mesh.rotation.z = vm8.angle * 0.35;
            bars8.update(band8, Math.min(W, H) * 0.19, 14 + texDep * 46);
            bars8.setOpacity((0.12 + vol * 0.34) * masterA
                * (0.55 + a8.high * 1.4));

            // Peak holds, sitting on the same ring as the bars and falling at
            // a fixed rate. dt from the shared clock, so they fall at the same
            // speed on a 60 and a 144 Hz panel — a peak meter whose release
            // depends on the display is not a meter.
            caps8.mesh.position.z = -LAYERS * 45;
            caps8.mesh.rotation.z = vm8.angle * 0.35;
            caps8.update(band8, Math.min(W, H) * 0.19, 14 + texDep * 46,
                calm8.dt);
            caps8.setOpacity((0.20 + vol * 0.45) * masterA);

            // The level history, laid across the foot of the hierarchy and
            // standing at the same depth as the rings. It scrolls at one
            // sample per frame, which is about three seconds of sound at 160
            // samples — long enough to see a phrase, short enough that the
            // right-hand end still reads as now.
            wave8.push(a8.rms * (1.4 + resBody * 0.8), a8.high);
            wave8.mesh.position.set(0, -H * 0.30, -LAYERS * 45 + 20);
            wave8.setOpacity((0.10 + vol * 0.34) * masterA);

            // The rail sits under the ribbon. `clip` lights when the sound is
            // sustained near the ceiling — the limiter's own reading, and the
            // only absolute number on the slot.
            rail8.group.position.set(0, -H * 0.38, -LAYERS * 45 + 20);
            rail8.update(
                Math.min(1, a8.rms * 2.6),
                Math.min(1, Math.max(a8.low, a8.mid, a8.high) * 1.8),
                Math.max(0, a8.rms * 2.6 - 0.86) * 5);
            rail8.setOpacity((0.28 + vol * 0.5) * masterA);
            // Flux is how fast the picture is changing — an onset without an
            // onset detector. It belongs on the bloom, where a transient in the
            // sound reads as the whole slot flaring rather than as one object.
            bloom.strength += a8.flux * 0.55;
        }
        blocks8.commit();

        // The air falls with the spill: POLVO is a granular voice and its
        // structure evicts downward, so the drift is downward too. MEMORY FEED
        // sets how fast it settles, GIRO AUTO turns the stack.
        motes8.step(1 / 60,
            (droneMix - 0.5) * 50 + Math.sin(c8.blockPhase * Math.PI * 2) * 22,
            vm8.rotation * 0.05,
            -(6 + memFeed * 34));
        motes8.material.opacity = (0.08 + texDep * 0.26) * masterA;
        motes8.material.size = Math.max(W, H) * (0.0012 + resBody * 0.0030);
        // A stack does not spin: it swings, and the swing drifts the way the
        // slider points (turns.ts).
        root8.rotation.y = turn8(calm8.dt, vm8.speed);
        ticker8.draw((0.35 + vol * 0.65) * masterA);
        const dmR = lerp(0.78, 1.0, droneMix); const dmG = lerp(1.0, 0.67, droneMix);
        dropMat.color.setRGB(dmR, dmG, 0);
        dropMat.opacity = (0.22 + memFeed * 0.30) * (0.4 + vol * 0.6) * masterA;

        stage.render();
    }

    animate();

    stage.onResize(() => ticker8.resize());

    return {
        name: "Memory Hierarchy", key: "8",
        destroy: () => {
            destroyed = true; cancelAnimationFrame(rafId);
            pick8.dispose();
            blocks8.dispose(); drops8.dispose();
            motes8.dispose(); tags8.dispose(); ticker8.destroy();
            spectrum8.dispose(); bars8.dispose();
            wave8.dispose(); caps8.dispose(); rail8.dispose();
            hexTexture.dispose();
            stage.destroy();
        }
    };
}
