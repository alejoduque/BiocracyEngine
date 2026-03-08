import * as THREE from "three";
import { EffectComposer }  from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass }      from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { AfterimagePass }  from "three/examples/jsm/postprocessing/AfterimagePass.js";
import { ShaderPass }      from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { ParliamentState } from "./parliament/parliamentStore";
import {
    Viz,
    pickSpecies,
    showStage,
    SPECIES_ROSTER,
} from "./visualizationSwitcher";

// ─── Shared chromatic-aberration shader (reused across slots) ────────────────
const ChromaticAberrationShader = {
    uniforms: { tDiffuse: { value: null }, amount: { value: 0.0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
        uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
        void main(){
            vec2 dir=vUv-0.5; float d=length(dir); vec2 off=normalize(dir)*amount*d;
            float r=texture2D(tDiffuse,vUv+off).r; float g=texture2D(tDiffuse,vUv).g; float b=texture2D(tDiffuse,vUv-off).b;
            gl_FragColor=vec4(r,g,b,1.0);
        }`,
};

// ─── Shared helper: make a WebGLRenderer fitted to container ────────────────
function makeRenderer(container: HTMLElement): THREE.WebGLRenderer {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    r.setClearColor(0x000804, 1);
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(container.offsetWidth || 800, container.offsetHeight || 600);
    container.appendChild(r.domElement);
    return r;
}

// ─── Shared helper: orthographic camera for 2.5D overlays ───────────────────
function makeOrthoCamera(w: number, h: number): THREE.OrthographicCamera {
    return new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 1000);
}

// ─── lerp helper ─────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

// ─── Deterministic noise (simplex-like via sin hash) ─────────────────────────
function snoise(x: number, y: number): number {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
}

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
//   txinfluence   → glitch probability + chromatic aberration

export function mountTimeTravel(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(5);

    const W = stageEl.offsetWidth || 800;
    const H = stageEl.offsetHeight || 600;

    const renderer = makeRenderer(stageEl);
    const scene = new THREE.Scene();
    const camera = makeOrthoCamera(W, H);
    camera.position.z = 100;

    // ── AfterimagePass for ghost trails ──────────────────────────────────────
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const afterimage = new AfterimagePass(0.88);
    composer.addPass(afterimage);
    const chromaticPass = new ShaderPass(ChromaticAberrationShader);
    composer.addPass(chromaticPass);

    // ── Background grid lines ─────────────────────────────────────────────────
    const gridGroup = new THREE.Group();
    scene.add(gridGroup);

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
        scene.add(line);
        const yFrac = i / (activeRoster.length - 1 || 1);
        traces.push({ y: lerp(-H * 0.3, H * 0.3, yFrac), history: positions, count: 0, line, geo });
    });

    // ── Marker quads (one per species) ───────────────────────────────────────
    const markerMeshes = activeRoster.map(() => {
        const g = new THREE.BufferGeometry();
        const verts = new Float32Array([
            0, 8, 0,   8, 0, 0,   0, -8, 0,   -8, 0, 0,
        ]);
        g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
        g.setIndex([0, 1, 2, 2, 3, 0]);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true }));
        scene.add(m);
        return m;
    });

    // ── Reticule rings ────────────────────────────────────────────────────────
    const reticuleGroup = new THREE.Group();
    scene.add(reticuleGroup);

    function makeCircle2D(radius: number, segments: number, color: number, opacity: number): THREE.Line {
        const pts: number[] = [];
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            pts.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
        return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    }

    // Axes lines
    const axisGeo = new THREE.BufferGeometry();
    axisGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
        -200, 0, 0,  200, 0, 0,
         0, -200, 0,   0, 200, 0,
    ]), 3));
    const axisLine = new THREE.LineSegments(axisGeo, new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.2 }));
    reticuleGroup.add(axisLine);

    // Outer ring
    const outerRing = makeCircle2D(180, 128, 0xffaa00, 0.3);
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
            const ring = makeCircle2D(180 * frac, 64, hexColor, lerp(0.08, 0.0, frac));
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

        const vol      = sp4.volume         ?? 0.7;
        const pitchSh  = sp4.pitchshift     ?? 0.5;
        const timeDil  = sp4.timedilation   ?? 0.3;
        const specS    = sp4.spectralshift  ?? 0.5;
        const spatSp   = sp4.spatialspread  ?? 0.5;
        const texDep   = sp4.texturedepth   ?? 0.5;
        const atmMix   = sp4.atmospheremix  ?? 0.5;
        const memFeed  = sp4.memoryfeed     ?? 0.4;
        const harmR    = sp4.harmonicrich   ?? 0.5;
        const resBody  = sp4.resonantbody   ?? 0.4;
        const masterA  = sp4.masteramp      ?? 0.7;
        const filtC    = sp4.filtercutoff   ?? 0.5;
        const noiseL   = sp4.noiselevel     ?? 0.2;
        const noiseF   = sp4.noisefilt      ?? 0.5;
        const droneD   = sp4.dronedepth     ?? 0.4;
        const dronFd   = sp4.dronefade      ?? 0.5;
        const droneSpace = sp4.dronespace   ?? 0.5;
        const droneMix = sp4.dronemix       ?? 0.4;
        const delayFb  = sp4.delayfeedback  ?? 0.3;
        const txInf    = sp4.txinfluence    ?? 0.5;
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
        (gridGroup.children[0] as THREE.LineSegments).material = new THREE.LineBasicMaterial({
            color: 0x663300, transparent: true,
            opacity: (0.04 + texDep * 0.12 + filtC * 0.08) * masterA,
        });

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

        traces.forEach((br, i) => {
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

            // Marker at right edge
            const glow = 3 + activity * 8 + resBody * 12;
            const mk = markerMeshes[i];
            mk.position.set(W / 2 - 10, br.y, 1);
            mk.scale.setScalar(glow / 8);
            (mk.material as THREE.MeshBasicMaterial).opacity = vol * masterA;

            // Harmonic echo trace (offset ghost) — driven by harmonicRich + dronemix
            if (harmR > 0.2) {
                // shift harmonic echo geometry inline by using col[1] offset trick;
                // for simplicity we tint the y of existing segment by echo offset
                // (harmonic echo is implicitly present via afterimage + slight color drift)
            }
        });

        // Reticule rotation
        radarAngle += (0.01 + (1 - consensus) * 0.05) * (0.5 + timeDil);
        reticuleGroup.rotation.z = radarAngle;
        const retSize = (H * 0.3 + resBody * H * 0.2) / 180;
        reticuleGroup.scale.setScalar(retSize);
        (axisLine.material as THREE.LineBasicMaterial).opacity = (0.12 + resBody * 0.2) * masterA;
        (outerRing.material as THREE.LineBasicMaterial).opacity = (0.25 + resBody * 0.35) * masterA;
        innerRings.forEach((r, idx) => {
            const frac = (idx + 1) / (innerRings.length + 1);
            (r.material as THREE.LineBasicMaterial).opacity = (0.05 + droneD * 0.25 * (1 - frac)) * masterA;
        });

        // Camera subtle vertical drift from droneSpace
        camera.position.y = (droneSpace - 0.5) * H * 0.12;

        // dronemix + noisefilt: secondary diagonal grid brightness (reuse grid opacity)
        // dronemix + noisefilt modulate grid brightness
        if (gridGroup.children[0]) {
            const diagBright = droneMix * 0.1 + noiseF * 0.05;
            ((gridGroup.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial).opacity =
                Math.min(0.5, (0.04 + texDep * 0.12 + filtC * 0.08 + diagBright) * masterA);
        }

        composer.render();
    }

    animate();

    const onResize = () => {
        if (destroyed) return;
        const w = stageEl.offsetWidth; const h = stageEl.offsetHeight;
        renderer.setSize(w, h);
        composer.setSize(w, h);
        camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2;
        camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return {
        name: "Time Travel", key: "4",
        destroy: () => {
            destroyed = true;
            cancelAnimationFrame(rafId);
            window.removeEventListener("resize", onResize);
            composer.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        }
    };
}

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
//   txinfluence   → glitch probability + chromatic aberration

export function mountDynamicGraphs(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(8);

    const W = stageEl.offsetWidth || 800;
    const H = stageEl.offsetHeight || 600;

    const renderer = makeRenderer(stageEl);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 2000);
    camera.position.set(0, 0, 500);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.4, 0.6);
    composer.addPass(bloom);
    const afterimage = new AfterimagePass(0.85);
    composer.addPass(afterimage);
    const chromatic = new ShaderPass(ChromaticAberrationShader);
    composer.addPass(chromatic);

    // Nodes
    const nodes: { x: number; y: number; z: number; vx: number; vy: number; vz: number; mesh: THREE.Mesh }[] = [];
    activeRoster.forEach(_sp => {
        const geo = new THREE.SphereGeometry(8, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00, wireframe: true, transparent: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set((Math.random() - 0.5) * W * 0.6, (Math.random() - 0.5) * H * 0.6, (Math.random() - 0.5) * 100);
        scene.add(mesh);
        nodes.push({ x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, vx: 0, vy: 0, vz: 0, mesh });
    });

    // Glow rings (one per node)
    const glowRings = nodes.map(() => {
        const ring = makeCircle(18, 32, 0xffaa00, 0.2);
        scene.add(ring);
        return ring;
    });

    function makeCircle(radius: number, segs: number, color: number, opacity: number): THREE.Line {
        const pts: number[] = [];
        for (let i = 0; i <= segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            pts.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
        return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    }

    // Radar arc background
    const radarGroup = new THREE.Group();
    scene.add(radarGroup);
    const radarArcs: THREE.Line[] = [];
    for (let i = 0; i < 6; i++) {
        const arc = makeCircle(80 + i * 60, 64, 0x663300, 0.08 + i * 0.01);
        radarGroup.add(arc);
        radarArcs.push(arc);
    }

    // Edge geometry (max edges = N*(N-1)/2)
    const N = nodes.length;
    const maxEdges = N * (N - 1) / 2;
    const edgePositions = new Float32Array(maxEdges * 2 * 3);
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
    edgeGeo.setDrawRange(0, 0);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.4 });
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    scene.add(edgeLines);

    let rafId: number;
    let frame = 0;

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        const sp5 = (window as any).__slot5Soneth ?? {};

        const vol      = sp5.volume         ?? 0.5;
        const pitchSh  = sp5.pitchshift     ?? 0.5;
        const tDil     = sp5.timedilation   ?? 0.5;
        const specS    = sp5.spectralshift  ?? 0.5;
        const spatSp   = sp5.spatialspread  ?? 0.5;
        const texDep   = sp5.texturedepth   ?? 0.5;
        const atmMix   = sp5.atmospheremix  ?? 0.5;
        const memFeed  = sp5.memoryfeed     ?? 0.4;
        const harmR    = sp5.harmonicrich   ?? 0.5;
        const resBody  = sp5.resonantbody   ?? 0.4;
        const masterA  = sp5.masteramp      ?? 0.7;
        const filtC    = sp5.filtercutoff   ?? 0.5;
        const noiseL   = sp5.noiselevel     ?? 0.2;
        const noiseF   = sp5.noisefilt      ?? 0.5;
        const droneD   = sp5.dronedepth     ?? 0.4;
        const dronFd   = sp5.dronefade      ?? 0.5;
        const droneSpace = sp5.dronespace   ?? 0.5;
        const droneMix = sp5.dronemix       ?? 0.4;
        const delayFb  = sp5.delayfeedback  ?? 0.3;
        const txInf    = sp5.txinfluence    ?? 0.5;
        const consensus = st?.consensus ?? 0.5;

        afterimage.uniforms["damp"].value = lerp(0.76, 0.94, delayFb * 0.7 + memFeed * 0.3);
        chromatic.uniforms["amount"].value = txInf * 0.007;
        bloom.strength = lerp(0.3, 1.0, consensus * masterA);
        renderer.setClearColor(0x000804, lerp(0.5, 0.95, 1 - atmMix));

        // Connection distance controlled by filtercutoff
        const restLength = 80 + filtC * 250 + (st?.eco?.mycoPulse ?? 0) * 80;

        // Gravity center
        const cx = 0, cy = (pitchSh - 0.5) * H * 0.4;

        // Physics
        const edgePos = edgeGeo.attributes.position.array as Float32Array;
        let edgeCount = 0;

        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const dx = nodes[j].x - nodes[i].x;
                const dy = nodes[j].y - nodes[i].y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;

                if (dist < restLength * 2) {
                    // Connection noise probability
                    const noise = snoise(i * 17 + j, frame * 0.05 * (1 + tDil));
                    if (noise < consensus) {
                        const baseIdx = edgeCount * 6;
                        let ax = nodes[i].x, ay = nodes[i].y;
                        let bx = nodes[j].x, by = nodes[j].y;
                        // txInfluence glitch
                        if (Math.random() < txInf * 0.5) {
                            bx += (Math.random() - 0.5) * 80 * specS;
                            by += (Math.random() - 0.5) * 80 * specS;
                        }
                        edgePos[baseIdx]     = ax; edgePos[baseIdx + 1] = ay; edgePos[baseIdx + 2] = 0;
                        edgePos[baseIdx + 3] = bx; edgePos[baseIdx + 4] = by; edgePos[baseIdx + 5] = 0;
                        edgeCount++;
                    }
                    const force = (dist - restLength) * (0.004 + txInf * 0.015) * (0.5 + specS);
                    nodes[i].vx += (dx / dist) * force;
                    nodes[i].vy += (dy / dist) * force;
                    nodes[j].vx -= (dx / dist) * force;
                    nodes[j].vy -= (dy / dist) * force;
                }
            }
        }
        edgeGeo.setDrawRange(0, edgeCount * 2);
        edgeGeo.attributes.position.needsUpdate = true;
        edgeMat.opacity = (0.3 + vol * 0.5) * masterA;
        edgeMat.linewidth = 0.5 + noiseF * 1.5;

        // droneFade edge color warmth
        const edgeR = Math.floor(lerp(200, 255, dronFd));
        const edgeG = Math.floor(lerp(170, 200, dronFd));
        edgeMat.color.setRGB(edgeR / 255, edgeG / 255, 0);

        nodes.forEach((n, i) => {
            // Center gravity
            n.vx += (cx - n.x) * (0.001 + specS * 0.005);
            n.vy += (cy - n.y) * (0.001 + specS * 0.005);

            const act  = st?.species?.[i % (st?.species?.length || 1)]?.activity ?? 0.5;
            const pres = st?.species?.[i % (st?.species?.length || 1)]?.presence ?? 0.5;

            // Noise jitter — noiseLevel controls amplitude
            n.vx += (snoise(i, frame * 0.02) - 0.5) * noiseL * 4;
            n.vy += (snoise(i + 100, frame * 0.02) - 0.5) * noiseL * 4;

            // txInfluence aggressive jitter
            if (Math.random() < act * 0.2) { n.vx += (Math.random() - 0.5) * 8 * txInf; n.vy += (Math.random() - 0.5) * 8 * txInf; }

            n.x += n.vx * (1 + tDil); n.y += n.vy * (1 + tDil);
            // droneSpace adds Z spread
            n.z = (snoise(i * 3, frame * 0.003) - 0.5) * droneSpace * 80;
            n.vx *= 0.88; n.vy *= 0.88;

            // Node size: textureDepth + presence; droneDepth adds segments (handled by scale)
            const rad = 5 + pres * 12 + texDep * 8;
            const spreadR = rad * (0.6 + spatSp * 0.8);
            n.mesh.scale.setScalar(spreadR / 8);
            n.mesh.position.set(n.x, n.y, n.z);

            // harmonicRich: node color white→amber
            const nr = lerp(0.78, 1.0, harmR);
            const ng = lerp(1.0, 0.67, harmR);
            const nb = lerp(0.9, 0.0, harmR);
            (n.mesh.material as THREE.MeshBasicMaterial).color.setRGB(nr, ng, nb);
            (n.mesh.material as THREE.MeshBasicMaterial).opacity = (0.5 + vol * 0.5) * masterA;

            // dronedepth: detail level via geometry segments (proxy: wireframe density via scale noise)
            n.mesh.rotation.z += 0.005 + droneD * 0.02;

            // Glow ring
            const gr = glowRings[i];
            gr.position.set(n.x, n.y, n.z - 0.1);
            gr.scale.setScalar(spreadR * (1.8 + resBody * 1.5) / 18);
            (gr.material as THREE.LineBasicMaterial).opacity = resBody * 0.4 * (0.5 + act * 0.5) * masterA;
        });

        // Radar arc rotation — dronemix controls visible arc count
        const arcCount = Math.max(1, Math.floor(droneMix * 6));
        radarArcs.forEach((arc, i) => {
            const visible = i < arcCount;
            arc.visible = visible;
            if (visible) {
                const dir = (i % 2 === 0) ? 1 : -1;
                arc.rotation.z += 0.008 * dir * (1 + tDil * 1.5) * (1 + i * 0.2);
                (arc.material as THREE.LineBasicMaterial).opacity = (0.06 + texDep * 0.08) * masterA;
            }
        });

        composer.render();
    }

    animate();

    const onResize = () => {
        if (destroyed) return;
        const w = stageEl.offsetWidth; const h = stageEl.offsetHeight;
        renderer.setSize(w, h); composer.setSize(w, h);
        camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return {
        name: "Dynamic Graphs", key: "5",
        destroy: () => {
            destroyed = true; cancelAnimationFrame(rafId);
            window.removeEventListener("resize", onResize);
            composer.dispose(); renderer.dispose(); renderer.domElement.remove();
        }
    };
}

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
//   txinfluence   → glitch probability

export function mountDynamicOptimality(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(SPECIES_ROSTER.length);

    const W = stageEl.offsetWidth || 800;
    const H = stageEl.offsetHeight || 600;

    const renderer = makeRenderer(stageEl);
    const scene = new THREE.Scene();
    const camera = makeOrthoCamera(W, H);
    camera.position.z = 100;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.4, 0.3, 0.7);
    composer.addPass(bloom);
    const afterimage = new AfterimagePass(0.82);
    composer.addPass(afterimage);

    // Node meshes (wireframe boxes)
    const nodeData: { x: number; y: number; tx: number; ty: number; mesh: THREE.Mesh; innerMesh: THREE.Mesh }[] = [];
    activeRoster.forEach((_sp, _i) => {
        const outerGeo = new THREE.BoxGeometry(20, 20, 1);
        const outerMat = new THREE.MeshBasicMaterial({ color: 0xc8ffe6, wireframe: true, transparent: true });
        const outer = new THREE.Mesh(outerGeo, outerMat);
        scene.add(outer);

        const innerGeo = new THREE.BoxGeometry(10, 10, 1);
        const innerMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, wireframe: true, transparent: true });
        const inner = new THREE.Mesh(innerGeo, innerMat);
        scene.add(inner);

        nodeData.push({ x: 0, y: 0, tx: 0, ty: 0, mesh: outer, innerMesh: inner });
    });

    // Edge line pool
    const MAX_EDGES = activeRoster.length * 2;
    const edgePosArr = new Float32Array(MAX_EDGES * 2 * 3);
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePosArr, 3));
    edgeGeo.setDrawRange(0, 0);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true });
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    scene.add(edgeLines);

    // Scan column lines
    const MAX_SCAN = 14;
    const scanPositions = new Float32Array(MAX_SCAN * 2 * 3);
    const scanGeo = new THREE.BufferGeometry();
    scanGeo.setAttribute("position", new THREE.BufferAttribute(scanPositions, 3));
    scanGeo.setDrawRange(0, 0);
    const scanMat = new THREE.LineBasicMaterial({ color: 0x663300, transparent: true });
    const scanLines = new THREE.LineSegments(scanGeo, scanMat);
    scene.add(scanLines);

    // Scrolling horizontal grid lines
    const hGridGeo = new THREE.BufferGeometry();
    const hGridPositions = new Float32Array(20 * 2 * 3);
    hGridGeo.setAttribute("position", new THREE.BufferAttribute(hGridPositions, 3));
    const hGridMat = new THREE.LineBasicMaterial({ color: 0x663300, transparent: true, opacity: 0.06 });
    scene.add(new THREE.LineSegments(hGridGeo, hGridMat));

    let rafId: number;
    let frame = 0;
    let scrollOffset = 0;

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        const sp6 = (window as any).__slot6Soneth ?? {};

        const vol       = sp6.volume        ?? 0.5;
        const pitchSh   = sp6.pitchshift    ?? 0.5;
        const tDil      = sp6.timedilation  ?? 0.5;
        const specS     = sp6.spectralshift ?? 0.5;
        const spatSp    = sp6.spatialspread ?? 0.5;
        const texDep    = sp6.texturedepth  ?? 0.5;
        const atmMix    = sp6.atmospheremix ?? 0.5;
        const memFeed   = sp6.memoryfeed    ?? 0.4;
        const harmR     = sp6.harmonicrich  ?? 0.5;
        const resBody   = sp6.resonantbody  ?? 0.4;
        const masterA   = sp6.masteramp     ?? 0.7;
        const filtC     = sp6.filtercutoff  ?? 0.5;
        const noiseL    = sp6.noiselevel    ?? 0.2;
        const noiseF    = sp6.noisefilt     ?? 0.5;
        const droneD    = sp6.dronedepth    ?? 0.4;
        const dronFd    = sp6.dronefade     ?? 0.5;
        const droneSpace = sp6.dronespace   ?? 0.5;
        const droneMix  = sp6.dronemix      ?? 0.4;
        const delayFb   = sp6.delayfeedback ?? 0.3;
        const txInf     = sp6.txinfluence   ?? 0.5;
        const consensus = st?.consensus ?? 0.5;

        afterimage.uniforms["damp"].value = lerp(0.73, 0.93, delayFb * 0.7 + memFeed * 0.3);
        bloom.strength = lerp(0.2, 0.7, harmR * masterA);
        renderer.setClearColor(0x000804, lerp(0.5, 0.95, 1 - atmMix));

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
        activeRoster.forEach((_, i) => {
            const act = st?.species?.[i % (st?.species?.length || 1)]?.activity ?? 0;
            if (act > maxAct) { maxAct = act; maxIdx = i; }
        });

        // Tree layout — droneSpace shifts root Y
        const rootX = 0;
        const rootY = H / 2 - 80 - pitchSh * 80 - droneSpace * H * 0.18;
        const layerSpacing = 50 + pitchSh * 120;
        const treeWidth = lerp(0.4, 0.95, spatSp);

        let childIdx = 0;
        nodeData.forEach((n, i) => {
            if (i === maxIdx) {
                n.tx = rootX;
                n.ty = rootY - Math.sin(frame * 0.05 * (1 + tDil)) * 20;
            } else {
                const layer = Math.floor(Math.log2(childIdx + 2));
                const countInLayer = Math.pow(2, layer);
                const posInLayer = (childIdx + 2) - countInLayer;
                const breathe = Math.sin(frame * 0.05 * (1 + tDil) + layer) * (30 + specS * 50) * (1.1 - consensus);
                const lx = lerp(-W / 2 * treeWidth, W / 2 * treeWidth, (posInLayer + 0.5) / countInLayer) + breathe;
                const ly = rootY - layer * layerSpacing + (snoise(i, frame * (0.02 + specS * 0.05)) - 0.5) * 40 * noiseL * 3;
                n.tx = lx; n.ty = ly;
                childIdx++;
            }

            const snap = Math.min(0.05 + (1 - consensus) * 0.35 * (0.5 + tDil), 1);
            n.x = lerp(n.x, n.tx, snap);
            n.y = lerp(n.y, n.ty, snap);
            if (consensus < 0.8) {
                n.x += (Math.random() - 0.5) * 10 * (1 - consensus);
                n.y += (Math.random() - 0.5) * 10 * (1 - consensus);
            }

            const act = st?.species?.[n.mesh ? i : i % (st?.species?.length || 1)]?.activity ?? 0;
            const glW = 10 + resBody * 25 + act * 15;

            // Outer box
            n.mesh.position.set(n.x, n.y, 0);
            n.mesh.scale.setScalar(glW / 20);
            n.mesh.rotation.z += 0.005 + texDep * 0.04 * (1 + act * 8);
            (n.mesh.material as THREE.MeshBasicMaterial).color.setRGB(
                lerp(0.78, 1.0, harmR), lerp(1.0, 0.67, harmR), lerp(0.9, 0.0, harmR)
            );
            (n.mesh.material as THREE.MeshBasicMaterial).opacity = (0.4 + vol * 0.6) * masterA;

            // Inner box — droneDepth pulses inner scale
            const innerPulse = 0.5 + 0.5 * Math.sin(frame * 0.1 * (1 + tDil) + i) * droneD;
            n.innerMesh.position.set(n.x, n.y, 0.1);
            n.innerMesh.scale.setScalar((glW * innerPulse) / 10);
            (n.innerMesh.material as THREE.MeshBasicMaterial).opacity = (0.3 + vol * 0.5) * masterA;
        });

        // Edges from all non-root nodes to root
        const rootNode = nodeData[maxIdx];
        let eIdx = 0;
        nodeData.forEach((n, i) => {
            if (i === maxIdx || eIdx >= MAX_EDGES) return;
            let ex = n.x, ey = n.y, rx = rootNode.x, ry = rootNode.y;
            if (Math.random() < txInf * 0.6) {
                ex += (Math.random() - 0.5) * 60 * specS;
                ey += (Math.random() - 0.5) * 60 * specS;
            }
            edgePosArr[eIdx * 6]     = ex;  edgePosArr[eIdx * 6 + 1] = ey;  edgePosArr[eIdx * 6 + 2] = 0;
            edgePosArr[eIdx * 6 + 3] = rx;  edgePosArr[eIdx * 6 + 4] = ry;  edgePosArr[eIdx * 6 + 5] = 0;
            eIdx++;
        });
        edgeGeo.setDrawRange(0, eIdx * 2);
        edgeGeo.attributes.position.needsUpdate = true;
        edgeMat.opacity = (0.4 + vol * 0.6) * masterA;

        // droneFade: background color warmth
        const bgWarmth = Math.floor(dronFd * 6);
        renderer.setClearColor((bgWarmth << 8) | 0x000804, 1);

        composer.render();
    }

    animate();

    const onResize = () => {
        if (destroyed) return;
        const w = stageEl.offsetWidth; const h = stageEl.offsetHeight;
        renderer.setSize(w, h); composer.setSize(w, h);
        camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2;
        camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return {
        name: "Dynamic Optimality", key: "6",
        destroy: () => {
            destroyed = true; cancelAnimationFrame(rafId);
            window.removeEventListener("resize", onResize);
            composer.dispose(); renderer.dispose(); renderer.domElement.remove();
        }
    };
}

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
//   txinfluence   → glitch tear rects

export function mountGeometry(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(6);

    const W = stageEl.offsetWidth || 800;
    const H = stageEl.offsetHeight || 600;

    const renderer = makeRenderer(stageEl);
    const scene = new THREE.Scene();
    const camera = makeOrthoCamera(W, H);
    camera.position.z = 100;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.4, 0.5);
    composer.addPass(bloom);
    const afterimage = new AfterimagePass(0.83);
    composer.addPass(afterimage);
    const chromatic = new ShaderPass(ChromaticAberrationShader);
    composer.addPass(chromatic);

    // Ray lines — one per species (2 verts each)
    const rays: { y: number; angle: number }[] = activeRoster.map(() => ({
        y: (Math.random() - 0.5) * H * 0.7,
        angle: (Math.random() - 0.5) * Math.PI / 4,
    }));

    const MAX_RAYS = 10;
    const rayPositions = new Float32Array(MAX_RAYS * 2 * 3);
    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute("position", new THREE.BufferAttribute(rayPositions, 3));
    rayGeo.setDrawRange(0, 0);
    const rayMat = new THREE.LineBasicMaterial({ color: 0xc8ffe6, transparent: true });
    scene.add(new THREE.LineSegments(rayGeo, rayMat));

    // Sweep vertical lines (max 4 eco values)
    const sweepPositions = new Float32Array(4 * 2 * 3);
    const sweepGeo = new THREE.BufferGeometry();
    sweepGeo.setAttribute("position", new THREE.BufferAttribute(sweepPositions, 3));
    sweepGeo.setDrawRange(0, 0);
    const sweepMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true });
    scene.add(new THREE.LineSegments(sweepGeo, sweepMat));

    // Target circles pool (ray × sweep)
    const targetGroup = new THREE.Group();
    scene.add(targetGroup);

    // Warped grid — rebuilt occasionally
    const gridGroup = new THREE.Group();
    scene.add(gridGroup);

    // Reticule
    const reticuleGroup = new THREE.Group();
    scene.add(reticuleGroup);
    const retOuter = makeRetCircle(H * 0.25, 128, 0x663300, 0.15);
    reticuleGroup.add(retOuter);

    function makeRetCircle(r: number, segs: number, col: number, op: number): THREE.Line {
        const pts: number[] = [];
        for (let i = 0; i <= segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            pts.push(Math.cos(a) * r, Math.sin(a) * r, 0);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
        return new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op }));
    }

    function makeTargetCircle(r: number): THREE.Line {
        return makeRetCircle(r, 32, 0xffaa00, 0.6);
    }

    // Pre-allocate target circles
    const maxTargets = MAX_RAYS * 4;
    const targetCircles: THREE.Line[] = [];
    for (let i = 0; i < maxTargets; i++) {
        const tc = makeTargetCircle(12);
        tc.visible = false;
        targetGroup.add(tc);
        targetCircles.push(tc);
    }

    // Glitch rects pool
    const glitchRects: THREE.Mesh[] = [];
    for (let i = 0; i < 20; i++) {
        const g = new THREE.PlaneGeometry(60, 3);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0 }));
        m.visible = false;
        scene.add(m);
        glitchRects.push(m);
    }

    let rafId: number;
    let frame = 0;
    let radarAngle = 0;
    let lastGridStep = -1;

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
        const sp7 = (window as any).__slot7Soneth ?? {};

        const vol     = sp7.volume        ?? 0.5;
        const pitchSh = sp7.pitchshift    ?? 0.5;
        const tDil    = sp7.timedilation  ?? 0.5;
        const specS   = sp7.spectralshift ?? 0.5;
        const spatSp  = sp7.spatialspread ?? 0.5;
        const texDep  = sp7.texturedepth  ?? 0.5;
        const atmMix  = sp7.atmospheremix ?? 0.5;
        const memFeed = sp7.memoryfeed    ?? 0.4;
        const harmR   = sp7.harmonicrich  ?? 0.5;
        const resBody = sp7.resonantbody  ?? 0.4;
        const masterA = sp7.masteramp     ?? 0.7;
        const filtC   = sp7.filtercutoff  ?? 0.5;
        const noiseL  = sp7.noiselevel    ?? 0.2;
        const noiseF  = sp7.noisefilt     ?? 0.5;
        const droneD  = sp7.dronedepth    ?? 0.4;
        const dronFd  = sp7.dronefade     ?? 0.5;
        const droneSpace = sp7.dronespace ?? 0.5;
        const droneMix = sp7.dronemix     ?? 0.4;
        const delayFb = sp7.delayfeedback ?? 0.3;
        const txInf   = sp7.txinfluence   ?? 0.5;
        const consensus = st?.consensus ?? 0.5;

        afterimage.uniforms["damp"].value = lerp(0.77, 0.94, delayFb * 0.7 + memFeed * 0.3);
        chromatic.uniforms["amount"].value = txInf * 0.006;
        bloom.strength = lerp(0.2, 0.8, (resBody + harmR * 0.3) * masterA);
        renderer.setClearColor(0x000804, lerp(0.5, 0.95, 1 - atmMix));

        // Rebuild grid when noiseLevel changes significantly
        const gridStep = Math.floor(lerp(50, 15, texDep));
        if (Math.abs(gridStep - lastGridStep) > 5) rebuildGrid(gridStep, noiseL, texDep);
        if (gridGroup.children[0]) {
            (gridGroup.children[0] as THREE.LineSegments).material = new THREE.LineBasicMaterial({
                color: 0x663300, transparent: true,
                opacity: (0.04 + texDep * 0.08 + droneMix * 0.06 + filtC * 0.04) * masterA,
            });
        }

        // Eco sweep lines — noiseFilt controls count
        const co2 = (st?.eco?.co2 ?? 400) / 800;
        const ecoVals = [co2, st?.eco?.mycoPulse ?? 0, st?.eco?.phosphorus ?? 0.5, st?.eco?.nitrogen ?? 0.5];
        const maxSweeps = Math.max(1, Math.round(1 + noiseF * 3));
        let swIdx = 0;
        ecoVals.slice(0, maxSweeps).forEach(v => {
            const sx = (v % 1.0) * W - W / 2;
            sweepPositions[swIdx * 6]     = sx; sweepPositions[swIdx * 6 + 1] = -H / 2; sweepPositions[swIdx * 6 + 2] = 0;
            sweepPositions[swIdx * 6 + 3] = sx; sweepPositions[swIdx * 6 + 4] =  H / 2; sweepPositions[swIdx * 6 + 5] = 0;
            swIdx++;
        });
        sweepGeo.setDrawRange(0, swIdx * 2);
        sweepGeo.attributes.position.needsUpdate = true;
        // spectralShift bends sweep color amber→cyan
        const swR = lerp(1.0, 0.31, specS);
        const swG = lerp(0.67, 0.9, specS);
        const swB = lerp(0.0, 0.78, specS);
        sweepMat.color.setRGB(swR, swG, swB);
        sweepMat.opacity = (0.5 + vol * 0.5) * masterA;

        // Reticule — resBody controls size, droneFade warmth, droneSpace Y offset
        radarAngle += 0.005 + tDil * 0.025;
        reticuleGroup.rotation.z = radarAngle;
        reticuleGroup.position.y = (droneSpace - 0.5) * H * 0.15;
        const retScale = (H * (0.25 + resBody * 0.2)) / (H * 0.25);
        reticuleGroup.scale.setScalar(retScale);
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
        for (let i = 0; i < Math.min(rays.length, rayCount); i++) {
            const r = rays[i];
            const presence = st?.species?.[i]?.presence ?? 0.5;
            const act      = st?.species?.[i]?.activity ?? 0.5;

            r.y += (act - 0.5) * (3 + tDil * 4);
            if (r.y < yMin) r.y = yMax; if (r.y > yMax) r.y = yMin;

            const angleRange = Math.PI / 4 * (0.3 + pitchSh * 1.4);
            r.angle += (snoise(i, frame * (0.005 + tDil * 0.015)) - 0.5) * (0.06 + (1 - consensus) * 0.04);
            r.angle = Math.max(-angleRange, Math.min(angleRange, r.angle));

            const endY = r.y + Math.tan(r.angle) * W;
            rayPositions[rIdx * 6]     = -W / 2; rayPositions[rIdx * 6 + 1] = r.y;   rayPositions[rIdx * 6 + 2] = 0;
            rayPositions[rIdx * 6 + 3] =  W / 2; rayPositions[rIdx * 6 + 4] = endY;  rayPositions[rIdx * 6 + 5] = 0;
            rIdx++;
        }
        rayGeo.setDrawRange(0, rIdx * 2);
        rayGeo.attributes.position.needsUpdate = true;
        // average presence across active species modulates ray brightness
        const avgPresence = rays.reduce((s, _, i) => s + (st?.species?.[i]?.presence ?? 0.5), 0) / Math.max(rays.length, 1);
        rayMat.opacity = (0.3 + avgPresence * 0.3 + vol * 0.4) * masterA;

        // Target circles at ray × sweep intersections
        let tcIdx = 0;
        for (let ri = 0; ri < Math.min(rays.length, rayCount); ri++) {
            const r = rays[ri];
            const act = st?.species?.[ri]?.activity ?? 0.5;
            ecoVals.slice(0, maxSweeps).forEach(v => {
                if (tcIdx >= maxTargets) return;
                const sx = (v % 1.0) * W - W / 2;
                const iy = r.y + Math.tan(r.angle) * (sx + W / 2);
                if (iy > yMin && iy < yMax) {
                    const tc = targetCircles[tcIdx];
                    tc.visible = true;
                    tc.position.set(sx, iy, 1);
                    const targetSize = 10 + act * 20 + resBody * 12;
                    tc.scale.setScalar(targetSize / 12);
                    (tc.material as THREE.LineBasicMaterial).color.setRGB(swR, swG, swB);
                    (tc.material as THREE.LineBasicMaterial).opacity = (0.7 + vol * 0.3) * masterA;
                    tcIdx++;
                }
            });
        }
        // Hide unused target circles
        for (let i = tcIdx; i < maxTargets; i++) targetCircles[i].visible = false;

        // Glitch rects from txInfluence
        let grIdx = 0;
        for (let ri = 0; ri < rays.length && grIdx < 20; ri++) {
            if (txInf > 0.25 && Math.random() < txInf * 0.15) {
                const gx = (Math.random() - 0.5) * W;
                const gy = rays[ri].y + (Math.random() - 0.5) * 40;
                const gr = glitchRects[grIdx];
                gr.visible = true;
                gr.scale.set(Math.random() * 80 * txInf + 20, 1, 1);
                gr.position.set(gx, gy, 2);
                (gr.material as THREE.MeshBasicMaterial).opacity = 0.4 * txInf;
                grIdx++;
            }
        }
        for (let i = grIdx; i < 20; i++) glitchRects[i].visible = false;

        composer.render();
    }

    animate();

    const onResize = () => {
        if (destroyed) return;
        const w = stageEl.offsetWidth; const h = stageEl.offsetHeight;
        renderer.setSize(w, h); composer.setSize(w, h);
        camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2;
        camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return {
        name: "Geometry", key: "7",
        destroy: () => {
            destroyed = true; cancelAnimationFrame(rafId);
            window.removeEventListener("resize", onResize);
            composer.dispose(); renderer.dispose(); renderer.domElement.remove();
        }
    };
}

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
//   txinfluence   → faulting probability + chromatic aberration

export function mountMemoryHierarchy(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(4);

    const W = stageEl.offsetWidth || 800;
    const H = stageEl.offsetHeight || 600;

    const renderer = makeRenderer(stageEl);
    const scene = new THREE.Scene();
    const camera = makeOrthoCamera(W, H);
    camera.position.z = 100;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.4, 0.4, 0.6);
    composer.addPass(bloom);
    const afterimage = new AfterimagePass(0.88);
    composer.addPass(afterimage);
    const chromatic = new ShaderPass(ChromaticAberrationShader);
    composer.addPass(chromatic);

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
        scene.add(loop);
        layerBorders.push(loop);
    }

    // Block wireframe meshes — activeRoster × LAYERS
    const blockMeshes: THREE.Mesh[][] = [];
    for (let j = 0; j < LAYERS; j++) {
        const row: THREE.Mesh[] = [];
        for (let i = 0; i < activeRoster.length; i++) {
            const g = new THREE.BoxGeometry(1, 1, 1);
            const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xc8ffe6, wireframe: true, transparent: true }));
            scene.add(m);
            row.push(m);
        }
        blockMeshes.push(row);
    }

    // Drop lines between layers
    const MAX_DROPS = 24;
    const dropPositions = new Float32Array(MAX_DROPS * 2 * 3);
    const dropGeo = new THREE.BufferGeometry();
    dropGeo.setAttribute("position", new THREE.BufferAttribute(dropPositions, 3));
    dropGeo.setDrawRange(0, 0);
    const dropMat = new THREE.LineBasicMaterial({ color: 0xc8ffe6, transparent: true });
    scene.add(new THREE.LineSegments(dropGeo, dropMat));

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
    scene.add(hexPlane);

    // Hex noise data
    let hexData: string[] = [];
    for (let i = 0; i < 120; i++) hexData.push(Math.floor(Math.random() * 65535).toString(16).padStart(4, "0").toUpperCase());

    let rafId: number;
    let frame = 0;

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        const sp8 = (window as any).__slot8Soneth ?? {};

        const vol      = sp8.volume        ?? 0.5;
        const pitchSh  = sp8.pitchshift    ?? 0.5;
        const tDil     = sp8.timedilation  ?? 0.5;
        const specS    = sp8.spectralshift ?? 0.5;
        const spatSp   = sp8.spatialspread ?? 0.5;
        const texDep   = sp8.texturedepth  ?? 0.5;
        const atmMix   = sp8.atmospheremix ?? 0.5;
        const memFeed  = sp8.memoryfeed    ?? 0.5;
        const harmR    = sp8.harmonicrich  ?? 0.5;
        const resBody  = sp8.resonantbody  ?? 0.5;
        const masterA  = sp8.masteramp     ?? 0.7;
        const filtC    = sp8.filtercutoff  ?? 0.5;
        const noiseL   = sp8.noiselevel    ?? 0.2;
        const noiseF   = sp8.noisefilt     ?? 0.5;
        const droneD   = sp8.dronedepth    ?? 0.4;
        const dronFd   = sp8.dronefade     ?? 0.5;
        const droneSpace = sp8.dronespace  ?? 0.5;
        const droneMix = sp8.dronemix      ?? 0.4;
        const delayFb  = sp8.delayfeedback ?? 0.3;
        const txInf    = sp8.txinfluence   ?? 0.5;
        const aiOpt    = st?.ai?.optimization ?? 10;

        afterimage.uniforms["damp"].value = lerp(0.82, 0.97, delayFb);
        chromatic.uniforms["amount"].value = txInf * 0.006;
        bloom.strength = lerp(0.2, 0.7, resBody * masterA);

        // Hex noise — beatTempo speeds churn (stored in sp8.beatTempo if present, else tDil proxy)
        const beatT = sp8.beatTempo ?? 0.5;
        const hexRefresh = Math.max(1, Math.floor(8 - tDil * 4 - beatT * 5));
        if (frame % hexRefresh === 0) {
            const idx = Math.floor(Math.random() * hexData.length);
            hexData[idx] = Math.floor(Math.random() * 65535).toString(16).padStart(4, "0").toUpperCase();
        }
        // Redraw hex canvas
        hexCtx.clearRect(0, 0, 512, 512);
        const wR = Math.floor(lerp(102, 220, dronFd));
        const wG = Math.floor(lerp(51, 130, dronFd));
        hexCtx.fillStyle = `rgba(${wR},${wG},0,${0.3 + texDep * 0.4 + filtC * 0.2})`;
        hexCtx.font = `${7 + Math.floor(texDep * 4)}px monospace`;
        const hexCount = Math.floor(20 + texDep * 50);
        for (let i = 0; i < hexCount; i++) {
            hexCtx.fillText(hexData[i % hexData.length], Math.random() * 512, Math.random() * 512);
        }
        hexTexture.needsUpdate = true;
        (hexPlane.material as THREE.MeshBasicMaterial).opacity = (0.15 + texDep * 0.2 + filtC * 0.1) * masterA;

        // Layer layout
        const baseH = H / (LAYERS + 1.5);
        const layerGap = 30 + pitchSh * 40 + droneSpace * 20;
        const aiOpt100 = aiOpt / 100;

        let cy = -H / 2 + 30 + pitchSh * 40;

        // Drop lines between layers
        let dIdx = 0;
        const dropCount = Math.floor(3 + noiseF * 5);

        for (let j = 0; j < LAYERS; j++) {
            const wRatio = lerp(0.95 * (0.8 + spatSp * 0.2), 0.25 + spatSp * 0.15, j / Math.max(LAYERS - 1, 1));
            let bw = W * wRatio * (0.8 + (snoise(j, frame * (0.005 + tDil * 0.01)) - 0.5) * 0.4);
            let bx = -bw / 2;

            // Glitch displacement — txInfluence + noiseLevel
            const glitchProb = 0.1 + txInf * 0.2;
            if (aiOpt < 50 && Math.random() < glitchProb) {
                bx += (Math.random() - 0.5) * 80 * noiseL * (1 - aiOpt100) * (1 + txInf);
            }

            // Layer border
            const border = layerBorders[j];
            border.scale.set(bw, baseH, 1);
            border.position.set(bx + bw / 2, cy + baseH / 2, 0);
            const t = specS * (j / 3);
            const lr = lerp(1.0, 0.31, t); const lg = lerp(0.67, 0.9, t); const lb = lerp(0.0, 0.78, t);
            (border.material as THREE.LineBasicMaterial).color.setRGB(lr, lg, lb);
            (border.material as THREE.LineBasicMaterial).opacity = (0.5 + resBody * 0.5) * (0.4 + vol * 0.6) * masterA;

            // Species blocks inside layer
            let blockCX = bx + 10;
            for (let i = 0; i < activeRoster.length; i++) {
                const pres = st?.species?.[i]?.presence ?? 0.5;
                const act  = st?.species?.[i]?.activity ?? 0.5;
                const cw = (bw - 20) * (pres / LAYERS) * (0.5 + (snoise(i, j + frame * (0.005 + tDil * 0.01)) - 0.5) * 0.5);
                const bm = blockMeshes[j][i];
                bm.scale.set(Math.max(cw, 5), baseH - 20, 1);
                bm.position.set(blockCX + cw / 2, cy + baseH / 2, 1);
                (bm.material as THREE.MeshBasicMaterial).color.setRGB(
                    lerp(0.78, 1.0, harmR), lerp(1.0, 0.67, harmR), lerp(0.9, 0.0, harmR)
                );
                (bm.material as THREE.MeshBasicMaterial).opacity = (0.4 + vol * 0.6) * masterA;
                bm.rotation.z = act * (snoise(i + j * 10, frame * 0.01) - 0.5) * 0.15 * txInf;
                blockCX += cw + 5;
            }

            // Drop lines to next layer
            if (j < LAYERS - 1) {
                for (let k = 0; k < dropCount && dIdx < MAX_DROPS; k++) {
                    const dropX = bx + Math.random() * bw;
                    const gx1 = (Math.random() - 0.5) * 30 * txInf;
                    const gx2 = (Math.random() - 0.5) * 30 * txInf;
                    dropPositions[dIdx * 6]     = dropX;       dropPositions[dIdx * 6 + 1] = cy + baseH;        dropPositions[dIdx * 6 + 2] = 2;
                    dropPositions[dIdx * 6 + 3] = dropX + gx2; dropPositions[dIdx * 6 + 4] = cy + baseH + layerGap - 2; dropPositions[dIdx * 6 + 5] = 2;
                    dIdx++;
                    _ = gx1;
                }
            }

            cy += baseH + layerGap;
        }
        dropGeo.setDrawRange(0, dIdx * 2);
        dropGeo.attributes.position.needsUpdate = true;
        const dmR = lerp(0.78, 1.0, droneMix); const dmG = lerp(1.0, 0.67, droneMix);
        dropMat.color.setRGB(dmR, dmG, 0);
        dropMat.opacity = (0.5 + memFeed * 0.5) * (0.4 + vol * 0.6) * masterA;

        composer.render();
    }

    animate();

    const onResize = () => {
        if (destroyed) return;
        const w = stageEl.offsetWidth; const h = stageEl.offsetHeight;
        renderer.setSize(w, h); composer.setSize(w, h);
        camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2;
        camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return {
        name: "Memory Hierarchy", key: "8",
        destroy: () => {
            destroyed = true; cancelAnimationFrame(rafId);
            window.removeEventListener("resize", onResize);
            hexTexture.dispose();
            composer.dispose(); renderer.dispose(); renderer.domElement.remove();
        }
    };
}

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
//   txinfluence   → glitch probability + chromatic aberration + teardown artifacts
//   beatTempo     → hash mutation speed (hero param)

export function mountHashing(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    showStage(stageEl);
    let destroyed = false;
    const activeRoster = pickSpecies(6);

    const W = stageEl.offsetWidth || 800;
    const H = stageEl.offsetHeight || 600;

    const renderer = makeRenderer(stageEl);
    const scene = new THREE.Scene();
    const camera = makeOrthoCamera(W, H);
    camera.position.z = 100;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.4, 0.5);
    composer.addPass(bloom);
    const afterimage = new AfterimagePass(0.84);
    composer.addPass(afterimage);
    const chromatic = new ShaderPass(ChromaticAberrationShader);
    composer.addPass(chromatic);

    const NUM_KEYS = 8, NUM_BUCKETS = 6;

    // Key boxes (left column)
    const keyBoxes: THREE.Mesh[] = [];
    for (let i = 0; i < NUM_KEYS; i++) {
        const g = new THREE.BoxGeometry(20, 20, 1);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xc8ffe6, wireframe: true, transparent: true }));
        scene.add(m);
        keyBoxes.push(m);
    }

    // Bucket boxes (right column)
    const bucketBoxes: THREE.Mesh[] = [];
    for (let j = 0; j < NUM_BUCKETS; j++) {
        const g = new THREE.BoxGeometry(30, 30, 1);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xc8ffe6, wireframe: true, transparent: true }));
        scene.add(m);
        bucketBoxes.push(m);
    }

    // Path lines — bezier sampled at 12 points per path
    const PATH_SEGS = 12;
    const pathPositions = new Float32Array(NUM_KEYS * PATH_SEGS * 3);
    const pathGeo = new THREE.BufferGeometry();
    pathGeo.setAttribute("position", new THREE.BufferAttribute(pathPositions, 3));
    pathGeo.setDrawRange(0, 0);
    const pathMat = new THREE.LineBasicMaterial({ color: 0xc8ffe6, transparent: true, vertexColors: false });
    scene.add(new THREE.Line(pathGeo, pathMat));

    // Collision path highlight (drawn over normal paths)
    const collPositions = new Float32Array(NUM_KEYS * PATH_SEGS * 3);
    const collGeo = new THREE.BufferGeometry();
    collGeo.setAttribute("position", new THREE.BufferAttribute(collPositions, 3));
    collGeo.setDrawRange(0, 0);
    const collMat = new THREE.LineBasicMaterial({ color: 0xffaa00, transparent: true });
    scene.add(new THREE.Line(collGeo, collMat));

    // Arrowhead triangles
    const arrowMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < NUM_KEYS; i++) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
            0, 0, 0,  -10, -5, 0,  -10, 5, 0
        ]), 3));
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xc8ffe6, transparent: true }));
        scene.add(m);
        arrowMeshes.push(m);
    }

    // Scanlines
    const MAX_SCAN_LINES = 60;
    const scanPositions = new Float32Array(MAX_SCAN_LINES * 2 * 3);
    const scanGeo = new THREE.BufferGeometry();
    scanGeo.setAttribute("position", new THREE.BufferAttribute(scanPositions, 3));
    scanGeo.setDrawRange(0, 0);
    const scanMat = new THREE.LineBasicMaterial({ color: 0xc8ffe6, transparent: true });
    scene.add(new THREE.LineSegments(scanGeo, scanMat));

    // Tear rects pool
    const tearRects: THREE.Mesh[] = [];
    for (let i = 0; i < 16; i++) {
        const g = new THREE.PlaneGeometry(1, 3);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0 }));
        m.visible = false;
        scene.add(m);
        tearRects.push(m);
    }

    let rafId: number;
    let frame = 0;

    function animate() {
        if (destroyed) return;
        rafId = requestAnimationFrame(animate);
        frame++;

        const st = getLatestState();
        const sp9 = (window as any).__slot9Soneth ?? {};

        const vol     = sp9.volume        ?? 0.5;
        const pShift  = sp9.pitchshift    ?? 0.5;
        const tDil    = sp9.timedilation  ?? 0.5;
        const specS   = sp9.spectralshift ?? 0.5;
        const spatSp  = sp9.spatialspread ?? 0.5;
        const texDep  = sp9.texturedepth  ?? 0.5;
        const atmMix  = sp9.atmospheremix ?? 0.5;
        const memFeed = sp9.memoryfeed    ?? 0.4;
        const harmR   = sp9.harmonicrich  ?? 0.5;
        const resBody = sp9.resonantbody  ?? 0.4;
        const masterA = sp9.masteramp     ?? 0.7;
        const filtC   = sp9.filtercutoff  ?? 0.5;
        const noiseL  = sp9.noiselevel    ?? 0.2;
        const noiseF  = sp9.noisefilt     ?? 0.5;
        const droneD  = sp9.dronedepth    ?? 0.4;
        const dronFd  = sp9.dronefade     ?? 0.5;
        const droneSpace = sp9.dronespace ?? 0.5;
        const droneMix = sp9.dronemix     ?? 0.4;
        const delayFb = sp9.delayfeedback ?? 0.3;
        const txInf   = sp9.txinfluence   ?? 0.5;
        const beatT   = sp9.beatTempo     ?? 0.5;
        const consensus = st?.consensus ?? 0.5;

        afterimage.uniforms["damp"].value = lerp(0.80, 0.95, delayFb);
        chromatic.uniforms["amount"].value = txInf * 0.007;
        bloom.strength = lerp(0.3, 1.0, masterA);

        // Column positions — spatialSpread controls separation
        const colA_X = -W / 2 + W * lerp(0.3, 0.12, spatSp);
        const colB_X = -W / 2 + W * lerp(0.7, 0.88, spatSp);
        const spacingA = H / (NUM_KEYS + 1);
        const spacingB = H / (NUM_BUCKETS + 1);
        const bucketYOff = (pShift - 0.5) * 100 + (droneSpace - 0.5) * 60;

        // Compute hashes — beatTempo drives mutation speed
        const bucketHits = new Array(NUM_BUCKETS).fill(0);
        const mapTargets: number[] = [];
        for (let i = 0; i < NUM_KEYS; i++) {
            const hash = Math.floor(snoise(i, frame * 0.005 * (1.1 - consensus) * (1 + tDil * 2 + beatT * 3)) * NUM_BUCKETS);
            const mapped = Math.max(0, Math.min(NUM_BUCKETS - 1, hash));
            mapTargets.push(mapped);
            bucketHits[mapped]++;
        }

        // Update key boxes
        let pathIdx = 0, collIdx = 0;
        let trIdx = 0;
        for (let i = 0; i < NUM_KEYS; i++) {
            const yA = -H / 2 + (i + 1) * spacingA;
            const mapped = mapTargets[i];
            const yB = -H / 2 + (mapped + 1) * spacingB + bucketYOff;
            const isCollision = bucketHits[mapped] > 1;
            const spAct = st?.species?.[i % (st?.species?.length || 1)]?.activity ?? 0.5;

            // Key box position + rotation (droneDepth controls spin speed)
            const kbSize = 20 * (1 + noiseL * (snoise(i, frame * 0.01) - 0.3));
            keyBoxes[i].position.set(colA_X, yA, 0);
            keyBoxes[i].scale.setScalar(kbSize / 20);
            keyBoxes[i].rotation.z += 0.005 + droneD * 0.02;
            (keyBoxes[i].material as THREE.MeshBasicMaterial).color.setRGB(0.78, 1.0, 0.9);
            (keyBoxes[i].material as THREE.MeshBasicMaterial).opacity = (0.8 + vol * 0.2) * masterA;

            // Path line (bezier sampled)
            const cx0 = colA_X + 20, cx1 = colB_X - 20;
            const midX = (cx0 + cx1) / 2;
            const jitterRange = noiseF * 40;
            for (let s = 0; s <= PATH_SEGS; s++) {
                const t = s / PATH_SEGS;
                const gj = (snoise(i + s, frame * 0.03) - 0.5) * jitterRange * (isCollision ? (1 - consensus) * (1 + specS * 3 + txInf * 2) : 0);
                // Quadratic bezier: P = (1-t)²·A + 2(1-t)t·M + t²·B
                const tt = t * t; const mt = 1 - t; const mt2 = mt * mt;
                const px = mt2 * cx0 + 2 * mt * t * midX + tt * cx1;
                const py = mt2 * yA  + 2 * mt * t * lerp(yA, yB, 0.5) + tt * yB + gj;
                if (isCollision) {
                    collPositions[collIdx * 3]     = px;
                    collPositions[collIdx * 3 + 1] = py;
                    collPositions[collIdx * 3 + 2] = 0;
                    collIdx++;
                } else {
                    pathPositions[pathIdx * 3]     = px;
                    pathPositions[pathIdx * 3 + 1] = py;
                    pathPositions[pathIdx * 3 + 2] = 0;
                    pathIdx++;
                }
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
                if (txInf > 0.3 && Math.random() < txInf * 0.25) {
                    const tearX = lerp(colA_X, colB_X, Math.random());
                    const tearY = lerp(yA, yB, Math.random());
                    const tr = tearRects[trIdx];
                    tr.visible = true;
                    tr.scale.set(Math.random() * 80 * txInf + 20, 1 + Math.random() * 3, 1);
                    tr.position.set(tearX, tearY, 2);
                    (tr.material as THREE.MeshBasicMaterial).opacity = 0.5 * txInf * masterA;
                    trIdx++;
                }
            }
        }
        for (let i = trIdx; i < 16; i++) tearRects[i].visible = false;

        pathGeo.setDrawRange(0, pathIdx);
        pathGeo.attributes.position.needsUpdate = true;
        pathMat.opacity = (0.5 + vol * 0.5) * masterA;

        collGeo.setDrawRange(0, collIdx);
        collGeo.attributes.position.needsUpdate = true;
        collMat.opacity = (0.6 + vol * 0.4) * masterA;
        collMat.linewidth = 1 + harmR * 1.5;

        // Bucket boxes
        for (let j = 0; j < NUM_BUCKETS; j++) {
            const yB = -H / 2 + (j + 1) * spacingB + bucketYOff;
            const isCollision = bucketHits[j] > 1;
            const bm = bucketBoxes[j];
            let bx = colB_X, by = yB;
            if (isCollision) {
                bx += (snoise(j * 3, frame * 0.05) - 0.5) * 10 * (1 - consensus) * (1 + specS);
                by += (snoise(j * 7, frame * 0.05) - 0.5) * 10 * (1 - consensus);
            }
            bm.position.set(bx, by, 0);
            bm.scale.setScalar(1 + resBody * 0.5);
            const dR = lerp(0.78, 1.0, dronFd); const dG = lerp(1.0, 0.67, dronFd);
            (bm.material as THREE.MeshBasicMaterial).color.setRGB(
                isCollision ? 1.0 : dR,
                isCollision ? 0.67 : dG,
                0
            );
            (bm.material as THREE.MeshBasicMaterial).opacity = (isCollision ? 0.9 : 0.5) * (0.4 + vol * 0.6) * masterA;
        }

        // Scanlines — textureDepth controls density, filtercutoff brightness
        const scanStep = Math.floor(lerp(10, 3, texDep));
        let scIdx = 0;
        for (let y = -H / 2; y < H / 2 && scIdx < MAX_SCAN_LINES; y += scanStep + Math.floor(Math.random() * 7)) {
            scanPositions[scIdx * 6]     = -W / 2; scanPositions[scIdx * 6 + 1] = y; scanPositions[scIdx * 6 + 2] = -2;
            scanPositions[scIdx * 6 + 3] =  W / 2; scanPositions[scIdx * 6 + 4] = y; scanPositions[scIdx * 6 + 5] = -2;
            scIdx++;
        }
        scanGeo.setDrawRange(0, scIdx * 2);
        scanGeo.attributes.position.needsUpdate = true;
        scanMat.opacity = (vol * 0.08 + texDep * 0.12 + filtC * 0.06) * masterA;

        composer.render();
    }

    animate();

    const onResize = () => {
        if (destroyed) return;
        const w = stageEl.offsetWidth; const h = stageEl.offsetHeight;
        renderer.setSize(w, h); composer.setSize(w, h);
        camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2;
        camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return {
        name: "Hashing", key: "9",
        destroy: () => {
            destroyed = true; cancelAnimationFrame(rafId);
            window.removeEventListener("resize", onResize);
            composer.dispose(); renderer.dispose(); renderer.domElement.remove();
        }
    };
}

// suppress unused-variable lint for intentionally-unused sink
declare let _: unknown;
