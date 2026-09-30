← [README](../../README.en.md) · [Español](../es/fundamentos.md)

# Foundations

The core contribution of the BiocracyEngine lies in **translating critical, decolonial, and political theory into working technical constraints in software.** It stands as a concrete, deployable counter-model to Nature Fintech and "Ecological State Protocols" by compiling philosophy into executable rules rather than citing it as external authority.

## Philosophy Compiled into Running Rules

*   **Glissant's Right to Opacity:** Implemented as a software constraint. The *Opacity Clause* (visualized via the `opacityFloor` parameter) withholds a deterministic fraction of active species labels from the projection. This clause is declared *untranslatable to sound* (it does not alter the SuperCollider synthesis), honoring Glissant's assertion that the subaltern must have a right to remain opaque and unconsumed by the Western gaze.
*   **Agamben's Coming Community:** Seated in the code as a parliament of *singularities, never identities*. The assembly does not classify species by their economic value or utility, but by their sheer presence.
*   **"Absence is Voice":** In slot P (Phenological Calendar) and slot F (DarkForest), species that fall below the sensory detection threshold are not deleted or set to zero; instead, they persist in the background as 1-bit dither or visual shimmer. Their absence speaks as a low-level frequency, asserting that what is unmeasured still participates.
*   **Seasonal Benches:** The membership and voting weight of the parliament's benches recompose dynamically following the seasonal cycles of the phenological calendar.

## The Parliament/Surveillance Distinction as an Architectural Claim

The pipeline used here is: **Acoustic Sensor → Vectorization → Smart Contract**.

An important architectural claim of this work is that *the same sensing pipeline constitutes either surveillance or a parliament depending only on the architecture of power surrounding it.* Vectorization and remote sensing are not inherently tools of extraction; they can be configured to establish local sovereignty, turning a surveillance mesh into a site of representation.

## Non-Tradable Inscription: The BioToken

The BioToken inverts the "tokenize-the-planet" logic of carbon credits and biodiversity offsets. It is:

*   A **unit of political inscription** (participation) rather than a tradable asset (commodity).
*   A non-financialized protocol designed to register validated conservation actions and deep listening.
*   A buildable counter-model to speculative "Ecological State Protocols" and Nature Fintech.

## Disintermediation of the Extractive NGO Circuit

The system routes conservation value and decision-making sovereignty directly to the local, marginal community (El Balzal, Córdoba, Colombia). Data sovereignty is kept local, and the honest limits of the system—such as the dependencies and boundaries of chain-level governance—are made visible in the interface rather than hidden behind greenwashed UI templates.

## Phenology-Driven Governance

Rather than using the standardized global taxonomies of the IUCN Red List as an absolute authority, the engine maps the forest's own local seasonal calendar using a 572-species inventory from the Reserva Manakai. Ecological time governs the synthesis: the seasonal weight and active-species fraction are fed back into SuperCollider to drive `harmonicRich` and `textureDepth`.

## The Chamber: the Parliament's Room as an Acoustic Instrument

Until now every voice in the engine carried its own short reverb — thirteen in the `SynthDefs`, which at a normal voice count is about forty independent little rooms running at once. Each source arrived with its own private acoustic and shared not one early reflection with any other. That is exactly what makes a mix read as a set of synthesisers standing near each other rather than as a place.

`\resonantChamber` is **one room** through which the whole engine is heard: a four-line feedback delay network with Householder mixing, damped inside the loop. The feedback is not dialled by ear but **derived** from each line's length and the wanted RT60, `g = 10^(-3·t/RT60)`, so every line decays at the same *rate* and the network does not ring on a single pitch.

**The acoustics follow from who is in the room.** Sabine's equation says reverberation time falls as total absorption rises:

> RT60 = 0.161 · V / A

and an occupant *is* absorption. An empty hall rings; a full one is dead. This is ordinary room acoustics, and read the other way it is the work's own argument: a parliamentary chamber sounds different according to who inhabits it, and **an empty chamber is not silent — it is resonant**.

The quorum is already computed once per phenological day (`~phenoQuorum`, Art. 45): the fraction of the beings eligible that day whose presence clears the threshold. It now governs the room:

| Quorum | RT60 | Damping | Share heard through the common room |
| :---: | :---: | :---: | :---: |
| 0.00 | 6.6 s | 2130 Hz | 45 % |
| 0.50 | 4.8 s | 1651 Hz | 73 % |
| 1.00 | 3.0 s | 1172 Hz | 100 % |

Three consequences that are the same fact:

* **The tail shortens as the assembly fills.** The naive expectation is that more voices make a bigger sound; acoustically the opposite is true, and that truth is the better statement: an assembly does not enlarge the room, it *absorbs* it. Presence is what makes the space intimate.
* **The top darkens**, because bodies absorb high frequencies first. A full room is warmer as well as closer.
* **The share heard through the common room rises.** A full assembly is *constituted* by being in one space. An empty one is a few voices each in their own acoustic — which is exactly what the per-voice reverbs still provide. They stop being redundant and become **the sound of not being assembled: dissent has a private acoustic**.

The quorum is sent **every ring day, including the days it is zero**. An unrecorded day does not stop the chamber, it empties it. Since 331 of the corpus's 365 days carry no recording, for most of the year this is a room with nobody in it. Article 44 stops being a declaration and becomes audible: absence is not a gap in the programme, it is a seat, and the seat resonates.

## Situated Epistemology & Research-Creation

Rooted in *SubAmérica* and technodiversity (Yuk Hui), this project fuses Investigación-Acción Participativa (IAP, after Orlando Fals Borda) with on-chain governance. The result is delivered as a **liminal research object** rather than a finished artwork, making it reproducible and adaptable by other territorial communities.

# 2. Deployable Public Artifacts

The project is released across three software repositories and a community-facing field tool:

*   **BiocracyEngine**: The core audiovisual synthesis, WebGL/Three.js projection, and MIDI/OSC bridge engine.
*   **bioacoustic-scripts**: The python-based web3 blockchain parser and audio-vector feature extraction tools.
*   **dIAP (Decolonial IAP)**: Decentralized action research protocols and on-chain assembly tools.
*   **Biomap SoundWalk App**: A participatory listening and conservation instrument. It turns guided soundwalks in Reserva Manakai into logged acts of ecological presence, fusing deep listening and passive acoustic monitoring (PAM) in one field tool. The app carries the incentive layer, distributing BioToken-registered rewards to the El Balzal community for validated conservation actions, closing the loop between listening, inscription, and economic sustainability.
