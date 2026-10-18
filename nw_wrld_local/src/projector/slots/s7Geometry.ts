// s7Geometry.ts — slot 7 · Geometry · BOMBO · stage 4/6 ADJUDICATED
import * as THREE from "three";
import type { ParliamentState } from "../parliament/parliamentStore";
import { getVizMotion, readVoteFlash } from "../vizMotion";
import { makeExcursionEmitter } from "../slotVoice";
import { makeResonatorBank } from "../resonators";
import { makeNodeField, makeTubeLinks, makeDepthGrid, makeParticles, makeLabelField, makeCalm, attachPicker } from "../slotThree";
import { mountSlotTicker } from "../slotTicker";
import { Viz, pickSpecies, showStage } from "../visualizationSwitcher";
import { INSTRUMENTS, SLOT_NOUNS, readInstrument, makeOnsetEdge, makeCircle, lerp, snoise } from "./instruments";
import { makeSlotStage, makeKnobs } from "./stage";
import { escapement } from "./turns";

// ─── Slot 7: Geometry (Sweep Lines / Radar) ───────────────────────────────────
// Concept preserved: horizontal rays scroll vertically, crosshair targets appear
//   at intersection with vertical sweep lines; warped background grid.
// Three.js: all geometry as LineSegments; target circles as Line loops.
// 20-knob mapping:
//   volume        → ray brightness
//   pitchshift    → ray angular range
//   timedilation  → drift + rotation speed
//   spectralshift → ray color (amber↔cyan)
//   spatialspread → vertical distribution of rays
//   texturedepth  → grid density
//   atmospheremix → ghost trail
//   memoryfeed    → background fade
//   harmonicrich  → harmonic echo ray
//   resonantbody  → target crosshair size + reticule size
//   masteramp     → global brightness
//   filtercutoff  → unused (maps to grid color brightness)
//   noiselevel    → grid warp amplitude (hero param)
//   noisefilt     → eco sweep line count (hero param)
//   dronedepth    → ray count bonus
//   dronefade     → reticule color warmth
//   dronespace    → reticule vertical offset
//   dronemix      → background grid brightness
//   delayfeedback → afterimage damp
//   txInfluence   → glitch tear rects

