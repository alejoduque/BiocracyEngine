← [README](../../README.md) · [English](../en/foundations.md)

# Fundamentos

El aporte central del BiocracyEngine está en **traducir teoría crítica, decolonial y política en restricciones técnicas operantes dentro del software.** Se plantea como contramodelo concreto y desplegable frente al Nature Fintech y los "Protocolos de Estado Ecológico", compilando filosofía en reglas ejecutables en lugar de citarla como autoridad externa.

## Filosofía compilada en reglas que corren

*   **El derecho a la opacidad de Glissant:** implementado como restricción de software. La *Cláusula de Opacidad* (visualizada mediante el parámetro `opacityFloor`) retiene una fracción determinista de las etiquetas de especies activas, excluyéndolas de la proyección. Esta cláusula se declara *intraducible a sonido* (no altera la síntesis en SuperCollider), honrando la afirmación de Glissant de que lo subalterno tiene derecho a permanecer opaco y no consumido por la mirada occidental.
*   **La comunidad que viene de Agamben:** asentada en el código como un parlamento de *singularidades, nunca identidades*. La asamblea no clasifica a las especies por su valor económico o utilidad, sino por su mera presencia.
*   **"La ausencia es voz":** en el slot P (Calendario Fenológico) y el slot F (DarkForest), las especies que caen bajo el umbral de detección sensible no se borran ni se ponen en cero; persisten en el fondo como dither de 1 bit o destello visual. Su ausencia habla como frecuencia de bajo nivel, afirmando que lo no medido sigue participando.
*   **Bancadas estacionales:** la membresía y el peso de voto de las bancadas del parlamento se recomponen dinámicamente siguiendo los ciclos estacionales del calendario fenológico.

## La distinción parlamento/vigilancia como afirmación arquitectónica

El pipeline empleado es: **sensor acústico → vectorización → contrato inteligente**.

Una afirmación arquitectónica importante de este trabajo es que *el mismo pipeline de sensado constituye vigilancia o parlamento dependiendo únicamente de la arquitectura de poder que lo rodea.* La vectorización y el sensado remoto no son intrínsecamente herramientas de extracción; pueden configurarse para establecer soberanía local, convirtiendo una malla de vigilancia en un sitio de representación.

## Inscripción no transable: el BioToken

El BioToken invierte la lógica de "tokenizar el planeta" de los créditos de carbono y las compensaciones de biodiversidad. Es:

*   Una **unidad de inscripción política** (participación) antes que un activo transable (mercancía).
*   Un protocolo no financiarizado diseñado para registrar acciones de conservación validadas y escucha profunda.
*   Un contramodelo construible frente a los "Protocolos de Estado Ecológico" especulativos y el Nature Fintech.

## Desintermediación del circuito ONG extractivo

El sistema enruta el valor de conservación y la soberanía de decisión directamente hacia la comunidad local y marginal (El Balzal, Córdoba, Colombia). La soberanía de los datos se mantiene local, y los límites honestos del sistema —como las dependencias y fronteras de la gobernanza a nivel de cadena— se hacen visibles en la interfaz en lugar de esconderse tras plantillas de UI con barniz verde.

## Gobernanza guiada por la fenología

En lugar de usar las taxonomías globales estandarizadas de la Lista Roja de la UICN como autoridad absoluta, el motor mapea el calendario estacional propio del bosque usando un inventario de 572 especies de la Reserva Manakai. El tiempo ecológico gobierna la síntesis: el peso estacional y la fracción de especies activas se retroalimentan hacia SuperCollider para accionar `harmonicRich` y `textureDepth`.

## La Cámara: el Recinto del Parlamento como Instrumento Acústico

Hasta ahora cada voz del motor llevaba su propia reverberación breve —trece en los `SynthDefs`, unas cuarenta salas independientes sonando a la vez—. Cada fuente llegaba con su acústica privada y no compartía una sola reflexión temprana con ninguna otra. Eso es exactamente lo que hace que una mezcla se oiga como un conjunto de sintetizadores próximos entre sí y no como un lugar.

