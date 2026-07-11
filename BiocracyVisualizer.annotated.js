/*
@nwWrld name: BiocracyVisualizer
@nwWrld category: 2D
@nwWrld imports: ModuleBase, p5
*/

/* ════════════════════════════════════════════════════════════════════════
 * PUENTE CONCEPTUAL — del Benevolence Engine al BiocracyEngine
 * ------------------------------------------------------------------------
 * Este archivo es, además de código, una superficie donde confluyen dos
 * lenguajes: el del ejecutable y el de la filosofía. La idea es sencilla.
 *
 * En 2006 Bill Seaman y el físico Otto Rössler diseñaron el "Benevolence
 * Engine": una máquina cibernética con partes bien definidas —un sensor
 * (Polysensing), un buffer de presente que se desvanece en ~3 s, una
 * "Gran Pantalla" que imagina el mundo, un Generador de Campo de Fuerza
 * que hace las veces de Voluntad, un Buffer de Solapamiento que simula la
 * acción antes de ejecutarla, una Memoria de Largo Plazo y unos motores—.
 * Su corazón no era técnico sino ético, tomado de Heinz von Foerster:
 * "A está mejor si B está mejor". La benevolencia no se programa dentro de
 * una cosa; nace de la RELACIÓN entre dos sistemas que se cuidan.
 *
 * El BiocracyEngine hereda esa forma. Cada parte de este visualizador tiene
 * un equivalente en aquella máquina, y el comentario de cada sección lo
 * nombra. Donde Rössler aporta una idea, también se cita:
 *
 *   - INTERFAZ (Rössler): "vivimos siempre solo en una interfaz". El puente
 *     WebSocket/OSC de abajo no es un detalle técnico: es el lugar mismo
 *     donde navegador, sonido y bosque se tocan.
 *   - ENDOFÍSICA (Rössler): se observa el mundo DESDE DENTRO, sin un punto
 *     de vista externo. Por eso esto no es un tablero que administra el
 *     bosque desde arriba, sino un órgano dentro del sistema que dibuja.
 *   - MÓNADA / NÓMADA (Rössler): los nodos son mónadas (seres solos); las
 *     partículas que viajan entre ellos son nómadas que llevan mensaje y
 *     alimento. La red los enlaza sin fundirlos.
 *   - LAMPSACUS (Rössler): su utopía de una red donde cada ser tiene
 *     dirección, voz e identidad. Dar al bosque una dirección OSC (/soneth/*)
 *     y una voz audible es Lampsacus a escala de una reserva.
 *   - EXTERIORIDAD HORIZONTAL Y JUSTICIA (Rössler): tener el poder de
 *     representar al otro y NO abusar de él. Aquí ese poder se limita con
 *     reciprocidad y opacidad: el bosque nunca se reduce a un número canjeable.
 *
 * Fuentes: Seaman & Rössler, *Neosentience | The Benevolence Engine* (2011);
 * Seaman, "Neosentience and the Abstraction of Abstraction", *Systems* 1(3)
 * (2013); Rössler, "Endonomadology" / *Endophysics* (1998); von Foerster,
 * *Observing Systems* (1981). Véase Cap. 4 §6 de la monografía.
 * ════════════════════════════════════════════════════════════════════════ */