export function mountGeometry(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(6);

    const stage = makeSlotStage(stageEl, "s7", {
        bloom: [0.5, 0.4, 0.5],
        afterimage: 0.83, chromatic: true,
        inst: INSTRUMENTS.s7,
        probe: () => (reticuleGroup.rotation.z),
    });
    const { W, H, renderer, scene, camera, controls, afterimage } = stage;
    const bloom = stage.bloom!;
    const chromatic = stage.chromatic!;
    const kn = makeKnobs();
    // Everything this slot draws hangs off one root group. That is what
    // makes the rebuild possible: depth is distributed across its children
    // and the whole world can be lifted or turned without touching the
    // camera, which now belongs to the viewer.
    const root7 = new THREE.Group();
    const turn7 = escapement();
    scene.add(root7);

    // Instrumental identity. Six slots, six voices of the engine, no
    // repeats — this one is mountGeometry. The name was drawn into the scene as
    // a sprite; it is gone. The binding it announced is the real one and
    // survives: this slot reads inst7's band and its voice's onsets.
    const inst7 = INSTRUMENTS.s7;
    // The constellation backdrop for this slot, coloured by inst7's hue
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
    const onsetOf7 = makeOnsetEdge(inst7);
    // BOMBO. Few modes, very low, and damp 0.90 so it is still again almost at
    // once — a kick is one displacement of air, not a texture. The wide mallet
    // (spread 0.9) moves the WHOLE field together, which is exactly how a low
    // frequency arrives in a room: everything at the same time.
    const ring7 = makeResonatorBank({ n: 10, baseFreq: 0.011, freqRatio: 1.04, damp: 0.90, spread: 0.9 });
    const emitTarget7 = makeExcursionEmitter("kick");

    // Ray lines — one per species (2 verts each)
    // Evenly spaced, not scattered: a sweep whose rays start bunched reads as
    // a broken sweep for the first few seconds of every mount.
    const rays: { y: number; angle: number }[] = activeRoster.map((_sp, i) => ({
        y: ((i + 0.5) / activeRoster.length - 0.5) * H * 0.7,
        angle: ((i % 3) - 1) * (Math.PI / 12),
    }));

    const MAX_RAYS = 10;
    // ── The rays have a body ─────────────────────────────────────────────
    // These already ran from z = +W*0.10 to z = -W*0.55, so unlike the other
    // four this slot's rays genuinely crossed the volume — and were then drawn
    // as 1 px lines, which is the one thing that cannot express a beam. Tubes,
    // so a ray occludes what is behind it and the depth it already had can be
    // seen. Their radius answers RES BODY and the kick's own strike.
    const rays7 = makeTubeLinks(root7, MAX_RAYS, 0xc8ffe6, 0.6);
    const rayMat = rays7.material;
    // The targets a ray acquires are bodies, and they are what you can touch:
    // the sweep is the machine's business, but a target is a claim about the
    // world and should answer being pointed at.
    const marks7 = makeNodeField(root7, 64, 9, 0, { opacity: 0.85 });
    const pick7 = attachPicker(renderer.domElement, marks7.mesh, controls);
    const floor7 = makeDepthGrid(root7, Math.max(W, H) * 1.7, 20, 0x336633);
    const _t7a = new THREE.Vector3();
    const _t7b = new THREE.Vector3();
    const motes7 = makeParticles(root7, 1000, Math.max(W, H) * 1.6, 0xc8ffe6);
    // The record of a proceeding: upright, plated, no brackets and no rule —
    // a minute rather than an instrument reading.
    const tags7 = makeLabelField(root7, 64, 0xffd8a0, 12, {
        font: "600 27px ui-monospace, 'SF Mono', Menlo, monospace",
        tracking: 2,
        plate: true,
    });
    const parl7Was = new Float32Array(64).fill(-1);
    const calm7 = makeCalm();
    const ticker7 = mountSlotTicker(stageEl,
        "BOMBO · opalKick · FRENTE DE PRESIÓN  ·  BLANCOS ADQUIRIDOS",
        "rgba(200,255,230,");

    // Sweep vertical lines (max 4 eco values)
    const sweepPositions = new Float32Array(4 * 2 * 3);
    const sweepGeo = new THREE.BufferGeometry();
    sweepGeo.setAttribute("position", new THREE.BufferAttribute(sweepPositions, 3));
    sweepGeo.setDrawRange(0, 0);
    const sweepMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true });
    root7.add(new THREE.LineSegments(sweepGeo, sweepMat));

    // Target circles pool (ray × sweep)

    // Warped grid — rebuilt occasionally
    const gridGroup = new THREE.Group();
    root7.add(gridGroup);

    // Reticule
    const reticuleGroup = new THREE.Group();
    root7.add(reticuleGroup);
    const retOuter = makeCircle(H * 0.25, 128, 0x663300, 0.15);
    reticuleGroup.add(retOuter);

    // Targets are instanced octahedra now — see marks7 above. The pool of 32
    // flat Line loops that used to live here faced the camera at a fixed z and
    // could not sit on the cone they were supposed to mark.
    const maxTargets = MAX_RAYS * 4;

    // Glitch rects pool
    const glitchRects: THREE.Mesh[] = [];
    for (let i = 0; i < 20; i++) {
        const g = new THREE.PlaneGeometry(60, 3);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0 }));
        m.visible = false;
        root7.add(m);
        glitchRects.push(m);
    }

    let rafId: number;
    let frame = 0;
    let radarAngle = 0;
    let lastGridStep = -1;
    /** The four eco signals, 0-1, rewritten each frame. */
    const eco7 = new Float32Array(4);
    /** When each target's caption was last rasterised (≤ 6 Hz, as on slot 5). */
    const parl7At = new Float64Array(64);

    function rebuildGrid(gridStep: number, noiseL: number, texDep: number) {
        while (gridGroup.children.length) {
            const c = gridGroup.children[0] as THREE.Line;
            c.geometry.dispose(); (c.material as THREE.Material).dispose();
            gridGroup.remove(c);
        }
        const co2Approx = 0.5; // rough constant for static grid; actual warp happens per frame via rotation
        const verts: number[] = [];
        for (let x = -W / 2; x <= W / 2; x += gridStep) {
            for (let y = -H / 2; y <= H / 2; y += gridStep) {
                const warp = (snoise(x * 0.01, y * 0.01) - 0.5) * noiseL * 60 + co2Approx * 15;
                verts.push(x + warp, y, -1, x + warp, y + gridStep, -1);
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
        const mat = new THREE.LineBasicMaterial({ color: 0x663300, transparent: true, opacity: 0.06 + texDep * 0.08 });
        gridGroup.add(new THREE.LineSegments(g, mat));
        lastGridStep = gridStep;
    }
    rebuildGrid(40, 0.2, 0.5);

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        const onset7 = onsetOf7(st);
        const sp7 = (window as any).__slot7Soneth ?? {};

        // Shared idle drift + vote flash. These six slots had NO vote channel
        // at all — no onState, no store subscription, no listener — so the top
        // of animate() is the only hook they have, and it is the same idiom
        // slots 1 and 3 already use.
        const vm7 = getVizMotion();
        const vf7 = readVoteFlash();

        // ── This slot's own instrument ───────────────────────────────────
        // level is the energy in ITS register of the master spectrum, env the
        // decaying attack of ITS last note. Reading the whole mix would make a
        // kick visual brighten because a bell rang; reading control values
        // (which is all these six ever did) makes it react to the intention
        // rather than to the sound.
        const au7 = readInstrument(inst7);
        // Stepped in TIME, not in frames. The bank's freqs are cycles per
        // frame, so an unscaled step runs the whole body 2.4x fast on a
        // 144 Hz panel — the same patch shaking on one display and
        // swinging on another. `speed` normalises against 60 Hz.
        ring7.step(calm7.dt * 60);
        if (onset7 > 0) {
            ring7.strike(onset7, au7.tone);
            // From the centre, always. The kick has no place in the stereo
            // field and it should have none here either — the wave leaves the
            // middle and reaches every figure at once.
        }

        const { vol, pitchSh, tDil, specS, spatSp, texDep, atmMix, memFeed, harmR, resBody,
            masterA, filtC, noiseL, noiseF, droneD, dronFd, droneSpace, droneMix, delayFb,
            txInf } = kn.read(sp7);
        const consensus = st?.consensus ?? 0.5;

        afterimage.uniforms["damp"].value = lerp(0.77, 0.94, delayFb * 0.7 + memFeed * 0.3);
        chromatic.uniforms["amount"].value = txInf * 0.006;
        bloom.strength = lerp(0.10, 0.42, (resBody + harmR * 0.3) * masterA);
        renderer.setClearColor(0x000804, lerp(0.5, 0.95, 1 - atmMix));

        // Rebuild grid when noiseLevel changes significantly
        const gridStep = Math.floor(lerp(50, 15, texDep));
        if (Math.abs(gridStep - lastGridStep) > 5) rebuildGrid(gridStep, noiseL, texDep);
        // The grid's own material, re-tuned in place. This used to assign a NEW
        // LineBasicMaterial every frame and never dispose the old one: sixty
        // materials a second, each registered with this renderer and — with the
        // dome open — with the dome's too, which draws the scene six times. The
        // heap grew ~15 MB a minute and the stalls reached the sound card.
        if (gridGroup.children[0]) {
            ((gridGroup.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial).opacity =
                (0.04 + texDep * 0.08 + droneMix * 0.06 + filtC * 0.04) * masterA;
        }

        // Eco sweep lines — noiseFilt controls count. Normalised the way slot 6
        // and the panel read them (co2 /127, myco /4, P /100, N /127): this
        // divided co2 by 800 and took the raw others modulo 1, so a sweep's
        // place was the fractional part of a reading rather than the reading.
        const ec7 = st?.eco;
        eco7[0] = Math.min(0.999, (ec7?.co2 ?? 64) / 127);
        eco7[1] = Math.min(0.999, (ec7?.mycoPulse ?? 0) / 4);
        eco7[2] = Math.min(0.999, (ec7?.phosphorus ?? 50) / 100);
        eco7[3] = Math.min(0.999, (ec7?.nitrogen ?? 64) / 127);
        const maxSweeps = Math.max(1, Math.round(1 + noiseF * 3));
        let swIdx = 0;
        for (let e = 0; e < maxSweeps; e++) {
            const sx = eco7[e] * W - W / 2;
            sweepPositions[swIdx * 6]     = sx; sweepPositions[swIdx * 6 + 1] = -H / 2; sweepPositions[swIdx * 6 + 2] = 0;
            sweepPositions[swIdx * 6 + 3] = sx; sweepPositions[swIdx * 6 + 4] =  H / 2; sweepPositions[swIdx * 6 + 5] = 0;
            swIdx++;
        }
        sweepGeo.setDrawRange(0, swIdx * 2);
        sweepGeo.attributes.position.needsUpdate = true;
        // spectralShift bends sweep color amber→cyan
        const swR = lerp(1.0, 0.31, specS);
        const swG = lerp(0.67, 0.9, specS);
        const swB = lerp(0.0, 0.78, specS);
        sweepMat.color.setRGB(swR, swG, swB);
        sweepMat.opacity = (0.5 + vol * 0.5) * masterA;

        // Reticule — resBody controls size, droneFade warmth, droneSpace Y offset
        // Idle drift on the sweep, and a vote widens the ray fan for a moment.
        radarAngle += 0.005 + tDil * 0.025 + vm7.speed * 0.016;
        // BOMBO. The radar was a disc; it is a CONE now, rays reaching back
        // into depth. The sub band opens the cone and the kick attack punches
        // the whole reticule toward the viewer — the one visual in the set
        // that should hit you in the chest.
        // A kick is a COMPRESSION. The reticule is squashed along the axis the
        // wave travels and bulges across it, then recovers — where before it
        // simply flew at the camera and scaled up, which is the gesture of a
        // thing approaching rather than of air being displaced.
        const rz7 = ring7.value(0);
        const rz7b = ring7.value(4);
        reticuleGroup.position.z = rz7 * 260 * au7.amp;
        reticuleGroup.scale.set(
            1 + rz7 * 0.42 + au7.level * 0.25,
            1 - rz7 * 0.30 + au7.level * 0.25,
            1 + rz7b * 0.5);
        // The whole frame recoils a little, and off-axis, so the impact has a
        // direction instead of being a pure zoom.
        root7.rotation.x = -0.07 - au7.level * 0.06 + rz7 * 0.10;
        root7.rotation.z = rz7b * 0.045;
        reticuleGroup.rotation.z = radarAngle;
        reticuleGroup.position.y = (droneSpace - 0.5) * H * 0.15;
        // RES BODY sizes the reticule ON TOP of the kick's compression above.
        // This was setScalar, which threw the compression away every frame.
        const retScale = (H * (0.25 + resBody * 0.2)) / (H * 0.25);
        reticuleGroup.scale.multiplyScalar(retScale);
        const retR = lerp(0.4, 0.86, dronFd);
        const retG = lerp(0.2, 0.51, dronFd);
        (retOuter.material as THREE.LineBasicMaterial).color.setRGB(retR, retG, 0);
        (retOuter.material as THREE.LineBasicMaterial).opacity = (0.15 + resBody * 0.3) * masterA;

        // Lane bounds
        const yMin = -H / 2 * lerp(0.85, 0.98, spatSp);
        const yMax =  H / 2 * lerp(0.85, 0.98, spatSp);

        // Update rays — droneDepth adds bonus rays (clamped to MAX_RAYS)
        const rayCount = Math.min(rays.length + Math.floor(droneD * 2), MAX_RAYS);
        let rIdx = 0;
        // Outside the loop, not on the first iteration: at droneDepth 0 with an
        // empty roster the loop body never runs, and end() without begin()
        // would leave the previous frame's draw range standing.
        calm7.step("__slot7Soneth");
        const e7b = calm7.eth;
        const c7 = calm7.chain;
        pick7.update(camera);
        rays7.begin();
        for (let i = 0; i < Math.min(rays.length, rayCount); i++) {
            const r = rays[i];
            const presence = st?.species?.[i]?.presence ?? 0.5;
            const act      = st?.species?.[i]?.activity ?? 0.5;

            r.y += (act - 0.5) * (3 + tDil * 4);
            if (r.y < yMin) r.y = yMax; if (r.y > yMax) r.y = yMin;

            const angleRange = Math.PI / 4 * (0.3 + pitchSh * 1.4);
            // A sweep that jitters is a broken sweep. Slow drift with the
            // bed, so the cone wanders as the drone moves rather than at
            // whatever rate the display happens to run at.
            r.angle += calm7.drift(i, 0) * (0.012 + (1 - consensus) * 0.010)
                * (0.3 + calm7.swell * 1.2);
            r.angle = Math.max(-angleRange, Math.min(angleRange, r.angle));

            const endY = r.y + Math.tan(r.angle) * W;
            // BOMBO in three dimensions. The rays used to lie in one plane at
            // z = 0 — a flat sweep drawn with perspective, which reads as
            // nothing at all. Each ray now runs from a near point to a far
            // one, so the sweep is a CONE opening away from the viewer, and
            // the sub band opens or closes it. The kick attack drives the far
            // ends forward: the pulse arrives as depth, which is the only
            // thing a sub frequency can honestly look like.
            // Pushing one end of a horizontal scanline backwards does not make
            // a cone, it makes lines that lean. The rays RADIATE now: every one
            // starts near the origin and shoots outward into depth, so the
            // sweep is a shockwave leaving the centre. For a sub-bass voice
            // that is the only honest shape — a kick is a pressure front, and
            // this is what a pressure front looks like from inside it.
            //
            // The attack drives the front outward and the sub band sets how far
            // it reaches; between hits it collapses back toward the origin.
            // Floored. The audio MODULATES the cone, it does not create it: keyed to
            // level alone the whole shape collapsed to a few short spokes
            // whenever the engine went quiet, which is most of a tidal trough.
            const front7 = 0.62 + au7.level * 0.42 + au7.env * au7.amp * 0.8;
            const dirA = (i / Math.max(1, rayCount)) * Math.PI * 2 + r.angle * 2 + radarAngle;
            const rNear = W * 0.03;
            const rFar  = W * 0.62 * front7;
            _t7a.set(Math.cos(dirA) * rNear,
                     Math.sin(dirA) * rNear + r.y * 0.06,
                     W * 0.10);
            _t7b.set(Math.cos(dirA) * rFar,
                     Math.sin(dirA) * rFar + r.y * 0.30,
                     -W * 0.55 * front7);
            // A pressure front has a width, and the width is the hit. RES BODY
            // sets the resting thickness, the kick's own envelope swells it —
            // which is the modulation a 1 px line could never carry.
            // The beam's WIDTH is what the chain is charging. A sub voice and
            // a base fee are both pressure; this is the one slot where saying
            // so with thickness rather than colour is the obvious reading.
            rays7.add(_t7a, _t7b,
                (0.6 + resBody * 1.5) * (1 + au7.env * au7.amp * 1.8)
                * (0.7 + c7.baseFee * 0.6 + c7.blockEnv * 0.35));
            rIdx++;
        }
        rays7.end();
        // average presence across active species modulates ray brightness
        let avgPresence = 0;
        for (let i = 0; i < rays.length; i++) avgPresence += st?.species?.[i]?.presence ?? 0.5;
        avgPresence /= Math.max(rays.length, 1);
        rayMat.opacity = (0.12 + avgPresence * 0.18 + vol * 0.26) * masterA;

        // ── Targets are bodies, and they can be pointed at ────────────────
        //
        // These were flat Line loops pinned at z = 1 — circles facing the
        // camera on a stage whose rays run through 0.65 W of depth, so an
        // "acquisition" appeared to float in front of the cone rather than on
        // it. Each target now sits at the intersection's OWN depth along its
        // ray, as an octahedron: visible from every angle, and solid enough to
        // occlude the beam it sits on.
        //
        // And they answer the pointer. The sweep is the machine's business, but
        // a target is a claim about the world, so it is the thing on this stage
        // that should respond to being looked at closely — hover swells it and
        // holding it pins it bright.
        let tcIdx = 0;
        const now7 = performance.now();
        for (let ri = 0; ri < Math.min(rays.length, rayCount); ri++) {
            const r = rays[ri];
            const act = st?.species?.[ri]?.activity ?? 0.5;
            for (let e = 0; e < maxSweeps; e++) {
                if (tcIdx >= maxTargets || tcIdx >= 64) break;
                const sx = eco7[e] * W - W / 2;
                const iy = r.y + Math.tan(r.angle) * (sx + W / 2);
                if (iy > yMin && iy < yMax) {
                    // Where along its own ray this crossing falls, so the
                    // target inherits the ray's depth instead of hovering at
                    // a constant z in front of everything.
                    const tAlong = Math.min(1, Math.max(0, (sx + W / 2) / Math.max(1, W)));
                    const tz = lerp(W * 0.10, -W * 0.55 * 0.9, tAlong);
                    const hov7 = (tcIdx === pick7.hover);
                    const grb7 = (tcIdx === pick7.grabbed);
                    const targetSize = 10 + act * 20 + resBody * 12;
                    _t7a.set(sx, iy, tz);
                    marks7.set(tcIdx, _t7a,
                        (targetSize / 9) * (grb7 ? 1.9 : hov7 ? 1.4 : 1));
                    marks7.tint(tcIdx,
                        hov7 || grb7 ? 1 : swR,
                        hov7 || grb7 ? 1 : swG,
                        hov7 || grb7 ? 1 : swB);
                    // Each acquisition prints one state of the chamber. Six
                    // readings cycle across the targets, so a busy sweep shows
                    // the whole record and a quiet one shows the first of it.
                    {
                        const k7 = tcIdx % 6;
                        const pq = k7 === 0 ? consensus
                            : k7 === 1 ? st?.consensusWave ?? 0.5
                            : k7 === 2 ? st?.phase ?? 0
                            : k7 === 3 ? Math.min(1, (st?.votes ?? 0) / 40)
                            : k7 === 4 ? (consensus >= 0.5 ? 1 : 0)
                            : c7.blockPhase;
                        const q = Math.round(pq * 100) / 100;
                        if (q !== parl7Was[tcIdx] && now7 - parl7At[tcIdx] > 160) {
                            parl7Was[tcIdx] = q;
                            parl7At[tcIdx] = now7;
                            tags7.text(tcIdx,
                                `${SLOT_NOUNS.s7.one(tcIdx)} ${q.toFixed(2)}`);
                        }
                    }
                    _t7b.set(_t7a.x, _t7a.y + 22, _t7a.z);
                    tags7.set(tcIdx, _t7b, (0.22 + vol * 0.5) * masterA
                        * (hov7 || grb7 ? 1.7 : 1));
                    tcIdx++;
                }
            }
        }
        marks7.count = tcIdx;
        marks7.mesh.material.opacity = (0.30 + vol * 0.30) * masterA
            * (0.72 + c7.gasN * 0.45 + c7.blockEnv * 0.22);
        marks7.commit();
        floor7.grid.position.y = yMin - 20;
        floor7.material.opacity = (0.035 + texDep * 0.08) * masterA;
        // Only the acquired targets are named, and only while acquired — a
        // caption on a body that is not there is worse than none.
        tags7.count(tcIdx);

        // The air moves OUTWARD here, the same direction the cone opens, so
        // the motes read as the medium the pressure front is travelling
        // through. SPATIAL SPRD sets how fast, GIRO AUTO turns the field.
        motes7.step(1 / 60,
            -(0.2 + spatSp) * 110 - c7.blockPhase * 40,
            vm7.rotation * 0.06,
            (droneSpace - 0.5) * 18);
        motes7.material.opacity = (0.09 + texDep * 0.24) * masterA;
        motes7.material.size = Math.max(W, H) * (0.0013 + resBody * 0.0034);
        // One verdict at a time: the yaw steps in uneven ticks (turns.ts).
        root7.rotation.y = turn7(calm7.dt, vm7.speed, c7);
        ticker7.draw((0.35 + vol * 0.65) * masterA);
        // ── BOMBO speaks ──────────────────────────────────────────────────
        // A target acquisition — a ray crossing a sweep — is this slot's
        // discrete event, and the sub is the register that can carry it. The
        // count of simultaneous acquisitions sets how hard, and how low.
        emitTarget7(tcIdx, 0.4 + Math.min(1, tcIdx / 12) * 0.5,
            1 - Math.min(1, tcIdx / 16));

        // Glitch rects from txInfluence
        let grIdx = 0;
        for (let ri = 0; ri < rays.length && grIdx < 20; ri++) {
            // Tears on a chain event, not on a coin flip. A tear IS a
            // transaction arriving: eth.pulse is 1 the instant one lands and
            // decays over half a second, so a burst of activity tears the
            // sweep and a quiet chain leaves it clean. Which ray tears is the
            // counterparty's own signature — the same address marks the same
            // ray every time it acts.
            const e7 = calm7.eth;
            if (txInf > 0.25 && e7.pulse > 0.05
                && Math.abs(e7.addr - (ri + 0.5) / Math.max(1, rays.length)) < 0.2) {
                const gx = calm7.drift(ri * 5, 0) * W * 0.5;
                const gy = rays[ri].y + calm7.drift(ri * 5, 1) * 40;
                const gr = glitchRects[grIdx];
                gr.visible = true;
                // Length is what the transaction MOVED; a large transfer
                // tears further than a small one.
                gr.scale.set(e7.value * 140 * txInf + 20, 1, 1);
                gr.position.set(gx, gy, 2);
                (gr.material as THREE.MeshBasicMaterial).opacity = 0.4 * txInf;
                grIdx++;
            }
        }
        for (let i = grIdx; i < 20; i++) glitchRects[i].visible = false;

        stage.render();
    }

    animate();

    stage.onResize(() => ticker7.resize());

    return {
        name: "Geometry", key: "7",
        destroy: () => {
            destroyed = true; cancelAnimationFrame(rafId);
            pick7.dispose();
            rays7.dispose(); marks7.dispose(); floor7.dispose();
            motes7.dispose(); tags7.dispose(); ticker7.destroy();
            stage.destroy();
        }
    };
}
