// slotThree.ts
// The 3-D toolkit slots 5-9 were missing.
//
// Those five had perspective cameras and OrbitControls already — the *camera*
// was 3-D. The content was not. Measured across the five: almost every object
// was a BufferGeometry fed to Line or LineSegments with its vertices pinned at
// z = 0, one SphereGeometry between them and a couple of BoxGeometry. Flat
// diagrams seen from an angle, which is why orbiting them revealed nothing —
// there was nothing behind anything.
//
// Two things follow from that, and both are why this file exists rather than
// each slot growing its own version:
//
//   1. LINES CANNOT BE THICK. WebGL/ANGLE clamps LineBasicMaterial.linewidth
//      to 1 px on every platform this runs on, so `linewidth = 0.5 + noiseF *
//      1.5` — which four of the five slots set every frame — has never done
//      anything at all. A link with real presence has to be geometry, so
//      makeTubeLinks builds one mesh of extruded segments and rewrites its
//      vertices in place.
//
//   2. A NODE IS A BODY. Five slots drew nodes as one Mesh each with its own
//      material, which is fine at eight nodes and a per-frame cost the moment
//      a slot wants sixty. makeNodeField is a single InstancedMesh with
//      per-instance colour, so a slot can carry as many bodies as its
//      structure actually has.
//
// And the interaction, which none of the five had in any form: no Raycaster,
// no pointerdown, no hover, nothing. attachPicker gives them one shared
// implementation — hover and grab against the instanced bodies, with the
// picked index published so a slot can respond however its own idiom wants.

import * as THREE from "three";

// ─── Node field ──────────────────────────────────────────────────────────────

export type NodeField = {
    mesh: THREE.InstancedMesh;
    /** Live count actually drawn. Set it; the rest of the pool stays idle. */
    count: number;
    /** Place one body at a uniform scale. */
    set(i: number, pos: THREE.Vector3, scale: number, quat?: THREE.Quaternion): void;
    /**
     * Place one body with a scale per axis.
     *
     * For the structures that are genuinely about extent rather than presence —
     * a block in a memory hierarchy is as wide as what it holds — where a
     * uniform scale would have to lie about two of the three dimensions.
     */
    setBox(i: number, pos: THREE.Vector3, sx: number, sy: number, sz: number,
           quat?: THREE.Quaternion): void;
    /** Per-instance colour, 0-1 linear. */
    tint(i: number, r: number, g: number, b: number): void;
    /** Push both buffers. Once per frame, after every set/tint. */
    commit(): void;
    dispose(): void;
};

/**
 * A pool of identical bodies drawn in one call.
 *
 * `detail` picks the solid: 0 an octahedron, 1 an icosahedron, 2 a rounded box.
 * All three read as volumes from any angle, which a circle of line segments
 * facing the camera does not.
 */
export function makeNodeField(
    parent: THREE.Object3D,
    capacity: number,
    radius = 1,
    detail: 0 | 1 | 2 = 1,
    opts: { wireframe?: boolean; opacity?: number } = {},
): NodeField {
    const geo =
        detail === 0 ? new THREE.OctahedronGeometry(radius, 0)
      : detail === 1 ? new THREE.IcosahedronGeometry(radius, 1)
      :                new THREE.BoxGeometry(radius * 1.5, radius * 1.5, radius * 1.5);

    const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: opts.wireframe ?? false,
        transparent: true,
        opacity: opts.opacity ?? 0.9,
        depthWrite: false,
    });

    const mesh = new THREE.InstancedMesh(geo, mat, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(capacity * 3).fill(1), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    // Frustum culling off: the matrices move every frame and three.js computes
    // the bounding sphere once, so a field whose bodies drift outward vanishes
    // wholesale the moment the stale sphere leaves the view.
    mesh.frustumCulled = false;
    mesh.count = 0;
    parent.add(mesh);

    const _m = new THREE.Matrix4();
    const _s = new THREE.Vector3();
    const _q = new THREE.Quaternion();

    return {
        mesh,
        get count() { return mesh.count; },
        set count(n: number) { mesh.count = Math.max(0, Math.min(capacity, n | 0)); },
        set(i, pos, scale, quat) {
            if (i < 0 || i >= capacity) return;
            _s.setScalar(scale);
            _m.compose(pos, quat ?? _q.identity(), _s);
            mesh.setMatrixAt(i, _m);
        },
        setBox(i, pos, sx, sy, sz, quat) {
            if (i < 0 || i >= capacity) return;
            _s.set(sx, sy, sz);
            _m.compose(pos, quat ?? _q.identity(), _s);
            mesh.setMatrixAt(i, _m);
        },
        tint(i, r, g, b) {
            if (i < 0 || i >= capacity || !mesh.instanceColor) return;
            const a = mesh.instanceColor.array as Float32Array;
            a[i * 3] = r; a[i * 3 + 1] = g; a[i * 3 + 2] = b;
        },
        commit() {
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        },
        dispose() {
            parent.remove(mesh);
            geo.dispose();
            mat.dispose();
        },
    };
}

