// SuperCollider Ethereum Sonification - Transaction Buffer v9
// Current Date and Time (UTC): 2025-03-01 02:42:46
// Current User's Login: alejoduque

(
~txBuffer = (
    // Basic properties
    data: List.new,
    maxSize: 100,
    playbackRate: 0.6,
    isPlaying: false,
    lastPlayTime: 0,
    minGap: 0.2,
    maxGap: 2.0,
    transactionCount: 0,
    lastTransactionTime: 0,
    
    // Statistics tracking
    stats: (
        lastMinute: 0,
        totalTransactions: 0,
        avgVelocity: 64,
        avgDuration: 0.2,
        peakActivity: 0,
        lastPitch: 60,
        pitchHistory: List.new,
        velocityHistory: List.new
    ),

    // Initialize the buffer system
    init: { |self|
        self.data = List.new;
        self.isPlaying = false;
        self.lastPlayTime = 0;
        self.transactionCount = 0;
        self.lastTransactionTime = 0;
        self.stats.pitchHistory = List.new;
        self.stats.velocityHistory = List.new;
        
        self.statsRoutine = Routine({
            loop {
                self.updateStats;
                0.5.wait;
            };
        }).play;

        "Transaction Buffer v9 initialized".postln;
    },

    // Process incoming OSC data with validation
    processOSCData: { |self, msg|
        var data, currentTime, timeSinceLastTx;
        
        try {
            currentTime = Main.elapsedTime;
            timeSinceLastTx = currentTime - self.lastTransactionTime;
            self.lastTransactionTime = currentTime;
            
            data = (
                note: (msg[1].asInteger - 24).clip(24, 96),
                velocity: msg[2].asInteger.clip(30, 100),
                instrument: msg[3].asInteger.clip(0, 16),
                duration: msg[4].asFloat.clip(0.1, 1.0),
                timestamp: currentTime,
                timeSinceLast: timeSinceLastTx
            );
            
            ("Received TX - Note: % | Vel: % | Dur: % | Gap: %s"
                .format(
                    data.note,
                    data.velocity,
                    data.duration.round(0.001),
                    timeSinceLastTx.round(0.001)
                )).postln;
            
            self.safeAdd(data);
            self.updateAnalytics(data);
        } {
            "Error processing OSC data: %".format(msg).error;
        }
    },

    // Update analytics
    updateAnalytics: { |self, data|
        self.transactionCount = self.transactionCount + 1;
        
        self.stats.pitchHistory.add(data.note);
        if(self.stats.pitchHistory.size > 50) {
            self.stats.pitchHistory.removeAt(0);
        };
        
        self.stats.velocityHistory.add(data.velocity);
        if(self.stats.velocityHistory.size > 50) {
            self.stats.velocityHistory.removeAt(0);
        };
        
        self.stats.avgVelocity = self.stats.velocityHistory.mean;
        self.stats.lastPitch = data.note;
    },

    // Safely add data to buffer
    safeAdd: { |self, data|
        if(data.notNil and: { data.note.notNil }) {
            if(self.data.size >= self.maxSize) {
                self.data.removeAt(0);
            };
            
            self.data.add(data);
            
            ("Buffer: %/%".format(self.data.size, self.maxSize)).postln;
            
            if(self.isPlaying.not) {
                self.startPlayback;
            };
        };
    },

    // Start playback routine
    startPlayback: { |self|
        if(self.isPlaying) { ^this };
        
        self.isPlaying = true;
        
        Routine({
            while { self.isPlaying and: { self.data.size > 0 } } {
                var currentTime = Main.elapsedTime;
                var timeSinceLastPlay = currentTime - self.lastPlayTime;
                var playbackGap = self.calculatePlaybackGap;
                
                if(timeSinceLastPlay >= playbackGap and: { self.data.size > 0 }) {
                    var txData = self.data.removeAt(0);
                    protect {
                        self.playTransaction(txData);
                        self.lastPlayTime = currentTime;
                        self.updateBufferStatus;
                    } {
                        "Error in playback".error;
                    };
                };
                
                0.05.wait;
            };
            
            self.isPlaying = false;
            "Playback stopped".postln;
        }).play;
    },

    // Calculate playback timing
    calculatePlaybackGap: { |self|
        var bufferFillRatio = self.data.size / self.maxSize;
        var baseGap = self.maxGap.blend(self.minGap, bufferFillRatio);
        var rate = (~buses[\playbackRate].getSynchronous ? self.playbackRate);
        ^(baseGap * (1 / rate)).clip(0.05, 5.0);
    },

    // Play transaction sound
    playTransaction: { |self, txData|
        if(txData.notNil and: { txData.note.notNil }) {
            var note = txData.note;
            var velocity = txData.velocity;
            var duration = txData.duration;
            var amp = velocity.linlin(30, 100, 0.05, 0.3);
            
            amp = amp * (~buses[\txVolume].getSynchronous ? 0.5);
            
            Synth(\elektronBell, [
                \freq, note.midicps,
                \amp, amp,
                \atk, 0.01,
                \dec, duration * (~buses[\bellDecay].getSynchronous ? 1.5),
                \rel, duration * 0.8,
                \tone, (~buses[\bellTone].getSynchronous ? 0.3),
                \res, (~buses[\bellRes].getSynchronous ? 0.4),
                \pan, (~buses[\bellSpread].getSynchronous ? 0.0).rand2,
                \delayAmt, ~buses[\delayAmount].getSynchronous ? 0.2,
                \delayTime, ~buses[\delayTime].getSynchronous ? 0.4,
                \reverbMix, ~buses[\reverbMix].getSynchronous ? 0.3
            ] ++ (~voiceBusArgs.value ? []));
            
            self.updateVisualization(txData);
        };
    },

    // Update statistics
    updateStats: { |self|
        var currentMinute = (Main.elapsedTime / 60).floor;
        
        if(currentMinute > self.stats.lastMinute) {
            self.stats.lastMinute = currentMinute;
            self.stats.totalTransactions = self.transactionCount;
            
            if(self.data.size > self.stats.peakActivity) {
                self.stats.peakActivity = self.data.size;
            };
            
            self.updateStatsDisplay;
        };
    },

    // Update buffer status display
    updateBufferStatus: { |self|
        {
            if(~bufferStatus.notNil) {
                ~bufferStatus.string = format(
                    "Buffer: % / % (% %) | Rate: %x",
                    self.data.size,
                    self.maxSize,
                    (self.data.size / self.maxSize * 100).round(1),
                    "%",
                    (~buses[\playbackRate].getSynchronous ? 1.0).round(0.1)
                );
            };
        }.defer;
    },

    // Update statistics display
    updateStatsDisplay: { |self|
        {
            if(~statsDisplay.notNil) {
                ~statsDisplay.string = format(
                    "Transactions: %\nPeak: %\nAvg Velocity: %\nLast Pitch: %",
                    self.stats.totalTransactions,
                    self.stats.peakActivity,
                    self.stats.avgVelocity.round(1),
                    self.stats.lastPitch
                );
            };
        }.defer;
    },

    // Update visualization
    updateVisualization: { |self, txData|
        {
            if(~latestTxDisplay.notNil) {
                ~latestTxDisplay.string = format(
                    "Note: %\nVelocity: %\nDuration: %s\nBuffer: %/%",
                    txData.note,
                    txData.velocity,
                    txData.duration.round(0.001),
                    self.data.size,
                    self.maxSize
                );
            };
        }.defer;
    }
);

// Initialize OSC
OSCdef(\midiNoteReceiver).free;

OSCdef(\midiNoteReceiver, { |msg, time, addr, recvPort|
    {
        // Shares the Notes counter in the GUI with /eth/note — both are notes
        // arriving from outside, and the counter answers "is anything playing
        // me", not "which port did it come in on".
        ~ethNoteCount = (~ethNoteCount ? 0) + 1;
        ~txBuffer.processOSCData(msg);
    }.try { |error|
        "Error in OSC handler: %".format(error.errorString).error;
    };
}, '/midi/note');

// Initialize the buffer system
~txBuffer.init;

"Transaction Buffer v9 loaded and ready.".postln;
)