// s6DynamicOptimality.ts — slot 6 · Dynamic Optimality · PERCUSIÓN · stage 3/6 OVERLAP
import * as THREE from "three";
import type { ParliamentState } from "../parliament/parliamentStore";
import { getVizMotion, readVoteFlash, isAlarm } from "../vizMotion";
import { makeExcursionEmitter } from "../slotVoice";
import { makeResonatorBank } from "../resonators";
import { makeNodeField, makeTubeLinks, makeDepthGrid, makeParticles, makeLabelField, makeCalm, attachPicker } from "../slotThree";
import { mountSlotTicker } from "../slotTicker";
import { Viz, pickSpecies, showStage, SPECIES_ROSTER } from "../visualizationSwitcher";
import { INSTRUMENTS, SLOT_NOUNS, readInstrument, makeOnsetEdge, lerp } from "./instruments";
import { makeSlotStage, makeKnobs } from "./stage";
import { oblique } from "./turns";

// ─── Slot 6: Dynamic Optimality (Splay Tree) ─────────────────────────────────
// Concept preserved: tree layout with root at top, children radiating down,
//   vertical breathing, scan columns in background.
// Three.js: nodes as wireframe boxes; edges as LineSegments; background scan lines.
// 20-knob mapping:
//   volume        → edge/node alpha
//   pitchshift    → root vertical offset + layer spacing
//   timedilation  → node animation speed + scroll speed
//   spectralshift → node breathing amplitude + glitch color
//   spatialspread → tree horizontal width
//   texturedepth  → node rotation speed
//   atmospheremix → background fade
//   memoryfeed    → trail persistence
//   harmonicrich  → node color warmth
//   resonantbody  → node square size
//   masteramp     → global brightness
//   filtercutoff  → grid line weight
//   noiselevel    → Y position noise
//   noisefilt     → horizontal scan line count
//   dronedepth    → inner box scale pulsing depth
//   dronefade     → background grid color warmth
//   dronespace    → tree root Y offset (hero param)
//   dronemix      → scan column density (hero param)
//   delayfeedback → afterimage damp
//   txInfluence   → glitch probability