class BiocracyVisualizer extends ModuleBase {
  static methods = [
    // ── DISPARADORES BIOGEOQUÍMICOS ──────────────────────────────────────
    // En la máquina de la benevolencia estos serían "afecciones": eventos
    // del mundo que el sistema siente y a los que responde. Aquí cada uno
    // es un acto de intercambio dentro de la red (ver trigger* más abajo).
    {
      name: "triggerCO2",
      executeOnLoad: false,
      options: [
        { name: "amount", defaultVal: 50, type: "number", min: 10, max: 200 }
      ]
    },
    {
      name: "triggerMycoPulse",
      executeOnLoad: false,
      options: [
        { name: "intensity", defaultVal: 1, type: "number", min: 0.1, max: 5 }
      ]
    },
    {
      name: "triggerPhosphorus",
      executeOnLoad: false,
      options: [
        { name: "amount", defaultVal: 30, type: "number", min: 10, max: 100 }
      ]
    },
    {
      name: "triggerNitrogen",
      executeOnLoad: false,
      options: [
        { name: "amount", defaultVal: 30, type: "number", min: 10, max: 100 }
      ]
    },
    // --- SC HEADLESS PARAMETERS ---
    // ⟶ PUENTE [Motores / Mot.]: en el diagrama del Benevolence Engine, los
    // motores son la salida que actúa sobre el mundo. Aquí el "motor" es el
    // sonido: cada parámetro se envía por OSC a SuperCollider (oscPath). La
    // máquina no mueve un brazo robótico; mueve aire. Esa es su acción.
    {
      name: "setVolume",
      executeOnLoad: true,
      options: [
        { name: "level", defaultVal: 0.3, type: "number", min: 0.0, max: 1.0, isOscOutput: true, oscPath: "/control/volume" }
      ]
    },
    {
      name: "setFilterCutoff",
      executeOnLoad: true,
      options: [
        { name: "cutoff", defaultVal: 0.5, type: "number", min: 0.0, max: 1.0, isOscOutput: true, oscPath: "/control/filterfreq" }
      ]
    },
    {
      name: "setFMRatio",
      executeOnLoad: true,
      options: [
        { name: "ratio", defaultVal: 0.2, type: "number", min: 0.0, max: 1.0, isOscOutput: true, oscPath: "/control/fmratio" }
      ]
    },
    {
      name: "setReverbMix",
      executeOnLoad: true,
      options: [
        { name: "reverb", defaultVal: 0.3, type: "number", min: 0.0, max: 1.0, isOscOutput: true, oscPath: "/control/reverbmix" }
      ]
    },
    {
      name: "setDelayMix",
      executeOnLoad: true,
      options: [
        // ⟶ PUENTE [Buffer / memoria del presente]: el "delay" (memoryfeed,
        // ver setDelayMix abajo) es el eco que retiene el sonido reciente.
        // Es el primo sonoro del Buffer B del Benevolence Engine, cuya
        // profundidad temporal decae en ~3 s: un presente que se desvanece.
        { name: "delay", defaultVal: 0.2, type: "number", min: 0.0, max: 1.0, isOscOutput: true, oscPath: "/control/delaymix" }
      ]
    }
  ];

  constructor(container) {
    super(container);
    this.myp5 = null;
    this.particles = [];      // ⟶ PUENTE [Buffer B / nómadas]: partículas con
    this.mycoPulses = [];     //   vida finita = el presente que se desvanece;
                              //   en tránsito entre nodos = los nómadas de Rössler.
    this._bridgeWS = null;
    this._bridgeReady = false;

    // ── Nodos del ecosistema ────────────────────────────────────────────
    // ⟶ PUENTE [Mónadas]: cada nodo es una "mónada" en el sentido de Rössler
    // (un ser solo, con su lugar). El árbol capta CO₂; el hongo es el HUB que
    // redistribuye; las plantas reciben. Ninguno se funde con el otro: se
    // relacionan a través de la red. Esa relación —y no los nodos por
    // separado— es donde puede nacer la benevolencia.
    this.nodes = {
      tree: { x: 0, y: -150, label: "Árbol (Captor CO2)", type: "surface" },
      mycorrhizaCenter: { x: 0, y: 50, label: "Red Micorrícica Hub", type: "underground" },
      plantA: { x: -150, y: -50, label: "Planta A", type: "surface" },
      plantB: { x: 150, y: -50, label: "Planta B", type: "surface" }
    };

    this._connectBridge();
    this.init();
  }

