```text
∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿

██████╗ ██╗ ██████╗  ██████╗██████╗  █████╗  ██████╗██╗   ██╗
██╔══██╗██║██╔═══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝╚██╗ ██╔╝
██████╔╝██║██║   ██║██║     ██████╔╝███████║██║      ╚████╔╝ 
██╔══██╗██║██║   ██║██║     ██╔══██╗██╔══██║██║       ╚██╔╝  
██████╔╝██║╚██████╔╝╚██████╗██║  ██║██║  ██║╚██████╗   ██║   
╚═════╝ ╚═╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝   ╚═╝   
                                                             
             ███████╗███╗   ██╗ ██████╗ ██╗███╗   ██╗███████╗
             ██╔════╝████╗  ██║██╔════╝ ██║████╗  ██║██╔════╝
             █████╗  ██╔██╗ ██║██║  ███╗██║██╔██╗ ██║█████╗  
             ██╔══╝  ██║╚██╗██║██║   ██║██║██║╚██╗██║██╔══╝  
             ███████╗██║ ╚████║╚██████╔╝██║██║ ╚████║███████╗
             ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝╚══════╝
                                                             
     retroalimentación cibernética → parlamento multiespecie  
∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿─∿
```

**Español** · [English](README.en.md)

# BiocracyEngine

Un instrumento audiovisual en vivo y un artefacto público desplegable que acopla tres registros en un solo bucle de retroalimentación: una blockchain pública, una asamblea deliberativa (el parlamento multiespecie) y la fenología de un bosque seco tropical. Cada parámetro de control acciona simultáneamente la síntesis de audio en SuperCollider y los módulos visuales (slots 0–9, P, F, B, E, R y A) a través de un puente bidireccional OSC/WebSocket.

Más que "visualizar datos", el motor ejecuta un acoplamiento cibernético donde el bosque, los protocolos blockchain y las acciones humanas tienen igual condición de agentes políticos.

![Slot F · DarkForest — el bosque seco tropical de la Reserva Manakai (Planeta Rica, Córdoba) como paisaje de datos estratigráfico en vivo: los estratos de Humboldt desde la atmósfera hasta la red micorrízica pasando por dosel, sotobosque y hojarasca, con binomios de especies, vectores de flujo ecológico (fotosíntesis CO₂→C, respiración suelo C→ATM, micorriza C→hongo, herbivoría, fijación N) y el flujo entrante de Ethereum por el borde derecho.](BEngine.jpg)

*Slot F · **DarkForest** — el bosque leyéndose a sí mismo mientras la cadena fluye. Estratos según Humboldt; cada binomio es miembro del parlamento.*

---

## 1. Fundamentos teóricos y aportes de investigación

El aporte central del BiocracyEngine está en **traducir teoría crítica, decolonial y política en restricciones técnicas operantes dentro del software.** Se plantea como contramodelo concreto y desplegable frente al Nature Fintech y los "Protocolos de Estado Ecológico", compilando filosofía en reglas ejecutables en lugar de citarla como autoridad externa.

### Filosofía compilada en reglas que corren

*   **El derecho a la opacidad de Glissant:** implementado como restricción de software. La *Cláusula de Opacidad* (visualizada mediante el parámetro `opacityFloor`) retiene una fracción determinista de las etiquetas de especies activas, excluyéndolas de la proyección. Esta cláusula se declara *intraducible a sonido* (no altera la síntesis en SuperCollider), honrando la afirmación de Glissant de que lo subalterno tiene derecho a permanecer opaco y no consumido por la mirada occidental.
*   **La comunidad que viene de Agamben:** asentada en el código como un parlamento de *singularidades, nunca identidades*. La asamblea no clasifica a las especies por su valor económico o utilidad, sino por su mera presencia.
*   **"La ausencia es voz":** en el slot P (Calendario Fenológico) y el slot F (DarkForest), las especies que caen bajo el umbral de detección sensible no se borran ni se ponen en cero; persisten en el fondo como dither de 1 bit o destello visual. Su ausencia habla como frecuencia de bajo nivel, afirmando que lo no medido sigue participando.
*   **Bancadas estacionales:** la membresía y el peso de voto de las bancadas del parlamento se recomponen dinámicamente siguiendo los ciclos estacionales del calendario fenológico.

### La distinción parlamento/vigilancia como afirmación arquitectónica

El pipeline empleado es: **sensor acústico → vectorización → contrato inteligente**.

Una afirmación arquitectónica importante de este trabajo es que *el mismo pipeline de sensado constituye vigilancia o parlamento dependiendo únicamente de la arquitectura de poder que lo rodea.* La vectorización y el sensado remoto no son intrínsecamente herramientas de extracción; pueden configurarse para establecer soberanía local, convirtiendo una malla de vigilancia en un sitio de representación.

### Inscripción no transable: el BioToken

El BioToken invierte la lógica de "tokenizar el planeta" de los créditos de carbono y las compensaciones de biodiversidad. Es:

*   Una **unidad de inscripción política** (participación) antes que un activo transable (mercancía).
*   Un protocolo no financiarizado diseñado para registrar acciones de conservación validadas y escucha profunda.
*   Un contramodelo construible frente a los "Protocolos de Estado Ecológico" especulativos y el Nature Fintech.

### Desintermediación del circuito ONG extractivo

El sistema enruta el valor de conservación y la soberanía de decisión directamente hacia la comunidad local y marginal (El Balzal, Córdoba, Colombia). La soberanía de los datos se mantiene local, y los límites honestos del sistema —como las dependencias y fronteras de la gobernanza a nivel de cadena— se hacen visibles en la interfaz en lugar de esconderse tras plantillas de UI con barniz verde.

### Gobernanza guiada por la fenología

En lugar de usar las taxonomías globales estandarizadas de la Lista Roja de la UICN como autoridad absoluta, el motor mapea el calendario estacional propio del bosque usando un inventario de 572 especies de la Reserva Manakai. El tiempo ecológico gobierna la síntesis: el peso estacional y la fracción de especies activas se retroalimentan hacia SuperCollider para accionar `harmonicRich` y `textureDepth`.

### Epistemología situada e investigación-creación

Enraizado en *SubAmérica* y la tecnodiversidad (Yuk Hui), el proyecto fusiona la Investigación-Acción Participativa (IAP, según Orlando Fals Borda) con gobernanza on-chain. El resultado se entrega como **objeto liminal de investigación** antes que como obra terminada, lo que lo hace reproducible y adaptable por otras comunidades territoriales.

---

## 2. Artefactos públicos desplegables

El proyecto se publica en tres repositorios de software y una herramienta de campo de cara a la comunidad:

*   **BiocracyEngine**: el motor central de síntesis audiovisual, proyección WebGL/Three.js y puente MIDI/OSC.
*   **bioacoustic-scripts**: el parser web3 en Python y las herramientas de extracción de vectores de características de audio.
*   **dIAP (IAP Decolonial)**: protocolos descentralizados de investigación-acción y herramientas de asamblea on-chain.
*   **Biomap SoundWalk App**: un instrumento participativo de escucha y conservación. Convierte caminatas sonoras guiadas en la Reserva Manakai en actos registrados de presencia ecológica, fusionando escucha profunda y monitoreo acústico pasivo (PAM) en una sola herramienta de campo. La app lleva la capa de incentivos, distribuyendo recompensas registradas en BioToken a la comunidad de El Balzal por acciones de conservación validadas, cerrando el bucle entre escucha, inscripción y sostenibilidad económica.

---

## 3. Arquitectura técnica y flujo de datos

```
Blockchain ETH
     │
     ▼
eth_sonify.py  (scraper web3 en Python)
     │  OSC → UDP:57120
     ▼
SuperCollider
  ├─ 1_server_config.scd   autodetección de dispositivo de audio
  ├─ 2_midi_control.scd    Faderfox LC2 → ~buses (42 CC)
  ├─ 3_synthdefs.scd       SynthDefs (opalKick/Perc/Drone/Dust/Bell)
  ├─ 4_gui.scd             GUI de SC (monoespaciada 1 bit) + mezclador matricial
  ├─ 5_beat_engine.scd     motor de beat evolutivo (pool melódico guiado por TX)
  ├─ 6_osc_handlers.scd    OSC entrante desde HTML/puente → ~buses
  ├─ 10_sample_system.scd  reproducción de samples/ + paulstretch
  ├─ 14_phenological_corpus.scd  corpus AudioMoth sobre el anillo de 365 días
  ├─ 17_chain_processing.scd     la cadena procesa las grabaciones del bosque
  └─ salida de audio → MOTU 828x o estéreo por defecto del sistema
     │
     │  eco OSC → UDP:3333  (~visualsDest)
     ▼
parliament-bridge.js  (Node.js, OSC↔WebSocket)
  │  UDP:3333  ← eco de SC / MIDI
  │  WS:3334   ↔ navegador
  │  HTTP:3335 /diag
  │
  │  traducción de rutas SC_TO_CH:
  │    /soneth/* → /ch/setXxx  (disparo de método)
  │    /parliament/* y /agent/* → paso directo sin traducir
  │
  ▼
navegador Electron nw_wrld  (parliament.html)
  │
  ├─ sliders HTML (34 sliders, 4 filas + Beat Engine)
  │    └─ input → sendOSC → WS → puente → bus de SC
  │           └─ patchStoreFromSlider → __applySonethToViz (rastreado por DIAG)
  │
  ├─ eco de SC → onmessage → __applySonethToViz (rastreado por DIAG)
  │
  └─ applySonethToViz(key, v)  ─────────────────────────────────────────┐
       │                                                                  │
       ├─ Slot 0  ParliamentStage.js   (Three.js)  ámbar + fósforo        │
       ├─ Slot 1  AsteroidWaves        (p5.js)  → __slot1Soneth          │
       ├─ Slot 2  LowEarthPoint        (Three.js)                        │
       ├─ Slot 3  PerlinBlob           (p5.js)  → __slot3Soneth          │
       ├─ Slot 4  TimeTravel           (p5.js)  → __slot4Soneth          │
       ├─ Slot 5  DynamicGraphs        (p5.js)  → __slot5Soneth          │
       ├─ Slot 6  DynamicOptimality    (p5.js)  → __slot6Soneth          │
       ├─ Slot 7  Geometry             (p5.js)  → __slot7Soneth          │
       ├─ Slot 8  MemoryHierarchy      (p5.js)  → __slot8Soneth          │
       ├─ Slot 9  Hashing              (p5.js)  → __slot9Soneth          │
       ├─ Slot P  PhenologicalCalendar (Three.js · módulo cargado aparte) │
       ├─ Slot F  DarkForest           (Three.js · módulo cargado aparte) │
       ├─ Slot B  Transito             (Three.js · módulo cargado aparte) │
       │          └─ inverso: caudal → /soneth/drone* → puente → SC       │
       ├─ Slot E  Estratos             (Three.js · módulo cargado aparte) │
       │          └─ directo: __phenoParams → bancada fija los estratos,  │
       │             activityThreshold → población, opacityFloor +        │
       │             seasonalWeight → qué especies están presentes hoy    │
       ├─ Slot R  Registro     (canvas · campo ASCII pretext × slot 6)    │
       │          └─ inverso: buffer → /soneth/memoryfeed, consenso →     │
       │             atmospheremix                                        │
       └─ Slot A  Antifonía            (Three.js · módulo cargado aparte)─┘
                  ├─ directo: /tide/state → densidad del coro, votos → la
                  │           sala habla, __ednaBio → peso por estrato
                  ├─ eventos: llamados → /antifonia/call → SC elige la grabación
                  └─ inverso: coro → /soneth/texturedepth, dispersión →
                              spatialspread, cuota máquina → noiselevel

MIDI (Faderfox Micromodul LC2) ──► buses SC ──► eco OSC ──► puente ──► navegador
```

