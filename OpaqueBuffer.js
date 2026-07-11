/*
@nwWrld name: PhenologicalCalendar
@nwWrld category: 3D
@nwWrld imports: BaseThreeJsModule, THREE, loadJson
*/

/*
 * PhenologicalCalendar — Finca Manakai, Planeta Rica, Córdoba, Colombia.
 *
 * Reads the consolidated species inventory (572 species across flora,
 * amphibians, reptiles, mammals, birds) from
 *   assets/json/manakai_species.json
 * and arranges them around a 365-day ring as a luminous HUD.
 *
 * Each species is deterministically assigned a "phenological peak day"
 * from its scientific name (so the layout is stable across reloads) and
 * weighted by taxa-specific tropical seasonality models for Córdoba's
 * bimodal rainfall regime:
 *
 *   - Flora (herbs, climbers)  : peak in the two rainy seasons
 *   - Trees                    : staggered flowering, dry-season bias
 *   - Amphibians               : explode with onset of rains
 *   - Reptiles                 : warm-dry months
 *   - Birds (resident)         : early-rains breeding
 *   - Birds (migratory hint)   : Boreal-winter visitor window (Oct–Mar)
 *   - Mammals                  : broader, less seasonal
 *
 * Steiner-inspired palette: lustrous peach, indigo, gold, violet-rose
 * on a chthonic teal-black. No fluorescent greens.
 */

class PhenologicalCalendar extends BaseThreeJsModule {
    static methods = [
        {
            name: "setDay",
            executeOnLoad: true,
            options: [
                { name: "day", defaultVal: 1, type: "number", min: 1, max: 365 },
            ],
        },
        {
            name: "advance",
            executeOnLoad: false,
            options: [
                { name: "days", defaultVal: 1, type: "number", min: -30, max: 30 },
            ],
        },
        {
            name: "autoplay",
            executeOnLoad: true,
            options: [
                { name: "enabled", defaultVal: true, type: "boolean" },
                { name: "daysPerSecond", defaultVal: 6, type: "number", min: 0.1, max: 60 },
            ],
        },
        {
            name: "jumpToMonth",
            executeOnLoad: false,
            options: [
                {
                    name: "month",
                    defaultVal: "Ene",
                    type: "select",
                    values: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
                },
            ],
        },
        {
            name: "focusTaxon",
            executeOnLoad: false,
            options: [
                {
                    name: "taxon",
                    defaultVal: "all",
                    type: "select",
                    values: ["all", "flora", "amphibians", "reptiles", "mammals", "birds"],
                },
            ],
        },
        {
            name: "pulse",
            executeOnLoad: false,
            options: [
                { name: "intensity", defaultVal: 1.4, type: "number", min: 0.5, max: 4 },
            ],
        },
        {
            name: "triggerCO2",
            executeOnLoad: false,
            options: [
                { name: "amount", defaultVal: 50, type: "number", min: 10, max: 200 }
            ]
        },
        {
            name: "triggerMycoPulse",
            executeOnLoad: false,
            options: [
                { name: "intensity", defaultVal: 1, type: "number", min: 0.1, max: 5 }
            ]
        },
        {
            name: "triggerPhosphorus",
            executeOnLoad: false,
            options: [
                { name: "amount", defaultVal: 30, type: "number", min: 10, max: 100 }
            ]
        },
        {
            name: "triggerNitrogen",
            executeOnLoad: false,
            options: [
                { name: "amount", defaultVal: 30, type: "number", min: 10, max: 100 }
            ]
        }
    ];

    // ---------- Steiner-inspired palette ----------
    static PALETTE = {
        bg: new THREE.Color("#0B1418"),  // chthonic teal-black
        peach: new THREE.Color("#E8A88C"),  // Steiner "Pfirsichblüt"
        gold: new THREE.Color("#D4B97A"),  // lustre gold
        indigo: new THREE.Color("#5C6E94"),  // lustre indigo (lifted)
        violet: new THREE.Color("#A98AB5"),  // violet-rose
        olive: new THREE.Color("#8B9474"),  // muted living green (not fluo)
        ivory: new THREE.Color("#E8DFC8"),  // warm white for HUD text
        rust: new THREE.Color("#B66E54"),  // rust accent
    };

    // Taxon → orbit assignment (innermost → outermost)
    static TAXA = [
        { key: "flora", label: "FLORA", color: "olive", radius: 0.46 },
        { key: "amphibians", label: "AMPHIBIA", color: "violet", radius: 0.58 },
        { key: "reptiles", label: "REPTILIA", color: "rust", radius: 0.68 },
        { key: "mammals", label: "MAMMALIA", color: "gold", radius: 0.78 },
        { key: "birds", label: "AVES", color: "peach", radius: 0.90 },
    ];

