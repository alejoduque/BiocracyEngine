// ─── Animal constellations · fauna del bosque seco tropical ─────────────────
//
// The nine the field draws instead of arbitrary nearest-neighbour links.
//
// A link between two nodes because they happen to be within 160 px of each
// other says nothing — it is the same graph over any data, and it was the same
// graph on all five slots. These are figures: each one is a specific animal of
// the tropical dry forest, drawn the way a star chart draws a constellation,
// so that sweeping the pointer across the field turns an anonymous scatter
// into a census of who lives there.
//
// COORDINATES
// Normalised to roughly -1..1 on both axes, y DOWN to match canvas space.
// The renderer scales and rotates them; nothing here should assume pixels.
// Keep figures inside the box or they clip when two instances sit close.
//
// EDGES are index pairs into `stars`. They are the drawn bones of the figure,
// so they should trace the silhouette a person would recognise in profile —
// not a skeleton, and not a triangulation. A constellation is a line drawing.
//
// The species are not decorative. All nine are resident fauna of the Colombian
// bosque seco tropical, the forest this whole engine listens to, and several
// carry the same conservation weight the Parliament's opacity clause is about.

export type Animal = {
  id: string;
  /** Nombre común, shown under the figure when it is revealed. */
  common: string;
  /** Binomial, shown smaller beneath it. */
  latin: string;
  /** Normalised star positions, y down. */
  stars: [number, number][];
  /** Index pairs into `stars`. */
  edges: [number, number][];
};