### Slots 4–9 · los seis instrumentos

Los seis slots de estructuras de datos eran diagramas planos sobre cámaras ortográficas que leían *valores* de control y nunca el sonido. Ahora son las **seis voces del motor, una cada uno y sin repetir** — el instrumento desplegado en seis pantallas:

| Slot | Instrumento | Voz en SC | Registro |
|---|---|---|---|
| 4 | **DRONE** | `\opalDrone` | la cama sostenida |
| 5 | **CAMPANAS** | `\elektronBell` | pads |
| 6 | **PERCUSIÓN** | `\opalPerc` | pulso |
| 7 | **BOMBO** | `\opalKick` | sub |
| 8 | **POLVO** | `\opalDust` | granular |
| 9 | **MUESTRAS** | `samplePlayer*` | grabaciones de campo |

Cada uno tiene una cámara en perspectiva que se puede orbitar, profundidad real en su geometría (las trazas del drone se alejan con la edad, la retícula de campanas respira en Z, el árbol se sostiene por capas, el bombo se irradia como frente de presión, la caché es una pila por la que se podría caminar, la tabla hash es un anillo) y la misma deriva en reposo que el resto de slots.

El nombre del instrumento solía **dibujarse dentro de la escena** como un sprite flotando sobre cada uno. Eso se eliminó: era un rótulo sobre una superficie de proyección, el único elemento en seis slots por lo demás sin palabras que se dirigía al espectador en vez de a la sala, y ocupaba el mismo tercio superior hacia el que proyecta la performance. La vinculación que anunciaba es la real y sobrevive intacta: cada slot sigue leyendo su propia banda del espectro y los onsets de su propia voz, según la tabla de arriba.

**Y ahora lo tocan.** Cada uno de los seis era un oyente: ligado a una voz, leyendo su banda y su onset, dibujando lo que oía. Ahora también *hablan*, desde sus propios eventos estructurales — la pantalla toca el instrumento:

| Slot | Voz | El evento propio de la estructura |
|---|---|---|
| 4 | DRONE | la retícula completa un barrido entero → un **parcial** sostenido se suma a la cama |
| 5 | CAMPANAS | se forma una arista — dos nodos que no estaban conectados ahora lo están |
| 6 | PERCUSIÓN | un nodo llega a su destino — un rebalanceo se ha completado de verdad |
| 7 | BOMBO | se adquiere un objetivo — un rayo cruza un barrido |
| 8 | POLVO | una capa desborda su propio nivel — bloques derramándose por el borde |
| 9 | MUESTRAS | una colisión de hash — y *cuál* bucket colisionó elige la grabación |

**Un slot toca la voz del motor, no un instrumento nuevo.** La primera versión las hacía separadas: alturas desde mapeos lineales independientes, envolventes desde literales, spawns sin agrupar. No mezclaban, y una de ellas no se movía en absoluto — `\elektronBell` limita su fundamental a 28–180 Hz (`3_synthdefs.scd:241`), así que un mapeo lineal a MIDI 48–84 cruzaba el techo en tono 0.15 y **el 85 % del rango tocaba una única altura idéntica**. Ahora:

- el **pad** se ajusta a la rejilla de semitonos y pliega octavas bajo 160 Hz igual que los pads de ETH, y se encola en `~padQueue` para que el drenaje le dé `\polyComp` — lanzarlo directo lo dejaba hasta 4.9× más fuerte que un pad concurrente del motor *y* corrompía la compensación `1/√n` del propio motor al quedar invisible para `~padLive`;
- la **percusión** toma de `~computePitchPool` × `~speciesBand`, el modo propio del motor, en vez de un barrido continuo que tocaba esas notas por coincidencia;
- el **bombo** recorre los siete pasos discretos del motor (45.5–54.5 Hz) y resuena sus 0.9–1.3 s en lugar de chasquear durante 0.28;
- todo se lanza dentro de `s.makeBundle(s.latency, …)`, como cada voz del motor.

**El slot 4 añade un parcial; no re-afina la cama.** Antes llamaba a `~opalDroneSynth.set(\freq, …)` — un segundo dueño de un nodo que el motor de beat recorre cada cuatro compases, sin arbitraje alguno (`\drone` es la única voz que el motor nunca estampa en `~lastVoiceAt`). Con un glissando de 4 segundos (`droneFade × 2`) la cama pasaba la mayor parte de su vida en tránsito y nunca llegaba. Ahora lanza su propio `\opalDrone` de amplitud baja, con tope de dos concurrentes y liberado a los nueve segundos. Un dueño para cada cosa.

**Un slot habla ante una EXCURSIÓN, no ante un cambio.** Estas cuentas fluctúan en cada cuadro — el slot 6 suma `Math.random()` a las posiciones de los nodos en la línea siguiente a contar cuáles han llegado, así que "llegado" es ruido de cuadro por construcción. Un ingenuo "¿ha subido desde la última vez?" resulta entonces verdadero siempre que se reabre la compuerta de tasa, y la compuerta deja de ser un límite para volverse el reloj: medido, el slot 6 disparaba 8 veces por segundo (una vibración) y el slot 7 a unos 83 BPM clavados (una caja de ritmos). Ninguno era la estructura hablando; ambos eran el limitador de tasa. Cada slot corre ahora un disparador Schmitt sobre una línea base lenta — la medida tiene que subir ~35 % por encima de lo que ha venido haciendo, y volver a bajar antes de poder hablar de nuevo. Medido después: 0.05–1.35 onsets/s, irregular.

**El slot no decide si la nota ocurre.** El motor de beat ya es dueño de cuándo hablan bombo, percusión y polvo, y el manejador de ETH es dueño de la campana; un slot decidiendo lo mismo sería un segundo dueño de una sola regla, que es el fallo que este código no para de tener que deshacer — los siete toggles `/rhythm/` que se eliminaron por eso, la exclusividad de la marea impuesta en exactamente un lugar.

Así que un slot *solicita*, en `/slot/voice [voiceIdx, amp, tone]`, y `15_slot_voices.scd` decide. Tanto el motor como el planificador estampan un reloj de onset compartido, `~lastVoiceAt`, y una solicitud que cae dentro del hueco mínimo de una voz se descarta en lugar de superponerse. Un slot sólo puede hablar, por tanto, donde el motor ha dejado sitio — el pulso sigue siendo del motor, la puntuación es del slot. Medido: un emisor desbocado a 100 solicitudes por segundo queda topado en 13.7 onsets/s sobre `dust`, y un slot pidiendo un bombo inmediatamente después de que el motor disparara uno es rechazado.

Los huecos se fijan por aquello *para lo que sirve* la voz, no por gusto: `drone` 6 s (un cambio de altura es estructural), `dust` 0.07 s (granular, debe poder enjambrar), `sample` 1.6 s (son grabaciones de campo de 30 segundos, y dos por segundo es un collage). `/slot/voices/enable 0` devuelve los seis a la escucha sin desmontarlos.

> **El disparo nunca viene del audio.** Un slot disparando su propia voz desde la energía de su propia banda es un bucle de realimentación: tocaría porque está tocando. Cada emisor lo acciona la simulación, que además es todo el sentido del asunto.

**Reaccionan al sonido, no a la intención.** `\masterScope` analiza el bus maestro *después* del limitador y envía 16 bandas espaciadas logarítmicamente a 20 Hz — eso venía llegando desde siempre sin que nadie escuchara, así que el espectrograma corría sobre su reserva sintética. Ahora alimenta `window.__scAudio`, y SC además emite `/voice/*` en el momento en que empieza cada nota. La energía en una banda dice que una campana está sonando; el onset dice que fue golpeada, y sin él todo lo visual llega tarde y emborronado.

Cada slot lee **su propio registro**, normalizado contra su propio pico reciente — un visual de bombo no debe iluminarse porque sonó una campana, y medido sobre un motor en vivo la banda grave corre unas 40× más caliente que la aguda, así que una lectura cruda deja los slots de agudos con aspecto de muertos mientras trabajan.

### Autorrotación en reposo · ROTATION SPD

El slider alcanza ahora **los dieciséis slots**. Antes llegaba exactamente a uno: el calendario fenológico, donde fija la tasa de barrido del año, que no es ninguna rotación.

`src/projector/vizMotion.ts` publica `window.__vizMotion` (mutado en sitio, igual que `__ednaBio`): `{ rotation, idle, factor, speed, angle, t }`. La interacción se captura una sola vez en el documento — `pointerdown`, `wheel`, `keydown`, `input`, en fase de captura — de modo que tanto el panel de control como un arrastre de cámara reinician el reloj, sin cableado por módulo. Tras **8 s en reposo** la deriva entra suavemente durante **4 s** (smoothstep, así que ni arranca ni se asienta con una esquina) y alcanza aproximadamente **una vuelta cada tres minutos** con `rotation = 1.0`.

