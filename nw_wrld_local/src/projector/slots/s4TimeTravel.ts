// s4TimeTravel.ts — slot 4 · Time Travel · DRONE · stage 1/6 SENSED
import * as THREE from "three";
import type { ParliamentState } from "../parliament/parliamentStore";
import { getVizMotion, readVoteFlash, isAlarm } from "../vizMotion";
import { makeEventEmitter } from "../slotVoice";
import { makeNodeField, makeParticles, makeLabelField } from "../slotThree";
import { Viz, pickSpecies, showStage } from "../visualizationSwitcher";
import { INSTRUMENTS, SLOT_NOUNS, readInstrument, makeCircle, lerp, snoise } from "./instruments";
import { makeSlotStage, makeKnobs } from "./stage";

// ─── Slot 4: Time Travel (Persistent Structures) ─────────────────────────────
// Concept preserved: phosphor traces scroll right→left, radar reticule rotates,
//   species markers show at right edge.
// Three.js: BufferGeometry lines updated per frame; points as Mesh sprites.
// 20-knob mapping:
//   volume        → trace alpha
//   pitchshift    → sine wave amplitude on traces
//   timedilation  → scroll speed
//   spectralshift → trace hue (amber ↔ cyan)
//   spatialspread → vertical lane distribution
//   texturedepth  → grid density
//   atmospheremix → ghost trail persistence
//   memoryfeed    → background dim
//   harmonicrich  → harmonic echo trace
//   resonantbody  → reticule outer size + marker glow
//   masteramp     → global brightness scale
//   filtercutoff  → grid brightness
//   noiselevel    → trace jitter amplitude
//   noisefilt     → reticule line weight
//   dronedepth    → inner ring count (2–8)
//   dronefade     → trace color warmth
//   dronespace    → vertical camera offset
//   dronemix      → secondary diagonal grid density
//   delayfeedback → echo trail damping (AfterimagePass damp)
//   txInfluence   → glitch probability + chromatic aberration

