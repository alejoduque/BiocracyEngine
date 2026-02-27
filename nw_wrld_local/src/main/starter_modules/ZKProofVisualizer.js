/*
@nwWrld name: ZKProofVisualizer
@nwWrld category: Text
@nwWrld imports: ModuleBase
*/

class ZKProofVisualizer extends ModuleBase {
  static methods = [
    {
      name: "match",
      executeOnLoad: false,
      options: [
        {
          name: "matchCount",
          defaultVal: 6,
          type: "number",
          min: 0,
          max: 30,
          allowRandomization: true,
        },
      ],
    },
  ];

  constructor(container) {
    super(container);

    this.name = ZKProofVisualizer.name;
    this.columns = [];
    this.pairs = new Map();
    this.isAnimating = false;
    this.lastSwapTime = 0;
    this._bridgeWS = null;
    this._bridgeReady = false;

    // Modulation parameters from SC sliders
    this.p_speedOff = 0;
    this.p_colorHueOff = 0;
    this.p_scaleObj = 1.0;
    this.p_fontSize = 8;
    this.p_opacity = 1.0;

    this._connectBridge();
    this.init();
  }

  init() {
    const wordPairs = [
      ["Ψ(x₁, t₀) = Σe^(-x₁²)", "Ξ(x₁, t₀) = √π/(2t₀)"],
      ["ℤₙ = ⌊Φ(k)²/Ψ(k)⌋", "Λₙ = ⌊(Φ(k)² − Ψ(k))⌋"],
      ["F₀(x) = ∫₀ⁿ e^(-kx) dx", "H₀(x) = (1 − e^(-kx))/k"],
      ["Σ{𝔼[X]} = Nμ", "Σ{𝔼[Y]} = Nμ"],
      ["f'(x) = lim(h→0)(f(x+h)−f(x))/h", "∂f/∂x = (f(x+h)−f(x))/h as h→0"],
      ["|A| = det(A)", "|B| = det(B) where B ≡ Aᵀ"],
      ["P(A ∩ B) = P(A)P(B)", "P(A|B)P(B) = P(A ∩ B)"],
      ["H(X) = -Σp(x)log₂p(x)", "H(Y) = -Σq(y)log₂q(y)"],
      ["Σf(i) = i(i+1)/2", "Σg(j) = j(j+1)/2"],
      ["aₙ = rⁿ/(1 − r)", "Sₙ = rⁿ/(1 − r) for |r| < 1"],
      ["∂²u/∂t² = c²∇²u", "u(x, t) = sin(kx−ωt) satisfies"],
      ["λ₁ = 1/n Σ(x−x̄)²", "σ² = λ₁ for unbiased estimator"],
      ["E[X] = ∫x f(x)dx", "⟨X⟩ = ∫x f(x)dx"],
      ["p(x) = (e^(-λ)λ^x)/x!", "P(X=x) = (e^(-λ)λ^x)/x!"],
      ["e^(ix) = cos(x) + i sin(x)", "cis(x) = cos(x) + i sin(x)"],
    ];

    wordPairs.forEach(([word1, word2]) => {
      this.pairs.set(word1, word2);
      this.pairs.set(word2, word1);
    });

    const html = `
      <div
      class="font-monospace" 
      style="
        display: flex;
        justify-content: space-around;
        align-items: center;
        width: 100%;
        height: 100%;
        font-family: monospace;
        overflow: hidden;
        font-size: ${this.p_fontSize}px;
        opacity: ${this.p_opacity};
        transform: scale(${this.p_scaleObj});
      ">
        ${Array(1)
        .fill()
        .map(
          () => `
          <div class="zkp-column" style="
            margin: 4px;
            padding: 8px;
            overflow: hidden;
            position: relative;
            width: 100%;
          "></div>
        `
        )
        .join("")}
      </div>
    `;

    this.elem.insertAdjacentHTML("beforeend", html);
    this.columns = Array.from(this.elem.querySelectorAll(".zkp-column"));

    this.initializeColumns();
    this.startRapidAnimation();
  }

  initializeColumns() {
    this.columns.forEach((column) => {
      const allWords = [];
      Array.from(this.pairs.keys()).forEach((word) => {
        allWords.push(word);
        allWords.push(this.pairs.get(word));
      });

      const columnWords = Array(60)
        .fill()
        .map(() => allWords[Math.floor(Math.random() * allWords.length)]);

      columnWords.forEach((word) => {
        const wordWrapper = document.createElement("div");
        wordWrapper.style.cssText = `
              width: 100%;
              display: block;
              padding: 4px;
              margin: 2px;
          `;

        const wordElem = document.createElement("div");
        wordElem.textContent = word;
        wordElem.style.cssText = `
              transition: all 0ms;
              color: #fff;
              display: inline;
          `;

        wordWrapper.appendChild(wordElem);
        column.appendChild(wordWrapper);
      });
    });
  }

  startRapidAnimation() {
    if (this.isAnimating) return;
    this.isAnimating = true;

    const swapWords = () => {
      const currentTime = performance.now();

      const threshold = Math.max(2, 20 - this.p_speedOff);

      if (currentTime - this.lastSwapTime >= threshold) {
        this.columns.forEach((column) => {
          for (let i = 0; i < 5; i++) {
            const words = Array.from(column.children);
            const idx1 = Math.floor(Math.random() * words.length);
            const idx2 = Math.floor(Math.random() * words.length);

            if (idx1 !== idx2) {
              const word1 = words[idx1];
              const word2 = words[idx2];

              if (idx1 < idx2) {
                column.insertBefore(word2, word1);
                column.insertBefore(word1, words[idx2 + 1]);
              } else {
                column.insertBefore(word1, word2);
                column.insertBefore(word2, words[idx1 + 1]);
              }
            }
          }
        });

        this.lastSwapTime = currentTime;
      }

      if (this.isAnimating) {
        requestAnimationFrame(swapWords);
      }
    };

    requestAnimationFrame(swapWords);
  }