Los siete slots con OrbitControls no necesitan nada propio: hay exactamente un `new OrbitControls` en todo el árbol, así que `helpers/threeBase.ts` activa `autoRotate` y alimenta `autoRotateSpeed` desde el valor compartido con un temporizador de 200 ms. Ese mismo cambio **eliminó el listener `"change"` → `render`**: con damping activo se disparaba en cada `update()`, así que cada uno de esos slots renderizaba el mismo cuadro dos veces.

Los nueve slots restantes recibieron cada uno un idiotismo propio en lugar de un giro literal — un gráfico plano que se inclina despacio se lee como roto. El slot 1 deriva la fase de su campo de ruido; los slots 4 y 7 suman a su barrido de radar; el 5 y el 6 precesan; el 8 se inclina como un estante asentándose; el 9 precesa su anillo de buckets.

### Votos y consenso — los dieciséis

Los votos llegaban a 9 slots y se saltaban 7 (2, 4–9). El consenso estaba muerto en 5: el slot 1 lo ignoraba, el slot 8 nunca lo recibía, el calendario **no tenía ruta alguna**, y DarkForest y Antifonía lo escribían en un campo `coherence` que ninguna ruta de render leía. Ahora cada uno tiene una reacción en su propio vocabulario — un ping de radar, una cascada de aristas, un rebalanceo forzado, una onda de vaciado bajando por la jerarquía, un rehash forzado, una ondulación atravesando la nube de puntos; el consenso se vuelve alineación de ondas, coherencia de caché, quórum fenológico, rectitud del flujo, sincronía del coro.

**`"failed"` se manejaba en ocho sitios y no se producía en ninguno.** SC reporta resultados reales en `/parliament/vote/result`, y `parliamentStore` ya los ingería — el resultado simplemente nunca llegaba a `__voteEvent`. Ahora sí, de modo que una moción rechazada se ve distinta de una aprobada.

### Bucle de retroalimentación bidireccional

Cada cambio de parámetro se refleja en las tres superficies de control:

```
slider HTML ──► bus SC ──► perilla GUI de SC (actualización visual)
                    └──► eco OSC ──► slider HTML (sincronía de posición)
                                └──► applySonethToViz (16 slots)

CC MIDI ────► bus SC ──► perilla GUI de SC (actualización visual)
                  └──► eco OSC ──► slider HTML (sincronía de posición)
                              └──► applySonethToViz (16 slots)

perilla GUI ► bus SC ──► eco OSC ──► slider HTML (sincronía de posición)
                                 └──► applySonethToViz (16 slots)
```

### Procesos, puertos y roles

`start_ecosystem.sh` gestiona cuatro procesos, más el puente láser opcional:

| App | Proceso | Puertos | Rol |
|---|---|---|---|
| **Python ETH** | `eth_sonify.py` (venv) | → UDP **57120** | scraper web3; `/eth/note` + `/eth/tx_info` por tx, `/eth/block` por bloque |
| **SuperCollider** | `sclang start_sonification.scd` | entra **57120** (OSC) + **MIDI**; sale **3333**; scsynth **57110** | motor de audio, GUI, motor de beat, drone, limitador maestro |
| **Puente** | `parliament-bridge.js` (Node) | entra UDP **3333**; WS **3334**; sale UDP **57120**; HTTP **3335** `/diag` | OSC ↔ WebSocket, traducción de rutas |
| **Navegador** | webpack-dev-server + Electron | HTTP **9001**; WS **3334** | GUI `parliament.html`, store, slots visuales |
| **Láser** _(opc.)_ | `laser-bridge.js` (Node, `LASER=1`) | WS **3337** entrada; USB → DAC Helios | cuadros vectoriales → ILDA / láser sobre el bosque |

---

## 4. Matriz de control

**47 parámetros**, todos generados desde una sola entrada de registro cada uno (`~paramDefs` en `0_parameters.scd`): **42 CC MIDI** y **51 rutas OSC**. Cada slider, perilla o CC acciona a la vez los buses de audio de SC y las visualizaciones. Las diez primeras filas cruzan los slots visuales, dando 10 parámetros × 10 slots = 100 vinculaciones sólo en esa capa.

Las cifras las reporta el propio motor al arrancar (ver *Comprobación de arranque*); si este documento y el banner discrepan, manda el banner.

### Filas 1–2: rendimiento central + procesamiento ambiental (todos los slots)

| Parámetro | CC MIDI | Audio SC | Slot 0 Parliament | Slot 1 Asteroid | Slot 2 LowEarth | Slot 3 Perlin |
|---|---|---|---|---|---|---|
| **volume** | CC 0 | volumen maestro | intensidad de luz puntual | alfa del trazo de onda | opacidad de nube blanca | opacidad del trazo |
| **pitchShift** | CC 1 | freq ±2 oct | amplitud Z de especies | desplazamiento X de carril | estiramiento Y de nube | intensidad de ruido |
| **timeDilation** | CC 2 | estirado de envolvente ×0.5–6 | velocidad orbital | zoom X del ruido | amortiguación de rotación | cuadros por ciclo |
| **spectralShift** | CC 3 | barrido LPF 80–2400 Hz | umbral de bloom | tinte ámbar-cian | desplazamiento de tono de línea | compresión de capas |
| **spatialSpread** | CC 4 | paneo cuadrafónico I↔D | distancia de cámara | separación de carriles | dispersión XY de líneas | desplazamiento X/Y del blob |
| **textureDepth** | CC 32 | densidad granular | grano de película | densidad de líneas de rejilla | tamaño de punto | grosor de trazo |
| **atmosphereMix** | CC 33 | reverb 0–0.9 | amortiguación de estela | fantasmeo del fondo | opacidad de nube roja | número de capas |
| **memoryFeed** | CC 34 | realimentación de delay 0–0.8 | fuerza del bloom | alfa de la estela fantasma | opacidad de líneas rojas | alfa fantasma |
| **harmonicRich** | CC 35 | razón FM 0.1–5 | complejidad de Lissajous | superposición armónica | escala Z de Bézier | deriva de tono |
| **resonantBody** | CC 36 | Q del filtro 0.1–0.8 | aberración cromática | brillo del punto de pico | escala de nube roja | peso interior |

### Filas 3–4: drone y ruido

| Parámetro | CC MIDI | Audio SC |
|---|---|---|
| **masterAmp** | CC 5 | recorte de capa — pads, drone **y** motor de beat desde un solo control |
| **filterCutoff** | CC 6 | inclinación tonal amplia, por debajo del ajuste absoluto de `spectralShift` |
| **noiseLevel** | CC 7 | aliento de ruido rosa bajo el pad |
| **noiseFilt** | CC 8 | LPF del ruido 200–2000 Hz |
| **droneDepth** | CC 9 | cuánto se hunde el cuerpo del sub |
| **droneFade** | CC 37 | tiempo de glissando en los controles propios del drone — **incluida su altura** (ver abajo) |
| **droneSpace** | CC 38 | tamaño de sala de la reverb |
| **droneMix** | CC 39 | drone seco ↔ plenamente florecido (lavado + sub) |
| **delayFeedback** | CC 40 | realimentación del delay de peine |
| **transactionInfluence** | CC 41 | cuánto dobla la actividad de la cadena al motor |

> Seis de estos (CC 5, 6, 9, 37, 38, 39) escribían antes en buses de control que **ningún UGen leía** — `\opalDrone` no los declaraba y `\elektronBell` los leía hacia variables que descartaba. Ahora dan forma al drone.

> **El drone se desliza entre alturas.** Cada cuatro compases el motor de beat recorre `#[55, 62, 73, 82, 49, 65, 55, 41]` Hz según el contador de frases —más o menos cada 45 a 50 segundos al tempo habitual— y lo hacía con un `.set(\freq, …)` pelado. `freq` era el único parámetro de `\opalDrone` sin lag, así que una voz que llevaba casi un minuto sosteniendo una nota saltaba una quinta o una sexta al instante, lo que en un drone continuo se lee como avería y no como cambio. Ahora cabalga sobre `droneFade` como todos los demás controles continuos de ese SynthDef, al doble — un movimiento de altura necesita bastante más tiempo que uno de filtro para dejar de sonar a edición. Con el valor por defecto de 2 s eso da un portamento de 4 s; arriba del todo el fader lo lleva a 10.

### Fila 5: Cámara Fenológica de lo Vivo — el corpus sobre el anillo de 365 días

`14_phenological_corpus.scd` reproduce 261 clips AudioMoth de La Luna / Planeta Rica a lo largo del anillo fenológico del Artículo 42. Sólo **34 de 365 días llevan grabación**; los otros 331 son silencio, y bajo el Artículo 44 ese silencio es el material dominante de la pieza, jamás interpolado.

| Parámetro | CC MIDI | Audio SC |
|---|---|---|
| **activityThreshold** | CC 10 | Art. 45 — una presencia por encima de 0.5 enciende el escaño; por debajo, la especie está en el territorio pero callada en la Cámara |
| **windowWidth** | CC 11 | Art. 43 — alcance gaussiano en días del anillo. 0.4 deja las grabaciones como puntos aislados en el silencio; 2.5 permite que un día real se oiga desde el otro lado de un hueco (nunca inventa uno) |
| **seasonalBias** | CC 12 | inclina la selección hacia Seca (−1) o lluvias (+1) con independencia del cursor |
| **absenceWeight** | CC 13 | Art. 44 — en 0 deja los días sin grabación verdaderamente mudos; por encima suenan la capa ultrasónica ×8, así que lo que llena el silencio es lo que el oído humano no alcanza |
| **pulseGain** | CC 14 | Art. 45 — con cuánta fuerza el *quórum sensible* empuja de vuelta hacia `harmonicRich`, `textureDepth` y `/bio/consensus` |
| **opacityFloor** | CC 15 | Art. 47 — subirlo retiene más del corpus frente al análisis, la proyección y el láser |
| **bancada** | CC 16 | Art. 43 — 0 = todas, luego los cuatro roles ecológicos del detector |
| **phenoRate** | CC 21 | velocidad del anillo en días/segundo. Por defecto 0.0167 = un día por minuto = un año de 6 h 05 m; rango completo 91 s → 48 h |
| **corpusLevel** | CC 22 | las grabaciones de campo frente a la síntesis |

