← [README](../../README.en.md) · [Español](../es/diagnostico.md)

# Setup and diagnostics

## Requirements

Node.js + npm, Python 3, `lsof`, `pkill`, and **SuperCollider**. The launcher runs on **Linux and macOS**:

* it finds `sclang` on the `PATH` (Linux: `pacman -S supercollider`, `apt install supercollider`) or, on macOS, inside `/Applications/SuperCollider.app`;
* `SCLANG=/path/to/sclang ./start_ecosystem.sh` forces a specific path — local builds or side-by-side versions;
* it opens the browser with `xdg-open` or `open`, whichever exists; with neither it prints the URL and carries on.

> **Audio devices cannot be enumerated on Linux.** `ServerOptions.outDevices` goes through a primitive that only exists on macOS and Windows; scsynth reaches the card through JACK/ALSA and there is nothing to enumerate. Detection is therefore best-effort: with no list the system default device is used in stereo, and the MOTU 828x 4-channel spatial mode has to be asked for explicitly by routing through JACK. That is not an error — but failing to catch it was, because it aborted the whole of `1_server_config.scd` and took the `numBuffers`/`memSize`/`maxNodes` immediately below it along, which is the memory the corpus loads into.

The Ethereum scraper needs its own venv:

```bash
python3 -m venv eth_listener/venv
source eth_listener/venv/bin/activate
pip install web3 python-osc
```

## Run the ecosystem

```bash
./start_ecosystem.sh
```

Launches all services: nw_wrld, parliament-bridge, SuperCollider, Python ETH scraper. `LASER=1` adds the laser bridge (see [Laser projection](laser.md)).

## Diagnostic Sweep Test

```bash
cd nw_wrld_local && node diag-sweep.js
```

Sends the 22 parameters of rows 1–4 through the bridge (0 → 1 → 0.5), then runs a continuous volume LFO. It does not cover the full 71-parameter registry: it is a test that the browser→bridge→SC path is alive, not an exhaustive sweep.

## Live engine monitor

The single most useful tool when something "sounds wrong". SuperCollider posts one line every 2 s describing what it is actually receiving and doing:

```bash
tail -f sclang_log.txt | grep MON
```

```
[MON] flags:B-E---S  bells:47/gate:310/cap:12/bar:88  env(atk/dec/amp):0.81/0.83/0.071
      prio:0.264 ent:0.517 dens:0.312  blk:25670857 txN:290 idx:289 base:0.051  synths:9
```

| Field | Answers |
|---|---|
| `bells` | pads spawned, and skipped *by which gate*: `gate` time-gate, `cap` synth ceiling, `drop` queue overflow; `q:` shows pending/total queued |
| `kick` `perc` `err` | beat-engine spawns, and any errors the guarded loop caught and recovered from |
| `tg` `amp` | transport gain (`0.05` = Stop Parliament latched) and the performer's master level |
| `outPk` `gr` | peak level reaching the limiter, and how hard it is pulling back |
| `env` | atk/dec/amp of the last pad — if these stop being identical, the envelope is responding to the transaction |
| `prio` `ent` `dens` | live chain-derived values; a constant here means a mapping has saturated |
| `blk` `txN` `idx` `base` | whether the enriched `eth_sonify.py` payload is arriving at all |

Three OSC controls, from anything that can reach SC on **57120**:

| Address | Effect |
|---|---|
| `/diag/osctrace 1` | `OSCFunc.trace` — post **every** inbound OSC message; the definitive test of whether a control reaches SC |
| `/diag/monitor 0` | silence the `[MON]` line |
| `/diag/reset` | zero the pad counters to measure a fresh window |

## Boot sanity check

The registry banner in `sclang_log.txt` confirms the engine loaded the current sources — worth checking first when a change appears to have no effect, since `start_sonification.scd` reads all sixteen `.scd` files from disk **at boot**:

```
Parameter registry loaded: 71 parameters, 75 OSC routes, 64 MIDI CCs.
Master limiter active (2 ch, ceiling 0.92) — output can no longer clip.
=== CONTROL BUS SETUP COMPLETE ===
```

The launcher waits up to 60 s for that last line before opening the UI. A cold start compiles the SuperCollider class library first and then loads the corpus buffers, so taking a while is normal; what is not normal is `sclang` dying on the way, and in that case the launcher says so and stops waiting.
