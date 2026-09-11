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
    /**
     * The slot's OrbitControls, if it has them.
     *
     * Without this the picker and the controls both answer the same
     * pointerdown on the same element: dragging a body orbits the camera AND
     * moves the body, which feels like neither working. Handed in, the controls
     * are switched off for the duration of a grab and back on when it ends, so
     * a drag is a drag and a drag on empty space is still a look-around.
     */
    controls?: { enabled: boolean } | null,
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
    const onLeave = () => {
        inside = false; hover = -1;
        // Releasing the controls here too: a pointer that leaves the canvas
        // mid-grab never fires pointerup on it, and the camera would stay
        // locked for the rest of the session.
        if (grabbed >= 0 && controls) controls.enabled = true;
        grabbed = -1;
    };
    const onDown = () => {
        if (hover >= 0) {
            grabbed = hover;
            if (controls) controls.enabled = false;
        }
    };
    const onUp = () => {
        if (grabbed >= 0 && controls) controls.enabled = true;
        grabbed = -1;
    };

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
            if (controls) controls.enabled = true;
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
/**
 * How a slot's captions are SET, not just what they say.
 *
 * Six structures, six registers of text. A BioToken factor is a readout on an
 * instrument panel and should look like one; an eco signal is a field
 * measurement; a parliamentary state is a record. Giving all six the same
 * typeface makes them one system with six views, which is the opposite of what
 * they are.
 */
export type LabelStyle = {
    /** Canvas font shorthand. Monospace for anything with a number in it. */
    font?: string;
    /** Extra tracking in px, applied per glyph. Wide caps read as an index. */
    tracking?: number;
    /** Draw a bracket around the text, HUD-style. */
    brackets?: boolean;
    /** Draw a rule under the text. */
    underline?: boolean;
    /** A faint block behind the glyphs, for readability over bright geometry. */
    plate?: boolean;
    /** Per-frame RGB split, in px. Slot 8 uses it; nothing else should. */
    glitch?: number;
};

export function makeLabelField(
    parent: THREE.Object3D, capacity: number, color = 0xffcc88, px = 15,
    style: LabelStyle = {},
): LabelField {
    const sprites: THREE.Sprite[] = [];
    const canvases: HTMLCanvasElement[] = [];
    const hex = "#" + new THREE.Color(color).getHexString();

    for (let i = 0; i < capacity; i++) {
        const cv = document.createElement("canvas");
        cv.width = 384; cv.height = 72;
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(cv),
            transparent: true, depthWrite: false, depthTest: true,
            sizeAttenuation: false, opacity: 0,
        }));
        // In screen units, since attenuation is off. Roughly px tall.
        spr.scale.set(px * 0.020, px * 0.00375, 1);
        spr.visible = false;
        parent.add(spr);
        sprites.push(spr);
        canvases.push(cv);
    }

    const FONT = style.font ?? "600 34px ui-monospace, 'SF Mono', Menlo, monospace";
    const TRACK = style.tracking ?? 0;

    /** Width of `s` including the extra tracking, so everything stays centred. */
    function widthOf(g: CanvasRenderingContext2D, s: string): number {
        return g.measureText(s).width + TRACK * Math.max(0, s.length - 1);
    }

    /** Draw with per-glyph tracking. canvas letterSpacing is not universal. */
    function tracked(g: CanvasRenderingContext2D, s: string, cx: number, cy: number,
                     stroke: boolean) {
        if (TRACK === 0) {
            if (stroke) g.strokeText(s, cx, cy); else g.fillText(s, cx, cy);
            return;
        }
        let x = cx - widthOf(g, s) / 2;
        g.textAlign = "left";
        for (const ch of s) {
            if (stroke) g.strokeText(ch, x, cy); else g.fillText(ch, x, cy);
            x += g.measureText(ch).width + TRACK;
        }
        g.textAlign = "center";
    }

    function draw(i: number, s: string) {
        const cv = canvases[i];
        const g = cv.getContext("2d");
        if (!g) return;
        g.clearRect(0, 0, cv.width, cv.height);
        g.font = FONT;
        g.textAlign = "center";
        g.textBaseline = "middle";
        const cx = cv.width / 2, cy = cv.height / 2;
        const w = widthOf(g, s);

        if (style.plate) {
            g.fillStyle = "rgba(0,0,0,0.55)";
            g.fillRect(cx - w / 2 - 10, cy - 24, w + 20, 48);
        }
        if (style.brackets) {
            // The HUD bracket: two corners, not a box. A box is a label; corners
            // are a readout that something else is inside.
            const bx = cx - w / 2 - 13, by = cy - 22, bw = w + 26, bh = 44, t = 9;
            g.strokeStyle = hex;
            g.globalAlpha = 0.7;
            g.lineWidth = 3;
            g.beginPath();
            g.moveTo(bx, by + t); g.lineTo(bx, by); g.lineTo(bx + t, by);
            g.moveTo(bx + bw - t, by + bh); g.lineTo(bx + bw, by + bh);
            g.lineTo(bx + bw, by + bh - t);
            g.stroke();
            g.globalAlpha = 1;
        }
        // A dark pad under the glyphs. Additive scenes wash out thin type, and
        // an outline costs nothing next to a texture upload.
        g.lineWidth = 6;
        g.strokeStyle = "rgba(0,0,0,0.85)";
        tracked(g, s, cx, cy, true);

        if (style.glitch && style.glitch > 0) {
            // RGB split. The offset walks with the text itself rather than with
            // a random number, so a given caption tears the same way every time
            // it is drawn and the field does not boil.
            const d = style.glitch;
            let h = 0;
            for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) % 211;
            const o = ((h / 211) - 0.5) * 2 * d;
            g.globalAlpha = 0.55;
            g.fillStyle = "#ff3b30";
            tracked(g, s, cx - o, cy, false);
            g.fillStyle = "#30d0ff";
            tracked(g, s, cx + o, cy, false);
            g.globalAlpha = 1;
        }

        g.fillStyle = hex;
        tracked(g, s, cx, cy, false);

        if (style.underline) {
            g.strokeStyle = hex;
            g.globalAlpha = 0.5;
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(cx - w / 2, cy + 21);
            g.lineTo(cx + w / 2, cy + 21);
            g.stroke();
            g.globalAlpha = 1;
        }
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