> Antes de esta capa, cinco de estos buses (`windowWidth`, `seasonalBias`, `absenceWeight`, `pulseGain`, `opacityFloor`) estaban asignados y eran alcanzables por MIDI y OSC pero tenían **cero lectores en SuperCollider**. El corpus es aquello para lo que se construyeron.

**El anillo responde mientras el día todavía corre.** Cada control de esta fila se consulta en un solo lugar — `~phenoPool`, llamado una vez por día fenológico — y el anillo solía dormir el día entero en un único `wait`. Al ritmo por defecto eso son sesenta segundos entre girar una perilla y oírlo, y ocho minutos en el extremo lento, así que toda la bancada se leía como no cableada. El mismo fallo golpeaba al transporte por el otro lado: **NEXT REC. DAY ▶** fijaba el cursor correctamente y la rutina se lo dormía encima (el log muestra dos `skip -> doy 211` con pocos segundos de diferencia y el día en sí llegando mucho más tarde).

El anillo sigue girando a `phenoRate`. Lo que cambió es que la espera está troceada (0.25 s), y en cada trozo la Cámara vuelve a preguntar quién está admitido *hoy*:

* **las solicitudes de salto se atienden de inmediato** — `/pheno/next`, `/pheno/goto` y el botón despiertan al anillo y liberan lo que esté sonando, así que el salto es audible en lugar de quedar sepultado bajo un clip al que le faltan cincuenta segundos;
* **la selección se vuelve a decidir dos veces por segundo**, comparada por clave de clip, así que un barrido de perilla arranca sólo lo que acaba de cruzar el umbral de verdad y detiene sólo lo que ha caído por debajo — nada se redispara mientras arrastras;
* **`pulseGain` se recoge sobre una banda muerta** en lugar de una vez al día, así que el aliento inverso sigue al fader sin pelearse con el `harmonicRich` de quien toca.

> **Liberar una voz del corpus exige una compuerta negativa.** Ambas envolventes del corpus son `Env.new([0,1,1,0], …)` —longitud fija, sin nodo de liberación— y para esas EnvGen trata `gate` como disparo puro: `.set(\gate, 0)` no hace absolutamente nada y el clip se reproduce entero con su atk+hold+rel. La liberación forzada es `gate < 0`, a lo largo de `-1.0 - gate` segundos. `~phenoPanic` siempre había usado una compuerta en cero, que es la razón por la que `/pheno/stop` detenía el reloj del anillo y dejaba todas las voces sonando.

**Dos rutas de reproducción, porque 384 kHz no es opcional.** Un clip AudioMoth de 60 s son 92 MB como Buffer de servidor — el corpus serían 24 GB residentes. Nada lee los originales en tiempo de ejecución; dos niveles derivados sostienen la capa:

* `corpus/audible/` (48 kHz) alimenta un pool fijo de 16 ranuras en RAM recicladas por la anticipación del anillo. No se asigna nada en el momento del disparo.
* `corpus/expanded/` (expandido ×8 en el tiempo) se transmite con `DiskIn` para la voz de ausencia — 4 buffers de cue, ~2 MB.

Coste residente ≈ 230 MB, de modo que `memSize` y `numBuffers` quedan sin cambios.

> **Por qué la expansión se hornea fuera de línea.** `DiskIn` no realiza conversión de frecuencia de muestreo, así que apuntarlo a un archivo crudo de 384 kHz en un servidor a 48 kHz expande ×8 gratis — un truco tentador, y equivocado. Baja *todo* tres octavas, así que la banda audible fuerte aterriza en 125 Hz–2.5 kHz y sepulta el ultrasonido que pretendía revelar. El renderizador aplica un pasa-altos a 38 kHz (24 dB/oct) **antes** de expandir, así que sólo llega lo que era genuinamente inaudible, a 4.75–24 kHz.

**Escalonado de ganancia.** `~trimCorpus = 2.60 × ~trimMaster`, medido y no adivinado. Los siete MP3 de `samples/` promedian −22.2 dB de media; `corpus/audible/` promedia −21.3 dB tras la ganancia global única — dentro de ~1 dB, así que paridad de trim es paridad de sonoridad. Como `corpusLevel` se sitúa en la ruta de esta capa y por defecto vale 0.5, el trim compensa: la capa aterriza a ~1 dB de la capa de samples con el fader en su valor por defecto y ~6 dB por debajo de la cama del drone, dejando la mitad superior del fader como margen real.

La compilación aplica **una ganancia global sobre todo el corpus**, nunca normalización por clip — una noche seca y callada tiene que seguir callada frente a un coro de insectos en lluvias, ya que `activity` y `richness` son exactamente la señal que la normalización por clip aplanaría.

Construye la biblioteca derivada (~4.2 GB, una sola vez) con:

```bash
python3 tools/build_corpus.py --dry-run   # cuentas y tamaños proyectados
python3 tools/build_corpus.py             # renderiza + escribe corpus/manifest.json
```

Transporte del anillo: `/pheno/goto <doy>`, `/pheno/next`, `/pheno/stop`, `/pheno/start`.

> **El anillo abre en un día grabado.** Sólo 34 de 365 días llevan audio y el primero es el doy 9, así que arrancar el cursor en el doy 1 significaba que el instrumento empezaba con ocho minutos de nada — y como los dos arcos están separados por huecos de 178 y 131 días, puede después quedarse en silencio hasta **tres horas** al ritmo por defecto. La ausencia es el material (Art. 44), pero hay que llegar a ella, no arrancar dentro. `/pheno/next` y el botón **NEXT REC. DAY ▶** saltan al siguiente día que efectivamente tiene audio.

### Cámara de las Especies — los cinco escaños, como voces

Sliders sólo de navegador (sin CC MIDI), cinco especies × dos controles, tomados del padrón UICN en vivo. Durante todo el tiempo que existieron emitían `/agents/species/*` hacia UDP 57120 donde **ningún OSCdef los recibía** — el `/diag` del puente mostraba 30 mensajes enviados y nada de vuelta — así que `FREQ` leía un `440Hz` fijo y `VOT` un `0` fijo en cada sesión.

| Control | Emite | Efecto en SC |
|---|---|---|
| **Species Activity** (×5) | `/agents/species/activity [id, v]` | pondera cada cuánto se elige ese escaño para un golpe de percusión |
| **Species Presence** (×5) | `/agents/species/presence [id, v]` | con cuánta fuerza habla el escaño, y es dueño de un registro |
| **eDNA Biodiversity** | `/agents/edna/biodiversity [id, v]` | lectura del sitio; devuelta con una validación que decae |

El corpus no puede cargar taxonomía — está indexado por *rol* ecológico, que es la razón por la que las bancadas del Artículo 43 se etiquetan por rol. Así que una especie se vuelve audible en la capa de percusión, donde ya existen un pool de alturas y un disparo. La división del trabajo es deliberada: el **pool** sigue eligiendo el grado y el **escaño** sólo elige el registro. Una especie no puede sobrescribir la melodía; puede decir en qué octava la oye la cámara.

`~speciesBand` es `[1.0, 1.33, 1.78, 2.37, 3.16]` — pasos de ~5 semitonos, sólo hacia arriba, escaño 0 al unísono. Medido contra el pool real en vez de adivinado: un conjunto simétrico alrededor de 1.0 dejaba los escaños bajos por debajo del suelo de 40 Hz que impone `\opalPerc`, y en la parte baja del fader `harmonicRich` dos o tres de ellos colapsaban sobre 40 Hz y se volvían la misma voz (21 notas recortadas, razón entre escaños adyacentes 1.00 — idénticos). Sólo hacia arriba no recorta nada y mantiene un 1.33 completo entre escaños en todo el rango del fader, rematando cerca de 780 Hz. El unísono en el escaño 0 significa que el registro original de la capa no se pierde, sólo queda asignado al primer escaño — que, con las presencias por defecto, es además la elección más probable.

**Una especie vota sonando.** `~speciesVotes[i]` se incrementa en el momento del golpe, y el escaño informa de vuelta en `/agent/species/state [id, presence, activity, votes, freq]` desde la emisión regulada que el motor ya tenía. `parliamentStore.ts` ha parseado ese mensaje, en exactamente ese orden de argumentos, desde que se escribió — simplemente no tenía emisor.

### BioToken V3 — la fórmula muestra sus propios términos

La fórmula del panel era texto estático y contradecía al código que describía: decía `Presencia × Duración` donde `bioTokenTerms()` siempre ha multiplicado por *actividad*, e imprimía UICN como el multiplicador crudo `×5` cuando el factor aplicado es ese entre 5. Dos de sus seis factores eran constantes congeladas que quedaron atrás cuando se retiraron los paneles Fungi Networks y Gaia AI Core. Cada término lleva ahora su valor vivo al lado:

| Término | Origen |
|---|---|
| Presencia | media de `species[].presence` |
| **Actividad** | media de `species[].activity` — reetiquetado desde "Duración" para coincidir con el código |
| eDNA.biodiv | media sólo sobre los sitios **expuestos** — promediaba los ocho cuando sólo Córdoba tiene fader, así que siete 0.5 congelados amortiguaban el token permanentemente |
| Fungi.chem | ← `/bio/nutrient`, el pulso micelial que el panel Eco ya muestra |
| AI.optim | ← `/bio/density`, densidad de transacciones |
| IUCN.weight | `max(IUCN_MULT) / 5`, mostrado normalizado |

### Fila 7: la cadena como proceso — `chainProcess`

| Parámetro | CC MIDI | Audio SC |
|---|---|---|
| **chainProcess** | CC 23 | 0 es el corpus intacto; 1 es el corpus plenamente procesado por lo que la cadena está haciendo |

Hasta aquí el acoplamiento corría: cadena → voces de síntesis. Llegaba una transacción, su valor se mapeaba logarítmicamente a una nota MIDI, su gas a una velocidad, su prioridad a una envolvente, y sonaba una campana. Tres escalares por transacción. Mientras tanto el corpus —261 grabaciones del sitio real— estaba en una capa aparte, meramente planificado por un calendario, sin que la cadena lo tocara.

Eso desperdiciaba los datos: una auditoría de lo que envía `eth_sonify.py` encontró que `blockHash`, `calldataLen` y `nonce` se parseaban y no los leía nadie, mientras `entropy`, `blockNum` y `blockTxCount` se computaban y sólo se imprimían en la línea del monitor. Y apuntaba la pieza al revés. La afirmación de la obra es que la cadena actúa SOBRE un territorio; hacer que la cadena toque junto al bosque, sobre un conjunto separado de instrumentos sintetizados, afirma lo contrario: dos partes tocando juntas.

