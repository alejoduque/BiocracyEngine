// ethLive.ts
// The chain itself, for the modules that were inventing one.
//
// Until now the browser saw three scalars — /bio/nutrient, /bio/density and
// /bio/consensus — all derived from THROUGHPUT. Nothing about what any single
// transaction actually was reached the screen, so five slots filled the gap
// with Math.random(): a glitch whose probability was `txInfluence`, a
// displacement whose direction was a coin flip, a hash mapping walked with
// noise. The chain was right there and the visuals were making numbers up.
//
// SuperCollider already measured all of it (~rhythmState in 6_osc_handlers.scd)
// and now forwards it on /eth/live and /eth/block/live, normalised at the
// source — the ranges are a property of Ethereum, not of a visualisation, and
// one mapping beats six modules each inventing their own idea of "a lot of gas".
//
// Mutated in place like __scAudio and __vizMotion, so a slot holds the
// reference and reads it every frame without allocating.

export type EthLive = {
    // ── Per transaction ──────────────────────────────────────────────────
    /** Value moved, log-compressed over 1e-6..100 ETH. */
    value: number;
    /** How far over base fee this actor bid, 0-1. Urgency. */
    priority: number;
    /** Gas price, log-compressed over 0.1..500 gwei. */
    gas: number;
    /** Calldata length, log-compressed. How complex the act was. */
    calldata: number;
    /** Sender's nonce as a PHASE, 0-1 wrapping every 256. Never saturates. */
    nonce: number;
    /** Stable identity per counterparty, 0-1. The same address is the same number. */
    addr: number;
    /** Position within the block, 0-1 over the first 64. */
    index: number;
    /** Entropy of recent inter-arrival times, 0-1. */
    entropy: number;
    /** Transactions so far this block, 0-1 over 300. */
    depth: number;

    // ── Per block ────────────────────────────────────────────────────────
    /** Alternates 0/1 each block, so a module can step rather than drift. */
    parity: number;
    /** How full the block is, 0-1 over 400 transactions. */
    fullness: number;
    /** Base fee, log-compressed. */
    baseFee: number;
    /** Block hash folded to 0-1. A stable per-block identity. */
    hash: number;
    /** Measured block period, 0-1 over 4..30 s. */
    period: number;

    // ── Derived ──────────────────────────────────────────────────────────
    /** Seconds since the last transaction arrived. Large = the chain is quiet. */
    age: number;
    /** Seconds since the last block. */
    blockAge: number;
    /** 1 → 0 over ~1.5 s after a transaction. The chain's own onset. */
    pulse: number;
    /** 1 → 0 over ~4 s after a block. The bar line. */
    blockPulse: number;
    /** True while messages are arriving. */
    live: boolean;
};

const eth: EthLive = {
    // Mid-scale rather than zero. A module reading this before the chain has
    // said anything should look like an instrument at rest, not one whose every
    // parameter has been driven to its floor.
    value: 0.4, priority: 0.5, gas: 0.4, calldata: 0.3, nonce: 0.5,
    addr: 0.5, index: 0.2, entropy: 0.5, depth: 0.3,
    parity: 0, fullness: 0.4, baseFee: 0.4, hash: 0.5, period: 0.35,
    age: 1e6, blockAge: 1e6, pulse: 0, blockPulse: 0, live: false,
};

let lastTxAt = 0;
let lastBlockAt = 0;

/** Published for the slots. */
export function getEthLive(): EthLive {
    return eth;
}

/** From the /eth/live handler in parliamentEntry. */
export function pushEthTx(a: number[]): void {
    const n = (i: number, d: number) =>
        (typeof a[i] === "number" && isFinite(a[i])) ? Math.max(0, Math.min(1, a[i])) : d;
    eth.value = n(0, eth.value);
    eth.priority = n(1, eth.priority);
    eth.gas = n(2, eth.gas);
    eth.calldata = n(3, eth.calldata);
    eth.nonce = n(4, eth.nonce);
    eth.addr = n(5, eth.addr);
    eth.index = n(6, eth.index);
    eth.entropy = n(7, eth.entropy);
    eth.depth = n(8, eth.depth);
    lastTxAt = now();
    eth.pulse = 1;
    eth.live = true;
    noteEthTx();
}