// ─── Calm ────────────────────────────────────────────────────────────────────

export type Calm = {
    /** Smoothed drone level, 0-1. Seconds of smoothing, not frames. */
    readonly drone: number;
    /** Smoothed pad level, 0-1. */
    readonly pad: number;
    /** The slow swell the two make together — what movement should follow. */
    readonly swell: number;
    /**
     * 0→1 on a struck-voice onset, decaying over about a second.
     *
     * Zero unless BOWL or CHINA is actually up: the displacement that used to
     * happen every frame at random now happens when the instrument is struck,
     * and only if the half that strikes it exists.
     */
    readonly strike: number;
    /** Whichever of the two halves is louder, 0-1. Scales how far a strike throws. */
    readonly halves: number;
    /**
     * Seconds since mount.
     *
     * For the places that were walking a noise function against the FRAME
     * COUNT — which runs at whatever rate the display does, and at 60 Hz turns
     * a slow walk into a boil. Anything sampled over time should sample over
     * this.
     */
    readonly clock: number;
    /**
     * Deterministic slow drift in [-1, 1], per body and per axis.
     *
     * This is the replacement for `(Math.random() - 0.5)` written into a
     * POSITION every frame. That is uncorrelated frame to frame, so it does not
     * read as motion at all — it reads as the thing vibrating in place, which
     * is precisely the shake. Three sines at incommensurable rates give a path
     * a body can actually be followed along, and it is a function of TIME, so
     * it runs at the same speed on a 60 and a 144 Hz panel.
     */
    drift(i: number, axis: number): number;
    /**
     * The chain, read live. See ethLive.ts.
     *
     * Exposed through Calm rather than imported separately so a slot has ONE
     * object to ask about the state of the world: what the bed is doing, what
     * was struck, and what the chain just did. Three sources of motion, one
     * handle.
     */
    readonly eth: {
        value: number; priority: number; gas: number; calldata: number;
        nonce: number; addr: number; index: number; entropy: number;
        depth: number; parity: number; fullness: number; baseFee: number;
        hash: number; period: number; pulse: number; blockPulse: number;
        live: boolean;
    };
    /**
     * The chain SMOOTHED — followers, envelopes, block phase, autoscale.
     *
     * This is what a shape, a brightness or a rotation should read. `eth` above
     * is the raw stream and it STEPS twenty times a second, because that is how
     * often eth_sonify.py sends; anything continuous driven from it directly is
     * jitter with a blockchain for a seed. Use `eth` for discrete tests — did a
     * transaction just land, is this the counterparty — and `chain` for
     * everything that moves.
     */
    readonly chain: {
        gas: number; baseFee: number; value: number; calldata: number;
        priority: number; fullness: number; entropy: number;
        gasN: number; valueN: number; calldataN: number;
        blockPhase: number; turn: number;
        txEnv: number; blockEnv: number;
        txCount: number; blockCount: number;
    };
    /** Advance. `slotKey` is the window mirror this slot reads, for bowl/china. */
    step(slotKey: string): void;
};