// ─── Tube links ──────────────────────────────────────────────────────────────

export type TubeLinks = {
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    /** Start a frame. */
    begin(): void;
    /** Add one link. Radius is in world units and is REAL, unlike linewidth. */
    add(a: THREE.Vector3, b: THREE.Vector3, radius: number): void;
    /** Finish a frame: hides the unused tail of the pool. */
    end(): void;
    dispose(): void;
};

/**
 * A pool of link segments as actual extruded geometry.
 *
 * Each link is a prism of `SIDES` faces built directly into one shared vertex
 * buffer, so a slot can draw hundreds of them in a single draw call and they
 * still have thickness, occlude one another and catch the bloom. That is the
 * whole difference from LineSegments, whose width is a lie on this platform.
 */
export function makeTubeLinks(
    parent: THREE.Object3D, capacity: number, color = 0xffffff, opacity = 0.5,
): TubeLinks {
    const SIDES = 5;
    const VERTS_PER = SIDES * 2;
    const IDX_PER = SIDES * 6;

    const pos = new Float32Array(capacity * VERTS_PER * 3);
    const idx = new Uint32Array(capacity * IDX_PER);
    for (let l = 0; l < capacity; l++) {
        const v0 = l * VERTS_PER, o = l * IDX_PER;
        for (let s = 0; s < SIDES; s++) {
            const a = v0 + s, b = v0 + ((s + 1) % SIDES);
            const c = a + SIDES, d = b + SIDES;
            idx[o + s * 6] = a; idx[o + s * 6 + 1] = b; idx[o + s * 6 + 2] = c;
            idx[o + s * 6 + 3] = b; idx[o + s * 6 + 4] = d; idx[o + s * 6 + 5] = c;
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);

    const material = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    parent.add(mesh);

    let n = 0;
    const dir = new THREE.Vector3();
    const up = new THREE.Vector3();
    const side = new THREE.Vector3();
    const tmp = new THREE.Vector3();

    return {
        mesh, material,
        begin() { n = 0; },
        add(a, b, radius) {
            if (n >= capacity) return;
            dir.subVectors(b, a);
            const len = dir.length();
            if (len < 1e-4) return;
            dir.divideScalar(len);
            // Any vector not parallel to dir gives a stable frame. Picking the
            // world axis dir is LEAST aligned with avoids the degenerate cross
            // product that would collapse the prism to a line.
            up.set(0, 0, 1);
            if (Math.abs(dir.z) > 0.9) up.set(0, 1, 0);
            side.crossVectors(dir, up).normalize();
            up.crossVectors(side, dir).normalize();

            const v0 = n * VERTS_PER;
            for (let s = 0; s < SIDES; s++) {
                const ang = (s / SIDES) * Math.PI * 2;
                const ox = Math.cos(ang) * radius, oy = Math.sin(ang) * radius;
                tmp.copy(side).multiplyScalar(ox).addScaledVector(up, oy);
                const i0 = (v0 + s) * 3, i1 = (v0 + s + SIDES) * 3;
                pos[i0]     = a.x + tmp.x; pos[i0 + 1] = a.y + tmp.y; pos[i0 + 2] = a.z + tmp.z;
                pos[i1]     = b.x + tmp.x; pos[i1 + 1] = b.y + tmp.y; pos[i1 + 2] = b.z + tmp.z;
            }
            n++;
        },
        end() {
            geo.setDrawRange(0, n * IDX_PER);
            geo.attributes.position.needsUpdate = true;
        },
        dispose() {
            parent.remove(mesh);
            geo.dispose();
            material.dispose();
        },
    };
}

// ─── Depth grid ──────────────────────────────────────────────────────────────

/**
 * A floor, so the scene has somewhere to stand.
 *
 * Slots 5-9 drew their grids as horizontal lines on the z = 0 plane, which
 * from an orbiting camera is a set of lines and not a ground. This is a real
 * plane in space with its own extent, and it is what makes the depth of
 * everything above it legible.
 */
export function makeDepthGrid(
    parent: THREE.Object3D, size: number, divisions: number, color = 0x663300,
): { grid: THREE.LineSegments; material: THREE.LineBasicMaterial; dispose(): void } {
    const pts: number[] = [];
    const half = size / 2;
    for (let i = 0; i <= divisions; i++) {
        const t = -half + (size * i) / divisions;
        pts.push(-half, 0, t, half, 0, t);
        pts.push(t, 0, -half, t, 0, half);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
    const material = new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.1, depthWrite: false,
    });
    const grid = new THREE.LineSegments(geo, material);
    parent.add(grid);
    return {
        grid, material,
        dispose() { parent.remove(grid); geo.dispose(); material.dispose(); },
    };
}

