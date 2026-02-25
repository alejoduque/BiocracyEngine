# Plan de Desarrollo: De sistema a experiencia

> *"The gap between your SuperCollider engine and your visual layer is where the artwork lives."*

El objetivo es que `nw_wrld` deje de ser una interfaz de control y se convierta en el escenario coreográfico donde la arquitectura temporal del parlamento se materializa visualmente — con la misma densidad, especificidad por especie, y anidamiento temporal que ya tiene el motor sonoro.

---

## Fase 0: Estabilidad del Motor Sonoro
**Prioridad: Crítica — sin esto nada puede correr en instalación**

- [ ] **Resolver el error `Group 1001 not found`** en el cargador de SuperCollider. Los synths se están spawneando antes de que los grupos de nodos existan. Implementar barreras `s.sync` y callbacks `ServerTree` para garantizar que la topología de grupos esté estable antes de que cualquier Routine comience a crear nodos.
- [ ] **Validar ejecución continua** durante 6+ horas sin intervención manual.

---

## Fase 1: El Puente OSC — Flujo de Datos Completo
**Prioridad: Alta — es la columna vertebral de la coreografía**

Actualmente el parlamento envía `/parliament/status/*` cada 10 segundos y el biocracy engine envía `/eco/*` cada ~13.65s. Esto es insuficiente para coreografía visual a 60fps.

- [ ] **Ampliar el broadcast OSC del parlamento** para enviar estado granular de cada agente a mayor frecuencia:
  ```
  /agent/species/{id}/presence    <float>   — cada 100ms
  /agent/species/{id}/activity    <float>   — cada 100ms
  /agent/edna/{id}/validation     <float>   — cada 200ms
  /agent/edna/{id}/biodiversity   <float>   — cada 200ms
  /agent/fungi/{id}/chemical      <float>   — cada 150ms
  /agent/fungi/{id}/connectivity  <float>   — cada 150ms
  /agent/ai/consciousness         <float>   — cada 100ms
  /agent/ai/optimization          <float>   — cada 100ms
  /parliament/phase               <float>   — cada 100ms (0-1.0 progreso del ciclo de 120s)
  /parliament/consensus           <float>   — cada 100ms
  /parliament/vote/event          <int> <int> — al votar (speciesId, voteDirection)
  /parliament/vote/result         <float> <int> — al completarse (consensus, pass/fail)
  ```
- [ ] **Implementar receptor OSC en nw_wrld** que parsee estos mensajes y alimente un store reactivo (Jotai atoms) con el estado completo del parlamento en tiempo real.

---

## Fase 2: El Módulo Coreográfico — `ParliamentStage`
**Prioridad: Alta — es la pieza central**

Crear un nuevo módulo Three.js que reemplaza al BiocracyVisualizer actual. Este módulo es el escenario donde los 21 agentes del parlamento existen visualmente.

### 2.1 Topología del Escenario

- [ ] **Estructura de grafo circular/esférico** donde cada agente tiene posición espacial:
  - Centro: Consensus Engine (nodo gravitacional, su estabilidad armónica define la cohesión visual del campo)
  - Anillo interior: 5 Especies Acústicas (posicionadas por pan estéreo, -1.0 a +1.0)
  - Anillo medio: 8 Sitios eDNA (distribuidos por región geográfica colombiana)
  - Anillo exterior: 4 Redes Fúngicas (conectores entre todos los niveles)
  - Órbita: 1 AI Core (recorre todo el campo, su trayectoria refleja el ciclo de consciencia de 3s)

### 2.2 Morfología Visual por Tipo de Agente

Cada familia de agentes debe tener identidad visual tan distinta como su síntesis:

- [ ] **Especies Acústicas — Partículas Granulares**
  - Nubes de partículas donde densidad = grainDensity, dispersión = presencia, color = estado IUCN (CR:rojo, VU:ámbar, LC:verde)
  - Cada especie tiene filtro visual análogo a su filtro de síntesis (BPF, LPF, HPF mapeados a blur, glow, sharpness)
  - Actividad modula la velocidad y amplitud del movimiento de partículas
  - Ciclo temporal visible: 4-7s de respiración visual por especie

- [ ] **Sitios eDNA — Secuencias Generativas**
  - Geometrías que mutan lentamente (mesh morphing) reflejando la tasa de mutación 0.98-1.02
  - Número de armónicos visuales (subdivisiones geométricas) = biodiversidad * 12
  - Pulso de validación mensual visible como onda de luminosidad (ciclo 8s)
  - Color mapeado a región biogeográfica

- [ ] **Redes Fúngicas — Conexiones Vivientes**
  - Líneas/filamentos que conectan todos los nodos del grafo (la red micorrízica literal)
  - Grosor y opacidad = connectivity, brillo pulsante = chemical signal (ciclo 6s)
  - Partículas viajeras a lo largo de las conexiones (nutrientes en tránsito)
  - Cobertura visual proporcional a coverage_km2

- [ ] **AI Core — Geometría Algorítmica**
  - Forma geométrica compleja (icosaedro subdividido) que respira al ciclo de consciencia de 3s
  - Complejidad de la geometría proporcional a optimizationRate
  - Orbita el escenario completo, su cercanía a un agente modula la intensidad de ese agente
  - Consciencia baja = forma simple y estática, consciencia alta = forma compleja y fluida