export function mountDynamicOptimality(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(SPECIES_ROSTER.length);

    const stage = makeSlotStage(stageEl, "s6", {
        bloom: [0.4, 0.3, 0.7],
        afterimage: 0.82, chromatic: false,
        inst: INSTRUMENTS.s6,
        probe: () => (nodeData[0] ? nodeData[0].z : 0),
    });
    const { W, H, renderer, scene, camera, controls, afterimage } = stage;
    const bloom = stage.bloom!;
    const kn = makeKnobs();
    // Everything this slot draws hangs off one root group. That is what
    // makes the rebuild possible: depth is distributed across its children
    // and the whole world can be lifted or turned without touching the
    // camera, which now belongs to the viewer.
    const root6 = new THREE.Group();
    const turn6 = oblique();
    scene.add(root6);

    // Instrumental identity. Six slots, six voices of the engine, no
    // repeats — this one is mountDynamicOptimality. The name was drawn into the scene as
    // a sprite; it is gone. The binding it announced is the real one and
    // survives: this slot reads inst6's band and its voice's onsets.
    const inst6 = INSTRUMENTS.s6;
    // The constellation backdrop for this slot, coloured by inst6's hue
    // and driven by its band. See mountSlotField.
    // ── No constellation on this slot ─────────────────────────────────────
    // The animal field ran on all five of 5-9, which made it the wallpaper of
    // the right-hand half of the instrument rather than something that means
    // anything where it appears. It is kept on two: slot 5, the one field that
    // still answers the sound, and slot 9, where the animal whose clip is
    // playing is the animal that lights.
    //
    // BOWL and CHINA were read through the field here — its reach and its
    // stroke width. They are read by this slot's OWN geometry now, which is
    // where the struck voice belongs: see the branch tubes below. Better for
    // it, too, since a backdrop cannot be occluded and a branch can.
    //
    // The onset edge stays — that is the voice, not the sky. See makeOnsetEdge.
    const onsetOf6 = makeOnsetEdge(inst6);
    // PERCUSIÓN. damp 0.93 ≈ a third of a second — struck, not rung. The tight
    // mallet (spread 0.18) is the point of difference from slot 5: perc excites
    // a SMALL part of the body, so a hit moves one region of the tree and the
    // rest only trembles. freqRatio 1.19 spreads the bank wide and inharmonic,
    // which is what \opalPerc's Ringz table is.
    const ring6 = makeResonatorBank({ n: 28, baseFreq: 0.019, freqRatio: 1.19, damp: 0.93, spread: 0.18 });
    // Slot 6's measure is the jitteriest of the six — the loop adds random
    // displacement to node positions on the line after it counts which nodes
    // have arrived, so "arrived" is partly frame noise by construction. It
    // gets a higher rise threshold, and its rate gate carries more of the
    // load than the others.
    const emitArrive6 = makeExcursionEmitter("perc", { rise: 1.42 });

    // ── The tree is a solid ──────────────────────────────────────────────
    //
    // It was two Meshes per node — a 20x20x1 box and a 10x10x1 box, which is a
    // SQUARE with a nominal thickness, not a body — plus a LineSegments edge
    // pool whose vertices were written with z hardcoded to 0. The nodes already
    // carried layer depth, so every branch visibly detached from the node it
    // joined the moment the camera left the axis. The branches were drawn on a
    // plane the tree had stopped living on.
    //
    // Boxes become instanced cubes with real thickness, branches become tubes
    // that carry the node's own z, and the whole hierarchy can be orbited.
    const NODE6_R = 10;
    const nodeData: { x: number; y: number; z: number; tx: number; ty: number; layer: number }[] = [];
    activeRoster.forEach(() => {
        nodeData.push({ x: 0, y: 0, z: 0, tx: 0, ty: 0, layer: 0 });
    });
    const boxes6 = makeNodeField(root6, nodeData.length, NODE6_R, 2,
        { wireframe: true, opacity: 0.9 });
    boxes6.count = nodeData.length;
    const cores6 = makeNodeField(root6, nodeData.length, NODE6_R * 0.5, 2,
        { wireframe: true, opacity: 0.6 });
    cores6.count = nodeData.length;
    // Branches with a radius rather than a linewidth. BOWL and CHINA are read
    // here now — see the animate loop: the bowl lengthens the reach of a branch
    // and the china sharpens it and adds light, which is what the two halves of
    // the struck voice do to the sound.
    const branches6 = makeTubeLinks(root6, nodeData.length * 2, 0xffaa00, 0.5);
    const floor6 = makeDepthGrid(root6, Math.max(W, H) * 1.5, 18, 0x663300);
    const pick6 = attachPicker(renderer.domElement, boxes6.mesh, controls);
    const MAX_EDGES = activeRoster.length * 2;
    // Scratch, hoisted: an InstancedMesh write is a compose() per node per
    // frame and allocating the operands inside the loop would churn four
    // objects per node per frame for nothing.
    const _t6a = new THREE.Vector3();
    const _t6b = new THREE.Vector3();
    const _q6  = new THREE.Quaternion();
    const _e6  = new THREE.Euler();
    // Which node was the root last frame, so the captions are only redrawn
    // when the tree actually rebalances rather than 60 times a second.
    let lastRoot6 = -1;
    // Accumulated spin per node. The Mesh used to hold this in its own
    // rotation; an instance has no such state, so the slot keeps it.
    const spin6 = new Float32Array(nodeData.length);
    const motes6 = makeParticles(root6, 800, Math.max(W, H) * 1.4, 0xc8ffe6);
    // Field-measurement typography: lighter, wider-tracked, underlined rather
    // than bracketed. An eco signal is a reading taken FROM somewhere, not a
    // channel on a console, and it should not look like slot 5's HUD.
    const tags6 = makeLabelField(root6, nodeData.length, 0xc8ffe6, 12, {
        font: "400 25px ui-monospace, 'SF Mono', Menlo, monospace",
        tracking: 4.5,
        underline: true,
    });
    const eco6Was = new Float32Array(nodeData.length).fill(-1);
    const eco6At = new Float64Array(nodeData.length);
    const calm6 = makeCalm();
    // The ticker came off this slot with the constellation field it was living
    // inside — and it was never about the constellation. It reports where the
    // phenological ring stands, which is true of the whole instrument. Its own
    // canvas now; see slotTicker.ts. The tail states what THIS module is.
    const ticker6 = mountSlotTicker(stageEl,
        "PERCUSIÓN · opalPerc · ÁRBOL SPLAY  ·  BOWL + CHINA EN LAS RAMAS",
        "rgba(200,255,230,");

    // Scan column lines
    const MAX_SCAN = 14;
    const scanPositions = new Float32Array(MAX_SCAN * 2 * 3);
    const scanGeo = new THREE.BufferGeometry();
    scanGeo.setAttribute("position", new THREE.BufferAttribute(scanPositions, 3));
    scanGeo.setDrawRange(0, 0);
    const scanMat = new THREE.LineBasicMaterial({ color: 0x663300, transparent: true });
    const scanLines = new THREE.LineSegments(scanGeo, scanMat);
    root6.add(scanLines);

    // Scrolling horizontal grid lines
    const hGridGeo = new THREE.BufferGeometry();
    const hGridPositions = new Float32Array(20 * 2 * 3);
    hGridGeo.setAttribute("position", new THREE.BufferAttribute(hGridPositions, 3));
    const hGridMat = new THREE.LineBasicMaterial({ color: 0x663300, transparent: true, opacity: 0.06 });
    root6.add(new THREE.LineSegments(hGridGeo, hGridMat));

    let rafId: number;
    let frame = 0;
    let scrollOffset = 0;
    /** The four eco signals, 0-1, rewritten each frame. */
    const v6 = new Float32Array(4);

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        const onset6 = onsetOf6(st);
        const sp6 = (window as any).__slot6Soneth ?? {};

        // Shared idle drift + vote flash. These six slots had NO vote channel
        // at all — no onState, no store subscription, no listener — so the top
        // of animate() is the only hook they have, and it is the same idiom
        // slots 1 and 3 already use.
        const vm6 = getVizMotion();
        const vf6 = readVoteFlash();

        // ── This slot's own instrument ───────────────────────────────────
        // level is the energy in ITS register of the master spectrum, env the
        // decaying attack of ITS last note. Reading the whole mix would make a
        // kick visual brighten because a bell rang; reading control values
        // (which is all these six ever did) makes it react to the intention
        // rather than to the sound.
        const au6 = readInstrument(inst6);
        // Stepped in TIME, not in frames. The bank's freqs are cycles per
        // frame, so an unscaled step runs the whole body 2.4x fast on a
        // 144 Hz panel — the same patch shaking on one display and
        // swinging on another. `speed` normalises against 60 Hz.
        ring6.step(calm6.dt * 60);
        if (onset6 > 0) {
            ring6.strike(onset6, au6.tone);
        }

        const { vol, pitchSh, tDil, specS, spatSp, texDep, atmMix, memFeed, harmR, resBody,
            masterA, filtC, noiseL, noiseF, droneD, dronFd, droneSpace, droneMix, delayFb,
            txInf } = kn.read(sp6);
        const consensus = st?.consensus ?? 0.5;

        afterimage.uniforms["damp"].value =
            lerp(0.73, 0.93, delayFb * 0.5 + memFeed * 0.25 + dronFd * 0.25);
        bloom.strength = lerp(0.10, 0.38, harmR * masterA);

        // Scrolling horizontal grid
        const scrollSpd = 25 * (0.5 + tDil);
        scrollOffset = (scrollOffset + scrollSpd * 0.016) % 40;
        let hIdx = 0;
        for (let y = -H / 2 + scrollOffset; y < H / 2; y += 40) {
            if (hIdx >= 20) break;
            hGridPositions[hIdx * 6]     = -W / 2; hGridPositions[hIdx * 6 + 1] = y; hGridPositions[hIdx * 6 + 2] = -1;
            hGridPositions[hIdx * 6 + 3] =  W / 2; hGridPositions[hIdx * 6 + 4] = y; hGridPositions[hIdx * 6 + 5] = -1;
            hIdx++;
        }
        hGridGeo.setDrawRange(0, hIdx * 2);
        hGridGeo.attributes.position.needsUpdate = true;
        hGridMat.opacity = (0.04 + texDep * 0.05 + filtC * 0.03) * masterA;

        // Scan columns — dronemix controls density; noiseFilt adds extra columns
        const scanCount = Math.floor(2 + droneMix * 8 + atmMix * 3 + noiseF * 2);
        const scanAlpha = (droneMix * 0.3 + 0.05) * masterA;
        let sIdx = 0;
        for (let s = 0; s < Math.min(scanCount, MAX_SCAN); s++) {
            const sx = ((frame * (1 + tDil) * (s + 1) * 0.7) % W) - W / 2;
            if (sIdx < MAX_SCAN) {
                scanPositions[sIdx * 6]     = sx; scanPositions[sIdx * 6 + 1] = -H / 2; scanPositions[sIdx * 6 + 2] = 0;
                scanPositions[sIdx * 6 + 3] = sx; scanPositions[sIdx * 6 + 4] =  H / 2; scanPositions[sIdx * 6 + 5] = 0;
                sIdx++;
            }
        }
        scanGeo.setDrawRange(0, sIdx * 2);
        scanGeo.attributes.position.needsUpdate = true;
        scanMat.opacity = scanAlpha;

        // Find max-activity node (root)
        let maxAct = -1, maxIdx = 0;
        for (let i = 0; i < activeRoster.length; i++) {
            const act = st?.species?.[i % (st?.species?.length || 1)]?.activity ?? 0;
            if (act > maxAct) { maxAct = act; maxIdx = i; }
        }

        // Tree layout — droneSpace shifts root Y
        const rootX = 0;
        const rootY = H / 2 - 80 - pitchSh * 80 - droneSpace * H * 0.18;
        const layerSpacing = 50 + pitchSh * 120;
        const treeWidth = lerp(0.4, 0.95, spatSp);
        calm6.step("__slot6Soneth");
        const e6 = calm6.eth;
        const c6 = calm6.chain;
        // Node spin per frame-at-60, signed by ROTATION SPD (1.00x = as it was).
        const spinRate6 = vm6.rotation * calm6.dt * 60;
        pick6.update(camera);
        floor6.grid.position.y = -H * 0.45;
        floor6.material.opacity = (0.04 + texDep * 0.09) * masterA;

        let childIdx = 0;
        // ── PERCUSIÓN speaks ──────────────────────────────────────────────
        // The tree is always lerping toward a new layout; a node ARRIVING is
        // when a rotation has actually completed. That is the slot's own
        // discrete event and the pulse is the register for it.
        let arrived6 = 0;
        for (let i = 0; i < nodeData.length; i++) {
            const n = nodeData[i];
            if (i === maxIdx) {
                n.tx = rootX;
                // Was Math.sin(frame * 0.05 …) — three radians a second at
                // 60 Hz and faster still on a 144 Hz panel. On the bed's clock
                // and a quarter the rate, so the root settles rather than bobs.
                n.ty = rootY - Math.sin(calm6.clock * 0.7 * (1 + tDil)) * 16;
            } else {
                const layer = Math.floor(Math.log2(childIdx + 2));
                // Kept on the node: the depth pass below needs it, and
                // recomputing a log every frame per node to get it back would
                // be silly. A declared field now rather than an `as any` graft
                // — the node no longer carries a Mesh, so its shape is small
                // enough to say what it holds.
                n.layer = layer;
                const countInLayer = Math.pow(2, layer);
                const posInLayer = (childIdx + 2) - countInLayer;
                // THE TREMBLE. Two compounding mistakes: the oscillator ran on
                // the FRAME COUNT — 3 rad/s at 60 fps, and display-dependent —
                // and its amplitude reached 80 px at low consensus. The node
                // below then chased this moving target at a lerp of up to 0.58
                // per frame, so every body was sprinting after a point that had
                // already left. That is not a rebalance, it is a vibration.
                //
                // Quarter the rate, on the bed's clock, and a third the throw.
                const breathe = Math.sin(calm6.clock * 0.8 * (1 + tDil) + layer)
                    * (11 + specS * 17) * (1.1 - consensus);
                const lx = lerp(-W / 2 * treeWidth, W / 2 * treeWidth, (posInLayer + 0.5) / countInLayer) + breathe;
                // Was snoise against the frame count; a slow drift with the
                // bed instead, so a layer breathes rather than buzzes.
                const ly = rootY - layer * layerSpacing
                    + calm6.drift(i + 40, 1) * 26 * noiseL * (0.4 + calm6.swell * 1.3);
                n.tx = lx; n.ty = ly;
                childIdx++;
            }

            // Disagreement as a slow lean, applied to the TARGET and applied
            // BEFORE the lerp. It used to be added to the POSITION after it,
            // which meant the node was pulled toward one point and then shoved
            // off it every frame — so `arrived6` below was measuring a distance
            // to somewhere the node was never allowed to be, and the pulse it
            // drives fired on noise. A divided chamber now drifts off its own
            // layout and HOLDS there, which is what disagreement looks like.
            if (consensus < 0.8) {
                const d6 = (1 - consensus) * 4.5 * (0.4 + calm6.swell * 1.2);
                n.tx += calm6.drift(i, 0) * d6;
                n.ty += calm6.drift(i, 1) * d6;
            }

            // A vote forces a REBALANCE, which is this slot's own vocabulary:
            // the tree reorganises itself under pressure. snap is how hard it
            // pulls toward the new layout, so a vote is a hard reorganisation.
            // Capped far lower. A lerp of 0.58 per frame reaches its target in
            // about three frames, which against a target that is itself moving
            // every frame means the node is always arriving and never arrived.
            // 0.16 settles over roughly a fifth of a second — still a snap
            // against an 89-second envelope, and slow enough to look like the
            // tree deciding rather than twitching.
            //
            // The VOTE keeps its hard pull: a rebalance should be abrupt. That
            // is an event, and events are allowed to be sudden; what was wrong
            // was the resting state being sudden too.
            const snap = Math.min(
                0.035 + (1 - consensus) * 0.10 * (0.5 + tDil)
                + (vf6 ? vf6.flash * 0.45 : 0), 1);
            n.x = lerp(n.x, n.tx, snap);
            n.y = lerp(n.y, n.ty, snap);
            if (Math.abs(n.x - n.tx) < 1.2 && Math.abs(n.y - n.ty) < 1.2) arrived6++;
            const act = st?.species?.[i % (st?.species?.length || 1)]?.activity ?? 0;
            // The node's size is the act's complexity, as on slot 5.
            const glW = 10 + resBody * 25 + act * 15
                + c6.calldataN * 16 + c6.txEnv * 10;

            // PERCUSIÓN. The tree had layers in Y and nothing in Z; each layer
            // now stands at its own depth, so the hierarchy is a solid rather
            // than a diagram. A strike drives that layer forward, and tone —
            // the pitch SC sends with the onset — decides which depth it hits.
            const lay6 = n.layer;
            // A strike does not arrive everywhere at once. It enters at the
            // root and travels, so each layer reads the bank a few modes LATER
            // than the one above it — the delay is the depth. What was a single
            // synchronised push is now a wave you can watch move down the tree,
            // which is also the honest picture of a rebalance propagating.
            const rz6 = ring6.value(i + lay6 * 5);
            n.z = lay6 * -70 * (0.4 + au6.level * 1.6) + rz6 * 190 * au6.amp;

            // Touch: hovering a node swells it, holding one DRAGS the subtree
            // toward the pointer — the branch is a spring and the children
            // follow, which is the tree's own behaviour rather than a
            // free-floating sprite being moved.
            const hov6 = (i === pick6.hover);
            const grb6 = (i === pick6.grabbed);
            if (grb6) {
                n.x = lerp(n.x, pick6.point.x, 0.35);
                n.y = lerp(n.y, pick6.point.y, 0.35);
            }
            const touch6 = grb6 ? 1.7 : hov6 ? 1.3 : 1.0;

            _t6a.set(
                n.x + rz6 * 26 * Math.cos(i * 2.1),
                n.y + rz6 * 26 * Math.sin(i * 2.1),
                n.z);
            // Deflect, then settle. A struck body leans off its axis; it does
            // not merely translate. Drift folded in, and the vote's rebalance
            // shows in the boxes as well as in the snap rate above.
            // Each node at its own rate (golden-ratio spread), all of them
            // the way ROTATION SPD points and stopped at its centre.
            spin6[i] += (0.005 + texDep * 0.04 * (1 + act * 8)) * spinRate6 * (0.6 + ((i * 0.618) % 1) * 0.8)
              + (vf6 ? vf6.flash * 0.10 * (isAlarm(vf6.type) ? -1 : 1) : 0);
            // Tilted on two axes, not one. A cube spun only about z from a
            // camera on the z axis is a rotating square; this is what makes it
            // read as a solid turning in space.
            _q6.setFromEuler(_e6.set(rz6 * 0.6, spin6[i] * 0.7, spin6[i] + rz6 * 0.85));

            const sc6 = (1 + Math.abs(rz6) * 0.5) * touch6;
            boxes6.set(i, _t6a, (glW / 20) * sc6 * (NODE6_R / 10) * 0.9, _q6);
            boxes6.tint(i,
                hov6 || grb6 ? 1 : lerp(0.78, 1.0, harmR),
                hov6 || grb6 ? 1 : lerp(1.0, 0.67, harmR),
                lerp(0.9, 0.0, harmR));

            // Inner core — droneDepth pulses its scale. It sits at the node's
            // OWN depth now; it used to be pinned at z = 0.1 while its shell
            // travelled with the layer, so the two came apart on every strike.
            const innerPulse = 0.5 + 0.5 * Math.sin(frame * 0.1 * (1 + tDil) + i) * droneD;
            _t6b.set(n.x, n.y, n.z + 0.1);
            cores6.set(i, _t6b, ((glW * innerPulse) / 10) * (NODE6_R * 0.5 / 10) * 0.9, _q6);
            cores6.tint(i, 1, lerp(1.0, 0.67, harmR), 0);
        }
        boxes6.mesh.material.opacity = (0.18 + vol * 0.40) * masterA
            * (0.72 + c6.gasN * 0.45 + c6.blockEnv * 0.22);
        cores6.mesh.material.opacity = (0.12 + vol * 0.32) * masterA;
        boxes6.commit();
        cores6.commit();

        // TIME DILAT carries the air through the tree, GIRO AUTO turns it.
        motes6.step(1 / 60,
            (tDil - 0.5) * 70 + Math.sin(c6.blockPhase * Math.PI * 2) * 28,
            vm6.rotation * 0.07,
            (pitchSh - 0.5) * 22);
        motes6.material.opacity = (0.08 + texDep * 0.26) * masterA;
        motes6.material.size = Math.max(W, H) * (0.0014 + resBody * 0.0038);
        // A heavy body on a leaning axis (turns.ts): the slider sets where
        // its rate is heading, and it takes seconds to get there.
        turn6(root6, calm6.dt, vm6.speed, c6);
        ticker6.draw((0.35 + vol * 0.65) * masterA);

        // RAÍZ names the node the tree is splayed around; the rest carry their
        // depth. Which node is the root CHANGES as the tree rebalances, so the
        // caption is rewritten when it moves rather than baked at mount.
        // The four eco signals, live, from the store — the same numbers the
        // left panel's Eco Signals block prints, on the bodies that carry them.
        {
            const ec = st?.eco;
            v6[0] = (ec?.co2 ?? 0) / 127;
            v6[1] = Math.min(1, (ec?.mycoPulse ?? 0) / 4);
            v6[2] = (ec?.phosphorus ?? 0) / 100;
            v6[3] = (ec?.nitrogen ?? 0) / 127;
            // At most six redraws a second per caption, as on slot 5; a new
            // root rewrites them all at once, since that is the event.
            const now6 = performance.now();
            for (let i = 0; i < nodeData.length; i++) {
                const isRoot = i === maxIdx;
                const val = isRoot ? consensus : v6[(i - 1 + 4) % 4];
                const q = Math.round(val * 100) / 100;
                if ((q !== eco6Was[i] && now6 - eco6At[i] > 160) || maxIdx !== lastRoot6) {
                    eco6Was[i] = q;
                    eco6At[i] = now6;
                    tags6.text(i, isRoot
                        ? `RAÍZ ${q.toFixed(2)}`
                        : `${SLOT_NOUNS.s6.one(i)} ${q.toFixed(2)}`);
                }
            }
            lastRoot6 = maxIdx;
        }
        for (let i = 0; i < nodeData.length; i++) {
            const n = nodeData[i];
            _t6b.set(n.x, n.y + 24, n.z);
            tags6.set(i, _t6b, (0.18 + vol * 0.5) * masterA
                * (i === maxIdx ? 1.7 : 1)
                * (i === pick6.hover || i === pick6.grabbed ? 1.6 : 1));
        }

        // How high in the tree the arrival happened chooses the register: a
        // rebalance near the leaves is a lighter hit than one at the root.
        emitArrive6(arrived6, 0.3 + Math.min(1, arrived6 / 10) * 0.55,
            1 - Math.min(1, arrived6 / 14));

        // ── Branches, with BOWL and CHINA in them ─────────────────────────
        //
        // These were flat: both endpoints written with z = 0 while the nodes
        // they joined had layer depth, so every branch left its own node behind
        // the moment the camera moved. They carry the node's z now.
        //
        // And they are where the struck voice's two halves are read. Slot 6 is
        // PERC, and until now bowl and china reached only the constellation
        // backdrop — a sky that cannot be occluded and does not belong to this
        // slot's structure. Here:
        //
        //   BOWL   lengthens the REACH. A bowl rings long and fills the room,
        //          so a branch overshoots its node and keeps going — the tree
        //          associates further than it strictly connects.
        //   CHINA  sharpens and lights. A china is all attack, so the branch
        //          thins to a filament and brightens. Both up is the fusion the
        //          voice actually is; both down leaves plain branches.
        const bowl6  = sp6["voice:bowl"] ?? 1;
        const china6 = sp6["voice:china"] ?? 1;
        const rootNode = nodeData[maxIdx];
        branches6.begin();
        let eIdx = 0;
        for (let i = 0; i < nodeData.length; i++) {
            const n = nodeData[i];
            if (i === maxIdx || eIdx >= MAX_EDGES) continue;
            _t6a.set(n.x, n.y, n.z);
            // On a strike, and only while a half is up to strike with — this
            // is the perc slot, so a branch leaving its node is the one thing
            // here that should be an EVENT rather than a texture.
            if (calm6.strike > 0.01) {
                const k6 = calm6.strike * txInf * 42 * specS;
                _t6a.x += calm6.drift(i * 13, 0) * k6;
                _t6a.y += calm6.drift(i * 13, 1) * k6;
                _t6a.z += calm6.drift(i * 13, 2) * k6 * 0.7;
            }
            _t6b.set(rootNode.x, rootNode.y, rootNode.z);
            // The bowl's overshoot: the branch runs PAST the root by up to a
            // fifth of its own length, so the reach is visibly longer than the
            // connection. Same 0.22 the field used for `length`.
            if (bowl6 > 0.01) _t6b.lerp(_t6a, -bowl6 * 0.22);
            // The china's filament: 0.28 off the radius, the same figure the
            // field used for `strokeWidth`.
            const held6 = (i === pick6.grabbed || maxIdx === pick6.grabbed);
            branches6.add(_t6a, _t6b,
                (0.25 + resBody * 0.5) * (1 - china6 * 0.28) * (held6 ? 2.6 : 1));
            eIdx++;
        }
        branches6.end();
        branches6.material.opacity =
            (0.16 + vol * 0.36) * masterA * (1 + china6 * 0.18);

        // droneFade used to write a "background warmth" here:
        //     setClearColor((Math.floor(dronFd * 6) << 8) | 0x000804, 1)
        // Two things were wrong with it. It is the SECOND setClearColor of the
        // frame (the first is above, with the atmMix alpha), so it silently
        // overrode that one. And `<< 8` puts the warmth in the GREEN channel of
        // a colour that already has green in it — so "warmth" was a green tint,
        // not a warm one.
        //
        // On its own that is only green 8 -> 14, invisible. But this slot runs
        // an AfterimagePass at damp 0.73-0.93, which feeds the frame back into
        // itself: a constant tint accumulates to g/(1-damp), i.e. 52-200. That
        // is the bright green background — measured at 64 against red 12, and
        // unchanged with the constellation field hidden, which is what proved
        // the field was not the cause.
        //
        // droneFade keeps a job here, but a legible one: it lengthens the
        // afterimage trail instead of tinting the background. That is what a
        // "fade" control should do in a slot built on feedback, and it is the
        // same quantity the old line was reaching for — persistence — without
        // routing it through the clear colour.
        //
        // The clear is also neutralised to 0x000201 for this slot only. The
        // house colour 0x000804 is rgb(0,8,4) — it HAS a green bias, which
        // every other slot gets away with because their frames are busy enough
        // to hide it. Here the frame is mostly empty and the afterimage
        // integrates whatever the clear is, so green 8 still settled at ~36.
        // Near-black leaves the tree and its edges to supply the colour.
        renderer.setClearColor(0x000201, lerp(0.5, 0.95, 1 - atmMix));

        stage.render();
    }

    animate();

    stage.onResize(() => ticker6.resize());

    return {
        name: "Dynamic Optimality", key: "6",
        destroy: () => {
            destroyed = true; cancelAnimationFrame(rafId);
            pick6.dispose();
            boxes6.dispose(); cores6.dispose(); branches6.dispose(); floor6.dispose();
            motes6.dispose(); tags6.dispose(); ticker6.destroy();
            stage.destroy();
        }
    };
}