// ─── Picking ─────────────────────────────────────────────────────────────────

export type Picker = {
    /** Index under the pointer, or -1. */
    readonly hover: number;
    /** Index being held, or -1. */
    readonly grabbed: number;
    /** Where the pointer ray meets the grab plane. Valid while grabbed. */
    readonly point: THREE.Vector3;
    /** Call once per frame, after the bodies have moved. */
    update(camera: THREE.Camera): void;
    dispose(): void;
};

/**
 * Hover and grab against an InstancedMesh.
 *
 * These five slots had no interaction of any kind — no Raycaster, no
 * pointerdown, nothing. Orbiting was the entire vocabulary, and orbiting is
 * looking, not touching.
 *
 * Deliberately NOT a drag implementation: this reports what is under the
 * pointer and where the pointer is in the world, and each slot decides what
 * that means. A node in a force graph should be PULLED and let its neighbours
 * follow; a bucket in a hash table should not move at all and should open
 * instead. One shared grab behaviour would have to be wrong for one of them.
 */
export function attachPicker(
    dom: HTMLElement, target: THREE.InstancedMesh,
): Picker {
    const ray = new THREE.Raycaster();
    // Instanced hit testing at this scale is cheap, but it is not free and it
    // runs on a camera that is usually moving. A threshold keeps the ray from
    // being recomputed for sub-pixel pointer noise.
    const ndc = new THREE.Vector2(-2, -2);
    const point = new THREE.Vector3();
    const plane = new THREE.Plane();
    const planeNormal = new THREE.Vector3();
    let hover = -1;
    let grabbed = -1;
    let inside = false;

    const onMove = (e: PointerEvent) => {
        const r = dom.getBoundingClientRect();
        ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        inside = true;
    };
    const onLeave = () => { inside = false; hover = -1; grabbed = -1; };
    const onDown = () => { if (hover >= 0) grabbed = hover; };
    const onUp = () => { grabbed = -1; };

    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerleave", onLeave);
    dom.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);

    return {
        get hover() { return hover; },
        get grabbed() { return grabbed; },
        get point() { return point; },
        update(camera) {
            if (!inside) { hover = -1; return; }
            ray.setFromCamera(ndc, camera);
            if (grabbed < 0) {
                const hits = ray.intersectObject(target, false);
                hover = hits.length && hits[0].instanceId !== undefined
                    ? hits[0].instanceId : -1;
            }
            // The grab plane faces the camera and passes through the origin,
            // so dragging tracks the pointer at the scene's own depth rather
            // than flying the body toward or away from the viewer.
            camera.getWorldDirection(planeNormal);
            plane.setFromNormalAndCoplanarPoint(planeNormal, new THREE.Vector3(0, 0, 0));
            ray.ray.intersectPlane(plane, point);
        },
        dispose() {
            dom.removeEventListener("pointermove", onMove);
            dom.removeEventListener("pointerleave", onLeave);
            dom.removeEventListener("pointerdown", onDown);
            window.removeEventListener("pointerup", onUp);
        },
    };
}

// ─── Particles ───────────────────────────────────────────────────────────────

export type ParticleField = {
    points: THREE.Points;
    material: THREE.PointsMaterial;
    /**
     * Advance the drift. `flow` biases the motion along +z (the direction the
     * structure recedes), `swirl` turns it about the y axis, `lift` is the
     * per-second rise. All three come off the panel — see each slot.
     */
    step(dt: number, flow: number, swirl: number, lift: number): void;
    dispose(): void;
};

/**
 * Ambient motes filling the volume the structures sit in.
 *
 * Slots 6, 7 and 8 lost their visible atmosphere when the constellation field
 * came off them — the field was doing two jobs at once, naming species AND
 * being the air in the room, and only the first of those is worth restricting
 * to two slots. This is the second job on its own: no species, no figures, no
 * meaning to read, just the volume made visible so depth has something to be
 * measured against.
 *
 * A real THREE.Points cloud rather than a canvas overlay, so the motes are IN
 * the scene: they pass behind the geometry, catch the bloom, and move when the
 * camera moves. A screen-space layer can do none of that.
 */
