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
