// ─── CRT surface ────────────────────────────────────────────────────────────
//
// The phosphor look of slot C. Ported from @designcodeio/threeui v1.1.0
// (MIT, https://threeui.com, MengTo) — the fragment shader below is that
// package's `crt` shader kept verbatim so the result matches the reference
// exactly. The renderer around it is rewritten; see WHY NOT THE PACKAGE.
//
// WHY NOT THE PACKAGE
// -------------------
// Three reasons, in order of weight:
//
//   1. It ships two aliased copies of three.js (three@0.128 and three@0.165)
//      inside a 54.5 MB tarball. This app pins three@0.159 and every other
//      slot draws with it. Adding the dependency puts three copies of three in
//      an Electron bundle to obtain an effect that — see 2 — does not use
//      three at all.
//
//   2. CrtBackground is not a three.js component. It is raw WebGL1: one
//      fullscreen triangle sampling a 2D canvas. Nothing is imported from
//      three to draw it, so there is no version to reconcile and nothing to
//      lose by porting. 40 KB of the 54.5 MB was ever relevant.
//
//   3. Its text is hardcoded — a fixed Matrix homage compiled into the
//      renderer with no prop to replace it. Slot C exists to print the
//      Reserva's own record. The package's own `CrtOptions` has no hook for
//      that, which alone would have forced this rewrite.
//
// Also worth recording, since the call site asked for it: `variant="terminal"`
// does nothing in v1.1.0. `CrtOptions` is {speed, typeSpeed, motion,
// brightness, opacity, hue, saturation}; CrtBackground destructures only
// `className` and spreads the rest into that options object, so an unknown
// `variant` key is carried and never read. Preserved here as a no-op field so
// the call site reads the same.
//
// hue/saturation/brightness/opacity are CSS filters on the host element in the
// original, not shader uniforms. Kept that way — same visual result, and it
// keeps the shader byte-identical to the reference.

export const CRT_VERTEX_SHADER = `attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos,0.0,1.0); }`;

export const CRT_FRAGMENT_SHADER = `precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uMotion;
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
vec2 curve(vec2 uv){
  uv = uv*2.0-1.0;
  vec2 o = uv.yx*uv.yx;
  uv += uv * o * vec2(0.115,0.165);
  uv = uv*0.5+0.5;
  return uv;
}
void main(){
  vec2 fuv = gl_FragCoord.xy / uRes;
  vec2 uv = curve(fuv);
  vec2 inb = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  float inside = inb.x*inb.y;
  vec2 ed = min(uv, 1.0-uv);
  inside *= smoothstep(0.0,0.020, min(ed.x,ed.y));
  vec2 dir = uv-0.5;
  float d2 = dot(dir,dir);
  vec2 ao = dir * (0.0016 + 0.012*d2);
  vec3 col;
  col.r = texture2D(uTex, uv + ao).r;
  col.g = texture2D(uTex, uv).g;
  col.b = texture2D(uTex, uv - ao).b;
  float lines = uRes.y*0.92;
  float sl = sin(uv.y*3.14159265*lines + uTime*4.0*uMotion);
  col *= mix(0.70,1.0, sl*sl);
  float gx = gl_FragCoord.x * (6.2831853/3.0);
  vec3 grille = 0.66 + 0.34*cos(gx + vec3(0.0,2.094,4.188));
  col *= grille;
  col *= 1.34;
  float bar = fract(uv.y*0.5 - uTime*0.07*uMotion);
  bar = smoothstep(0.0,0.05,bar)*smoothstep(0.18,0.05,bar);
  col += bar*0.045*uMotion;
  float sheen = smoothstep(0.55,0.0, distance(uv, vec2(0.50,0.15)));
  col += sheen*0.030*vec3(0.55,1.0,0.78);
  float vig = smoothstep(0.98,0.30, length((uv-0.5)*vec2(1.05,1.0)));
  col *= mix(0.42,1.0, vig);
  col *= 1.0 - 0.028*uMotion*sin(uTime*8.0);
  col += (hash(fuv + fract(uTime*0.37)) - 0.5)*0.022;
  float spill = smoothstep(0.85,0.18, length(fuv-0.5))*0.05;
  vec3 room = vec3(0.012,0.03,0.022) + vec3(0.0,spill*0.6,spill*0.42);
  col = mix(room, col, inside);
  col = max(col, vec3(0.004,0.010,0.008));
  gl_FragColor = vec4(col,1.0);
}`;

export type CrtOptions = {
  /** Inert in the reference package too; kept so the call site reads the same. */
  variant?: string;
  speed: number;
  typeSpeed: number;
  motion: number;
  brightness: number;
  opacity: number;
  hue: number;
  saturation: number;
};