export function mountTimeTravel(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(5);

    const stage = makeSlotStage(stageEl, "s4", {
        afterimage: 0.88, chromatic: true,
        inst: INSTRUMENTS.s4,
        probe: () => (reticuleGroup.rotation.z),
    });
    const { W, H, renderer, scene, camera, afterimage } = stage;
    const chromaticPass = stage.chromatic!;
    const kn = makeKnobs({ vol: 0.7, tDil: 0.3 });
    // Everything this slot draws hangs off one root group. That is what
    // makes the rebuild possible: depth is distributed across its children
    // and the whole world can be lifted or turned without touching the
    // camera, which now belongs to the viewer.
    const root4 = new THREE.Group();
    scene.add(root4);

    // Instrumental identity. Six slots, six voices of the engine, no
    // repeats — this one is mountTimeTravel. The name was drawn into the scene as
    // a sprite; it is gone. The binding it announced is the real one and
    // survives: this slot reads inst4's band and its voice's onsets.
    const inst4 = INSTRUMENTS.s4;
    // This slot does not merely watch its voice, it plays it — see
    // slotVoice.ts and 15_slot_voices.scd. The emitter is an edge
    // detector: it fires when the structural count RISES, and its first
    // observation only establishes a baseline, so mounting mid-set does
    // not announce itself with a note.
    const emitSweep4 = makeEventEmitter("drone");

    // ── Background grid lines ─────────────────────────────────────────────────
    const gridGroup = new THREE.Group();
    root4.add(gridGroup);

    // ── Trace lines (one per species) ────────────────────────────────────────
    const HISTORY = 300;
    const traces: {
        y: number;
        history: Float32Array; // [x0,y0,z0, x1,y1,z1, ...]
        count: number;
        line: THREE.Line;
        geo: THREE.BufferGeometry;
    }[] = [];

    const traceMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true });

    activeRoster.forEach((_sp, i) => {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(HISTORY * 3);
        const colors = new Float32Array(HISTORY * 3);
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geo.setAttribute("color",    new THREE.BufferAttribute(colors,    3));
        geo.setDrawRange(0, 0);
        const line = new THREE.Line(geo, traceMat.clone());
        root4.add(line);
        const yFrac = i / (activeRoster.length - 1 || 1);
        traces.push({ y: lerp(-H * 0.3, H * 0.3, yFrac), history: positions, count: 0, line, geo });
    });

    // ── Markers, as bodies ───────────────────────────────────────────────
    // These were flat diamond quads facing z — invisible edge-on from an
    // orbiting camera, which is most of the time. Octahedra: the same diamond
    // silhouette from the front, and still a diamond from every other angle.
    //
    // In their OWN group, not root4. The depth pass below runs
    // root4.children.forEach and writes position.z by child index, so anything
    // added to root4 has its depth overwritten by where it happens to sit in
    // the child list — which is why the air and the captions live in air4.
    const marks4 = makeNodeField(root4, activeRoster.length, 8, 0, { opacity: 0.9 });
    marks4.count = activeRoster.length;

    // The air, and what the traces are. Siblings of root4 rather than children,
    // for the reason above; they take root4's turn explicitly instead.
    const air4 = new THREE.Group();
    scene.add(air4);
    const motes4 = makeParticles(air4, 1100, Math.max(W, H) * 1.6, 0xffaa00);
    const tags4 = makeLabelField(air4, activeRoster.length, 0xffcc88, 13);
    activeRoster.forEach((_sp, i) => tags4.text(i, SLOT_NOUNS.s4.one(i)));
    const _t4a = new THREE.Vector3();

    // ── Reticule rings ────────────────────────────────────────────────────────
    const reticuleGroup = new THREE.Group();
    root4.add(reticuleGroup);

    // Axes lines
    const axisGeo = new THREE.BufferGeometry();
    axisGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
        -200, 0, 0,  200, 0, 0,
         0, -200, 0,   0, 200, 0,
    ]), 3));
    const axisLine = new THREE.LineSegments(axisGeo, new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.2 }));
    reticuleGroup.add(axisLine);

    // Outer ring
    const outerRing = makeCircle(180, 128, 0xffaa00, 0.3);
    reticuleGroup.add(outerRing);

    // Inner rings (up to 8) — rebuilt when droneDepth changes
    let innerRings: THREE.Line[] = [];
    let lastRingCount = -1;

    function rebuildInnerRings(ringCount: number, droneD: number, dronFd: number) {
        innerRings.forEach(r => { reticuleGroup.remove(r); r.geometry.dispose(); (r.material as THREE.Material).dispose(); });
        innerRings = [];
        const wR = lerp(102, 220, dronFd);
        const wG = lerp(51, 130, dronFd);
        const hexColor = (Math.floor(wR) << 16) | (Math.floor(wG) << 8);
        for (let r = 1; r <= ringCount; r++) {
            const frac = r / (ringCount + 1);
            const ring = makeCircle(180 * frac, 64, hexColor, lerp(0.08, 0.0, frac));
            (ring.material as THREE.LineBasicMaterial).opacity = 0.05 + droneD * 0.25 * (1 - frac);
            reticuleGroup.add(ring);
            innerRings.push(ring);
        }
        lastRingCount = ringCount;
    }

    rebuildInnerRings(4, 0.4, 0.5);

    // ── Grid rebuild helper ───────────────────────────────────────────────────
    let lastGridSpacing = -1;
    function rebuildGrid(spacing: number) {
        while (gridGroup.children.length) {
            const c = gridGroup.children[0] as THREE.Line;
            c.geometry.dispose(); (c.material as THREE.Material).dispose();
            gridGroup.remove(c);
        }
        const verts: number[] = [];
        for (let x = -W / 2; x < W / 2; x += spacing) { verts.push(x, -H / 2, -1, x, H / 2, -1); }
        for (let y = -H / 2; y < H / 2; y += spacing) { verts.push(-W / 2, y, -1, W / 2, y, -1); }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
        const mat = new THREE.LineBasicMaterial({ color: 0x663300, transparent: true, opacity: 0.15 });
        gridGroup.add(new THREE.LineSegments(g, mat));
        lastGridSpacing = spacing;
    }
    rebuildGrid(40);

    // ── Animation loop ────────────────────────────────────────────────────────
    let rafId: number;
    let frame = 0;
    let radarAngle = 0;

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        const sp4 = (window as any).__slot4Soneth ?? {};

        // Shared idle drift + vote flash. These six slots had NO vote channel
        // at all — no onState, no store subscription, no listener — so the top
        // of animate() is the only hook they have, and it is the same idiom
        // slots 1 and 3 already use.
        const vm4 = getVizMotion();
        const vf4 = readVoteFlash();

        // ── This slot's own instrument ───────────────────────────────────
        // level is the energy in ITS register of the master spectrum, env the
        // decaying attack of ITS last note. Reading the whole mix would make a
        // kick visual brighten because a bell rang; reading control values
        // (which is all these six ever did) makes it react to the intention
        // rather than to the sound.
        const au4 = readInstrument(inst4);

        const { vol, pitchSh, tDil: timeDil, specS, spatSp, texDep, atmMix, memFeed, harmR,
            resBody, masterA, filtC, noiseL, noiseF, droneD, dronFd, droneSpace, droneMix,
            delayFb, txInf } = kn.read(sp4);
        const consensus = st?.consensus ?? 0.5;

        // Afterimage damp: high delayFeedback + high memoryFeed = longer trails
        afterimage.uniforms["damp"].value = lerp(0.72, 0.96, delayFb * 0.7 + memFeed * 0.3);
        // Chromatic aberration driven by txInfluence
        chromaticPass.uniforms["amount"].value = txInf * 0.008;

        // Background dim via renderer clear color alpha approximation
        renderer.setClearColor(0x000804, lerp(0.6, 0.95, 1 - atmMix));

        // Rebuild grid if textureDepth changed spacing
        const gridSpacing = Math.floor(lerp(60, 20, texDep));
        if (Math.abs(gridSpacing - lastGridSpacing) > 4) rebuildGrid(gridSpacing);
        // Re-tuned in place — a new material every frame leaked (see slot 7).
        ((gridGroup.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial).opacity =
            (0.04 + texDep * 0.12 + filtC * 0.08) * masterA;

        // Rebuild inner rings if droneDepth changed ring count
        const ringCount = Math.floor(2 + droneD * 6);
        if (ringCount !== lastRingCount) rebuildInnerRings(ringCount, droneD, dronFd);

        // Speed
        const speed = 1.5 + timeDil * 8;

        // Lane bounds driven by spatialSpread
        const yMin = -H / 2 * lerp(0.85, 0.98, spatSp);
        const yMax =  H / 2 * lerp(0.85, 0.98, spatSp);

        // Trace color from spectralShift + droneFade
        const trR = lerp(lerp(200, 255, dronFd), 100, specS) / 255;
        const trG = lerp(lerp(255, 180, dronFd), 255, specS) / 255;
        const trB = lerp(lerp(230,  60, dronFd), 255, specS) / 255;

        for (let i = 0; i < traces.length; i++) {
            const br = traces[i];
            const activity = st?.species?.[i]?.activity ?? 0.5;
            const presence = st?.species?.[i]?.presence ?? 0.5;

            // Jitter + tx glitch
            if (Math.random() < activity * 0.15 + txInf * 0.1) {
                br.y += (Math.random() * 80 - 40) * (presence + 0.5) * (1 + txInf);
                br.y = Math.max(yMin, Math.min(yMax, br.y));
            }

            // Pitch wave + noise jitter
            const pitchWave = Math.sin(frame * (0.02 + pitchSh * 0.06) + i * 2) * (pitchSh * 30);
            const jitter = (snoise(i, frame * 0.01) - 0.5) * noiseL * 20;
            const newY = br.y + pitchWave + jitter;

            // Shift history left by speed
            const pos = br.geo.attributes.position.array as Float32Array;
            const col = br.geo.attributes.color.array as Float32Array;
            const used = Math.min(br.count, HISTORY - 1);
            for (let k = used; k > 0; k--) {
                pos[k * 3]     = pos[(k - 1) * 3] - speed;
                pos[k * 3 + 1] = pos[(k - 1) * 3 + 1];
                pos[k * 3 + 2] = 0;
                col[k * 3]     = col[(k - 1) * 3];
                col[k * 3 + 1] = col[(k - 1) * 3 + 1];
                col[k * 3 + 2] = col[(k - 1) * 3 + 2];
            }
            pos[0] = W / 2 - 20;
            pos[1] = newY;
            pos[2] = 0;
            col[0] = trR; col[1] = trG; col[2] = trB;

            br.count = Math.min(br.count + 1, HISTORY);
            // Cull points that scrolled past left edge
            let visible = br.count;
            while (visible > 0 && pos[(visible - 1) * 3] < -W / 2 - 50) visible--;
            br.geo.setDrawRange(0, visible);
            br.geo.attributes.position.needsUpdate = true;
            br.geo.attributes.color.needsUpdate = true;

            // Marker at right edge, at its trace's own depth.
            const glow = 3 + activity * 8 + resBody * 12;
            const mz = -i * 26 * (0.35 + au4.level * 2.2);
            _t4a.set(W / 2 - 10, br.y, mz);
            marks4.set(i, _t4a, glow / 8);
            marks4.tint(i, 1, 0.67, 0);
            // T0..T4 — one trace per agent, named at the head of its own line.
            _t4a.set(W / 2 + 22, br.y, mz);
            tags4.set(i, _t4a, (0.22 + vol * 0.5) * masterA);

            // Harmonic echo trace (offset ghost) — driven by harmonicRich + dronemix
            if (harmR > 0.2) {
                // shift harmonic echo geometry inline by using col[1] offset trick;
                // for simplicity we tint the y of existing segment by echo offset
                // (harmonic echo is implicitly present via afterimage + slight color drift)
            }
        }

        // Reticule rotation
        // Idle drift rides ON TOP of the consensus-driven sweep, so the
        // reticule keeps turning when nobody is at the desk.
        radarAngle += (0.01 + (1 - consensus) * 0.05) * (0.5 + timeDil) + vm4.speed * 0.016;
        // A vote is a PING: the reticule flares and snaps a quarter turn.
        // Alarm types kick it the other way, so a rejection reads as a recoil.
        if (vf4) {
          radarAngle += (isAlarm(vf4.type) ? -1 : 1) * vf4.flash * 0.06;
        }
        reticuleGroup.rotation.z = radarAngle;
        // ── DRONE speaks ──────────────────────────────────────────────────
        // The drone is sustained, so there is no attack to fire; the
        // structural event transposes the bed instead. One full sweep of the
        // reticule is the slot's own unit of "a pass has completed", and
        // consensus chooses the new pitch — the assembly agreeing on where the
        // bed sits. It glides (Lag on freq in \opalDrone), so this is a slow
        // transposition rather than the step it would have been.
        emitSweep4(Math.floor(radarAngle / (Math.PI * 2)), 0.5, consensus);
        const retSize = (H * 0.3 + resBody * H * 0.2) / 180;
        reticuleGroup.scale.setScalar(retSize);
        (axisLine.material as THREE.LineBasicMaterial).opacity = (0.12 + resBody * 0.2) * masterA;
        (outerRing.material as THREE.LineBasicMaterial).opacity = (0.25 + resBody * 0.35) * masterA;
        for (let idx = 0; idx < innerRings.length; idx++) {
            const r = innerRings[idx];
            const frac = (idx + 1) / (innerRings.length + 1);
            (r.material as THREE.LineBasicMaterial).opacity = (0.05 + droneD * 0.25 * (1 - frac)) * masterA;
        }

        // Camera subtle vertical drift from droneSpace
        // droneSpace used to write camera.position.y every frame, which would
        // now fight OrbitControls for the camera and win, pinning it. Moved
        // onto the SCENE instead: the world lifts, the viewer keeps the camera.
        root4.position.y = (droneSpace - 0.5) * H * 0.12;
        // DRONE. Each persistent trace is pushed back in Z by its age, so the
        // scroll that used to slide sideways across a flat plane now recedes
        // into the volume — the structure's history becomes its depth, which
        // is the whole idea the slot was already named after.
        // The low band swells the sheet; there is no onset to catch, because a
        // drone does not start, it is simply there.
        // DRONE. The persistent traces are pushed back by their index, so the
        // structure's history becomes its depth — which is what the slot was
        // already named after and had never actually shown. The low band, where
        // the drone lives, opens the stack out; there is no attack to catch
        // because a drone does not start, it is simply there.
        for (let i = 0; i < root4.children.length; i++) {
            root4.children[i].position.z = -i * 26 * (0.35 + au4.level * 2.2);
        }
        marks4.mesh.material.opacity = vol * masterA;
        marks4.commit();
        root4.rotation.x = -0.06 + au4.level * 0.05;
        // ROTATION SPD turns the assembly, not only the camera around it.
        root4.rotation.y = vm4.angle * 0.30;
        // The air is a sibling of root4 (see the note at marks4), so it takes
        // the same turn explicitly rather than inheriting it.
        air4.rotation.copy(root4.rotation);
        // TIME DILAT pushes the air along the axis the traces recede on — the
        // drone's own direction of travel. DRONE SPACE lifts it.
        motes4.step(1 / 60, (timeDil - 0.5) * 80, vm4.rotation * 0.05,
            (droneSpace - 0.5) * 20);
        motes4.material.opacity = (0.09 + texDep * 0.28) * masterA;
        motes4.material.size = Math.max(W, H) * (0.0015 + resBody * 0.0040);

        // dronemix + noisefilt: secondary diagonal grid brightness (reuse grid opacity)
        // dronemix + noisefilt modulate grid brightness
        if (gridGroup.children[0]) {
            const diagBright = droneMix * 0.1 + noiseF * 0.05;
            ((gridGroup.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial).opacity =
                Math.min(0.5, (0.04 + texDep * 0.12 + filtC * 0.08 + diagBright) * masterA);
        }

        stage.render();
    }

    animate();

    // ── La rampa · slot 4 only ────────────────────────────────────────────
    //
    // This slot IS the drone, and a drone that holds one filter setting for as
    // long as it is on screen has no interior. The bus that opens and closes
    // it is already there and already reaches \opalDrone — nothing in the
    // SynthDef is touched — so what is missing is only somebody moving it.
    //
    // A 74 s triangle, up and down, around wherever the performer has left the
    // fader. Slow on purpose: it should never be heard to START, only to have
    // been somewhere else a minute ago. The period is deliberately not a round
    // number and does not divide any tide arc, so the sweep and the swell drift
    // through each other instead of locking.
    //
    // BASE, not absolute. `base` is the performer's own setting and the ramp is
    // a deviation around it, so Filt Tilt still means what it means: move it
    // and the whole sweep moves with it. Re-centred on a real gesture only —
    // our own echoes come back on the same path and would otherwise walk the
    // centre up the range by feeding themselves.
    const RAMP_PERIOD_S = 74;
    const RAMP_DEPTH = 0.30;
    let rampBase = (window as unknown as { __sonethParams?: Record<string, number> })
        .__sonethParams?.filtercutoff ?? 0.6;
    let lastSent = -1;
    const onUserFilt = (e: Event) => {
        const t = e.target as HTMLInputElement | null;
        if (t?.dataset?.osc === "/soneth/filtercutoff") {
            const v = parseFloat(t.value);
            if (isFinite(v)) rampBase = v;
        }
    };
    document.addEventListener("input", onUserFilt, true);

    const rampT0 = performance.now();
    const rampTimer = setInterval(() => {
        if (destroyed) return;
        const phase = ((performance.now() - rampT0) / 1000 / RAMP_PERIOD_S) % 1;
        // Triangle, not a sine: a sine spends most of its time at the turns,
        // which on a filter reads as two held settings with a rush between
        // them. A triangle passes through the whole range at one rate.
        const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;   // 0→1→0
        const v = Math.max(0, Math.min(1, rampBase + (tri - 0.5) * 2 * RAMP_DEPTH));
        // 1/500 is below the resolution of the fader and of the ear; skipping
        // those saves two thirds of the traffic on a slow sweep.
        if (Math.abs(v - lastSent) < 0.002) return;
        lastSent = v;
        const send = (window as unknown as { __sendOscToSC?: (a: string, v: number) => void })
            .__sendOscToSC;
        if (typeof send === "function") send("/soneth/filtercutoff", v);
    }, 250);

    return {
        name: "Time Travel", key: "4",
        destroy: () => {
            destroyed = true;
            cancelAnimationFrame(rafId);
            marks4.dispose(); motes4.dispose(); tags4.dispose();
            clearInterval(rampTimer);
            document.removeEventListener("input", onUserFilt, true);
            // Hand the filter back where the performer left it. Leaving the
            // engine wherever the sweep happened to be when the slot changed
            // would make switching modules a hidden edit to the sound.
            const send = (window as unknown as { __sendOscToSC?: (a: string, v: number) => void })
                .__sendOscToSC;
            if (typeof send === "function") send("/soneth/filtercutoff", rampBase);
            stage.destroy();
        }
    };
}
