// s9Hashing.ts — slot 9 · Hashing · MUESTRAS · stage 6/6 OPAQUE
import * as THREE from "three";
import type { ParliamentState } from "../parliament/parliamentStore";
import { getVizMotion, readVoteFlash, isAlarm } from "../vizMotion";
import { makeExcursionEmitter } from "../slotVoice";
import { makeResonatorBank } from "../resonators";
import { makeNodeField, makeTubeLinks, makeParticles, makeLabelField, makeCalm, attachPicker } from "../slotThree";
import { Viz, pickSpecies, showStage } from "../visualizationSwitcher";
import { INSTRUMENTS, SLOT_NOUNS, readInstrument, mountSlotField, lerp } from "./instruments";
import { makeSlotStage, makeKnobs } from "./stage";

// ─── Slot 9: Hashing ──────────────────────────────────────────────────────────
// Concept preserved: key column → hash → bucket column; bezier/jagged paths;
//   collision detection; CRT scanlines; glitch tears; text labels.
// Three.js: keys + buckets as wireframe boxes; paths as QuadraticBezierCurve lines;
//   scanlines as LineSegments.
// 20-knob mapping:
//   volume        → path + node alpha
//   pitchshift    → bucket vertical offset
//   timedilation  → hash drift speed
//   spectralshift → glitch path amplitude
//   spatialspread → column separation
//   texturedepth  → scanline density
//   atmospheremix → background fade
//   memoryfeed    → ghost persistence
//   harmonicrich  → collision path stroke weight
//   resonantbody  → bucket border weight
//   masteramp     → global brightness (hero param)
//   filtercutoff  → scanline brightness
//   noiselevel    → key box size jitter
//   noisefilt     → path midpoint jitter range
//   dronedepth    → origin node rotation speed
//   dronefade     → bucket text color warmth
//   dronespace    → vertical spread of buckets
//   dronemix      → teardown artifact count
//   delayfeedback → afterimage damp
//   txInfluence   → glitch probability + chromatic aberration + teardown artifacts
//   beatTempo     → hash mutation speed (hero param)