export const CRT_DEFAULTS: CrtOptions = {
  variant: "terminal",
  speed: 1.0,
  typeSpeed: 1.0,
  motion: 1.0,
  brightness: 1.0,
  opacity: 1.0,
  hue: 0,
  saturation: 1.0,
};

/** The phosphor the reference package uses for its screen black. */
export const CRT_BLACK = "#03100a";

/** Palette from the reference renderer: primary, dim, accent, highlight. */
export const CRT_INK = {
  p: { fill: "#8df0b4", glow: "rgba(28,236,132,0.95)" },
  d: { fill: "#4f9a76", glow: "rgba(28,236,132,0.45)" },
  a: { fill: "#ffba5e", glow: "rgba(255,150,52,0.95)" },
  h: { fill: "#eafff3", glow: "rgba(120,255,190,0.95)" },
} as const;

export type CrtInk = keyof typeof CRT_INK;

/**
 * What the caller draws into each frame. The 2D canvas IS the CRT's source
 * texture, so anything painted here — text, video frames, plots — comes out
 * curved, scanlined and aberrated rather than sitting flat on top of the
 * effect. That is the whole reason the surface is a callback and not a fixed
 * script: slot C paints camera-trap footage into the same phosphor as its
 * text, so the footage reads as something the screen is displaying.
 */
export type CrtPaint = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
) => void;

export type CrtSurface = {
  resize: () => void;
  render: (now: number) => void;
  dispose: () => void;
  /** Live pixel size of the drawing surface, for layout maths. */
  size: () => { w: number; h: number };
};

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("Unable to create CRT shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) ?? "CRT shader compilation failed");
  }
  return sh;
}

export function createCrtSurface(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  getOptions: () => CrtOptions,
  paint: CrtPaint,
): CrtSurface {
  const gl = canvas.getContext("webgl", {
    antialias: false, alpha: false, depth: false, premultipliedAlpha: false,
  }) as WebGLRenderingContext | null;
  if (!gl) throw new Error("CRT requires WebGL");

  const text = document.createElement("canvas");
  const ctx = text.getContext("2d");
  if (!ctx) throw new Error("CRT text canvas unavailable");

  const vs = compile(gl, gl.VERTEX_SHADER, CRT_VERTEX_SHADER);
  const fs = compile(gl, gl.FRAGMENT_SHADER, CRT_FRAGMENT_SHADER);
  const prog = gl.createProgram();
  if (!prog) throw new Error("Unable to create CRT program");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) ?? "CRT link failed");
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTex = gl.getUniformLocation(prog, "uTex");
  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uMotion = gl.getUniformLocation(prog, "uMotion");

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(uTex, 0);

  let W = 1;
  let H = 1;
  const t0 = performance.now();

  const resize = () => {
    const r = host.getBoundingClientRect();
    const cw = Math.max(1, r.width);
    const ch = Math.max(1, r.height);
    // Same budget as the reference: cap the drawing surface well under the
    // display size. The CRT's own scanlines and grille are the detail; extra
    // pixels underneath them are invisible and cost fill rate on every frame.
    const scale = cw < 700 ? 0.82 : 0.55;
    const w = Math.min(Math.round(cw * scale), 920);
    const h = Math.max(1, Math.round((w * ch) / cw));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      text.width = w;
      text.height = h;
      W = w;
      H = h;
    }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
  };

  return {
    resize,
    size: () => ({ w: W, h: H }),
    render(now: number) {
      const o = getOptions();

      // Slot C repaints every frame rather than diffing like the reference
      // does. The reference could cache — its text only changes when another
      // character is typed — but this surface carries live video, so there is
      // never a frame where the source texture is unchanged.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = CRT_BLACK;
      ctx.fillRect(0, 0, W, H);
      paint(ctx, W, H, now);

      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, text);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

      gl.useProgram(prog);
      gl.uniform1f(uTime, (now - t0) * 1e-3 * o.speed);
      gl.uniform1f(uMotion, o.motion);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteBuffer(buf);
      gl.deleteTexture(tex);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}

/** Set fill + phosphor bloom for one ink. `size` scales the glow to the type. */
export function setInk(ctx: CanvasRenderingContext2D, ink: CrtInk, size: number): void {
  const c = CRT_INK[ink];
  ctx.fillStyle = c.fill;
  ctx.shadowColor = c.glow;
  ctx.shadowBlur = size * 0.55;
}

export function crtFont(px: number, weight = 600): string {
  return `${weight} ${px.toFixed(2)}px ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace`;
}
