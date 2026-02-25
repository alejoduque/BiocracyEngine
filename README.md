# Biocracy Engine
*(SiC — Sistema Interconectado Común)*

**Biocracy Engine** es una arquitectura híbrida y modular que integra Finanzas Descentralizadas (DeFi/Ethereum), síntesis de audio responsiva y estocástica (SuperCollider), y visualización interactiva de ecosistemas (`nw_wrld`). Su meta es otorgar *agencia sonora y visual* a componentes ecológicos no-humanos a través de las fluctuaciones de capital en la blockchain — una implementación práctica del *Parlamento de Todas las Cosas* de Bruno Latour.

El sistema no *representa* un parlamento de actores no-humanos — lo *construye*. Cada especie acústica tiene su firma espectral. Cada sitio de ADN ambiental atraviesa ciclos de validación mensual. Cada red micorrízica comunica mediante drones de señal química con intervalos propios. El mapeo entre realidad ecológica y materialidad computacional hace que la metáfora deje de ser metáfora.

---

## Arquitectura del Sistema

Tres motores autónomos que se escuchan y modulan mutuamente en tiempo real:

```
Ethereum Mainnet
      │  transacciones → gas price → MIDI logarítmico
      ▼
┌─────────────────────────────────────┐
│  eth_listener/eth_sonify.py         │  Python + Infura
│  CO₂ · Phosphorus · Nitrogen · Myco │
└──────────────┬──────────────────────┘
               │ OSC /eco/*
               ▼
┌─────────────────────────────────────┐
│  sonETH (SuperCollider Headless)    │  Motor Metabólico
│  5 acoustic species · 4 fungi nets  │
│  8 eDNA sites · 1 AI core           │
│  Granular · FM · PM · Consensus Eng │
└──────────────┬──────────────────────┘
               │ OSC /agent/* /parliament/*  (10Hz · UDP 3333)
               ▼
┌─────────────────────────────────────┐
│  parliament-bridge.js               │  Node.js relay
│  UDP 3333 ↔ WebSocket 3334          │
│  + UDP 57120 ← browser controls     │
└──────────────┬──────────────────────┘
               │ WebSocket
               ▼
┌─────────────────────────────────────┐
│  nw_wrld_local (Three.js)           │  Parlamento Visual
│  parliament.html · ParliamentStage  │
│  3D orbits · FFT ring · Spectrogram │
│  BioToken V3 · OSC control panel   │
└─────────────────────────────────────┘
```

### El Colector Criptográfico (`eth_listener/`)
Listener Python conectado a la Mainnet de Ethereum vía Infura. Traduce el metabolismo financiero de la blockchain en señales ecológicas: el gas price se convierte en CO₂, el volumen de transacciones en pulso de Nitrógeno, los contratos en activación de Fósforo y Micorrizas.

### El Motor Metabólico (`sonETH/` + `parliament-synthesizer/`)
SuperCollider corriendo sin interfaz gráfica. 21 agentes democráticos activos simultáneamente:
- **5 Especies Acústicas** — síntesis granular con filtros propios por especie (BPF, LPF, HPF, BRF, Allpass). Frecuencias basadas en vocalizaciones reales: Ara macao (220Hz), Atlapetes (330Hz), Cecropia (440Hz), Alouatta (165Hz), Tinamus (275Hz).
- **8 Sitios eDNA** — síntesis armónica evolutiva. Ciclos de validación mensual simulados en 8 segundos. Biodiversidad colombiana: Chocó, Amazonía, Cordillera Oriental, Caribe, Orinoquía, Pacífico, Magdalena, Guayana.
- **4 Redes Fúngicas** — drones de señal química. Ciclos de 6 segundos. Propagación de señales por la red micorrízica.
- **1 AI Core (Gaia)** — meta-gobernanza algorítmica. Ciclo de consciencia de 3 segundos. Auto-optimización continua.
- **Consensus Engine** — armonía democrática. Resolución de 15 segundos. Ciclo maestro del parlamento: 120 segundos.

### El Parlamento Visual (`nw_wrld_local/`)
Escenario Three.js donde sonido y datos convergen. Accesible en `http://localhost:9000/parliament.html`.

