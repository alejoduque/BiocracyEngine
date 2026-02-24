/*
@nwWrld name: BiocracyVisualizer
@nwWrld category: 2D
@nwWrld imports: ModuleBase, p5
*/

class BiocracyVisualizer extends ModuleBase {
  static methods = [
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
        { name: "delay", defaultVal: 0.2, type: "number", min: 0.0, max: 1.0, isOscOutput: true, oscPath: "/control/delaymix" }
      ]
    }
  ];

  constructor(container) {
    super(container);
    this.myp5 = null;
    this.particles = [];
    this.mycoPulses = [];

    // Nodos del ecosistema
    this.nodes = {
      tree: { x: 0, y: -150, label: "Árbol (Captor CO2)", type: "surface" },
      mycorrhizaCenter: { x: 0, y: 50, label: "Red Micorrícica Hub", type: "underground" },
      plantA: { x: -150, y: -50, label: "Planta A", type: "surface" },
      plantB: { x: 150, y: -50, label: "Planta B", type: "surface" }
    };

    this.init();
  }

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
          pulse.life -= 0.02;
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

          pt.x += (dx / dist) * pt.speed;
          pt.y += (dy / dist) * pt.speed;

          p.noStroke();
          p.fill(pt.color);
          p.circle(pt.x, pt.y, pt.size);
        }

        // Dibujar Nodos
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

  triggerCO2({ amount = 50 }) {
    // Partículas bajando del dosel hacia el árbol
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
    this.mycoPulses.push({
      radius: 10,
      intensity: intensity,
      life: 1.0
    });

    // Enviar algo de energía por las ramas
    // De Tree a Hub
    this.createFlow(this.nodes.tree, this.nodes.mycorrhizaCenter, [255, 255, 255, 150], 5);
  }

  triggerPhosphorus({ amount = 30 }) {
    // Fósforo fluye del Hub a la Planta A
    this.createFlow(this.nodes.mycorrhizaCenter, this.nodes.plantA, [255, 100, 0, 255], amount / 5); // Naranja
  }

  triggerNitrogen({ amount = 30 }) {
    // Nitrógeno fluye del Hub a la Planta B
    this.createFlow(this.nodes.mycorrhizaCenter, this.nodes.plantB, [100, 100, 255, 255], amount / 5); // Azul
  }

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
  // Estos métodos se ejecutan cuando el usuario mueve un slider en nw_wrld.
  // nw_wrld se encarga de mandar los datos a isOscOutput (si nuestro SDK de nw_wrld lo soporta directamente).
  // Sino, estos métodos podrían invocar this.sendOSC(path, val) internamente si se le extendió la capacidad.

  setVolume({ level = 0.3 }) {
    console.log("Biocracy: Volume set to " + level);
  }
  setFilterCutoff({ cutoff = 0.5 }) {
    console.log("Biocracy: Filter set to " + cutoff);
  }
  setFMRatio({ ratio = 0.2 }) {
    console.log("Biocracy: FM Ratio set to " + ratio);
  }
  setReverbMix({ reverb = 0.3 }) {
    console.log("Biocracy: Reverb Mix set to " + reverb);
  }
  setDelayMix({ delay = 0.2 }) {
    console.log("Biocracy: Delay Mix set to " + delay);
  }

  destroy() {
    if (this.myp5) {
      this.myp5.remove();
      this.myp5 = null;
    }
    super.destroy();
  }
}

export default BiocracyVisualizer;
