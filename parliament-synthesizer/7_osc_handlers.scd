// Parliament of All Things - OSC Communication Handlers
// External Control and Data Integration
// Current Date: 2025-08-27

(
{
    var success = true;
    
    try {
        "Loading Parliament OSC Handlers...".postln;
        
        // Initialize OSC communication
        ~parliament.osc = ();
        ~parliament.osc.port = 57120; // Standard SuperCollider port
        ~parliament.osc.netAddr = NetAddr("127.0.0.1", ~parliament.osc.port);
        
        // OSC message handlers for external control
        ~parliament.oscResponders = (
            
            // Global parliament controls
            parliamentConsensus: OSCdef(\parliamentConsensus, { |msg|
                var consensusLevel = msg[1].clip(0.0, 1.0);
                ~parliament.controlBuses.consensusLevel.set(consensusLevel);
                ("OSC: Parliament consensus updated to " ++ (consensusLevel * 100).round(0.1) ++ "%").postln;
            }, '/parliament/consensus'),
            
            parliamentRotation: OSCdef(\parliamentRotation, { |msg|
                var rotationSpeed = msg[1].clip(0.1, 2.0);
                ~parliament.controlBuses.rotationSpeed.set(rotationSpeed);
                if(~updateRotationSpeed.notNil) {
                    ~updateRotationSpeed.value(rotationSpeed);
                };
                ("OSC: Parliament rotation speed: " ++ rotationSpeed ++ "x").postln;
            }, '/parliament/rotation'),
            
            // Acoustic Species controls
            speciesPresence: OSCdef(\speciesPresence, { |msg|
                var speciesId = msg[1].clip(0, 4).asInteger;
                var presence = msg[2].clip(0.0, 1.0);
                
                if(~parliament.agents.acousticSpecies[speciesId].notNil) {
                    ~parliament.agents.acousticSpecies[speciesId].presence = presence;
                    if(~parliament.agents.acousticSpecies[speciesId].synth.notNil) {
                        ~parliament.agents.acousticSpecies[speciesId].synth.set(\presence, presence);
                    };
                    ("OSC: Species " ++ speciesId ++ " presence: " ++ (presence * 100).round(0.1) ++ "%").postln;
                };
            }, '/agents/species/presence'),
            
            speciesActivity: OSCdef(\speciesActivity, { |msg|
                var speciesId = msg[1].clip(0, 4).asInteger;
                var activity = msg[2].clip(0.0, 1.0);
                
                if(~parliament.agents.acousticSpecies[speciesId].notNil) {
                    if(~parliament.agents.acousticSpecies[speciesId].synth.notNil) {
                        ~parliament.agents.acousticSpecies[speciesId].synth.set(\activity, activity);
                    };
                    ("OSC: Species " ++ speciesId ++ " activity: " ++ (activity * 100).round(0.1) ++ "%").postln;
                };
            }, '/agents/species/activity'),
            
            // eDNA Site controls
            ednaBiodiversity: OSCdef(\ednaBiodiversity, { |msg|
                var siteId = msg[1].clip(0, 7).asInteger;
                var biodiversity = msg[2].clip(0.0, 1.0);
                
                if(~parliament.agents.ednaSites[siteId].notNil) {
                    ~parliament.agents.ednaSites[siteId].biodiversity = biodiversity;
                    if(~parliament.agents.ednaSites[siteId].synth.notNil) {
                        ~parliament.agents.ednaSites[siteId].synth.set(\biodiversity, biodiversity);
                    };
                    ("OSC: eDNA site " ++ siteId ++ " biodiversity: " ++ (biodiversity * 100).round(0.1) ++ "%").postln;
                };
            }, '/agents/edna/biodiversity'),
            
            // Fungi Network controls
            fungiChemical: OSCdef(\fungiChemical, { |msg|
                var nodeId = msg[1].clip(0, 3).asInteger;
                var chemical = msg[2].clip(0.0, 1.0);
                
                if(~parliament.agents.fungiNetworks[nodeId].notNil) {
                    ~parliament.agents.fungiNetworks[nodeId].chemical = chemical;
                    if(~parliament.agents.fungiNetworks[nodeId].synth.notNil) {
                        ~parliament.agents.fungiNetworks[nodeId].synth.set(\chemical, chemical);
                    };
                    ("OSC: Fungi node " ++ nodeId ++ " chemical signal: " ++ (chemical * 100).round(0.1) ++ "%").postln;
                };
            }, '/agents/fungi/chemical'),
            
            // AI Core controls
            aiConsciousness: OSCdef(\aiConsciousness, { |msg|
                var consciousness = msg[1].clip(0.0, 1.0);
                
                ~parliament.controlBuses.aiConsciousness.set(consciousness);
                if(~parliament.agents.aiCore[0].synth.notNil) {
                    ~parliament.agents.aiCore[0].synth.set(\consciousness, consciousness);
                };
                ("OSC: AI consciousness level: " ++ (consciousness * 100).round(0.1) ++ "%").postln;
            }, '/agents/ai/consciousness'),
            
            // Master controls
            masterVolume: OSCdef(\masterVolume, { |msg|
                var volume = msg[1].clip(0.0, 1.0);
                ~parliament.controlBuses.masterVolume.set(volume);
                ("OSC: Master volume: " ++ (volume * 100).round(0.1) ++ "%").postln;
            }, '/parliament/volume'),
            
            // Start/Stop parliament
            parliamentStart: OSCdef(\parliamentStart, { |msg|
                if(~startParliament.notNil) {
                    ~startParliament.value;
                };
                "OSC: Parliament started remotely".postln;
            }, '/parliament/start'),
            
            parliamentStop: OSCdef(\parliamentStop, { |msg|
                if(~stopParliament.notNil) {
                    ~stopParliament.value;
                };
                "OSC: Parliament stopped remotely".postln;
            }, '/parliament/stop'),
            
            // Vote simulation
            parliamentVote: OSCdef(\parliamentVote, { |msg|
                if(~simulateVote.notNil) {
                    ~simulateVote.value;
                };
                "OSC: Democratic vote triggered remotely".postln;
            }, '/parliament/vote'),
            
            // Emergency consensus override
            emergencyConsensus: OSCdef(\emergencyConsensus, { |msg|
                var emergency_level = msg[1].clip(0.0, 1.0);
                
                if(~triggerEmergencyResponse.notNil) {
                    ~triggerEmergencyResponse.value(emergency_level);
                };
                
                ("OSC: EMERGENCY CONSENSUS ACTIVATED - Level: " ++ (emergency_level * 100).round(0.1) ++ "%").postln;
            }, '/parliament/emergency')
        );
        
        // OSC status broadcasting
        ~parliament.osc.sendStatus = { |target_addr|
            var status_data = (
                consensus: ~parliament.localValues.consensusLevel,
                rotation: ~parliament.localValues.rotationSpeed,
                totalVotes: ~parliament.localValues.totalVotes,
                aiConsciousness: ~parliament.localValues.aiConsciousness,
                masterVolume: ~parliament.localValues.masterVolume,
                activeAgents: (
                    species: ~parliament.agents.acousticSpecies.count({ |agent| agent.synth.notNil }),
                    edna: ~parliament.agents.ednaSites.count({ |agent| agent.synth.notNil }),
                    fungi: ~parliament.agents.fungiNetworks.count({ |agent| agent.synth.notNil }),
                    ai: if(~parliament.agents.aiCore[0].synth.notNil, 1, 0)
                )
            );
            
            // Send status as OSC bundle
            target_addr.sendBundle(0, [
                '/parliament/status/consensus', status_data.consensus,
                '/parliament/status/rotation', status_data.rotation,
                '/parliament/status/votes', status_data.totalVotes,
                '/parliament/status/ai', status_data.aiConsciousness,
                '/parliament/status/volume', status_data.masterVolume,
                '/parliament/status/agents', 
                status_data.activeAgents.species,
                status_data.activeAgents.edna,
                status_data.activeAgents.fungi,
                status_data.activeAgents.ai
            ]);
        };
        
        // Test functions for OSC communication
        ~testParliamentOSC = {
            "Testing Parliament OSC communication...".postln;
            
            // Test basic parliament controls
            ~parliament.osc.netAddr.sendMsg('/parliament/consensus', 0.75);
            ~parliament.osc.netAddr.sendMsg('/parliament/rotation', 1.5);
            
            // Test agent controls
            ~parliament.osc.netAddr.sendMsg('/agents/species/presence', 0, 0.8); // Ara macao
            ~parliament.osc.netAddr.sendMsg('/agents/edna/biodiversity', 0, 0.9); // Chocó site
            ~parliament.osc.netAddr.sendMsg('/agents/fungi/chemical', 0, 0.6); // North network
            ~parliament.osc.netAddr.sendMsg('/agents/ai/consciousness', 0.9);
            
            "OSC test messages sent - check console for responses".postln;
        };
        
        // Status monitoring routine
        ~parliament.osc.statusRoutine = Routine({
            loop {
                10.wait; // Send status every 10 seconds
                if(~parliament.osc.statusTarget.notNil) {
                    ~parliament.osc.sendStatus.value(~parliament.osc.statusTarget);
                };
            };
        });
        
        // External status target (can be set by external applications)
        ~parliament.osc.statusTarget = nil;
        
        // Set status target
        ~setOSCStatusTarget = { |ip, port|
            ~parliament.osc.statusTarget = NetAddr(ip, port);
            ("OSC status target set: " ++ ip ++ ":" ++ port).postln;
            
            if(~parliament.osc.statusRoutine.isPlaying.not) {
                ~parliament.osc.statusRoutine.play;
            };
        };
        
        // Start OSC system
        ~startParliamentOSC = {
            "Starting Parliament OSC communication...".postln;
            "Listening on port " ++ ~parliament.osc.port ++ " for external control".postln;
            
            ~parliament.osc.statusRoutine.play;
            ~parliament.status.osc = true;
        };
        
        // Stop OSC system
        ~stopParliamentOSC = {
            "Stopping Parliament OSC communication...".postln;
            
            ~parliament.oscResponders.do({ |responder|
                responder.free;
            });
            
            ~parliament.osc.statusRoutine.stop;
            ~parliament.status.osc = false;
        };
        
        // Auto-start OSC
        ~startParliamentOSC.value;
        
        [
            "Parliament OSC Handlers loaded successfully:",
            "  Port: " ++ ~parliament.osc.port,
            "  Available endpoints:",
            "    /parliament/consensus <float>",
            "    /parliament/rotation <float>", 
            "    /parliament/start",
            "    /parliament/stop",
            "    /parliament/vote",
            "    /agents/species/presence <int> <float>",
            "    /agents/species/activity <int> <float>",
            "    /agents/edna/biodiversity <int> <float>",
            "    /agents/fungi/chemical <int> <float>",
            "    /agents/ai/consciousness <float>",
            "    /parliament/emergency <float>",
            "",
            "  Test with: ~testParliamentOSC.value"
        ].join("\n").postln;
        
    } {
        |error|
        ~handleParliamentError.value(error, "osc");
        success = false;
    };
    
    success;
}.value;
)