**Escena 3D:**
- **5 geometrías de especies** (Icosaedro, Octaedro, Tetraedro, TorusKnot, Dodecaedro) en órbita independiente con oscilación en Z y halos de partículas
- **8 nodos eDNA** (Box, Cono, Cápsula, Esfera baja-poli, Prisma hexagonal, Toro) en órbita exterior a diferentes velocidades angulares
- **Anillo FFT** (64 barras radiales, escala logarítmica 20–8kHz) reactivo a frecuencias de especies
- **Consensus core** — icosaedro wireframe + esfera emissiva + figura Lissajous 3D del AI
- **Líneas de fungi** — conectan especies a sitios eDNA en espacio 3D
- Post-processing: UnrealBloomPass + AfterimagePass

**Panel de telemetría (derecha):**
- Todos los parámetros en tiempo real: consensus, phase, votes, species, eDNA, fungi, AI, eco signals ETH
- BioToken V3 calculado en vivo: `BT = Presence × Activity × eDNA.biodiv × Fungi.chem × AI.optim × IUCN.weight`
- Badges IUCN (CR/VU/LC) por especie
- Mapa de biomas de Colombia, activo según validación eDNA

**Panel OSC (izquierda) — controles bidireccionales:**
- Sliders enrutados a SC: master volume, rotation speed, consensus, species activity/presence ×5, eDNA biodiversity ×8, fungi chemical ×4, AI consciousness, FX chain (reverb, delay)
- Botones de acción democrática: Trigger Vote, Start/Stop Parliament, Emergency Consensus

**Espectrograma (inferior, ancho completo):**
- Canvas HTML independiente del render Three.js — ~22fps
- Cascada amber scrolling, eje de frecuencias log-scale
- Reactivo: picos gaussian en cada frecuencia de especie activa, armónicos eDNA, sub-bajo fúngico

---

## Fórmula BioToken V3

```
BIOTOKEN_V3 = (Presencia_Acústica × Actividad × Duración)
            × (Validación_eDNA × Índice_Biodiversidad)
            × (Señal_Química_Fungi × Conectividad_Red)
            × (Consciencia_IA × Tasa_Optimización)
            × (Estatus_UICN × Peso_Conservación)
```

Donde UICN multiplica por: CR=5, EN=3, VU=2, LC=1. El Ara macao (CR) vale 5× más que el Tinamus (LC) en el sistema democrático — su voz tiene más urgencia política porque su existencia tiene más urgencia ecológica.

---

## Instalación

### Prerequisitos
- **SuperCollider** ≥ 3.13 en `/Applications/SuperCollider.app/` (macOS)
- **Node.js** ≥ 18 con npm
- **Python** 3.9+ con pip
- Cuenta **Infura** con API key (Ethereum mainnet)

### Setup

```bash
# 1. Clonar
git clone https://github.com/alejoduque/sonETH.git
cd BiocracyEngine

# 2. Instalar dependencias del bridge OSC y visual layer
cd nw_wrld_local
npm install
npx webpack --mode production   # genera dist/parliament.js
cd ..

# 3. Configurar Ethereum listener
cd eth_listener
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
echo "INFURA_API_KEY=tu_api_key_aqui" > .env
cd ..
```

### Arranque

```bash
./start_ecosystem.sh
```

El script orquesta en orden:
1. **nw_wrld** — servidor web en `http://localhost:9000`
2. **parliament-bridge** — bridge OSC↔WebSocket (UDP:3333 ↔ WS:3334)
3. **sonETH** — motor SuperCollider headless
4. **parliament-synthesizer** — sintetizador del parlamento (arranca 5s después de SC)
5. **eth_listener** — scraper Ethereum (foreground, Ctrl+C apaga todo)

Abre automáticamente `http://localhost:9000/parliament.html`.

**Doble clic** en el canvas para fullscreen.

### Estructura del repositorio

```
BiocracyEngine/
├── start_ecosystem.sh              # Orquestador principal
├── parliament-synthesizer/         # SC: agentes, síntesis, OSC handlers
│   ├── 0_parliament_loader.scd
│   ├── 1_server_config.scd         # 21 agentes, buses de audio/control
│   ├── 2_agent_synthdefs.scd       # SynthDefs por tipo de agente
│   ├── 3_temporal_engine.scd       # Motor temporal + broadcast 10Hz
│   ├── 5_parliament_control.scd    # Votación, emergencia, status
│   ├── 6_effect_synthdefs.scd      # Reverb, delay, master out
│   └── 7_osc_handlers.scd          # OSC endpoints para control externo
├── sonETH/                         # SC: metabolismo ETH (submódulo)
├── eth_listener/                   # Python: scraper Ethereum
│   └── eth_sonify.py
├── nw_wrld_local/                  # Visual layer (Three.js)
│   ├── parliament-bridge.js        # Bridge OSC↔WebSocket (bidireccional)
│   └── src/
│       ├── main/starter_modules/
│       │   └── ParliamentStage.js  # Escena 3D principal
│       └── projector/
│           ├── parliamentEntry.ts  # Entry point, OSC wiring, spectrogram
│           ├── parliament/
│           │   └── parliamentStore.ts  # Store reactivo de estado
│           └── views/
│               └── parliament.html     # UI: 3 columnas, sliders, telemetría
├── CHANGELOG.md
├── DEVELOPMENT_PLAN.md
└── BIO_TOKEN_FRAMEWORK_V3_PARLAMENTO_DE_TODAS_LAS_COSAS.md
```