  // ── Bridge WebSocket (browser → SC via parliament-bridge) ──────────────────
  // ⟶ PUENTE [Interfaz (Rössler) + Polysensing (Benevolence Engine) + Lampsacus]:
  // Este socket es LA INTERFAZ en el sentido fuerte de Rössler: el lugar
  // "entre" donde navegador, sonido y bosque se encuentran; no vivimos fuera
  // de él, vivimos en él. Es también la entrada sensible (Polysensing) por
  // donde llegan los eventos del mundo. Y es Lampsacus: al abrir una dirección
  // (ws://localhost:3334) por la que el bosque envía y recibe, se le concede
  // —como soñaba Rössler para cada ser— una dirección, una voz y una identidad
  // en la red. La "parliament-bridge" es, literalmente, el puente del Parlamento
  // de lo Vivo.
  _connectBridge() {
    try {
      this._bridgeWS = new WebSocket("ws://localhost:3334");
      this._bridgeWS.onopen = () => {
        this._bridgeReady = true;
        console.log("[Biocracy] Bridge WS connected ✅");
      };
      this._bridgeWS.onclose = () => {
        this._bridgeReady = false;
        console.warn("[Biocracy] Bridge WS closed, retrying in 3s...");
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
              // ⟶ PUENTE [Copia eferente / re-aferencia (G)]: la bandera
              // isRemote distingue lo que el sistema causó él mismo de lo
              // que viene de afuera. Es la "copia eferente" de la
              // cibernética: sin ella la máquina confundiría su propia voz
              // con la del mundo y entraría en un bucle. Saber "esto lo hice
              // yo" es condición de tener un punto de vista situado.
              let options = { isRemote: true }; // Flag to prevent feedback loop
              if (methodName.startsWith("trigger")) {
                Object.assign(options, { amount: val * 100, intensity: val });
              } else if (methodName.startsWith("set")) {
                Object.assign(options, { level: val, cutoff: val, ratio: val, reverb: val, delay: val });
              }
              this[methodName](options);
            }
          }
        } catch (e) { console.error("[Biocracy] Error parsing bridge message:", e); }
      };
    } catch (e) {
      console.warn("[Biocracy] Could not connect to bridge:", e);
    }
  }

  // Send an OSC message to SC via parliament-bridge WebSocket
  // ⟶ PUENTE [Motores / Afección]: enviar a SuperCollider es el acto motor
  // del sistema —su manera de devolverle algo al mundo (sonido)—. El prefijo
  // /soneth/ (son + eth, sonido por ethernet) confirma que el canal es la red.
  sendToSC(address, value) {
    if (!this._bridgeWS || !this._bridgeReady) {
      console.warn("[Biocracy] Bridge not ready — cannot send:", address, value);
      return;
    }
    this._bridgeWS.send(JSON.stringify({ direction: "toSC", address, args: [value] }));
    console.log(`[Biocracy] browser→SC  ${address} = ${value}`);
  }


  // ⟶ PUENTE [Gran Pantalla = Imaginación]: el caption del diagrama de Seaman
  // y Rössler reza "El mundo como Voluntad y Representación" (Schopenhauer).
  // p5 es aquí la Representación/Imaginación: la pantalla donde el sistema se
  // figura el mundo que escucha. No es el mundo; es su modelo dentro del
  // sistema —de nuevo, endofísica: una imagen vista desde dentro—.
  init() {
    if (!p5) return;

    this.myp5 = new p5((p) => {
      p.setup = () => {
        p.createCanvas(this.elem.offsetWidth, this.elem.offsetHeight);
        p.textAlign(p.CENTER, p.CENTER);
        // Desplazar al centro
      };

      p.draw = () => {
        p.clear();
        p.push();
        p.translate(p.width / 2, p.height / 2);

        // Dibujar red estática (Hilos micorrícicos)
        // ⟶ PUENTE: los hilos del hongo son las relaciones de exterioridad
        // (DeLanda) y, a la vez, los canales por donde fluye la reciprocidad.
        p.stroke(100, 150, 100, 100);
        p.strokeWeight(2);
        p.line(this.nodes.tree.x, this.nodes.tree.y + 40, this.nodes.mycorrhizaCenter.x, this.nodes.mycorrhizaCenter.y);
        p.line(this.nodes.mycorrhizaCenter.x, this.nodes.mycorrhizaCenter.y, this.nodes.plantA.x, this.nodes.plantA.y + 20);
        p.line(this.nodes.mycorrhizaCenter.x, this.nodes.mycorrhizaCenter.y, this.nodes.plantB.x, this.nodes.plantB.y + 20);

        // Dibujar pulsos de micorriza
        for (let i = this.mycoPulses.length - 1; i >= 0; i--) {
          let pulse = this.mycoPulses[i];
          p.noFill();
          p.stroke(0, 255, 100, pulse.life * 255);
          p.strokeWeight(pulse.intensity * 2);
          p.circle(this.nodes.mycorrhizaCenter.x, this.nodes.mycorrhizaCenter.y, pulse.radius);
          pulse.radius += 5;
          pulse.life -= 0.02;   // ⟶ el pulso decae: presente que se va (Buffer B).
          if (pulse.life <= 0) this.mycoPulses.splice(i, 1);
        }

        // Dibujar partículas de nutrientes o CO2
        for (let i = this.particles.length - 1; i >= 0; i--) {
          let pt = this.particles[i];

          let target = pt.target;
          let dx = target.x - pt.x;
          let dy = target.y - pt.y;
          let dist = p.sqrt(dx * dx + dy * dy);

          if (dist < 5) {
            this.particles.splice(i, 1);
            continue;
          }

          // ⟶ PUENTE [Generador de Campo de Fuerza = Voluntad]: la partícula
          // es atraída hacia su destino. Ese vector de atracción es, en
          // miniatura, el "Force Field Generator" que en el Benevolence Engine
          // hace las veces de Voluntad (y de "emociones sintéticas"). La
          // dirección del deseo del sistema se vuelve, aquí, movimiento.
          pt.x += (dx / dist) * pt.speed;
          pt.y += (dy / dist) * pt.speed;

          p.noStroke();
          p.fill(pt.color);
          p.circle(pt.x, pt.y, pt.size);
        }

        // Dibujar Nodos (las mónadas)
        this.drawNode(p, this.nodes.tree, p.color(50, 200, 50));
        this.drawNode(p, this.nodes.plantA, p.color(100, 255, 100));
        this.drawNode(p, this.nodes.plantB, p.color(100, 255, 100));
        this.drawNode(p, this.nodes.mycorrhizaCenter, p.color(200, 150, 50)); // Hongo

        p.pop();
      };

      p.windowResized = () => {
        p.resizeCanvas(this.elem.offsetWidth, this.elem.offsetHeight);
      };
    }, this.elem);

    this.show();
  }

  drawNode(p, node, col) {
    p.fill(col);
    p.noStroke();
    p.circle(node.x, node.y, 40);
    p.fill(255);
    p.textSize(12);
    p.text(node.label, node.x, node.y - 30);
  }

  // --- MÉTODOS DISPARADOS VÍA OSC / SEQUENCER ---
  // ⟶ PUENTE [Reciprocidad de von Foerster: "A está mejor si B está mejor"]:
  // Esta es la sección donde la ética del Benevolence Engine deja de ser
  // metáfora y se vuelve ecología. La red micorrícica es un intercambio
  // mutuo: el árbol entrega carbono (CO₂ fijado) al hongo; el hongo entrega
  // fósforo y nitrógeno a las plantas; las plantas alimentan al hongo. Cada
  // quien está mejor si el otro está mejor. La "benevolencia" no vive en
  // ningún nodo: vive en el flujo entre ellos. Los cuatro triggers de abajo
  // son, leídos así, los cuatro gestos de ese cuidado recíproco.

  triggerCO2({ amount = 50 }) {
    // Captura de carbono: del dosel hacia el árbol. El árbol "recibe" del aire.
    for (let i = 0; i < amount / 10; i++) {
      this.particles.push({
        x: this.nodes.tree.x + (Math.random() * 100 - 50),
        y: this.nodes.tree.y - 200 - (Math.random() * 100),
        target: { x: this.nodes.tree.x, y: this.nodes.tree.y },
        color: [200, 255, 255, 200], // Cyan / Light Blue
        size: 4 + Math.random() * 4,
        speed: 2 + Math.random() * 2
      });
    }
  }

  triggerMycoPulse({ intensity = 1 }) {
    // Pulso de información en el hub micorrícico
    // ⟶ El hongo "habla": un pulso que coordina a las mónadas. Es el latido
    // de la red —la prueba de que la relación está viva—.
    this.mycoPulses.push({
      radius: 10,
      intensity: intensity,
      life: 1.0
    });

    // Enviar algo de energía por las ramas
    // De Tree a Hub: el árbol devuelve carbono al hongo (lado A→B del intercambio).
    this.createFlow(this.nodes.tree, this.nodes.mycorrhizaCenter, [255, 255, 255, 150], 5);
  }

  triggerPhosphorus({ amount = 30 }) {
    // Fósforo fluye del Hub a la Planta A (lado B→A: el hongo devuelve nutriente).
    this.createFlow(this.nodes.mycorrhizaCenter, this.nodes.plantA, [255, 100, 0, 255], amount / 5); // Naranja
  }

  triggerNitrogen({ amount = 30 }) {
    // Nitrógeno fluye del Hub a la Planta B
    this.createFlow(this.nodes.mycorrhizaCenter, this.nodes.plantB, [100, 100, 255, 255], amount / 5); // Azul
  }

  // ⟶ PUENTE [FFG = Voluntad]: createFlow ES el campo de fuerza. Da a un
  // puñado de nómadas un origen, un destino y una velocidad: convierte un
  // intercambio ecológico en un vector de deseo visible.
  createFlow(source, target, color, count) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: source.x + (Math.random() * 20 - 10),
        y: source.y + (Math.random() * 20 - 10),
        target: { x: target.x + (Math.random() * 10 - 5), y: target.y + (Math.random() * 10 - 5) },
        color: color,
        size: 5 + Math.random() * 3,
        speed: 3 + Math.random() * 2
      });
    }
  }

  // --- SC CONTROL METHODS ---
  // These are triggered by nw_wrld when the user moves a slider.
  // Values arrive normalized 0–1 from the nw_wrld UI.
  // We send them back to SC via the bridge WebSocket as /soneth/* OSC.
  //
  // ⟶ PUENTE [Motores + Exterioridad horizontal con justicia]: mover estos
  // sliders es ejercer poder sobre la voz del bosque (volumen, color, memoria
  // del sonido). Rössler diría que aquí el humano ocupa la posición de
  // "exterioridad horizontal": tiene la capacidad de modular al otro. La
  // apuesta ética —su "justicia"— es no abusar de ese poder: modular, no
  // silenciar; acompañar, no reducir. El bosque sigue sonando aunque el
  // humano suelte el control.
  setVolume({ level = 0.3, isRemote = false }) {
    if (!isRemote) this.sendToSC("/soneth/volume", level);
  }
  setFilterCutoff({ cutoff = 0.5, isRemote = false }) {
    if (!isRemote) this.sendToSC("/soneth/spectralshift", cutoff);
  }
  setFMRatio({ ratio = 0.2, isRemote = false }) {
    if (!isRemote) this.sendToSC("/soneth/pitchshift", ratio);
  }
  setReverbMix({ reverb = 0.3, isRemote = false }) {
    // ⟶ "atmospheremix": el reverb es el espacio, la atmósfera donde la voz
    // resuena. Es el equivalente sonoro de la "Gran Pantalla": un mundo donde
    // el sonido se imagina a sí mismo.
    if (!isRemote) this.sendToSC("/soneth/atmospheremix", reverb);
  }
  setDelayMix({ delay = 0.2, isRemote = false }) {
    // ⟶ "memoryfeed": el delay realimenta el sonido reciente. Es el Buffer B
    // hecho audible —la profundidad de ~3 s del presente que se desvanece—.
    if (!isRemote) this.sendToSC("/soneth/memoryfeed", delay);
  }

  destroy() {
    if (this.myp5) {
      this.myp5.remove();
      this.myp5 = null;
    }
    super.destroy();
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * PROPUESTAS DE DESARROLLO — completar el Benevolence Engine que aún falta
 * ------------------------------------------------------------------------
 * El visualizador ya tiene: Polysensing (la bridge), Buffer del presente
 * (partículas/delay), Voluntad (campos de fuerza), Pantalla/Imaginación (p5),
 * Motores (OSC) y reciprocidad (la red). Faltan dos órganos de la máquina de
 * Seaman y Rössler. Proponerlos cierra el puente:
 *
 *  1) OVERLAP BUFFER (OB) — "pensar la acción antes de ejecutarla".
 *     Antes de que sendToSC() actúe sobre el mundo, simular el efecto y
 *     decidir. En clave de tesis, esto ES la separación entre detección y
 *     adjudicación (Cap. 4): ningún evento técnico se vuelve consecuencia
 *     política sin pasar por una pausa deliberativa. Boceto:
 *
 *       _simulateThenSend(address, value) {
 *         const preview = this._predictOutcome(address, value); // simular
 *         if (this._withinCharter(preview)) this.sendToSC(address, value);
 *         else this._flagForDeliberation(address, value, preview); // al Parlamento
 *       }
 *
 *  2) LONG-TERM MEMORY (LTM) — la memoria estacional ya existe: es el
 *     PhenologicalCalendar (anillo de 365 días + manakai_species.json, 572
 *     especies). El visualizador es el presente (segundos); el calendario es
 *     el año. Conectarlos da las dos profundidades de memoria del Benevolence
 *     Engine. Concretamente: que cada trigger* ancle su emisión a una especie
 *     activa hoy (como ya hace la versión fusionada del calendario), de modo
 *     que la biogeoquímica quede LIGADA a la fenología viva y no a coordenadas
 *     fijas de pantalla. Ese acoplamiento es la "coupling de ecología profunda".
 *
 *  3) CLÁUSULA DE OPACIDAD en la salida — antes de publicar/transmitir, velar
 *     una fracción de la señal (especies vulnerables, saberes reservados),
 *     igual que setOpacityFloor() en el calendario. La justicia de la
 *     exterioridad horizontal (Rössler) hecha regla de código.
 * ════════════════════════════════════════════════════════════════════════ */

export default BiocracyVisualizer;
