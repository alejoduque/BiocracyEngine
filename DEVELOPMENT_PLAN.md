# Plan de Desarrollo: De sistema a experiencia

> *"The gap between your SuperCollider engine and your visual layer is where the artwork lives."*

El objetivo es que `nw_wrld` deje de ser una interfaz de control y se convierta en el escenario coreográfico donde la arquitectura temporal del parlamento se materializa visualmente — con la misma densidad, especificidad por especie, y anidamiento temporal que ya tiene el motor sonoro.

---

## Estado Actual — v0.4.0

Las fases 0–3 del plan original están en gran parte completadas:

- **Fase 0 ✓**: SuperCollider Group 1001 resuelto. Bus allocation separado de `.set()` en SC 3.13.
- **Fase 1 ✓**: Puente OSC completo y bidireccional. 10Hz broadcast de estado completo. WebSocket relay. 21 sliders OSC enrutados correctamente a SC endpoints (`/agents/species/activity`, `/agents/edna/biodiversity`, etc.).
- **Fase 2 ✓**: Escenario 3D funcional. 5 geometrías distintas (icosaedro, octaedro, tetraedro, torus knot, dodecaedro) orbitando independientemente. 8 nodos eDNA con formas propias. FFT ring de 64 barras. Espectrograma scrolling en canvas HTML.
- **Fase 6 ✓**: Modo projector fullscreen (`/parliament.html`). Auto-start desde `start_ecosystem.sh`.

Lo que sigue está organizado en dos partes: **trabajo técnico concreto** y **visión artística expandida** — esta última escrita desde la perspectiva de lo que el sistema merece ser como obra de arte de datos vivos.

---

## Fases Pendientes (Técnicas)

### Fase 4: Ethereum como Metabolismo Visible
**Prioridad: Media**

- [ ] Visualizar transacciones ETH como partículas que entran al escenario desde el borde exterior — tamaño ∝ log(valor), velocidad ∝ gas price
- [ ] Transaction density como clima del escenario: alta densidad = neblina de partículas, calor visual. Baja densidad = claridad, silencio visual
- [ ] Metabolismo basal: cuando no hay transacciones, el sistema sigue respirando — pulso lento de nitrógeno que nunca se detiene, correlato del `~nitrogenLayer` en SC

### Fase 5: Shader Layer — Atmósfera y Unificación ✓ (v0.5.0)
**Implementado**

- [x] Post-processing dinámico ligado a estado del parlamento:
  - Bloom ∝ consensusLevel — strength 0.25→1.5, radius 0.65→0.30, threshold 0.35→0.08
  - Chromatic aberration ∝ turbulencia — `ChromaticAberrationShader` GLSL custom, amount 0→0.010
  - Film grain ∝ ETH CO₂ + nitrogen density — `FilmPass` noiseIntensity 0→0.35
  - Vignette que respira con el ciclo de 120s — `VignetteShader` offset/darkness desde `phase`
  - AfterimagePass damp ∝ species activity — 0.82→0.93
- [x] Color grading dinámico — `ColorGradeShader` GLSL custom:
  - Consenso alto → tonos cálidos/dorados (warmth=1)
  - Disenso → fríos/fragmentados (warmth=0, blue-teal shift)
  - Emergencia → saturación roja progresiva (votes altos + bajo consenso)
- [x] Identidad visual amplificada por especie:
  - `emissiveIntensity` ∝ presence × consensus (bloom la multiplica)
  - Halos: `size` y `opacity` ∝ activity + turbulence
  - Fungi lines: pulso químico a 6s, `opacity` ∝ chemical × connectivity
  - eDNA nodes: `scale` ∝ biodiversity
  - Core consensus: `emissiveIntensity` 0.6→1.8 ∝ consensus
- [ ] Custom GLSL vertex displacement por noise, fragment color per-species (pendiente)

### Fase 7: Capas Temporales Visibles
**Prioridad: Alta — esto es lo que distingue la obra**

Cada ciclo del motor sonoro tiene que ser legible visualmente sin texto, solo geometría y luz:

| Ciclo | Duración | Manifestación Visual Pendiente |
|-------|----------|-------------------------------|
| AI Consciousness | 3s | Pulso de escala de la figura Lissajous, onda sutil radial |
| Species Activity | 4–7s | Respiración de halos de partículas por especie |
| Fungi Chemical | 6s | Onda luminosa viajando por las líneas de conexión |
| eDNA Validation | 8s | Flash de validación radial desde cada nodo eDNA |
| Consensus Building | 15s | Contracción/expansión del campo central |
| Fungi Seasonal | 30s | Cambio gradual de opacidad de conexiones fúngicas |
| Parliament Rotation | 120s | Rotación completa, convergencia antes de votación |

