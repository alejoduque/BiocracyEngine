/*
@nwWrld name: PhenologicalCalendar
@nwWrld category: 3D
@nwWrld imports: BaseThreeJsModule, THREE, loadJson
*/

/*
 * PhenologicalCalendar — Reserva Manakai, Planeta Rica, Córdoba, Colombia.
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
        // ─── Biogeochemical triggers (absorbed from BiocracyVisualizer) ───
        // Each one anchors its visual to active species on the current day:
        // CO2 emerges from active tree-habit flora; myco pulses radiate from
        // the mycorrhizal underring; P and N flow from underring to active
        // flora. So the biogeochem layer is *bound* to live phenology rather
        // than to fixed screen coordinates — that's the deep-ecology coupling.
        {
            name: "triggerCO2",
            executeOnLoad: false,
            options: [
                { name: "amount", defaultVal: 50, type: "number", min: 10, max: 200 },
            ],
        },
        {
            name: "triggerMycoPulse",
            executeOnLoad: false,
            options: [
                { name: "intensity", defaultVal: 1, type: "number", min: 0.1, max: 5 },
            ],
        },
        {
            name: "triggerPhosphorus",
            executeOnLoad: false,
            options: [
                { name: "amount", defaultVal: 30, type: "number", min: 10, max: 100 },
            ],
        },
        {
            name: "triggerNitrogen",
            executeOnLoad: false,
            options: [
                { name: "amount", defaultVal: 30, type: "number", min: 10, max: 100 },
            ],
        },
        // Rotation/sweep speed control. 0.1..2.0 (mirrors parliament rotation
        // slider). Maps to daysPerSecond = rotation * 1.5 so the full year
        // spans 4–73 minutes. Default 1.0 → 1.5 d/s → ~4 min/year.
        {
            name: "setRotation",
            executeOnLoad: false,
            options: [
                { name: "rotation", defaultVal: 1.0, type: "number", min: 0.1, max: 2.0 },
            ],
        },
        // ── Cámara Fenológica de lo Vivo (Capítulo VI) ────────────────────
        // Public methods invoked by phenology/breath.ts when /pheno/* OSC
        // messages arrive from SuperCollider (or directly from HTML sliders).
        {
            name: "setActivityThreshold",         // Art. 45 — quórum sensible
            executeOnLoad: false,
            options: [{ name: "value", defaultVal: 0.5, type: "number", min: 0.20, max: 0.85 }],
        },
        {
            name: "setWindowWidth",               // Art. 44 — ventana de presencia
            executeOnLoad: false,
            options: [{ name: "value", defaultVal: 1.0, type: "number", min: 0.4, max: 2.5 }],
        },
        {
            name: "setSeasonalBias",              // Art. 42 — calendario bimodal
            executeOnLoad: false,
            options: [{ name: "value", defaultVal: 0.0, type: "number", min: -1.0, max: 1.0 }],
        },
        {
            name: "setAbsenceWeight",             // Art. 44 § — ausencia como voz
            executeOnLoad: false,
            options: [{ name: "value", defaultVal: 0.3, type: "number", min: 0.0, max: 1.0 }],
        },
        {
            name: "setPulseGain",                 // Art. 45 § — modula no anula
            executeOnLoad: false,
            options: [{ name: "value", defaultVal: 1.0, type: "number", min: 0.0, max: 2.0 }],
        },
        {
            name: "setOpacityFloor",              // Art. 47 § — cláusula de opacidad
            executeOnLoad: false,
            options: [{ name: "value", defaultVal: 0.0, type: "number", min: 0.0, max: 0.7 }],
        },
        {
            name: "setBancada",                   // Art. 43 §1 — bancadas estacionales
            executeOnLoad: false,
            options: [{
                name: "value", defaultVal: "todas", type: "select",
                values: ["todas", "seca", "primeras_lluvias", "medio_seco", "segundas_lluvias"],
            }],
        },
        {
            name: "jumpSeason",                   // Art. 42 § — sesiones de apertura
            executeOnLoad: false,
            options: [{
                name: "season", defaultVal: "seca", type: "select",
                values: ["seca", "primeras_lluvias", "medio_seco", "segundas_lluvias"],
            }],
        },
    ];

    // ---------- 1-bit wireframe palette ----------
    static PALETTE = {
        bg: new THREE.Color("#000000"),   // pure black
        peach: new THREE.Color("#ffffff"),
        gold: new THREE.Color("#ffffff"),
        indigo: new THREE.Color("#ffffff"),
        violet: new THREE.Color("#ffffff"),
        olive: new THREE.Color("#ffffff"),
        ivory: new THREE.Color("#ffffff"),
        rust: new THREE.Color("#ffffff"),
    };

    // Taxon → orbit assignment (innermost → outermost).
    // z: vertical offset so the orbits form a visible stack in 3D.
    // r: taxon-specific orbit radius. tube: torus tube thickness.
    static TAXA = [
        { key: "flora", label: "FLORA", color: "olive", radius: 0.46, z: -0.18, tube: 0.008 },
        { key: "amphibians", label: "AMPHIBIA", color: "violet", radius: 0.58, z: -0.09, tube: 0.007 },
        { key: "reptiles", label: "REPTILIA", color: "rust", radius: 0.72, z: 0.00, tube: 0.007 },
        { key: "mammals", label: "MAMMALIA", color: "gold", radius: 0.86, z: 0.09, tube: 0.0075 },
        { key: "birds", label: "AVES", color: "peach", radius: 1.00, z: 0.18, tube: 0.009 },
    ];

    static MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    static MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]; // non-leap

    // ── Cámara Fenológica: bancadas estacionales (Art. 43 §1) ─────────────
    // Mapping season-name → Set of taxa whose escaño is active during that
    // season. "todas" returns null (no override; honor focusedTaxon).
    //
    // Manakai/Córdoba bimodal phenology mapping:
    //   Seca           → reptiles + birds (migratory boreal visitors)
    //   1as Lluvias    → amphibians + birds (residents breeding)
    //   Medio seco     → mammals
    //   2as Lluvias    → flora (herbaceous + arboreal in second flowering)
    static _bancadaTaxa(key) {
        switch (key) {
            case "seca":              return new Set(["reptiles", "birds"]);
            case "primeras_lluvias":  return new Set(["amphibians", "birds"]);
            case "medio_seco":        return new Set(["mammals"]);
            case "segundas_lluvias":  return new Set(["flora"]);
            default:                  return null;   // "todas" or unknown
        }
    }

    // First day of each season (used by jumpSeason)
    static _seasonFirstDay(key) {
        switch (key) {
            case "seca":              return 335;
            case "primeras_lluvias":  return 91;
            case "medio_seco":        return 152;
            case "segundas_lluvias":  return 244;
            default:                  return 1;
        }
    }

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
        // Default sweep: slow scientific cadence — a full year in ~7.6 min.
        // Driven externally by parliamentStore.state.rotation slider via the
        // breath bridge in nw_wrld; see setRotation() below.
        this.daysPerSecond = 0.8;
        this._dayAccumulator = 0;
        this._lastFrameTime = performance.now();
        this._pulseAmount = 0;
        this._pulseDecay = 0;
        this._highlightSpecies = null;
        this._t = 0;

        // ── Cámara Fenológica state (Capítulo VI of proposed statutes) ────
        // These are mutated by setActivityThreshold/setWindowWidth/etc.
        // via the phenology breath bridge from SC OSC echoes.
        this._activityThreshold = 0.50;   // Art. 45 — quórum sensible
        this._windowWidth = 1.0;          // Art. 44 — ventana de presencia
        this._seasonalBias = 0.0;         // Art. 42 — calendario bimodal
        this._absenceWeight = 0.3;        // Art. 44 § — la ausencia es voz
        this._pulseGain = 1.0;            // Art. 45 § — modula no anula
        this._opacityFloor = 0.0;         // Art. 47 § — cláusula de opacidad
        this._bancada = "todas";          // Art. 43 §1 — bancadas estacionales

        // ── Biogeochemical overlay (was BiocracyVisualizer) ─────────────────
        // CO₂ pulses, mycorrhizal expansion rings, P/N nutrient flows. All
        // rendered into the same Three.js scene as the calendar — no separate
        // canvas, no separate window. Pulses anchor to currently-active species
        // positions on the ring, so the biogeochemistry is *placed* by the
        // current phenology rather than at fixed screen coordinates.
        this._co2Particles = [];        // {x0,y0,x1,y1,t,life}
        this._mycoPulses = [];          // {r,life,intensity}
        this._nutrientFlows = [];       // {x0,y0,x1,y1,t,color}
        this._overlayGroup = null;
        this._overlayPoints = null;
        this._overlayRing = null;

        // ── Mutualism trace lines ───────────────────────────────────────────
        // Pre-computed at species-load time. Each entry: {a, b, kind} where a
        // and b are species indices (into the flat species list) and kind is
        // one of: pollinator, frugivory, mycorrhizal, predation, nesting,
        // herbivory. Drawn only when BOTH endpoints have activity > 0.5 today.
        this._mutualisms = [];
        this._mutualismGroup = null;
        this._mutualismMeshes = [];

        // ── Persistent species labels + HTML column overlays.
        // Sans-serif text columns (CodeColumns pattern) rendered into _huCols.
        // Species labels persist 3.5 s past their peak window.
        this._labelLayer = null;
        this._huCols = null;
        this._activeLabels = new Map(); // sci -> {el, taxon, lastSeenAt, peakDay}
        this._lastCensusUpdate = 0;

        this.init();
    }

    // ----------------------------------------------------------------
    // INIT
    // ----------------------------------------------------------------

    init() {
        if (!THREE) return;

        this.scene.background = PhenologicalCalendar.PALETTE.bg.clone();
        this.scene.fog = null;

        // ── Camera: slight oblique so the stack of orbits reads as 3D ────
        // We tilt the *world* (calendar root group) rather than the camera so
        // text-anchor projection math stays simple (camera stays nearly along
        // +Z looking at origin). Camera lives further back because the ring
        // stack now has real depth.
        this.camera.position.set(0, 0.6, 4.6);
        this.camera.lookAt(0, 0, 0);
        // Pull near plane in so the user can zoom all the way into a species
        // sphere without it clipping. Far plane stays generous for fly-out.
        this.camera.near = 0.001;
        this.camera.far = 200;
        this.camera.updateProjectionMatrix();

        // Re-enable user zoom + rotate. Constrained so the user can't fly
        // behind the ring or zoom past the species nodes.
        if (this.controls) {
            this.controls.enabled = true;
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.08;
            this.controls.enablePan = false;
            this.controls.enableRotate = true;
            this.controls.enableZoom = true;
            // No zoom limits — fly all the way in to see species spheres
            // at scale, and pull all the way back beyond the wireframe shell.
            this.controls.minDistance = 0;
            this.controls.maxDistance = Infinity;
            this.controls.minPolarAngle = Math.PI * 0.18;   // ~32°
            this.controls.maxPolarAngle = Math.PI * 0.82;   // ~148°
            this.controls.autoRotate = false;
            this.controls.target.set(0, 0, 0);
            this.controls.update();
        }

        // ── Lighting: flat ambient only — 1-bit wireframe needs no shading ──
        const amb = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(amb);

        // ── Calendar root group: holds the ring stack, tilted in 3D so
        // depth is legible from the default camera position. User OrbitControls
        // rotate the world too (this stays at scene level).
        this._calendarGroup = new THREE.Group();
        this._calendarGroup.rotation.x = -0.32;       // tip back ~18°
        this._calendarGroup.rotation.z = 0.02;
        this.scene.add(this._calendarGroup);

        // Build the static HUD frame (all geometry now parents to _calendarGroup)
        this._buildBackdrop();
        this._buildRing();
        this._buildTaxonOrbits();
        this._buildMycorrhizalUnderring();   // sits at r=0.34, below flora orbit
        this._buildGlassPanels();
        this._buildCursor();
        this._buildOverlayGroup();           // biogeochem particles + pulses
        this._buildMutualismGroup();         // trace tubes between active pairs
        this._buildHtmlOverlays();           // sans-serif text columns + labels

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
        this._buildMutualisms();
    }

    // ──────────────────────────────────────────────────────────────────
    // MUTUALISM EDGES — documented ecological relationships.
    // Six categories applied as deterministic rules over taxa/families.
    // These are not speculative: each rule corresponds to a well-established
    // tropical interaction class. Pairs are only emitted when both endpoints
    // exist in the loaded inventory, and only drawn when both are active.
    //
    //   pollinator   : flora (Bombacaceae/Bignoniaceae/Heliconiaceae) ↔ birds (Trochilidae)
    //   frugivory    : flora (tree habit) ↔ birds (Thraupidae/Turdidae) + mammals (Procyonidae)
    //   mycorrhizal  : every tree-habit flora ↔ the mycorrhizal underring (virtual hub)
    //   predation    : amphibians ↔ reptiles (snake/lizard families that take frogs)
    //   nesting      : flora (tree habit) ↔ birds (Psittacidae/Picidae cavity nesters)
    //   herbivory    : flora (herb/climber habit) ↔ mammals (Cervidae/Dasyproctidae)
    // ──────────────────────────────────────────────────────────────────
    _buildMutualisms() {
        const idx = new Map();
        this.species.forEach((s, i) => idx.set(s.sci, i));
        const out = [];

        const isTree = (s) => s.habit && /árbol|arbol|palmoide/i.test(s.habit);
        const isHerb = (s) => s.taxon === "flora" && !isTree(s);

        const flora = this.species.filter(s => s.taxon === "flora");
        const trees = flora.filter(isTree);
        const herbs = flora.filter(isHerb);
        const birds = this.species.filter(s => s.taxon === "birds");
        const mammals = this.species.filter(s => s.taxon === "mammals");
        const amph = this.species.filter(s => s.taxon === "amphibians");
        const rept = this.species.filter(s => s.taxon === "reptiles");

        const hummers = birds.filter(b => b.family && /trochilidae/i.test(b.family));
        const tanagers = birds.filter(b => b.family && /(thraupidae|turdidae|cotingidae)/i.test(b.family));
        const cavityNesters = birds.filter(b => b.family && /(psittacidae|picidae|trogonidae|momotidae)/i.test(b.family));
        const pollinatedFlora = flora.filter(f => f.family && /(bombacaceae|malvaceae|bignoniaceae|heliconiaceae|fabaceae)/i.test(f.family));
        const frugMammals = mammals.filter(m => m.family && /(procyonidae|cebidae|atelidae|callitrichidae|sciuridae)/i.test(m.family));
        const browsers = mammals.filter(m => m.family && /(cervidae|dasyproctidae|cuniculidae|tayassuidae)/i.test(m.family));
        const frogEaters = rept.filter(r => r.family && /(colubridae|viperidae|elapidae|teiidae)/i.test(r.family));

        const pair = (a, b, kind) => {
            const i = idx.get(a.sci), j = idx.get(b.sci);
            if (i === undefined || j === undefined || i === j) return;
            out.push({ a: i, b: j, kind });
        };

        // Pollinator network: each hummer linked to up to 4 of its likely flora.
        // Selection is deterministic via species-name hash so layout is stable.
        for (const bird of hummers) {
            const h = this._hash01(bird.sci);
            const picks = pollinatedFlora
                .map((f) => ({ f, w: this._hash01(f.sci + bird.sci + "p") + h * 0.0001 }))
                .sort((a, b) => b.w - a.w)
                .slice(0, 4);
            for (const p of picks) pair(p.f, bird, "pollinator");
        }
        // Frugivory: each frugivore bird/mammal linked to 3 of trees.
        for (const bird of tanagers) {
            const picks = trees
                .map((f) => ({ f, w: this._hash01(f.sci + bird.sci + "fr") }))
                .sort((a, b) => b.w - a.w)
                .slice(0, 3);
            for (const p of picks) pair(p.f, bird, "frugivory");
        }
        for (const m of frugMammals) {
            const picks = trees
                .map((f) => ({ f, w: this._hash01(f.sci + m.sci + "fm") }))
                .sort((a, b) => b.w - a.w)
                .slice(0, 2);
            for (const p of picks) pair(p.f, m, "frugivory");
        }
        // Cavity nesting: cavity-using birds linked to 2 trees each.
        for (const bird of cavityNesters) {
            const picks = trees
                .map((f) => ({ f, w: this._hash01(f.sci + bird.sci + "n") }))
                .sort((a, b) => b.w - a.w)
                .slice(0, 2);
            for (const p of picks) pair(p.f, bird, "nesting");
        }
        // Herbivory: each browser mammal linked to 3 herbs.
        for (const m of browsers) {
            const picks = herbs
                .map((f) => ({ f, w: this._hash01(f.sci + m.sci + "h") }))
                .sort((a, b) => b.w - a.w)
                .slice(0, 3);
            for (const p of picks) pair(p.f, m, "herbivory");
        }
        // Predation: each frog-eating reptile linked to 2 amphibians.
        for (const r of frogEaters) {
            const picks = amph
                .map((a) => ({ a, w: this._hash01(a.sci + r.sci + "pr") }))
                .sort((a, b) => b.w - a.w)
                .slice(0, 2);
            for (const p of picks) pair(p.a, r, "predation");
        }

        this._mutualisms = out;
        this._buildMutualismLines();
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
        // ── 1-bit backdrop: wireframe icosahedra at two depths for parallax ──
        const group = new THREE.Group();

        const icoMat = new THREE.LineBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false,
        });
        const ico = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.4, 1)),
            icoMat,
        );
        ico.position.z = -2.2;
        ico.userData.spin = 0.05;
        group.add(ico);
        this._backdropIco = ico;

        // Second smaller icosahedron offset for depth
        const ico2 = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(3.6, 0)),
            new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false }),
        );
        ico2.position.z = -3.5;
        ico2.userData.spin = -0.02;
        group.add(ico2);
        this._backdropIco2 = ico2;

        this._calendarGroup.add(group);
        this._backdrop = group;
    }

    _buildRing() {
        this.ringGroup = new THREE.Group();

        // ── Outer perimeter ring — 1-bit wireframe
        const outerR = 1.07;
        const outerTorus = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(
                Array.from({ length: 256 }, (_, i) => {
                    const a = (i / 256) * Math.PI * 2;
                    return new THREE.Vector3(Math.cos(a) * outerR, Math.sin(a) * outerR, 0);
                })
            ),
            new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
        );
        outerTorus.position.z = 0.20;
        this.ringGroup.add(outerTorus);

        // ── Inner guide ring — 1-bit wireframe
        const innerTorus = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(
                Array.from({ length: 220 }, (_, i) => {
                    const a = (i / 220) * Math.PI * 2;
                    return new THREE.Vector3(Math.cos(a) * 0.43, Math.sin(a) * 0.43, 0);
                })
            ),
            new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }),
        );
        innerTorus.position.z = -0.20;
        this.ringGroup.add(innerTorus);

        // ── Day ticks: line segments along the outer ring perimeter ──
        const tickGroup = new THREE.Group();
        for (let i = 0; i < 365; i++) {
            const a = (i / 365) * Math.PI * 2 - Math.PI / 2;
            const isMonthEdge = PhenologicalCalendar.MONTH_STARTS.includes(i);
            const isDecade = (i % 10 === 0);
            const len = isMonthEdge ? 0.10 : (isDecade ? 0.055 : 0.024);
            const opacity = isMonthEdge ? 1.0 : (isDecade ? 0.75 : 0.38);
            const r0 = outerR + 0.012;
            const r1 = r0 + len;
            const pts = [
                new THREE.Vector3(Math.cos(a) * r0, Math.sin(a) * r0, 0.20),
                new THREE.Vector3(Math.cos(a) * r1, Math.sin(a) * r1, 0.20),
            ];
            const line = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(pts),
                new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity }),
            );
            tickGroup.add(line);
        }
        this.ringGroup.add(tickGroup);
        this._tickGroup = tickGroup;

        // Month labels (drawn into a single canvas texture, plane in 3D)
        this._buildMonthLabels();

        this._calendarGroup.add(this.ringGroup);
    }

    _buildMonthLabels() {
        // ── 1-bit pixel font labels: render with pixel-art letter-spacing,
        // uppercase monospace, white on transparent. Simulates 8-bit dot-matrix
        // display without requiring an external font file.
        const canvas = document.createElement("canvas");
        canvas.width = 2048; canvas.height = 2048;
        const ctx = canvas.getContext("2d");
        // Disable antialiasing by using imageSmoothingEnabled=false and integer positions
        ctx.imageSmoothingEnabled = false;
        ctx.translate(1024, 1024);

        // Pixel font: "Press Start 2P" if available, else fallback to monospace
        // We simulate 8-bit by drawing at integer pixel coords with wide tracking
        ctx.font = "bold 52px 'Courier New', 'Lucida Console', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.letterSpacing = "6px";

        const labelR = 970;
        for (let m = 0; m < 12; m++) {
            const startDay = PhenologicalCalendar.MONTH_STARTS[m];
            const nextStart = (m === 11) ? 365 : PhenologicalCalendar.MONTH_STARTS[m + 1];
            const midDay = (startDay + nextStart) / 2;
            const a = (midDay / 365) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(a) * labelR;
            const y = Math.sin(a) * labelR;
            ctx.save();
            ctx.translate(Math.round(x), Math.round(y));
            ctx.rotate(a + Math.PI / 2);
            // Draw pixel-style shadow offset (1-bit look: no blur, just offset)
            ctx.fillStyle = "rgba(0,0,0,0.9)";
            ctx.fillText(PhenologicalCalendar.MONTHS_ES[m].toUpperCase(), 2, 2);
            ctx.fillStyle = "rgba(255,255,255,1.0)";
            ctx.fillText(PhenologicalCalendar.MONTHS_ES[m].toUpperCase(), 0, 0);
            ctx.restore();
        }

        // Cardinal day markers — smaller pixel font
        ctx.font = "bold 30px 'Courier New', 'Lucida Console', monospace";
        ctx.letterSpacing = "4px";
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        const cardinals = [{ d: 1, r: 1110 }, { d: 91, r: 1110 }, { d: 182, r: 1110 }, { d: 274, r: 1110 }];
        for (const c of cardinals) {
            const a = (c.d / 365) * Math.PI * 2 - Math.PI / 2;
            ctx.save();
            ctx.translate(Math.round(Math.cos(a) * c.r), Math.round(Math.sin(a) * c.r));
            ctx.rotate(a + Math.PI / 2);
            ctx.fillText(`D${c.d}`, 0, 0);
            ctx.restore();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 8;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), mat);
        mesh.position.z = 0.22;
        this.ringGroup.add(mesh);
    }

    _buildTaxonOrbits() {
        for (const t of PhenologicalCalendar.TAXA) {
            // 1-bit wireframe orbit ring — pure line loop
            const pts = Array.from({ length: 256 }, (_, i) => {
                const a = (i / 256) * Math.PI * 2;
                return new THREE.Vector3(Math.cos(a) * t.radius, Math.sin(a) * t.radius, 0);
            });
            const torus = new THREE.LineLoop(
                new THREE.BufferGeometry().setFromPoints(pts),
                new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 }),
            );
            torus.position.z = t.z;
            this.ringGroup.add(torus);

            // Group that will hold this taxon's InstancedMesh of species nodes
            const g = new THREE.Group();
            this.taxonGroups[t.key] = g;
            this._calendarGroup.add(g);
        }
    }

    _buildSpeciesNodes() {
        // Clear any prior — InstancedMesh per taxon
        for (const m of this.speciesMeshes) {
            m.mesh.geometry.dispose?.();
            m.mesh.material.dispose?.();
            m.mesh.parent?.remove(m.mesh);
        }
        this.speciesMeshes.length = 0;

        const _tmpObj = new THREE.Object3D();
        const _tmpColor = new THREE.Color();

        for (const t of PhenologicalCalendar.TAXA) {
            const group = this.taxonGroups[t.key];
            const list = this.species.filter(s => s.taxon === t.key);
            const N = list.length;
            if (N === 0) continue;

            // ── 1-bit dot: tiny octahedron wireframe, luminance driven by setColorAt
            const sphereGeo = new THREE.OctahedronGeometry(1, 0);
            const sphereMat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                wireframe: true,
                transparent: true,
                opacity: 0.95,
            });
            const inst = new THREE.InstancedMesh(sphereGeo, sphereMat, N);
            inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            // seed instanceColor with dim white (1-bit: off state)
            for (let i = 0; i < N; i++) {
                _tmpColor.setRGB(0.12, 0.12, 0.12);
                inst.setColorAt(i, _tmpColor);
            }
            inst.instanceColor.setUsage(THREE.DynamicDrawUsage);

            const records = [];
            for (let i = 0; i < N; i++) {
                const s = list[i];
                const a = (s.peakDay / 365) * Math.PI * 2 - Math.PI / 2;
                // small radial + z jitter so peers don't perfectly overlap
                const rJ = (this._hash01(s.sci + "|r") - 0.5) * 0.025;
                const zJ = (this._hash01(s.sci + "|z") - 0.5) * 0.03;
                const r = t.radius + rJ;
                const x = Math.cos(a) * r;
                const y = Math.sin(a) * r;
                const z = t.z + zJ;
                _tmpObj.position.set(x, y, z);
                _tmpObj.scale.setScalar(0.010);
                _tmpObj.updateMatrix();
                inst.setMatrixAt(i, _tmpObj.matrix);
                records.push({ rec: s, taxon: t.key, idx: i, x, y, z });
            }
            inst.instanceMatrix.needsUpdate = true;
            if (inst.instanceColor) inst.instanceColor.needsUpdate = true;

            group.add(inst);
            this.speciesMeshes.push({
                type: "instanced",
                mesh: inst,
                records,
                taxon: t.key,
            });
        }
    }

    _buildCursor() {
        // ── 3D day cursor: a slim cylindrical spear from origin out to the
        // birds orbit, a glowing sphere head at the outer end, and a
        // trailing arc rendered as a thin TubeGeometry so it has volume.
        this.cursorGroup = new THREE.Group();

        // Cylindrical spear — geometry runs along +Y by default; we keep it.
        // We rotate the whole cursorGroup around z to point at the current day.
        // 1-bit cursor: a single Line from origin to ring edge
        const SPEAR_LEN = 1.12;
        const spearPts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, SPEAR_LEN, 0)];
        const spearGeo = new THREE.BufferGeometry().setFromPoints(spearPts);
        const spearMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
        this._cursorLine = new THREE.Line(spearGeo, spearMat);
        this._cursorLine.position.z = 0.21;
        this.cursorGroup.add(this._cursorLine);

        // Cursor head — wireframe octahedron at spear tip
        const head = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.028, 0),
            new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 1.0 })
        );
        head.position.set(0, SPEAR_LEN, 0.22);
        this._cursorHead = head;
        this.cursorGroup.add(head);

        // Trailing arc — 1-bit Line drawn from day-21 → day (no tube volume)
        this._cursorArcCurvePoints = new Array(24).fill(0).map(() => new THREE.Vector3());
        const initGeom = new THREE.BufferGeometry().setFromPoints(this._cursorArcCurvePoints);
        const arcMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
        this._cursorArc = new THREE.Line(initGeom, arcMat);
        this._cursorArc.position.z = 0.215;
        // Arc is a *world-space* trail; not parented to the spinning cursor group.
        this._calendarGroup.add(this._cursorArc);

        this._calendarGroup.add(this.cursorGroup);
    }

    _buildGlassPanels() {
        // Glass panels retired in the 3D upgrade — text now lives in
        // HTML columns (see _buildHtmlOverlays). Stub kept so callers don't
        // need conditionals. this.glassPanels stays an empty array.
    }

    // ──────────────────────────────────────────────────────────────────
    // MYCORRHIZAL UNDERRING — biogeochemical hub at radius 0.34.
    // The "below-ground" companion to the flora orbit. Mycorrhizal pulses
    // radiate from here; P and N flows emit from this ring to active flora.
    // ──────────────────────────────────────────────────────────────────
    _buildMycorrhizalUnderring() {
        // ── 3D torus sitting *below* the flora orbit (negative z) — reads
        // visually as "underground". Material is rust with low emissive at
        // rest; brightens during myco pulses.
        const r = 0.34;
        const mycopts = Array.from({ length: 200 }, (_, i) => {
            const a = (i / 200) * Math.PI * 2;
            return new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0);
        });
        const torus = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(mycopts),
            new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }),
        );
        torus.position.z = -0.32;
        this._mycoUnderring = torus;
        this._mycoUnderringBaseOpacity = 0.3;
        this._mycoUnderringBaseEmissive = 0;
        this._calendarGroup.add(torus);
    }

    // ──────────────────────────────────────────────────────────────────
    // OVERLAY GROUP — particles, pulses, flows. All rendered in this group
    // so destroy can sweep it cleanly.
    // ──────────────────────────────────────────────────────────────────
    _buildOverlayGroup() {
        this._overlayGroup = new THREE.Group();
        this._calendarGroup.add(this._overlayGroup);
    }

    // ──────────────────────────────────────────────────────────────────
    // MUTUALISM LINES — pre-allocate LineSegments with capacity for
    // every mutualism edge; per-frame we only fill in vertices for pairs
    // currently active and zero out the rest. Avoids per-frame allocations.
    // ──────────────────────────────────────────────────────────────────
    _buildMutualismGroup() {
        this._mutualismGroup = new THREE.Group();
        this._calendarGroup.add(this._mutualismGroup);
    }

    _buildMutualismLines() {
        if (!this._mutualismGroup) return;

        // Clear previous
        while (this._mutualismGroup.children.length) {
            const c = this._mutualismGroup.children[0];
            c.geometry?.dispose?.();
            c.material?.dispose?.();
            this._mutualismGroup.remove(c);
        }
        this._mutualismMeshes = [];

        const N = this._mutualisms.length;
        if (N === 0) return;

        const taxonRadius = {};
        const taxonZ = {};
        for (const t of PhenologicalCalendar.TAXA) {
            taxonRadius[t.key] = t.radius;
            taxonZ[t.key] = t.z;
        }

        // ── One Mesh per edge — TubeGeometry along a 3D Bezier through a
        // control point pulled inward and lifted slightly off the orbit plane
        // (so arcs read as a vault between orbits, not chords through the disc).
        for (let i = 0; i < N; i++) {
            const m = this._mutualisms[i];
            const sa = this.species[m.a];
            const sb = this.species[m.b];
            const ra = taxonRadius[sa.taxon];
            const rb = taxonRadius[sb.taxon];
            const za = taxonZ[sa.taxon];
            const zb = taxonZ[sb.taxon];
            const aaA = (sa.peakDay / 365) * Math.PI * 2 - Math.PI / 2;
            const aaB = (sb.peakDay / 365) * Math.PI * 2 - Math.PI / 2;
            const ax = Math.cos(aaA) * ra, ay = Math.sin(aaA) * ra;
            const bx = Math.cos(aaB) * rb, by = Math.sin(aaB) * rb;
            // Mid control point: pulled toward origin, lifted up in z so arc
            // bows out of the orbit plane. Lift magnitude scales with angular
            // distance — peers near each other → flat-ish arc; antipodes →
            // tall vault.
            let dA = Math.abs(sa.peakDay - sb.peakDay);
            if (dA > 182) dA = 365 - dA;
            const angDist = dA / 182;            // 0..1
            const mx = (ax + bx) * 0.5 * 0.30;
            const my = (ay + by) * 0.5 * 0.30;
            const mz = (za + zb) * 0.5 + 0.18 + angDist * 0.45;
            const curve = new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(ax, ay, za),
                new THREE.Vector3(mx, my, mz),
                new THREE.Vector3(bx, by, zb),
            );
            // 1-bit mutualism: thin Line along Bezier, no tube volume
            const curvePts = curve.getPoints(22);
            const mat = new THREE.LineBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.0,
                depthWrite: false,
            });
            const geo = new THREE.BufferGeometry().setFromPoints(curvePts);
            const mesh = new THREE.Line(geo, mat);
            mesh.visible = false;
            this._mutualismGroup.add(mesh);
            this._mutualismMeshes.push({ mesh, kind: m.kind, a: m.a, b: m.b });
        }
    }

    // ──────────────────────────────────────────────────────────────────
    // HTML OVERLAYS — selectable, crisp species census + persistent labels.
    // Mounted into the same container as the Three canvas. The canvas sits
    // at z=0; these overlays sit on top with pointer-events:none so OrbitControls
    // (when re-enabled) still work.
    // ──────────────────────────────────────────────────────────────────
    _buildHtmlOverlays() {
        if (!this.elem) return;
        const cs = window.getComputedStyle(this.elem);
        if (cs.position === "static") this.elem.style.position = "relative";

        // ── Shared stylesheet (one <style> for the whole module). After
        // CodeColumns: sans-serif default browser font, white, sized in vmin
        // so it scales with the projector window. No antialiasing toggle:
        // -webkit-font-smoothing:antialiased forces crisp text on macOS/Win.
        const styleId = "phenology-calendar-style";
        if (!document.getElementById(styleId)) {
            const style = document.createElement("style");
            style.id = styleId;
            // ── 1-bit / 8-bit aesthetic: monospace, uppercase, white on black,
            // no antialiasing, no gradients, pixel-grid feel.
            style.textContent = `
.pheno-col {
    position: absolute;
    top: 0; height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    /* Base font size bumped from calc(2px+0.75vmin) → calc(4px+1.05vmin)
       so the right-info column reads comfortably on a projector. */
    font-size: calc(4px + 1.05vmin);
    /* Tighter line-height across the column so sections feel dense and
       readable rather than airy and small (was 1.4 → now 1.1). */
    line-height: 1.1;
    color: #ffffff;
    pointer-events: auto;
    white-space: pre-wrap;
    box-sizing: border-box;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.3) transparent;
    -webkit-font-smoothing: none;
    -moz-osx-font-smoothing: unset;
    font-family: 'Courier New', 'Lucida Console', 'Consolas', monospace;
    background: rgba(0,0,0,0.82);
    border-right: 1px solid rgba(255,255,255,0.18);
    z-index: 5;
    text-transform: uppercase;
    letter-spacing: 0.06em;
}
.pheno-col::-webkit-scrollbar { width: 3px; }
.pheno-col::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); }
.pheno-col__census { left: 0; width: 28%; padding: 0.3vmin 0.6vmin 0.3vmin 0.6vmin; text-align: left; }
.pheno-col__info   { right: 0; width: 24%; padding: 0.3vmin 0.6vmin 0.3vmin 0.6vmin; text-align: left;
    border-left: 1px solid rgba(255,255,255,0.18); border-right: none; }