Así que el corpus es el material y la cadena es lo que se le hace. Tres dimensiones, y ninguna de ellas es una nota — todas son condiciones:

| Lectura de la cadena | Fija |
|---|---|
| `entropy` | **DIFUSIÓN** — una cadena que llega de forma pareja deja la grabación legible; una a ráfagas la emborrona hasta que el bosque es un lavado de donde solía estar |
| `calldataLen` | **VENTANA DE EMBORRONADO** — cuánto sangran las magnitudes a lo ancho del espectro, de modo que un acto que sólo mueve dinero apenas roza la grabación y uno que ejecuta algo la arrastra de lado |
| `congestion` | **DRIVE y filtro** — llenado del bloque contra la tarifa base: la presión sobre la cadena se vuelve presión sobre la grabación |

Las dos voces del corpus se enrutan a `~corpusProcBus` para poder procesarse como **grupo**; antes escribían directo a la salida principal (`Out.ar(0, …)` cableado en ambas), que es exactamente la razón por la que nada podía colocarse a lo ancho de la capa. `~corpusOutBus` vale 0 por defecto, así que si este archivo no llega a cargar el corpus sale directo como siempre.

### Fila 8: mezclador matricial — los únicos controles que cambian la sonoridad

| Parámetro | CC MIDI | Capa |
|---|---|---|
| **mixDrone** | CC 42 | `\opalDrone` — la cama continua |
| **mixPad** | CC 43 | `\elektronBell` |
| **mixKick** | CC 44 | `\opalKick` |
| **mixPerc** | CC 45 | `\opalPerc` |
| **mixDust** | CC 46 | `\opalDust` |
| **mixSample** | CC 47 | `samples/` vía `\samplePlayer*` |
| **mixCorpus** | CC 48 | la capa audible de AudioMoth |
| **mixUltra** | CC 49 | la voz de ausencia ×8 |

Todos los demás controles de la superficie dan forma al **timbre**. Antes de esta fila, el balance entre capas vivía sólo en el presupuesto de ganancia cableado de `3_synthdefs.scd` (`~trimDrone`, `~trimPad`, …), fijo en tiempo de carga e inalcanzable mientras se toca — de modo que el instrumento no podía mezclarse.

El unísono es **1.0 a media carrera**: al arrancar estos multiplican por exactamente 1 y el motor suena como antes. `0` es un mute verdadero, `2.0` es +6 dB. Multiplican los trims en lugar de reemplazarlos, así que el presupuesto de ganancia documentado sigue teniendo sentido. Medido sobre la capa del drone: unísono 0.0262 RMS, 0.5 → 0.0132 (−6 dB), 2.0 → 0.0531 (+6 dB), 0 → silencio.

Las tiras de la GUI de SC llevan un **MUTE** que recuerda la posición del fader, así que quitar el mute restaura el nivel exacto. Los faders del mezclador aparecen en ambas superficies y siguen a MIDI, navegador y cargas de preset por la misma ruta `~setParam` que cualquier otro control.

### Slot A · Antifonía — el parlamento acústico del bosque

La antifonía es canto alternado entre grupos: un fenómeno bioacústico real (dueto) y la forma más antigua de parlamento, hablar por turnos. Cada fuente sonora es un miembro tomando la palabra, y una sesión dura un día.

**El eje vertical es la altura.** Reutiliza los mismos estratos de Humboldt que ordenan DarkForest [F] y Estratos [E] — quien canta, canta *desde* una altura: el aullador desde las copas emergentes, la rana desde el sotobosque, el murciélago cruzando el dosel. Un llamado a 20 m aterriza en el dosel en los tres slots, y una comprobación verifica que la pila no se ha desalineado entre ellos.

**El rodal es un barrido LiDAR simulado**, no decorado: una ceiba (*Ceiba pentandra*) de fuste limpio y copa aterrazada plana, campanos (*Albizia saman*) en domos de sombrilla más anchos que altos, ~50 árboles de dosel ordinarios de bosque seco, y exactamente dos palmas de vino (*Attalea butyracea*) — unos 57 árboles, contados en tiempo de ejecución y publicados en `window.__antifoniaStand`. La composición exacta se desplaza cuando algo aguas arriba cambia cuántos números ha sacado el generador sembrado, que es la razón por la que se *cuenta* y se verifica en vez de declararse: así fue como un cambio en la ceiba dejó las palmas en cero en silencio, ya una vez. Están **sembrados, no colocados**: núcleos de regeneración esparcidos por el lóbulo, cohortes apiñándose hacia dentro, y una prueba de exclusión mínima para que dos copas no ocupen el mismo metro cúbico. Una lista de posiciones escrita a mano se leía como maqueta — espaciado uniforme, y la ceiba sola en un claro que nadie plantó. Ahora se alza descentrada con su séquito tocándola, porque un emergente vive rodeado. Se simula un vuelo aéreo (el dosel retorna con fuerza, el suelo moderadamente, los fustes verticales apenas), porque esa asimetría es lo que hace que una nube aérea se vea como se ve. El límite del suelo es **amorfo** — muestreo polar con un lóbulo angular, adelgazado en el borde para que la parcela se desvanezca en lugar de terminar en un canto cartesiano.

**La copa de la ceiba es asimétrica, y eso es estructural.** Sus terrazas se construían como ruedas — *N* ramas a pasos angulares exactos, todas de la misma longitud, todas concéntricas al eje. Desde arriba, un barrido de radar; desde el frente, cinco discos concéntricos. Ningún emergente se ve así: una ceiba de cuarenta metros ha perdido ramas, las que quedan son de longitudes muy distintas, y cada terraza se inclina hacia la luz que encontró. Ahora cada rama se describe antes de sembrarse — paso angular irregular, su propia longitud, su propia caída, su propia curva en planta, y una probabilidad de una entre seis de sencillamente faltar — y los puntos se distribuyen por *longitud* de rama, porque distribuirlos por rama haría que un miembro corto fuera tan denso como uno del doble de tamaño, que es la misma simetría disfrazada. Medido sobre los puntos y no sobre la fuente: la copa antigua alcanzaba 0.74–0.93 R en los 24 sectores de azimut (CV 0.06); ahora alcanza 0.00–1.09 R (CV 0.41), con cielo entre los huecos.

La nube es deliberadamente **escasa y de punto pequeño**: no un levantamiento, sino lo que la máquina alcanza a ver del bosque — una presencia espectral antes que un modelo. Sembrada, así que el rodal es idéntico en cada arranque. Seis `THREE.Points`, uno por estrato, barajados al construir para que el LOD adaptativo pueda recortar el rango de dibujo en un submuestreo uniforme sin regenerar nada. El viento mece cada estrato (más con la altura, accionado por la bancada de geofonía) moviendo **seis posiciones por cuadro** — no se toca ni un vértice. Medido a **8.3 ms de mediana, igual que DarkForest y Estratos**.

Cada llamado ilumina el estrato del que vino, así que el bosque es el cuerpo que habla y no el telón frente al que habla.

**Cada llamado es una vela japonesa** — la de un gráfico bursátil. Mecha fina de máximo a mínimo, cuerpo grueso donde se asienta la energía, rellena si cerró por encima del llamado anterior de su propia especie y atenuada si por debajo. El "precio" es la frecuencia. No es un chiste visual: el motor ya sonifica una blockchain, y meter el bosque en el mismo instrumento con que se cotiza una divisa dice en voz alta lo que hace todo el aparato — intentar medir la naturaleza en tiempo real, con la herramienta equivocada, dejando la costura a la vista.

Las velas están **inmersas**. La fauna se dibuja como **retornos LiDAR igual que todo lo demás** — agrupaciones más densas del mismo fósforo blanco, no siluetas pintadas: cada marca de esta escena viene del mismo escaneo. El aullador canta desde **un aullador (*Alouatta seniculus*) moviéndose por las ramas de la ceiba** — un animal, no dos. Dos del mismo tamaño moviéndose por la misma copa se leen como pareja emparejada, que es una relación decorativa; uno es una presencia. Se dibuja a 0.85 del tamaño que tenía, y como `PointsMaterial` atenúa por distancia y no por transformación de objeto, encoger al animal **no** encoge sus retornos: una agrupación más pequeña de los mismos puntos, que es lo que daría un escaneo real. Tiene cuerpo, cabeza y cola prensil, y pausa largo entre movimientos como hace el animal. Sólo puede estar en la ceiba, porque es el único emergente: el mismo confinamiento que ya gobernaba al llamado, ahora visible. Otras fuentes de dosel cantan desde un **ave que efectivamente cruza el rodal** — siete de ellas vuelan a altura de dosel y emergente, batiendo alas, y el cielo se vacía fuera de sus horas. Primero ves quién habla, después qué dijo. A falta de un ave, el llamado toma una **percha**: un árbol de este rodal lo bastante alto como para alcanzar su estrato. La aeronave no tiene percha — está en la atmósfera, que es lo que es.

El **suelo** tiene habitantes ahora: un **paujil piquiazul** (*Crax alberti*, CR endémico) camina entre los fustes en vez de volar, y una **fila de hormigas arrieras** (*Atta cephalotes*) cruza del nido al árbol. Ambos tienen voz — el paujil un bum grave en el registro donde vive el bombo, las hormigas una estridulación aguda y tenue. Atta cultiva hongos, así que la fila **ilumina el micelio por el que pasa**: los dos elementos son un sistema en lugar de dos decoraciones.

El **micelio** corre bajo tierra y sigue más allá de la parcela y fuera de cuadro por todos los lados. Que se vaya es la afirmación, no un descuido de encuadre: la red no reconoce el lindero del predio ni el viewport. La unidad que el ojo cree estar mirando —este rodal, este rectángulo— es un corte administrativo sobre algo continuo. El bosque de arriba se puede encuadrar; el de abajo no. Está dividido en **siete subredes, cada una ligada a su propia banda del espectro maestro en vivo**, así que distintos caminos se iluminan con distintas partes del sonido y la red se lee como portadora de tráfico en lugar de respirar como un solo cuerpo — el "pulso" que tenía antes era un seno libre atado a nada. Los onsets de bombo y polvo dan los destellos, la energía de banda el sostenido. Siete escrituras de opacidad por cuadro; una actualización por vértice serían ~200 KB/cuadro, 350× los sistemas del ave y el aullador juntos.