export function mountHashing(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(6);

    const stage = makeSlotStage(stageEl, "s9", {
        bloom: [0.5, 0.4, 0.5],
        afterimage: 0.84, chromatic: true,
        inst: INSTRUMENTS.s9,
        probe: () => (keyBoxes[0] ? keyBoxes[0].spin : 0),
    });
    const { W, H, renderer, scene, camera, controls, afterimage } = stage;
    const bloom = stage.bloom!;
    const chromatic = stage.chromatic!;
    const kn = makeKnobs();
    // Everything this slot draws hangs off one root group. That is what
    // makes the rebuild possible: depth is distributed across its children
    // and the whole world can be lifted or turned without touching the
    // camera, which now belongs to the viewer.
    const root9 = new THREE.Group();
    scene.add(root9);

    // Instrumental identity. Six slots, six voices of the engine, no
    // repeats — this one is mountHashing. The name was drawn into the scene as
    // a sprite; it is gone. The binding it announced is the real one and
    // survives: this slot reads inst9's band and its voice's onsets.
    const inst9 = INSTRUMENTS.s9;
    // The constellation backdrop for this slot, coloured by inst9's hue
    // and driven by its band. See mountSlotField.
    // ── The constellation stays HERE ──────────────────────────────────────
    // Of the five, this is where the field is not decoration. Slot 9 is the
    // sample voice, the recordings are from the bosque seco, and the roster in
    // animals.ts is the fauna of that same forest — so the figure of an animal
    // lights while its own clip runs (see the spotlight below). Nothing else
    // in the instrument can say that.
    const cfield = mountSlotField(stageEl, inst9, "__slot9Soneth", {}, false);
    // MUESTRAS. A recording is not struck — it is READ. Slow, nearly
    // undamped (0.995), so the motion here is a long traverse rather than a
    // decay: the visual equivalent of a play head crossing a buffer.
    const ring9 = makeResonatorBank({ n: 18, baseFreq: 0.0035, freqRatio: 1.03, damp: 0.995, spread: 0.6 });
    const emitCollision9 = makeExcursionEmitter("sample");

    const NUM_KEYS = 8, NUM_BUCKETS = 6;

    // ── Keys and buckets are cubes ───────────────────────────────────────
    // BoxGeometry(20,20,1) and (30,30,1): squares with a nominal thickness,
    // and one Mesh and material each. Real cubes in one instanced field, and
    // the keys are what the pointer can reach — a key is the thing you look up,
    // so it is the thing that should answer being pointed at.
    const keys9 = makeNodeField(root9, NUM_KEYS, 10, 2, { wireframe: true, opacity: 0.9 });
    keys9.count = NUM_KEYS;
    const pick9 = attachPicker(renderer.domElement, keys9.mesh, controls);
    const buckets9 = makeNodeField(root9, NUM_BUCKETS, 15, 2, { wireframe: true, opacity: 0.9 });
    buckets9.count = NUM_BUCKETS;
    // The old per-mesh transforms, kept as plain state: an instance has no
    // object to hold its own position and spin between frames.
    const keyBoxes = Array.from({ length: NUM_KEYS }, () => ({
        position: new THREE.Vector3(), scale: new THREE.Vector3(1, 1, 1), spin: 0,
    }));

    // ── The paths follow the keys into depth ──────────────────────────────
    //
    // The key boxes already sit on a RING that runs through z — that was the
    // point of the ring — and the bezier that maps a key to its bucket was
    // sampled with z hardcoded to 0 on every one of its twelve points. So the
    // one line whose whole job is to say "this key goes to that bucket" was
    // drawn on a plane neither the key nor the bucket was on.
    //
    // Both pools are tube chains now: twelve segments per path, with the z
    // interpolated from the key's own ring position to the bucket wall.
    // Collisions keep their separate pool so they can be thicker and hotter.
    const PATH_SEGS = 12;
    const paths9 = makeTubeLinks(root9, NUM_KEYS * PATH_SEGS, 0xc8ffe6, 0.55);
    const pathMat = paths9.material;
    const colls9 = makeTubeLinks(root9, NUM_KEYS * PATH_SEGS, 0xffaa00, 0.75);
    const collMat = colls9.material;
    const _t9a = new THREE.Vector3();
    const _t9b = new THREE.Vector3();
    // Each key's depth on the ring, written as the ring is laid out and read
    // by the path that leaves it.
    const keyZ = new Float32Array(NUM_KEYS);
    const _q9 = new THREE.Quaternion();
    const _e9 = new THREE.Euler();
    const _t9c = new THREE.Vector3();
    const motes9 = makeParticles(root9, 850, Math.max(W, H) * 1.5, 0xc8ffe6);
    // K0..K7 on the keys. Slot 9 keeps the species field as well, so these are
    // deliberately terse — the animal names are the text on this stage, and a
    // second full-length caption beside them would be two things shouting.
    // Console typography: tight, upright, bracketed like slot 5 because these
    // ARE channels — but smaller, since the animal names on this stage are the
    // text that should lead.
    const tags9 = makeLabelField(root9, NUM_KEYS, 0xa8d8ff, 11, {
        font: "500 24px ui-monospace, 'SF Mono', Menlo, monospace",
        tracking: 2,
        brackets: true,
    });
    const mix9Was = new Float32Array(NUM_KEYS).fill(-1);
    /** The mixer faders, in the order the keys are drawn. CC 42-49. */
    const MIX9 = ["drone", "pad", "kick", "perc", "dust", "sample", "corpus", "ultra"];
    const MIX9KEY = MIX9.map((n) => `mix:${n}`);
    /** When each key's caption was last rasterised (≤ 6 Hz, as on slot 5). */
    const mix9At = new Float64Array(NUM_KEYS);
    // The hash table's state, rewritten each frame rather than reallocated.
    const bucketHits = new Int32Array(NUM_BUCKETS);
    const mapTargets = new Int32Array(NUM_KEYS);
    const calm9 = makeCalm();

    // Arrowhead triangles
    const arrowMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < NUM_KEYS; i++) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
            0, 0, 0,  -10, -5, 0,  -10, 5, 0
        ]), 3));
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xc8ffe6, transparent: true }));
        root9.add(m);
        arrowMeshes.push(m);
    }

    // Scanlines
    const MAX_SCAN_LINES = 60;
    const scanPositions = new Float32Array(MAX_SCAN_LINES * 2 * 3);
    const scanGeo = new THREE.BufferGeometry();
    scanGeo.setAttribute("position", new THREE.BufferAttribute(scanPositions, 3));
    scanGeo.setDrawRange(0, 0);
    const scanMat = new THREE.LineBasicMaterial({ color: 0xc8ffe6, transparent: true });
    root9.add(new THREE.LineSegments(scanGeo, scanMat));

    // Tear rects pool
    const tearRects: THREE.Mesh[] = [];
    for (let i = 0; i < 16; i++) {
        const g = new THREE.PlaneGeometry(1, 3);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0 }));
        m.visible = false;
        root9.add(m);
        tearRects.push(m);
    }

    let rafId: number;
    let frame = 0;

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        const onset9 = cfield.drive(st);
        const sp9 = (window as any).__slot9Soneth ?? {};

        // Shared idle drift + vote flash. These six slots had NO vote channel
        // at all — no onState, no store subscription, no listener — so the top
        // of animate() is the only hook they have, and it is the same idiom
        // slots 1 and 3 already use.
        const vm9 = getVizMotion();
        const vf9 = readVoteFlash();

        // ── This slot's own instrument ───────────────────────────────────
        // level is the energy in ITS register of the master spectrum, env the
        // decaying attack of ITS last note. Reading the whole mix would make a
        // kick visual brighten because a bell rang; reading control values
        // (which is all these six ever did) makes it react to the intention
        // rather than to the sound.
        const au9 = readInstrument(inst9);
        // Stepped in TIME, not in frames. The bank's freqs are cycles per
        // frame, so an unscaled step runs the whole body 2.4x fast on a
        // 144 Hz panel — the same patch shaking on one display and
        // swinging on another. `speed` normalises against 60 Hz.
        ring9.step(calm9.dt * 60);
        if (onset9 > 0) {
            ring9.strike(onset9, au9.tone);
            cfield.field.strike(
                stageEl.clientWidth * 0.5, stageEl.clientHeight * 0.62, onset9 * 0.6);
            // ── The sky names what is sounding ───────────────────────────
            // 15_slot_voices.scd sends /voice/sample with index / bankSize, so
            // `tone` identifies WHICH recording is playing. The roster in
            // animals.ts is the fauna of the same forest those recordings come
            // from, so the figure of the animal lights up while its clip runs.
            //
            // Honest about what this is: the mapping is CONSISTENT, not
            // taxonomic — the same clip always lights the same animal, but
            // nothing in the corpus manifest says clip 37 is an ocelot. Making
            // it true would mean carrying the species on the wire from
            // ~sampleMeta, which is a change to the OSC payload and belongs in
            // its own commit.
            cfield.field.spotlight(Math.floor(au9.tone * 9), Math.min(1, onset9 * 1.3));
        }

        const { vol, pitchSh: pShift, tDil, specS, spatSp, texDep, atmMix, memFeed, harmR,
            resBody, masterA, filtC, noiseL, noiseF, droneD, dronFd, droneSpace, droneMix,
            delayFb, txInf, beatT } = kn.read(sp9);
        const consensus = st?.consensus ?? 0.5;

        afterimage.uniforms["damp"].value = lerp(0.80, 0.95, delayFb);
        chromatic.uniforms["amount"].value = txInf * 0.007;
        bloom.strength = lerp(0.14, 0.52, masterA);

        // Column positions — spatialSpread controls separation
        const colA_X = -W / 2 + W * lerp(0.3, 0.12, spatSp);
        const colB_X = -W / 2 + W * lerp(0.7, 0.88, spatSp);
        const spacingA = H / (NUM_KEYS + 1);
        const spacingB = H / (NUM_BUCKETS + 1);
        const bucketYOff = (pShift - 0.5) * 100 + (droneSpace - 0.5) * 60;

        // Stepped and read HERE, before the hash loop below uses it. The step
        // used to sit further down, next to the tube pools — which was fine
        // while nothing above it needed the chain, and is not now that the
        // mapping itself does.
        calm9.step("__slot9Soneth");
        const e9 = calm9.eth;
        const c9 = calm9.chain;

        // Compute hashes — the CHAIN drives the mapping now, not a noise walk
        bucketHits.fill(0);
        for (let i = 0; i < NUM_KEYS; i++) {
            // The single worst remaining shake in these five, and it was not
            // a position: every key's BUCKET was recomputed each frame, so at
            // 60 Hz the eight paths re-aimed sixty times a second and the whole
            // right-hand side boiled. A hash table does not rehash continuously
            // — it rehashes on an event. This is the same noise walk, but its
            // rate is now the bed's, so the mapping HOLDS long enough to be
            // read and changes when the engine does.
            // ── The hash is a hash now ────────────────────────────────────
            // This was a noise walk standing in for a hash function, on a slot
            // whose entire subject is hashing. The chain supplies a real one:
            // eth.hash is the block hash folded to 0-1 and eth.addr is the
            // counterparty's signature, so the mapping is a genuine function of
            // key and block — it holds for the whole block, and every key
            // re-maps together when a new one arrives, which is exactly what a
            // rehash is.
            const hash = Math.floor(
                (((e9.hash * 997 + e9.addr * 613 + i * 31) % 1) * NUM_BUCKETS)
            );
            const mapped = Math.max(0, Math.min(NUM_BUCKETS - 1, hash));
            mapTargets[i] = mapped;
            bucketHits[mapped]++;
        }
        // ── MUESTRAS speak ────────────────────────────────────────────────
        // A collision is the hash table's own failure and its most legible
        // event: two keys landing in one bucket. It sounds a field recording,
        // and WHICH bucket collided chooses which one — so the collision
        // pattern becomes the score rather than a decoration on top of it.
        let collided9 = 0;
        let firstColl9 = 0;
        for (let b = 0; b < NUM_BUCKETS; b++) {
            if (bucketHits[b] > 1) {
                if (collided9 === 0) firstColl9 = b;
                collided9++;
            }
        }
        emitCollision9(collided9, 0.35 + Math.min(1, collided9 / 5) * 0.5,
            NUM_BUCKETS > 1 ? firstColl9 / (NUM_BUCKETS - 1) : 0.5);

        // Update key boxes
        let pathIdx = 0, collIdx = 0;
        let trIdx = 0;
        // Which bucket the held key maps to, so the lookup lights its target.
        let heldBucket = -1;
        paths9.begin();
        colls9.begin();
        pick9.update(camera);
        for (let i = 0; i < NUM_KEYS; i++) {
            const yA = -H / 2 + (i + 1) * spacingA;
            const mapped = mapTargets[i];
            const yB = -H / 2 + (mapped + 1) * spacingB + bucketYOff;
            const isCollision = bucketHits[mapped] > 1;
            const spAct = st?.species?.[i % (st?.species?.length || 1)]?.activity ?? 0.5;

            // Key box position + rotation (droneDepth controls spin speed)
            const kbSize = 20 * (1 + noiseL * calm9.drift(i, 0) * 0.7
                * (0.4 + calm9.swell * 1.2))
                * (0.85 + c9.calldataN * 0.4 + c9.txEnv * 0.25);
            keyBoxes[i].position.set(colA_X, yA, 0);
            keyBoxes[i].scale.setScalar(kbSize / 20);
            // Idle drift added to the key-box spin, and a vote forces a
            // REHASH — the boxes jolt as if every key had just been assigned
            // a new bucket, which is this slot's own vocabulary.
            // MUESTRAS. The bucket table was a row; it is a RING in depth now,
            // and each key box sits on it. tone carries which of the seven
            // field recordings fired, so a howler and an aircraft land at
            // different places on the ring and the table shows you which.
            {
                const ang9 = (i / Math.max(1, keyBoxes.length)) * Math.PI * 2;
                const rad9 = W * 0.26 * (0.6 + au9.level * 0.9);
                // A play head, not an envelope. The bank is nearly undamped, so
                // what crosses the ring is a slow travelling bulge — the boxes
                // rise as the head reaches them and stay risen behind it, which
                // is what reading a buffer looks like from outside.
                const rz9 = ring9.value(i);
                keyBoxes[i].position.z = Math.cos(ang9) * rad9 + rz9 * 200 * au9.amp;
                // Kept so the path leaving this key can start where the key
                // actually is. Without it the bezier below had to assume z = 0.
                keyZ[i] = keyBoxes[i].position.z;
                keyBoxes[i].position.y += rz9 * 18;
                const sc9 = 1 + Math.abs(rz9) * 0.6;
                // On top of the chain's size (kbSize above), not instead of
                // it: this used to overwrite it, so calldata never showed.
                keyBoxes[i].scale.set(sc9, sc9, 1 + rz9 * 0.3).multiplyScalar(kbSize / 20);
            }
            keyBoxes[i].spin += 0.005 + droneD * 0.02 + vm9.speed * 0.02
              + (vf9 ? vf9.flash * 0.14 * (isAlarm(vf9.type) ? -1 : 1) : 0);
            // Touch. Hovering a key swells it and lights its path; holding one
            // pins it, which on a hash table is the honest gesture — a key is
            // looked UP, it is not dragged somewhere else. The bucket it maps
            // to brightens with it below.
            const hov9 = (i === pick9.hover);
            const grb9 = (i === pick9.grabbed);
            heldBucket = grb9 ? mapped : heldBucket;
            const t9 = grb9 ? 1.8 : hov9 ? 1.35 : 1;
            _e9.set(keyBoxes[i].spin * 0.5, keyBoxes[i].spin * 0.8, keyBoxes[i].spin);
            _q9.setFromEuler(_e9);
            keys9.setBox(i, keyBoxes[i].position,
                keyBoxes[i].scale.x * t9 * (20 / 15),
                keyBoxes[i].scale.y * t9 * (20 / 15),
                keyBoxes[i].scale.z * t9 * (20 / 15), _q9);
            keys9.tint(i, hov9 || grb9 ? 1 : 0.78, 1.0, hov9 || grb9 ? 0.4 : 0.9);
            // Each key IS a mixer channel: its name, its CC, and its live
            // level. `mix:<layer>` arrives on the slot's own mirror from
            // /mix/* — the same value the fader shows — so the table is a
            // picture of the console mapping layers to levels.
            {
                const lvl9 = sp9[MIX9KEY[i % MIX9.length]] ?? 0.5;
                const q = Math.round(lvl9 * 100) / 100;
                const now9 = performance.now();
                if (q !== mix9Was[i] && now9 - mix9At[i] > 160) {
                    mix9Was[i] = q;
                    mix9At[i] = now9;
                    tags9.text(i,
                        `${SLOT_NOUNS.s9.one(i)} CC${42 + (i % 8)} ${q.toFixed(2)}`);
                }
            }
            _t9c.set(keyBoxes[i].position.x - 30, keyBoxes[i].position.y,
                     keyBoxes[i].position.z);
            tags9.set(i, _t9c, (0.20 + vol * 0.5) * masterA * (hov9 || grb9 ? 1.8 : 1));

            // Path line (bezier sampled)
            const cx0 = colA_X + 20, cx1 = colB_X - 20;
            const midX = (cx0 + cx1) / 2;
            const jitterRange = noiseF * 40;
            // The key's z, from its place on the ring, and the bucket wall's.
            // The path now runs BETWEEN two depths instead of across one plane
            // that neither endpoint was on.
            const zKey = keyZ[i];
            const zBucket = 0;
            for (let s = 0; s <= PATH_SEGS; s++) {
                const t = s / PATH_SEGS;
                // A collision path wanders slowly off its own curve rather
                // than buzzing along it. Same idea throughout these five: the
                // deviation is what disagreement looks like, and looking like
                // something requires holding still long enough to be seen.
                const gj = calm9.drift(i * 17 + s, 1) * jitterRange * 0.55
                    * (isCollision ? (1 - consensus) * (1 + specS * 2 + txInf) : 0);
                // Quadratic bezier: P = (1-t)²·A + 2(1-t)t·M + t²·B
                const tt = t * t; const mt = 1 - t; const mt2 = mt * mt;
                const px = mt2 * cx0 + 2 * mt * t * midX + tt * cx1;
                const py = mt2 * yA  + 2 * mt * t * lerp(yA, yB, 0.5) + tt * yB + gj;
                // The curve bows OUT of the plane at its midpoint as well as
                // across it, so a lookup is an arc through the volume rather
                // than a slumped wire — which is also what keeps eight of them
                // legible instead of overlapping into one band.
                const pz = mt2 * zKey + 2 * mt * t * (lerp(zKey, zBucket, 0.5) + 90 * Math.sin(Math.PI * t))
                    + tt * zBucket;
                _t9b.set(px, py, pz);
                if (s > 0) {
                    if (isCollision) {
                        colls9.add(_t9a, _t9b, 0.7 + harmR * 1.1);
                        collIdx++;
                    } else {
                        paths9.add(_t9a, _t9b, 0.4 + harmR * 0.7);
                        pathIdx++;
                    }
                }
                _t9a.copy(_t9b);
            }

            // Arrowhead
            const arrow = arrowMeshes[i];
            arrow.position.set(colB_X - 20, yB, 1);
            arrow.scale.setScalar(1 + spAct * 0.5);
            (arrow.material as THREE.MeshBasicMaterial).color.setRGB(
                isCollision ? 1.0 : 0.78,
                isCollision ? 0.67 : 1.0,
                isCollision ? 0.0 : 0.9
            );
            (arrow.material as THREE.MeshBasicMaterial).opacity = (0.7 + vol * 0.3) * masterA;

            // Tear rects from txInfluence + dronemix
            const tearCount = Math.floor(droneMix * 3 + 1);
            for (let k = 0; k < tearCount && trIdx < 16; k++) {
                // A tear IS a transaction. It happens when one arrives, it
                // falls where that transaction's own counterparty signature
                // puts it, and it is as long as the value that moved. Nothing
                // here is invented any more.
                if (txInf > 0.3 && e9.pulse > 0.05
                    && Math.abs(e9.addr - (i + 0.5) / NUM_KEYS) < 0.14) {
                    const tearX = lerp(colA_X, colB_X, e9.index);
                    const tearY = lerp(yA, yB, e9.nonce);
                    const tr = tearRects[trIdx];
                    tr.visible = true;
                    tr.scale.set(e9.value * 140 * txInf + 20,
                        1 + e9.calldata * 4, 1);
                    tr.position.set(tearX, tearY, 2);
                    (tr.material as THREE.MeshBasicMaterial).opacity = 0.5 * txInf * masterA;
                    trIdx++;
                }
            }
        }
        for (let i = trIdx; i < 16; i++) tearRects[i].visible = false;

        paths9.end();
        pathMat.opacity = (0.20 + vol * 0.34) * masterA;

        colls9.end();
        collMat.opacity = (0.26 + vol * 0.30) * masterA;
        // HARMONICS used to set collMat.linewidth here, which ANGLE clamps to
        // 1 px — the control was inert. It is the tube RADIUS now, above.

        // Bucket boxes
        for (let j = 0; j < NUM_BUCKETS; j++) {
            const yB = -H / 2 + (j + 1) * spacingB + bucketYOff;
            const isCollision = bucketHits[j] > 1;
            let bx = colB_X, by = yB;
            if (isCollision) {
                bx += calm9.drift(j * 3, 0) * 7 * (1 - consensus) * (1 + specS * 0.6);
                by += calm9.drift(j * 7, 1) * 7 * (1 - consensus);
            }
            // A bucket holding more is DEEPER. That is the one thing the flat
            // squares could not say, and it is the whole subject of a hash
            // table: how many keys landed here.
            const fill = Math.min(1, bucketHits[j] / 3);
            const lit9 = (j === heldBucket);
            _t9c.set(bx, by, -fill * 40);
            buckets9.setBox(j,
                _t9c,
                (1 + resBody * 0.5) * (lit9 ? 1.3 : 1),
                (1 + resBody * 0.5) * (lit9 ? 1.3 : 1),
                (1 + resBody * 0.5) * (1 + fill * 2.4),
                undefined);
            const dR = lerp(0.78, 1.0, dronFd); const dG = lerp(1.0, 0.67, dronFd);
            buckets9.tint(j,
                isCollision || lit9 ? 1.0 : dR,
                isCollision ? 0.67 : lit9 ? 1.0 : dG,
                lit9 ? 0.6 : 0);
        }
        buckets9.mesh.material.opacity = (0.18 + vol * 0.40) * masterA * 0.75;
        buckets9.commit();

        // The air runs along the ring the keys sit on. DRONE MIX sets the
        // flow, GIRO AUTO the swirl, PITCH SHIFT the lift.
        motes9.step(1 / 60,
            (droneMix - 0.5) * 60 + Math.sin(c9.blockPhase * Math.PI * 2) * 26,
            vm9.rotation * 0.08 + c9.turn * 0.018,
            (pShift - 0.5) * 24);
        motes9.material.opacity = (0.08 + texDep * 0.24) * masterA;
        motes9.material.size = Math.max(W, H) * (0.0012 + resBody * 0.0032);
        root9.rotation.y = vm9.angle * c9.turn * (0.45 + c9.fullness * 0.35);
        keys9.mesh.material.opacity = (0.32 + vol * 0.26) * masterA
            * (0.72 + c9.gasN * 0.45 + c9.blockEnv * 0.22);
        keys9.commit();

        // Scanlines — textureDepth controls density, filtercutoff brightness
        const scanStep = Math.floor(lerp(10, 3, texDep));
        let scIdx = 0;
        // Deterministic spacing: a new random gap every frame made the scan
        // lines jump rather than scroll.
        for (let y = -H / 2; y < H / 2 && scIdx < MAX_SCAN_LINES;
             y += scanStep + 3 + calm9.drift(scIdx, 0) * 3) {
            scanPositions[scIdx * 6]     = -W / 2; scanPositions[scIdx * 6 + 1] = y; scanPositions[scIdx * 6 + 2] = -2;
            scanPositions[scIdx * 6 + 3] =  W / 2; scanPositions[scIdx * 6 + 4] = y; scanPositions[scIdx * 6 + 5] = -2;
            scIdx++;
        }
        scanGeo.setDrawRange(0, scIdx * 2);
        scanGeo.attributes.position.needsUpdate = true;
        scanMat.opacity = (vol * 0.08 + texDep * 0.12 + filtC * 0.06) * masterA;

        stage.render();
    }

    animate();

    return {
        name: "Hashing", key: "9",
        destroy: () => {
            cfield.destroy();
            destroyed = true; cancelAnimationFrame(rafId);
            pick9.dispose();
            keys9.dispose(); buckets9.dispose();
            paths9.dispose(); colls9.dispose();
            motes9.dispose(); tags9.dispose();
            stage.destroy();
        }
    };
}