/** From the /eth/block/live handler. */
export function pushEthBlock(a: number[]): void {
    const n = (i: number, d: number) =>
        (typeof a[i] === "number" && isFinite(a[i])) ? Math.max(0, Math.min(1, a[i])) : d;
    eth.parity = n(0, eth.parity);
    eth.fullness = n(1, eth.fullness);
    eth.baseFee = n(2, eth.baseFee);
    eth.hash = n(3, eth.hash);
    eth.period = n(4, eth.period);
    lastBlockAt = now();
    eth.blockPulse = 1;
    eth.live = true;
    noteEthBlock();
}

function now(): number {
    return (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
}

/**
 * Decay the pulses and the ages. Call once a frame from wherever the projector
 * already ticks — parliamentEntry does it beside tickScAudio.
 *
 * Time-based, not per-frame: a chain event lasts as long on any display.
 */
export function tickEthLive(): void {
    const t = now();
    eth.age = lastTxAt === 0 ? 1e6 : t - lastTxAt;
    eth.blockAge = lastBlockAt === 0 ? 1e6 : t - lastBlockAt;
    // exp decay to a defined half-life rather than a per-frame multiplier
    eth.pulse = lastTxAt === 0 ? 0 : Math.exp(-eth.age / 0.55);
    eth.blockPulse = lastBlockAt === 0 ? 0 : Math.exp(-eth.blockAge / 1.6);
    if (eth.pulse < 0.001) eth.pulse = 0;
    if (eth.blockPulse < 0.001) eth.blockPulse = 0;
    // Quiet for a minute is not "not running", it is a quiet chain — but two
    // minutes with nothing means the feed is down, and a module should be able
    // to tell those apart.
    eth.live = eth.age < 120;
}

// ─── Scales ──────────────────────────────────────────────────────────────────
//
// The raw fields above are STEPS. eth_sonify.py sleeps 0.05 s between
// transactions, so `gas`, `calldata` and the rest change twenty times a second,
// and a value that steps twenty times a second is shake whatever it means. Fed
// straight to a shape or a brightness it is exactly the jitter the whole
// previous pass was spent removing — just sourced from Ethereum instead of from
// Math.random().
//
// What a visual needs from a data stream is not the sample. It is:
//
//   a FOLLOWER  with a time constant of its own, so a market condition moves
//               like a market condition and an event moves like an event;
//   an ENVELOPE with an attack, so an arrival swells rather than snapping —
//               a step has no shape and cannot be watched;
//   a PHASE     that runs continuously across the twelve seconds of a block,
//               so the one genuinely periodic thing on this chain can drive
//               something that turns instead of something that flips;
//   a SCALE     that adapts, because a field sitting at 0.42 ± 0.02 all session
//               is information the picture never sees at a fixed gain.
//
// All four live here, in one place, so six modules cannot disagree about how
// fast gas moves.

export type EthScaled = {
    /** Slow followers, 0-1. Market conditions: seconds, not frames. */
    gas: number;
    baseFee: number;
    /** Medium followers. What the chain is doing. */
    value: number;
    calldata: number;
    priority: number;
    fullness: number;
    entropy: number;

    /**
     * Autoscaled versions of the same, stretched to the range actually seen.
     *
     * A chain that sits between 0.40 and 0.46 all evening gives a picture no
     * movement at fixed gain. These track a slow running min and max and map
     * the follower across it, so the visual uses its whole range whatever the
     * conditions happen to be — and the mapping widens rather than narrows on
     * an outlier, so a single spike cannot permanently flatten everything.
     */
    gasN: number;
    valueN: number;
    calldataN: number;

    /** 0-1 across the current block, from the measured period. Wraps. */
    blockPhase: number;
    /**
     * Direction, ramped rather than flipped.
     *
     * Block parity alternates, which is the right SOURCE for a reversing turn
     * and the wrong shape for one: a hard ±1 reverses an assembly between two
     * frames. This eases across about two seconds, so the structure slows,
     * stops and comes back the other way — which is what a body with mass does.
     */
    turn: number;

    /** Attack-release envelope on a transaction. Attack 60 ms, release 900 ms. */
    txEnv: number;
    /** Attack-release on a block. Attack 250 ms, release 3.5 s. */
    blockEnv: number;
    /**
     * Iteration count: transactions since mount, and blocks since mount.
     * For anything that should advance rather than oscillate.
     */
    txCount: number;
    blockCount: number;
};

const sc: EthScaled = {
    gas: 0.4, baseFee: 0.4, value: 0.4, calldata: 0.3, priority: 0.5,
    fullness: 0.4, entropy: 0.5,
    gasN: 0.5, valueN: 0.5, calldataN: 0.5,
    blockPhase: 0, turn: 1, txEnv: 0, blockEnv: 0,
    txCount: 0, blockCount: 0,
};

/** Running window per autoscaled field: [lo, hi]. */
const span: Record<string, [number, number]> = {
    gas: [0.35, 0.55], value: [0.3, 0.6], calldata: [0.2, 0.5],
};

let txSeen = 0, blockSeen = 0;
let envTx = 0, envBlk = 0;
let phase = 0;
let turnTarget = 1;
let lastTick = 0;

/**
 * Map a follower across its own running range.
 *
 * The window WIDENS immediately on a new extreme and contracts slowly, so an
 * outlier opens the scale at once and a quiet stretch closes it over minutes.
 * The other way round — contracting fast — would make one spike flatten the
 * picture for as long as it took to decay out.
 */
function autoscale(key: string, v: number, dt: number): number {
    const w = span[key];
    if (v < w[0]) w[0] = v; else w[0] += (v - w[0]) * (1 - Math.exp(-dt / 90)) * 0.15;
    if (v > w[1]) w[1] = v; else w[1] += (v - w[1]) * (1 - Math.exp(-dt / 90)) * 0.15;
    // A floor on the width: below it the mapping amplifies noise into motion,
    // which is the very thing this layer exists to prevent.
    const range = Math.max(0.04, w[1] - w[0]);
    return Math.max(0, Math.min(1, (v - w[0]) / range));
}

export function getEthScaled(): EthScaled {
    return sc;
}

/** Call once per frame, after tickEthLive. */
export function tickEthScaled(): void {
    const t = now();
    const dt = lastTick === 0 ? 1 / 60 : Math.min(0.25, t - lastTick);
    lastTick = t;

    // Followers. Each field gets the time constant its MEANING deserves: gas
    // and base fee are market conditions and should drift over seconds; value
    // and calldata describe the act in front of you and may move faster.
    const k = (tau: number) => 1 - Math.exp(-dt / tau);
    sc.gas      += (eth.gas - sc.gas) * k(5.0);
    sc.baseFee  += (eth.baseFee - sc.baseFee) * k(6.0);
    sc.value    += (eth.value - sc.value) * k(2.0);
    sc.calldata += (eth.calldata - sc.calldata) * k(2.5);
    sc.priority += (eth.priority - sc.priority) * k(3.0);
    sc.fullness += (eth.fullness - sc.fullness) * k(4.0);
    sc.entropy  += (eth.entropy - sc.entropy) * k(4.0);

    sc.gasN = autoscale("gas", sc.gas, dt);
    sc.valueN = autoscale("value", sc.value, dt);
    sc.calldataN = autoscale("calldata", sc.calldata, dt);

    // Envelopes. Attack is what a step does not have, and it is the whole
    // difference between an event you can watch and a value that jumped.
    const atk = (cur: number, target: number, tau: number) =>
        cur + (target - cur) * (1 - Math.exp(-dt / tau));
    envTx = eth.pulse > envTx ? atk(envTx, eth.pulse, 0.06) : atk(envTx, 0, 0.9);
    envBlk = eth.blockPulse > envBlk ? atk(envBlk, eth.blockPulse, 0.25) : atk(envBlk, 0, 3.5);
    sc.txEnv = envTx;
    sc.blockEnv = envBlk;

    // Block phase: continuous across the measured period, so the twelve-second
    // clock drives something that TURNS. Reset on a block rather than free-run,
    // so it stays in step with the chain instead of drifting off it.
    const periodS = 4 + sc.fullness * 0 + (eth.period * 26);
    if (eth.blockAge < 0.1) phase = 0;
    phase += dt / Math.max(4, periodS);
    if (phase > 1) phase -= 1;
    sc.blockPhase = phase;

    // Direction, ramped. Parity is the source; this is the shape.
    turnTarget = eth.parity > 0.5 ? 1 : -1;
    sc.turn += (turnTarget - sc.turn) * k(2.0);

    sc.txCount = txSeen;
    sc.blockCount = blockSeen;
}

/** Counters, bumped from the ingest above. */
export function noteEthTx(): void { txSeen++; }
export function noteEthBlock(): void { blockSeen++; }