**La frecuencia no pelea por ese eje.** Cada llamado es un glifo cuya longitud es su ancho de banda; el espectro se lee como morfología. Una franja aparte a lo largo del borde inferior lleva el tiempo en x y la frecuencia logarítmica en y — el nicho acústico, especies repartiéndose bandas y horas para no enmascararse entre sí.

**Tres bancadas, no una.** Biofonía, geofonía y antropofonía. La máquina no es una intrusa en esta cámara; es la tercera bancada, y su ruido crece hacia lo ambiental a través de las transiciones de escucha profunda en lugar de sentarse al lado. Cuando la marea sube habla el bosque; cuando baja, la máquina sostiene el aire. Esa inversión es literal: el peso de aparición de la antropofonía lo acciona `(1 - tide)`.

**Suena de verdad — y ahora con la voz propia del bosque.** Sale un llamado en `/antifonia/call`, y **SuperCollider elige la grabación** (`16_corpus_calls.scd`).

Doce fuentes compartían siete MP3: cuatro especies se repartían solas la cama de *aves*, y LLUVIA y VIENTO llevaban `smp: -1`, dibujadas en pantalla y sin sonar jamás. El corpus construido a partir del levantamiento AudioMoth guarda 261 clips del sitio real, y el slot A no podía alcanzar nada de eso — el anillo de `14_phenological_corpus.scd` reproduce ese material sobre el calendario de 365 días, que es un calendario y no un llamado.

El banco lleva ahora **116 granos de dos segundos** (ya cortados por `build_corpus.py` desde los eventos de mayor confianza de cada día del anillo) y **seis stems de geofonía**, así que la lluvia y el viento por fin tienen grabación. ≈114 MB residentes.

**El mapa especie→rol vive en SuperCollider**, porque el corpus lleva roles ecológicos y *ninguna taxonomía* — el mismo hecho que obliga a que las bancadas del Artículo 43 se etiqueten por rol. Un llamado dice por tanto *quién* habla y *a qué hora*; SC decide qué grabación responde:

| Fuente | responde desde |
|---|---|
| aullador · rana · murciélago | `nocturnal_voice` (el murciélago sesgado hacia clips que llevan ultrasonido) |
| chicharra · arriera | `insect_chorus` |
| aves · oropéndola · paujil | `dusk_` / `dawn_chorus_participant` |
| **lluvia · viento** | **stems de geofonía** |
| avión · cinta | sus MP3 — el corpus no tiene antropofonía que ofrecer |

La selección pondera la confianza frente a la **proximidad horaria sobre un anillo de 24 horas**, mediante una gaussiana de σ ≈ 3 h, más o menos el ancho de un coro del amanecer. Primero se probó una caída lineal y no funciona: abarca sólo 5× a lo largo de todo el reloj, y el corpus es tan nocturno que la masa de clips lejanos le ganaba el voto a los cercanos — un llamado a las 20 h seguía sacando un grano mediano de las 03 h. La gaussiana da ~8×, que es la diferencia entre una preferencia y un error de redondeo.

**El Artículo 47 se aplica antes de elegir el clip y otra vez dentro de la voz.** `opacityFloor` (CC 15) filtra el pool elegible exactamente como lo hace para el anillo, y `samplePlayer*` lleva ahora el mismo velo que `\corpusVoice` ha tenido siempre — ese SynthDef no tenía *ninguno*, así que enrutar material grabado por él habría sonado lo que la Cámara había retenido. Medido: un suelo de 0 admite 114 de 122 entradas del corpus, 0.5 admite 73, 0.8 admite 23.

Un llamado **abre una ventana hacia** la grabación en lugar de truncarla. Cinco de los siete MP3 son camas de paisaje sonoro de 51–360 s, no llamados aislados, así que la duración de un llamado da forma a una envolvente —ataque, sostenido, liberación— sobre un extracto tomado de un desplazamiento variable. Antes la duración era un `.free` duro, que cortaba un aullador de 51 segundos tras el 3 % de sí mismo y sin liberación alguna: un clic de banda ancha en cada llamado, y como la reverb y el delay viven *dentro* de la voz, el espacio acústico desaparecía con él.

> **La envolvente ahora tiene que caber en la grabación.** Su extensión es atk+hold+rel ≈ 2.15 × el sostenido, y esa extensión no se computaba en ninguna parte — sobrevivible mientras todos los archivos duraran 51–360 s, equivocada en el momento en que llegó un grano de 2 segundos: se volvía dos segundos de bosque seguidos de ocho de silencio reteniendo una de doce voces. La extensión se construye explícitamente ahora y se escala al material cuando se pasa. Lo que además hace por fin cierto lo que esta sección siempre afirmó: los dos MP3 cortos (ranas 4.9 s, oropéndola 6.2 s) se oyen **enteros**. No se oían — una envolvente de 10.75 s sobre un archivo de 6.2 s se salía de su propio final.

Sólo la biofonía se publica en `__activeSpecies`: la lluvia no es una especie y una aeronave tampoco, y ese campo alimenta el censo vivo del parlamento y la cláusula de opacidad del láser.

Inspirado en **AveRosetta™** (NeotropicalScience), un visualizador de comunicación forestal que cruza una nube LiDAR con llamados anotados. Aquí no se usa código ni datos de AveRosetta; la deuda es conceptual y se acredita en pantalla.

Las anotaciones reales entran en `assets/json/antifonia_calls.json` (esquema en la cabecera del módulo); a falta de eso, la sesión se genera desde la tabla fuente.

### Marea — el arco de densidad

El ritmo no es una rejilla. No hay patrón de pasos decidiendo qué suena; un oleaje lento decide qué tan *probable* es cualquier onset, y los eventos se colocan por probabilidad con ±45 % de un tick de jitter para que nada caiga sobre un pulso audible. El bombo sólo puede ocurrir donde la cadena misma tiene una costura —un bloque nuevo— e incluso ahí sólo con probabilidad `tide²`, de modo que el extremo grave está presente en la cresta y ausente en el valle.

El arco se mide en **bloques**, no en segundos, así que queda enganchado a la cadencia propia de la cadena en lugar de derivar contra ella cuando la red se acelera o se atasca.

| Control | OSC | CC MIDI | Efecto |
|---|---|---|---|
| **ARCO CORTO** | `/tide/short` | CC 17 | ~3.5 bloques (40–50 s) |
| **ARCO MEDIO** | `/tide/media` | CC 18 | ~8 bloques (1.5–2 min) — por defecto |
| **ARCO LARGO** | `/tide/larga` | CC 19 | ~25 bloques (4–6 min) |
| **PULSO** | `/tide/pulse` | CC 20 | latido de sub-graves, uno por bloque, atraviesa los valles |

Los tres arcos son **mutuamente excluyentes, y SC es dueño de esa regla** — se impone una sola vez en `~setParam` (`exclusiveGroup`), la única ruta de escritura que todas las superficies ya comparten, así que marcar uno en el navegador también desmarca los otros en la GUI de SC y bajo MIDI. El navegador sólo refleja el eco; nunca impone. Los tres apagados es un estado legal: densidad plana, sin oleaje.

Obsérvalo en `[MON]`: `tide:<arco>/<fase>=<oleaje>` y `puls:`.

### Escalonado de ganancia

El bus maestro corría antes a `outPk` 3–6 contra una escala completa de 1.0 con el limitador conteniendo el 90–98 % de forma *continua* — un compresor, no un limitador, que es la razón por la que el nivel apenas respondía a `masterVolume` o `masterAmp`. La causa era una sola: la capa de pads sumaba **linealmente** con la concurrencia (20 pads = 1.96) mientras cualquier otra capa estaba en ≤ 0.17.

Los pads reciben compensación de polifonía (`1/√n`, así que la capa crece como `√n`), y un único `~trimMaster` fija el nivel absoluto.

El balance estaba entonces mal de una segunda manera, que las mediciones de pico no podían ver. Calibrar sobre la **cresta** dejaba sin nada que sostuviera el **suelo**: medida a lo largo de un arco de marea completo, la mezcla estaba por debajo de 0.05 —inaudible— en el **48 % de las ventanas**, con un factor de cresta de 340:1. Media pieza era silencio puntuado por picos. El drone es ahora la **cama** en lugar de una referencia callada, el valle de marea adelgaza hasta 0.42 en vez de 0.15, y las grabaciones de campo sostienen y se funden entre sí en lugar de puntuar. Resultado: **inaudible 48 % → 16 %**, cresta 340:1 → **37:1**, nivel mediano ×1.8, `outPk` p90 0.745.

Estos trims siguen siendo la *estructura* del balance. Lo que la Fila 8 añade es un multiplicador en vivo sobre cada uno, para que la estructura pueda ajustarse mientras se toca sin editar constantes y reiniciar.

### El slot 0 ya no es enteramente ámbar

`ParliamentStage.js` renderizaba cada elemento en un solo tono, lo que hacía que la cámara se leyera como un único panel de instrumentos en vez de como una asamblea — nada podía destacarse del ámbar porque a nada se le permitía. Dos elementos arden ahora en **fósforo blanco** (`#f2fff4`, una traza de verde para que siga siendo un fósforo y no un blanco de interfaz):

* **el anillo de radar más exterior** — el límite de lo que el instrumento alcanza a ver. Es el único anillo con presencia real (opacidad base 0.28 frente a 0.06), así que un cambio de tono ahí se ve en lugar de inferirse.
* **Alouatta, el aullador** — el Artículo 46 de la Cámara Fenológica le otorga el único protocolo de alerta del estatuto, que obliga a la Corporación a atender su silencio. La especie que el instrumento está obligado a escuchar es la especie que no es ámbar. Mantiene la misma rampa de actividad de tres pasos atenuado→brillante que las demás, en fósforo y no en ámbar, así que se lee como la misma máquina de estados en otra sustancia — no como un nodo atascado en un color mientras el resto de la cámara respira.

### La GUI de SC es monoespaciada de 1 bit, con dos excepciones

