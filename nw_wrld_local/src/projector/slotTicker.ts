// slotTicker.ts
// The ring's own reading, crawling along the foot of a slot.
//
// This lived inside constellationField.ts, which was fine while all five of
// slots 5-9 carried a constellation. When the field came off 6, 7 and 8 the
// ticker went with it — and the ticker was never about the constellation. It
// reports where the phenological ring stands, which is true of the whole
// instrument and belongs to any slot that wants to say it.
//
// So it is its own thing now, drawn on its own 2-D canvas over the WebGL one.
// Slots 5 and 9 keep theirs inside the field (one canvas is better than two
// where a field already exists); 6, 7 and 8 mount this.
//
// It reports the day, the temporada, and — the part worth having — whether the
// day admitted any recording at all. 331 of the 365 days in this corpus have
// none, so "AUSENCIA · 12 D" is the honest majority reading and not an error
// state. A ticker that only ever showed clip counts would imply a year that was
// recorded.
//
// Slow on purpose: 16 px/s is about a word every two seconds. It is there to be
// caught sideways over a long sitting, not read.

export type SlotTicker = {
    /** Call once per frame. `alpha` scales the whole thing with the slot. */
    draw(alpha: number): void;
    resize(): void;
    destroy(): void;
};

const TICKER_TTL_MS = 900;
const TICKER_SPEED = 16;

/**
 * `tail` is the standing fact this slot wants to state alongside the live
 * reading — what the module IS. The ring is always somewhere, and it is usually
 * somewhere nobody recorded; saying both on one line is the point.
 */
export function mountSlotTicker(
    host: HTMLElement, tail: string, ink = "rgba(255,200,120,",
): SlotTicker {
    const canvas = document.createElement("canvas");
    canvas.style.cssText =
        "position:absolute;left:0;right:0;bottom:0;width:100%;height:34px;"
        + "pointer-events:none;z-index:3;mix-blend-mode:screen;";
    host.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    let w = 0, h = 0;
    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = host.offsetWidth || 800;
        h = 34;
        canvas.width = Math.max(1, Math.round(w * dpr));
        canvas.height = Math.max(1, Math.round(h * dpr));
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    let readAt = -Infinity;
    let text = "";
    let x = 0;
    let lastFrame = 0;

    function read() {
        readAt = performance.now();
        let head = "SIN ANILLO · SuperCollider en silencio";
        try {
            const pc = (window as unknown as {
                __phenoCursor?: {
                    doy: number; temporada: string; clips: number;
                    gap: number; quorum: number; at: number;
                };
            }).__phenoCursor;
            if (pc && typeof pc.doy === "number") {
                const body = pc.clips > 0
                    ? `${pc.clips} CLIP${pc.clips === 1 ? "" : "S"}`
                    : `AUSENCIA · ${Math.round(pc.gap)} D`;
                head = `DOY ${pc.doy}  ·  ${String(pc.temporada).toUpperCase()}  ·  ${body}`
                    + `  ·  QUÓRUM ${pc.quorum.toFixed(2)}`;
            }
        } catch { /* keep the fallback */ }
        // Only the TEXT changes; x is untouched so the crawl never jumps when
        // the day turns over.
        text = `${head}     ·     ${tail}     ·     `;
    }
    read();

    return {
        resize,
        draw(alpha) {
            if (!ctx) return;
            const now = performance.now();
            const dt = lastFrame === 0 ? 1 / 60 : Math.min(0.1, (now - lastFrame) / 1000);
            lastFrame = now;
            if (now - readAt > TICKER_TTL_MS) read();

            ctx.clearRect(0, 0, w, h);
            if (!text || alpha <= 0.01) return;

            const ty = h - 13;
            ctx.font = '10px ui-monospace, "SF Mono", Menlo, monospace';
            const tw = ctx.measureText(text).width;
            if (tw <= 0) return;

            // dtSec, not a per-frame constant: the crawl must cross the screen
            // at the same rate on a 60 and a 120 Hz panel, and after a stall it
            // must resume rather than leap.
            x -= TICKER_SPEED * dt;
            if (x <= -tw) x += tw;

            ctx.globalAlpha = 0.24 * alpha;
            ctx.strokeStyle = ink + "1)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, ty - 7);
            ctx.lineTo(w, ty - 7);
            ctx.stroke();

            ctx.globalAlpha = 0.72 * alpha;
            ctx.fillStyle = ink + "1)";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            // Repeated until the width is covered, so the crawl is seamless
            // rather than a block that slides past.
            for (let px = x; px < w; px += tw) ctx.fillText(text, px, ty);
            ctx.globalAlpha = 1;
        },
        destroy() {
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        },
    };
}