- [ ] Arcos de fase integrados en geometría (no UI): cada agente muestra en su órbita qué fracción de su ciclo ha completado
- [ ] Evento de votación como clímax visual: convergencia de todos los agentes, intensificación de partículas, resultado modifica el campo gravitacional de forma visible y duradera

### Fase 8: Identidad Visual por Especie (GLSL)
- [ ] Filtro visual análogo al filtro de síntesis de cada especie:
  - Ara macao (BPF): aura pulsante circunferencial — brillo en banda media
  - Atlapetes (LPF): suavidad, desenfoque gaussiano de partículas
  - Cecropia (HPF): bordes nítidos, alta frecuencia espacial
  - Alouatta (BRF notch): hueco en la geometría, oscilación anti-resonante
  - Tinamus (Allpass/delay): trail de fantasmas, eco visual con decaimiento
- [ ] InstancedMesh para nubes de partículas por especie (1,000–5,000 instancias por especie)

### Fase 9: Datos Reales — Integración Científica
**Sitio de referencia: Reserva MANAKAI, Colombia**
`GPS: 4°35'42"N 74°04'12"W` — coordenadas hardcoded como anchor geográfico del sistema.
Todas las especies acústicas y sitios eDNA referencian este territorio.

- [ ] Conectar con IUCN Red List API para actualizar status de especies en tiempo real
- [ ] Grabaciones de campo propias de la Reserva MANAKAI como buffers granulares en SC
  — vocalizaciones reales de Ara macao, Alouatta, Tinamus registradas en sitio
  — no depender de bases de datos de otras latitudes
- [ ] Ciclo de muestreo eDNA real: validación mensual ligada a bases de datos de biodiversidad colombiana (SiB Colombia)
- [ ] Algorand testnet: registrar cada votación del parlamento como transacción blockchain (BioToken V3)

---

## Visión Artística Expandida

*Escrita desde la perspectiva de lo que este sistema merece ser como obra — inspirada en los principios de Refik Anadol sobre datos vivos, memoria de la máquina, y naturaleza como dataset.*

---

### Sobre la escala de los datos

El sistema actual trabaja con 21 agentes y ~130 mensajes OSC por segundo. Esto es un esqueleto funcional, no una obra de instalación. Para que el escenario tenga la densidad perceptual que requiere una sala oscura y una proyección de 4K, el sistema necesita al menos **un orden de magnitud más de datos** fluyendo hacia los visuales.

**Propuesta: Data Augmentation del parlamento**

Cada uno de los 21 agentes debería generar no un punto en el espacio sino una nube de sub-agentes — entidades menores que heredan el estado del agente padre y añaden ruido procedural. Una especie con `presence = 0.8` genera 800 puntos de partícula, no uno. La diferencia entre una obra de arte de datos y un dashboard técnico es esta densidad.

Técnicamente: `InstancedMesh` con 1,000 instancias por agente = 21,000 objetos en escena, todos actualizados por el estado OSC. Three.js lo maneja con facilidad en GPU.

**Propuesta: Datos históricos como sedimento**

El parlamento lleva corriendo desde que arrancó el sistema. Esos datos acumulados — ciclos de votación, fluctuaciones de consenso, niveles de actividad por especie — son la memoria del ecosistema. Visualizarlos como capas sedimentarias detrás de la coreografía en tiempo real: el pasado como fondo, el presente como primer plano. Lo que Anadol llama "machine hallucination" aplicado a datos ecológicos reales.

Técnicamente: buffer circular de los últimos N estados del parlamento, renderizado como geometría histórica translúcida (z-depth menor, opacidad decreciente con la antigüedad).

---

### Sobre el espacio físico de la instalación

El sistema está diseñado para pantalla. Pero su arquitectura — múltiples fuentes de datos autónomas, coreografía no lineal, democratización de la agencia — apunta a algo más grande.

**Propuesta: Multi-canal espacial**

El parlamento tiene una topología concéntrica (AI core → fungi → species → eDNA). Esta topología puede mapearse a espacio físico: el AI core en el centro de la sala, las especies acústicas en anillo interior de proyección, los sitios eDNA en las paredes exteriores. El espacio de la sala se convierte en el espacio del parlamento.

Técnicamente: múltiples instancias de `parliament.html` recibiendo el mismo stream OSC, cada una renderizando una "sección" del escenario para un proyector diferente. El bridge ya soporta múltiples clientes WebSocket simultáneos.

**Propuesta: Audio multicanal**