Sólo blanco y negro, una sola tipografía (Menlo), etiquetas en mayúsculas. El esquema ámbar anterior llevaba cinco tonos que codificaban cada uno un estado —verde ok, rojo alto, amarillo armado— ninguno de los cuales sobrevivía a un proyector o a una fotografía, y que hacían que el tono hiciera el trabajo que debería hacer el estado. Cada control es blanco sobre negro y un control **accionado** se invierte a negro sobre blanco.

Dos cosas no son de 1 bit deliberadamente, porque la inversión necesita un cuerpo que invertir y ninguna de las dos lo tiene.

**Las luces de estado son rojas cuando hay señal, oscuras cuando no.** Un control tiene una forma que se puede leer; una luz no tiene más que su propio estado. Cuando la paleta pasó a 1 bit, `mainTheme.green` y `mainTheme.red` se volvieron ambos `Color.white` — y el drawFunc del LED seguía eligiendo entre esos dos nombres como su *única* señal de estado, así que las cinco luces eran discos blancos idénticos en cualquier condición. Ahora llevan dos colores literales propios; una luz apagada conserva su aro, así que sólo se apaga el filamento. Nada más en la ventana es rojo, así que la fila de estado es lo único que puede llamarte la atención desde el otro lado de un escenario.

Tres de ellas además respondían a la pregunta equivocada — comprobaban si algo se había *registrado* en vez de si estaba *corriendo*, lo que se vuelve cierto al arrancar y sigue cierto a través de un feed muerto:

| Luz | Era | Es |
|---|---|---|
| **SERVER** | `Server.default.serverRunning` | sin cambios |
| **BEAT** | `~beatRoutine.notNil` — nunca se ponía en nil tras `.stop`, así que un motor detenido se leía como corriendo | `~lastBeatTime` dentro de 3 s, estampado una vez por paso |
| **OSC** | `OSCdef(\txHandler).notNil` — registro, no tráfico | `~lastOscTime` dentro de 5 s |
| **ETH** | *(no existía)* | `~lastEthTime` dentro de 30 s — el feed que la luz OSC decía representar, y nunca vigiló |
| **MIDI** | hay un dispositivo enumerado — sigue encendida con el cable muerto | `~lastMidiTime` dentro de 5 s, cualquier CC |
| **BRIDGE RX** | `~lastBrowserOscTime` dentro de 5 s | sin cambios — la única que estuvo viva desde siempre |

**La rejilla de perillas es de siete de ancho.** Cuatro filas de rendimiento de 5/5/5/6 pasaron a tres de siete —la fila de la Cámara ya había probado que siete caben (7 × celdas de 132 px + huecos + márgenes = 992 px dentro de 1100)— y `phenoRate` se unió a la fila de la Cámara para hacerla también de siete. Siete filas pasaron a seis.

**`bancada` es una fila de botones, no una perilla.** Es la última especificación escalonada que seguía siendo un Knob, y un Knob no puede servir aquí: `~makeKnob` reconstruye el `ControlSpec` a partir de `(min, max, warp)` y **descarta el paso**, `~setParam` recuantiza contra la especificación real y escribe el valor redondeado de vuelta en el widget, y un Knob en modo `\vert` arrastra *relativo a su valor actual*. Así que la reescritura reiniciaba el acumulador en cada evento de ratón, y cruzar a la posición 1 requería 0.125 normalizado en un solo evento — unos 16 px entre dos movimientos consecutivos de Qt. La perilla no estaba enviando nada; estaba enviando 0, repetidamente. El CC MIDI 16 y los cinco botones del navegador siempre estuvieron bien. Ahora son cinco botones de radio, reconciliados desde el bus a 2 Hz para que cualquier fuente los reencienda.

**La fila 5, la Cámara Fenológica, va tintada en ámbar.** Es la única bancada cuyos controles cambian *quién habla* en lugar de cómo suena el motor. El tinte marca la fila; no reinstaura el hábito de tono-como-estado que la reescritura eliminó.

---

## 5. Proyección láser (ILDA / DAC Helios)

Proyecta la geometría **vectorial** del motor sobre un bosque real. Los láseres dibujan trazos brillantes y escasos (no imágenes rasterizadas), así que el navegador envía una escena pequeña apta para láser — no el framebuffer 3-D.

```
laserTap del navegador ──WS:3337──► laser-bridge.js ──USB──► DAC Helios ──► láser
                                          └──────────────► frames.ild (ILDA fmt 5)
```

**Activar:** `LASER=1 ./start_ecosystem.sh` (apagado por defecto). Sin DAC y sin binding nativo corre en **SECO** (sólo logs) — seguro de arrancar en cualquier parte.

**Contrato de cuadro** (navegador → puente): normalizado, centro `(0,0)`, `x,y ∈ −1..1`.

```json
{ "type":"laserFrame", "pps":30000,
  "points":[ {"x":-0.8,"y":0.0,"r":0,"g":200,"b":90,"blank":false}, … ] }
```

**Origen del cuadro** (`src/projector/laserTap.ts`, iniciado por `parliamentEntry.init`):

1. `window.__laserFrame` — cualquier módulo puede publicar su propia escena vectorial.
2. **por defecto, el slot P** — el **anillo del año** fenológico + un marcador en las especies activas de hoy (`window.__activeSpecies`). Una especie **sensible** *no* se dibuja: la cláusula de opacidad (Glissant) extendida al espacio físico — el ser vulnerable nunca se proyecta sobre el bosque real.

### Qué se proyecta: el gráfico de púlsar

Crestas apiladas — la imagen de *Unknown Pleasures* / B1919+21. Observaciones sucesivas del mismo objeto dibujadas una sobre otra, de modo que un patrón invisible en una sola pasada emerge de la pila. `pulsarPlot.ts` publica `window.__laserFrame`, que `laserTap.ts` ya prefiere sobre su anillo del año por defecto.

**Cuatro fuentes**, marcables de forma independiente desde la GUI de SC (`/laser/src/*`, respaldadas por el registro para que los presets las lleven). Cada una dibuja en su propio tono para que una pila mixta siga siendo legible. **Sin ninguna marcada vuelve el anillo del año** — así es como el anillo sigue siendo alcanzable sin un control propio.

| Marca | OSC | Una fila es | Tono |
|---|---|---|---|
| `MIX` | `/laser/src/mix` | una instantánea del espectro de todo lo que suena | verde |
| `CORPUS` | `/laser/src/corpus` | lo mismo, sólo sobre el bus del corpus — la voz propia del bosque | ámbar |
| `DÍA` | `/laser/src/ring` | el espectro del corpus medido mientras suena un día `/pheno/clip` | azul |
| `CHAIN` | `/laser/src/chain` | las transacciones de un bloque; x es orden de llegada, altura es la puja | rojo |

El Artículo 47 se lleva consigo, no se vuelve a litigar: un clip opaco nunca se anuncia, y una especie **sensible** no aporta fila alguna — la misma negativa que `laserTap.ts` ya hace para el anillo.

#### Por qué seis filas, y por qué serpentina

Los límites del galvo hacen de esto un problema de **longitud de trayecto**. Cada punto se escanea `FRAME_HZ` veces por segundo, así que un cuadro recibe una cantidad fija de tinta:

```
tinta por cuadro = OMEGA_MAX / FRAME_HZ / grados_por_unidad
                 = 10000 / 30 / 22.5  =  14.8 unidades normalizadas
```

Una fila de ancho completo cuesta ~1.5 unidades antes de ondularse. **Las 80 filas del álbum necesitarían ~420 unidades.** Seis es el techo, así que la profundidad de la pila vive en el *tiempo*: el gráfico se desplaza, y el patrón emerge para quien mira en vez de echar un vistazo.

Dos cosas son estructurales antes que estilísticas:

- **Escaneo serpentina.** Dibujar cada fila de izquierda a derecha implica retrazar el ancho completo entre ellas, y el espejo recorre eso esté el haz encendido o no. Medido: 19.36 unidades, **131 % del presupuesto → cuadro entero en blanco**. Alternar la dirección hace que el único movimiento entre filas sea el paso de fila. Serpentina: 12.03 unidades, 81 %.
- **Muestreo por longitud de arco.** Espaciar los puntos de forma pareja en *x* y dimensionar ese espaciado al límite de paso no deja nada para la componente vertical, así que cada segmento inclinado excede el límite y acaba interpolado. Medido: un cuadro de 516 puntos se volvía **1041**, y una trayectoria que usaba sólo el 77 % del presupuesto de tinta alcanzaba el **128 %** del presupuesto de puntos y se apagaba.

El generador se **autopresupuesta** — descarta la fila más antigua hasta que el cuadro cabe, *antes* de enviarlo. El apagado automático es una red de seguridad, y el contenido que cae en la red es contenido que no se está proyectando. Medido de extremo a extremo: 646 puntos, **81 % del presupuesto de escaneo, 0 excesos de velocidad, nada apagado**.

### Límites del escáner (Unity RAW 1.7 W, DMX + ILDA)

Un proyector láser se acciona **con una forma de onda**: a la tasa de puntos del DAC cada punto es una muestra, X en el canal izquierdo e Y en el derecho. Los límites de abajo vienen de la hoja de datos del equipo, y cada uno es una variable de entorno.

`Scan Speed 30 kpps @ 8°` es un **par tasa–ángulo, no una tasa**. Un escáner que sigue 30 000 puntos/s a lo largo de 8° no puede seguir 30 000 puntos/s a lo largo de 45° — el espejo tiene cinco veces más camino que recorrer por punto. Así que el límite de paso se deriva de un techo de velocidad angular en lugar de elegirse:

```
OMEGA_MAX  = ÁNGULO_NOMINAL × PPS_NOMINAL / TRAVERSE_PTS  =  8° × 30000 / 24  =  10 000 °/s
MAX_STEP   = OMEGA_MAX / pps / (SCAN_ANGLE / 2)           ≈  0.0185 a 24 kpps
```

`TRAVERSE_PTS` es la única cifra que la hoja de datos no publica (el número de puntos del patrón de prueba ILDA) y se fija deliberadamente baja, poniendo el techo en el **fondo** del rango que se le atribuye a un escáner de 30 K.