export function makeParticles(
    parent: THREE.Object3D, count: number, extent: number, color = 0xffaa00,
): ParticleField {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        pos[i * 3]     = (Math.random() - 0.5) * extent;
        pos[i * 3 + 1] = (Math.random() - 0.5) * extent * 0.7;
        pos[i * 3 + 2] = (Math.random() - 0.5) * extent;
        seed[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

    const material = new THREE.PointsMaterial({
        color, size: extent * 0.0035, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, material);
    points.frustumCulled = false;
    parent.add(points);

    let t = 0;
    const half = extent / 2;

    return {
        points, material,
        step(dt, flow, swirl, lift) {
            // dt-based, not per-frame: the drift must cross the volume at the
            // same rate on a 60 and a 120 Hz panel. Clamped, so a stall resumes
            // rather than teleporting the whole cloud.
            const d = Math.min(0.1, dt);
            t += d;
            const a = geo.attributes.position.array as Float32Array;
            const cs = Math.cos(swirl * d), sn = Math.sin(swirl * d);
            for (let i = 0; i < count; i++) {
                const i3 = i * 3;
                // Swirl about y, so the cloud turns with the structure rather
                // than sliding across it.
                const x = a[i3], z = a[i3 + 2];
                a[i3]     = x * cs - z * sn;
                a[i3 + 2] = x * sn + z * cs;
                a[i3 + 1] += lift * d + Math.sin(t * 0.7 + seed[i]) * d * extent * 0.006;
                a[i3 + 2] += flow * d;
                // Wrap rather than respawn: a mote that vanishes and reappears
                // elsewhere reads as a glitch, one that wraps reads as more of
                // the same air.
                if (a[i3 + 1] >  half * 0.7) a[i3 + 1] = -half * 0.7;
                if (a[i3 + 1] < -half * 0.7) a[i3 + 1] =  half * 0.7;
                if (a[i3 + 2] >  half) a[i3 + 2] = -half;
                if (a[i3 + 2] < -half) a[i3 + 2] =  half;
            }
            geo.attributes.position.needsUpdate = true;
        },
        dispose() {
            parent.remove(points);
            geo.dispose();
            material.dispose();
        },
    };
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export type LabelField = {
    /** Move label i to a world position and set how bright it is. */
    set(i: number, pos: THREE.Vector3, alpha: number): void;
    /** Rewrite the text of label i. Redraws its canvas, so call it on change. */
    text(i: number, s: string): void;
    /** Hide the tail of the pool from `n` on. */
    count(n: number): void;
    dispose(): void;
};

/**
 * Small sprite captions for the bodies in a slot.
 *
 * These six drew no text at all — the structures were legible only to someone
 * who had read the source, so a "bucket" and a "layer" and a "target" were all
 * just boxes. A label says which is which in the module's OWN vocabulary.
 *
 * Sprites rather than DOM: they belong to the scene, so they sit at the body's
 * depth, go behind what is in front of them, and need no per-frame projection
 * to screen space. `sizeAttenuation` off keeps them the same size at any
 * distance, which is what a caption wants — it is being read, not being drawn
 * in perspective.
 */
export function makeLabelField(
    parent: THREE.Object3D, capacity: number, color = 0xffcc88, px = 15,
): LabelField {
    const sprites: THREE.Sprite[] = [];
    const canvases: HTMLCanvasElement[] = [];
    const hex = "#" + new THREE.Color(color).getHexString();

    for (let i = 0; i < capacity; i++) {
        const cv = document.createElement("canvas");
        cv.width = 256; cv.height = 64;
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(cv),
            transparent: true, depthWrite: false, depthTest: true,
            sizeAttenuation: false, opacity: 0,
        }));
        // In screen units, since attenuation is off. Roughly px tall.
        spr.scale.set(px * 0.016, px * 0.004, 1);
        spr.visible = false;
        parent.add(spr);
        sprites.push(spr);
        canvases.push(cv);
    }

    function draw(i: number, s: string) {
        const cv = canvases[i];
        const g = cv.getContext("2d");
        if (!g) return;
        g.clearRect(0, 0, cv.width, cv.height);
        g.font = "600 34px ui-monospace, 'SF Mono', Menlo, monospace";
        g.textAlign = "center";
        g.textBaseline = "middle";
        // A dark pad under the glyphs. Additive scenes wash out thin type, and
        // an outline costs nothing next to a texture upload.
        g.lineWidth = 6;
        g.strokeStyle = "rgba(0,0,0,0.85)";
        g.strokeText(s, cv.width / 2, cv.height / 2);
        g.fillStyle = hex;
        g.fillText(s, cv.width / 2, cv.height / 2);
        (sprites[i].material as THREE.SpriteMaterial).map!.needsUpdate = true;
    }

    return {
        set(i, pos, alpha) {
            if (i < 0 || i >= capacity) return;
            const spr = sprites[i];
            spr.position.copy(pos);
            spr.visible = alpha > 0.01;
            (spr.material as THREE.SpriteMaterial).opacity = Math.min(1, Math.max(0, alpha));
        },
        text(i, s) { if (i >= 0 && i < capacity) draw(i, s); },
        count(n) { for (let i = n; i < capacity; i++) sprites[i].visible = false; },
        dispose() {
            for (const spr of sprites) {
                parent.remove(spr);
                const m = spr.material as THREE.SpriteMaterial;
                m.map?.dispose();
                m.dispose();
            }
        },
    };
}