/**
 * The slow body of the engine, for slots that should move with it.
 *
 * Slots 5-9 took their motion from per-frame randomness and from `snoise(i,
 * frame * k)` — frame counts, not seconds. Two consequences: the movement was
 * uncorrelated between frames (shake rather than travel) and it ran faster on
 * a faster display.
 *
 * What these structures should follow is the part of the engine that is
 * actually slow: the drone and the pad, which sustain for tens of seconds. So
 * `swell` is those two, heavily smoothed, and it is what continuous motion
 * scales with. Anything impulsive waits for `strike`.
 */
/** The smoothed layer's rest state, for a slot that mounts before the feed. */
const CHAIN_REST: Calm["chain"] = {
    gas: 0.4, baseFee: 0.4, value: 0.4, calldata: 0.3, priority: 0.5,
    fullness: 0.4, entropy: 0.5,
    gasN: 0.5, valueN: 0.5, calldataN: 0.5,
    blockPhase: 0, turn: 1, txEnv: 0, blockEnv: 0, txCount: 0, blockCount: 0,
};

/** What a slot reads before the chain has said anything, or if it never does. */
const ETH_REST: Calm["eth"] = {
    value: 0.4, priority: 0.5, gas: 0.4, calldata: 0.3, nonce: 0.5,
    addr: 0.5, index: 0.2, entropy: 0.5, depth: 0.3,
    parity: 0, fullness: 0.4, baseFee: 0.4, hash: 0.5, period: 0.35,
    pulse: 0, blockPulse: 0, live: false,
};

export function makeCalm(): Calm {
    let drone = 0, pad = 0, strike = 0, halves = 1;
    let lastPercEnv = 0;
    let t = 0;
    let last = 0;

    // Held so the getter costs nothing per read; ethLive mutates it in place.
    const ethRef = (() => {
        try {
            return (window as unknown as { __ethLive?: Calm["eth"] }).__ethLive ?? ETH_REST;
        } catch { return ETH_REST; }
    })();

    return {
        get chain() {
            try {
                const live = (window as unknown as { __ethScaled?: Calm["chain"] }).__ethScaled;
                if (live) return live;
            } catch { /* fall through */ }
            return CHAIN_REST;
        },
        get eth() {
            // Re-resolved lazily: the slot may mount before parliamentEntry has
            // published, and a stale fallback would leave that slot reading a
            // frozen chain for the rest of the session.
            try {
                const live = (window as unknown as { __ethLive?: Calm["eth"] }).__ethLive;
                if (live) return live;
            } catch { /* fall through */ }
            return ethRef;
        },
        get clock() { return t; },
        get drone() { return drone; },
        get pad() { return pad; },
        get swell() { return Math.min(1, drone * 0.65 + pad * 0.55); },
        get strike() { return strike; },
        get halves() { return halves; },
        drift(i, axis) {
            // Incommensurable rates, so a body never returns to the same offset
            // on a short cycle and the field as a whole never pulses together.
            const p = i * 1.7 + axis * 2.39;
            return (Math.sin(t * 0.11 + p) * 0.55
                  + Math.sin(t * 0.187 + p * 1.7) * 0.30
                  + Math.sin(t * 0.041 + p * 0.6) * 0.15);
        },
        step(slotKey) {
            const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
            const dt = last === 0 ? 1 / 60 : Math.min(0.1, now - last);
            last = now;
            t += dt;

            let a: { voices?: Record<string, { env?: number; amp?: number }> } | undefined;
            try {
                a = (window as unknown as { __scAudio?: typeof a }).__scAudio;
            } catch { a = undefined; }
            const dEnv = a?.voices?.drone?.env ?? 0;
            const pEnv = a?.voices?.pad?.env ?? 0;
            const percEnv = a?.voices?.perc?.env ?? 0;

            // Slow on the way up as well as down. A drone that snapped to its
            // level would be as abrupt as the randomness it replaces.
            const k = 1 - Math.exp(-dt / 1.8);
            drone += (dEnv - drone) * k;
            pad   += (pEnv - pad) * k;

            // BOWL and CHINA, from this slot's own mirror. Both down and the
            // struck voice has no halves, so nothing here can throw anything.
            let bowl = 1, china = 1;
            try {
                const sp = (window as unknown as Record<string, Record<string, number>>)[slotKey];
                if (sp) {
                    bowl = sp["voice:bowl"] ?? 1;
                    china = sp["voice:china"] ?? 1;
                }
            } catch { /* the defaults stand */ }
            halves = Math.max(bowl, china);

            // Rising edge on the struck voice, gated by whether either half is
            // up. Decay ~1.2 s, so a hit is a push the structure recovers from
            // rather than a permanent displacement.
            if (percEnv > lastPercEnv + 0.06 && halves > 0.02) {
                strike = Math.max(strike, Math.min(1, percEnv * 0.9) * halves);
            }
            lastPercEnv = percEnv;
            strike *= Math.exp(-dt / 0.42);
            if (strike < 0.001) strike = 0;
        },
    };
}
