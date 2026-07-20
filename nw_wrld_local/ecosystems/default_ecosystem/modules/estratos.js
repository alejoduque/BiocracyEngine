/*
@nwWrld name: Estratos
@nwWrld category: 3D
@nwWrld imports: BaseThreeJsModule, THREE
*/

/*
 * Estratos — cartografía poética generativa en 3D, estratos reales.
 *
 * Reescritura para BiocracyEngine de la pieza "Estratos que piensan" de
 * Canek Zapata (canekzapata.net/estratos): un motor 2D-canvas riso/pixel
 * que ubica "especies" gráficas (nubes, montañas, peces, glifos CP437…)
 * en franjas verticales semánticas (cielo → subsuelo).
 *
 * Aquí las mismas franjas ("estratos") dejan de ser bandas de altura en
 * un lienzo plano y pasan a ser bandas de altura REALES en el espacio:
 * la cámara (OrbitControls, heredada de BaseThreeJsModule) atraviesa el
 * cielo, el bosque, el mar y el subsuelo tectónico como volúmenes
 * navegables, no como una imagen fija. Cada "especie" es un pequeño
 * canvas 2D pixel-art horneado a textura y montado como sprite —misma
 * aritmética de líneas punteadas del original— pero sembrado con la
 * semilla y el léxico propios de Biocracia en vez de los de Zapata.
 *
 * Atribución: el sistema de composición (semilla → paleta → estratos →
 * especies) está inspirado directamente en canekzapata.net/estratos.
 * El texto poético, los nombres de semilla y la reinterpretación en
 * espacio real son propios de este proyecto.
 *
 * Convención de módulo (self-managed render loop): igual que
 * DarkForest.js, este módulo NO usa setModel()/animationManager — corre
 * su propio requestAnimationFrame y por eso NO hereda
 * BaseThreeJsModule.methods (zoomLevel/viewDirection/displacement
 * dependen de this.model, que aquí nunca se asigna).
 */

const PX2W = 0.026;
const WORLD_X = 20;
const WORLD_Y_TOP = 9;
const WORLD_Y_SPAN = 18;

function toWorldX(px) { return (px / 720 - 0.5) * WORLD_X; }
function toWorldY(py) { return WORLD_Y_TOP - (py / 1000) * WORLD_Y_SPAN; }

function hashString(text) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