SuperCollider ya tiene `Pan2` por especie (spatialPos: -1.0 a +1.0). Expandir a 8 canales: cada especie tiene posición en espacio 3D de audio. El visitante que camina por la instalación atraviesa literalmente el campo sonoro del parlamento. La democracia no-humana como experiencia espacial.

---

### Sobre la interfaz de control

El panel OSC actual (sliders en la columna izquierda) es una consola técnica. Para una instalación esto puede evolucionar en dos direcciones opuestas:

**Opción A: Desaparecer** — el parlamento es completamente autónomo, ningún humano controla sus parámetros. Los datos ecológicos reales y las transacciones de Ethereum son la única entrada. El artista no interviene durante la obra. Esta radicalidad es coherente con el marco teórico de Latour.

**Opción B: Convertirse en ritual** — la interfaz se convierte en un ritual de participación. Un mediador (el artista, un científico invitado, un visitante seleccionado) puede activar votaciones, ajustar presencias, disparar emergencias. La interfaz técnica se convierte en gesto político. El panel OSC como artefacto de gobernanza.

---

### Sobre el espectrograma

El espectrograma actual muestra datos sintéticos derivados del estado OSC. El paso siguiente lógico — y el más impactante — es conectarlo a audio real.

**Propuesta: Web Audio API + FFT real**

Si el audio de SuperCollider se enruta a través del sistema como stream (via `getUserMedia` o `AudioWorklet`), el espectrograma puede mostrar el FFT real del parlamento sonoro. La coherencia entre lo que se escucha y lo que se ve en el espectrograma es total. No simulación: transcripción.

Técnicamente: `AnalyserNode` de Web Audio API con `getByteFrequencyData()`, mismo `SpectrogramRenderer`, mismo amber colormap. El FFT ring en Three.js usaría los mismos bins.

---

### Sobre la identidad de las especies

Cada especie tiene una frecuencia base en SC: Ara macao (220Hz), Atlapetes (330Hz), Cecropia (440Hz), Alouatta (165Hz), Tinamus (275Hz). Estos no son números arbitrarios — son las frecuencias fundamentales de sus vocalizaciones en el ecosistema colombiano.

**Propuesta: Grabaciones reales como material**

La síntesis granular en SC puede usar grabaciones de campo reales de estas especies como buffers fuente. El sistema ya tiene la arquitectura granular; solo le faltan los samples. Con audio real, la figura legal y científica del "agente democrático" se vuelve completamente auténtica: el Ara macao literalmente habla en el parlamento con su propia voz.

Banco de datos primario: grabaciones propias de la Reserva MANAKAI (GPS: 4°35'42"N 74°04'12"W, Colombia). Estas son las especies que habitan ese territorio específico — el sistema habla desde ese lugar, no desde una base de datos global. La integración es un `Buffer.read()` en SC.

---

### Próximos hitos concretos (en orden de impacto)

1. **InstancedMesh por especie** — densidad visual inmediata, misma arquitectura OSC existente
2. **Web Audio FFT real** — coherencia audio/visual total, espectrograma auténtico
3. **Grabaciones propias de Reserva MANAKAI en SC granular** — autenticidad del agente acústico desde el territorio (GPS: 4°35'42"N 74°04'12"W)
4. **Buffer histórico + sedimento visual** — memoria del ecosistema
5. **Multi-proyector** — escala espacial de instalación
6. **Algorand blockchain** — cada votación registrada como BioToken transaction
7. **Datos IUCN/eBird en tiempo real** — validación científica externa

---

## Stack Técnico — Estado Actual

### Ya implementado
- **Three.js** — motor 3D, UnrealBloomPass, AfterimagePass, OrbitControls
- **AnimationManager** — loop RAF coordinado
- **BaseThreeJsModule** — clase base para módulos Three.js
- **parliamentStore.ts** — store reactivo con WebSocket auto-reconectante
- **parliament-bridge.js** — bridge UDP OSC ↔ WebSocket ↔ UDP SC, bidireccional
- **SpectrogramRenderer** — canvas 2D scrolling, colormap amber, log-scale
- **buildFftBins()** — FFT sintético desde datos OSC, log-scale 20–8kHz

### Por agregar
- **`InstancedMesh`** — nubes de sub-partículas por agente (1k–5k instancias)
- **Custom GLSL shaders** — vertex displacement, fragment color por estado OSC
- **EffectComposer dinámico** — bloom, chromatic aberration, vignette desde datos
- **Web Audio API** — `AnalyserNode` → FFT real desde audio SC
- **`Buffer.read()` en SC** — grabaciones de campo propias de Reserva MANAKAI como fuente granular
- **Algorand SDK** — registro de votaciones como transacciones BioToken
- **IUCN Red List API** — status de conservación en tiempo real