---

## OSC — Endpoints de Control

El browser puede enviar a SuperCollider vía el bridge (WS:3334 → UDP:57120):

| Dirección OSC | Argumentos | Efecto en SC |
|---------------|-----------|--------------|
| `/parliament/volume` | `[float 0-1]` | Bus masterVolume |
| `/parliament/consensus` | `[float 0-1]` | Bus consensusLevel |
| `/parliament/rotation` | `[float 0.1-2.0]` | Bus rotationSpeed |
| `/agents/species/activity` | `[int id, float 0-1]` | species[id].synth(\activity) |
| `/agents/species/presence` | `[int id, float 0-1]` | species[id].synth(\presence) |
| `/agents/edna/biodiversity` | `[int id, float 0-1]` | edna[id].synth(\biodiversity) |
| `/agents/fungi/chemical` | `[int id, float 0-1]` | fungi[id].synth(\chemical) |
| `/agents/ai/consciousness` | `[float 0-1]` | Bus aiConsciousness |
| `/parliament/vote` | `[]` | Dispara votación democrática |
| `/parliament/start` | `[]` | Inicia todos los agentes |
| `/parliament/stop` | `[]` | Detiene todos los agentes |
| `/parliament/emergency` | `[float 0-1]` | Protocolo de emergencia |

SC emite hacia el browser (UDP:3333 → WS:3334 → browser):

```
/parliament/phase           [float]         — progreso del ciclo de 120s (0-1)
/parliament/consensus       [float]         — nivel de consenso democrático
/parliament/consensusWave   [float]         — onda de construcción de consenso
/parliament/votes           [int]           — votos totales activos
/agent/species/state        [id, pres, act, votes, freq]
/agent/edna/state           [id, biodiv, validation]
/agent/fungi/state          [id, chem, conn, coverage]
/agent/ai/state             [consciousness, optimization]
/eco/co2                    [float]         — desde Ethereum
/eco/mycoPulse              [float]
/eco/phosphorus             [float]
/eco/nitrogen               [float]
/parliament/vote/result     [consensus, pass, yes, total]
```

---

## Marco Conceptual

El sistema implementa prácticamente el concepto de *mediación* de Bruno Latour: la blockchain de Algorand (en desarrollo) no transmite información, la transforma. Las firmas acústicas, las secuencias de ADN ambiental, las señales químicas micorrízicas y los procesos algorítmicos se convierten en formas equivalentes de voz política.

La *democracia multi-modal* que emerge no es metáfora sino protocolo técnico: especies con estatus IUCN Critically Endangered tienen mayor peso de voto (`×5`). La urgencia ecológica real se traduce en agencia política real dentro del sistema.

**Agentes activos:**
- Ara macao — CR — 8 votos — 220Hz
- Atlapetes blancae — VU — 5 votos — 330Hz
- Cecropia obtusa — LC — 3 votos — 440Hz
- Alouatta seniculus — VU — 6 votos — 165Hz
- Tinamus major — LC — 4 votos — 275Hz
- CHO/AMZ/COR/CAR/ORI/PAC/MAG/GUA — 8 sitios eDNA colombianos
- Red N.Micorrízica / Red C.Esporas / Red S.Fúngica / Red Costera
- Gaia — AI Core — consciencia evolutiva — meta-gobernanza

---

## Contribuciones

Ver `CONTRIBUTING.md`. El sistema es investigación-creación activa. Issues y PRs bienvenidos, especialmente en:
- Integración de grabaciones de campo reales (Xeno-canto) en síntesis granular SC
- Web Audio API para FFT real desde audio de SuperCollider
- Algorand SDK para registro de votaciones como BioToken transactions
- InstancedMesh para densidad visual de instalación (1k+ partículas/agente)

---

*Investigación doctoral en Diseño, Arte y Ciencia. Primera implementación de un parlamento posthumano basado en blockchain para gobernanza ambiental. Festival de la Imagen 2025.*