function mulberry32(seed) {
    return function () {
        let t = (seed += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makeRandomProxy(paper, ink, rngFn) {
    const accents = ["#1038ff", "#ff1616", "#04be36", "#ffd400"];
    return new Proxy({}, {
        get(_t, prop) {
            if (prop === "paper") return paper;
            if (prop === "ink") return ink;
            if (prop === "name") return "aleatoria";
            const r = rngFn();
            if (r < 0.42) return "#ffffff";
            if (r < 0.52) return "#000000";
            return accents[Math.floor(rngFn() * accents.length)];
        },
    });
}

// ── primitivas de dibujo pixel-art (idénticas en espíritu al motor 2D) ──
function ppx(g, x, y, color, size = 1) {
    g.fillStyle = color;
    g.fillRect(Math.round(x), Math.round(y), size, size);
}
function pline(g, pts, color, width = 1) {
    if (pts.length < 2) return;
    g.beginPath();
    g.moveTo(Math.round(pts[0][0]) + 0.5, Math.round(pts[0][1]) + 0.5);
    for (let i = 1; i < pts.length; i++) g.lineTo(Math.round(pts[i][0]) + 0.5, Math.round(pts[i][1]) + 0.5);
    g.strokeStyle = color;
    g.lineWidth = width;
    g.stroke();
}
function pdotline(g, x1, y1, x2, y2, color, step = 3) {
    const dx = x2 - x1, dy = y2 - y1, d = Math.max(1, Math.hypot(dx, dy));
    for (let t = 0; t <= 1; t += step / d) ppx(g, x1 + dx * t, y1 + dy * t, color);
}
function pdotellipse(g, cx, cy, rx, ry, color, density = 16) {
    for (let i = 0; i < density; i++) {
        const a = (i / density) * Math.PI * 2;
        ppx(g, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, color);
    }
}

// ── paletas riso, exactamente los mismos siete slots semánticos ────────
const PALETTES = {
    riso: { name: "riso clásico", paper: "#fffdf6", ink: "#101010", blue: "#1038ff", red: "#ff1616", green: "#04be36", yellow: "#ffd400" },
    tierra: { name: "tierra", paper: "#f3ead6", ink: "#2a2017", blue: "#3a6b5f", red: "#b5471f", green: "#6f7a2c", yellow: "#e0a52b" },
    mineral: { name: "mineral frío", paper: "#eef1f4", ink: "#1b2430", blue: "#2f4b7c", red: "#a05195", green: "#4c8577", yellow: "#cab43d" },
    abismo: { name: "abismo oscuro", paper: "#0a0e1a", ink: "#e8eefc", blue: "#4f8cff", red: "#ff5d73", green: "#39d98a", yellow: "#ffd166" },
    neon: { name: "neón nocturno", paper: "#0d0d12", ink: "#f5f5ff", blue: "#00e5ff", red: "#ff2bd6", green: "#7bff3d", yellow: "#fff14d" },
    mono: { name: "monocromo", paper: "#ffffff", ink: "#111111", blue: "#444444", red: "#222222", green: "#666666", yellow: "#999999" },
};
const PALETTE_WEIGHTS = [["riso", 56], ["abismo", 15], ["tierra", 7], ["neon", 6], ["mineral", 6], ["mono", 5], ["aleatoria", 5]];

// ── estratos: mismos rangos verticales (en px del lienzo original) ─────
const ZONE_RANGE = {
    sky: [18, 170], mountain: [110, 280], forest: [200, 400], shore: [350, 470],
    sea: [420, 650], abyss: [580, 810], tectonic: [690, 965],
    desierto: [250, 760], pantano: [380, 760], hielo: [220, 740],
};
const ZONE_LABEL = {
    sky: "CIELO", mountain: "CORDILLERA", forest: "BOSQUE", shore: "ORILLA",
    sea: "MAR", abyss: "ABISMO", tectonic: "SUBSUELO",
    desierto: "DESIERTO", pantano: "PANTANO", hielo: "HIELO",
};
const MODE_ZONES = {
    total: ["sky", "mountain", "forest", "shore", "sea", "abyss", "tectonic"],
    aire: ["sky", "mountain", "forest"],
    mar: ["shore", "sea", "abyss"],
    tectonica: ["tectonic", "abyss"],
    desierto: ["sky", "desierto", "tectonic"],
    pantano: ["sky", "pantano", "sea"],
    hielo: ["sky", "hielo", "tectonic"],
};
const ZONE_SPECIES = {
    sky: ["cloud", "bird"],
    mountain: ["ridge"],
    forest: ["fir", "pine", "roundTree"],
    shore: ["cairn", "starfish"],
    sea: ["fishDiamond", "fishRound", "jellyBell", "jellyDome", "starfish"],
    abyss: ["coralBranch", "coralFan", "kelp", "voidShape"],
    tectonic: ["shadeBlock", "boxFrame", "glyphSign", "crack", "voidShape"],
    desierto: ["cactus", "cairn"],
    pantano: ["reed", "lilyPad"],
    hielo: ["snowflake", "iceberg", "crack"],
};
const ZONE_COUNT = {
    sky: [5, 9], mountain: [3, 5], forest: [6, 10], shore: [3, 6], sea: [5, 9],
    abyss: [4, 8], tectonic: [4, 7], desierto: [4, 7], pantano: [4, 7], hielo: [4, 7],
};

// ── semillas y lexicón: vocabulario propio de Biocracia, no de Zapata ──
const SEED_WORDS_A = ["biocracia", "parlamento", "micorriza", "fenología", "blockchain", "manakai", "bosque", "estrato", "frecuencia", "consenso"];
const SEED_WORDS_B = ["sin-centro", "que-escucha", "subterráneo", "distribuido", "que-brota", "mineral", "pelágico", "que-vota", "interespecie", "que-germina"];

const LEXICON = {
    sky: ["el aire es territorio compartido", "cada especie vota con su vuelo", "la atmósfera no reconoce fronteras", "respirar es la primera asamblea"],
    mountain: ["la roca guarda el tiempo del parlamento", "cada estrato es un turno de palabra", "la cordillera recuerda antes que nosotros"],
    forest: ["el bosque es un parlamento sin cúpula", "la raíz negocia lo que la hoja promete", "micorriza: la red vota antes que la especie", "hacer parientes con lo que no habla"],
    shore: ["la orilla es el borde donde se escucha al otro", "ni tierra ni mar: frontera que delibera"],
    sea: ["el mar disuelve la propiedad del sonido", "cada ola es un voto que no se cuenta dos veces", "lo pelágico no tiene territorio, tiene ruta"],
    abyss: ["en el abismo la luz es una decisión rara", "lo que no vemos también legisla"],
    tectonic: ["el subsuelo firma con presión, no con tinta", "la falla geológica es la memoria del consenso", "un bloque puede ser una acta de asamblea", "la blockchain imita la paciencia de la roca"],
    desierto: ["el desierto mide el consenso en siglos", "poca agua, mucha memoria"],
    pantano: ["el pantano no distingue entre especies fundadoras", "la niebla vota por abstención"],
    hielo: ["el hielo archiva lo que el fuego olvida", "cada cristal es una cláusula"],
};

// ── especies: cada una dibuja pixel-art en un canvas local pequeño ──────
const SPECIES = {
    cloud: {
        w: 72, h: 34,
        draw(g, cx, cy, color) {
            pdotellipse(g, cx, cy, 22, 5, color, 26);
            pdotellipse(g, cx + 7, cy + 5, 16, 3.4, color, 20);
            pdotellipse(g, cx - 8, cy - 3, 12, 2.6, color, 16);
        },
    },
    bird: {
        w: 28, h: 16,
        draw(g, cx, cy, color, ink, r) {
            if (r.rint(0, 1) === 0) pline(g, [[cx - 9, cy], [cx, cy - 4], [cx + 9, cy]], color);
            else { pdotline(g, cx - 9, cy, cx, cy - 4, color, 3); pdotline(g, cx, cy - 4, cx + 9, cy, color, 3); }
        },
    },
    ridge: {
        w: 150, h: 70,
        draw(g, cx, cy, color, ink, r) {
            const x0 = cx - 70, w = 140, base = cy + 20;
            const pts = [[x0, base]], n = r.rint(4, 6);
            for (let i = 1; i <= n; i++) {
                const xx = x0 + (w / n) * i;
                const yy = base - r.rand(24, 60) + (i % 2 ? r.rand(-6, 8) : r.rand(4, 12));
                pts.push([xx, yy]);
            }
            pts.push([x0 + w, base]);
            pline(g, pts, color);
            pline(g, pts.map(([x, y]) => [x + 4, y + 6]), ink);
        },
    },
    fir: {
        w: 26, h: 48,
        draw(g, cx, cy, color) {
            const base = cy + 20;
            pline(g, [[cx, base], [cx, base - 30]], color);
            for (let i = 0; i < 4; i++) {
                const yy = base - (8 + i * 6), arm = 9 - i * 1.6;
                pline(g, [[cx - arm, yy - 4], [cx, yy], [cx + arm, yy - 4]], color);
            }
        },
    },
    pine: {
        w: 22, h: 46,
        draw(g, cx, cy, color) {
            const base = cy + 20, h = 32, rows = 5;
            pline(g, [[cx, base], [cx, base - h]], color);
            for (let i = 0; i < rows; i++) {
                const yy = base - (h * (i + 1)) / (rows + 1), arm = 3 + (rows - 1 - i) * 1.7;
                pline(g, [[cx - arm, yy], [cx + arm, yy]], color);
            }
        },
    },
    roundTree: {
        w: 30, h: 44,
        draw(g, cx, cy, color) {
            const base = cy + 18;
            pline(g, [[cx, base], [cx, base - 16]], color);
            pdotellipse(g, cx, base - 24, 10, 9, color, 22);
        },
    },
    cairn: {
        w: 26, h: 32,
        draw(g, cx, cy, color) {
            pdotellipse(g, cx, cy, 9, 3.4, color, 14);
            pdotellipse(g, cx, cy - 7, 6.5, 2.6, color, 12);
            pdotellipse(g, cx, cy - 12.5, 4, 1.8, color, 10);
        },
    },
    starfish: {
        w: 24, h: 24,
        draw(g, cx, cy, color, ink) {
            const pts = [];
            for (let i = 0; i <= 10; i++) {
                const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 3 : 8;
                pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
            }
            pline(g, pts, color);
            ppx(g, cx, cy, ink);
        },
    },
    fishDiamond: {
        w: 34, h: 18,
        draw(g, cx, cy, color, ink) {
            pline(g, [[cx - 11, cy], [cx, cy - 5], [cx + 9, cy], [cx, cy + 5], [cx - 11, cy]], color);
            pline(g, [[cx - 11, cy], [cx - 16, cy - 6]], color);
            pline(g, [[cx - 11, cy], [cx - 16, cy + 6]], color);
            ppx(g, cx + 4, cy - 1, ink);
        },
    },
    fishRound: {
        w: 34, h: 18,
        draw(g, cx, cy, color, ink) {
            pdotellipse(g, cx, cy, 9, 5.5, color, 20);
            pline(g, [[cx + 7, cy], [cx + 14, cy - 5], [cx + 14, cy + 5], [cx + 7, cy]], color);
            ppx(g, cx - 4, cy - 1, ink);
        },
    },
    jellyBell: {
        w: 26, h: 36,
        draw(g, cx, cy, color) {
            pline(g, [[cx - 8, cy], [cx - 5, cy - 8], [cx + 5, cy - 8], [cx + 8, cy]], color);
            pline(g, [[cx - 8, cy], [cx + 8, cy]], color);
            for (let i = -2; i <= 2; i++) {
                const tx = cx + i * 3.4, pts = [];
                for (let k = 0; k <= 5; k++) pts.push([tx + Math.sin(k) * 2, cy + k * 3.2]);
                pline(g, pts, color);
            }
        },
    },
    jellyDome: {
        w: 22, h: 30,
        draw(g, cx, cy, color) {
            pdotellipse(g, cx, cy, 8, 4.5, color, 18);
            for (let i = -1; i <= 1; i++) pline(g, [[cx + i * 4, cy + 3], [cx + i * 4, cy + 12]], color);
        },
    },
    coralBranch: {
        w: 22, h: 36,
        draw(g, cx, cy, color) {
            pline(g, [[cx, cy], [cx, cy - 16]], color);
            pline(g, [[cx, cy - 7], [cx - 8, cy - 13]], color);
            pline(g, [[cx, cy - 10], [cx + 9, cy - 17]], color);
            pline(g, [[cx - 4, cy - 13], [cx - 8, cy - 19]], color);
            pline(g, [[cx + 4, cy - 15], [cx + 9, cy - 22]], color);
        },
    },
    coralFan: {
        w: 38, h: 30,
        draw(g, cx, cy, color) {
            for (let i = -3; i <= 3; i++) {
                const a = -Math.PI / 2 + i * 0.22;
                pline(g, [[cx, cy], [cx + Math.cos(a) * 17, cy + Math.sin(a) * 17]], color);
            }
        },
    },
    kelp: {
        w: 24, h: 52,
        draw(g, cx, cy, color) {
            const h = 9, pts = [];
            for (let i = 0; i <= h; i++) pts.push([cx + Math.sin(i * 0.6) * 5, cy - i * 5]);
            pline(g, pts, color);
        },
    },
    voidShape: {
        w: 60, h: 44,
        draw(g, cx, cy, color, ink, r) {
            const pts = [];
            for (let i = 0; i < 16; i++) {
                const a = (i / 16) * Math.PI * 2, rr = 16 + r.rand(-4, 4);
                pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.66]);
            }
            g.beginPath();
            g.moveTo(pts[0][0], pts[0][1]);
            pts.slice(1).forEach((p) => g.lineTo(p[0], p[1]));
            g.closePath();
            g.fillStyle = ink;
            g.fill();
            for (let i = 0; i < 8; i++) ppx(g, cx + r.rand(-10, 10), cy + r.rand(-5, 5), color, r.chance(0.4) ? 2 : 1);
        },
    },
    shadeBlock: {
        w: 56, h: 34,
        draw(g, cx, cy, color, ink, r) {
            const chars = ["░", "▒", "▓", "█"];
            g.font = "10px 'Courier New',monospace";
            g.textBaseline = "top";
            g.fillStyle = color;
            const cols = r.rint(5, 7), rows = r.rint(2, 3);
            for (let row = 0; row < rows; row++) {
                let ln = "";
                for (let c = 0; c < cols; c++) ln += chars[r.rint(0, 3)];
                g.fillText(ln, cx - cols * 3, cy - rows * 5 + row * 10);
            }
        },
    },
    boxFrame: {
        w: 66, h: 32,
        draw(g, cx, cy, color, ink, r) {
            g.font = "10px 'Courier New',monospace";
            g.textBaseline = "top";
            g.fillStyle = color;
            const w = r.rint(4, 6);
            g.fillText("┌" + "─".repeat(w) + "┐", cx - 30, cy - 10);
            g.fillText("│" + " ".repeat(w) + "│", cx - 30, cy);
            g.fillText("└" + "─".repeat(w) + "┘", cx - 30, cy + 10);
        },
    },
    glyphSign: {
        w: 40, h: 18,
        draw(g, cx, cy, color, ink, r) {
            const set = ["♪", "♥", "§", "±", "Σ", "○", "●", "◊"];
            g.font = "13px 'Courier New',monospace";
            g.textBaseline = "middle";
            g.fillStyle = color;
            const n = r.rint(1, 3);
            for (let i = 0; i < n; i++) g.fillText(r.pick(set), cx + i * 12, cy);
        },
    },
    crack: {
        w: 46, h: 40,
        draw(g, cx, cy, color, ink, r) {
            const pts = [[cx, cy]];
            let x = cx, y = cy;
            for (let i = 0; i < 6; i++) { x += r.rand(-5, 6); y += r.rand(4, 8); pts.push([x, y]); }
            pline(g, pts, color);
        },
    },
    cactus: {
        w: 24, h: 44,
        draw(g, cx, cy, color) {
            const base = cy + 18;
            pline(g, [[cx, base], [cx, base - 30]], color);
            pline(g, [[cx, base - 14], [cx - 8, base - 14], [cx - 8, base - 22]], color);
            pline(g, [[cx, base - 18], [cx + 7, base - 18], [cx + 7, base - 27]], color);
        },
    },
    reed: {
        w: 12, h: 44,
        draw(g, cx, cy, color, ink, r) {
            const base = cy + 18, h = r.rint(18, 28);
            pline(g, [[cx, base], [cx, base - h]], color);
            pline(g, [[cx, base - h * 0.5], [cx - 4, base - h * 0.5 - 5]], color);
        },
    },
    lilyPad: {
        w: 26, h: 16,
        draw(g, cx, cy, color, ink) {
            pdotellipse(g, cx, cy, 8, 3, color, 16);
            pline(g, [[cx - 8, cy], [cx, cy]], ink);
        },
    },
    snowflake: {
        w: 24, h: 24,
        draw(g, cx, cy, color) {
            for (let k = 0; k < 6; k++) {
                const a = (k / 6) * Math.PI * 2;
                pline(g, [[cx, cy], [cx + Math.cos(a) * 8, cy + Math.sin(a) * 8]], color);
            }
        },
    },
    iceberg: {
        w: 34, h: 22,
        draw(g, cx, cy, color) {
            pline(g, [[cx - 10, cy], [cx - 4, cy - 14], [cx + 5, cy - 18], [cx + 11, cy], [cx - 10, cy]], color);
        },
    },
};

class Estratos extends BaseThreeJsModule {
    static methods = [
        { name: "setSeed", executeOnLoad: true, options: [{ name: "seed", defaultVal: "manakai-biocracia-01", type: "text" }] },
        { name: "setMode", executeOnLoad: true, options: [{ name: "mode", defaultVal: "total", type: "select", values: ["total", "aire", "mar", "tectonica", "desierto", "pantano", "hielo"] }] },
        { name: "setPalette", executeOnLoad: true, options: [{ name: "palette", defaultVal: "auto", type: "select", values: ["auto", "riso", "tierra", "mineral", "abismo", "neon", "mono", "aleatoria"] }] },
        { name: "regenerate", executeOnLoad: false, options: [] },
        { name: "toggleAnim", executeOnLoad: false, options: [{ name: "on", defaultVal: true, type: "boolean" }] },
        { name: "setNocturno", executeOnLoad: false, options: [{ name: "on", defaultVal: true, type: "boolean" }] },
    ];

    constructor(container) {
        super(container);
        this.name = Estratos.name;

        this.seed = "manakai-biocracia-01";
        this.mode = "total";
        this.currentPalette = "auto";
        this.animEnabled = true;
        // Modo nocturno: en el parlamento la pieza vive sobre proyección
        // oscura — las paletas de papel claro (riso/tierra/mineral/mono)
        // invierten papel↔tinta para que el fondo NUNCA salte a blanco.
        this.nocturno = true;

        // Estado de control en vivo (sliders sonETH → applyControl):
        // se aplica cada frame, sin reconstruir la escena.
        this._ctrl = {
            speed: 1,        // timedilation → velocidad global de animación
            driftAmp: 1,     // texturedepth → amplitud de deriva de especies
            waveAmp: 1,      // memoryfeed → amplitud de olas
            jitter: 0,       // noiselevel → temblor nervioso de especies
            hue: 0.5,        // spectralshift → tinte de color (0.5 = neutro)
            rotY: 0,         // spatialspread → ángulo del mundo
            rotSpeed: 0.05,  // harmonicrich → giro lento continuo
            partSize: 0.08,  // dronedepth → tamaño de partículas
            partOp: 0.75,    // dronedepth → opacidad de partículas
            fogNear: 24,     // atmospheremix → densidad de niebla
            fogFar: 70,
        };
        this._rotAuto = 0;
        this._bgTarget = null;

        this.world = new THREE.Group();
        this.scene.add(this.world);

        this._t = 0;
        this._last = performance.now();
        this._animationId = null;
        this._disposables = [];
        this._sprites = [];
        this._waves = [];
        this._particles = null;

        this.rng = mulberry32(hashString(this.seed));

        this.init();
    }

    init() {
        if (!this.renderer || !this.scene || !this.camera || this.destroyed) return;

        this.camera.fov = 52;
        this.camera.near = 0.1;
        this.camera.far = 300;
        this.camera.position.set(15, 5, 24);
        this.camera.updateProjectionMatrix();

        if (this.controls) {
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.06;
            this.controls.minDistance = 6;
            this.controls.maxDistance = 70;
            this.controls.target.set(0, 0, 0);
            this.controls.update();
        }
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));

        this._buildScene();

        this.show();
        this._animate = this._animate.bind(this);
        this._animationId = requestAnimationFrame(this._animate);
    }

    // ── RNG ligado a this.rng (mulberry32 sembrado por semilla+modo) ──────
    rand(min, max) { return min + this.rng() * (max - min); }
    rint(min, max) { return Math.floor(this.rand(min, max + 1)); }
    pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
    chance(p) { return this.rng() < p; }

    _resolvePalette() {
        const key = this.currentPalette === "auto" ? this._weightedPalette() : this.currentPalette;
        if (key === "aleatoria") {
            return this.nocturno
                ? makeRandomProxy("#0d0d10", "#f2f2ea", () => this.rng())
                : makeRandomProxy("#ffffff", "#0b0b0b", () => this.rng());
        }
        const C = PALETTES[key] || PALETTES.riso;
        if (this.nocturno) {
            // Papel claro → fondo oscuro: invierte papel↔tinta preservando los
            // acentos riso. Así "riso"/"tierra"/"mono" ya no lanzan la escena
            // a blanco cuando el consenso del parlamento cruza un umbral.
            const p = new THREE.Color(C.paper);
            const lum = p.r * 0.299 + p.g * 0.587 + p.b * 0.114;
            if (lum > 0.45) return Object.assign({}, C, { paper: C.ink, ink: C.paper });
        }
        return C;
    }

    _weightedPalette() {
        const total = PALETTE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
        let x = this.rng() * total, acc = 0;
        for (const [k, w] of PALETTE_WEIGHTS) { acc += w; if (x < acc) return k; }
        return "riso";
    }

    // ── construcción de escena: limpia, siembra, reconstruye todo ─────────
    _buildScene() {
        if (!this.renderer || !this.scene || this.destroyed) return;
        this._clearWorld();

        this.rng = mulberry32(hashString(this.seed + "|" + this.mode));
        this.C = this._resolvePalette();

        // Fondo con transición suave: _animate lo interpola hacia _bgTarget,
        // así un cambio de paleta se desliza en vez de FLASHEAR de golpe.
        this._bgTarget = new THREE.Color(this.C.paper);
        if (!(this.scene.background instanceof THREE.Color)) {
            this.scene.background = this._bgTarget.clone();
        }
        this.scene.fog = new THREE.Fog(this.scene.background.clone(), this._ctrl.fogNear, this._ctrl.fogFar);

        const zones = MODE_ZONES[this.mode] || MODE_ZONES.total;
        this._buildStrataFrames(zones);
        zones.forEach((zone) => this._populateZone(zone));
        this._buildParticles();
        this._buildText(zones);
        this._reapplyControls();
    }

    _clearWorld() {
        while (this.world.children.length) this.world.remove(this.world.children[0]);
        this._disposables.forEach((d) => {
            if (d.geometry) d.geometry.dispose();
            if (d.material) d.material.dispose();
            if (d.texture) d.texture.dispose();
        });
        this._disposables = [];
        this._sprites = [];
        this._waves = [];
        this._particles = null;
    }

    _buildStrataFrames(zones) {
        const halfX = 10, z0 = -6, z1 = 6;
        zones.forEach((zone) => {
            const [p0, p1] = ZONE_RANGE[zone];
            const yTop = toWorldY(p0), yBot = toWorldY(p1), yMid = (yTop + yBot) / 2;
            const pts = [
                [-halfX, yTop, z0], [halfX, yTop, z0], [halfX, yTop, z0], [halfX, yTop, z1],
                [halfX, yTop, z1], [-halfX, yTop, z1], [-halfX, yTop, z1], [-halfX, yTop, z0],
                [-halfX, yBot, z0], [halfX, yBot, z0], [halfX, yBot, z0], [halfX, yBot, z1],
                [halfX, yBot, z1], [-halfX, yBot, z1], [-halfX, yBot, z1], [-halfX, yBot, z0],
            ].map((p) => new THREE.Vector3(...p));
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(this.C.ink), transparent: true, opacity: 0.12 });
            const seg = new THREE.LineSegments(geo, mat);
            this.world.add(seg);
            this._disposables.push({ geometry: geo, material: mat });

            const label = this._makeTextSprite(ZONE_LABEL[zone], this.C.ink, { w: 220, h: 44, font: "700 26px 'Courier New',monospace" });
            label.position.set(-halfX - 0.4, yMid, z0 - 0.4);
            label.center.set(1, 0.5);
            this.world.add(label);
            this._disposables.push({ material: label.material, texture: label.material.map });
        });
    }

    _populateZone(zone) {
        const keys = ZONE_SPECIES[zone] || [];
        const [cmin, cmax] = ZONE_COUNT[zone] || [4, 7];
        const [p0, p1] = ZONE_RANGE[zone];
        keys.forEach((key) => {
            const count = this.rint(cmin, cmax);
            for (let i = 0; i < count; i++) {
                const px_ = this.rand(30, 690), py_ = this.rand(p0, p1), pz_ = this.rand(-6, 6);
                const scale = this.rand(0.8, 1.6);
                const color = this.C[this.pick(["blue", "red", "green", "yellow", "ink"])];
                this._spawnSpecies(key, toWorldX(px_), toWorldY(py_), pz_, scale, color, zone);
            }
        });

        if (zone === "sea" || zone === "shore" || zone === "pantano") {
            const waveCount = this.rint(2, 4);
            for (let i = 0; i < waveCount; i++) {
                this._spawnWave(toWorldY(this.rand(p0, p1)), this.rand(-6, 6), this.C.blue);
            }
        }
    }

    _spawnSpecies(key, x, y, z, scale, color, zone) {
        const spec = SPECIES[key];
        if (!spec) return;
        const canvas = document.createElement("canvas");
        canvas.width = spec.w;
        canvas.height = spec.h;
        const g = canvas.getContext("2d");
        g.imageSmoothingEnabled = false;
        const rnd = { rand: (a, b) => this.rand(a, b), rint: (a, b) => this.rint(a, b), pick: (a) => this.pick(a), chance: (p) => this.chance(p) };
        spec.draw(g, spec.w / 2, spec.h * 0.7, color, this.C.ink, rnd);

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(spec.w * PX2W * scale, spec.h * PX2W * scale, 1);
        sprite.position.set(x, y, z);
        this.world.add(sprite);
        this._disposables.push({ material: mat, texture: tex });

        this._sprites.push({ obj: sprite, anchor: new THREE.Vector3(x, y, z), phase: this.rng() * Math.PI * 2, kind: this._driftKind(key), zone });
    }

    _driftKind(key) {
        if (key === "cloud" || key === "bird" || key === "fishDiamond" || key === "fishRound") return "driftX";
        if (key === "jellyBell" || key === "jellyDome") return "bobY";
        if (key === "glyphSign") return "blink";
        return "still";
    }

    _spawnWave(y, z, color) {
        const n = 48, points = [];
        for (let i = 0; i <= n; i++) points.push(new THREE.Vector3(-10 + (20 * i) / n, y, z));
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.7 });
        const line = new THREE.Line(geo, mat);
        this.world.add(line);
        this._disposables.push({ geometry: geo, material: mat });
        this._waves.push({ line, baseY: y, amp: this.rand(0.08, 0.22), phase: this.rng() * Math.PI * 2, n, base: new THREE.Color(color) });
    }

    _buildParticles() {
        const kind = ({ mar: "bubble", pantano: "bubble", hielo: "snow", desierto: "sand" })[this.mode] || "firefly";
        const count = kind === "snow" ? 220 : kind === "sand" ? 160 : 120;
        const positions = new Float32Array(count * 3);
        const speeds = new Float32Array(count);
        const phases = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = this.rand(-10, 10);
            positions[i * 3 + 1] = this.rand(-9, 9);
            positions[i * 3 + 2] = this.rand(-6, 6);
            speeds[i] = this.rand(0.3, 1.1);
            phases[i] = this.rng() * Math.PI * 2;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const color = kind === "snow" ? this.C.blue : kind === "sand" ? this.C.yellow : kind === "bubble" ? this.C.blue : this.C.yellow;
        const mat = new THREE.PointsMaterial({ color: new THREE.Color(color), size: 0.08, transparent: true, opacity: 0.75, sizeAttenuation: true });
        const points = new THREE.Points(geo, mat);
        this.world.add(points);
        this._disposables.push({ geometry: geo, material: mat });
        this._particles = { points, speeds, phases, kind, count, base: new THREE.Color(color) };
    }

    _buildText(zones) {
        zones.forEach((zone) => {
            const phrases = LEXICON[zone] || [];
            const chosen = [...phrases].sort(() => this.rng() - 0.5).slice(0, this.rint(2, 4));
            const zoneSprites = this._sprites.filter((s) => s.zone === zone);
            chosen.forEach((phrase) => {
                const [p0, p1] = ZONE_RANGE[zone];
                const anchor = zoneSprites.length ? this.pick(zoneSprites).anchor : new THREE.Vector3(0, toWorldY((p0 + p1) / 2), 0);
                const x = anchor.x + this.rand(-2.5, 2.5), y = anchor.y + this.rand(-1, 1), z = anchor.z + this.rand(-1.5, 1.5);

                const sprite = this._makeTextSprite(phrase, this.C.ink, { w: 320, h: 40, font: "italic 15px 'Courier New',monospace" });
                sprite.position.set(x, y, z);
                this.world.add(sprite);
                this._disposables.push({ material: sprite.material, texture: sprite.material.map });

                const geo = new THREE.BufferGeometry().setFromPoints([anchor.clone(), new THREE.Vector3(x, y, z)]);
                const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(this.C.ink), transparent: true, opacity: 0.3 });
                const tether = new THREE.Line(geo, mat);
                this.world.add(tether);
                this._disposables.push({ geometry: geo, material: mat });
            });
        });

        const sigil = this._makeTextSprite(`seed: ${this.seed.slice(0, 30)}`, this.C.ink, { w: 300, h: 28, font: "12px 'Courier New',monospace" });
        sigil.position.set(0, -9.4, 0);
        this.world.add(sigil);
        this._disposables.push({ material: sigil.material, texture: sigil.material.map });
    }

    _makeTextSprite(text, colorHex, opts = {}) {
        // El lienzo se dimensiona MIDIENDO el texto (antes era un ancho fijo
        // que recortaba las frases largas del lexicón a mitad de oración).
        const font = opts.font || "14px 'Courier New',monospace";
        const h = opts.h || 40;
        const canvas = document.createElement("canvas");
        const g = canvas.getContext("2d");
        g.font = font;
        const w = Math.ceil(g.measureText(text).width) + 10;
        canvas.width = w;
        canvas.height = h;
        g.font = font; // el resize del canvas resetea el estado del contexto
        g.clearRect(0, 0, w, h);
        g.fillStyle = colorHex;
        g.textBaseline = "middle";
        g.fillText(text, 4, h / 2);
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(w * 0.011, h * 0.011, 1);
        return sprite;
    }

    // ── ciclo de animación propio (no pasa por animationManager) ──────────
    _animate() {
        this._animationId = requestAnimationFrame(this._animate);
        if (this.destroyed || !this.renderer || !this.scene || !this.camera) return;
        const now = performance.now();
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;
        // timedilation → el tiempo interno de la pieza se estira o comprime
        if (this.animEnabled) this._t += dt * this._ctrl.speed;

        // Fondo/niebla en transición suave (sin flash al cambiar paleta)
        if (this._bgTarget && this.scene.background instanceof THREE.Color) {
            this.scene.background.lerp(this._bgTarget, 0.045);
            if (this.scene.fog) this.scene.fog.color.copy(this.scene.background);
        }

        // spatialspread (ángulo) + harmonicrich (giro continuo) → rotación
        if (this.animEnabled) this._rotAuto += dt * this._ctrl.rotSpeed;
        if (this.world) {
            const targetRot = this._ctrl.rotY + this._rotAuto;
            this.world.rotation.y += (targetRot - this.world.rotation.y) * 0.06;
        }

        if (this.animEnabled) {
            const t = this._t;
            const amp = this._ctrl.driftAmp;
            const jit = this._ctrl.jitter;
            this._sprites.forEach((s) => {
                let px = s.anchor.x, py = s.anchor.y;
                if (s.kind === "driftX") px += Math.sin(t * 0.6 + s.phase) * 0.6 * amp;
                else if (s.kind === "bobY") py += Math.sin(t * 1.1 + s.phase) * 0.25 * amp;
                else if (s.kind === "blink") s.obj.material.opacity = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.4 + s.phase));
                if (jit > 0) {
                    // noiselevel → temblor nervioso de alta frecuencia
                    px += Math.sin(t * 13 + s.phase * 7) * jit;
                    py += Math.cos(t * 17 + s.phase * 5) * jit * 0.6;
                }
                s.obj.position.x = px;
                s.obj.position.y = py;
            });

            this._waves.forEach((w) => {
                const pos = w.line.geometry.attributes.position;
                for (let i = 0; i <= w.n; i++) {
                    const x = pos.getX(i);
                    pos.setY(i, w.baseY + Math.sin(x * 0.5 + t * 1.6 + w.phase) * w.amp * this._ctrl.waveAmp);
                }
                pos.needsUpdate = true;
            });

            if (this._particles) {
                const { points, speeds, phases, kind, count } = this._particles;
                const pos = points.geometry.attributes.position;
                for (let i = 0; i < count; i++) {
                    let x = pos.getX(i), y = pos.getY(i);
                    if (kind === "snow") { y -= speeds[i] * dt * 1.2; x += Math.sin(t * 0.5 + phases[i]) * dt * 0.4; if (y < -9) y = 9; }
                    else if (kind === "sand") { x += speeds[i] * dt * 1.6; if (x > 10) x = -10; }
                    else if (kind === "bubble") { y += speeds[i] * dt * 1.2; if (y > 9) y = -9; }
                    else { x += Math.cos(t * 0.2 + phases[i]) * dt * 0.3; y += Math.sin(t * 0.15 + phases[i]) * dt * 0.3; }
                    pos.setX(i, x);
                    pos.setY(i, y);
                }
                pos.needsUpdate = true;
            }
        }

        if (this.controls) this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    // ── métodos expuestos al secuenciador / dashboard ──────────────────────
    setSeed({ seed = "manakai-biocracia-01" } = {}) {
        this.seed = String(seed || "manakai-biocracia-01");
        this._buildScene();
    }

    regenerate() {
        this.seed = `${this.pick(SEED_WORDS_A)}-${this.pick(SEED_WORDS_B)}-${this.rint(10, 999)}`;
        this._buildScene();
    }

    setMode({ mode = "total" } = {}) {
        this.mode = MODE_ZONES[mode] ? mode : "total";
        this._buildScene();
    }

    setPalette({ palette = "auto" } = {}) {
        this.currentPalette = palette;
        this._buildScene();
    }

    toggleAnim({ on = true } = {}) {
        this.animEnabled = !!on;
    }

    setNocturno({ on = true } = {}) {
        this.nocturno = !!on;
        this._buildScene();
    }

    // ── sliders sonETH → parámetros vivos (sin reconstruir la escena) ──────
    // Recibe valores normalizados 0–1 desde el puente (estratos.ts pollea
    // window.__sonethParams). El mismo gesto que mueve el dron sonoro mueve
    // la cartografía: color, rotación, deriva, niebla, temblor.
    applyControl(key, v) {
        const c = this._ctrl;
        switch (key) {
            case "spectralshift":
                c.hue = v;                                    // color / tinte
                this._applyTint();
                break;
            case "spatialspread":
                c.rotY = (v - 0.5) * Math.PI;                 // ángulo del mundo
                break;
            case "harmonicrich":
                c.rotSpeed = v * 0.12;                        // giro continuo
                break;
            case "timedilation":
                c.speed = 0.25 + v * 2.75;                    // velocidad del tiempo
                break;
            case "texturedepth":
                c.driftAmp = 0.3 + v * 2.4;                   // amplitud de deriva
                break;
            case "memoryfeed":
                c.waveAmp = 0.3 + v * 2.7;                    // amplitud de olas
                break;
            case "noiselevel":
                c.jitter = v * 0.18;                          // temblor nervioso
                break;
            case "dronedepth":
                c.partSize = 0.03 + v * 0.22;                 // presencia de partículas
                c.partOp = 0.25 + v * 0.65;
                if (this._particles) {
                    this._particles.points.material.size = c.partSize;
                    this._particles.points.material.opacity = c.partOp;
                }
                break;
            case "atmospheremix":
                c.fogNear = 30 - v * 22;                      // densidad de niebla
                c.fogFar = 90 - v * 55;
                if (this.scene && this.scene.fog) {
                    this.scene.fog.near = c.fogNear;
                    this.scene.fog.far = c.fogFar;
                }
                break;
        }
    }

    // Reaplica el estado de control tras cada _buildScene (los materiales
    // recién creados no conocen los valores actuales de los sliders).
    _reapplyControls() {
        this._applyTint();
        if (this._particles) {
            this._particles.points.material.size = this._ctrl.partSize;
            this._particles.points.material.opacity = this._ctrl.partOp;
        }
        if (this.scene && this.scene.fog) {
            this.scene.fog.near = this._ctrl.fogNear;
            this.scene.fog.far = this._ctrl.fogFar;
        }
    }

    // spectralshift → tinte: 0.5 es neutro (blanco = colores horneados tal
    // cual); alejarse del centro rota el matiz de especies, olas y partículas.
    // El texto queda sin teñir para preservar legibilidad del poema.
    _applyTint() {
        const v = this._ctrl.hue;
        const sat = Math.min(1, Math.abs(v - 0.5) * 2.2);
        const tint = new THREE.Color();
        if (sat < 0.03) tint.set("#ffffff"); else tint.setHSL(v, sat, 0.72);
        this._sprites.forEach((s) => s.obj.material.color.copy(tint));
        const hueShift = (v - 0.5) * 1.0;
        this._waves.forEach((w) => {
            w.line.material.color.copy(w.base).offsetHSL(hueShift, sat * 0.3, 0);
        });
        if (this._particles) {
            this._particles.points.material.color.copy(this._particles.base).offsetHSL(hueShift, sat * 0.3, 0);
        }
    }

    destroy() {
        if (this._animationId) { cancelAnimationFrame(this._animationId); this._animationId = null; }
        this._clearWorld();
        if (this.world) { this.scene && this.scene.remove(this.world); this.world = null; }
        super.destroy();
    }
}

export default Estratos;