  match({ matchCount = 6 } = {}) {
    const column = this.columns[0];
    const allWords = Array.from(column.querySelectorAll(".zkp-column div div"));
    const parsed = Math.floor(Number(matchCount));
    const fallback = 6;
    const requested = Number.isFinite(parsed) ? parsed : fallback;
    const maxPairs = Math.floor(allWords.length / 2);
    const safeMatchCount = Math.max(0, Math.min(requested, maxPairs));
    const usedWords = new Set();
    const matches = [];

    while (
      matches.length < safeMatchCount &&
      usedWords.size < allWords.length
    ) {
      const word = allWords[Math.floor(Math.random() * allWords.length)];
      const wordText = word.textContent;

      if (!usedWords.has(wordText)) {
        const pairText = this.pairs.get(wordText);
        const pairElement = allWords.find(
          (el) => el.textContent === pairText && !usedWords.has(el.textContent)
        );

        if (pairElement) {
          matches.push([word, pairElement]);
          usedWords.add(wordText);
          usedWords.add(pairText);
        }
      }
    }

    matches.forEach(([word1, word2]) => {
      word1.style.background = `hsla(${this.p_colorHueOff}, 100%, 50%, 0.8)`;
      word2.style.background = `hsla(${(this.p_colorHueOff + 180) % 360}, 100%, 50%, 0.8)`;
      word1.style.color = "#000";
      word2.style.color = "#000";
    });

    setTimeout(() => {
      matches.forEach(([word1, word2]) => {
        word1.style.background = "transparent";
        word2.style.background = "transparent";
        word1.style.color = "#fff";
        word2.style.color = "#fff";
      });
    }, 75);
  }

  // ── Bridge WebSocket (browser → SC via parliament-bridge) ──────────────────
  _connectBridge() {
    try {
      this._bridgeWS = new WebSocket("ws://localhost:3334");
      this._bridgeWS.onopen = () => {
        this._bridgeReady = true;
        console.log(`[${this.name}] Bridge WS connected ✅`);
      };
      this._bridgeWS.onclose = () => {
        this._bridgeReady = false;
        console.warn(`[${this.name}] Bridge WS closed, retrying in 3s...`);
        setTimeout(() => this._connectBridge(), 3000);
      };
      this._bridgeWS.onerror = () => { this._bridgeReady = false; };
      this._bridgeWS.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "method-trigger" && msg.data) {
            const methodName = msg.data.channelName.replace("/ch/", "");
            if (typeof this[methodName] === "function") {
              const val = msg.data.velocity || 0;
              let options = { isRemote: true };

              // Map velocity to expected arguments for this module
              if (methodName === "match") {
                options = { matchCount: val * 10, isRemote: true };
              } else if (methodName === "updateConsensus") {
                options = { gasValue: val, isRemote: true };
              }

              this[methodName](options);
            }
          }
        } catch (e) { console.error(`[${this.name}] Error parsing bridge message:`, e); }
      };
    } catch (e) {
      console.warn(`[${this.name}] Could not connect to bridge:`, e);
    }
  }

  sendToSC(address, value) {
    if (!this._bridgeWS || !this._bridgeReady) return;
    this._bridgeWS.send(JSON.stringify({ direction: "toSC", address, args: [value] }));
  }

  // --- MAPPED DATA METHODS ---
  // Received from SC via /bio/consensus
  updateConsensus({ gasValue, isRemote = false }) {
    // gasValue is expected to be mapped 0.0-1.0 from SC
    // We use it to trigger more aggressive matching and faster animation
    const intensity = Math.max(1, Math.floor(gasValue * 30));

    // Temporarily speed up swapping
    const currentSwapTime = this.lastSwapTime;
    this.lastSwapTime -= 50; // Force immediate update

    // Trigger visual match based on gas intensity
    this.match({ matchCount: intensity });
    console.log(`[${this.name}] Consensus Updated: Gas intensity ${intensity}`);
  }

  // Reactive UI Methods (0.0 to 1.0 coming from SC Sliders)
  setVolume({ velocity }) {
    this.p_scaleObj = 0.5 + (velocity * 2.0);
    if (this.elem.children[0]) this.elem.children[0].style.transform = `scale(${this.p_scaleObj})`;
  }
  setPitchShift({ velocity }) { this.p_speedOff = velocity * 18.0; } // Increase swap speed
  setTimeDilation({ velocity }) { } // Already mapped globally
  setSpectralShift({ velocity }) { this.p_colorHueOff = velocity * 360; }
  setSpatialSpread({ velocity }) {
    this.p_fontSize = 4 + (velocity * 24);
    if (this.elem.children[0]) this.elem.children[0].style.fontSize = `${this.p_fontSize}px`;
  }
  setTextureDepth({ velocity }) {
    this.p_opacity = 0.1 + (velocity * 0.9);
    if (this.elem.children[0]) this.elem.children[0].style.opacity = this.p_opacity.toString();
  }
  setAtmosphereMix({ velocity }) { }
  setMemoryFeed({ velocity }) { }
  setHarmonicRich({ velocity }) { }
  setResonantBody({ velocity }) { }

  destroy() {
    this.isAnimating = false;
    this.columns = [];
    this.pairs.clear();
    super.destroy();
  }
}

export default ZKProofVisualizer;
