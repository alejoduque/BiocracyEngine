// Parliament of All Things - Temporal Synchronization Engine
// Multi-Agent Temporal Coordination System
// Current Date: 2025-08-27

(
{
    var success = true;
    
    try {
        "Loading Parliament Temporal Engine...".postln;
        
        // Initialize temporal coordination system
        ~parliament.temporal = ();
        
        // Local value storage to avoid getSynchronous calls
        ~parliament.localValues = (
            consensusLevel: 0.5,
            aiOptimization: 64,
            totalVotes: 26,
            rotationSpeed: 1.0,
            aiConsciousness: 0.8,
            masterVolume: 0.7
        );
        
        // Master clock based on 120-second parliament rotation
        ~parliament.temporal.masterClock = TempoClock(120/60); // 0.5 Hz base frequency
        
        // Agent-specific temporal patterns
        ~parliament.temporal.cycles = (
            // Parliament rotation (2 minutes)
            parliament: (duration: 120, phase: 0),
            
            // AI consciousness pulse (3 seconds) 
            aiCore: (duration: 3, phase: 0),
            
            // Fungi chemical signals (6 seconds)
            fungi: (duration: 6, phase: 0),
            
            // eDNA validation cycles (8 seconds for monthly simulation)
            edna: (duration: 8, phase: 0),
            
            // Acoustic species variable timing (4-7 seconds)
            acousticSpecies: [
                (duration: 4, phase: 0),   // Ara macao
                (duration: 4.5, phase: 0), // Atlapetes
                (duration: 5, phase: 0),   // Cecropia  
                (duration: 5.5, phase: 0), // Alouatta
                (duration: 6, phase: 0)    // Tinamus
            ],
            
            // Consensus building rhythm
            consensus: (duration: 15, phase: 0)
        );
        
        // Phase calculation functions
        ~calculatePhase = { |cycleName, agentIndex=0|
            var cycle = if(cycleName == \acousticSpecies) {
                ~parliament.temporal.cycles.acousticSpecies[agentIndex]
            } {
                ~parliament.temporal.cycles[cycleName]
            };
            
            var elapsed = Main.elapsedTime % cycle.duration;
            elapsed / cycle.duration; // Returns 0.0 to 1.0
        };
        
        // Temporal modulation generators
        ~parliament.temporal.modulators = (
            
            // Parliament rotation modulator (slow global evolution)
            parliamentPhase: { 
                ~calculatePhase.value(\parliament)
            },
            
            // AI consciousness waves
            aiConsciousness: {
                var phase = ~calculatePhase.value(\aiCore);
                sin(phase * 2 * pi) * 0.5 + 0.5; // Smooth sine wave 0-1
            },
            
            // Fungi chemical signal propagation
            fungiChemical: { |nodeId=0|
                var phase = ~calculatePhase.value(\fungi);
                var nodeOffset = nodeId * 0.25; // Stagger fungi nodes
                sin((phase + nodeOffset) * 2 * pi) * 0.3 + 0.7; // 0.4 to 1.0 range
            },
            
            // eDNA validation pulses (monthly cycles)
            ednaValidation: { |siteId=0|
                var phase = ~calculatePhase.value(\edna);
                var siteOffset = siteId * 0.125; // Stagger 8 sites
                var validation_pulse = sin((phase + siteOffset) * 2 * pi);
                validation_pulse.max(0) * 0.2 + 0.8; // 0.8 to 1.0 range
            },
            
            // Acoustic species activity patterns
            acousticActivity: { |speciesId=0|
                var phase = ~calculatePhase.value(\acousticSpecies, speciesId);
                var activity_pattern = sin(phase * 2 * pi) * 0.4 + 0.6; // 0.2 to 1.0
                activity_pattern.max(0.1); // Minimum activity level
            },
            
            // Consensus building waves
            consensusWave: {
                var phase = ~calculatePhase.value(\consensus);
                var consensus_level = ~parliament.localValues.consensusLevel;
                var stability = consensus_level.linlin(0, 1, 0.3, 0.95);
                sin(phase * 2 * pi) * (1 - stability) + stability;
            }
        );
        
        // Apply temporal modulations to synthesis parameters
        ~applyTemporalModulations = {
            
            // AI Core temporal modulation
            if(~parliament.agents.aiCore[0].synth.notNil) {
                var consciousness_mod = ~parliament.temporal.modulators.aiConsciousness.value;
                ~parliament.controlBuses.aiConsciousness.set(consciousness_mod);
            };
            
            // Fungi Networks temporal modulation
            ~parliament.agents.fungiNetworks.do({ |agent, i|
                if(agent.synth.notNil) {
                    var chemical_mod = ~parliament.temporal.modulators.fungiChemical.value(i);
                    ~parliament.controlBuses.fungiChemical.set(chemical_mod);
                };
            });
            
            // eDNA Sites temporal modulation  
            ~parliament.agents.ednaSites.do({ |agent, i|
                if(agent.synth.notNil) {
                    var validation_mod = ~parliament.temporal.modulators.ednaValidation.value(i);
                    ~parliament.controlBuses.ednaValidation.set(validation_mod);
                };
            });
            
            // Acoustic Species temporal modulation
            ~parliament.agents.acousticSpecies.do({ |agent, i|
                if(agent.synth.notNil) {
                    var activity_mod = ~parliament.temporal.modulators.acousticActivity.value(i);
                    ~parliament.controlBuses.acousticPresence.set(activity_mod);
                };
            });
            
            // Consensus Engine temporal modulation
            if(~parliament.consensusEngine.notNil) {
                var consensus_wave = ~parliament.temporal.modulators.consensusWave.value;
                ~parliament.controlBuses.consensusLevel.set(consensus_wave);
                ~parliament.localValues.consensusLevel = consensus_wave;
            };
        };
        
        // Temporal event triggers
        ~parliament.temporal.triggers = (
            
            // Parliament rotation events (every 120 seconds)
            parliamentRotation: Routine({
                loop {
                    120.wait;
                    "Parliament completed full rotation - Democratic cycle reset".postln;
                    ~triggerConsensusEvaluation.value;
                };
            }),
            
            // AI consciousness pulses (every 3 seconds)  
            aiPulse: Routine({
                loop {
                    3.wait;
                    ~triggerAIOptimization.value;
                };
            }),
            
            // Fungi seasonal events (every 30 seconds = seasonal simulation)
            fungiSeasonal: Routine({
                loop {
                    30.wait;
                    ~triggerFungiSporeRelease.value;
                };
            }),
            
            // eDNA sampling events (every 32 seconds = monthly simulation)
            ednaSampling: Routine({
                loop {
                    32.wait;
                    ~triggerEdnaSampling.value;
                };
            })
        );
        
        // Event trigger functions
        ~triggerConsensusEvaluation = {
            var totalVotes = ~parliament.agents.acousticSpecies.collect(_.votes).sum;
            ~parliament.controlBuses.totalVotes.set(totalVotes);
            ~parliament.localValues.totalVotes = totalVotes;
            ("Democratic evaluation: " ++ totalVotes ++ " total votes counted").postln;
        };
        
        ~triggerAIOptimization = {
            var optimization_rate = ~parliament.localValues.aiOptimization;
            var new_rate = (optimization_rate + rrand(-5, 5)).clip(0, 127);
            ~parliament.controlBuses.aiOptimization.set(new_rate);
            ~parliament.localValues.aiOptimization = new_rate;
        };
        
        // Function to update local values when control buses change
        ~updateLocalValue = { |key, value|
            ~parliament.localValues[key] = value;
        };
        
        ~triggerFungiSporeRelease = {
            "Fungi networks: Spore release event triggered".postln;
            ~parliament.agents.fungiNetworks.do({ |agent|
                if(agent.synth.notNil) {
                    // Trigger spore release effects
                    agent.coverage = agent.coverage * rrand(1.1, 1.3);
                };
            });
        };
        
        ~triggerEdnaSampling = {
            "eDNA sites: Monthly sampling cycle completed".postln;
            ~parliament.agents.ednaSites.do({ |agent|
                if(agent.synth.notNil) {
                    // Update biodiversity with small variations
                    var new_biodiversity = (agent.biodiversity + rrand(-0.02, 0.02)).clip(0.0, 1.0);
                    agent.biodiversity = new_biodiversity;
                };
            });
        };
        
        // Start temporal engine
        ~startTemporalEngine = {
            "Starting Parliament Temporal Engine...".postln;
            
            // Start main synchronization routine
            ~parliament.temporal.syncRoutine = Routine({
                loop {
                    ~applyTemporalModulations.value;
                    0.1.wait; // 10Hz synchronization rate
                };
            }).play(~parliament.temporal.masterClock);
            
            // Start event trigger routines
            ~parliament.temporal.triggers.keysValuesDo({ |name, routine|
                routine.play(~parliament.temporal.masterClock);
            });
            
            ~parliament.status.temporal = true;
            "Temporal Engine started - All agents synchronized".postln;
        };
        
        // Stop temporal engine
        ~stopTemporalEngine = {
            "Stopping Parliament Temporal Engine...".postln;
            
            if(~parliament.temporal.syncRoutine.notNil) {
                ~parliament.temporal.syncRoutine.stop;
                ~parliament.temporal.syncRoutine = nil;
            };
            
            ~parliament.temporal.triggers.do(_.stop);
            ~parliament.status.temporal = false;
        };
        
        // Update rotation speed (called from GUI)
        ~updateRotationSpeed = { |newSpeed|
            // Adjust temporal cycles based on rotation speed
            var speedMultiplier = newSpeed; // 0.1 to 2.0
            
            ~parliament.temporal.cycles.keysValuesDo({ |cycleName, cycle|
                if(cycleName == \acousticSpecies) {
                    cycle.do({ |speciesCycle|
                        speciesCycle.duration = speciesCycle.duration / speedMultiplier;
                    });
                } {
                    cycle.duration = cycle.duration / speedMultiplier;
                };
            });
            
            ("Parliament rotation speed updated: " ++ newSpeed ++ "x").postln;
        };
        
        "Parliament Temporal Engine loaded successfully:".postln;
        "  - Master Clock: 120-second parliament rotation".postln;
        "  - AI Core: 3-second consciousness pulses".postln;
        "  - Fungi Networks: 6-second chemical cycles".postln;
        "  - eDNA Sites: 8-second validation cycles".postln;
        "  - Acoustic Species: 4-7 second variable activity".postln;
        "  - Consensus Engine: 15-second democratic evaluation".postln;
        ~parliament.status.temporal = true;
        
    } {
        |error|
        ~handleParliamentError.value(error, "temporal");
        success = false;
    };
    
    success;
}.value;
)