| Variable | Por defecto | Origen |
|---|---|---|
| `LASER_PPS` | `24000` | derateado al 80 % de la especificación; limitado a `LASER_RATED_PPS` |
| `LASER_RATED_PPS` | `30000` | *Scan Speed 30 kpps @ 8°* |
| `LASER_RATED_ANGLE` | `8` | el ángulo al que se cita esa especificación |
| `LASER_SCAN_ANGLE` | `45` | *Scan Angle 45°*, campo completo |
| `LASER_TRAVERSE_PTS` | `24` | constante de modelado — más bajo = más margen |
| `LASER_POWER_W` | `1.7` | *Power > 1.7 W* |
| `LASER_BEAM_MM` / `LASER_DIVERGE` | `5` / `1.1` | *Beam 5 × 3 mm*, *< 1.1 mrad* |
| `LASER_THROW_M` / `LASER_DWELL_MS` | `10` / `1.0` | distancia de proyección; ventana de permanencia |
| `LASER_MAX_STEP` | *(sin fijar)* | sólo para forzar — sin fijar, se computa arriba |

**La permanencia** es física, no un épsilon adivinado: el haz debe despejar **su propio ancho** a la distancia de proyección dentro de `LASER_DWELL_MS`, o puntos sucesivos están aterrizando en el mismo sitio.

### Apagado automático

La interpolación hace sobrevivible la mayoría de los saltos pero no puede hacer conforme *cada* cuadro — `LASER_MAX_POINTS` y el presupuesto de escaneo son techos duros. Pasados esos, el haz se **apaga** en lugar de proyectarse, dirigido allí donde dirigirlo tenga sentido:

| Fallo | Respuesta |
|---|---|
| **exceso de velocidad** | apagar el punto al que se salta — los espejos siguen recorriendo el hueco, pero a oscuras. *No* repara la sobreorden mecánica, así que el conteo crudo se sigue reportando aparte. |
| **permanencia** | una vez que una tirada estacionaria sin apagar alcanza `LASER_DWELL_MS`, el resto se apaga. El único caso en que apagar elimina el riesgo del todo. |
| **presupuesto > 100 %** | no se puede dirigir — ningún subconjunto se está dibujando a la tasa para la que fue creado. **El cuadro entero se apaga.** |

Se sostiene durante `LASER_BLANK_HOLD_MS` (250 ms) tras el último fallo, para que un cuadro sentado en el umbral no pueda estroboscopiar el haz a la frecuencia de cuadro. Desactivar con `LASER_SAFE_BLANK=0`.

El osciloscopio reporta lo que se **hizo** por separado de lo que se **midió** — una permanencia de 0 porque el haz estaba apagado es un hecho distinto de una permanencia de 0 porque nada dejó nunca de moverse. Verificado:

```
suave    300 pts   679/10000 grados/s   campo 2.7 grados   presup.  56%   dentro de especificación
parado   400 pts     0/10000 grados/s   permanencia 958 us               APAGADO 376 pts parados
denso   1200 pts   presupuesto 225%                                      APAGADO — necesita 54000 pps
```

### Osciloscopio de seguridad del galvo (GUI de SC, columna derecha)

`laser-bridge.js` envía `/laser/scope` a sclang a 12 Hz llevando el cuadro **después** del saneamiento — la señal que el DAC recibe realmente. La GUI de SC lo dibuja en una columna fija de **452 px junto al área de scroll** (ventana de 1570 px), para que siga siendo legible con las manos en las perillas; el osciloscopio en sí es de 440 × 847. Tres carriles etiquetados: **X**, **Y** y **PASO / LÍMITE** — un límite de paso es un límite sobre la *pendiente*, así que la velocidad es lo que el osciloscopio tiene que mostrar, y no es el mismo tipo de magnitud que las dos de arriba. Los buckets diezmados llevan el **peor** paso dentro de ellos, nunca el paso entre los puntos supervivientes.

Dos lámparas, en el mismo lenguaje visual que las luces de feed pero sin su columna de edad (ninguna de las dos es un feed cuyo silencio signifique algo):

| Lámpara | Encendida cuando |
|---|---|
| **DAC** | el puente ha enlazado un Helios real. La corrida en seco *y* la ausencia de puente se leen ambas como apagado — en ninguno de los dos casos llega nada a un láser. |
| **BLANK** | el haz está caído ahora mismo. Sigue la ventana `LASER_BLANK_HOLD_MS` del propio puente, no el cuadro que lo disparó: un apagado de 250 ms reportado en un cuadro a 12 Hz destellaría 80 ms y pasaría desapercibido. |

Ambas se apagan cuando el puente deja de hablar — un BLANK apagado no debe jamás poder leerse como *no está apagando* cuando en realidad no se está proyectando nada en absoluto.

Cuatro estados, todos alcanzables:

| Condición | Se lee |
|---|---|
| Dentro de especificación | `9274 / 10000 grados/s`, presupuesto de escaneo `48 %` |
| Cuadro más ancho que la especificación | `field 31.5 deg (rated 8.0)` → *campo ancho* |
| El haz dejó de moverse | `BEAM PARKED 13.3 ms` |
| Demasiado denso para escanear | `budget 180 %`, residual `OVER-SPEED ×460` |
| Puente ausente | `no bridge` — nunca "conforme" |

> **No es un sistema de seguridad.** Este es un equipo de **Clase 4** (> 1.7 W RGB). A las personas las protegen el enclavamiento, la parada de emergencia, la llave, la máscara de apertura, el Scan Guard propio del equipo, el diseño del trayecto del haz y la operación entrenada. El osciloscopio mantiene al motor dentro de la envolvente *mecánica* publicada del escáner y hace visible la pérdida de movimiento del haz. No vuelve nada seguro para la vista.

---

## 6. Arranque rápido y diagnóstico

### Requisitos

Node.js + npm, Python 3, `lsof`, `pkill`, y **SuperCollider**. El lanzador corre en **Linux y macOS**:

* localiza `sclang` en el `PATH` (Linux: `pacman -S supercollider`, `apt install supercollider`) o, en macOS, dentro de `/Applications/SuperCollider.app`;
* `SCLANG=/ruta/a/sclang ./start_ecosystem.sh` fuerza una ruta concreta — builds locales o varias versiones en paralelo;
* abre el navegador con `xdg-open` o `open`, lo que haya; sin ninguno imprime la URL y sigue.

> **En Linux no se pueden enumerar los dispositivos de audio.** `ServerOptions.outDevices` pasa por un primitivo que sólo existe en macOS y Windows; scsynth llega a la tarjeta por JACK/ALSA y no hay nada que enumerar. La detección es por tanto de mejor esfuerzo: sin lista se usa el dispositivo por defecto del sistema en estéreo, y el modo espacial de 4 canales de la MOTU 828x hay que pedirlo explícitamente enrutando por JACK. No es un error — pero no capturarlo sí lo era, porque abortaba `1_server_config.scd` entero y se llevaba por delante los `numBuffers`/`memSize`/`maxNodes` que están justo debajo, que es la memoria en la que carga el corpus.

El scraper de Ethereum necesita su propio venv:

```bash
python3 -m venv eth_listener/venv
source eth_listener/venv/bin/activate
pip install web3 python-osc
```

### Correr el ecosistema

```bash
./start_ecosystem.sh
```

Levanta todos los servicios: nw_wrld, parliament-bridge, SuperCollider y el scraper de Ethereum en Python. `LASER=1` añade el puente láser (ver §5).

### Prueba de barrido diagnóstico

```bash
cd nw_wrld_local && node diag-sweep.js
```

Envía los 22 parámetros de las filas 1–4 a través del puente (0 → 1 → 0.5), y después corre un LFO continuo de volumen. No cubre el registro completo de 47 parámetros: es una prueba de que la ruta navegador→puente→SC está viva, no un barrido exhaustivo.

### Monitor del motor en vivo

La herramienta más útil cuando algo "suena mal". SuperCollider publica una línea cada 2 s describiendo qué está recibiendo y haciendo realmente:

```bash
tail -f sclang_log.txt | grep MON
```

```
[MON] flags:B-E---S  bells:47/gate:310/cap:12/bar:88  env(atk/dec/amp):0.81/0.83/0.071
      prio:0.264 ent:0.517 dens:0.312  blk:25670857 txN:290 idx:289 base:0.051  synths:9
```

| Campo | Responde |
|---|---|
| `bells` | pads lanzados, y saltados *por qué compuerta*: `gate` compuerta temporal, `cap` techo de synths, `drop` desborde de cola; `q:` muestra pendientes/total encolados |
| `kick` `perc` `err` | lanzamientos del motor de beat, y cualquier error que el bucle protegido atrapó y del que se recuperó |
| `tg` `amp` | ganancia de transporte (`0.05` = Stop Parliament enganchado) y el nivel maestro de quien toca |
| `outPk` `gr` | nivel de pico llegando al limitador, y con cuánta fuerza está conteniendo |
| `env` | atk/dec/amp del último pad — si dejan de ser idénticos, la envolvente está respondiendo a la transacción |
| `prio` `ent` `dens` | valores vivos derivados de la cadena; una constante aquí significa que un mapeo se saturó |
| `blk` `txN` `idx` `base` | si el payload enriquecido de `eth_sonify.py` está llegando siquiera |

Tres controles OSC, desde cualquier cosa que alcance a SC en el **57120**:

| Dirección | Efecto |
|---|---|
| `/diag/osctrace 1` | `OSCFunc.trace` — publica **todos** los mensajes OSC entrantes; la prueba definitiva de si un control llega a SC |
| `/diag/monitor 0` | silencia la línea `[MON]` |
| `/diag/reset` | pone a cero los contadores de pads para medir una ventana nueva |

### Comprobación de arranque

El banner del registro en `sclang_log.txt` confirma que el motor cargó las fuentes actuales — lo primero que conviene mirar cuando un cambio parece no tener efecto, ya que `start_sonification.scd` lee los dieciséis archivos `.scd` desde disco **en el arranque**:

```
Parameter registry loaded: 47 parameters, 51 OSC routes, 42 MIDI CCs.
Master limiter active (2 ch, ceiling 0.92) — output can no longer clip.
=== CONTROL BUS SETUP COMPLETE ===
```

El lanzador espera esa última línea hasta 60 s antes de abrir la interfaz. Un arranque en frío compila primero la class library de SuperCollider y después carga los buffers del corpus, así que tardar bastante es normal; lo que no es normal es que `sclang` muera durante el proceso, y en ese caso el lanzador lo dice y deja de esperar.

---

## Licencia

Licencia MIT
