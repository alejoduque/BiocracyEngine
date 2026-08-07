// Parliament State Store
// Receives OSC data from SuperCollider via WebSocket bridge
// Provides reactive state for the ParliamentStage visualizer

const WS_URL = "ws://localhost:3334";

// ─── State Shape ───

export interface SpeciesState {
  presence: number;
  activity: number;
  votes: number;
  freq: number;
}

export interface EdnaState {
  biodiversity: number;
  validation: number;
}

export interface FungiState {
  chemical: number;
  connectivity: number;
  coverage: number;
}

export interface AIState {
  consciousness: number;
  optimization: number;
}

export interface ParliamentState {
  phase: number; // 0-1 within 120s rotation
  consensus: number;
  consensusWave: number;
  rotation: number;
  votes: number;

  species: SpeciesState[]; // 5 agents
  edna: EdnaState[]; // 8 agents
  fungi: FungiState[]; // 4 agents
  ai: AIState;

  // Eco signals from sonETH
  eco: {
    co2: number;
    mycoPulse: number;
    phosphorus: number;
    nitrogen: number;
  };

  // Events (reset after consumption)
  events: {
    voteResult: { consensus: number; passed: boolean; yes: number; total: number } | null;
    rotationComplete: boolean;
  };

  connected: boolean;
}

// ─── Default State ───

function createDefaultState(): ParliamentState {
  return {
    phase: 0,
    consensus: 0.5,
    consensusWave: 0.5,
    rotation: 1.0,
    votes: 26,
    species: Array.from({ length: 5 }, () => ({
      presence: 0.5,
      activity: 0.5,
      votes: 0,
      freq: 440,
    })),
    edna: Array.from({ length: 8 }, () => ({
      biodiversity: 0.5,
      validation: 0.5,
    })),
    fungi: Array.from({ length: 4 }, () => ({
      chemical: 0.5,
      connectivity: 0.5,
      coverage: 20,
    })),
    ai: { consciousness: 0.5, optimization: 64 },
    eco: { co2: 0, mycoPulse: 0, phosphorus: 0, nitrogen: 0 },
    events: { voteResult: null, rotationComplete: false },
    connected: false,
  };
}

// ─── Store Singleton ───

type Listener = (state: ParliamentState) => void;

class ParliamentStore {
  state: ParliamentState;
  private listeners: Set<Listener> = new Set();
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.state = createDefaultState();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) {
      fn(this.state);
    }
  }

  connect() {
    if (this.ws) return;
    this.tryConnect();
  }

  private tryConnect() {
    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this.state.connected = true;
        this.notify();
        console.log("[parliament] Connected to bridge");
      };

      this.ws.onmessage = (event) => {
        try {
          const { address, args } = JSON.parse(event.data as string) as {
            address: string;
            args: number[];
          };
          this.applyOSC(address, args);
        } catch {}
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.state.connected = false;
        this.notify();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.tryConnect();
    }, 2000);
  }

  private applyOSC(address: string, args: number[]) {
    const s = this.state;

    // Parliament-level
    if (address === "/parliament/phase") {
      s.phase = args[0];
    } else if (address === "/parliament/consensus") {
      s.consensus = args[0];
    } else if (address === "/parliament/consensusWave") {
      s.consensusWave = args[0];
    } else if (address === "/parliament/rotation") {
      s.rotation = args[0];
    } else if (address === "/parliament/votes") {
      s.votes = args[0];
    }

    // Species
    else if (address === "/agent/species/state") {
      const id = args[0];
      if (s.species[id]) {
        s.species[id].presence = args[1];
        s.species[id].activity = args[2];
        s.species[id].votes = args[3];
        s.species[id].freq = args[4];
      }
    }

    // eDNA
    else if (address === "/agent/edna/state") {
      const id = args[0];
      if (s.edna[id]) {
        s.edna[id].biodiversity = args[1];
        s.edna[id].validation = args[2];
      }
    }

    // Fungi
    else if (address === "/agent/fungi/state") {
      const id = args[0];
      if (s.fungi[id]) {
        s.fungi[id].chemical = args[1];
        s.fungi[id].connectivity = args[2];
        s.fungi[id].coverage = args[3];
      }
    }

    // AI
    else if (address === "/agent/ai/state") {
      s.ai.consciousness = args[0];
      s.ai.optimization = args[1];
    }

    // Eco signals
    else if (address === "/eco/co2") {
      s.eco.co2 = args[0];
    } else if (address === "/eco/mycoPulse") {
      s.eco.mycoPulse = args[0];
    } else if (address === "/eco/phosphorus") {
      s.eco.phosphorus = args[0];
    } else if (address === "/eco/nitrogen") {
      s.eco.nitrogen = args[0];
    }

    // Events
    else if (address === "/parliament/vote/result") {
      s.events.voteResult = {
        consensus: args[0],
        passed: args[1] === 1,
        yes: args[2],
        total: args[3],
      };
    } else if (address === "/parliament/rotation/complete") {
      s.events.rotationComplete = true;
    }

    // Live ETH-driven engine signal. SC actually emits /bio/* (see
    // 5_beat_engine.scd / 6_osc_handlers.scd → ~visualsDest), NOT the /eco/*
    // and /agent/* the handlers above expect (those have no emitter anywhere).
    // Without this, Eco Signals telemetry and every ecosystem module's eco
    // coupling stay starved while the engine is plainly running. Mapped here
    // so the visuals breathe with real transaction throughput.
    //   /bio/nutrient  ∝ transactionInfluence (ETH pressure)
    //   /bio/density   ∝ transaction density
    //   /bio/consensus ∝ density-derived activity wave
    else if (address === "/bio/nutrient") {
      const v = args[0] ?? 0;
      s.eco.co2 = v * 127;
      s.eco.mycoPulse = v * 4;
      // Fungi.chem is one of the six BioToken factors and it had no feed at
      // all: /agent/fungi/state has no emitter, and its control sliders were
      // removed with the Fungi Networks panel, so it sat at its 0.5 default
      // for every session and quietly halved the token forever. The mycelial
      // pulse this same message already carries is the nearest thing the
      // instrument actually measures, so the factor now moves with it.
      for (const f of s.fungi) f.chemical = Math.max(0, Math.min(1, v));
    } else if (address === "/bio/density") {
      const v = args[0] ?? 0;
      s.eco.nitrogen = v * 127;
      s.eco.phosphorus = v * 100;
      // Same story for AI.optim, frozen at 64/127. Transaction density is the
      // optimisation pressure the engine is under; that is what it now reads.
      s.ai.optimization = Math.max(0, Math.min(1, v)) * 127;
    } else if (address === "/bio/consensus") {
      if (typeof args[0] === "number") s.consensusWave = args[0];
    }

    this.notify();
  }

  // Apply a slider/button value immediately to local state so visuals respond
  // without waiting for SC broadcast round-trip.
  // Mirrors the same paths as applyOSC but driven by browser sliders.
  patchFromSlider(address: string, args: number[]) {
    this.applyOSC(address, args);
  }

  // Public notify — allows external code to trigger subscriber updates
  // after directly patching state fields not covered by applyOSC paths.
  notifyListeners() {
    this.notify();
  }

  // Consume one-shot events (call after reading them in render loop)
  consumeEvents() {
    this.state.events.voteResult = null;
    this.state.events.rotationComplete = false;
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const parliamentStore = new ParliamentStore();
export default parliamentStore;
