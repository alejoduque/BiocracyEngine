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

// ── aritmética de color en sRGB ────────────────────────────────────────
// Los hex de paleta se consumen tal cual como fillStyle del canvas 2D, así
// que las decisiones de paleta (¿es claro este papel?, ¿legible este acento?)
// tienen que hacerse en sRGB. NO sirve THREE.Color: con ColorManagement
// activo (por defecto en three r152+) sus canales son luz lineal, y ahí el
// umbral 0.45 cae en realidad sobre un sRGB ≈ 0.70.
function hexToRgb(hex) {
    const h = String(hex).replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(full, 16) || 0;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function rgbToHex(r, g, b) {
    const c = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, "0");
    return `#${c(r)}${c(g)}${c(b)}`;
}
function srgbLuminance(hex) {
    const [r, g, b] = hexToRgb(hex);
    return r * 0.299 + g * 0.587 + b * 0.114;
}
function rgbToHsl(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return [h, s, l];
}
function hslToRgb(h, s, l) {
    if (s === 0) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const ch = (t) => {
        if (t < 0) t += 1; else if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    return [ch(h + 1 / 3), ch(h), ch(h - 1 / 3)];
}
function mixHex(a, b, t) {
    const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
    return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

// Sube un acento pensado para papel CLARO a la banda legible sobre papel
// oscuro, conservando matiz, saturación y el orden relativo de luminosidad
// (mono no colapsa a un solo gris, tierra conserva su gradiente térmico).
const DARK_ACCENT_MIN = 0.55, DARK_ACCENT_SPAN = 0.35;
function liftAccent(hex) {
    const [h, s, l] = rgbToHsl(...hexToRgb(hex));
    return rgbToHex(...hslToRgb(h, s, DARK_ACCENT_MIN + l * DARK_ACCENT_SPAN));
}

const ACCENT_KEYS = ["blue", "red", "green", "yellow"];
const RISO_ACCENTS = ["#1038ff", "#ff1616", "#04be36", "#ffd400"];

// Invierte una paleta de papel claro para proyección oscura. Intercambiar
// sólo papel↔tinta dejaba los cinco acentos con su luminancia de papel
// claro: en "mono" (#444/#222/#666 sobre #111111) eso son contrastes ~1.1:1
// y ~4/5 de las especies desaparecían. Los acentos invierten con el fondo.
function invertPalette(C) {
    const out = Object.assign({}, C, {
        paper: C.ink,
        ink: C.paper,
        name: `${C.name} (nocturno)`,
    });
    ACCENT_KEYS.forEach((k) => { out[k] = liftAccent(C[k]); });
    return out;
}

function makeRandomProxy(paper, ink, nocturno, rngFn) {
    // Los neutros se DERIVAN de la tinta en vez de ser blanco/negro fijos:
    // antes ~42% de las lecturas devolvían blanco sobre papel blanco (y, tras
    // el modo nocturno, ~10% devolvían negro sobre papel casi negro) — esas
    // especies se horneaban invisibles.
    const accents = nocturno ? RISO_ACCENTS.map(liftAccent) : RISO_ACCENTS;
    const neutralMid = mixHex(ink, paper, 0.35);
    return new Proxy({}, {
        get(_t, prop) {
            if (prop === "paper") return paper;
            if (prop === "ink") return ink;
            if (prop === "name") return nocturno ? "aleatoria (nocturno)" : "aleatoria";
            const r = rngFn();
            if (r < 0.42) return ink;
            if (r < 0.52) return neutralMid;
            return accents[Math.floor(rngFn() * accents.length)];
        },
    });
}

// ── un solo canvas de medición, reutilizado ────────────────────────────
// Pedir el contexto ANTES de fijar canvas.width obligaba a asignar el bitmap
// por defecto (300x150) y a reasignarlo al redimensionar: dos allocations por
// sprite de texto, ~30 por reconstrucción. Medir no necesita contexto propio.
let _measureCtx = null;
function measureTextWidth(text, font) {
    if (!_measureCtx) _measureCtx = document.createElement("canvas").getContext("2d");
    _measureCtx.font = font;
    return Math.ceil(_measureCtx.measureText(text).width) + 10;
}

// ── Tipografía CRT para las FRASES del lexicón ─────────────────────────
//
// Sólo las frases. Las etiquetas de zona y el sigilo de la semilla siguen
// exactamente como estaban: son rótulos, no oraciones, y agrandarlos taparía
// el mapa que rotulan.
//
// El problema real era de lectura. Las frases del LEXICON son la única prosa
// de la pieza — oraciones completas, algunas de 45 caracteres — y se dibujaban
// en itálica de 15 px sobre un lienzo de 40 px de alto, escaladas a 0.011 en
// espacio-mundo. A esa medida la cursiva de Courier se deshace en cuanto la
// cámara se aleja o la niebla sube, y lo que debería leerse como una frase se
// vuelve una mancha con forma de texto.
//
// La presentación viene de camara/crt.ts (portada de @designcodeio/threeui,
// MIT): monoespaciada de peso 600 en vez de cursiva, halo de fósforo bajo cada
// glifo, y revelado por escritura con cursor de bloque. El brillo es lo que
// más aporta a la legibilidad: separa el glifo del fondo sin engordar el trazo,
// que es justo lo que fallaba cuando la frase caía sobre una zona clara.
//
// El COLOR no se toma del CRT. Estratos repinta todo su texto cuando cambia de
// paleta (_recolor), y clavar el verde fósforo aquí dejaría las frases fuera de
// cada paleta que la pieza sabe generar. Se usa this.C.ink y el halo se deriva
// de él, así el gesto del CRT sobrevive a las seis paletas.
const CRT_PHRASE = {
    // 26 px contra los 15 anteriores. Con la misma escala de 0.011 a mundo, la
    // frase queda ~1.7x más grande sin tocar el layout que la ancla.
    size: 26,
    h: 64,
    padX: 10,
    font: "600 26px ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace",
    // Caracteres por segundo de tiempo INTERNO de la pieza, así timedilation
    // estira o comprime la escritura junto con todo lo demás.
    cps: 26,
    // Retardo entre frases, para que aparezcan una tras otra como líneas de
    // terminal y no las 12 a la vez.
    stagger: 0.55,
};

// Separación vertical mínima entre frases, en unidades de mundo. La caja de
// una frase mide CRT_PHRASE.h * 0.011 = 0.70; 1.6 deja aire de sobra.
//
// Es holgado a propósito. La cámara es perspectiva, así que la separación que
// se calcula en mundo NO es la que se ve: dos frases a distinta profundidad se
// proyectan con divisiones distintas y un hueco de 1.15 se cerraba en pantalla
// justo en los pares que caían lejos una de otra en z.
const PHRASE_GAP = 1.6;

// Cuánto se amplía ese hueco por cada unidad de diferencia en z. Es la
// corrección de perspectiva: cuanto más separadas están dos frases en
// profundidad, menos fiable es su distancia en Y y más hay que exigirles.
const PHRASE_GAP_Z = 0.45;

/** Halo de fósforo derivado de la tinta viva de la paleta. */
function crtGlow(hex) {
    const h = String(hex).replace("#", "");
    const n = h.length === 3
        ? h.split("").map((c) => parseInt(c + c, 16))
        : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    const [r, g, b] = n.map((v) => (Number.isFinite(v) ? v : 200));
    // Se aclara hacia el blanco para que el halo lea como emisión y no como
    // una sombra dura del mismo tono.
    const lift = (v) => Math.round(v + (255 - v) * 0.35);
    return `rgba(${lift(r)},${lift(g)},${lift(b)},0.85)`;
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

// ── reposo de los controles ────────────────────────────────────────────
// Espejo de window.__sonethParams (parliamentEntry.ts): el puente empuja
// estos valores ~140 ms después del montaje, así que el estado inicial del
// módulo tiene que NACER en ellos. Antes _ctrl declaraba hue 0.5 "neutro"
// mientras el sistema reposa en 0.4, y la escena se teñía de verde sola —
// igual con noiselevel, que arrancaba un temblor que _ctrl declaraba en 0.
const CONTROL_DEFAULTS = {
    spectralshift: 0.4, spatialspread: 0.5, harmonicrich: 0.5, timedilation: 0.3,
    texturedepth: 0.3, memoryfeed: 0.4, noiselevel: 0.2, dronedepth: 0.4,
    atmospheremix: 0.5,
};
// El centro sin tinte ES el reposo del puente, no un 0.5 teórico.
const HUE_NEUTRAL = CONTROL_DEFAULTS.spectralshift;

// Suavizado expresado POR SEGUNDO (fracción que sobrevive tras 1 s): un
// factor por frame corre al doble de velocidad en un proyector de 120 Hz que
// en uno de 60, y pierde el paso si se cae un frame. Ver DarkForest.js.
const BG_FADE_TAU = 0.064;    // ≈ 0.045 por frame @60fps
const CTRL_SMOOTH_TAU = 0.02; // ≈ 0.060 por frame @60fps

// ── orden de dibujo ────────────────────────────────────────────────────
// TODO en esta pieza es transparente, así que three lo ordena por distancia
// cada frame. Con la escena girando de continuo, dos objetos a profundidad
// casi igual se intercambian de un frame a otro y su solape parpadea. Un
// renderOrder explícito fija las CAPAS (three ordena primero por
// renderOrder, luego por distancia) y deja el parpadeo sin dónde ocurrir.
const RO = { frame: 0, wave: 1, particle: 2, species: 3, tether: 4, text: 5 };

// ── Cámara Fenológica → cartografía ────────────────────────────────────
// Reposo de window.__phenoParams (parliamentEntry.ts), por el mismo motivo
// que CONTROL_DEFAULTS: el puente los empuja al montar.
const PHENO_DEFAULTS = { activityThreshold: 0.46, opacityFloor: 0.0, seasonalWeight: 0.5 };

// Humedad preferida de cada estrato (0 = seco, 1 = lluvioso). Cada especie
// hereda la de su zona con una desviación propia: es su "floración". Cuanto
// más se acerca la humedad del día a esa preferencia, más presente está la
// especie; cuanto más lejos, más se desvanece hacia opacityFloor. El calendario
// deja de ser una lectura aparte y pasa a decidir QUÉ se ve del bosque.
const ZONE_BLOOM = {
    sky: 0.55, mountain: 0.35, forest: 0.80, shore: 0.50, sea: 0.70,
    abyss: 0.45, tectonic: 0.30, desierto: 0.05, pantano: 0.90, hielo: 0.15,
};

// ── eDNA regional → estrato ────────────────────────────────────────────
// Las ocho regiones biogeográficas de window.__ednaBio (orden EDNA_IDS)
// pesan el estrato que les corresponde ecológicamente. Hasta ahora los ocho
// deslizadores no llegaban a ningún módulo: sólo encendían una clase en el
// mapa de biomas y empujaban TODOS el mismo spectralShift, cada uno pisando
// al anterior. Aquí cada región tiene su propio territorio en la escena.
const REGION_ZONE = [
    "forest",     // CHO · Chocó biogeográfico — selva húmeda
    "pantano",    // AMZ · Amazonas
    "mountain",   // COR · Cordillera Oriental
    "shore",      // CAR · Caribe
    "desierto",   // ORI · Orinoquía — llanura estacional
    "sea",        // PAC · Pacífico
    "abyss",      // MAG · valle del Magdalena
    "tectonic",   // GUA · escudo guayanés
];

// activityThreshold → densidad de población. El umbral decide cuántas especies
// cuentan como despiertas, así que aquí decide cuántas HAY: subirlo despuebla
// el estrato, bajarlo lo llena. Requiere reconstruir (la población se siembra
// en _buildScene), por eso el puente lo manda con debounce.
function densityFromThreshold(t) { return 1.6 - t * 1.2; }  // 0→1.6, 0.46→1.05, 1→0.4

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

        // Estado de control en vivo (sliders sonETH → applyControl).
        // _ctrl es el OBJETIVO; _view es el valor suavizado que realmente se
        // escribe en los materiales cada frame. El puente pollea a ~7 Hz, así
        // que empujar sus valores directos hacía escalonar niebla, partículas
        // y tinte en ~7 saltos visibles por segundo.
        this._ctrl = {
            speed: 1,        // timedilation → velocidad global de animación
            driftAmp: 1,     // texturedepth → amplitud de deriva de especies
            waveAmp: 1,      // memoryfeed → amplitud de olas
            jitter: 0,       // noiselevel → temblor nervioso de especies
            hue: HUE_NEUTRAL,// spectralshift → tinte de color
            rotY: 0,         // spatialspread → ángulo del mundo
            rotSpeed: 0.05,  // harmonicrich → giro lento continuo
            partSize: 0.08,  // dronedepth → tamaño de partículas
            partOp: 0.75,    // dronedepth → opacidad de partículas
            fogNear: 40,     // atmospheremix → densidad de niebla
            fogFar: 130,
            opacityFloor: 0, // /pheno/opacityFloor → piso de opacidad
            season: 0.5,     // seasonalWeight → humedad del día (0 seco, 1 lluvia)
        };
        // Densidad de siembra (activityThreshold). No entra en _ctrl: no se
        // suaviza por frame, se aplica al reconstruir.
        this.density = densityFromThreshold(PHENO_DEFAULTS.activityThreshold);
        // Nace ya en el reposo del puente: nada se mueve solo tras montar.
        Object.entries(CONTROL_DEFAULTS).forEach(([k, v]) => this.applyControl(k, v));
        this.applyControl("opacityFloor", PHENO_DEFAULTS.opacityFloor);
        this.applyControl("seasonalWeight", PHENO_DEFAULTS.seasonalWeight);
        this._view = Object.assign({}, this._ctrl);
        this._tintApplied = null;

        this._rotAuto = 0;
        this._waveScale = 1;   // multiplicador estacional, lo fija _pushView
        // Peso por estrato de las ocho regiones eDNA. 0.5 = neutro, de modo
        // que la escena arranca exactamente como antes de que existieran.
        this._regionWeight = {};
        this._regionTarget = {};
        Object.keys(ZONE_BLOOM).forEach((z) => {
            this._regionWeight[z] = 0.5;
            this._regionTarget[z] = 0.5;
        });
        this._bgTarget = null;

        this.world = new THREE.Group();
        this.scene.add(this.world);

        this._t = 0;
        this._last = performance.now();
        this._animationId = null;
        this._disposables = [];
        this._sprites = [];
        this._texts = [];      // sprites de texto re-horneables (recoloreo)
        this._crtPhrases = []; // subconjunto de _texts: las frases que escriben
        this._inkLines = [];   // materiales de línea que siguen a C.ink
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
            // BaseThreeJsModule engancha su render() al evento "change" de
            // OrbitControls. Con damping activo ese evento salta en CADA
            // controls.update(), o sea una vez por frame — y este módulo ya
            // dibuja en su propio rAF, así que era un render completo de más
            // por frame. Se desengancha: aquí manda _animate.
            this.controls.removeEventListener("change", this.render);
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

    // rng inyectable: _buildScene consume del flujo que siembra el layout,
    // pero _recolor necesita re-resolver la paleta SIN desincronizarlo.
    _resolvePalette(rng = this.rng) {
        const key = this.currentPalette === "auto" ? this._weightedPalette(rng) : this.currentPalette;
        if (key === "aleatoria") {
            return this.nocturno
                ? makeRandomProxy("#0d0d10", "#f2f2ea", true, rng)
                : makeRandomProxy("#fffdf6", "#0b0b0b", false, rng);
        }
        const C = PALETTES[key] || PALETTES.riso;
        // Papel claro → fondo oscuro: invierte papel↔tinta Y sube los acentos
        // a la banda legible. Así "riso"/"tierra"/"mineral"/"mono" ya no
        // lanzan la escena a blanco cuando el consenso cruza un umbral, ni
        // dejan las especies invisibles sobre el fondo invertido.
        // Luminancia en sRGB, no en los canales lineales de THREE.Color.
        if (this.nocturno && srgbLuminance(C.paper) > 0.45) return invertPalette(C);
        return C;
    }

    _weightedPalette(rng = this.rng) {
        const total = PALETTE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
        let x = rng() * total, acc = 0;
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
        this.scene.fog = new THREE.Fog(this.scene.background.clone(), this._view.fogNear, this._view.fogFar);

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
        this._texts = [];
        this._crtPhrases = [];
        this._inkLines = [];
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
            // depthWrite:false — ver nota en _spawnWave: una línea transparente
            // que escribe profundidad recorta las especies que hay detrás.
            const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(this.C.ink), transparent: true, opacity: 0.12, depthWrite: false });
            const seg = new THREE.LineSegments(geo, mat);
            seg.renderOrder = RO.frame;
            this.world.add(seg);
            this._disposables.push({ geometry: geo, material: mat });
            this._inkLines.push(mat);

            const label = this._makeTextSprite(ZONE_LABEL[zone], this.C.ink, { h: 44, font: "700 26px 'Courier New',monospace" });
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
            // Población escalada por el umbral de actividad fenológica.
            const count = Math.max(1, Math.round(this.rint(cmin, cmax) * this.density));
            for (let i = 0; i < count; i++) {
                const px_ = this.rand(30, 690), py_ = this.rand(p0, p1), pz_ = this.rand(-6, 6);
                const scale = this.rand(0.8, 1.6);
                // Se guarda el SLOT de paleta, no el color resuelto: así el
                // recoloreo puede re-hornear la especie con la paleta nueva.
                const role = this.pick(["blue", "red", "green", "yellow", "ink"]);
                this._spawnSpecies(key, toWorldX(px_), toWorldY(py_), pz_, scale, role, zone);
            }
        });

        if (zone === "sea" || zone === "shore" || zone === "pantano") {
            const waveCount = this.rint(2, 4);
            for (let i = 0; i < waveCount; i++) {
                this._spawnWave(toWorldY(this.rand(p0, p1)), this.rand(-6, 6), this.C.blue);
            }
        }
    }

    _spawnSpecies(key, x, y, z, scale, role, zone) {
        const spec = SPECIES[key];
        if (!spec) return;
        const canvas = document.createElement("canvas");
        canvas.width = spec.w;
        canvas.height = spec.h;

        const tex = this._pixelTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(spec.w * PX2W * scale, spec.h * PX2W * scale, 1);
        sprite.position.set(x, y, z);
        sprite.renderOrder = RO.species;
        this.world.add(sprite);
        this._disposables.push({ material: mat, texture: tex });

        const rec = {
            obj: sprite, anchor: new THREE.Vector3(x, y, z),
            phase: this.rng() * Math.PI * 2, kind: this._driftKind(key), zone,
            // Floración propia: la humedad preferida del estrato ± desviación.
            bloom: Math.min(1, Math.max(0, (ZONE_BLOOM[zone] ?? 0.5) + this.rand(-0.14, 0.14))),
            phenoOp: 1,
            // Sub-semilla propia por especie: el recoloreo vuelve a hornear
            // EXACTAMENTE el mismo dibujo sin consumir del flujo rng que
            // define el layout (y que ya avanzó al sembrar el resto).
            key, role, subSeed: Math.floor(this.rng() * 4294967296), canvas, tex,
        };
        this._sprites.push(rec);
        this._paintSpecies(rec);
    }

    // Textura de un lienzo pixel-art. magFilter Nearest conserva el grano
    // cuadrado de cerca; minFilter con mipmaps evita el CENTELLEO al alejarse:
    // el arte son puntos y líneas de 1 px (ppx/pdotline/pdotellipse) y sin
    // mipmap cada píxel de pantalla muestrea un solo téxel, así que los puntos
    // aparecían y desaparecían al moverse el sprite fracciones de píxel.
    _pixelTexture(canvas) {
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        const maxAniso = this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
        tex.anisotropy = Math.min(8, maxAniso);
        tex.needsUpdate = true;
        return tex;
    }

    // Hornea (o re-hornea) el pixel-art de una especie sobre su propio canvas.
    _paintSpecies(rec) {
        const spec = SPECIES[rec.key];
        if (!spec) return;
        const g = rec.canvas.getContext("2d");
        g.imageSmoothingEnabled = false;
        g.clearRect(0, 0, rec.canvas.width, rec.canvas.height);
        const r = mulberry32(rec.subSeed);
        const rnd = {
            rand: (a, b) => a + r() * (b - a),
            rint: (a, b) => Math.floor(a + r() * (b - a + 1)),
            pick: (arr) => arr[Math.floor(r() * arr.length)],
            chance: (p) => r() < p,
        };
        spec.draw(g, spec.w / 2, spec.h * 0.7, this.C[rec.role], this.C.ink, rnd);
        rec.tex.needsUpdate = true;
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
        // ⚠ depthWrite:false es obligatorio en TODO material transparente aquí.
        // LineBasicMaterial/PointsMaterial lo dejan en true por defecto, así que
        // marcos, olas, ataduras y partículas escribían el buffer de
        // profundidad mientras se dibujaban translúcidos: cualquier especie
        // que quedara detrás era descartada por el test de profundidad si la
        // línea se dibujaba antes. Como el orden de los transparentes se
        // recalcula por distancia cada frame y el mundo gira, ese "antes"
        // cambiaba constantemente y las especies PARPADEABAN al cruzarse con
        // una línea. Sin escritura de profundidad, todo se mezcla y nada
        // recorta a nadie.
        const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.7, depthWrite: false });
        const line = new THREE.Line(geo, mat);
        line.renderOrder = RO.wave;
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
        const role = kind === "snow" || kind === "bubble" ? "blue" : "yellow";
        const mat = new THREE.PointsMaterial({ color: new THREE.Color(this.C[role]), size: 0.08, transparent: true, opacity: 0.75, sizeAttenuation: true, depthWrite: false });
        const points = new THREE.Points(geo, mat);
        points.renderOrder = RO.particle;
        this.world.add(points);
        this._disposables.push({ geometry: geo, material: mat });
        this._particles = { points, speeds, phases, kind, count, role, base: new THREE.Color(this.C[role]) };
    }

    _buildText(zones) {
        // Orden global de aparición: las frases entran en secuencia por todo
        // el mapa, no zona por zona, para que la lectura recorra el estrato.
        let phraseOrder = 0;
        const placed = [];
        zones.forEach((zone) => {
            const phrases = LEXICON[zone] || [];
            const chosen = [...phrases].sort(() => this.rng() - 0.5).slice(0, this.rint(2, 4));
            const zoneSprites = this._sprites.filter((s) => s.zone === zone);
            chosen.forEach((phrase, i) => {
                const [p0, p1] = ZONE_RANGE[zone];
                const anchor = zoneSprites.length ? this.pick(zoneSprites).anchor : new THREE.Vector3(0, toWorldY((p0 + p1) / 2), 0);
                // Reparto vertical determinista dentro de la zona en vez de un
                // ±1 al azar. Con la tipografía CRT la caja de una frase mide
                // 0.70 en mundo (64 px * 0.011), así que dos anclas sorteadas
                // sobre el mismo sprite se solapaban a la vista: a 15 px
                // rozaban, a 26 px se pisan la línea. PHRASE_GAP separa por
                // encima de esa altura, y el desplazamiento en x evita que las
                // frases de una zona queden alineadas en una columna.
                const spread = i - (chosen.length - 1) / 2;
                const x = anchor.x + this.rand(-2.2, 2.2) + spread * 0.9;
                const y = anchor.y + spread * PHRASE_GAP + this.rand(-0.12, 0.12);
                // Menos profundidad que los sprites de especie (±1.5). El
                // reparto y la relajación separan en Y de mundo, pero la
                // cámara es perspectiva: dos frases a la misma altura y
                // distinta z se proyectan a alturas de PANTALLA distintas, y
                // el hueco calculado se pierde. Estrechar z hace que la
                // separación que se calcula sea la que se ve.
                const z = anchor.z + this.rand(-0.8, 0.8);

                const sprite = this._makePhraseSprite(phrase, phraseOrder++);
                sprite.position.set(x, y, z);
                this.world.add(sprite);
                this._disposables.push({ material: sprite.material, texture: sprite.material.map });
                // El tirante se construye DESPUÉS del reparto global, porque
                // su geometría es estática y quedaría apuntando al sitio viejo.
                // toWorldY invierte el eje: p0 (arriba en el mapa) da la Y mayor.
                placed.push({ sprite, anchor, yHi: toWorldY(p0), yLo: toWorldY(p1) });
            });
        });

        this._spreadPhrases(placed);

        placed.forEach(({ sprite, anchor }) => {
            const geo = new THREE.BufferGeometry().setFromPoints([anchor.clone(), sprite.position.clone()]);
            const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(this.C.ink), transparent: true, opacity: 0.3, depthWrite: false });
            const tether = new THREE.Line(geo, mat);
            tether.renderOrder = RO.tether;
            this.world.add(tether);
            this._disposables.push({ geometry: geo, material: mat });
            this._inkLines.push(mat);
        });

        const sigil = this._makeTextSprite(`seed: ${this.seed.slice(0, 30)}`, this.C.ink, { h: 28, font: "12px 'Courier New',monospace" });
        sigil.position.set(0, -9.4, 0);
        this.world.add(sigil);
        this._disposables.push({ material: sigil.material, texture: sigil.material.map });
    }

    // Separa en vertical las frases que se pisan, mirando TODAS contra todas.
    //
    // El reparto por zona de _buildText resuelve las colisiones dentro de una
    // franja, pero no entre franjas vecinas: BOSQUE y CORDILLERA comparten
    // borde y sus anclas son sprites de especie que pueden caer casi a la
    // misma altura. Ahí se pisaban "la raíz negocia lo que la hoja promete" y
    // "la roca guarda el tiempo del parlamento", que es exactamente el caso
    // que la tipografía grande volvió ilegible.
    //
    // Relajación simple: si dos cajas se solapan en x y están más cerca en y
    // que PHRASE_GAP, se apartan medio sobrante cada una. Cuatro pasadas
    // bastan para este número de frases (~12-20) y el coste es despreciable
    // porque ocurre una sola vez, al construir la escena.
    _spreadPhrases(placed) {
        if (placed.length < 2) return;
        // Margen interior para que la caja de la frase no asome fuera
        // de la franja al tocar el borde.
        const pad = (CRT_PHRASE.h * 0.011) / 2;
        const clamp = (rec) => {
            const lo = rec.yLo + pad, hi = rec.yHi - pad;
            if (hi > lo) rec.sprite.position.y = Math.min(hi, Math.max(lo, rec.sprite.position.y));
        };
        const ITER = 10;  // los huecos crecieron: hacen falta más pasadas
        for (let k = 0; k < ITER; k++) {
            let moved = false;
            for (let a = 0; a < placed.length; a++) {
                for (let b = a + 1; b < placed.length; b++) {
                    const A = placed[a].sprite, B = placed[b].sprite;
                    const halfW = (A.scale.x + B.scale.x) / 2;
                    if (Math.abs(A.position.x - B.position.x) >= halfW) continue;
                    const dy = A.position.y - B.position.y;
                    // Corrección de perspectiva: el par que está lejos en z
                    // necesita más hueco en Y para conservar el mismo hueco en
                    // pantalla. Sin esto, los pares repartidos en profundidad
                    // pasaban el test en mundo y se pisaban a la vista.
                    const gap = PHRASE_GAP + Math.abs(A.position.z - B.position.z) * PHRASE_GAP_Z;
                    const need = gap - Math.abs(dy);
                    if (need <= 0) continue;
                    // Si coinciden exactamente, se rompe el empate con el
                    // orden para que el desplazamiento sea determinista.
                    const dir = dy === 0 ? (a < b ? 1 : -1) : Math.sign(dy);
                    A.position.y += dir * need * 0.5;
                    B.position.y -= dir * need * 0.5;
                    // Cada frase se queda en SU estrato. Sin esta sujeción la
                    // relajación resolvía los solapes empujando las frases
                    // fuera de su franja — "lo pelágico no tiene territorio"
                    // acababa sobre la cordillera — y eso deshace la tesis de
                    // la pieza, que es que cada enunciado pertenece a su capa.
                    // Preferible un roce ocasional a una frase en el estrato
                    // equivocado.
                    clamp(placed[a]);
                    clamp(placed[b]);
                    moved = true;
                }
            }
            if (!moved) break;
        }
    }

    // Pinta (o repinta) texto sobre un canvas ya dimensionado. El clearRect
    // es necesario aquí porque el recoloreo reutiliza el mismo bitmap: sobre
    // un canvas recién redimensionado sería un no-op, ya que asignar
    // canvas.width lo deja transparente y resetea el contexto.
    _paintText(canvas, text, colorHex, font, h) {
        const g = canvas.getContext("2d");
        g.font = font;
        g.clearRect(0, 0, canvas.width, canvas.height);
        g.fillStyle = colorHex;
        g.textBaseline = "middle";
        g.fillText(text, 4, h / 2);
    }

    // Pinta una FRASE del lexicón con la presentación CRT: halo de fósforo,
    // monoespaciada de peso 600, y sólo los caracteres ya revelados. El cursor
    // de bloque acompaña a la escritura y desaparece al terminar la línea —
    // el CRT original lo deja parpadeando para siempre, que es correcto para
    // una sola pantalla y ruinoso para doce sprites en una escena 3-D: cada
    // parpadeo obliga a repintar el lienzo y a resubir la textura.
    _paintPhrase(t) {
        const g = t.canvas.getContext("2d");
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, t.canvas.width, t.canvas.height);
        g.font = t.font;
        g.textBaseline = "middle";

        const shown = t.text.slice(0, Math.floor(t.shown));
        if (!shown) return;

        const cy = t.canvas.height / 2;
        g.shadowColor = crtGlow(this.C.ink);
        g.shadowBlur = CRT_PHRASE.size * 0.55;
        g.fillStyle = this.C.ink;
        g.fillText(shown, CRT_PHRASE.padX, cy);

        if (!t.done) {
            const w = g.measureText(shown).width;
            g.fillRect(
                CRT_PHRASE.padX + w + 2,
                cy - CRT_PHRASE.size * 0.48,
                Math.max(3, CRT_PHRASE.size * 0.5),
                CRT_PHRASE.size * 0.96,
            );
        }
    }

    /** Repinta una entrada de _texts por su tipo. Usado por _recolor. */
    _repaintText(t) {
        if (t.crt) this._paintPhrase(t);
        else this._paintText(t.canvas, t.text, this.C.ink, t.font, t.h);
        t.tex.needsUpdate = true;
    }

    // Sprite de frase: mismo anclaje y misma escala a mundo que antes, con el
    // lienzo dimensionado al tipo nuevo. `order` escalona el arranque para que
    // las frases entren en secuencia.
    _makePhraseSprite(text, order) {
        const font = CRT_PHRASE.font;
        const h = CRT_PHRASE.h;
        // El halo se sale de la caja del glifo, así que el lienzo necesita
        // margen o el fósforo queda cortado en los cuatro bordes.
        const w = measureTextWidth(text, font) + CRT_PHRASE.padX * 2;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;

        const tex = this._pixelTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(w * 0.011, h * 0.011, 1);
        sprite.renderOrder = RO.text;

        const rec = {
            canvas, tex, text, font, h,
            crt: true,
            shown: 0,
            done: false,
            delay: order * CRT_PHRASE.stagger,
        };
        this._texts.push(rec);
        this._crtPhrases.push(rec);
        this._paintPhrase(rec);
        tex.needsUpdate = true;
        return sprite;
    }

    // Avanza la escritura. Se llama una vez por frame desde _animate con el
    // dt YA estirado por timedilation, así que el mismo mando que dilata el
    // tiempo de la pieza dilata la lectura. Sólo se resube la textura de las
    // frases que están escribiendo: cuando todas terminan, el coste es cero.
    _typePhrases(sdt) {
        for (const t of this._crtPhrases) {
            if (t.done) continue;
            if (t.delay > 0) { t.delay -= sdt; continue; }
            t.shown += CRT_PHRASE.cps * sdt;
            if (t.shown >= t.text.length) {
                t.shown = t.text.length;
                t.done = true;
            }
            this._paintPhrase(t);
            t.tex.needsUpdate = true;
        }
    }

    _makeTextSprite(text, colorHex, opts = {}) {
        // El lienzo se dimensiona MIDIENDO el texto (antes era un ancho fijo
        // que recortaba las frases largas del lexicón a mitad de oración).
        const font = opts.font || "14px 'Courier New',monospace";
        const h = opts.h || 40;
        const w = measureTextWidth(text, font);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        this._paintText(canvas, text, colorHex, font, h);
        const tex = this._pixelTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(w * 0.011, h * 0.011, 1);
        sprite.renderOrder = RO.text;
        this._texts.push({ canvas, tex, text, font, h });
        return sprite;
    }

    // ── ciclo de animación propio (no pasa por animationManager) ──────────
    _animate() {
        this._animationId = requestAnimationFrame(this._animate);
        if (this.destroyed || !this.renderer || !this.scene || !this.camera) return;
        const now = performance.now();
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;

        // Los valores del puente llegan a saltos (~7 Hz): se persiguen con un
        // filtro independiente del framerate antes de tocar ningún material.
        const kCtrl = 1 - Math.pow(CTRL_SMOOTH_TAU, dt);
        const view = this._view;
        for (const key in this._ctrl) view[key] += (this._ctrl[key] - view[key]) * kCtrl;
        // Los pesos regionales siguen el mismo filtro independiente del framerate.
        for (const z in this._regionTarget) {
            this._regionWeight[z] += (this._regionTarget[z] - this._regionWeight[z]) * kCtrl;
        }
        this._pushView();

        // timedilation → el tiempo interno de la pieza se estira o comprime
        const sdt = dt * view.speed;
        if (this.animEnabled) this._t += sdt;
        // Escritura de las frases del lexicón (presentación CRT).
        if (this.animEnabled) this._typePhrases(sdt);

        // Fondo/niebla en transición suave (sin flash al cambiar paleta)
        if (this._bgTarget && this.scene.background instanceof THREE.Color) {
            this.scene.background.lerp(this._bgTarget, 1 - Math.pow(BG_FADE_TAU, dt));
            if (this.scene.fog) this.scene.fog.color.copy(this.scene.background);
        }

        // spatialspread (ángulo) + harmonicrich (giro continuo) → rotación.
        // view.rotY ya viene suavizado, así que no hace falta un segundo lerp.
        if (this.animEnabled) this._rotAuto += dt * view.rotSpeed;
        if (this.world) this.world.rotation.y = view.rotY + this._rotAuto;

        if (this.animEnabled) {
            const t = this._t;
            const amp = view.driftAmp;
            const jit = view.jitter;
            this._sprites.forEach((s) => {
                let px = s.anchor.x, py = s.anchor.y;
                if (s.kind === "driftX") px += Math.sin(t * 0.6 + s.phase) * 0.6 * amp;
                else if (s.kind === "bobY") py += Math.sin(t * 1.1 + s.phase) * 0.25 * amp;
                // El parpadeo modula sobre la presencia fenológica ya escrita
                // por _pushView, no la sobrescribe.
                else if (s.kind === "blink") s.obj.material.opacity = s.phenoOp * (0.4 + 0.6 * Math.abs(Math.sin(t * 1.4 + s.phase)));
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
                    pos.setY(i, w.baseY + Math.sin(x * 0.5 + t * 1.6 + w.phase) * w.amp * view.waveAmp * this._waveScale);
                }
                pos.needsUpdate = true;
            });

            if (this._particles) {
                const { points, speeds, phases, kind, count } = this._particles;
                const pos = points.geometry.attributes.position;
                // sdt (dt × timedilation), no dt: nieve, arena, burbujas y
                // luciérnagas comparten el reloj estirado del resto de la
                // pieza en vez de quedarse congeladas respecto a ella.
                for (let i = 0; i < count; i++) {
                    let x = pos.getX(i), y = pos.getY(i);
                    if (kind === "snow") { y -= speeds[i] * sdt * 1.2; x += Math.sin(t * 0.5 + phases[i]) * sdt * 0.4; if (y < -9) y = 9; }
                    else if (kind === "sand") { x += speeds[i] * sdt * 1.6; if (x > 10) x = -10; }
                    else if (kind === "bubble") { y += speeds[i] * sdt * 1.2; if (y > 9) y = -9; }
                    else { x += Math.cos(t * 0.2 + phases[i]) * sdt * 0.3; y += Math.sin(t * 0.15 + phases[i]) * sdt * 0.3; }
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
        this._recolor();
    }

    toggleAnim({ on = true } = {}) {
        this.animEnabled = !!on;
    }

    setNocturno({ on = true } = {}) {
        this.nocturno = !!on;
        this._recolor();
    }

    // ── recoloreo en sitio (sin reconstruir la escena) ─────────────────────
    // Cambiar de paleta NO cambia el layout: la siembra es determinista y
    // saldría idéntica. Antes setPalette/setNocturno lanzaban un _buildScene
    // completo — descartar ~110 geometrías/materiales/texturas para volver a
    // colocarlo todo en las mismas posiciones. Aquí sólo se repinta.
    _recolor() {
        if (!this.scene || this.destroyed) return;
        // rng propio: re-resolver "auto"/"aleatoria" no debe desincronizar el
        // flujo que sembró el layout. Determinista para la misma combinación.
        const rng = mulberry32(hashString(`${this.seed}|${this.mode}|${this.currentPalette}|${this.nocturno}`));
        this.C = this._resolvePalette(rng);

        this._bgTarget = new THREE.Color(this.C.paper);
        this._sprites.forEach((rec) => this._paintSpecies(rec));
        this._texts.forEach((t) => this._repaintText(t));
        this._inkLines.forEach((mat) => mat.color.set(this.C.ink));
        this._waves.forEach((w) => w.base.set(this.C.blue));
        if (this._particles) this._particles.base.set(this.C[this._particles.role]);
        this._pushView(true);
    }

    // ── sliders sonETH → parámetros vivos (sin reconstruir la escena) ──────
    // Recibe valores normalizados 0–1 desde el puente (estratos.ts pollea
    // window.__sonethParams). El mismo gesto que mueve el dron sonoro mueve
    // la cartografía: color, rotación, deriva, niebla, temblor.
    // Aquí sólo se fija el OBJETIVO: _animate lo persigue suavizado y escribe
    // en los materiales, así un barrido de slider no llega a saltos.
    applyControl(key, v) {
        const c = this._ctrl;
        switch (key) {
            case "spectralshift":
                c.hue = v;                                    // color / tinte
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
                break;
            case "atmospheremix":
                // Rango calibrado al encuadre real: la cámara está a ~28.7 del
                // origen y el mundo llega a ~45. El tope anterior (near 8 /
                // far 35) disolvía TODO menos el texto (que va con fog:false),
                // dejando el poema flotando sobre un fondo vacío.
                c.fogNear = 40 - v * 16;                      // densidad de niebla
                c.fogFar = 130 - v * 60;
                break;

            // ── Cámara Fenológica (window.__phenoParams) ──────────────────
            case "opacityFloor":
                c.opacityFloor = v * 0.7;                     // mismo 0..0.7 que SC
                break;
            case "seasonalWeight":
                c.season = v;                                 // humedad del día
                break;
        }
    }

    // window.__ednaBio → peso por estrato. Se guarda como OBJETIVO y _animate
    // lo persigue suavizado, igual que los sliders sonETH: el puente pollea a
    // ~7 Hz y empujar sus valores directos escalonaría la opacidad.
    setRegions(v) {
        if (!Array.isArray(v)) return;
        for (let i = 0; i < REGION_ZONE.length && i < v.length; i++) {
            const x = v[i];
            if (typeof x === "number" && isFinite(x)) {
                this._regionTarget[REGION_ZONE[i]] = Math.min(1, Math.max(0, x));
            }
        }
    }

    // activityThreshold → densidad de siembra. Reconstruye, así que el puente
    // lo manda con debounce; se ignora si el cambio no altera la población.
    setDensity({ value = PHENO_DEFAULTS.activityThreshold } = {}) {
        const d = densityFromThreshold(Math.min(1, Math.max(0, value)));
        if (Math.abs(d - this.density) < 0.02) return;
        this.density = d;
        this._buildScene();
    }

    // Reaplica el estado de control tras cada _buildScene (los materiales
    // recién creados no conocen los valores actuales de los sliders): salta
    // directo al objetivo, sin rampa.
    _reapplyControls() {
        Object.assign(this._view, this._ctrl);
        this._pushView(true);
    }

    // Escribe el estado suavizado en los materiales. Se llama cada frame.
    //
    // La estación NO reemplaza a los sliders: los MULTIPLICA. El intérprete
    // sigue fijando el rango con memoryfeed/dronedepth/atmospheremix y el
    // calendario lo inclina hacia el año seco o el lluvioso dentro de ese
    // rango. Así ningún gesto humano queda anulado por la fenología.
    _pushView(force = false) {
        const view = this._view;
        const season = view.season;

        // Olas más altas y partículas más densas en lluvias; quietud en seca.
        const seasonWave = 0.35 + season * 1.30;
        const seasonPart = 0.45 + season * 0.85;
        // La niebla espesa un poco con la humedad, sin tragarse la escena.
        const seasonFogNear = 1 - season * 0.22;
        const seasonFogFar = 1 - season * 0.18;
        this._waveScale = seasonWave;

        if (this._particles) {
            this._particles.points.material.size = view.partSize;
            this._particles.points.material.opacity = Math.min(1, view.partOp * seasonPart);
        }
        if (this.scene && this.scene.fog) {
            this.scene.fog.near = view.fogNear * seasonFogNear;
            this.scene.fog.far = view.fogFar * seasonFogFar;
        }

        // Presencia fenológica: cada especie se desvanece según lo lejos que
        // esté la humedad del día de su propia floración, nunca por debajo del
        // piso de opacidad (la cláusula de opacidad hecha paisaje).
        const floor = view.opacityFloor;
        const rw = this._regionWeight;
        this._sprites.forEach((s) => {
            const align = 1 - Math.abs(season - s.bloom);
            // El peso regional entra como un multiplicador SUAVE (0.55–1.0):
            // subir o bajar una región inclina la presencia de su estrato sin
            // vaciarlo, que es la lectura sutil que se pidió — y sin
            // reconstruir la escena, a diferencia de la densidad.
            const reg = 0.55 + ((rw[s.zone] !== undefined ? rw[s.zone] : 0.5) * 0.45);
            s.phenoOp = (floor + (1 - floor) * align) * reg;
            s.obj.material.opacity = s.phenoOp;
        });
        if (force || this._tintApplied === null || Math.abs(view.hue - this._tintApplied) > 1e-4) {
            this._tintApplied = view.hue;
            this._applyTint(view.hue);
        }
    }

    // spectralshift → tinte. HUE_NEUTRAL (el reposo del puente) no tiñe;
    // alejarse de él colorea. Dos modelos distintos, a propósito:
    //   · olas y partículas guardan su color base y ROTAN el matiz.
    //   · las especies llevan su color horneado en la textura (arte a dos
    //     tintas: acento + C.ink), así que sólo admiten un multiplicativo.
    //     Se usa un lavado de saturación plena y luminosidad alta, cuyo canal
    //     dominante vale siempre 1.0: colorea sin oscurecer ni fundir los
    //     cinco acentos en un mismo tono turbio, y es continuo en el centro
    //     (antes había un escalón de ~28% de brillo al cruzar sat = 0.03).
    // El texto queda sin teñir para preservar legibilidad del poema.
    _applyTint(hue) {
        const dist = Math.min(1, Math.abs(hue - HUE_NEUTRAL) * 2.2);
        const wash = dist * 0.5;
        // s = 1 con l = 1 - wash/2 ⇒ canal máximo = 1.0, mínimo = 1 - wash.
        // En wash = 0 da blanco puro (identidad multiplicativa).
        const tint = new THREE.Color().setHSL(hue, 1, 1 - wash / 2);
        this._sprites.forEach((s) => s.obj.material.color.copy(tint));
        const hueShift = hue - HUE_NEUTRAL;
        this._waves.forEach((w) => {
            w.line.material.color.copy(w.base).offsetHSL(hueShift, dist * 0.3, 0);
        });
        if (this._particles) {
            this._particles.points.material.color.copy(this._particles.base).offsetHSL(hueShift, dist * 0.3, 0);
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