.pheno-col .ph-section { margin: 0; padding: 0.25vmin 0; }
.pheno-col .ph-section + .ph-section { border-top: 1px solid rgba(255,255,255,0.18); }
.pheno-col .ph-label {
    /* Section labels (DIA, REGIMEN, SITIO, etc.) — readable at projector distance */
    font-size: calc(2px + 0.75vmin);
    letter-spacing: 0.18em;
    color: rgba(255,255,255,0.6);
    text-transform: uppercase;
    margin: 0;
    line-height: 1.0;
}
.pheno-col .ph-big {
    /* Day number, active count — keep big and tight */
    font-size: calc(7px + 2.4vmin);
    font-weight: 700;
    color: #ffffff;
    letter-spacing: 0.1em;
    line-height: 0.95;
    margin: 0;
    display: block;
}
.pheno-col .ph-mid {
    font-size: calc(3px + 1.15vmin);
    font-weight: 700;
    color: #ffffff;
    margin: 0;
    letter-spacing: 0.08em;
    line-height: 1.05;
}
.pheno-col .ph-sub {
    font-size: calc(2px + 0.85vmin);
    color: rgba(255,255,255,0.7);
    letter-spacing: 0.08em;
    line-height: 1.05;
    margin: 0;
}
.pheno-col .ph-rule { display: none; }
.pheno-col .ph-quiet {
    font-size: calc(3px + 1.2vmin);
    color: rgba(255,255,255,0.4);
    margin: 0;
    line-height: 1.05;
}
.pheno-col .ph-taxon {
    font-size: calc(3px + 1.0vmin);
    margin: 0;
    letter-spacing: 0.1em;
    line-height: 1.05;
    color: rgba(255,255,255,0.8);
}
.pheno-col .ph-sci {
    font-size: calc(4px + 1.55vmin);
    font-weight: 700;
    color: #ffffff;
    line-height: 1.05;
    margin: 0;
    word-break: break-word;
    letter-spacing: 0.04em;
}
.pheno-col .ph-common {
    /* Vernacular name in focus block — promoted to readable size */
    font-size: calc(3px + 1.15vmin);
    color: rgba(255,255,255,0.85);
    margin: 0;
    line-height: 1.05;
    font-weight: 700;
}
.pheno-col .ph-fam {
    font-size: calc(2px + 0.85vmin);
    color: rgba(255,255,255,0.5);
    margin: 0;
    line-height: 1.05;
}
.pheno-col .ph-extras {
    font-size: calc(2px + 0.85vmin);
    color: rgba(255,255,255,0.5);
    line-height: 1.05;
    margin: 0;
}
.pheno-col .ph-progress {
    height: 3px;
    background: rgba(255,255,255,0.12);
    margin: 0.15vmin 0;
}
.pheno-col .ph-progress-fill {
    height: 100%;
    background: #ffffff;
    transition: width 0.5s steps(20, end);
}
.pheno-col .ph-bar-row {
    display: flex; align-items: center; gap: 0.5vmin;
    margin: 0;
    font-size: calc(2px + 0.85vmin);
    line-height: 1.1;
}
.pheno-col .ph-bar-label {
    flex: 0 0 auto;
    width: 9vmin;
    color: rgba(255,255,255,0.75);
    letter-spacing: 0.08em;
}
.pheno-col .ph-bar-wrap {
    flex: 1; height: 4px;
    background: rgba(255,255,255,0.1);
    position: relative;
}
.pheno-col .ph-bar-fill {
    display: block; height: 100%;
    background: #ffffff;
    transition: width 0.4s steps(10, end);
}
.pheno-col .ph-bar-val {
    flex: 0 0 auto;
    width: 3vmin;
    text-align: right;
    color: rgba(255,255,255,0.92);
}
.pheno-col .ph-census-header {
    display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 1px solid rgba(255,255,255,0.22);
    padding-bottom: 0.15vmin;
    margin: 0 0 0.2vmin;
}
.pheno-col .ph-census-body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.1vmin 0.8vmin;
}
.pheno-col .ph-c-row {
    display: flex; align-items: baseline; gap: 0.5vmin;
    font-size: calc(2px + 0.88vmin);
    line-height: 1.1;
}
.pheno-col .ph-c-d { flex: 0 0 auto; width: 3vmin; font-size: calc(2px + 0.78vmin); color: #fff; }
.pheno-col .ph-c-t { flex: 0 0 auto; width: 6vmin; opacity: 0.6; font-size: calc(1px + 0.75vmin); letter-spacing: 0.06em; }
.pheno-col .ph-c-s { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(255,255,255,0.9); }
.pheno-col .ph-c-c { color: rgba(255,255,255,0.55); }
.pheno-col .ph-c-f { color: rgba(255,255,255,0.35); margin-left: 0.3vmin; }

.pheno-label-layer { position: absolute; inset: 0; pointer-events: none;
    -webkit-font-smoothing: none; -moz-osx-font-smoothing: unset;
    overflow: hidden;
    /* No mix-blend-mode here: would erase the dark plaque behind each label
       and make the common-name text unreadable against the bright phosphor
       ring. We want the plaque opaque so the vernacular name reads sharp. */
    font-family: 'Courier New', 'Lucida Console', 'Consolas', monospace;
    text-transform: uppercase;
    z-index: 4;
}
.pheno-active-label {
    position: absolute; transform: translate(-50%, -50%);
    white-space: nowrap;
    letter-spacing: 0.08em;
    text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 2px 2px 0 #000;
    transition: opacity 0.3s steps(3, end);
    opacity: 0; pointer-events: none;
    background: rgba(0,0,0,0.85);
    padding: 2px 5px;
    outline: 1px solid rgba(255,255,255,0.7);
    text-align: center;
}
/* Common (vernacular) name is the primary line — big, white, 1-bit feel.
   Scientific name is secondary, smaller and dim, beneath it. */
.pheno-active-label .ph-l-com {
    font-weight: 700;
    font-size: calc(5px + 1.6vmin);
    line-height: 1.0;
    color: #fff;
    letter-spacing: 0.10em;
    image-rendering: pixelated;
}
.pheno-active-label .ph-l-sci {
    font-size: calc(2px + 0.78vmin);
    line-height: 1.1;
    color: rgba(255,255,255,0.55);
    font-style: normal;
    letter-spacing: 0.04em;
    margin-top: 2px;
}
/* When a species has NO common name, the scientific name acts as primary */
.pheno-active-label.no-common .ph-l-sci {
    font-weight: 700;
    font-size: calc(4px + 1.3vmin);
    color: #fff;
    margin-top: 0;
}
            `;
            document.head.appendChild(style);
        }

        // ── Build the four columns. After CodeColumns: position:absolute,
        // sized in vmin, sans-serif. We name them so _renderHUD can write.
        const mk = (cls) => {
            const el = document.createElement("div");
            el.className = `pheno-col ${cls}`;
            this.elem.appendChild(el);
            return el;
        };
        this._huCols = {
            census: mk("pheno-col__census"),
            info:   mk("pheno-col__info"),
        };

        // Persistent label layer (anchored to projected ring node positions).
        const lab = document.createElement("div");
        lab.className = "pheno-label-layer";
        this.elem.appendChild(lab);
        this._labelLayer = lab;
    }

    // ──────────────────────────────────────────────────────────────────
    // BIOGEOCHEMICAL OVERLAY UPDATE (per-frame)
    // ──────────────────────────────────────────────────────────────────
    _updateOverlay(dt) {
        if (!this._overlayGroup) return;
        // Sweep prior frame's overlay meshes — particle counts are small.
        while (this._overlayGroup.children.length) {
            const c = this._overlayGroup.children[0];
            c.geometry?.dispose?.();
            c.material?.dispose?.();
            this._overlayGroup.remove(c);
        }

        // ── CO₂ particles: 1-bit wireframe crosses falling from above ──
        for (let i = this._co2Particles.length - 1; i >= 0; i--) {
            const p = this._co2Particles[i];
            p.t += dt;
            const f = Math.min(1, p.t / p.dur);
            const x = p.x0 + (p.x1 - p.x0) * f;
            const y = p.y0 + (p.y1 - p.y0) * f;
            const z = (p.z0 ?? 0.7) + ((p.z1 ?? 0) - (p.z0 ?? 0.7)) * f;
            const alpha = (1 - f) * 0.95;
            const s = 0.018;
            const crossPts = [
                new THREE.Vector3(-s, 0, 0), new THREE.Vector3(s, 0, 0),
                new THREE.Vector3(0, -s, 0), new THREE.Vector3(0, s, 0),
                new THREE.Vector3(0, 0, -s), new THREE.Vector3(0, 0, s),
            ];
            // Draw as 3 separate Line segments (pairs)
            for (let pair = 0; pair < 3; pair++) {
                const seg = new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints([crossPts[pair * 2], crossPts[pair * 2 + 1]]),
                    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: alpha }),
                );
                seg.position.set(x, y, z);
                this._overlayGroup.add(seg);
            }
            if (f >= 1) this._co2Particles.splice(i, 1);
        }

        // ── Mycorrhizal pulses: 1-bit expanding line circles ──
        for (let i = this._mycoPulses.length - 1; i >= 0; i--) {
            const p = this._mycoPulses[i];
            p.life -= dt * 0.6;
            p.r += dt * 0.55 * p.intensity;
            if (p.life <= 0) { this._mycoPulses.splice(i, 1); continue; }
            const opacity = Math.max(0, p.life) * 0.9;
            const segs = 96;
            const circlePts = Array.from({ length: segs + 1 }, (_, j) => {
                const a = (j / segs) * Math.PI * 2;
                return new THREE.Vector3(Math.cos(a) * p.r, Math.sin(a) * p.r, 0);
            });
            const circle = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(circlePts),
                new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthWrite: false }),
            );
            circle.position.z = -0.32;
            this._overlayGroup.add(circle);
            // Brighten underring during pulses
            if (this._mycoUnderring) {
                const lift = Math.max(0, p.life) * 0.6;
                this._mycoUnderring.material.opacity =
                    Math.min(0.9, this._mycoUnderringBaseOpacity + lift);
            }
        }
        if (this._mycoPulses.length === 0 && this._mycoUnderring) {
            this._mycoUnderring.material.opacity = this._mycoUnderringBaseOpacity;
        }

        // ── Nutrient flows: 1-bit diamond markers on curved trajectory ──
        for (let i = this._nutrientFlows.length - 1; i >= 0; i--) {
            const p = this._nutrientFlows[i];
            p.t += dt;
            const f = Math.min(1, p.t / p.dur);
            const mx = (p.x0 + p.x1) * 0.5 * 0.65;
            const my = (p.y0 + p.y1) * 0.5 * 0.65;
            const mz = ((p.z0 ?? -0.32) + (p.z1 ?? -0.18)) * 0.5 + 0.08;
            const u = 1 - f;
            const x = u * u * p.x0 + 2 * u * f * mx + f * f * p.x1;
            const y = u * u * p.y0 + 2 * u * f * my + f * f * p.y1;
            const z = u * u * (p.z0 ?? -0.32) + 2 * u * f * mz + f * f * (p.z1 ?? -0.18);
            const alpha = (1 - f) * 0.95;
            const m = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.016, 0),
                new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: alpha, depthWrite: false }),
            );
            m.position.set(x, y, z);
            this._overlayGroup.add(m);
            if (f >= 1) this._nutrientFlows.splice(i, 1);
        }
    }

    // Quadratic curve through the disc center, drawn as a polyline.
    _mutualismKindColor(kind) {
        switch (kind) {
            case "pollinator":   return [0.91, 0.66, 0.55];   // peach
            case "frugivory":    return [0.83, 0.73, 0.48];   // gold
            case "nesting":      return [0.66, 0.43, 0.33];   // rust
            case "herbivory":    return [0.55, 0.58, 0.46];   // olive
            case "predation":    return [0.71, 0.30, 0.30];   // dim red
            case "mycorrhizal":  return [0.71, 0.54, 0.71];   // violet
            default:             return [0.91, 0.87, 0.78];   // ivory
        }
    }

    _updateMutualismLines() {
        if (!this._mutualismMeshes || this._mutualismMeshes.length === 0) return;

        const activity = (s) => {
            let d = Math.abs(s.peakDay - this.day);
            if (d > 182) d = 365 - d;
            return Math.exp(-(d * d) / (2 * s.window * s.window * 0.6));
        };

        // Show edges only where both endpoints have activity ≥ 0.5 — precise,
        // not speculative. Opacity = product of activities so peak-of-peak
        // edges glow brightest; faint edges remain hidden via mesh.visible.
        for (const e of this._mutualismMeshes) {
            const sa = this.species[e.a];
            const sb = this.species[e.b];
            const aA = activity(sa);
            const aB = activity(sb);
            if (aA < 0.5 || aB < 0.5) {
                if (e.mesh.visible) e.mesh.visible = false;
                continue;
            }
            const alpha = Math.min(1, aA * aB * 1.15);
            e.mesh.visible = true;
            e.mesh.material.opacity = alpha * 0.75;
        }
    }

    // ──────────────────────────────────────────────────────────────────
    // HTML LABELS + CENSUS — readable, persistent species text.
    //
    // Label persistence: once a species enters peak (activity > 0.6) it gets
    // a DOM label. The label stays for 3.5 s after activity drops below 0.5
    // (so the eye has time to read it as the cursor moves on).
    // ──────────────────────────────────────────────────────────────────
    _updateHtmlOverlays(_dt) {
        if (!this._labelLayer || !this.camera || !this.renderer) return;
        const PERSIST_MS = 3500;
        const now = performance.now();
        const w = this.renderer.domElement.clientWidth;
        const h = this.renderer.domElement.clientHeight;

        // 1-bit: all white labels
        const taxonColors = {
            flora:      "rgba(255,255,255,0.95)",
            amphibians: "rgba(255,255,255,0.95)",
            reptiles:   "rgba(255,255,255,0.95)",
            mammals:    "rgba(255,255,255,0.95)",
            birds:      "rgba(255,255,255,0.95)",
        };
        const taxonRadius = {};
        const taxonZ = {};
        for (const t of PhenologicalCalendar.TAXA) {
            taxonRadius[t.key] = t.radius;
            taxonZ[t.key] = t.z;
        }

        // Decide which species are "currently present" (>0.6 = enter; >0.3 = stay)
        const tmpV = new THREE.Vector3();
        const groupMatrix = this._calendarGroup ? this._calendarGroup.matrixWorld : null;

        // Art. 47 § — cláusula de opacidad: a deterministic fraction of
        // labels is hidden regardless of activity. The hash-per-sci keeps
        // the same species hidden across frames (otherwise labels would
        // flicker on/off as the random seed rolled). _opacityFloor=0.0 →
        // nothing hidden; 0.7 → ~70% of would-be-labels stay invisible.
        const opacityFloor = this._opacityFloor;
        const windowScale = this._windowWidth;

        for (const s of this.species) {
            // Opacity floor: skip this species' label entirely if its
            // deterministic hash falls below the floor. Read this once
            // per species so the cláusula is stable per frame.
            if (opacityFloor > 0 && this._hash01(s.sci + "|opacity") < opacityFloor) {
                // Also remove any previously-displayed label for this species
                const prev = this._activeLabels.get(s.sci);
                if (prev) {
                    prev.el.style.opacity = "0";
                    setTimeout(() => {
                        if (prev.el.parentNode) prev.el.parentNode.removeChild(prev.el);
                    }, 300);
                    this._activeLabels.delete(s.sci);
                }
                continue;
            }
            let d = Math.abs(s.peakDay - this.day);
            if (d > 182) d = 365 - d;
            const w = s.window * windowScale;
            const act = Math.exp(-(d * d) / (2 * w * w * 0.6));
            const existing = this._activeLabels.get(s.sci);
            const enter = act > 0.6;
            const stay = act > 0.3;
            if (!(enter || (stay && existing))) continue;

            // ── Project the *world-space* ring position (after calendarGroup
            // tilt) onto the renderer canvas. Without applying matrixWorld,
            // labels would float in front of the camera-relative 2D plane and
            // not track the orbit's actual screen position when the user
            // rotates the view.
            const ang = (s.peakDay / 365) * Math.PI * 2 - Math.PI / 2;
            const r = taxonRadius[s.taxon] || 0.6;
            const z = taxonZ[s.taxon] || 0;
            tmpV.set(Math.cos(ang) * r, Math.sin(ang) * r, z);
            if (groupMatrix) tmpV.applyMatrix4(groupMatrix);
            tmpV.project(this.camera);
            // Skip labels behind the camera
            if (tmpV.z > 1) continue;
            const sx = (tmpV.x * 0.5 + 0.5) * w;
            const sy = (1 - (tmpV.y * 0.5 + 0.5)) * h;

            if (!existing) {
                const el = document.createElement("div");
                el.className = "pheno-active-label" + (s.common ? "" : " no-common");
                el.style.color = "rgba(255,255,255,0.95)";
                // ── Common (vernacular) name FIRST and prominent ──
                // The Cámara Fenológica grants voice to species; the everyday
                // name is how a community recognizes them, so it leads.
                // Scientific name follows, smaller and dim, for taxonomic clarity.
                if (s.common) {
                    const com = document.createElement("div");
                    com.className = "ph-l-com";
                    com.textContent = s.common.toUpperCase();
                    el.appendChild(com);
                }
                const sci = document.createElement("div");
                sci.className = "ph-l-sci";
                sci.textContent = s.sci;
                el.appendChild(sci);
                this._labelLayer.appendChild(el);
                void el.offsetWidth;
                el.style.opacity = "0.95";
                this._activeLabels.set(s.sci, {
                    el, taxon: s.taxon, lastSeenAt: now, peakDay: s.peakDay,
                    sci: s.sci, common: s.common, family: s.family,
                });
            } else if (enter) {
                existing.lastSeenAt = now;
            }
            const rec = this._activeLabels.get(s.sci);
            rec.el.style.left = sx + "px";
            rec.el.style.top = sy + "px";
        }

        // Expire labels past PERSIST_MS
        for (const [sci, rec] of this._activeLabels) {
            if (now - rec.lastSeenAt > PERSIST_MS) {
                rec.el.style.opacity = "0";
                setTimeout(() => {
                    if (rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
                }, 650);
                this._activeLabels.delete(sci);
            }
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

        // Subtle breathing of cursor head + pulse-driven inflation
        if (this._cursorHead) {
            const b = (1 + 0.15 * Math.sin(this._t * 2.4)) * (1 + this._pulseAmount * 0.2);
            this._cursorHead.scale.setScalar(b);
        }

        // Slow parallax spin of wireframe icosahedra backdrop
        if (this._backdropIco) {
            this._backdropIco.rotation.y += dt * 0.05;
            this._backdropIco.rotation.x += dt * 0.02;
        }
        if (this._backdropIco2) {
            this._backdropIco2.rotation.y -= dt * 0.02;
            this._backdropIco2.rotation.z += dt * 0.015;
        }

        // OrbitControls damping
        if (this.controls && this.controls.enabled) this.controls.update();

        this._updateSpeciesLuminance();
        this._updateMutualismLines();
        this._updateOverlay(dt);
        this._updateHtmlOverlays(dt);
        this._renderHUD();

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
        // Spear and head are built along +Y; the group spins on Z so the
        // global angle equals 'a'. (Original 2D math survives because we kept
        // local axes the same.)
        this.cursorGroup.rotation.z = a - Math.PI / 2;

        // Rebuild trailing tube each call. Arc spans ~22° back from the cursor,
        // tapering radius and offset along Z so the tail dips slightly below
        // the outer ring — reads as motion-blur in 3D.
        if (this._cursorArc) {
            const SEGS = 24;
            const r = 1.05;
            const pts = this._cursorArcCurvePoints;
            for (let i = 0; i < SEGS; i++) {
                const f = i / (SEGS - 1);
                const aBack = a - f * 0.38;
                pts[i].set(Math.cos(aBack) * r, Math.sin(aBack) * r, 0.21 - f * 0.04);
            }
            // Update Line geometry positions in-place (no new allocation)
            this._cursorArc.geometry.setFromPoints(pts);
        }
    }

    _renderAll() {
        this._updateCursor();
        this._updateSpeciesLuminance();
        this._renderHUD();
    }

    // Compute proximity of cursor (this.day) to each species' peak (cyclic)
    // and update vertex colors / sizes.
    //
    // Honors the Cámara Fenológica state (Capítulo VI):
    //   _activityThreshold (Art. 45) replaces the hardcoded 0.5
    //   _windowWidth       (Art. 44) scales the gaussian window per species
    //   _absenceWeight     (Art. 44 §) — makes sub-threshold species visible
    //                                    as dithered ghosts (the ausencia es voz)
    //   _bancada           (Art. 43 §1) overrides focusedTaxon when active
    _updateSpeciesLuminance() {
        const cur = this.day;
        const pulse = this._pulseAmount;
        const threshold = this._activityThreshold;
        const windowScale = this._windowWidth;
        const absW = this._absenceWeight;
        const bancada = this._bancada;

        let activeCounts = { flora: 0, amphibians: 0, reptiles: 0, mammals: 0, birds: 0 };
        let topActivity = -1;
        let topRecord = null;

        const _obj = (this._tmpObj3D ||= new THREE.Object3D());
        const _col = (this._tmpColor ||= new THREE.Color());

        // Dither phase for absence shimmer (slow 2 Hz blink, deterministic per frame)
        const ditherPhase = (Math.sin(this._t * 12.5) + 1) * 0.5;

        // Bancada → set of taxon keys active for this season (Art. 43 §1)
        const bancadaTaxa = PhenologicalCalendar._bancadaTaxa(bancada);

        for (const entry of this.speciesMeshes) {
            const inst = entry.mesh;
            // Bancada overrides focusedTaxon when set; else honor focusedTaxon
            let focused;
            if (bancadaTaxa) {
                focused = bancadaTaxa.has(entry.taxon);
            } else {
                focused = (this.focusedTaxon === "all" || this.focusedTaxon === entry.taxon);
            }

            for (const r of entry.records) {
                const s = r.rec;
                let d = Math.abs(s.peakDay - cur);
                if (d > 182) d = 365 - d;
                // Window width: scaled globally by Art. 44 control
                const w = s.window * windowScale;
                const activity = Math.exp(-(d * d) / (2 * w * w * 0.6));
                const focusMult = focused ? 1 : 0.16;

                // ── 1-bit scale: nodes snap between two sizes — off and on ──
                const scale = (0.010 + 0.026 * activity + 0.022 * pulse * activity) * focusMult;

                // Activity lift (1-bit white when active, dark when dormant)
                let lift = Math.min(1, (0.10 + 1.0 * activity + pulse * 0.6 * activity) * focusMult);

                // Absence shimmer (Art. 44 §): species *below* the quórum
                // threshold blink faintly. The ausencia es voz: it's visible
                // even though it doesn't count toward the quórum.
                if (activity < threshold && absW > 0) {
                    const ghost = 0.08 * absW * (0.5 + 0.5 * ditherPhase);
                    lift = Math.max(lift, ghost);
                }
                _col.setRGB(lift, lift, lift);

                _obj.position.set(r.x, r.y, r.z);
                _obj.scale.setScalar(scale);
                _obj.updateMatrix();
                inst.setMatrixAt(r.idx, _obj.matrix);
                inst.setColorAt(r.idx, _col);

                // Quórum sensible (Art. 45): respects the dynamic threshold
                if (activity > threshold) activeCounts[entry.taxon]++;
                if (focused && activity > topActivity) {
                    topActivity = activity;
                    topRecord = s;
                }
            }
            inst.instanceMatrix.needsUpdate = true;
            if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        }
        this._activeCounts = activeCounts;
        this._highlightSpecies = topRecord;
    }

    // ──────────────────────────────────────────────────────────────────
    // HUD — HTML column layout (after CodeColumns).
    //
    // Four columns share the screen alongside the 3D scene:
    //   left-narrow  (5vh from left, 15% wide)   — date + season + site
    //   left-wide    (22vh from left, 18% wide)  — focus species (the one in
    //                                              deepest peak right now)
    //   right-wide   (22vh from right, 30% wide) — census of all peak species
    //   right-narrow (5vh from right, 15% wide)  — counts + breakdown bars
    //
    // All text is sans-serif, antialiased, sized with vmin so it scales with
    // the projector window. No serif glyphs anywhere except none — sans only.
    // ──────────────────────────────────────────────────────────────────
    _renderHUD() {
        if (!this._huCols) return;
        const { census, info } = this._huCols;

        const { monthIdx, dayOfMonth } = this._dayToDate(this.day);
        const month = PhenologicalCalendar.MONTHS_ES[monthIdx];
        const season = this._seasonForDay(this.day);
        // 1-bit: all white, differentiated by opacity brackets only
        const taxaColors = {
            flora:      "rgba(255,255,255,0.95)",
            amphibians: "rgba(255,255,255,0.95)",
            reptiles:   "rgba(255,255,255,0.95)",
            mammals:    "rgba(255,255,255,0.95)",
            birds:      "rgba(255,255,255,0.95)",
        };

        // ── INFO COLUMN (right): date · régimen · sitio · focus · counts ─
        const counts = this._activeCounts || { flora: 0, amphibians: 0, reptiles: 0, mammals: 0, birds: 0 };
        const total = counts.flora + counts.amphibians + counts.reptiles + counts.mammals + counts.birds;
        const taxa = [
            { k: "birds", label: "AVES", col: taxaColors.birds },
            { k: "mammals", label: "MAMMALIA", col: taxaColors.mammals },
            { k: "reptiles", label: "REPTILIA", col: taxaColors.reptiles },
            { k: "amphibians", label: "AMPHIBIA", col: taxaColors.amphibians },
            { k: "flora", label: "FLORA", col: taxaColors.flora },
        ];
        const maxC = Math.max(1, ...taxa.map(t => counts[t.k]));
        const bars = taxa.map(t => `
<div class="ph-bar-row">
  <span class="ph-bar-label">${t.label}</span>
  <span class="ph-bar-wrap"><span class="ph-bar-fill" style="width:${(counts[t.k] / maxC * 100).toFixed(0)}%"></span></span>
  <span class="ph-bar-val">${counts[t.k]}</span>
</div>`).join("");

        const s = this._highlightSpecies;
        let focusBlock;
        if (!s) {
            focusBlock = `
<div class="ph-section">
  <div class="ph-label">EN PICO // FOCUS</div>
  <div class="ph-quiet">-- QUIETUD --</div>
</div>`;
        } else {
            const extras = [s.habit, s.origin, s.succession].filter(Boolean).join(" // ");
            // Vernacular (common) name leads, scientific dimmer underneath —
            // matches the floating species labels for consistency.
            focusBlock = `
<div class="ph-section">
  <div class="ph-label">EN PICO // FOCUS</div>
  <div class="ph-taxon">&gt; ${s.taxon.toUpperCase()} // D${s.peakDay}</div>
  ${s.common ? `<div class="ph-common">${s.common.toUpperCase()}</div>` : ""}
  <div class="ph-sci">${s.sci.toUpperCase()}</div>
  ${s.family ? `<div class="ph-fam">FAM. ${s.family.toUpperCase()}</div>` : ""}
  ${extras ? `<div class="ph-extras">${extras.toUpperCase()}</div>` : ""}
</div>`;
        }

        info.innerHTML = `
<div class="ph-section">
  <div class="ph-label">DIA // DAY</div>
  <div class="ph-big">${String(this.day).padStart(3, "0")}</div>
  <div class="ph-sub">${String(dayOfMonth).padStart(2, "0")} ${month.toUpperCase()}</div>
</div>
<div class="ph-section">
  <div class="ph-label">REGIMEN</div>
  <div class="ph-mid">${season.label.toUpperCase()}</div>
  <div class="ph-sub">&gt; ${season.tag.toUpperCase()}</div>
</div>
<div class="ph-section">
  <div class="ph-label">SITIO // SITE</div>
  <div class="ph-mid">RESERVA MANAKAI</div>
  <div class="ph-sub">PLANETA RICA, CORDOBA</div>
  <div class="ph-sub">COLOMBIA</div>
  <div class="ph-sub">08.47N 75.58W</div>
  <div class="ph-sub">BIMODAL // TROPICO HUMEDO</div>
</div>
<div class="ph-section">
  <div class="ph-label">YEAR PROGRESS</div>
  <div class="ph-progress"><div class="ph-progress-fill" style="width:${(this.day / 365 * 100).toFixed(1)}%"></div></div>
  <div class="ph-sub">${this.species.length} SPP // 365 D</div>
</div>
${focusBlock}
<div class="ph-section">
  <div class="ph-label">EN ACTIVIDAD // ACTIVE</div>
  <div class="ph-big">${String(total).padStart(3, "0")}</div>
  <div class="ph-sub">/ ${this.species.length} TOTAL</div>
</div>
<div class="ph-section">${bars}</div>`;

        // ── CENSUS COLUMN (left): scrolling list of all species in peak ──
        // Rate-limited to once / 300 ms so DOM updates don't fight scroll.
        const tnow = performance.now();
        if (!this._lastCensusUpdate || (tnow - this._lastCensusUpdate) > 300) {
            this._lastCensusUpdate = tnow;
            const censusEntries = [];
            const winScale = this._windowWidth;
            const censusThresh = this._activityThreshold;
            const opacityFloor = this._opacityFloor;
            for (const sp of this.species) {
                // Honor Art. 47 § opacity floor: hidden labels also drop
                // from the census so what's published matches what's visible
                if (opacityFloor > 0 && this._hash01(sp.sci + "|opacity") < opacityFloor) continue;
                let d = Math.abs(sp.peakDay - this.day);
                if (d > 182) d = 365 - d;
                const w = sp.window * winScale;
                const act = Math.exp(-(d * d) / (2 * w * w * 0.6));
                if (act > censusThresh) censusEntries.push({ s: sp, act });
            }
            censusEntries.sort((u, v) => {
                if (u.s.taxon !== v.s.taxon) {
                    return PhenologicalCalendar.TAXA.findIndex(t => t.key === u.s.taxon)
                         - PhenologicalCalendar.TAXA.findIndex(t => t.key === v.s.taxon);
                }
                return v.act - u.act;
            });
            const lines = censusEntries.map(({ s: sp, act }) => {
                // 1-bit: brightness via character repeat (pixel-fill proxy)
                const filled = Math.max(1, Math.round(act * 5));
                const dots = "#".repeat(filled) + ".".repeat(5 - filled);
                const tag = (PhenologicalCalendar.TAXA.find(t => t.key === sp.taxon) || { label: sp.taxon.toUpperCase() }).label;
                // Vernacular name leads (white, primary). Scientific name follows
                // dimmer in parens. Family at the end. If no common name exists,
                // scientific takes the primary slot so the row never reads blank.
                const primary = sp.common
                    ? sp.common.toUpperCase()
                    : sp.sci.toUpperCase();
                const secondary = sp.common
                    ? `<span class="ph-c-c"> (${sp.sci.toUpperCase()})</span>`
                    : "";
                const fam = sp.family ? `<span class="ph-c-f"> ${sp.family.toUpperCase()}</span>` : "";
                return `<div class="ph-c-row"><span class="ph-c-d">${dots}</span><span class="ph-c-t">${tag}</span><span class="ph-c-s">${primary}${secondary}${fam}</span></div>`;
            }).join("");
            census.innerHTML = `
<div class="ph-section ph-census-header">
  <div class="ph-label">CENSO // CENSUS</div>
  <div class="ph-sub">D${String(this.day).padStart(3, "0")} // ${censusEntries.length} SPP</div>
</div>
<div class="ph-census-body">${lines || '<div class="ph-quiet">-- NINGUNA ESPECIE --</div>'}</div>`;
        }
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
        if (day >= 335 || day <= 90) return { label: "Seca", tag: "Dry" };
        if (day <= 151) return { label: "Primeras lluvias", tag: "First rains" };
        if (day <= 243) return { label: "Medio seco", tag: "Mid-dry" };
        return { label: "Segundas lluvias", tag: "Second rains" };
    }

    // ----------------------------------------------------------------
    // PUBLIC METHODS
    // ----------------------------------------------------------------

    setDay({ day = 1 } = {}) {
        this._setDayInternal(Number(day) || 1, true);
    }

    advance({ days = 1 } = {}) {
        this._setDayInternal(this.day + (Number(days) || 1), true);
    }

    autoplay({ enabled = true, daysPerSecond = 6 } = {}) {
        this.autoplayEnabled = !!enabled;
        const dps = Number(daysPerSecond);
        this.daysPerSecond = isFinite(dps) && dps > 0 ? dps : 6;
    }

    jumpToMonth({ month = "Ene" } = {}) {
        const idx = PhenologicalCalendar.MONTHS_ES.indexOf(month);
        if (idx < 0) return;
        const day = PhenologicalCalendar.MONTH_STARTS[idx] + 1;
        this._setDayInternal(day, true);
    }

    focusTaxon({ taxon = "all" } = {}) {
        const valid = ["all", "flora", "amphibians", "reptiles", "mammals", "birds"];
        this.focusedTaxon = valid.includes(taxon) ? taxon : "all";
        this._updateSpeciesLuminance();
        this._renderHUD();
    }

    pulse({ intensity = 1.4 } = {}) {
        // Art. 45 § — el voto modula, no anula. The Pulse Gain control
        // (range 0..2) lets the human chamber dial down (0 = silenced) or
        // up (2 = dominant) the modulation that votes apply to the
        // phenological pulse. At pulseGain=0 the bosque keeps swimming
        // but votes don't trigger the calendar bloom.
        const gained = (Number(intensity) || 1.4) * this._pulseGain;
        this._pulseAmount = Math.max(this._pulseAmount, Math.max(0, Math.min(4, gained)));
    }

    // ── Rotation slider control. Mirrors parliament rotation 0.1..2.0 →
    // daysPerSecond 0.15..3.0 (linear). Caller is the bridge which observes
    // parliamentStore.state.rotation.
    setRotation({ rotation = 1.0 } = {}) {
        const r = Math.max(0.1, Math.min(2.0, Number(rotation) || 1.0));
        this.daysPerSecond = r * 1.5;
        this.autoplayEnabled = true;
    }

    // ── Cámara Fenológica de lo Vivo — public setters (Capítulo VI) ──────
    // Called by phenology/breath.ts when /pheno/* OSC messages echo from SC.
    // All setters clamp to their declared ranges and persist state on the
    // instance so per-frame loops in _updateSpeciesLuminance, etc. pick them
    // up on the next tick.

    setActivityThreshold({ value = 0.5 } = {}) {
        const v = Math.max(0.20, Math.min(0.85, Number(value) || 0.5));
        this._activityThreshold = v;
    }

    setWindowWidth({ value = 1.0 } = {}) {
        const v = Math.max(0.4, Math.min(2.5, Number(value) || 1.0));
        this._windowWidth = v;
    }

    setSeasonalBias({ value = 0.0 } = {}) {
        const v = Math.max(-1.0, Math.min(1.0, Number(value) || 0.0));
        this._seasonalBias = v;
    }

    setAbsenceWeight({ value = 0.3 } = {}) {
        const v = Math.max(0.0, Math.min(1.0, Number(value) || 0.3));
        this._absenceWeight = v;
    }

    setPulseGain({ value = 1.0 } = {}) {
        const v = Math.max(0.0, Math.min(2.0, Number(value) || 1.0));
        this._pulseGain = v;
    }

    setOpacityFloor({ value = 0.0 } = {}) {
        const v = Math.max(0.0, Math.min(0.7, Number(value) || 0.0));
        this._opacityFloor = v;
    }

    setBancada({ value = "todas" } = {}) {
        const valid = ["todas", "seca", "primeras_lluvias", "medio_seco", "segundas_lluvias"];
        this._bancada = valid.includes(value) ? value : "todas";
    }

    // Read-only accessor for breath.ts reverse-breath loop
    getPulseGain() { return this._pulseGain; }
    getSeasonalBias() { return this._seasonalBias; }
    getActivityThreshold() { return this._activityThreshold; }
    getWindowWidth() { return this._windowWidth; }

    // Art. 42 § — sesiones de apertura de temporada.
    // Sets the cursor day to the first day of the named season.
    jumpSeason({ season = "seca" } = {}) {
        const d = PhenologicalCalendar._seasonFirstDay(season);
        this._setDayInternal(d, true);
        // Mild pulse so the jump is audible in the HUD without being a vote
        this._pulseAmount = Math.max(this._pulseAmount, 1.4);
    }

    // ──────────────────────────────────────────────────────────────────
    // BIOGEOCHEMICAL TRIGGERS — absorbed from BiocracyVisualizer, but
    // anchored to current phenology. Each picks an active species (or the
    // mycorrhizal underring) as the emission/reception point.
    // ──────────────────────────────────────────────────────────────────
    _pickActiveSpecies(filter) {
        if (!this.species || this.species.length === 0) return null;
        const candidates = [];
        const winScale = this._windowWidth;
        for (const s of this.species) {
            if (filter && !filter(s)) continue;
            let d = Math.abs(s.peakDay - this.day);
            if (d > 182) d = 365 - d;
            const w = s.window * winScale;
            const act = Math.exp(-(d * d) / (2 * w * w * 0.6));
            if (act > 0.4) candidates.push({ s, act });
        }
        if (candidates.length === 0) return null;
        // Weighted random by activity
        const total = candidates.reduce((a, c) => a + c.act, 0);
        let r = Math.random() * total;
        for (const c of candidates) {
            r -= c.act;
            if (r <= 0) return c.s;
        }
        return candidates[candidates.length - 1].s;
    }

    _ringPosOf(s) {
        const ang = (s.peakDay / 365) * Math.PI * 2 - Math.PI / 2;
        const taxonRadius = {};
        const taxonZ = {};
        for (const t of PhenologicalCalendar.TAXA) {
            taxonRadius[t.key] = t.radius;
            taxonZ[t.key] = t.z;
        }
        const r = taxonRadius[s.taxon] || 0.6;
        const z = taxonZ[s.taxon] || 0;
        return { x: Math.cos(ang) * r, y: Math.sin(ang) * r, z, ang, r };
    }

    triggerCO2({ amount = 50 } = {}) {
        const target = this._pickActiveSpecies(s =>
            s.taxon === "flora" && s.habit && /árbol|arbol|palmoide/i.test(s.habit)
        ) || this._pickActiveSpecies(s => s.taxon === "flora");
        let tx = 0, ty = 0, tz = -0.18;
        if (target) {
            const pos = this._ringPosOf(target);
            tx = pos.x; ty = pos.y; tz = pos.z;
        }
        const count = Math.max(3, Math.floor(amount / 10));
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const r0 = 1.6 + Math.random() * 0.4;
            this._co2Particles.push({
                x0: Math.cos(a) * r0, y0: Math.sin(a) * r0,
                z0: 1.0 + Math.random() * 0.4,       // start high above
                x1: tx + (Math.random() - 0.5) * 0.04,
                y1: ty + (Math.random() - 0.5) * 0.04,
                z1: tz,
                t: 0, dur: 1.2 + Math.random() * 0.6,
            });
        }
    }

    triggerMycoPulse({ intensity = 1 } = {}) {
        const i = Math.max(0.1, Math.min(5, Number(intensity) || 1));
        this._mycoPulses.push({ r: 0.34, life: 1.0, intensity: i });
        this.pulse({ intensity: 1.2 + i * 0.4 });
    }

    triggerPhosphorus({ amount = 30 } = {}) {
        const target = this._pickActiveSpecies(s => s.taxon === "flora");
        if (!target) return;
        const dst = this._ringPosOf(target);
        const count = Math.max(3, Math.floor(amount / 5));
        for (let i = 0; i < count; i++) {
            const a0 = Math.atan2(dst.y, dst.x) + (Math.random() - 0.5) * 0.6;
            this._nutrientFlows.push({
                x0: Math.cos(a0) * 0.34, y0: Math.sin(a0) * 0.34, z0: -0.32,
                x1: dst.x + (Math.random() - 0.5) * 0.03,
                y1: dst.y + (Math.random() - 0.5) * 0.03,
                z1: dst.z,
                t: 0, dur: 1.4 + Math.random() * 0.4,
                color: [1.0, 0.55, 0.20],     // orange — P
            });
        }
    }

    triggerNitrogen({ amount = 30 } = {}) {
        const target = this._pickActiveSpecies(s => s.taxon === "flora");
        if (!target) return;
        const dst = this._ringPosOf(target);
        const count = Math.max(3, Math.floor(amount / 5));
        for (let i = 0; i < count; i++) {
            const a0 = Math.atan2(dst.y, dst.x) + (Math.random() - 0.5) * 0.6;
            this._nutrientFlows.push({
                x0: Math.cos(a0) * 0.34, y0: Math.sin(a0) * 0.34, z0: -0.32,
                x1: dst.x + (Math.random() - 0.5) * 0.03,
                y1: dst.y + (Math.random() - 0.5) * 0.03,
                z1: dst.z,
                t: 0, dur: 1.4 + Math.random() * 0.4,
                color: [0.45, 0.62, 1.0],     // blue — N
            });
        }
    }

    // ----------------------------------------------------------------
    // DESTROY
    // ----------------------------------------------------------------

    destroy() {
        if (this._animationId) cancelAnimationFrame(this._animationId);
        this._animationId = null;

        const disposeObj = (obj) => {
            if (!obj) return;
            if (obj.geometry) obj.geometry.dispose?.();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
                else obj.material.dispose?.();
            }
            if (obj.parent) obj.parent.remove(obj);
        };

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

        // Sweep new groups
        if (this._overlayGroup) {
            while (this._overlayGroup.children.length) disposeObj(this._overlayGroup.children[0]);
            this._overlayGroup.parent?.remove(this._overlayGroup);
            this._overlayGroup = null;
        }
        if (this._mutualismGroup) {
            while (this._mutualismGroup.children.length) disposeObj(this._mutualismGroup.children[0]);
            this._mutualismGroup.parent?.remove(this._mutualismGroup);
            this._mutualismGroup = null;
        }
        if (this._mycoUnderring) {
            disposeObj(this._mycoUnderring);
            this._mycoUnderring = null;
        }

        // Sweep HTML overlays
        if (this._labelLayer && this._labelLayer.parentNode) {
            this._labelLayer.parentNode.removeChild(this._labelLayer);
        }
        if (this._huCols) {
            for (const c of Object.values(this._huCols)) {
                if (c && c.parentNode) c.parentNode.removeChild(c);
            }
            this._huCols = null;
        }
        this._labelLayer = null;
        if (this._activeLabels) this._activeLabels.clear();

        // Sweep calendar root group (catches anything still parented to it)
        if (this._calendarGroup) {
            const sweepGroup = (g) => {
                while (g.children.length) {
                    const c = g.children[0];
                    if (c.children && c.children.length) sweepGroup(c);
                    disposeObj(c);
                }
            };
            sweepGroup(this._calendarGroup);
            this._calendarGroup.parent?.remove(this._calendarGroup);
            this._calendarGroup = null;
        }

        super.destroy();
    }
}

export default PhenologicalCalendar;