export const ANIMALS: Animal[] = [
  {
    id: "aullador",
    common: "Mono aullador rojo",
    latin: "Alouatta seniculus",
    // Seated, the prehensile tail curled up behind — the posture it holds
    // while calling at dawn, which is the sound this forest is known by.
    stars: [
      [-0.25, -0.62], [-0.52, -0.48], [-0.34, -0.34], [-0.10, -0.30],
      [-0.28, -0.06], [-0.18, 0.20], [0.14, -0.16], [0.32, 0.06],
      [0.16, 0.30], [-0.02, 0.52], [0.52, 0.10], [0.76, -0.16],
      [0.62, -0.44], [0.34, -0.42],
    ],
    edges: [
      [0, 1], [1, 2], [2, 3], [0, 3], [3, 4], [4, 5], [3, 6], [6, 7],
      [7, 8], [8, 9], [7, 10], [10, 11], [11, 12], [12, 13],
    ],
  },
  {
    id: "puma",
    common: "Puma",
    latin: "Puma concolor",
    // Stalking profile, long low tail: the line that separates it from the
    // ocelot below at a glance is the tail carried out rather than curled.
    stars: [
      [-0.86, -0.10], [-0.66, -0.22], [-0.58, -0.38], [-0.42, -0.12],
      [-0.22, -0.16], [0.06, -0.22], [0.34, -0.14], [0.50, -0.06],
      [0.74, 0.04], [0.90, -0.16], [-0.24, 0.16], [-0.28, 0.44],
      [0.34, 0.18], [0.28, 0.46],
    ],
    edges: [
      [0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8],
      [8, 9], [4, 10], [10, 11], [6, 12], [12, 13],
    ],
  },
  {
    id: "ocelote",
    common: "Ocelote",
    latin: "Leopardus pardalis",
    // Crouched and compact, both ears showing, shorter ringed tail lifted.
    stars: [
      [-0.78, 0.02], [-0.60, -0.08], [-0.66, -0.28], [-0.48, -0.26],
      [-0.38, 0.00], [-0.18, 0.02], [0.08, -0.06], [0.32, 0.02],
      [0.48, 0.10], [0.68, 0.02], [0.82, -0.14], [-0.20, 0.36],
      [0.30, 0.38],
    ],
    edges: [
      [0, 1], [1, 2], [1, 3], [1, 4], [4, 5], [5, 6], [6, 7], [7, 8],
      [8, 9], [9, 10], [5, 11], [7, 12],
    ],
  },
  {
    id: "oso-palmero",
    common: "Oso palmero",
    latin: "Myrmecophaga tridactyla",
    // Unmistakable even at four stars: the tapering snout forward and the
    // banner of a tail behind. Vulnerable, and the dry forest is its range.
    stars: [
      [-0.94, 0.16], [-0.72, 0.08], [-0.50, 0.00], [-0.44, -0.10],
      [-0.30, 0.04], [-0.10, 0.00], [0.14, -0.06], [0.36, 0.02],
      [0.52, 0.06], [0.72, -0.20], [0.92, -0.06], [0.74, 0.24],
      [-0.10, 0.34], [0.34, 0.34],
    ],
    edges: [
      [0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [5, 6], [6, 7], [7, 8],
      [8, 9], [9, 10], [10, 11], [11, 8], [5, 12], [7, 13],
    ],
  },
  {
    id: "guacamaya",
    common: "Guacamaya azul y amarilla",
    latin: "Ara ararauna",
    // In flight, seen from below: wings spread wide, the long tail trailing.
    stars: [
      [-0.06, -0.72], [0.02, -0.56], [0.02, -0.30], [0.02, 0.06],
      [0.02, 0.42], [0.02, 0.82], [-0.26, -0.26], [-0.56, -0.34],
      [-0.86, -0.22], [0.30, -0.26], [0.60, -0.34], [0.90, -0.22],
    ],
    edges: [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [6, 7], [7, 8],
      [2, 9], [9, 10], [10, 11],
    ],
  },
  {
    id: "chicharra",
    common: "Chicharra",
    latin: "Fidicina mannifera",
    // Wings held in the roof shape, the two wide-set eyes that make the head
    // read as an insect's rather than a bird's. The dry season's own drone.
    stars: [
      [0.00, -0.52], [-0.16, -0.46], [0.16, -0.46], [0.00, -0.24],
      [0.00, 0.10], [0.00, 0.46], [-0.14, -0.20], [-0.44, 0.06],
      [-0.56, 0.40], [0.14, -0.20], [0.44, 0.06], [0.56, 0.40],
    ],
    edges: [
      [1, 0], [0, 2], [0, 3], [3, 4], [4, 5], [3, 6], [6, 7], [7, 8],
      [8, 5], [3, 9], [9, 10], [10, 11], [11, 5],
    ],
  },
  {
    id: "murcielago",
    common: "Murciélago frutero",
    latin: "Artibeus lituratus",
    // Wings spread with the finger struts drawn, because that membrane is the
    // whole silhouette — without the struts it reads as a bird.
    stars: [
      [0.00, -0.46], [-0.12, -0.60], [0.12, -0.60], [0.00, -0.12],
      [0.00, 0.24], [-0.22, -0.18], [-0.50, -0.30], [-0.90, -0.16],
      [-0.62, 0.14], [-0.30, 0.22], [0.22, -0.18], [0.50, -0.30],
      [0.90, -0.16], [0.62, 0.14], [0.30, 0.22],
    ],
    edges: [
      [1, 0], [0, 2], [0, 3], [3, 4], [3, 5], [5, 6], [6, 7], [7, 8],
      [8, 9], [9, 4], [3, 10], [10, 11], [11, 12], [12, 13], [13, 14],
      [14, 4],
    ],
  },
  {
    id: "mapana",
    common: "Mapaná",
    latin: "Bothrops asper",
    // The S the body makes, and the triangular head closed as its own figure
    // at the head of it — the shape you are taught to recognise here.
    stars: [
      [-0.88, -0.30], [-0.74, -0.44], [-0.72, -0.18], [-0.56, -0.30],
      [-0.32, -0.44], [-0.06, -0.22], [0.18, 0.06], [0.42, 0.28],
      [0.62, 0.16], [0.74, -0.10], [0.88, -0.34],
    ],
    edges: [
      [0, 1], [1, 3], [3, 2], [2, 0], [3, 4], [4, 5], [5, 6], [6, 7],
      [7, 8], [8, 9], [9, 10],
    ],
  },
  {
    id: "rana",
    common: "Rana túngara",
    latin: "Engystomops pustulosus",
    // Squat, seen from above: the two bulging eyes forward and the hind legs
    // folded into their kick. It calls from the puddles the dry season leaves.
    stars: [
      [-0.28, -0.44], [0.28, -0.44], [0.00, -0.26], [0.00, -0.02],
      [-0.34, -0.10], [-0.52, 0.28], [0.34, -0.10], [0.52, 0.28],
      [-0.30, 0.20], [-0.62, 0.34], [-0.40, 0.60], [0.30, 0.20],
      [0.62, 0.34], [0.40, 0.60],
    ],
    edges: [
      [0, 2], [2, 1], [0, 3], [1, 3], [3, 4], [4, 5], [3, 6], [6, 7],
      [3, 8], [8, 9], [9, 10], [3, 11], [11, 12], [12, 13],
    ],
  },
];