`\resonantChamber` es **una sola sala** por la que se escucha todo el motor: una red de retardo realimentada (FDN) de cuatro líneas con mezcla Householder, amortiguada dentro del lazo. La realimentación no se ajusta a oído sino que se **deriva** de la longitud de cada línea y del RT60 buscado, `g = 10^(-3·t/RT60)`, de modo que todas decaen a la misma *velocidad* y la red no resuena en una sola altura.

**La acústica se sigue de quién está en la sala.** La ecuación de Sabine dice que el tiempo de reverberación cae al aumentar la absorción total:

> RT60 = 0.161 · V / A

y un ocupante *es* absorción. Una sala vacía retumba; una llena es sorda. Es acústica ordinaria, y leída al revés es el argumento de la obra: el recinto de un parlamento suena distinto según quién lo habite, y **un recinto vacío no está en silencio: está resonando**.

El quórum ya se calcula una vez por día fenológico (`~phenoQuorum`, Art. 45): la fracción de los seres elegibles ese día cuya presencia supera el umbral. Ahora gobierna la sala:

| Quórum | RT60 | Amortiguación | Proporción oída por la sala común |
| :---: | :---: | :---: | :---: |
| 0.00 | 6.6 s | 2130 Hz | 45 % |
| 0.50 | 4.8 s | 1651 Hz | 73 % |
| 1.00 | 3.0 s | 1172 Hz | 100 % |

Tres consecuencias que son el mismo hecho:

* **La cola se acorta a medida que la asamblea se llena.** La expectativa ingenua es que más voces produzcan un sonido mayor; acústicamente ocurre lo contrario, y esa verdad es la mejor afirmación: una asamblea no agranda el recinto, *lo absorbe*. La presencia es lo que vuelve íntimo el espacio.
* **Los agudos se oscurecen**, porque los cuerpos absorben primero las altas frecuencias. Una sala llena es más cálida además de más cercana.
* **Sube la proporción que se oye por la sala común.** Una asamblea plena queda *constituida* por estar en un mismo espacio. Una vacía son unas pocas voces cada una en su acústica propia —que es justo lo que siguen aportando las reverberaciones por voz—. Así dejan de ser redundantes y pasan a ser **el sonido de no estar reunidos: la disidencia tiene acústica privada**.

El quórum se envía **todos los días del anillo, incluidos aquellos en que vale cero**. Un día no grabado no detiene la cámara: la vacía. Como 331 de los 365 días del corpus no tienen registro, durante la mayor parte del año esta es una sala sin nadie dentro. El Artículo 44 deja de ser una declaración y se vuelve audible: la ausencia no es un hueco en el programa, es un escaño, y el escaño resuena.

## Epistemología situada e investigación-creación

Enraizado en *SubAmérica* y la tecnodiversidad (Yuk Hui), el proyecto fusiona la Investigación-Acción Participativa (IAP, según Orlando Fals Borda) con gobernanza on-chain. El resultado se entrega como **objeto liminal de investigación** antes que como obra terminada, lo que lo hace reproducible y adaptable por otras comunidades territoriales.

# 2. Artefactos públicos desplegables

El proyecto se publica en tres repositorios de software y una herramienta de campo de cara a la comunidad:

*   **BiocracyEngine**: el motor central de síntesis audiovisual, proyección WebGL/Three.js y puente MIDI/OSC.
*   **bioacoustic-scripts**: el parser web3 en Python y las herramientas de extracción de vectores de características de audio.
*   **dIAP (IAP Decolonial)**: protocolos descentralizados de investigación-acción y herramientas de asamblea on-chain.
*   **Biomap SoundWalk App**: un instrumento participativo de escucha y conservación. Convierte caminatas sonoras guiadas en la Reserva Manakai en actos registrados de presencia ecológica, fusionando escucha profunda y monitoreo acústico pasivo (PAM) en una sola herramienta de campo. La app lleva la capa de incentivos, distribuyendo recompensas registradas en BioToken a la comunidad de El Balzal por acciones de conservación validadas, cerrando el bucle entre escucha, inscripción y sostenibilidad económica.
