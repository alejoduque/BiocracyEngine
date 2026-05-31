// SuperCollider Ethereum Sonification - Spatial Control GUI
// Current Date and Time (UTC): 2025-09-01 08:30:00
// Current User's Login: alejoduque
// Purpose: Visual quadraphonic spatial control interface

(
{
    var spatialWindow, spatialView, fieldView;
    var speakers, soundSources, activeNodes;
    var fieldSize, centerX, centerY, speakerRadius;
    var mouseDown, draggedNode, dragOffset;
    var mainTheme, controlPanel, modeButton, roomKnob, distanceKnob, resetButton;
    var statusText, coordText;
    
    "Creating Spatial Control GUI...".postln;
    
    // Theme matching main GUI
    mainTheme = (
        background: Color.fromHexString("#1E1E2E"),
        foreground: Color.fromHexString("#F8F8F2"),
        accent: Color.fromHexString("#89B4FA"),
        green: Color.fromHexString("#A6E3A1"),
        cyan: Color.cyan,
        purple: Color.fromHexString("#CBA6F7"),
        yellow: Color.fromHexString("#F9E2AF"),
        red: Color.fromHexString("#F38BA8")
    );
    
    // Spatial control parameters
    ~spatialParams = (
        // Sound source positions (x, y coordinates -1 to 1)
        ambientPos: [0.0, 0.0],      // Ethereum ambient sounds
        samplePos: [0.0, 0.0],       // Current sample position
        masterSpatialGain: 1.0,      // Overall spatial effect intensity
        spatialMode: \quad,          // \quad or \headphones
        roomSize: 0.8,               // Virtual room size for reverb
        distanceEffect: 0.5          // Distance-based amplitude scaling
    );
    
    // Connect to existing buses from synthdefs
    ~spatialBuses = ();
    
    // Use existing spatial buses if available, otherwise create new ones
    if(~buses.notNil) {
        ~spatialBuses.ambientX = ~buses.spatialX;
        ~spatialBuses.ambientY = ~buses.spatialY;
        ~spatialBuses.roomSize = ~buses.roomSize;
        ~spatialBuses.distanceEffect = ~buses.distanceEffect;
    };
    
    // Create sample spatial buses if not already available
    if(~sampleBuses.notNil) {
        if(~sampleBuses.sampleSpatialX.isNil) {
            ~sampleBuses.sampleSpatialX = Bus.control(s, 1).set(0.0);
        };
        if(~sampleBuses.sampleSpatialY.isNil) {
            ~sampleBuses.sampleSpatialY = Bus.control(s, 1).set(0.0);
        };
        ~spatialBuses.sampleX = ~sampleBuses.sampleSpatialX;
        ~spatialBuses.sampleY = ~sampleBuses.sampleSpatialY;
    };
    
    // Create spatial window
    // Default position: same origin as the main sonETH window (100, 100)
    // so it always opens on a visible part of the screen. The 4_gui.scd
    // button re-pins it to the *current* main window bounds after load.
    spatialWindow = Window("Spatial Control - Quadraphonic Field", Rect(100, 100, 600, 650))
        .background_(mainTheme.background)
        .alwaysOnTop_(true);
    
    // Main container
    spatialView = View()
        .background_(mainTheme.background)
        .layout_(VLayout().margins_(15).spacing_(10));
    
    // Header
    spatialView.layout.add(StaticText()
        .string_("QUADRAPHONIC SPATIAL CONTROL")
        .font_(Font("Helvetica", 18, true))
        .align_(\center)
        .stringColor_(mainTheme.purple)
    );
    
    // Field parameters
    fieldSize = 500;
    centerX = fieldSize / 2;
    centerY = fieldSize / 2;
    speakerRadius = fieldSize * 0.4;  // Distance from center to speakers
    
    // Speaker positions (fixed)
    speakers = [
        [\frontLeft, centerX - (speakerRadius * 0.707), centerY - (speakerRadius * 0.707)],
        [\frontRight, centerX + (speakerRadius * 0.707), centerY - (speakerRadius * 0.707)],
        [\rearLeft, centerX - (speakerRadius * 0.707), centerY + (speakerRadius * 0.707)],
        [\rearRight, centerX + (speakerRadius * 0.707), centerY + (speakerRadius * 0.707)]
    ];
    
    // Sound source nodes (draggable)
    soundSources = [
        [\ambient, centerX, centerY, mainTheme.accent, "AMB"],
        [\sample, centerX + 50, centerY + 50, mainTheme.cyan, "SMP"]
    ];
    
    activeNodes = [];
    mouseDown = false;
    draggedNode = nil;
    
    // Convert screen coordinates to spatial coordinates (-1 to 1)
    ~screenToSpatial = { |x, y|
        var spatialX = ((x - centerX) / (fieldSize * 0.4)).clip(-1, 1);
        var spatialY = ((y - centerY) / (fieldSize * 0.4)).clip(-1, 1);
        [spatialX, spatialY];
    };
    
    // Convert spatial coordinates to screen coordinates
    ~spatialToScreen = { |spatialX, spatialY|
        var screenX = centerX + (spatialX * fieldSize * 0.4);
        var screenY = centerY + (spatialY * fieldSize * 0.4);
        [screenX, screenY];
    };
    
    // Update spatial position function
    ~updateSpatialPosition = { |sourceType, x, y|
        var spatialCoords = ~screenToSpatial.(x, y);
        var spatialX = spatialCoords[0];
        var spatialY = spatialCoords[1];
        
        "Moving % to spatial position: [%, %]".format(
            sourceType, spatialX.round(0.01), spatialY.round(0.01)
        ).postln;
        
        // Update buses
        if(sourceType == \ambient) {
            ~spatialParams.ambientPos = [spatialX, spatialY];
            if(~spatialBuses.ambientX.notNil) {
                ~spatialBuses.ambientX.set(spatialX);
                ~spatialBuses.ambientY.set(spatialY);
            };
        };
        
        if(sourceType == \sample) {
            ~spatialParams.samplePos = [spatialX, spatialY];
            if(~spatialBuses.sampleX.notNil) {
                ~spatialBuses.sampleX.set(spatialX);
                ~spatialBuses.sampleY.set(spatialY);
            };
        };
    };
    
    // Create spatial field view
    fieldView = UserView()
        .fixedSize_(Size(fieldSize, fieldSize))
        .background_(mainTheme.background.blend(Color.black, 0.2))
        .drawFunc_({ |view|
            var bounds = view.bounds;
            
            // Draw field background
            Pen.fillColor = mainTheme.background.blend(Color.black, 0.3);
            Pen.addRect(bounds);
            Pen.fill;
            
            // Draw grid
            Pen.strokeColor = mainTheme.foreground.alpha_(0.1);
            Pen.width = 1;
            
            // Grid lines
            (1..8).do { |i|
                var pos = i * (fieldSize / 9);
                // Vertical lines
                Pen.moveTo(Point(pos, 0));
                Pen.lineTo(Point(pos, fieldSize));
                // Horizontal lines
                Pen.moveTo(Point(0, pos));
                Pen.lineTo(Point(fieldSize, pos));
            };
            Pen.stroke;
            
            // Draw center crosshair
            Pen.strokeColor = mainTheme.foreground.alpha_(0.3);
            Pen.width = 2;
            Pen.moveTo(Point(centerX - 20, centerY));
            Pen.lineTo(Point(centerX + 20, centerY));
            Pen.moveTo(Point(centerX, centerY - 20));
            Pen.lineTo(Point(centerX, centerY + 20));
            Pen.stroke;
            
            // Draw speakers
            speakers.do { |speaker|
                var name = speaker[0];
                var x = speaker[1];
                var y = speaker[2];
                
                // Speaker rectangle
                Pen.fillColor = mainTheme.green;
                Pen.addRect(Rect(x - 15, y - 15, 30, 30));
                Pen.fill;
                
                // Speaker border
                Pen.strokeColor = mainTheme.foreground;
                Pen.width = 2;
                Pen.addRect(Rect(x - 15, y - 15, 30, 30));
                Pen.stroke;
                
                // Speaker label  
                Pen.color = mainTheme.background;
                Pen.font = Font("Monaco", 8, true);
                Pen.stringCenteredIn(
                    name.asString[0..1].toUpper,
                    Rect(x - 15, y - 10, 30, 20)
                );
            };
            
            // Draw sound sources
            soundSources.do { |source|
                var type = source[0];
                var x = source[1];
                var y = source[2];
                var color = source[3];
                var label = source[4];
                
                // Source circle
                Pen.fillColor = color.alpha_(0.8);
                Pen.addOval(Rect(x - 12, y - 12, 24, 24));
                Pen.fill;
                
                // Source border
                Pen.strokeColor = color;
                Pen.width = 3;
                Pen.addOval(Rect(x - 12, y - 12, 24, 24));
                Pen.stroke;
                
                // Glow effect
                Pen.fillColor = color.alpha_(0.2);
                Pen.addOval(Rect(x - 20, y - 20, 40, 40));
                Pen.fill;
                
                // Source label
                Pen.color = mainTheme.background;
                Pen.font = Font("Monaco", 9, true);
                Pen.stringCenteredIn(label, Rect(x - 12, y - 6, 24, 12));
                
                // Draw distance lines to speakers
                speakers.do { |speaker|
                    var sx = speaker[1];
                    var sy = speaker[2];
                    var distance = ((x - sx).squared + (y - sy).squared).sqrt;
                    var alpha = (1 - (distance / (fieldSize * 0.6))).clip(0, 1);
                    
                    Pen.strokeColor = color.alpha_(alpha * 0.3);
                    Pen.width = (alpha * 3).max(1);
                    Pen.moveTo(Point(x, y));
                    Pen.lineTo(Point(sx, sy));
                    Pen.stroke;
                };
            };
        })
        .mouseDownAction_({ |view, x, y, modifiers, buttonNumber, clickCount|
            // Check if clicking on a sound source
            soundSources.do { |source, index|
                var sx = source[1];
                var sy = source[2];
                var distance = ((x - sx).squared + (y - sy).squared).sqrt;
                
                if(distance <= 15) {  // Within click radius
                    mouseDown = true;
                    draggedNode = index;
                    dragOffset = [x - sx, y - sy];
                    "Grabbed % source".format(source[0]).postln;
                };
            };
        })
        .mouseMoveAction_({ |view, x, y, modifiers|
            if(mouseDown and: { draggedNode.notNil }) {
                var newX = (x - dragOffset[0]).clip(20, fieldSize - 20);
                var newY = (y - dragOffset[1]).clip(20, fieldSize - 20);
                
                // Update source position
                soundSources[draggedNode][1] = newX;
                soundSources[draggedNode][2] = newY;
                
                // Update spatial parameters
                ~updateSpatialPosition.(soundSources[draggedNode][0], newX, newY);
                
                // Refresh display
                view.refresh;
            };
        })
        .mouseUpAction_({ |view, x, y, modifiers, buttonNumber|
            if(mouseDown) {
                mouseDown = false;
                if(draggedNode.notNil) {
                    "Released % source".format(soundSources[draggedNode][0]).postln;
                };
                draggedNode = nil;
                dragOffset = nil;
            };
        });
    
    spatialView.layout.add(fieldView);
    
    // Control panel for spatial parameters
    controlPanel = View()
        .background_(mainTheme.background.blend(Color.black, 0.2))
        .layout_(HLayout().margins_(10).spacing_(15));
    
    // Spatial mode selector
    modeButton = Button()
        .states_([
            ["QUAD MODE", mainTheme.foreground, mainTheme.background.blend(mainTheme.green, 0.2)],
            ["HEADPHONE MODE", mainTheme.foreground, mainTheme.background.blend(mainTheme.cyan, 0.2)]
        ])
        .value_(if(~spatialParams.spatialMode == \quad, 0, 1))
        .action_({ |btn|
            ~spatialParams.spatialMode = if(btn.value == 0, \quad, \headphones);
            "Spatial mode: %".format(~spatialParams.spatialMode).postln;
            if(~setSpatialMode.notNil) {
                ~setSpatialMode.(~spatialParams.spatialMode);
            };
        });
    
    // Room size control
    roomKnob = Knob()
        .maxHeight_(60)
        .maxWidth_(60)
        .color_([mainTheme.background, mainTheme.yellow, mainTheme.foreground, mainTheme.foreground.alpha_(0.2)])
        .value_(~spatialParams.roomSize)
        .action_({ |knob|
            ~spatialParams.roomSize = knob.value;
            ~spatialBuses.roomSize.set(knob.value);
            "Room size: %".format(knob.value.round(0.01)).postln;
        });
    
    // Distance effect control
    distanceKnob = Knob()
        .maxHeight_(60)
        .maxWidth_(60)
        .color_([mainTheme.background, mainTheme.red, mainTheme.foreground, mainTheme.foreground.alpha_(0.2)])
        .value_(~spatialParams.distanceEffect)
        .action_({ |knob|
            ~spatialParams.distanceEffect = knob.value;
            ~spatialBuses.distanceEffect.set(knob.value);
            "Distance effect: %".format(knob.value.round(0.01)).postln;
        });
    
    // Reset positions button
    resetButton = Button()
        .states_([["RESET POSITIONS", mainTheme.foreground, mainTheme.background.blend(mainTheme.purple, 0.2)]])
        .action_({
            "Resetting spatial positions to center".postln;
            soundSources[0][1] = centerX;  // Ambient
            soundSources[0][2] = centerY;
            soundSources[1][1] = centerX + 50;  // Sample
            soundSources[1][2] = centerY + 50;
            
            ~updateSpatialPosition.(\ambient, centerX, centerY);
            ~updateSpatialPosition.(\sample, centerX + 50, centerY + 50);
            
            fieldView.refresh;
        });
    
    // Add controls to panel
    controlPanel.layout.add(VLayout(
        StaticText().string_("MODE").stringColor_(mainTheme.foreground).align_(\center),
        modeButton
    ));
    
    controlPanel.layout.add(VLayout(
        StaticText().string_("ROOM SIZE").stringColor_(mainTheme.foreground).align_(\center),
        roomKnob,
        StaticText().string_("0.80").stringColor_(mainTheme.yellow).align_(\center)
    ));
    
    controlPanel.layout.add(VLayout(
        StaticText().string_("DISTANCE").stringColor_(mainTheme.foreground).align_(\center),
        distanceKnob,
        StaticText().string_("0.50").stringColor_(mainTheme.red).align_(\center)
    ));
    
    controlPanel.layout.add(VLayout(
        StaticText().string_("RESET").stringColor_(mainTheme.foreground).align_(\center),
        resetButton
    ));
    
    spatialView.layout.add(controlPanel);
    
    // Status display
    statusText = StaticText()
        .string_("Drag sound sources to position them in quadraphonic field")
        .stringColor_(mainTheme.foreground.alpha_(0.8))
        .font_(Font("Monaco", 10))
        .align_(\center);
    
    spatialView.layout.add(statusText);
    
    // Coordinate display
    coordText = StaticText()
        .string_("AMB: [0.00, 0.00] | SMP: [0.00, 0.00]")
        .stringColor_(mainTheme.cyan)
        .font_(Font("Monaco", 11, true))
        .align_(\center);
    
    spatialView.layout.add(coordText);
    
    // Update coordinate display routine
    ~spatialUpdateRoutine = Routine({
        loop {
            {
                var ambPos = ~spatialParams.ambientPos;
                var smpPos = ~spatialParams.samplePos;
                coordText.string = "AMB: [%, %] | SMP: [%, %]".format(
                    ambPos[0].round(0.01), ambPos[1].round(0.01),
                    smpPos[0].round(0.01), smpPos[1].round(0.01)
                );
            }.defer;
            0.1.wait;
        };
    }).play(AppClock);
    
    spatialWindow.layout_(spatialView.layout);
    
    // Window cleanup
    spatialWindow.onClose = {
        "Spatial GUI closed".postln;
        if(~spatialUpdateRoutine.notNil) {
            ~spatialUpdateRoutine.stop;
            ~spatialUpdateRoutine = nil;
        };
        ~spatialWindow = nil;
    };
    
    // Store reference
    ~spatialWindow = spatialWindow;
    
    spatialWindow.front;
    
    "Spatial Control GUI loaded successfully".postln;
    "Features: Draggable sound sources, real-time positioning, quadraphonic visualization".postln;
    
}.defer;
)