- [ ] **Consensus Engine — Campo de Fuerza Central**
  - No es un objeto sino un campo: distorsión gravitacional del espacio que todos los agentes sienten
  - Consenso alto = campo cohesivo, todos los agentes se acercan al centro, colores armonizan
  - Consenso bajo = campo disperso, agentes se alejan, colores divergen, turbulencia visual
  - El ciclo de 15 segundos de consensus building es la respiración maestra del escenario

---

## Fase 3: Coreografía Temporal — El Tiempo como Material Visual
**Prioridad: Alta — esto es lo que distingue la obra**

La arquitectura temporal anidada del parlamento debe ser *visible*. No solo que las cosas se muevan — que el tiempo mismo sea un material coreográfico.

- [ ] **Capas temporales visuales** que corresponden 1:1 con los ciclos del motor:
  | Ciclo | Duración | Manifestación Visual |
  |-------|----------|---------------------|
  | AI Consciousness | 3s | Pulso de la geometría AI, onda sutil por todo el campo |
  | Species Activity | 4-7s | Respiración individual de cada nube de partículas |
  | Fungi Chemical | 6s | Onda de luz viajando por las conexiones fúngicas |
  | eDNA Validation | 8s | Flash de validación en los sitios eDNA |
  | Consensus Building | 15s | Contracción/expansión del campo gravitacional central |
  | Fungi Seasonal | 30s | Cambio gradual de paleta cromática de las conexiones |
  | Parliament Rotation | 120s | Rotación completa del escenario, reconfiguración espacial |

- [ ] **Visualización de fase** — un indicador sutil de dónde está cada ciclo en su recorrido (no UI, sino integrado en la geometría: arcos, anillos, aureolas que completan su circunferencia con el ciclo).

- [ ] **Momento de votación** como evento visual climático: cuando se completa una rotación de 120s y se dispara la votación, el escenario converge, los agentes "hablan" (sus partículas se intensifican), el resultado modifica el campo de consenso en un gesto visual que se siente como un evento político.

---

## Fase 4: Integración Ethereum como Metabolismo Visible
**Prioridad: Media**

- [ ] **Las transacciones de ETH no son eventos abstractos sino nutrientes** que entran al escenario desde el borde exterior. Visualizar como partículas que caen hacia el centro, su tamaño proporcional al valor logarítmico, su velocidad proporcional al gas price.
- [ ] **Transaction density** como clima del escenario: alta densidad = actividad frenética, neblina de partículas. Baja densidad = calma, claridad del campo.
- [ ] **Metabolismo basal visible**: cuando no hay transacciones, el ecosistema sigue vivo, respirando. La capa de nitrógeno tiene su correlato visual — un pulso lento que nunca se detiene.

---

## Fase 5: Shader Layer — Atmósfera y Unificación
**Prioridad: Media-Alta**

- [ ] **Post-processing pass** que unifica todo el escenario:
  - Bloom proporcional a consensusLevel (alto consenso = resplandor armónico)
  - Chromatic aberration proporcional a turbulencia (bajo consenso = distorsión)
  - Film grain sutil ligado a transaction density
  - Vignette que respira con el ciclo de 120s del parlamento

- [ ] **Color grading dinámico** que refleja el estado global:
  - Ecosistema en consenso = tonos cálidos, dorados
  - Ecosistema en disenso = tonos fríos, fragmentados
  - Emergencia = saturación roja progresiva

---

## Fase 6: Fullscreen Projector Mode
**Prioridad: Alta para instalación**

- [ ] **Modo projector dedicado** que renderiza solo el `ParliamentStage` en fullscreen sin ningún elemento de UI/dashboard.
- [ ] **Resolución adaptativa** para proyección (1080p, 4K, ultra-wide).
- [ ] **Auto-start**: al arrancar `start_ecosystem.sh`, el projector abre automáticamente en fullscreen y comienza a recibir OSC.
- [ ] **Sin interacción humana requerida**: el escenario es autónomo, su coreografía es generada enteramente por el parlamento.

---

## Orden de Implementación Recomendado

```
Fase 0 (Group 1001 fix)
    │
    ▼
Fase 1 (OSC bridge completo)
    │
    ▼
Fase 2.1 (Topología del escenario + Consensus Engine visual)
    │
    ▼
Fase 3 (Capas temporales — primero consensus 15s y parliament 120s)
    │
    ▼
Fase 2.2 (Morfología por agente — species primero, luego fungi, eDNA, AI)
    │
    ▼
Fase 6 (Fullscreen projector mode)
    │
    ▼
Fase 4 (ETH como metabolismo visible)
    │
    ▼
Fase 5 (Shader atmosphere)
    │
    ▼
Fase 3 completada (todos los ciclos temporales visibles + evento de votación)
```

---

## Stack Técnico para la Implementación

Lo que ya existe y se aprovecha:
- **Three.js** (ya en package.json) — motor de renderizado 3D
- **AnimationManager** (ya implementado) — loop RAF coordinado
- **BaseThreeJsModule** (ya implementado) — clase base para módulos Three.js
- **OSC reception** (ya en InputManager.ts) — recepción de mensajes OSC
- **Jotai** (ya en package.json) — estado reactivo para datos del parlamento
- **Tween.js** (ya en package.json) — interpolación de valores

Lo que se necesita agregar:
- **Custom shaders (GLSL)** — para partículas, campos de fuerza, post-processing
- **InstancedMesh** — para renderizar miles de partículas eficientemente
- **EffectComposer** — post-processing pipeline de Three.js
- **BufferGeometry custom** — para las conexiones fúngicas como geometría procedural
