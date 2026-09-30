// postfx.ts
// The two custom passes slot 0 has always carried, moved here unchanged from
// ParliamentStage.js so the three ring stages share them.

// ─── Chromatic aberration (RGB split) ───────────────────────────────────────
export const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount:   { value: 0.0 },   // 0 = none, 0.01 = strong
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      float d = length(dir);
      vec2 off = normalize(dir) * amount * d;
      float r = texture2D(tDiffuse, vUv + off).r;
      float g = texture2D(tDiffuse, vUv       ).g;
      float b = texture2D(tDiffuse, vUv - off).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};

// ─── Colour grade (warm ↔ cool ↔ red) ───────────────────────────────────────
export const ColorGradeShader = {
  uniforms: {
    tDiffuse:  { value: null },
    warmth:    { value: 0.5 },   // 1 = warm gold, 0 = cool blue
    emergency: { value: 0.0 },   // 0-1: blends toward red saturation
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float warmth;
    uniform float emergency;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float w = warmth;
      vec3 warm = vec3(c.r * (1.0 + 0.25 * w), c.g * (1.0 + 0.12 * w), c.b * (1.0 - 0.18 * w));
      float cw = 1.0 - w;
      vec3 cool = vec3(c.r * (1.0 - 0.20 * cw), c.g * (1.0 + 0.08 * cw), c.b * (1.0 + 0.28 * cw));
      vec3 graded = mix(cool, warm, w);
      vec3 emerg = vec3(graded.r * (1.0 + 0.8 * emergency), graded.g * (1.0 - 0.5 * emergency), graded.b * (1.0 - 0.6 * emergency));
      gl_FragColor = vec4(mix(graded, emerg, emergency), c.a);
    }
  `,
};
