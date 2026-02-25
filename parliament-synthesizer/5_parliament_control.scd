// Parliament of All Things - Main Control System
// Agent Management and Democratic Coordination
// Current Date: 2025-08-27

(
{
    var success = true;
    
    try {
        "Loading Parliament Control System...".postln;
        
        // Agent management functions
        ~startParliament = {
            "🏛️ Starting Parliament of All Things...".postln;
            
            if(Server.default.serverRunning.not) {
                "Server not running - please start server first".warn;
                ^false;
            };
            
            // Start temporal engine first
            if(~startTemporalEngine.notNil) {
                ~startTemporalEngine.value;
            };
            
            // Start all acoustic species agents
            ~parliament.agents.acousticSpecies.do({ |agent, i|
                agent.synth = Synth(\acousticSpecies, [
                    \freq, agent.freq,
                    \amp, 0.15,
                    \species, i,
                    \presence, agent.presence,
                    \activity, 0.5,
                    \votes, agent.votes,
                    \out, ~parliament.audioBuses.acousticSpecies.index,
                    \auxSend1, ~parliament.audioBuses.reverb.index,
                    \auxSend2, ~parliament.audioBuses.delay.index,
                    \spatialPos, (i / 4) * 2 - 1 // Distribute spatially
                ]);
                
                ("  ✓ " ++ agent.name ++ " active (" ++ agent.votes ++ " votes, " ++ agent.status ++ ")").postln;
            });
            
            // Start all eDNA site agents
            ~parliament.agents.ednaSites.do({ |agent, i|
                var freq = 55 + (i * 7); // Regional frequency variations
                
                agent.synth = Synth(\ednaSite, [
                    \freq, freq,
                    \amp, 0.1,
                    \siteId, i,
                    \biodiversity, agent.biodiversity,
                    \validation, agent.validation,
                    \out, ~parliament.audioBuses.ednaSites.index,
                    \auxSend1, ~parliament.audioBuses.reverb.index,
                    \mutationRate, 0.05,
                    \harmonicCount, (agent.biodiversity * 12).round.max(3)
                ]);
                
                ("  ✓ " ++ agent.name ++ " monitoring (" ++ (agent.biodiversity * 100).round(0.1) ++ "% biodiversity)").postln;
            });
            
            // Start all fungi network agents
            ~parliament.agents.fungiNetworks.do({ |agent, i|
                var freq = 40 + (i * 8); // Very low frequencies for fungi
                
                agent.synth = Synth(\fungiNetwork, [
                    \freq, freq,
                    \amp, 0.2,
                    \nodeId, i,
                    \chemical, agent.chemical,
                    \connectivity, agent.connectivity,
                    \coverage, agent.coverage,
                    \out, ~parliament.audioBuses.fungiNetworks.index,
                    \auxSend1, ~parliament.audioBuses.reverb.index,
                    \auxSend2, ~parliament.audioBuses.delay.index,
                    \chemicalRate, 0.02,
                    \networkSpread, 0.3
                ]);
                
                ("  ✓ " ++ agent.name ++ " network (" ++ agent.coverage ++ " km² coverage)").postln;
            });
            
            // Start AI Core agent
            ~parliament.agents.aiCore[0].synth = Synth(\aiCore, [
                \freq, 200,
                \amp, 0.3,
                \consciousness, ~parliament.agents.aiCore[0].consciousness,
                \optimization, ~parliament.agents.aiCore[0].optimization,
                \metaGov, ~parliament.agents.aiCore[0].metaGov,
                \out, ~parliament.audioBuses.aiCore.index,
                \auxSend2, ~parliament.audioBuses.delay.index,
                \algorithmicRate, 3,
                \complexityDepth, 8
            ]);
            
            ("  ✓ " ++ ~parliament.agents.aiCore[0].name ++ " online (" ++ 
             (~parliament.agents.aiCore[0].consciousness * 100).round(0.1) ++ "% consciousness)").postln;
            
            // Start consensus engine
            ~parliament.consensusEngine = Synth(\consensusEngine, [
                \consensusLevel, 0.5,
                \totalVotes, ~parliament.agents.acousticSpecies.collect(_.votes).sum,
                \rotationSpeed, 1.0,
                \freq, 110,
                \amp, 0.2,
                \out, ~parliament.audioBuses.main.index
            ]);
            
            "  ✓ Consensus Engine active".postln;
            
            // Start effect processors
            if(~startEffectProcessors.notNil) {
                ~startEffectProcessors.value;
            };
            
            // Update GUI if available
            if(~parliament.mainWindow.notNil) {
                { ~parliament.startButton.value = 1 }.defer;
            };
            
            ~parliament.status.consensus = true;
            "🏛️ Parliament of All Things is now active - " ++ ~parliament.config.agents ++ " agents participating".postln;
            true;
        };
        
        ~stopParliament = {
            "🏛️ Stopping Parliament of All Things...".postln;
            
            // Stop temporal engine
            if(~stopTemporalEngine.notNil) {
                ~stopTemporalEngine.value;
            };
            
            // Free all agent synths
            ~parliament.agents.acousticSpecies.do({ |agent|
                if(agent.synth.notNil) {
                    agent.synth.free;
                    agent.synth = nil;
                };
            });
            
            ~parliament.agents.ednaSites.do({ |agent|
                if(agent.synth.notNil) {
                    agent.synth.free;
                    agent.synth = nil;
                };
            });
            
            ~parliament.agents.fungiNetworks.do({ |agent|
                if(agent.synth.notNil) {
                    agent.synth.free;
                    agent.synth = nil;
                };
            });
            
            if(~parliament.agents.aiCore[0].synth.notNil) {
                ~parliament.agents.aiCore[0].synth.free;
                ~parliament.agents.aiCore[0].synth = nil;
            };
            
            // Free consensus engine
            if(~parliament.consensusEngine.notNil) {
                ~parliament.consensusEngine.free;
                ~parliament.consensusEngine = nil;
            };
            
            // Stop effect processors
            if(~stopEffectProcessors.notNil) {
                ~stopEffectProcessors.value;
            };
            
            // Update GUI if available
            if(~parliament.mainWindow.notNil) {
                { ~parliament.startButton.value = 0 }.defer;
            };
            
            ~parliament.status.consensus = false;
            "🏛️ Parliament stopped - All agents offline".postln;
            true;
        };
        
        // Democratic voting simulation
        ~simulateVote = { |proposalType="environmental"|
            var totalVotes = 0;
            var yesVotes = 0;
            var consensus, result;
            
            "🗳️ Simulating democratic vote on " ++ proposalType ++ " proposal...".postln;
            
            // Each acoustic species votes based on IUCN status weighting
            ~parliament.agents.acousticSpecies.do({ |agent|
                if(agent.synth.notNil) {
                    var voteWeight = agent.votes;
                    var voteChance = switch(agent.status,
                        "CR", 0.9, // Critically endangered species vote strongly for protection
                        "VU", 0.7, // Vulnerable species generally support
                        "LC", 0.5  // Least concern species neutral
                    );
                    
                    if(voteChance > 1.0.rand) {
                        yesVotes = yesVotes + voteWeight;
                        ("  ✓ " ++ agent.name ++ " votes YES (" ++ voteWeight ++ " votes)").postln;
                    } {
                        ("  ✗ " ++ agent.name ++ " votes NO (" ++ voteWeight ++ " votes)").postln;
                    };
                    
                    totalVotes = totalVotes + voteWeight;
                };
            });
            
            consensus = yesVotes / totalVotes;
            ~parliament.controlBuses.consensusLevel.set(consensus);
            ~parliament.controlBuses.totalVotes.set(totalVotes);
            ~parliament.localValues.consensusLevel = consensus;
            ~parliament.localValues.totalVotes = totalVotes;

            result = if(consensus > 0.6) { "PASSED" } { "FAILED" };
            ("🏛️ Vote Result: " ++ result ++ " (" ++ (consensus * 100).round ++ "% consensus, " ++ totalVotes ++ " total votes)").postln;

            // Broadcast vote event to visual layer
            if(~parliament.visualDest.notNil) {
                ~parliament.visualDest.sendMsg('/parliament/vote/result',
                    consensus,
                    if(consensus > 0.6, { 1 }, { 0 }),
                    yesVotes,
                    totalVotes
                );
            };

            consensus;
        };
        
        // Emergency response system
        ~triggerEmergencyResponse = { |threatLevel=0.8|
            "🚨 ENVIRONMENTAL EMERGENCY DETECTED - Activating emergency protocols".postln;
            
            // All agents go to maximum activity
            ~parliament.agents.acousticSpecies.do({ |agent|
                if(agent.synth.notNil) {
                    agent.synth.set(\presence, 1.0, \activity, 1.0);
                };
            });
            
            // eDNA sites increase validation frequency
            ~parliament.agents.ednaSites.do({ |agent|
                if(agent.synth.notNil) {
                    agent.synth.set(\validation, 1.0, \mutationRate, 0.1);
                };
            });
            
            // Fungi networks boost chemical signaling
            ~parliament.agents.fungiNetworks.do({ |agent|
                if(agent.synth.notNil) {
                    agent.synth.set(\chemical, 1.0, \connectivity, 1.0);
                };
            });
            
            // AI Core increases optimization
            if(~parliament.agents.aiCore[0].synth.notNil) {
                ~parliament.agents.aiCore[0].synth.set(\consciousness, 1.0, \optimization, 127);
            };
            
            // Force consensus to emergency level
            ~parliament.controlBuses.consensusLevel.set(threatLevel);
            
            "🚨 Emergency response active - All agents at maximum capacity".postln;
        };
        
        // Status reporting
        ~reportParliamentStatus = {
            "".postln;
            "🏛️ === PARLIAMENT OF ALL THINGS - STATUS REPORT ===".postln;
            ("Time: " ++ Date.localtime).postln;
            "".postln;
            
            "ACOUSTIC SPECIES:".postln;
            ~parliament.agents.acousticSpecies.do({ |agent|
                ("  " ++ agent.name ++ ": " ++ 
                 if(agent.synth.notNil) { "🟢 ACTIVE" } { "🔴 OFFLINE" } ++
                 " | " ++ agent.votes ++ " votes | " ++ 
                 (agent.presence * 100).round(0.1) ++ "% presence | " ++ agent.status).postln;
            });
            
            "".postln;
            "eDNA MONITORING SITES:".postln;
            ~parliament.agents.ednaSites.do({ |agent|
                ("  " ++ agent.name ++ ": " ++ 
                 if(agent.synth.notNil) { "🟢 MONITORING" } { "🔴 OFFLINE" } ++
                 " | " ++ (agent.biodiversity * 100).round(0.1) ++ "% biodiversity | " ++
                 (agent.validation * 100).round(0.1) ++ "% validation").postln;
            });
            
            "".postln;
            "FUNGI NETWORKS:".postln;
            ~parliament.agents.fungiNetworks.do({ |agent|
                ("  " ++ agent.name ++ ": " ++ 
                 if(agent.synth.notNil) { "🟢 CONNECTED" } { "🔴 OFFLINE" } ++
                 " | " ++ agent.coverage ++ " km² coverage | " ++
                 (agent.connectivity * 100).round(0.1) ++ "% connectivity").postln;
            });
            
            "".postln;
            "AI CORE:".postln;
            ("  " ++ ~parliament.agents.aiCore[0].name ++ ": " ++ 
             if(~parliament.agents.aiCore[0].synth.notNil) { "🟢 ONLINE" } { "🔴 OFFLINE" } ++
             " | " ++ (~parliament.agents.aiCore[0].consciousness * 100).round(0.1) ++ "% consciousness | " ++
             ~parliament.agents.aiCore[0].optimization ++ " optimization rate").postln;
            
            "".postln;
            "CONSENSUS STATUS:".postln;
            ("  Democratic Consensus: " ++ (~parliament.localValues.consensusLevel * 100).round(0.1) ++ "%").postln;
            ("  Total Voting Power: " ++ ~parliament.localValues.totalVotes ++ " votes").postln;
            ("  Parliament Rotation: " ++ ~parliament.localValues.rotationSpeed ++ "x speed").postln;
            
            "".postln;
            "=== END STATUS REPORT ===".postln;
            "".postln;
        };
        
        "Parliament Control System loaded successfully:".postln;
        "  - Agent management (start/stop)".postln;
        "  - Democratic voting simulation".postln;
        "  - Emergency response protocols".postln;
        "  - Status monitoring and reporting".postln;
        "".postln;
        "Available functions:".postln;
        "  ~startParliament.value - Start all agents".postln;
        "  ~stopParliament.value - Stop all agents".postln;
        "  ~simulateVote.value - Democratic vote simulation".postln;
        "  ~triggerEmergencyResponse.value - Emergency protocols".postln;
        "  ~reportParliamentStatus.value - Full status report".postln;
        
    } {
        |error|
        ~handleParliamentError.value(error, "control");
        success = false;
    };
    
    success;
}.value;
)