    static MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    static MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]; // non-leap

    constructor(container) {
        super(container);

        this.day = 1;                   // 1..365
        this.species = [];              // flat list of all species records
        this.taxonGroups = {};          // key -> THREE.Group
        this.speciesMeshes = [];        // array of {mesh, peakDay, taxon, record, baseColor}
        this.ringGroup = null;
        this.cursorGroup = null;
        this.glassPanels = [];          // {plane, canvas, ctx, texture, update()}
        this.focusedTaxon = "all";
        this.autoplayEnabled = true;
        this.daysPerSecond = 6;
        this._dayAccumulator = 0;
        this._lastFrameTime = performance.now();
        this._pulseAmount = 0;
        this._pulseDecay = 0;
        this._highlightSpecies = null;
        this._t = 0;

        // --- BIOCRACY / BENEVOLENCE STATE ---
        this.biocracyMode = false;
        this.obLogs = [];              // Overlap Buffer alert logs
        this.particles = [];           // Nomad particles
        this.nomadPool = [];           // Pool of meshes for nomads
        this.filamentPool = [];        // Pool of lines for mycorrhizal filaments
        this.filamentGroup = null;
        this.nomadGroup = null;
        this._bridgeWS = null;
        this._bridgeReady = false;
        this._lastHighlightSpecies = null;

        // Bind keyboard handler
        this._onKeyDown = this._onKeyDown.bind(this);
        window.addEventListener("keydown", this._onKeyDown);

        this.init();
    }

    // ----------------------------------------------------------------
    // INIT
    // ----------------------------------------------------------------

    init() {
        if (!THREE) return;

        this.scene.background = PhenologicalCalendar.PALETTE.bg.clone();
        this.scene.fog = new THREE.Fog(PhenologicalCalendar.PALETTE.bg, 6, 14);

        // Camera framing — slight tilt so it reads as a HUD plate
        this.camera.position.set(0, 0.35, 3.4);
        this.camera.lookAt(0, 0, 0);
        if (this.controls) this.controls.enabled = false;

        // Lighting — soft, mostly relying on emissive / vertex colors
        const amb = new THREE.AmbientLight(0xffffff, 0.45);
        this.scene.add(amb);
        const key = new THREE.DirectionalLight(0xE8DFC8, 0.4);
        key.position.set(2, 3, 4);
        this.scene.add(key);

        // Setup groups for filaments and nomads
        this.filamentGroup = new THREE.Group();
        this.scene.add(this.filamentGroup);

        this.nomadGroup = new THREE.Group();
        this.scene.add(this.nomadGroup);

        // Build the static HUD frame
        this._buildBackdrop();
        this._buildRing();
        this._buildTaxonOrbits();
        this._buildGlassPanels();
        this._buildCursor();

        // Load species data
        this._loadSpecies();

        this.show();
        this._animate = this._animate.bind(this);
        this._animationId = requestAnimationFrame(this._animate);
    }

    // ----------------------------------------------------------------
    // DATA LOADING + PHENOLOGY MODEL
    // ----------------------------------------------------------------

    async _loadSpecies() {
        const data = await loadJson("json/manakai_species.json");
        if (!data) {
            console.warn("[PhenologicalCalendar] manakai_species.json not found; using inline fallback");
            this._populateFromData(this._fallbackData());
        } else {
            this._populateFromData(data);
        }
        this._renderAll();
    }

    _populateFromData(data) {
        const flat = [];
        const seen = new Set();
        const push = (taxon, list) => {
            if (!Array.isArray(list)) return;
            for (const r of list) {
                if (!r || !r.s) continue;
                const key = taxon + "|" + r.s.trim().toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                flat.push({ taxon, sci: r.s.trim(), common: r.c || null, family: r.f || null, habit: r.h || null, origin: r.o || null, succession: r.su || null });
            }
        };
        push("flora", data.flora);
        push("amphibians", data.amphibians);
        push("reptiles", data.reptiles);
        push("mammals", data.mammals);
        push("birds", data.birds);

        // Assign deterministic phenological peak days from scientific name + taxon model
        for (const s of flat) {
            s.peakDay = this._assignPeakDay(s);
            // activity window half-width in days (taxa-specific)
            s.window = this._assignWindow(s);
        }
        this.species = flat;
        this._buildSpeciesNodes();
    }

    // Deterministic hash → [0,1)
    _hash01(str) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0) / 4294967296;
    }

    /*
     * Tropical Córdoba bimodal phenology model.
     * Returns a day 1..365.
     *
     *   - Flora herbs / climbers : two peaks ~ Apr–May (115) and Sep–Oct (270)
     *   - Trees                  : staggered, leaning Mar (75) and Aug (220)
     *   - Amphibians             : sharp peak with first rains (Apr, 110)
     *   - Reptiles               : warm-dry (Feb–Mar, 60)
     *   - Mammals                : broad, ~ Jul (190)
     *   - Birds resident         : breeding around early rains (May, 135)
     *   - Birds family hint:
     *       Parulidae, Tyrannidae migratory genera, Catharus, etc.
     *       wintering visitors → mid Nov (315)
     */
    _assignPeakDay(s) {
        const h1 = this._hash01(s.sci + "|peak");
        const h2 = this._hash01(s.sci + "|mode");

        if (s.taxon === "flora") {
            const isTree = (s.habit && /árbol|arbol|palmoide/i.test(s.habit));
            if (isTree) {
                const c = h2 < 0.5 ? 75 : 220;
                return this._wrapDay(c + this._gaussian(h1) * 30);
            } else {
                const c = h2 < 0.5 ? 115 : 270;
                return this._wrapDay(c + this._gaussian(h1) * 22);
            }
        }
        if (s.taxon === "amphibians") {
            // bimodal: first rains stronger, second rains weaker
            const c = h2 < 0.65 ? 110 : 275;
            return this._wrapDay(c + this._gaussian(h1) * 18);
        }
        if (s.taxon === "reptiles") {
            const c = 60;
            return this._wrapDay(c + this._gaussian(h1) * 45);
        }
        if (s.taxon === "mammals") {
            return this._wrapDay(190 + this._gaussian(h1) * 70);
        }
        if (s.taxon === "birds") {
            // Boreal-winter Nearctic migrants in the Manakai data:
            //  Parulidae, Hirundinidae (Progne/Tachycineta), Catharus spp.,
            //  Contopus virens, Tyrannus savana/tyrannus (but NOT T. melancholicus — resident)
            const migFamilies = /parulidae|hirundinidae/i;
            const migGenera = /^(catharus|contopus|piranga|setophaga|empidonax|dolichonyx|protonotaria|leiothlypis|parkesia|mniotilta)/i;
            const migSpecies = /tyrannus savana|tyrannus tyrannus/i;
            const isMig = (s.family && migFamilies.test(s.family))
                || (s.sci && migGenera.test(s.sci))
                || (s.sci && migSpecies.test(s.sci));
            if (isMig) {
                return this._wrapDay(315 + this._gaussian(h1) * 35);
            }
            return this._wrapDay(135 + this._gaussian(h1) * 40);
        }
        return Math.floor(h1 * 365) + 1;
    }

    _assignWindow(s) {
        // typical activity half-window (days) per taxon
        const map = { flora: 38, amphibians: 22, reptiles: 55, mammals: 60, birds: 35 };
        return map[s.taxon] || 30;
    }

    _gaussian(u) {
        // crude Box–Muller-ish from one uniform, returns roughly N(0,1)
        const v = this._hash01(String(u * 9301 + 49297));
        return Math.sqrt(-2 * Math.log(Math.max(1e-6, u))) * Math.cos(2 * Math.PI * v);
    }

    _wrapDay(d) {
        d = Math.round(d);
        while (d < 1) d += 365;
        while (d > 365) d -= 365;
        return d;
    }

    _fallbackData() {
        return {
            birds: [{ s: "Ramphocelus dimidiatus", c: "Toche", f: "Thraupidae" }],
            amphibians: [{ s: "Rhinella horribilis", c: "Sapo común", f: "Bufonidae" }],
            reptiles: [{ s: "Caiman crocodilus", c: "Babilla", f: "Crocodylidae" }],
            mammals: [{ s: "Cerdocyon thous", c: "Zorra", f: "Canidae" }],
            flora: [{ s: "Cordia alliodora", c: "Vara de humo", f: "Boraginaceae", h: "Árbol" }],
        };
    }

    // ----------------------------------------------------------------
    // SCENE CONSTRUCTION
    // ----------------------------------------------------------------

    _buildBackdrop() {
        // very subtle radial gradient behind the ring, drawn as a plane
        const size = 8;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 512;
        const ctx = canvas.getContext("2d");
        const g = ctx.createRadialGradient(256, 256, 40, 256, 256, 256);
        g.addColorStop(0, "rgba(40, 60, 80, 0.55)");
        g.addColorStop(0.5, "rgba(20, 30, 40, 0.25)");
        g.addColorStop(1, "rgba(11, 20, 24, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 512);
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
        mesh.position.z = -0.6;
        this.scene.add(mesh);
        this._backdrop = mesh;
    }

    _buildRing() {
        const P = PhenologicalCalendar.PALETTE;
        this.ringGroup = new THREE.Group();

        // Outer guide ring
        const outer = this._dashedRing(1.05, 360, P.ivory, 0.18);
        this.ringGroup.add(outer);

        // Inner guide ring
        const inner = this._solidRing(0.42, 0.422, P.indigo, 0.35);
        this.ringGroup.add(inner);

        // Day ticks: 365 small radial marks between r=1.05 and r=1.10
        const tickPositions = new Float32Array(365 * 2 * 3);
        const tickColors = new Float32Array(365 * 2 * 3);
        for (let i = 0; i < 365; i++) {
            const a = (i / 365) * Math.PI * 2 - Math.PI / 2; // start at top
            const isMonthEdge = PhenologicalCalendar.MONTH_STARTS.includes(i);
            const isDecade = (i % 10 === 0);
            const r1 = 1.05;
            const r2 = isMonthEdge ? 1.135 : (isDecade ? 1.105 : 1.085);
            const c = isMonthEdge ? P.peach : (isDecade ? P.gold : P.ivory);
            const alpha = isMonthEdge ? 1.0 : (isDecade ? 0.55 : 0.18);
            tickPositions[i * 6 + 0] = Math.cos(a) * r1;
            tickPositions[i * 6 + 1] = Math.sin(a) * r1;
            tickPositions[i * 6 + 2] = 0;
            tickPositions[i * 6 + 3] = Math.cos(a) * r2;
            tickPositions[i * 6 + 4] = Math.sin(a) * r2;
            tickPositions[i * 6 + 5] = 0;
            for (let k = 0; k < 2; k++) {
                tickColors[i * 6 + k * 3 + 0] = c.r * alpha;
                tickColors[i * 6 + k * 3 + 1] = c.g * alpha;
                tickColors[i * 6 + k * 3 + 2] = c.b * alpha;
            }
        }
        const tickGeom = new THREE.BufferGeometry();
        tickGeom.setAttribute("position", new THREE.BufferAttribute(tickPositions, 3));
        tickGeom.setAttribute("color", new THREE.BufferAttribute(tickColors, 3));
        const tickMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending });
        const ticks = new THREE.LineSegments(tickGeom, tickMat);
        this.ringGroup.add(ticks);
        this._tickGeom = tickGeom;

        // Month labels (drawn into a single canvas texture)
        this._buildMonthLabels();

        this.scene.add(this.ringGroup);
    }

    _dashedRing(radius, segments, color, opacity) {
        const points = [];
        const dash = 4; // every 'dash' segments, draw two
        for (let i = 0; i < segments; i++) {
            if (i % dash === 0) {
                const a1 = (i / segments) * Math.PI * 2;
                const a2 = ((i + 1) / segments) * Math.PI * 2;
                points.push(new THREE.Vector3(Math.cos(a1) * radius, Math.sin(a1) * radius, 0));
                points.push(new THREE.Vector3(Math.cos(a2) * radius, Math.sin(a2) * radius, 0));
            }
        }
        const geom = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending });
        return new THREE.LineSegments(geom, mat);
    }

    _solidRing(rInner, rOuter, color, opacity) {
        const geom = new THREE.RingGeometry(rInner, rOuter, 256);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
        return new THREE.Mesh(geom, mat);
    }

    _buildMonthLabels() {
        const canvas = document.createElement("canvas");
        canvas.width = 2048; canvas.height = 2048;
        const ctx = canvas.getContext("2d");
        ctx.translate(1024, 1024);
        ctx.font = "600 56px ui-monospace, 'JetBrains Mono', 'IBM Plex Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const labelR = 880; // px in canvas space
        for (let m = 0; m < 12; m++) {
            const startDay = PhenologicalCalendar.MONTH_STARTS[m];
            const nextStart = (m === 11) ? 365 : PhenologicalCalendar.MONTH_STARTS[m + 1];
            const midDay = (startDay + nextStart) / 2;
            const a = (midDay / 365) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(a) * labelR;
            const y = Math.sin(a) * labelR;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(a + Math.PI / 2);
            ctx.fillStyle = "rgba(232,223,200,0.75)";
            ctx.fillText(PhenologicalCalendar.MONTHS_ES[m].toUpperCase(), 0, 0);
            ctx.restore();
        }
        // Faint cardinal day markers: 1, 91, 182, 274
        ctx.font = "400 26px ui-monospace, monospace";
        ctx.fillStyle = "rgba(212,185,122,0.5)";
        const cardinals = [{ d: 1, r: 990 }, { d: 91, r: 990 }, { d: 182, r: 990 }, { d: 274, r: 990 }];
        for (const c of cardinals) {
            const a = (c.d / 365) * Math.PI * 2 - Math.PI / 2;
            ctx.save();
            ctx.translate(Math.cos(a) * c.r, Math.sin(a) * c.r);
            ctx.rotate(a + Math.PI / 2);
            ctx.fillText(`d${c.d}`, 0, 0);
            ctx.restore();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), mat);
        this.ringGroup.add(mesh);
    }

    _buildTaxonOrbits() {
        const P = PhenologicalCalendar.PALETTE;
        for (const t of PhenologicalCalendar.TAXA) {
            const ring = this._dashedRing(t.radius, 180, P[t.color], 0.25);
            this.ringGroup.add(ring);
            const g = new THREE.Group();
            this.taxonGroups[t.key] = g;
            this.scene.add(g);
        }
    }

    _buildSpeciesNodes() {
        // Clear any prior
        for (const m of this.speciesMeshes) {
            m.mesh.geometry.dispose?.();
            m.mesh.material.dispose?.();
            m.mesh.parent?.remove(m.mesh);
        }
        this.speciesMeshes.length = 0;

        const P = PhenologicalCalendar.PALETTE;

        for (const t of PhenologicalCalendar.TAXA) {
            const group = this.taxonGroups[t.key];
            const baseColor = P[t.color];
            const list = this.species.filter(s => s.taxon === t.key);

            // BufferGeometry of points, one per species
            const N = list.length;
            if (N === 0) continue;
            const positions = new Float32Array(N * 3);
            const colors = new Float32Array(N * 3);
            const sizes = new Float32Array(N);
            const records = [];

            for (let i = 0; i < N; i++) {
                const s = list[i];
                const a = (s.peakDay / 365) * Math.PI * 2 - Math.PI / 2;
                const rJitter = (this._hash01(s.sci + "|r") - 0.5) * 0.03;
                const r = t.radius + rJitter;
                positions[i * 3 + 0] = Math.cos(a) * r;
                positions[i * 3 + 1] = Math.sin(a) * r;
                positions[i * 3 + 2] = 0;
                // start dim
                colors[i * 3 + 0] = baseColor.r * 0.25;
                colors[i * 3 + 1] = baseColor.g * 0.25;
                colors[i * 3 + 2] = baseColor.b * 0.25;
                sizes[i] = 8;
                records.push({ rec: s, baseColor, taxon: t.key, idx: i });
            }
            const geom = new THREE.BufferGeometry();
            geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
            geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
            geom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

            const mat = new THREE.PointsMaterial({
                size: 0.018,
                vertexColors: true,
                transparent: true,
                opacity: 1,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                sizeAttenuation: true,
            });
            const pts = new THREE.Points(geom, mat);
            group.add(pts);

            this.speciesMeshes.push({
                type: "points",
                mesh: pts,
                geom,
                records,   // [{rec, baseColor, taxon, idx}]
                taxon: t.key,
            });
        }
    }

    _buildCursor() {
        // Day cursor: a thin radial line that sweeps the ring, plus a glowing arc segment
        this.cursorGroup = new THREE.Group();

        // Long radial line
        const lineGeom = new THREE.BufferGeometry();
        lineGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 1.14, 0]), 3));
        const lineMat = new THREE.LineBasicMaterial({
            color: PhenologicalCalendar.PALETTE.peach,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
        });
        this._cursorLine = new THREE.Line(lineGeom, lineMat);
        this.cursorGroup.add(this._cursorLine);

        // Small luminous head at outer end
        const head = new THREE.Mesh(
            new THREE.CircleGeometry(0.028, 24),
            new THREE.MeshBasicMaterial({
                color: PhenologicalCalendar.PALETTE.ivory,
                transparent: true,
                opacity: 1,
                blending: THREE.AdditiveBlending,
            })
        );
        head.position.set(0, 1.10, 0.001);
        this._cursorHead = head;
        this.cursorGroup.add(head);

        // Trailing arc: a thin glowing arc from day-7 to day
        const arcSegments = 40;
        const arcGeom = new THREE.BufferGeometry();
        const arcPos = new Float32Array((arcSegments + 1) * 3);
        const arcCol = new Float32Array((arcSegments + 1) * 3);
        arcGeom.setAttribute("position", new THREE.BufferAttribute(arcPos, 3));
        arcGeom.setAttribute("color", new THREE.BufferAttribute(arcCol, 3));
        const arcMat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
        });
        this._cursorArc = new THREE.Line(arcGeom, arcMat);
        this._cursorArcSegments = arcSegments;
        this.cursorGroup.add(this._cursorArc);

        this.scene.add(this.cursorGroup);
    }

    _buildGlassPanels() {
        // Four glass panels around the ring:
        //   TL: Day / Date readout
        //   TR: Active species count + breakdown
        //   BL: Highlighted species (largest peak-active)
        //   BR: Site / coordinates / regime
        const layouts = [
            { id: "date", pos: new THREE.Vector3(-1.55, 1.05, 0), size: [1.1, 0.62] },
            { id: "counts", pos: new THREE.Vector3(1.55, 1.05, 0), size: [1.1, 0.62] },
            { id: "focus", pos: new THREE.Vector3(-1.55, -1.05, 0), size: [1.1, 0.62] },
            { id: "site", pos: new THREE.Vector3(1.55, -1.05, 0), size: [1.1, 0.62] },
        ];

        for (const L of layouts) {
            const canvas = document.createElement("canvas");
            canvas.width = 1024;
            canvas.height = Math.round(1024 * (L.size[1] / L.size[0]));
            const ctx = canvas.getContext("2d");
            const tex = new THREE.CanvasTexture(canvas);
            tex.anisotropy = 4;

            const mat = new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true,
                depthWrite: false,
                blending: THREE.NormalBlending,
            });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(L.size[0], L.size[1]), mat);
            mesh.position.copy(L.pos);
            this.scene.add(mesh);

            this.glassPanels.push({
                id: L.id,
                plane: mesh,
                canvas, ctx, texture: tex,
                size: L.size,
            });
        }
    }

    // ----------------------------------------------------------------
    // RENDER (per-frame + per-day)
    // ----------------------------------------------------------------

    _animate() {
        this._animationId = requestAnimationFrame(this._animate);
        const now = performance.now();
        const dt = Math.min(0.1, (now - this._lastFrameTime) / 1000);
        this._lastFrameTime = now;
        this._t += dt;

        // Autoplay day advance
        if (this.autoplayEnabled) {
            this._dayAccumulator += dt * this.daysPerSecond;
            if (this._dayAccumulator >= 1) {
                const adv = Math.floor(this._dayAccumulator);
                this._dayAccumulator -= adv;
                this._setDayInternal(this.day + adv, false);
            }
        }

        // Pulse decay
        if (this._pulseAmount > 0) {
            this._pulseAmount = Math.max(0, this._pulseAmount - dt * 1.6);
        }

        // Cybernetic visual breath and node updates
        if (this.biocracyMode) {
            const rain = this._getRaininess(this.day);
            const cDry = new THREE.Color("#1A120D");
            const cWet = new THREE.Color("#051214");
            const currentBg = cDry.clone().lerp(cWet, rain);

            this.scene.background.copy(currentBg);
            if (this.scene.fog) {
                this.scene.fog.color.copy(currentBg);
                this.scene.fog.near = THREE.MathUtils.lerp(6, 4.5, rain);
                this.scene.fog.far = THREE.MathUtils.lerp(14, 11, rain);
            }

            // Update nomadic particles and filaments
            this._updateParticles(dt);
            this._updateFilaments();
        }

        // Subtle breathing of cursor head
        if (this._cursorHead) {
            const b = 1 + 0.15 * Math.sin(this._t * 2.4);
            this._cursorHead.scale.setScalar(b);
        }

        this._updateSpeciesLuminance();
        this._renderHUD();

        // Stamp textures every frame
        for (const p of this.glassPanels) p.texture.needsUpdate = true;

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    _setDayInternal(d, render = true) {
        d = ((Math.round(d) - 1) % 365 + 365) % 365 + 1;
        this.day = d;
        this._updateCursor();
        if (render) {
            this._updateSpeciesLuminance();
            this._renderHUD();
        }
    }

    _updateCursor() {
        if (!this.cursorGroup) return;
        const a = (this.day / 365) * Math.PI * 2 - Math.PI / 2;
        // Rotate the cursor group so the line stays along +Y in local space, but globally points to angle a
        // We built line along +Y; rotate by (a - Math.PI/2)
        this.cursorGroup.rotation.z = a - Math.PI / 2;

        // Update trailing arc
        if (this._cursorArc) {
            const segs = this._cursorArcSegments;
            const pos = this._cursorArc.geometry.attributes.position.array;
            const col = this._cursorArc.geometry.attributes.color.array;
            const peach = PhenologicalCalendar.PALETTE.peach;
            const r = 1.04;
            for (let i = 0; i <= segs; i++) {
                const f = i / segs;
                const aBack = a - f * 0.35; // ~ 20 deg trail
                pos[i * 3 + 0] = Math.cos(aBack) * r;
                pos[i * 3 + 1] = Math.sin(aBack) * r;
                pos[i * 3 + 2] = 0;
                const alpha = (1 - f) * 0.9;
                col[i * 3 + 0] = peach.r * alpha;
                col[i * 3 + 1] = peach.g * alpha;
                col[i * 3 + 2] = peach.b * alpha;
            }
            this._cursorArc.geometry.attributes.position.needsUpdate = true;
            this._cursorArc.geometry.attributes.color.needsUpdate = true;
        }
    }

    _renderAll() {
        this._updateCursor();
        this._updateSpeciesLuminance();
        this._renderHUD();
    }

    // Compute proximity of cursor (this.day) to each species' peak (cyclic)
    // and update vertex colors / sizes.
    _updateSpeciesLuminance() {
        const cur = this.day;
        const pulse = this._pulseAmount;

        let activeCounts = { flora: 0, amphibians: 0, reptiles: 0, mammals: 0, birds: 0 };
        let topActivity = -1;
        let topRecord = null;

        for (const entry of this.speciesMeshes) {
            const geom = entry.geom;
            const cArr = geom.attributes.color.array;
            const sArr = geom.attributes.size.array;
            const pArr = geom.attributes.position.array;
            const focused = (this.focusedTaxon === "all" || this.focusedTaxon === entry.taxon);

            for (const r of entry.records) {
                const s = r.rec;
                const base = r.baseColor;
                // cyclic distance in days
                let d = Math.abs(s.peakDay - cur);
                if (d > 182) d = 365 - d;
                const w = s.window;
                // gaussian-like activity, peak=1
                const activity = Math.exp(-(d * d) / (2 * w * w * 0.6));
                // visual lift
                const focusMult = focused ? 1 : 0.18;

                // Opacity Clause: sensitive species have a luminance floor when biocracy mode is active
                const isSens = this.biocracyMode && this._isSensitive(s);
                const base_glow = isSens ? 0.35 : (0.18 + 0.95 * activity);
                const lift = (base_glow + pulse * 0.5 * activity) * focusMult;

                cArr[r.idx * 3 + 0] = base.r * lift;
                cArr[r.idx * 3 + 1] = base.g * lift;
                cArr[r.idx * 3 + 2] = base.b * lift;
                sArr[r.idx] = (5 + 12 * activity + pulse * 8 * activity) * focusMult;

                // Update node position (with jitter if sensitive and mode is active)
                const pos = this._getSpeciesPos(s);
                pArr[r.idx * 3 + 0] = pos.x;
                pArr[r.idx * 3 + 1] = pos.y;
                pArr[r.idx * 3 + 2] = pos.z;

                if (activity > 0.5) activeCounts[entry.taxon]++;
                if (focused && activity > topActivity) {
                    topActivity = activity;
                    topRecord = s;
                }
            }
            geom.attributes.color.needsUpdate = true;
            geom.attributes.size.needsUpdate = true;
            geom.attributes.position.needsUpdate = true;
        }
        this._activeCounts = activeCounts;
        this._highlightSpecies = topRecord;

        // Sound Engine trigger on focused peak change (Lampsacus)
        if (this.biocracyMode && this._highlightSpecies !== this._lastHighlightSpecies) {
            this._lastHighlightSpecies = this._highlightSpecies;
            if (this._highlightSpecies) {
                this._emitActiveSpecies(this._highlightSpecies);
            }
        }
    }

    // ----------------------------------------------------------------
    // HUD CANVAS RENDERING
    // ----------------------------------------------------------------

    _renderHUD() {
        for (const p of this.glassPanels) {
            this._drawGlassFrame(p);
            switch (p.id) {
                case "date": this._drawDatePanel(p); break;
                case "counts": this._drawCountsPanel(p); break;
                case "focus": this._drawFocusPanel(p); break;
                case "site": this._drawSitePanel(p); break;
            }
        }
    }

    _drawGlassFrame(p) {
        const { ctx, canvas } = p;
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        // Glass body — soft vertical gradient with slight saturation
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, "rgba(70, 88, 110, 0.32)");
        grad.addColorStop(0.5, "rgba(40, 56, 72, 0.28)");
        grad.addColorStop(1, "rgba(20, 30, 38, 0.40)");
        this._roundedRectPath(ctx, 8, 8, W - 16, H - 16, 14);
        ctx.fillStyle = grad;
        ctx.fill();

        // Soft top highlight (glass)
        const hi = ctx.createLinearGradient(0, 0, 0, H * 0.4);
        hi.addColorStop(0, "rgba(232, 223, 200, 0.18)");
        hi.addColorStop(1, "rgba(232, 223, 200, 0.0)");
        this._roundedRectPath(ctx, 8, 8, W - 16, (H - 16) * 0.5, 14);
        ctx.fillStyle = hi;
        ctx.fill();

        // 1px ivory edge
        this._roundedRectPath(ctx, 8, 8, W - 16, H - 16, 14);
        ctx.strokeStyle = "rgba(232, 223, 200, 0.35)";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Inner indigo edge (double-stroke for HUD feel)
        this._roundedRectPath(ctx, 14, 14, W - 28, H - 28, 11);
        ctx.strokeStyle = "rgba(92, 110, 148, 0.25)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Corner brackets
        this._drawCornerBrackets(ctx, 8, 8, W - 16, H - 16, 18, "rgba(212, 185, 122, 0.75)");
    }

    _roundedRectPath(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    _drawCornerBrackets(ctx, x, y, w, h, L, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        const dx = 6;
        // top-left
        ctx.beginPath();
        ctx.moveTo(x - dx, y + L); ctx.lineTo(x - dx, y - dx); ctx.lineTo(x + L, y - dx);
        ctx.stroke();
        // top-right
        ctx.beginPath();
        ctx.moveTo(x + w - L, y - dx); ctx.lineTo(x + w + dx, y - dx); ctx.lineTo(x + w + dx, y + L);
        ctx.stroke();
        // bottom-left
        ctx.beginPath();
        ctx.moveTo(x - dx, y + h - L); ctx.lineTo(x - dx, y + h + dx); ctx.lineTo(x + L, y + h + dx);
        ctx.stroke();
        // bottom-right
        ctx.beginPath();
        ctx.moveTo(x + w - L, y + h + dx); ctx.lineTo(x + w + dx, y + h + dx); ctx.lineTo(x + w + dx, y + h - L);
        ctx.stroke();
    }

    _dayToDate(day) {
        // Non-leap, return {monthIdx, dayOfMonth}
        let m = 0;
        for (let i = 0; i < 12; i++) {
            const start = PhenologicalCalendar.MONTH_STARTS[i];
            const next = (i === 11) ? 365 : PhenologicalCalendar.MONTH_STARTS[i + 1];
            if (day - 1 >= start && day - 1 < next) {
                m = i;
                return { monthIdx: m, dayOfMonth: (day - 1 - start) + 1 };
            }
        }
        return { monthIdx: 11, dayOfMonth: day - 334 };
    }

    _seasonForDay(day) {
        // Córdoba bimodal:
        //  Dec–Mar : Dry            (335–90)
        //  Apr–May : First rains    (91–151)
        //  Jun–Aug : Mid-dry        (152–243)
        //  Sep–Nov : Second rains   (244–334)
        if (day >= 335 || day <= 90) return { label: "Seca", tag: "Dry" };
        if (day <= 151) return { label: "Primeras lluvias", tag: "First rains" };
        if (day <= 243) return { label: "Medio seco", tag: "Mid-dry" };
        return { label: "Segundas lluvias", tag: "Second rains" };
    }

    _drawDatePanel(p) {
        const { ctx, canvas } = p;
        const W = canvas.width, H = canvas.height;
        const { monthIdx, dayOfMonth } = this._dayToDate(this.day);
        const month = PhenologicalCalendar.MONTHS_ES[monthIdx];
        const season = this._seasonForDay(this.day);

        ctx.font = "500 30px ui-monospace, monospace";
        ctx.fillStyle = "rgba(212,185,122,0.85)";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText("DAY ◊ DÍA", 36, 64);

        if (this.biocracyMode) {
            ctx.font = "600 22px ui-monospace, monospace";
            ctx.fillStyle = "rgba(169,138,181,0.95)";
            ctx.textAlign = "right";
            ctx.fillText("[BIOCRACY COUPLING]", W - 36, 64);
            ctx.textAlign = "left";
        }

        ctx.font = "700 168px ui-monospace, monospace";
        ctx.fillStyle = "rgba(232,223,200,0.96)";
        ctx.fillText(String(this.day).padStart(3, "0"), 36, 220);

        ctx.font = "500 28px ui-monospace, monospace";
        ctx.fillStyle = "rgba(232,168,140,0.85)";
        ctx.fillText(`${dayOfMonth.toString().padStart(2, "0")} ${month.toUpperCase()}`, 36, 262);

        // separator
        ctx.strokeStyle = "rgba(92,110,148,0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(36, 290); ctx.lineTo(W - 36, 290);
        ctx.stroke();

        ctx.font = "500 26px ui-monospace, monospace";
        ctx.fillStyle = "rgba(169,138,181,0.85)";
        ctx.fillText("RÉGIMEN", 36, 332);
        ctx.font = "600 36px ui-monospace, monospace";
        ctx.fillStyle = "rgba(232,223,200,0.95)";
        ctx.fillText(season.label.toUpperCase(), 36, 380);

        ctx.font = "400 22px ui-monospace, monospace";
        ctx.fillStyle = "rgba(212,185,122,0.55)";
        ctx.fillText(`▸ ${season.tag}`, 36, 412);
    }

    _drawCountsPanel(p) {
        const { ctx, canvas } = p;
        const W = canvas.width, H = canvas.height;
        const counts = this._activeCounts || { flora: 0, amphibians: 0, reptiles: 0, mammals: 0, birds: 0 };
        const total = counts.flora + counts.amphibians + counts.reptiles + counts.mammals + counts.birds;

        ctx.font = "500 30px ui-monospace, monospace";
        ctx.fillStyle = "rgba(212,185,122,0.85)";
        ctx.fillText("ACTIVE ◊ ACTIVAS", 36, 64);

        if (this.biocracyMode) {
            ctx.font = "600 22px ui-monospace, monospace";
            ctx.fillStyle = "rgba(232,168,140,0.95)";
            ctx.textAlign = "right";
            ctx.fillText("[OB SECURE]", W - 36, 64);
            ctx.textAlign = "left";
        }

        ctx.font = "700 168px ui-monospace, monospace";
        ctx.fillStyle = "rgba(232,223,200,0.96)";
        ctx.fillText(String(total).padStart(3, " "), 36, 220);

        ctx.font = "500 22px ui-monospace, monospace";
        ctx.fillStyle = "rgba(232,168,140,0.7)";
        ctx.fillText(`/ ${this.species.length} TOTAL`, 36, 252);

        ctx.strokeStyle = "rgba(92,110,148,0.55)";
        ctx.beginPath();
        ctx.moveTo(36, 280); ctx.lineTo(W - 36, 280);
        ctx.stroke();

        // breakdown bars
        const taxa = [
            { k: "birds", label: "AVES", col: "rgba(232,168,140,0.9)" },
            { k: "mammals", label: "MAMMALIA", col: "rgba(212,185,122,0.9)" },
            { k: "reptiles", label: "REPTILIA", col: "rgba(182,110, 84,0.9)" },
            { k: "amphibians", label: "AMPHIBIA", col: "rgba(169,138,181,0.9)" },
            { k: "flora", label: "FLORA", col: "rgba(139,148,116,0.9)" },
        ];
        const yBase = 320;
        const rowH = 36;
        const maxC = Math.max(1, ...taxa.map(t => counts[t.k]));
        ctx.font = "500 20px ui-monospace, monospace";
        for (let i = 0; i < taxa.length; i++) {
            const t = taxa[i];
            const y = yBase + i * rowH;
            ctx.fillStyle = "rgba(232,223,200,0.7)";
            ctx.fillText(t.label, 36, y + 22);
            const barX = 230;
            const barW = (W - 36 - barX - 60);
            ctx.fillStyle = "rgba(255,255,255,0.06)";
            ctx.fillRect(barX, y + 6, barW, 18);
            ctx.fillStyle = t.col;
            ctx.fillRect(barX, y + 6, barW * (counts[t.k] / maxC), 18);
            ctx.fillStyle = "rgba(232,223,200,0.85)";
            ctx.textAlign = "right";
            ctx.fillText(String(counts[t.k]).padStart(3, " "), W - 36, y + 22);
            ctx.textAlign = "left";
        }
    }

    _drawFocusPanel(p) {
        const { ctx, canvas } = p;
        const W = canvas.width, H = canvas.height;
        const s = this._highlightSpecies;

        ctx.font = "500 30px ui-monospace, monospace";
        ctx.fillStyle = "rgba(212,185,122,0.85)";
        ctx.textAlign = "left";
        ctx.fillText("FOCUS ◊ EN PICO", 36, 64);

        if (!s) {
            ctx.font = "500 32px ui-monospace, monospace";
            ctx.fillStyle = "rgba(232,223,200,0.55)";
            ctx.fillText("— quietud —", 36, 200);
            return;
        }

        const taxaColors = {
            flora: "rgba(139,148,116,0.95)",
            amphibians: "rgba(169,138,181,0.95)",
            reptiles: "rgba(182,110,84,0.95)",
            mammals: "rgba(212,185,122,0.95)",
            birds: "rgba(232,168,140,0.95)",
        };

        const isSens = this.biocracyMode && this._isSensitive(s);
        const sciName = isSens ? "Sp. ✶ (Vulnerable)" : s.sci;
        const commonName = isSens ? "[ OPACIDAD ÉTICA ]" : (s.common || "");
        const familyName = isSens ? "Sensitive" : (s.family || "");

        ctx.font = "500 22px ui-monospace, monospace";
        ctx.fillStyle = taxaColors[s.taxon] || "rgba(232,223,200,0.85)";
        ctx.fillText(`▸ ${s.taxon.toUpperCase()}  ▸ pico d${s.peakDay}`, 36, 110);

        if (isSens) {
            ctx.fillStyle = "rgba(182,110,84,0.95)";
            ctx.textAlign = "right";
            ctx.fillText("[CLÁUSULA DE OPACIDAD]", W - 36, 110);
            ctx.textAlign = "left";
        }

        ctx.font = "italic 600 44px Georgia, 'Cormorant Garamond', serif";
        ctx.fillStyle = isSens ? "rgba(182,110,84,0.85)" : "rgba(232,223,200,0.98)";
        this._wrapText(ctx, sciName, 36, 174, W - 72, 50);

        if (commonName) {
            ctx.font = "400 28px ui-monospace, monospace";
            ctx.fillStyle = "rgba(232,168,140,0.85)";
            this._wrapText(ctx, commonName, 36, 270, W - 72, 34);
        }

        ctx.font = "500 22px ui-monospace, monospace";
        ctx.fillStyle = "rgba(92,110,148,0.85)";
        ctx.fillText(`fam. ${familyName}`, 36, 360);

        const extras = [];
        if (!isSens) {
            if (s.habit) extras.push(s.habit);
            if (s.origin) extras.push(s.origin);
            if (s.succession) extras.push(s.succession);
        } else {
            extras.push("Protección Ecológica Activa");
        }
        if (extras.length) {
            ctx.font = "400 20px ui-monospace, monospace";
            ctx.fillStyle = "rgba(212,185,122,0.65)";
            ctx.fillText(extras.join(" · "), 36, 400);
        }
    }

    _drawSitePanel(p) {
        const { ctx, canvas } = p;
        const W = canvas.width, H = canvas.height;

        ctx.font = "500 30px ui-monospace, monospace";
        ctx.fillStyle = "rgba(212,185,122,0.85)";
        ctx.fillText("SITE ◊ SITIO", 36, 64);

        ctx.font = "italic 600 38px Georgia, serif";
        ctx.fillStyle = "rgba(232,223,200,0.96)";
        ctx.fillText("Finca Manakai", 36, 130);

        ctx.font = "400 26px ui-monospace, monospace";
        ctx.fillStyle = "rgba(232,168,140,0.85)";
        ctx.fillText("Planeta Rica, Córdoba", 36, 174);
        ctx.fillStyle = "rgba(232,223,200,0.7)";
        ctx.fillText("Colombia", 36, 208);

        ctx.strokeStyle = "rgba(92,110,148,0.55)";
        ctx.beginPath();
        ctx.moveTo(36, 240); ctx.lineTo(W - 36, 240);
        ctx.stroke();

        if (this.biocracyMode) {
            // OB Logs / Alerts instead of coordinates
            ctx.font = "600 22px ui-monospace, monospace";
            ctx.fillStyle = "rgba(182,110,84,0.95)";
            ctx.fillText("OVERLAP BUFFER (OB) ALERTS", 36, 280);

            ctx.font = "400 18px ui-monospace, monospace";
            ctx.fillStyle = "rgba(232,223,200,0.8)";
            const startY = 320;
            const stepY = 28;
            for (let i = 0; i < this.obLogs.length; i++) {
                ctx.fillText(this.obLogs[i], 36, startY + i * stepY);
            }
        } else {
            // standard coordinates & telemetry
            ctx.font = "500 22px ui-monospace, monospace";
            ctx.fillStyle = "rgba(212,185,122,0.85)";
            ctx.fillText("08.47° N  ·  75.58° W", 36, 282);

            ctx.font = "400 20px ui-monospace, monospace";
            ctx.fillStyle = "rgba(232,223,200,0.65)";
            ctx.fillText("régimen bimodal · trópico húmedo", 36, 318);

            ctx.font = "500 22px ui-monospace, monospace";
            ctx.fillStyle = "rgba(169,138,181,0.85)";
            ctx.fillText(`SPECIES ${this.species.length}  ◊  365 d`, 36, 372);
        }

        // mini progress
        const barX = 36, barY = 440, barW = W - 72, barH = 6;
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = "rgba(232,168,140,0.9)";
        ctx.fillRect(barX, barY, barW * (this.day / 365), barH);
    }

    _wrapText(ctx, text, x, y, maxW, lineH) {
        const words = String(text).split(/\s+/);
        let line = "";
        for (let i = 0; i < words.length; i++) {
            const test = line ? line + " " + words[i] : words[i];
            const w = ctx.measureText(test).width;
            if (w > maxW && line) {
                ctx.fillText(line, x, y);
                y += lineH;
                line = words[i];
            } else {
                line = test;
            }
        }
        if (line) ctx.fillText(line, x, y);
    }

    // ----------------------------------------------------------------
    // PUBLIC METHODS
    // ----------------------------------------------------------------

    setDay({ day = 1, isRemote = false } = {}) {
        const d = Number(day) || 1;
        if (isRemote && !this.biocracyMode) return;
        if (this.biocracyMode) {
            let diff = Math.abs(d - this.day);
            if (diff > 182) diff = 365 - diff;
            if (diff > 60) {
                this.logOB(`[OB] Temporal drift safeguard activated.`);
            }
        }
        this._setDayInternal(d, true);
    }

    advance({ days = 1, isRemote = false } = {}) {
        let dy = Number(days) || 1;
        if (isRemote && !this.biocracyMode) return;
        if (this.biocracyMode) {
            if (Math.abs(dy) > 15) {
                this.logOB(`[OB] Safeguard: Dampened excessive jump (${dy} to ${Math.sign(dy) * 5} d)`);
                dy = Math.sign(dy) * 5;
            }
        }
        this._setDayInternal(this.day + dy, true);
    }

    autoplay({ enabled = true, daysPerSecond = 6, isRemote = false } = {}) {
        if (isRemote && !this.biocracyMode) return;
        this.autoplayEnabled = !!enabled;
        let dps = Number(daysPerSecond);
        if (this.biocracyMode) {
            if (dps > 15) {
                this.logOB(`[OB] Safe threshold exceeded: speed capped at 10 d/s`);
                dps = 10;
            }
        }
        this.daysPerSecond = isFinite(dps) && dps > 0 ? dps : 6;
    }

    jumpToMonth({ month = "Ene", isRemote = false } = {}) {
        if (isRemote && !this.biocracyMode) return;
        const idx = PhenologicalCalendar.MONTHS_ES.indexOf(month);
        if (idx < 0) return;
        const day = PhenologicalCalendar.MONTH_STARTS[idx] + 1;
        if (this.biocracyMode) {
            this.logOB(`[OB] Intercepted jump: Simulating transition to ${month}`);
        }
        this._setDayInternal(day, true);
    }

    focusTaxon({ taxon = "all" } = {}) {
        const valid = ["all", "flora", "amphibians", "reptiles", "mammals", "birds"];
        this.focusedTaxon = valid.includes(taxon) ? taxon : "all";
        this._updateSpeciesLuminance();
        this._renderHUD();
    }

    pulse({ intensity = 1.4 } = {}) {
        this._pulseAmount = Math.max(this._pulseAmount, Math.max(0, Math.min(4, Number(intensity) || 1.4)));
    }

    // ----------------------------------------------------------------
    // DESTROY
    // ----------------------------------------------------------------

    destroy() {
        if (this._animationId) cancelAnimationFrame(this._animationId);
        this._animationId = null;

        // Clean up keyboard events
        window.removeEventListener("keydown", this._onKeyDown);

        if (this._bridgeWS) {
            try { this._bridgeWS.close(); } catch (e) { }
            this._bridgeWS = null;
        }

        const disposeObj = (obj) => {
            if (!obj) return;
            if (obj.geometry) obj.geometry.dispose?.();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
                else obj.material.dispose?.();
            }
            if (obj.parent) obj.parent.remove(obj);
        };

        // Dispose pools
        for (const f of this.filamentPool) {
            disposeObj(f.mesh);
        }
        this.filamentPool = [];

        for (const n of this.nomadPool) {
            disposeObj(n.mesh);
        }
        this.nomadPool = [];

        if (this.filamentGroup) {
            this.scene.remove(this.filamentGroup);
            this.filamentGroup = null;
        }
        if (this.nomadGroup) {
            this.scene.remove(this.nomadGroup);
            this.nomadGroup = null;
        }

        for (const e of this.speciesMeshes) disposeObj(e.mesh);
        this.speciesMeshes = [];
        for (const t of PhenologicalCalendar.TAXA) {
            const g = this.taxonGroups[t.key];
            if (g) {
                while (g.children.length) disposeObj(g.children[0]);
                g.parent?.remove(g);
            }
        }
        this.taxonGroups = {};

        if (this.ringGroup) {
            while (this.ringGroup.children.length) disposeObj(this.ringGroup.children[0]);
            this.scene.remove(this.ringGroup);
            this.ringGroup = null;
        }
        if (this.cursorGroup) {
            while (this.cursorGroup.children.length) disposeObj(this.cursorGroup.children[0]);
            this.scene.remove(this.cursorGroup);
            this.cursorGroup = null;
        }
        for (const p of this.glassPanels) {
            disposeObj(p.plane);
            p.texture?.dispose?.();
        }
        this.glassPanels = [];
        if (this._backdrop) {
            disposeObj(this._backdrop);
            this._backdrop = null;
        }

        super.destroy();
    }

    // ----------------------------------------------------------------
    // NEW BIOCRACY AND BENEVOLENCE ENGINE HELPERS & TRIGGERS
    // ----------------------------------------------------------------

    triggerCO2({ amount = 50, isRemote = false } = {}) {
        if (isRemote && !this.biocracyMode) return;

        if (this.biocracyMode) {
            this.logOB("[OB] CO2 Trigger: Carbon sequestration flow active.");
        }

        const trees = this.species.filter(s =>
            s.taxon === "flora" &&
            s.habit && /árbol|arbol|palmoide/i.test(s.habit)
        );

        const targetTrees = trees.length ? trees : this.species.filter(s => s.taxon === "flora");
        if (!targetTrees.length) return;

        const count = Math.min(100, Math.max(10, Math.round(amount)));
        const rain = this._getRaininess(this.day);

        for (let i = 0; i < count; i++) {
            const s = targetTrees[Math.floor(Math.random() * targetTrees.length)];
            const targetPos = this._getSpeciesPos(s);

            const angle = Math.random() * Math.PI * 2;
            const dist = 1.8 + Math.random() * 0.5;
            const startPos = new THREE.Vector3(
                Math.cos(angle) * dist,
                Math.sin(angle) * dist,
                0.8 + Math.random() * 0.6
            );

            this.particles.push({
                pos: startPos.clone(),
                start: startPos,
                target: targetPos,
                color: new THREE.Color("#A3EAF7").lerp(new THREE.Color("#4AA8B5"), rain * 0.5),
                speed: 0.55 + Math.random() * 0.45,
                t: 0,
                size: 0.008 + Math.random() * 0.006
            });
        }

        if (!isRemote) {
            this.sendToSC("/soneth/co2", amount / 200.0);
        }
    }

    triggerMycoPulse({ intensity = 1.0, isRemote = false } = {}) {
        if (isRemote && !this.biocracyMode) return;

        if (this.biocracyMode) {
            this.logOB(`[OB] MycoPulse: Surge in network signals (Int: ${intensity.toFixed(2)})`);
        }

        this.pulse({ intensity: intensity * 1.5 });

        for (const f of this.filamentPool) {
            if (f.active) {
                f.mat.opacity = 0.65;
            }
        }

        const activeSpecies = [];
        for (const entry of this.speciesMeshes) {
            for (const r of entry.records) {
                let d = Math.abs(r.rec.peakDay - this.day);
                if (d > 182) d = 365 - d;
                const w = r.rec.window;
                const activity = Math.exp(-(d * d) / (2 * w * w * 0.6));
                if (activity > 0.65) {
                    activeSpecies.push(r.rec);
                }
            }
        }

        const center = new THREE.Vector3(0, 0, -0.12);
        const count = Math.min(40, activeSpecies.length);

        for (let i = 0; i < count; i++) {
            const s = activeSpecies[i];
            const targetPos = this._getSpeciesPos(s);

            this.particles.push({
                pos: center.clone(),
                start: center.clone(),
                target: targetPos,
                color: new THREE.Color("#82ECA8"),
                speed: 0.7 + Math.random() * 0.5,
                t: 0,
                size: 0.009 + Math.random() * 0.006
            });
        }

        if (!isRemote) {
            this.sendToSC("/soneth/myco", intensity / 5.0);
        }
    }

    triggerPhosphorus({ amount = 30, isRemote = false } = {}) {
        if (isRemote && !this.biocracyMode) return;

        if (this.biocracyMode) {
            this.logOB("[OB] Mycorrhiza: Transferring Phosphorus");
        }

        const targets = this.species.filter(s =>
            s.taxon === "flora" &&
            (!s.habit || !/árbol|arbol|palmoide/i.test(s.habit))
        );

        const count = Math.min(80, Math.max(10, Math.round(amount)));
        const center = new THREE.Vector3(0, 0, -0.1);

        for (let i = 0; i < count; i++) {
            const s = targets.length ? targets[Math.floor(Math.random() * targets.length)] : this.species[Math.floor(Math.random() * this.species.length)];
            const targetPos = this._getSpeciesPos(s);

            this.particles.push({
                pos: center.clone(),
                start: center.clone(),
                target: targetPos,
                color: new THREE.Color("#FF7A1A"),
                speed: 0.45 + Math.random() * 0.4,
                t: 0,
                size: 0.008 + Math.random() * 0.005
            });
        }

        if (!isRemote) {
            this.sendToSC("/soneth/phosphorus", amount / 100.0);
        }
    }

    triggerNitrogen({ amount = 30, isRemote = false } = {}) {
        if (isRemote && !this.biocracyMode) return;

        if (this.biocracyMode) {
            this.logOB("[OB] Mycorrhiza: Transferring Nitrogen");
        }

        const targets = this.species.filter(s => s.taxon === "flora");
        const count = Math.min(80, Math.max(10, Math.round(amount)));
        const center = new THREE.Vector3(0, 0, -0.1);

        for (let i = 0; i < count; i++) {
            const s = targets.length ? targets[Math.floor(Math.random() * targets.length)] : this.species[Math.floor(Math.random() * this.species.length)];
            const targetPos = this._getSpeciesPos(s);

            this.particles.push({
                pos: center.clone(),
                start: center.clone(),
                target: targetPos,
                color: new THREE.Color("#567BFF"),
                speed: 0.45 + Math.random() * 0.4,
                t: 0,
                size: 0.008 + Math.random() * 0.005
            });
        }

        if (!isRemote) {
            this.sendToSC("/soneth/nitrogen", amount / 100.0);
        }
    }

    _updateParticles(dt) {
        for (const n of this.nomadPool) {
            if (n.mesh) n.mesh.visible = false;
        }

        if (this.biocracyMode && Math.random() < 0.08) {
            const activeSpecies = [];
            for (const entry of this.speciesMeshes) {
                for (const r of entry.records) {
                    let d = Math.abs(r.rec.peakDay - this.day);
                    if (d > 182) d = 365 - d;
                    const w = r.rec.window;
                    const activity = Math.exp(-(d * d) / (2 * w * w * 0.6));
                    if (activity > 0.65) {
                        activeSpecies.push({ rec: r.rec, baseColor: r.baseColor });
                    }
                }
            }

            if (activeSpecies.length >= 2) {
                const idxA = Math.floor(Math.random() * activeSpecies.length);
                let idxB = Math.floor(Math.random() * activeSpecies.length);
                if (idxA === idxB) idxB = (idxA + 1) % activeSpecies.length;

                const sA = activeSpecies[idxA];
                const sB = activeSpecies[idxB];

                const posA = this._getSpeciesPos(sA.rec);
                const posB = this._getSpeciesPos(sB.rec);

                this.particles.push({
                    pos: posA.clone(),
                    start: posA,
                    target: posB,
                    color: sA.baseColor,
                    speed: 0.35 + Math.random() * 0.3,
                    t: 0,
                    size: 0.007 + Math.random() * 0.006
                });
            }
        }

        let nomadIdx = 0;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.t += dt * p.speed;
            if (p.t >= 1) {
                this.particles.splice(i, 1);
                continue;
            }

            const currentPos = new THREE.Vector3().lerpVectors(p.start, p.target, p.t);
            const dir = p.target.clone().sub(p.start);
            const perp = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 0, 1)).normalize();
            const wave = Math.sin(p.t * Math.PI) * 0.08 * Math.sin(this._t * 4.5 + p.t * 8);
            currentPos.add(perp.multiplyScalar(wave));

            let nomad = this.nomadPool[nomadIdx++];
            if (!nomad) {
                const geom = new THREE.SphereGeometry(0.009, 5, 5);
                const mat = new THREE.MeshBasicMaterial({
                    transparent: true,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                const mesh = new THREE.Mesh(geom, mat);
                this.nomadGroup.add(mesh);
                nomad = { mesh, mat, active: true };
                this.nomadPool.push(nomad);
            }

            nomad.mesh.position.copy(currentPos);
            nomad.mesh.scale.setScalar(p.size / 0.009);
            nomad.mat.color.copy(p.color);
            const fade = Math.sin(p.t * Math.PI);
            nomad.mat.opacity = fade * 0.85;
            nomad.mesh.visible = true;
            nomad.active = true;
        }
    }

    _getSpeciesPos(s) {
        const tObj = PhenologicalCalendar.TAXA.find(tx => tx.key === s.taxon);
        const radius = tObj ? tObj.radius : 0.6;
        const a = (s.peakDay / 365) * Math.PI * 2 - Math.PI / 2;
        const rJitter = (this._hash01(s.sci + "|r") - 0.5) * 0.03;
        const r = radius + rJitter;
        let x = Math.cos(a) * r;
        let y = Math.sin(a) * r;
        let z = 0;

        if (this.biocracyMode && this._isSensitive(s)) {
            const jA = this._hash01(s.sci + "|jitterAngle") * Math.PI * 2;
            const noise = 0.022 * Math.sin(this._t * 3.5 + this._hash01(s.sci) * 10);
            x += Math.cos(jA) * noise;
            y += Math.sin(jA) * noise;
            z += Math.sin(this._t * 2 + this._hash01(s.sci) * 5) * 0.012;
        }
        return new THREE.Vector3(x, y, z);
    }

    _updateFilaments() {
        for (const f of this.filamentPool) {
            if (f.mesh) f.mesh.visible = false;
            f.active = false;
        }

        if (!this.biocracyMode) return;

        const activeSpecies = [];
        for (const entry of this.speciesMeshes) {
            for (const r of entry.records) {
                let d = Math.abs(r.rec.peakDay - this.day);
                if (d > 182) d = 365 - d;
                const w = r.rec.window;
                const activity = Math.exp(-(d * d) / (2 * w * w * 0.6));
                if (activity > 0.72) {
                    activeSpecies.push({ rec: r.rec, baseColor: r.baseColor });
                }
            }
        }

        const pairs = [];
        for (let i = 0; i < activeSpecies.length; i++) {
            const s1 = activeSpecies[i].rec;
            for (let j = i + 1; j < activeSpecies.length; j++) {
                const s2 = activeSpecies[j].rec;
                const sameFamily = s1.family && s2.family && (s1.family === s2.family);
                let adjacentTaxon = false;
                const idx1 = PhenologicalCalendar.TAXA.findIndex(tx => tx.key === s1.taxon);
                const idx2 = PhenologicalCalendar.TAXA.findIndex(tx => tx.key === s2.taxon);
                if (idx1 >= 0 && idx2 >= 0 && Math.abs(idx1 - idx2) === 1) {
                    const a1 = (s1.peakDay / 365) * Math.PI * 2;
                    const a2 = (s2.peakDay / 365) * Math.PI * 2;
                    let diff = Math.abs(a1 - a2);
                    if (diff > Math.PI) diff = Math.PI * 2 - diff;
                    if (diff < 0.22) {
                        adjacentTaxon = true;
                    }
                }

                if (sameFamily || adjacentTaxon) {
                    pairs.push({ s1, s2, sameFamily });
                    if (pairs.length >= 25) break;
                }
            }
            if (pairs.length >= 25) break;
        }

        let filamentIdx = 0;
        const rain = this._getRaininess(this.day);

        for (const p of pairs) {
            const posA = this._getSpeciesPos(p.s1);
            const posB = this._getSpeciesPos(p.s2);

            const posMid = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.42);
            posMid.z = -0.15;

            const curve = new THREE.QuadraticBezierCurve3(posA, posMid, posB);
            const pts = curve.getPoints(19);

            let filament = this.filamentPool[filamentIdx++];
            if (!filament) {
                const geom = new THREE.BufferGeometry();
                const posArray = new Float32Array(20 * 3);
                geom.setAttribute("position", new THREE.BufferAttribute(posArray, 3));
                const mat = new THREE.LineBasicMaterial({
                    color: new THREE.Color("#4A7B70"),
                    transparent: true,
                    opacity: 0.15,
                    blending: THREE.AdditiveBlending,
                    linewidth: 1
                });
                const line = new THREE.Line(geom, mat);
                this.filamentGroup.add(line);
                filament = { mesh: line, geom, mat, active: true };
                this.filamentPool.push(filament);
            }

            const posAttr = filament.geom.attributes.position;
            for (let k = 0; k < 20; k++) {
                posAttr.array[k * 3 + 0] = pts[k].x;
                posAttr.array[k * 3 + 1] = pts[k].y;
                posAttr.array[k * 3 + 2] = pts[k].z;
            }
            posAttr.needsUpdate = true;
            filament.mesh.visible = true;
            filament.active = true;

            filament.mat.color.set(rain > 0.48 ? "#55886F" : "#4A5670");
            filament.mat.opacity = (p.sameFamily ? 0.22 : 0.12) * (0.6 + 0.4 * Math.sin(this._t * 2.8 + filamentIdx));
        }
    }

    toggleBiocracyMode() {
        this.biocracyMode = !this.biocracyMode;
        this.logOB(this.biocracyMode ? "[BIOCRACY COUPLING ACTIVE: DELIBERATIVE STATE ENGAGED]" : "[BIOCRACY COUPLING INACTIVE: STANDBY]");

        if (this.biocracyMode) {
            if (!this._bridgeWS) {
                this._connectBridge();
            }
        } else {
            this.scene.background = PhenologicalCalendar.PALETTE.bg.clone();
            if (this.scene.fog) {
                this.scene.fog.color = PhenologicalCalendar.PALETTE.bg.clone();
                this.scene.fog.near = 6;
                this.scene.fog.far = 14;
            }

            for (const f of this.filamentPool) {
                f.active = false;
                if (f.mesh) f.mesh.visible = false;
            }
            for (const n of this.nomadPool) {
                n.active = false;
                if (n.mesh) n.mesh.visible = false;
            }
            this.particles = [];
        }

        this._updateSpeciesLuminance();
        this._renderHUD();
    }

    logOB(msg) {
        console.log(msg);
        this.obLogs.push(msg);
        if (this.obLogs.length > 5) {
            this.obLogs.shift();
        }
        this._renderHUD();
    }

    _isSensitive(s) {
        if (!s) return false;
        const isOrchidOrZamia = s.family && (s.family.toLowerCase() === "orchidaceae" || s.family.toLowerCase() === "zamiaceae");
        const isAmphibian = s.taxon === "amphibians";
        const isHashSensitive = this._hash01(s.sci + "|sensitive") < 0.15;
        return isOrchidOrZamia || isAmphibian || isHashSensitive;
    }

    _getRaininess(day) {
        const monthlyRain = [0.1, 0.0, 0.2, 0.8, 1.0, 0.4, 0.2, 0.3, 0.8, 1.0, 0.7, 0.2];
        const { monthIdx, dayOfMonth } = this._dayToDate(day);
        const currentMonthRain = monthlyRain[monthIdx];
        const nextMonthRain = monthlyRain[(monthIdx + 1) % 12];

        const daysInMonth = (monthIdx === 11) ? 31 : (PhenologicalCalendar.MONTH_STARTS[monthIdx + 1] - PhenologicalCalendar.MONTH_STARTS[monthIdx]);
        const fraction = (dayOfMonth - 1) / daysInMonth;
        return currentMonthRain + fraction * (nextMonthRain - currentMonthRain);
    }

    _emitActiveSpecies(s) {
        if (!this.biocracyMode || !s) return;

        let name = s.sci;
        let commonName = s.common || "Desconocido";
        let habit = s.habit || "N/A";

        if (this._isSensitive(s)) {
            name = "Sp. * (Vulnerable)";
            commonName = "Protegida";
            this.logOB(`[OB] Telemetry Opacified: Shielding ${s.family || 'Taxon'}`);
        } else {
            this.logOB(`[Lampsacus] Voice active: ${name}`);
        }

        const oscPayload = `${name}|${s.taxon}|${s.family || 'N/A'}|${commonName}|${habit}|${s.peakDay}`;
        this.sendToSC("/soneth/species/active", oscPayload);
    }

    _connectBridge() {
        if (!this.biocracyMode) return;
        try {
            this._bridgeWS = new WebSocket("ws://localhost:3334");
            this._bridgeWS.onopen = () => {
                this._bridgeReady = true;
                this.logOB("[OB] Parliament Bridge Connected ✅");
            };
            this._bridgeWS.onclose = () => {
                this._bridgeReady = false;
                if (this.biocracyMode) {
                    setTimeout(() => this._connectBridge(), 3000);
                }
            };
            this._bridgeWS.onerror = () => {
                this._bridgeReady = false;
            };
            this._bridgeWS.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === "method-trigger" && msg.data) {
                        const methodName = msg.data.channelName.replace("/ch/", "");
                        if (typeof this[methodName] === "function") {
                            const val = msg.data.velocity || 0;
                            let options = { isRemote: true };
                            if (methodName.startsWith("trigger")) {
                                Object.assign(options, { amount: val * 100, intensity: val });
                            } else if (methodName.startsWith("set")) {
                                Object.assign(options, { level: val, cutoff: val, ratio: val, reverb: val, delay: val });
                            } else if (methodName === "setDay") {
                                Object.assign(options, { day: Math.round(val * 364) + 1 });
                            }
                            this[methodName](options);
                        }
                    }
                } catch (e) {
                    console.error("[Biocracy] Error parsing bridge message:", e);
                }
            };
        } catch (e) {
            console.warn("[Biocracy] Could not connect to bridge:", e);
        }
    }

    sendToSC(address, value) {
        if (!this.biocracyMode || !this._bridgeWS || !this._bridgeReady) return;
        this._bridgeWS.send(JSON.stringify({ direction: "toSC", address, args: [value] }));
    }

    _onKeyDown(e) {
        if (e.key === "f" || e.key === "F") {
            if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable)) {
                return;
            }
            this.toggleBiocracyMode();
        }
    }
}

export default PhenologicalCalendar;
