// domeBend.ts — a flat world, wrapped around the audience, on the dome only
// ===========================================================================
// Some slots are built along a line: an axis from left to right, receding
// toward a horizon. Seen from the dome's seat that is a strip in front, a
// crescent at the rim of the domemaster. This bends such a world around the
// viewer while the DOME draws it, and leaves it exactly as authored while the
// slot's own renderer draws the flat screen:
//
//   x  (−halfWidth … +halfWidth)   → azimuth, all the way round (±180°)
//   z  (front 0 … −depth)          → elevation: the front at the horizon, the
//                                    receding past rising toward the zenith —
//                                    and a little farther away as it goes, so
//                                    a nearer range still hides a farther one
//   y                              → height, as degrees of elevation
//
// (A plain cylinder — x round, z outward — does not work for a landscape: from
// the centre the front range, nearest and tallest, hides every range behind.)
//
// It is a vertex-shader step injected into the scene's materials (the world
// position is bent between the model and the view matrix, so fog, instancing
// and every material keep working), switched by a uniform that the scene's
// onBeforeRender sets according to WHICH renderer is drawing. The domemaster
// is told where the seat is (scene.userData.domeEye) — at the centre of the
// bend, so the world surrounds it.

import * as THREE from "three";

export type BendSpec = {
  /** Half the width of the axis that becomes the full circle. */
  halfWidth: number;
  /** How far back the world goes (z = −depth is the farthest). */
  depth: number;
  /** Distance of the front (z = 0) from the seat. */
  r0: number;
  /** Extra distance per unit of depth. */
  rGrowth?: number;
  /** Elevation of the front's ground, degrees. */
  baseDeg?: number;
  /** Elevation the farthest ground reaches, degrees. */
  topDeg?: number;
  /** Degrees of elevation per unit of height (y). */
  degPerY?: number;
};

const CHUNK = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 bendWorld = modelMatrix * mvPosition;
if ( uBend > 0.5 ) {
  float a = bendWorld.x / uBendHalf * 3.14159265;
  float d = clamp( -bendWorld.z / uBendDepth, 0.0, 1.2 );
  float r = uBendR0 + uBendRG * d * uBendDepth;
  float e = uBendBase + d * ( uBendTop - uBendBase ) + bendWorld.y * uBendDegY;
  bendWorld.xyz = r * vec3( sin( a ) * cos( e ), sin( e ), -cos( a ) * cos( e ) );
}
mvPosition = viewMatrix * bendWorld;
gl_Position = projectionMatrix * mvPosition;
`;

/**
 * Make `scene` bendable for the dome. `ownRenderer` is the slot's renderer:
 * whenever any other renderer draws the scene (the dome's cube camera), the
 * bend is on. Materials added later are picked up on the next flat frame.
 */
export function installDomeBend(scene: THREE.Scene, ownRenderer: THREE.WebGLRenderer, spec: BendSpec) {
  const D = Math.PI / 180;
  const uniforms = {
    uBend: { value: 0 },
    uBendHalf: { value: spec.halfWidth },
    uBendDepth: { value: spec.depth },
    uBendR0: { value: spec.r0 },
    uBendRG: { value: spec.rGrowth ?? 0.8 },
    uBendBase: { value: (spec.baseDeg ?? 2) * D },
    uBendTop: { value: (spec.topDeg ?? 78) * D },
    uBendDegY: { value: (spec.degPerY ?? 4) * D },
  };
  const seen = new WeakSet<THREE.Material>();

  const prepare = (m: THREE.Material) => {
    if (seen.has(m)) return;
    seen.add(m);
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      prev?.call(m, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("void main() {", "uniform float uBend;\nuniform float uBendHalf;\nuniform float uBendDepth;\nuniform float uBendR0;\nuniform float uBendRG;\nuniform float uBendBase;\nuniform float uBendTop;\nuniform float uBendDegY;\nvoid main() {")
        .replace("#include <project_vertex>", CHUNK);
    };
    const key = m.customProgramCacheKey?.bind(m);
    m.customProgramCacheKey = () => (key ? key() : "") + "|domeBend";
    m.needsUpdate = true;
  };

  const sweep = () => {
    scene.traverse((o: any) => {
      if (!o.material) return;
      // Bent positions are not where three's bounds say they are: never cull.
      o.frustumCulled = false;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) prepare(m);
    });
  };
  sweep();

  scene.userData.domeEye = new THREE.Vector3(0, 0, 0);
  scene.userData.domeForward = new THREE.Vector3(0, 0, -1);

  const prevBefore = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer: any, ...rest: any[]) {
    const own = renderer === ownRenderer;
    uniforms.uBend.value = own ? 0 : 1;
    if (own) sweep();
    return (prevBefore as any).call(this, renderer, ...rest);
  };
}
