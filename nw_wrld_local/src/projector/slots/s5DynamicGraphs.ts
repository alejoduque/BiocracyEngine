// s5DynamicGraphs.ts — slot 5 · Dynamic Graphs · CAMPANAS · stage 2/6 PRESENT
import * as THREE from "three";
import type { ParliamentState } from "../parliament/parliamentStore";
import { getVizMotion, readVoteFlash, isAlarm } from "../vizMotion";
import { makeExcursionEmitter } from "../slotVoice";
import { makeResonatorBank } from "../resonators";
import { makeNodeField, makeTubeLinks, makeDepthGrid, makeParticles, makeLabelField, makeCalm, attachPicker } from "../slotThree";
import { Viz, pickSpecies, showStage } from "../visualizationSwitcher";
import { INSTRUMENTS, SLOT_NOUNS, readInstrument, mountSlotField, makeCircle, lerp, snoise, fixed2 } from "./instruments";
import { makeSlotStage, makeKnobs } from "./stage";

// ─── Slot 5: Dynamic Graphs (Force-directed node network) ────────────────────
// Concept preserved: nodes repel/attract, edges drawn when probability passes,
//   radar arcs rotate in background.
// Three.js: nodes = Mesh spheres; edges = LineSegments updated per frame.
// 20-knob mapping:
//   volume        → node/edge alpha
//   pitchshift    → gravity center vertical offset
//   timedilation  → node speed multiplier
//   spectralshift → connection glitch amplitude
//   spatialspread → node spread radius
//   texturedepth  → node size + grid brightness
//   atmospheremix → ghost trail (damp)
//   memoryfeed    → background fade
//   harmonicrich  → node color (amber→white)
//   resonantbody  → outer glow ring radius
//   masteramp     → global brightness
//   filtercutoff  → connection distance cutoff
//   noiselevel    → velocity jitter
//   noisefilt     → connection line weight
//   dronedepth    → node geometry complexity (segments)
//   dronefade     → edge color warmth
//   dronespace    → scene z-depth spread
//   dronemix      → number of radar arcs
//   delayfeedback → afterimage damp
//   txInfluence   → glitch probability + chromatic aberration

export function mountDynamicGraphs(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(8);

    const stage = makeSlotStage(stageEl, "s5", {
        bloom: [0.6, 0.4, 0.6],
        afterimage: 0.85, chromatic: true,
        inst: INSTRUMENTS.s5,
        probe: () => (radarGroup.rotation.z + bloom.strength * 10),
    });
    const { W, H, renderer, scene, camera, controls, afterimage } = stage;
    const bloom = stage.bloom!;
    const chromatic = stage.chromatic!;
    const kn = makeKnobs();
    // Everything this slot draws hangs off one root group. That is what
    // makes the rebuild possible: depth is distributed across its children
    // and the whole world can be lifted or turned without touching the
    // camera, which now belongs to the viewer.
    const root5 = new THREE.Group();
    scene.add(root5);

    // Instrumental identity. Six slots, six voices of the engine, no
    // repeats — this one is mountDynamicGraphs. The name was drawn into the scene as
    // a sprite; it is gone. The binding it announced is the real one and
    // survives: this slot reads inst5's band and its voice's onsets.
    const inst5 = INSTRUMENTS.s5;
    // The constellation backdrop for this slot, coloured by inst5's hue
    // and driven by its band. See mountSlotField.
    const cfield = mountSlotField(stageEl, inst5, "__slot5Soneth");
    const emitEdge5 = makeExcursionEmitter("pad");
    // CAMPANAS rings. damp 0.988 ≈ a 6 s tail at 60 fps, which is the pad's own
    // character: this slot should still be moving long after the attack, where
    // slot 7 should be still again almost at once. spread 0.5 is a soft mallet
    // — a bell excites most of its body, not one point of it.
    const ring5 = makeResonatorBank({ n: 24, baseFreq: 0.006, freqRatio: 1.075, damp: 0.988, spread: 0.5 });

    // ── The graph is a graph in space now ────────────────────────────────
    //
    // It was eight wireframe spheres and a LineSegments buffer whose vertices
    // were written with z hardcoded to 0 — every edge lay flat on one plane
    // while the nodes it joined had been given depth, so the links visibly
    // detached from their own endpoints the moment the camera moved off axis.
    //
    // One InstancedMesh of icosahedra, one tube mesh for the links. The z axis
    // is a real axis: the physics runs in three dimensions rather than two
    // with a decorative z written on top afterwards.
    const NODE_R = 9;
    const nodes: { p: THREE.Vector3; v: THREE.Vector3 }[] = [];
    // A golden-angle shell, not eight random points. Random placement gives a
    // different — and sometimes clumped, sometimes lopsided — opening frame on
    // every mount, which is most of why the graph could look off-centre before
    // the springs had settled it. The spiral is even by construction, centred
    // by construction, and the same every time, so what you see when the slot
    // opens is the structure rather than the seed.
    const PHI5 = Math.PI * (3 - Math.sqrt(5));
    activeRoster.forEach((_sp, i) => {
        const t = (i + 0.5) / activeRoster.length;
        const r = Math.sqrt(t);
        const a = i * PHI5;
        nodes.push({
            p: new THREE.Vector3(
                Math.cos(a) * r * W * 0.26,
                Math.sin(a) * r * H * 0.26,
                (t - 0.5) * 220),
            v: new THREE.Vector3(),
        });
    });
    const bodies5 = makeNodeField(root5, nodes.length, NODE_R, 1, { opacity: 0.95 });
    bodies5.count = nodes.length;
    // A second, larger, wireframe shell per node — the "glow ring" was a flat
    // circle of line segments that always faced z and vanished edge-on. A shell
    // is visible from every angle, which is what the halo was trying to be.
    const shells5 = makeNodeField(root5, nodes.length, NODE_R, 1,
        { wireframe: true, opacity: 0.28 });
    shells5.count = nodes.length;
    // Links with actual thickness. NOISE FILT drove `linewidth` here every
    // frame and ANGLE has always clamped that to 1 px, so the control was
    // inert; it sets a radius in world units now and can be seen.
    const links5 = makeTubeLinks(root5, (nodes.length * (nodes.length - 1)) / 2,
        0xffaa00, 0.45);
    // Somewhere to stand. Without a floor the depth of a body is unreadable —
    // a node far away and a node small look identical.
    const floor5 = makeDepthGrid(root5, Math.max(W, H) * 1.6, 22, 0x663300);
    floor5.grid.position.y = -H * 0.42;
    // Touch. None of these five had a Raycaster, a pointerdown or a hover of
    // any kind: orbiting was the whole vocabulary, and orbiting is looking.
    const pick5 = attachPicker(renderer.domElement, bodies5.mesh, controls);
    // The air. Not the species field — that names things and is restricted to
    // two slots for exactly that reason; this is the volume made visible so
    // depth has something to be measured against.
    const motes5 = makeParticles(root5, 900, Math.max(W, H) * 1.5, 0xffaa00);
    // What the bodies ARE. N0..N7, the parties to a connection.
    // An advanced HUD, not a caption. Smaller, monospaced, wide-tracked and
    // bracketed at the corners — a readout that something else is inside,
    // rather than a box with a word in it. The value rides with the name, so
    // the graph prints the BioToken expression as it computes it.
    const tags5 = makeLabelField(root5, nodes.length, 0x9fe8c0, 11, {
        font: "500 26px ui-monospace, 'SF Mono', Menlo, monospace",
        tracking: 3.5,
        brackets: true,
        plate: true,
        // These carry live values, so they lay out from a fixed left edge.
        anchorLeft: true,
    });
    /** Live value per factor, so the readout is a readout. */
    const bt5 = new Float32Array(nodes.length);
    const bt5Was = new Float32Array(nodes.length).fill(-1);
    /** When each caption was last rasterised, so it cannot step faster than 6 Hz. */
    const bt5At = new Float64Array(nodes.length);
    /** Where each body was last DRAWN — the caption follows this, not n.p. */
    const bodyAt5 = nodes.map(() => new THREE.Vector3());
    // What this slot's motion follows. See makeCalm: the drone and the pad,
    // heavily smoothed, instead of a fresh random number every frame.
    const calm5 = makeCalm();
    // Seeded; the value is appended live in the frame below.
    nodes.forEach((_n, i) => tags5.text(i, SLOT_NOUNS.s5.one(i)));

    // Radar arcs, lifted off the plane. They were six concentric circles all
    // at z = 0 — invisible edge-on, which from an orbiting camera is most of
    // the time. Each shell now sits at its own depth AND is tilted, so the
    // stack reads as a set of nested surfaces the graph hangs inside.
    const radarGroup = new THREE.Group();
    root5.add(radarGroup);
    const radarArcs: THREE.Line[] = [];
    for (let i = 0; i < 6; i++) {
        const arc = makeCircle(80 + i * 60, 64, 0x663300, 0.08 + i * 0.01);
        arc.position.z = (i - 2.5) * 46;
        arc.rotation.x = (i % 2 ? 1 : -1) * 0.13;
        radarGroup.add(arc);
        radarArcs.push(arc);
    }

    let rafId: number;
    let frame = 0;
    const _tmpA = new THREE.Vector3();
    const _tmpB = new THREE.Vector3();
    /** The slow resting-offset of a body. See the drift note in animate(). */
    const _drift5 = new THREE.Vector3();

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        const onset5 = cfield.drive(st);
        const sp5 = (window as any).__slot5Soneth ?? {};

        // Shared idle drift + vote flash. These six slots had NO vote channel
        // at all — no onState, no store subscription, no listener — so the top
        // of animate() is the only hook they have, and it is the same idiom
        // slots 1 and 3 already use.
        const vm5 = getVizMotion();
        const vf5 = readVoteFlash();

        // ── This slot's own instrument ───────────────────────────────────
        // level is the energy in ITS register of the master spectrum, env the
        // decaying attack of ITS last note. Reading the whole mix would make a
        // kick visual brighten because a bell rang; reading control values
        // (which is all these six ever did) makes it react to the intention
        // rather than to the sound.
        const au5 = readInstrument(inst5);
        // Advance the bell body every frame, then strike it on an attack. The
        // step comes FIRST so a strike lands on a clean phase rather than
        // being immediately decayed by the same frame's step.
        // Stepped in TIME, not in frames. The bank's freqs are cycles per
        // frame, so an unscaled step runs the whole body 2.4x fast on a
        // 144 Hz panel — the same patch shaking on one display and
        // swinging on another. `speed` normalises against 60 Hz.
        ring5.step(calm5.dt * 60);
        if (onset5 > 0) {
            ring5.strike(onset5, au5.tone);
            // The same event crosses the sky. Tone places the source along the
            // stage, so a run of different pitches sends its wavefronts from
            // different points and the figures above answer in sequence rather
            // than all at once.
            cfield.field.strike(
                stageEl.clientWidth * (0.2 + au5.tone * 0.6),
                stageEl.clientHeight * 0.5,
                onset5 * 0.7);
        }

        const { vol, pitchSh, tDil, specS, spatSp, texDep, atmMix, memFeed, harmR, resBody,
            masterA, filtC, noiseL, noiseF, droneD, dronFd, droneSpace, droneMix, delayFb,
            txInf } = kn.read(sp5);
        const consensus = st?.consensus ?? 0.5;

        afterimage.uniforms["damp"].value = lerp(0.76, 0.94, delayFb * 0.7 + memFeed * 0.3);
        chromatic.uniforms["amount"].value = txInf * 0.007;
        // ── Level ─────────────────────────────────────────────────────────
        // Every one of these ran to full: opacity floors of 0.3-0.8 with the
        // fader adding on top, so a body was near-opaque before anything was
        // turned up, and five slots of that inside an additive bloom fused into
        // one bright mass. Floors down, spans kept, so the faders travel the
        // same distance from a darker starting point and the geometry reads as
        // geometry rather than as light.
        bloom.strength = lerp(0.14, 0.52, consensus * masterA);
        // Idle: the whole graph precesses slowly. A vote is an EDGE CASCADE —
        // the bloom surges and every edge is briefly forced, so the network
        // flashes fully connected and settles back.
        radarGroup.rotation.z = vm5.angle * 0.6;
        if (vf5) bloom.strength += vf5.flash * (isAlarm(vf5.type) ? 0.5 : 1.1);
        renderer.setClearColor(0x000804, lerp(0.5, 0.95, 1 - atmMix));

        // Connection distance controlled by filtercutoff
        const restLength = 80 + filtC * 250 + (st?.eco?.mycoPulse ?? 0) * 80;

        // Gravity centre, now a point in space rather than a point on a plane.
        // DRONE SPACE lifts the whole assembly off the floor instead of writing
        // a decorative z onto each node after the physics had finished.
        const gx = 0;
        const gy = (pitchSh - 0.5) * H * 0.4;
        const gz = (droneSpace - 0.5) * 260;

        // ── The camera follows the assembly ──────────────────────────────
        // controls.target was nailed to the origin while the gravity centre
        // moves with PITCH SHIFT and DRONE SPACE — up to ±0.2·H and ±130 away
        // from it. So raising Pitch Shift lifted the whole graph out of frame
        // and there was nothing to look at where the camera was pointing.
        //
        // Eased, not snapped: the target is what the orbit pivots around, and
        // jumping it would swing the whole view. Only while the performer is
        // not holding a body — mid-drag the frame must stay put or the thing
        // being dragged moves under the pointer.
        if (pick5.grabbed < 0) {
            controls.target.lerp(_tmpB.set(gx, gy, gz), 0.035);
        }

        calm5.step("__slot5Soneth");
        // ── The chain shapes this slot ────────────────────────────────────
        // Three readings, three different things, none of them invented:
        //   calldata  how COMPLEX the last act was  → how far the bodies swell
        //   gas       what it cost                  → how bright they burn
        //   parity    which block we are in         → which way the graph turns
        // A quiet chain leaves all three at rest; a busy one is visible before
        // you look at any number.
        const e5 = calm5.eth;
        // The SMOOTHED chain. e5 above steps twenty times a second — that is
        // how often eth_sonify.py sends — so it is right for a discrete test
        // and wrong for anything continuous. c5 is the same data through a
        // follower, an envelope and a running scale.
        const c5 = calm5.chain;
        // ── Touch ────────────────────────────────────────────────────────
        // Hover swells a body; a grab PULLS it and lets the springs carry the
        // disturbance to its neighbours, which is the whole point of holding a
        // node in a force graph rather than moving a sprite.
        pick5.update(camera);
        if (pick5.grabbed >= 0 && nodes[pick5.grabbed]) {
            const g = nodes[pick5.grabbed];
            g.v.addScaledVector(_tmpA.subVectors(pick5.point, g.p), 0.22);
            g.v.multiplyScalar(0.55);
        }

        // ── Physics, in three dimensions ──────────────────────────────────
        links5.begin();
        let edgeCount = 0;
        // Halved. The first pass at real geometry over-corrected: coming from
        // 1 px lines, anything with a body looked like a change, and 0.7-3.3
        // world units against a node radius of 9 made the graph read as pipes
        // rather than as connections. NOISE FILT still owns the range.
        const linkR = 0.34 + noiseF * 1.15;   // a REAL radius; linewidth was inert

        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                _tmpA.subVectors(nodes[j].p, nodes[i].p);
                const dist = _tmpA.length() || 0.001;

                if (dist < restLength * 2) {
                    // Was frame-based: a link crossed the consensus threshold
                    // and back many times a second, so the graph strobed
                    // between connected and not. On the bed's clock it forms
                    // and dissolves at a rate a viewer can follow.
                    const noise = snoise(i * 17 + j, calm5.clock * 0.55 * (1 + tDil));
                    if (noise < consensus + (vf5 ? vf5.flash * 0.9 : 0)) {
                        _tmpB.copy(nodes[j].p);
                        // The txInfluence glitch fired on Math.random() every
                        // frame, so a link flickered between displaced and not
                        // at 60 Hz — noise, not a jolt. It happens ON A STRIKE
                        // now, scaled by how hard, and the displacement is
                        // deterministic per link so the whole graph leans one
                        // way together and recovers.
                        if (calm5.strike > 0.01) {
                            const k5 = calm5.strike * txInf * 55 * specS;
                            _tmpB.x += calm5.drift(i * 31 + j, 0) * k5;
                            _tmpB.y += calm5.drift(i * 31 + j, 1) * k5;
                            _tmpB.z += calm5.drift(i * 31 + j, 2) * k5;
                        }
                        // A link touching the held node thickens, so the reach
                        // of a grab is visible rather than merely felt.
                        const held = (i === pick5.grabbed || j === pick5.grabbed);
                        links5.add(nodes[i].p, _tmpB, linkR * (held ? 2.4 : 1));
                        edgeCount++;
                    }
                    const force = (dist - restLength) * (0.004 + txInf * 0.015) * (0.5 + specS);
                    _tmpA.divideScalar(dist).multiplyScalar(force);
                    nodes[i].v.add(_tmpA);
                    nodes[j].v.sub(_tmpA);
                }
            }
        }
        links5.end();
        // ── CAMPANAS speak ────────────────────────────────────────────────
        // An edge forming is the graph's own event: two nodes that were not
        // connected now are. The bell rings for the connection, and how full
        // the graph already is chooses the pitch.
        emitEdge5(edgeCount, 0.35 + Math.min(1, edgeCount / 24) * 0.5,
            Math.min(1, edgeCount / 32));
        links5.material.opacity = (0.12 + vol * 0.34) * masterA;

        // droneFade edge color warmth
        const edgeR = Math.floor(lerp(200, 255, dronFd));
        const edgeG = Math.floor(lerp(170, 200, dronFd));
        links5.material.color.setRGB(edgeR / 255, edgeG / 255, 0);

        // harmonicRich: node colour white→amber. Hoisted out of the loop — it
        // is the same three numbers for every body and was being recomputed
        // once per node per frame.
        const nr = lerp(0.78, 1.0, harmR);
        const ng = lerp(1.0, 0.67, harmR);
        const nb = lerp(0.9, 0.0, harmR);

        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            // Centre gravity, on all three axes
            _tmpA.set(gx - n.p.x, gy - n.p.y, gz - n.p.z)
                .multiplyScalar(0.001 + specS * 0.005);
            n.v.add(_tmpA);

            const act  = st?.species?.[i % (st?.species?.length || 1)]?.activity ?? 0.5;
            const pres = st?.species?.[i % (st?.species?.length || 1)]?.presence ?? 0.5;

            // ── Drift, not jitter ─────────────────────────────────────────
            // This was snoise against the FRAME COUNT at 0.02 per frame — fast,
            // and faster still on a faster display — plus a per-frame random
            // kick. Both are uncorrelated between frames, which does not read
            // as movement; it reads as the node vibrating in place.
            //
            // The drift is a function of time and it SWELLS WITH THE DRONE AND
            // THE PAD: at rest the graph is nearly still, and it opens up as
            // the bed comes in. That is the slow body of the engine, which is
            // what these structures should be following.
            // Drift is an OFFSET, not a force. Adding a slow 0.11 Hz signal to
            // VELOCITY sixty times a second integrates it into a large, ever-
            // growing excursion that only the damping holds down — a spring
            // permanently being pushed, which is exactly the twitch. As a
            // displacement added to the resting position it is what it says it
            // is: the body sitting a little off-centre and moving slowly.
            const wob5 = noiseL * (14 + calm5.swell * 26);
            _drift5.set(
                calm5.drift(i, 0) * wob5,
                calm5.drift(i, 1) * wob5,
                calm5.drift(i, 2) * wob5 * 0.7);

            // The hard kick waits for a strike, and for a half to strike with.
            if (calm5.strike > 0.01) {
                const kk = calm5.strike * txInf * act * 9;
                n.v.x += calm5.drift(i + 7, 0) * kk;
                n.v.y += calm5.drift(i + 7, 1) * kk;
                n.v.z += calm5.drift(i + 7, 2) * kk * 0.7;
            }

            // dt-based, and CLAMPED. `n.p.addScaledVector(n.v, 1 + tDil)` with
            // a per-frame 0.88 damping is explicit Euler with a step that TIME
            // DILATION could double: at the top of its range the spring left
            // its stable region and rang, which is the shake. Now the step is
            // seconds and the damping is a time constant, so the same patch
            // settles identically at 60 and at 144 Hz, and tDil slows the
            // motion down instead of destabilising it.
            const dt5 = calm5.dt;
            n.p.addScaledVector(n.v, dt5 * 60 / (1 + tDil * 1.6));
            n.v.multiplyScalar(Math.exp(-dt5 / 0.16));

            // ── CAMPANAS — sympathetic resonance, not a push ──────────────
            // Each node is one mode of the bank, so the shape goes on changing
            // after the strike rather than returning along the path it came.
            // The mode now displaces along the node's own outward direction
            // instead of along z: a bell swells across its body, and on a
            // lattice that has real depth "across" is not one fixed axis.
            const rz5 = ring5.value(i);
            _tmpB.copy(n.p).sub(_tmpA.set(gx, gy, gz));
            if (_tmpB.lengthSq() < 1e-6) _tmpB.set(0, 0, 1);
            _tmpB.normalize().multiplyScalar(rz5 * 150 * au5.amp);

            // Node size: textureDepth + presence; spatialSpread widens it.
            // SHAPE from the chain. calldataLen is how much data the act
            // carried — a bare transfer is 0 bytes, a contract call is
            // thousands — so a body swells with the complexity of what the
            // chain is actually doing. A block of plain transfers leaves the
            // graph small and tight; a block of contract work inflates it.
            // calldataN: the follower AUTOSCALED, so a chain that sits in a
            // narrow band all evening still moves the shape across its range.
            // Plus the transaction envelope, which is where the life is — an
            // arrival swells a body and it settles back.
            const rad = 5 + pres * 12 + texDep * 8
                + c5.calldataN * 14 + c5.txEnv * 9;
            const spreadR = rad * (0.6 + spatSp * 0.8);
            const hovered = (i === pick5.hover);
            const grabbed = (i === pick5.grabbed);
            const touch = grabbed ? 1.75 : hovered ? 1.35 : 1.0;
            const sw5 = (1 + rz5 * 0.55) * touch;

            _tmpA.copy(n.p).add(_tmpB).add(_drift5);
            // Where the body ACTUALLY ended up, kept for the caption below:
            // n.p is only the integrator's state and the drawn position is
            // that plus the resonance and the drift.
            bodyAt5[i].copy(_tmpA);
            bodies5.set(i, _tmpA, (spreadR / NODE_R) * sw5);
            bodies5.tint(i, nr, ng, nb);
            // The shell answers RES BODY, as the flat ring used to, and lights
            // up under the pointer so the body being touched says so.
            shells5.set(i, _tmpA,
                (spreadR / NODE_R) * (1.8 + resBody * 1.5) * 0.55 * touch);
            shells5.tint(i, hovered || grabbed ? 1 : nr, hovered || grabbed ? 1 : ng, nb);
        }
        // BRIGHTNESS from the gas price. What the chain costs right now is
        // the one number every participant is watching, and it is the honest
        // thing for the picture to burn with.
        // Brightness on the smoothed, autoscaled gas, lifted by the block
        // envelope — so the picture breathes once every twelve seconds with
        // the chain's own bar line rather than flickering with each sample.
        bodies5.mesh.material.opacity = (0.22 + vol * 0.38) * masterA
            * (0.72 + c5.gasN * 0.45 + c5.blockEnv * 0.22);
        shells5.mesh.material.opacity =
            resBody * 0.22 * (0.5 + (st?.species?.[0]?.activity ?? 0.5) * 0.5) * masterA;
        bodies5.commit();
        shells5.commit();
        floor5.material.opacity = (0.04 + texDep * 0.10) * masterA;

        // ── The panel drives the air and the turn ─────────────────────────
        // SPATIAL SPRD pushes the motes through depth, GIRO AUTO turns them
        // with the structure, DRONE SPACE lifts them. Three left-column faders
        // with a visible consequence they did not have.
        // The air carries the block. blockPhase runs 0→1 across the measured
        // period and resets when a block lands, so the cloud makes one slow
        // pass every twelve seconds — the chain's own bar, visible without a
        // number. It is added to the fader rather than replacing it: the
        // performer sets the drift, the chain modulates it.
        motes5.step(1 / 60,
            (spatSp - 0.5) * 90 + Math.sin(c5.blockPhase * Math.PI * 2) * 34,
            vm5.rotation * 0.09 + c5.turn * 0.02,
            (droneSpace - 0.5) * 26);
        motes5.material.opacity = (0.10 + texDep * 0.30) * masterA;
        motes5.material.size = Math.max(W, H) * (0.0016 + resBody * 0.0042);
        // ROTATION SPD turns the WHOLE assembly, not only the camera. It was
        // reaching OrbitControls.autoRotate and a few per-node spins, so at any
        // setting the structure itself sat still while the viewer moved around
        // it — which is the one thing a rotation control should not do.
        //
        // The CHAIN decides which way. Blocks alternate parity, so the graph
        // reverses its turn at every block boundary — a twelve-second period
        // that belongs to Ethereum and to nothing in this renderer. Between
        // boundaries the rate leans with how full the block is.
        // `turn` is parity RAMPED across two seconds, so the assembly slows,
        // stops and comes back the other way instead of reversing between two
        // frames. And the rate leans on the smoothed fullness, not the step.
        const spin5 = c5.turn * (0.55 + c5.fullness * 0.5);
        root5.rotation.y = vm5.angle * spin5;
        root5.rotation.x = Math.sin(vm5.angle * 0.31) * 0.10 * (0.3 + spatSp);

        // Captions ride above their bodies and fade with the layer's own level.
        // ── The BioToken, as the graph computes it ───────────────────────
        // Each node prints its own factor and that factor's live value. The
        // token is the PRODUCT of the six, so a node near zero is visibly the
        // one holding the whole thing down — the useful reading, and completely
        // unavailable while they all said N-something.
        // The six factors exactly as the panel computes them (parliamentEntry's
        // bioTokenTerms, published as window.__bioToken), so the graph and the
        // panel print one token. This used to recompute them here with IUCN
        // held at 0.6, and four closures a frame to do it.
        {
            const bt = (window as unknown as { __bioToken?: {
                presence: number; activity: number; ednaBio: number; fungiChem: number;
                aiOpt: number; iucn: number; value: number;
            } }).__bioToken;
            if (bt) {
                bt5[0] = bt.presence; bt5[1] = bt.activity; bt5[2] = bt.ednaBio;
                bt5[3] = bt.fungiChem; bt5[4] = bt.aiOpt; bt5[5] = bt.iucn;
                if (bt5.length > 6) bt5[6] = bt.value;
            }
            if (bt5.length > 7) bt5[7] = c5.gasN;
        }
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            // ── A readout that holds still ────────────────────────────────
            // Two separate faults made these unreadable.
            //
            // First, the redraw fired whenever the value crossed a 0.01
            // boundary. Against chain data arriving twenty times a second that
            // is several re-rasterisations per second per node, and each one
            // re-centres the string by its measured width — so "0.85" becoming
            // "0.9" relaid the whole caption sideways. A HUD value is read by
            // its digits, not by its edges: the number is padded to a fixed
            // width so the layout is identical for every value it can take,
            // and a deadband plus a minimum interval stops it stepping faster
            // than an eye can follow. Two decimals at 6 Hz is still a live
            // readout; it is simply one you can actually read.
            //
            // Second, the caption was pinned to n.p — the raw integrator
            // state — while the BODY is drawn at n.p plus the resonance and
            // the drift. Label and body were on different points, and the
            // label was on the noisier one.
            const now5 = performance.now();
            const q = bt5[i];
            if (Math.abs(q - bt5Was[i]) > 0.008 && now5 - bt5At[i] > 160) {
                bt5Was[i] = q;
                bt5At[i] = now5;
                tags5.text(i, `${SLOT_NOUNS.s5.one(i)} ${fixed2(q)}`);
            }
            _tmpB.copy(bodyAt5[i]).y += 26;
            tags5.set(i, _tmpB, (0.20 + vol * 0.55) * masterA
                * (i === pick5.hover || i === pick5.grabbed ? 1.6 : 1));
        }

        // Radar arc rotation — dronemix controls visible arc count
        const arcCount = Math.max(1, Math.floor(droneMix * 6));
        for (let i = 0; i < radarArcs.length; i++) {
            const arc = radarArcs[i];
            const visible = i < arcCount;
            arc.visible = visible;
            if (visible) {
                const dir = (i % 2 === 0) ? 1 : -1;
                arc.rotation.z += 0.008 * dir * (1 + tDil * 1.5) * (1 + i * 0.2);
                (arc.material as THREE.LineBasicMaterial).opacity = (0.06 + texDep * 0.08) * masterA;
            }
        }

        stage.render();
    }

    animate();

    return {
        name: "Dynamic Graphs", key: "5",
        destroy: () => {
            cfield.destroy();
            destroyed = true; cancelAnimationFrame(rafId);
            pick5.dispose();
            bodies5.dispose(); shells5.dispose(); links5.dispose(); floor5.dispose();
            motes5.dispose(); tags5.dispose();
            stage.destroy();
        }
    };
}
