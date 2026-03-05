import p5 from "p5";
import type { ParliamentState } from "./parliament/parliamentStore";
import {
    Viz,
    pickSpecies,
    iucnColor,
    showStage,
    SPECIES_ROSTER,
} from "./visualizationSwitcher";

// ─── Slot 4: Time Travel (Persistent Structures) ─────────────────────────────
export function mountTimeTravel(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    const container = stageEl;
    showStage(container);

    let destroyed = false;
    let myp5: p5 | null = null;
    let activeRoster = pickSpecies(5);

    const sketch = (p: p5) => {
        let branches: { y: number; x: number; history: { x: number, y: number }[] }[] = [];
        let radarAngle = 0;

        p.setup = () => {
            const w = container.offsetWidth || 800;
            const h = container.offsetHeight || 600;
            p.createCanvas(w, h);

            activeRoster.forEach((sp, i) => {
                branches.push({
                    y: p.map(i, 0, activeRoster.length, h * 0.2, h * 0.8),
                    x: w,
                    history: []
                });
            });
            p.textFont("'SF Mono','Fira Code','Consolas',monospace");
        };

        p.windowResized = () => {
            if (destroyed) return;
            const w = container.offsetWidth;
            const h = container.offsetHeight;
            if (w > 0 && h > 0) p.resizeCanvas(w, h);
        };

        p.draw = () => {
            if (destroyed) { p.noLoop(); return; }

            const st = getLatestState();
            const sp4 = (window as any).__slot4Soneth ?? {};
            const timeDil = sp4.timedilation ?? 0.3;
            const memFeed = sp4.memoryfeed ?? 0.4;
            const volAlpha = 0.2 + (sp4.volume ?? 0.7) * 0.8;
            const consensus = st?.consensus ?? 0.5;
            const texDep = sp4.texturedepth ?? 0.5;
            const spatSp = sp4.spatialspread ?? 0.5;
            const specS = sp4.spectralshift ?? 0.5;
            const harmR = sp4.harmonicrich ?? 0.5;
            const resBody = sp4.resonantbody ?? 0.4;
            const pitchSh = sp4.pitchshift ?? 0.5;
            const atmMix = sp4.atmospheremix ?? 0.5;
            const txInf = sp4.txinfluence ?? 0.5;

            // Amber/Phosphor dim background wipe — atmospheremix deepens ghosting
            p.background(0, 8, 4, Math.floor(15 + (1 - memFeed) * 60 + (1 - atmMix) * 20));

            const speed = 1 + timeDil * 10;

            // Background Grid (Radar style) — textureDepth controls density & weight
            const gridSpacing = Math.floor(p.lerp(60, 20, texDep));
            p.stroke(102, 51, 0, 40 + texDep * 50);
            p.strokeWeight(0.5 + texDep * 1.5);
            for (let x = 0; x < p.width; x += gridSpacing) p.line(x, 0, x, p.height);
            for (let y = 0; y < p.height; y += gridSpacing) p.line(0, y, p.width, y);

            // Secondary diagonal grid driven by harmonicRich
            if (harmR > 0.2) {
                p.stroke(102, 51, 0, harmR * 35);
                p.strokeWeight(0.3 + harmR * 0.5);
                const dSpacing = Math.floor(p.lerp(80, 30, harmR));
                for (let d = -p.height; d < p.width + p.height; d += dSpacing) {
                    p.line(d, 0, d - p.height, p.height);
                }
            }

            p.noFill();

            // spatialSpread controls vertical lane distribution
            const yMin = p.lerp(p.height * 0.1, p.height * 0.02, spatSp);
            const yMax = p.lerp(p.height * 0.9, p.height * 0.98, spatSp);

            branches.forEach((b, i) => {
                // move history left
                b.history.forEach(pt => pt.x -= speed);
                b.history = b.history.filter(pt => pt.x > -50);

                const activity = st?.species?.[i]?.activity ?? 0.5;
                const presence = st?.species?.[i]?.presence ?? 0.5;

                // radical vertical glitch shift — txinfluence amplifies glitch probability
                if (p.random() < activity * 0.15 + txInf * 0.1) {
                    b.y += p.random(-40, 40) * (presence + 0.5) * (1 + txInf);
                    b.y = p.constrain(b.y, yMin, yMax);
                }

                // pitchshift adds sinusoidal vertical modulation to traces
                const pitchWave = p.sin(p.frameCount * (0.02 + pitchSh * 0.06) + i * 2) * (pitchSh * 30);
                b.history.push({ x: p.width, y: b.y + pitchWave });

                // Phosphor trace — spectralShift bends color from phosphor-white toward amber-cyan
                p.strokeWeight(1.5 + activity * 2);
                const trR = p.lerp(200, 100, specS);
                const trG = p.lerp(255, 255, specS);
                const trB = p.lerp(230, 255, specS);
                p.stroke(trR, trG, trB, Math.floor(255 * volAlpha));
                p.beginShape();
                b.history.forEach(pt => p.vertex(pt.x, pt.y));
                p.endShape();

                // Harmonic echo trace (secondary trace at offset) driven by harmonicRich
                if (harmR > 0.25) {
                    p.strokeWeight(0.5 + activity);
                    p.stroke(255, 170, 0, Math.floor(harmR * 120 * volAlpha));
                    p.beginShape();
                    b.history.forEach(pt => p.vertex(pt.x, pt.y + 8 + harmR * 15));
                    p.endShape();
                }

                // txinfluence: chromatic tear glitches on traces
                if (txInf > 0.3 && p.random() < txInf * 0.15) {
                    p.stroke(255, 170, 0, 150);
                    p.strokeWeight(1);
                    const gIdx = Math.floor(p.random(b.history.length));
                    if (b.history[gIdx]) {
                        p.rect(b.history[gIdx].x, b.history[gIdx].y - 3, p.random(20, 80) * txInf, 2 + p.random(4));
                    }
                }

                // Bright amber markers — resonantbody controls glow size
                const markerGlow = 3 + activity * 8 + resBody * 12;
                p.fill(255, 170, 0, Math.floor(255 * volAlpha));
                p.noStroke();
                p.quad(p.width - 5, b.y - markerGlow, p.width - 5 + markerGlow, b.y, p.width - 5, b.y + markerGlow, p.width - 5 - markerGlow, b.y);

                // Outer resonance ring on marker
                if (resBody > 0.3) {
                    p.noFill();
                    p.stroke(255, 170, 0, resBody * 100);
                    p.strokeWeight(0.5);
                    p.circle(p.width - 5, b.y, markerGlow * 2.5);
                }

                p.fill(200, 255, 230, 200);
                p.textSize(9);
                p.textAlign(p.RIGHT, p.CENTER);
                p.text(`[${activeRoster[i][0]}] A:${activity.toFixed(2)}`, p.width - 20, b.y - 15);
            });

            // Rotating Radar Reticule — resonantbody controls size, timeDilation controls spin
            radarAngle += (0.01 + (1 - consensus) * 0.05) * (0.5 + timeDil);
            const reticuleSize = p.height * (0.6 + resBody * 0.4);
            p.push();
            p.translate(p.width / 2, p.height / 2);
            p.rotate(radarAngle);
            p.stroke(255, 170, 0, 40 + resBody * 60);
            p.strokeWeight(1 + resBody);
            p.noFill();
            p.circle(0, 0, reticuleSize);
            p.line(-reticuleSize / 2, 0, reticuleSize / 2, 0);
            p.line(0, -reticuleSize / 2, 0, reticuleSize / 2);
            // Inner concentric rings driven by textureDepth
            for (let r = 1; r <= Math.floor(1 + texDep * 4); r++) {
                p.stroke(102, 51, 0, 30 + texDep * 20);
                p.circle(0, 0, reticuleSize * (r / (2 + texDep * 4)));
            }
            p.pop();
        };
    };

    myp5 = new p5(sketch, container);

    return { name: "Time Travel", key: "4", destroy: () => { destroyed = true; if (myp5) { myp5.remove(); myp5 = null; } } };
}

// ─── Slot 5: Dynamic Graphs ──────────────────────────────────────────────────
export function mountDynamicGraphs(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    const container = stageEl;
    showStage(container);

    let destroyed = false;
    let myp5: p5 | null = null;
    let activeRoster = pickSpecies(8);

    const sketch = (p: p5) => {
        let nodes: { x: number, y: number, vx: number, vy: number, name: string }[] = [];

        p.setup = () => {
            const w = container.offsetWidth || 800;
            const h = container.offsetHeight || 600;
            p.createCanvas(w, h);
            activeRoster.forEach(sp => {
                nodes.push({ x: p.random(w), y: p.random(h), vx: 0, vy: 0, name: sp[0] });
            });
            p.textFont("'SF Mono','Fira Code','Consolas',monospace");
        };

        p.windowResized = () => { if (!destroyed) { const w = container.offsetWidth; const h = container.offsetHeight; if (w > 0 && h > 0) p.resizeCanvas(w, h); } };

        p.draw = () => {
            if (destroyed) { p.noLoop(); return; }

            const st = getLatestState();
            const sp5 = (window as any).__slot5Soneth ?? {};
            const consensus = st?.consensus ?? 0.5;
            const spatSp = sp5.spatialspread ?? 0.5;
            const txInf = sp5.txinfluence ?? 0.5;
            const memFeed = sp5.memoryfeed ?? 0.4;
            const texDep = sp5.texturedepth ?? 0.5;
            const harmR = sp5.harmonicrich ?? 0.5;
            const specS = sp5.spectralshift ?? 0.5;
            const tDil = sp5.timedilation ?? 0.5;
            const vol = sp5.volume ?? 0.5;
            const resBody = sp5.resonantbody ?? 0.4;
            const pitchSh = sp5.pitchshift ?? 0.5;
            const atmMix = sp5.atmospheremix ?? 0.5;

            p.background(0, 8, 4, Math.floor(25 + (1 - memFeed) * 50 + (1 - atmMix) * 30));

            const restLength = 50 + spatSp * 200 + (st?.eco?.mycoPulse ?? 0) * 100;
            const connectionProb = consensus;
            const cx = p.width / 2, cy = p.height / 2;
            // pitchShift biases vertical gravity center
            const gravityCY = cy + (pitchSh - 0.5) * p.height * 0.4;

            // Dynamic Rotating Radar Reticule
            p.push();
            p.translate(cx, cy);
            p.noFill();
            p.stroke(102, 51, 0, 80 + texDep * 100);
            p.strokeWeight(0.5 + texDep * 0.5); // Thinner
            for (let r = 50; r < p.width; r += 50) {
                p.push();
                const dir = (r % 100 === 0) ? 1 : -1;
                p.rotate(p.frameCount * 0.01 * dir * (1 + tDil * 2));
                // Broken arcs for radar feel
                p.arc(0, 0, r * 2, r * 2, 0, p.PI * 1.5);
                p.pop();
            }
            p.strokeWeight(0.5);
            // Oscillating crosshairs
            p.rotate(p.sin(p.frameCount * 0.005) * 0.5);
            p.line(0, -p.height, 0, p.height);
            p.line(-p.width, 0, p.width, 0);
            p.pop();

            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const dx = nodes[j].x - nodes[i].x; const dy = nodes[j].y - nodes[i].y;
                    const dist = p.dist(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);

                    if (dist > 0 && dist < restLength * 2) {
                        if (p.noise(i, j, p.frameCount * (0.05 * (1 + tDil))) < connectionProb) {
                            // Violent snap connections (txinfluence), alpha modulated by volume
                            p.stroke(255, 170, 0, (150 + txInf * 100) * (0.3 + vol * 0.7));
                            p.strokeWeight(0.5 + txInf * 1.5);
                            if (p.random() < txInf * 0.8) { // Huge glitch chance if txInf is high
                                // Massive visual tear glitch
                                const gX = p.random(-40, 40) * specS;
                                const gY = p.random(-40, 40) * specS;
                                p.line(nodes[i].x + gX, nodes[i].y, nodes[j].x, nodes[j].y + gY);

                                // Draw tearing artifact block
                                if (p.random() < 0.2) {
                                    p.fill(255, 170, 0, 100); p.noStroke();
                                    p.rect(p.lerp(nodes[i].x, nodes[j].x, 0.5), p.lerp(nodes[i].y, nodes[j].y, 0.5), p.random(10, 50), 2);
                                }
                            } else {
                                p.line(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);
                            }
                        }
                        const force = (dist - restLength) * (0.005 + txInf * 0.02) * (0.5 + specS);
                        nodes[i].vx += (dx / dist) * force; nodes[i].vy += (dy / dist) * force;
                        nodes[j].vx -= (dx / dist) * force; nodes[j].vy -= (dy / dist) * force;
                    }
                }
            }

            nodes.forEach((n, i) => {
                // spectralShift affects center pull magnetism, pitchShift biases vertical gravity
                n.vx += (cx - n.x) * (0.001 + specS * 0.005); n.vy += (gravityCY - n.y) * (0.001 + specS * 0.005);

                const act = st?.species?.[i % (st?.species?.length || 1)]?.activity ?? 0.5;
                const pres = st?.species?.[i % (st?.species?.length || 1)]?.presence ?? 0.5;

                // aggressive jitter
                if (p.random() < act) { n.vx += p.random(-8, 8) * txInf; n.vy += p.random(-8, 8) * txInf; }

                // timeDilation acts as system overdrive speed
                n.x += n.vx * (1 + tDil); n.y += n.vy * (1 + tDil);
                n.vx *= 0.85; n.vy *= 0.85;

                const rad = 5 + pres * 15 + texDep * 10;

                p.noFill();
                // harmonicRich bleeds white into bright amber, volume controls alpha
                p.stroke(
                    p.lerp(200, 255, harmR),
                    p.lerp(255, 170, harmR),
                    p.lerp(230, 0, harmR),
                    (150 + vol * 105)
                );
                p.strokeWeight(1 + texDep * 1.0);
                p.rectMode(p.CENTER);
                // Draw nodes as glowing wireframe boxes
                p.rect(n.x, n.y, rad, rad);

                // Resonant body outer glow ring
                if (resBody > 0.2) {
                    p.stroke(255, 170, 0, resBody * 80 * (0.5 + act * 0.5));
                    p.strokeWeight(0.3 + resBody * 0.8);
                    p.circle(n.x, n.y, rad * (1.8 + resBody * 1.5));
                }

                p.fill(200, 255, 230, 120 + vol * 135);
                p.noStroke();
                p.textSize(9); p.textAlign(p.CENTER, p.BOTTOM);
                p.text(n.name, n.x, n.y - rad / 2 - 2);
            });
        };
    };

    myp5 = new p5(sketch, container);
    return { name: "Dynamic Graphs", key: "5", destroy: () => { destroyed = true; if (myp5) { myp5.remove(); myp5 = null; } } };
}

// ─── Slot 6: Dynamic Optimality (Splay Trees) ────────────────────────────────
export function mountDynamicOptimality(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    const container = stageEl;
    showStage(container);

    let destroyed = false;
    let myp5: p5 | null = null;
    let activeRoster = pickSpecies(SPECIES_ROSTER.length); // Mapped exactly to the total ecosystem species count

    const sketch = (p: p5) => {
        let nodes: { id: number, name: string, x: number, y: number, targetX: number, targetY: number }[] = [];

        p.setup = () => {
            const w = container.offsetWidth || 800; const h = container.offsetHeight || 600;
            p.createCanvas(w, h);
            activeRoster.forEach((sp, i) => { nodes.push({ id: i, name: sp[0], x: w / 2, y: h / 2, targetX: w / 2, targetY: h / 2 }); });
            p.textFont("'SF Mono','Fira Code','Consolas',monospace");
        };

        p.windowResized = () => { if (!destroyed) { const w = container.offsetWidth; const h = container.offsetHeight; if (w > 0 && h > 0) p.resizeCanvas(w, h); } };

        p.draw = () => {
            if (destroyed) { p.noLoop(); return; }

            const st = getLatestState();
            const sp6 = (window as any).__slot6Soneth ?? {};
            const pitchSh = sp6.pitchshift ?? 0.5;
            const resVal = sp6.resonantbody ?? 0.4;
            const consensus = st?.consensus ?? 0.5;
            const memFeed = sp6.memoryfeed ?? 0.4;
            const texDep = sp6.texturedepth ?? 0.5;
            const spatSp = sp6.spatialspread ?? 0.5;
            const specS = sp6.spectralshift ?? 0.5;
            const tDil = sp6.timedilation ?? 0.5;
            const txInf = sp6.txinfluence ?? 0.5;
            const vol = sp6.volume ?? 0.5;
            const harmR = sp6.harmonicrich ?? 0.5;
            const atmMix = sp6.atmospheremix ?? 0.5;

            p.background(0, 8, 4, Math.floor(25 + (1 - memFeed) * 50 + (1 - atmMix) * 30));

            // Background Grid structure
            p.stroke(102, 51, 0, 40 + texDep * 40);
            p.strokeWeight(1 + texDep);
            // Scrolling grid down, speed mapped to timeDilation
            const scrollSpd = 20 * (0.5 + tDil);
            for (let y = (p.frameCount * scrollSpd % 40); y < p.height; y += 40) p.line(0, y, p.width, y);

            // atmospheremix: vertical scan columns sweeping across — like sonar depth layers
            if (atmMix > 0.15) {
                p.stroke(102, 51, 0, atmMix * 60);
                p.strokeWeight(0.5 + atmMix);
                const scanCount = Math.floor(2 + atmMix * 6);
                for (let s = 0; s < scanCount; s++) {
                    const sx = (p.frameCount * (1 + tDil) * (s + 1) * 0.7) % p.width;
                    p.line(sx, 0, sx, p.height);
                }
            }

            let maxAct = -1, maxIdx = 0;
            activeRoster.forEach((_, i) => {
                const act = st?.species?.[i % (st?.species?.length || 1)]?.activity ?? 0;
                if (act > maxAct) { maxAct = act; maxIdx = i; }
            });

            const rootX = p.width / 2, rootY = 50 + pitchSh * 100;
            const layerSpacing = 50 + pitchSh * 150;

            let childIdx = 0;
            nodes.forEach((n, i) => {
                if (i === maxIdx) {
                    n.targetX = rootX;
                    n.targetY = rootY + p.sin(p.frameCount * 0.05 * (1 + tDil)) * 20; // Float the root based on timeDilation
                }
                else {
                    const layer = Math.floor(Math.log2(childIdx + 2));
                    const countInLayer = Math.pow(2, layer);
                    const posInLayer = (childIdx + 2) - countInLayer;

                    // Add breathing effect to the X coordinates
                    const breathe = p.sin(p.frameCount * 0.05 * (1 + tDil) + layer) * (30 + specS * 50) * (1.1 - consensus);

                    // spatialSpread controls the horizontal width of the tree
                    const treeWidth = p.map(spatSp, 0, 1, 0.4, 0.95);
                    const leftBound = p.width * ((1 - treeWidth) / 2);
                    const rightBound = p.width * (1 - (1 - treeWidth) / 2);

                    n.targetX = p.map(posInLayer + 0.5, 0, countInLayer, leftBound, rightBound) + breathe;

                    // horizontal vibration frequency mapped to spectralShift
                    n.targetY = rootY + layer * layerSpacing + (p.noise(i, p.frameCount * (0.02 + specS * 0.05)) - 0.5) * 40;
                    childIdx++;
                }

                // Snap violently instead of smooth lerp on low consensus, modulated by timeDilation
                const snapForce = p.constrain(0.05 + (1 - consensus) * 0.4 * (0.5 + tDil), 0.01, 1);
                n.x = p.lerp(n.x, n.targetX, snapForce);
                n.y = p.lerp(n.y, n.targetY, snapForce);

                // Add aggressive vibration on low consensus
                if (consensus < 0.8) {
                    n.x += p.random(-5, 5) * (1 - consensus);
                    n.y += p.random(-5, 5) * (1 - consensus);
                }
            });

            // Wireframe Beams
            // Color intensity controlled by harmonicRich, opacity controlled by volume
            p.stroke(
                p.lerp(200, 255, harmR),
                p.lerp(100, 170, harmR),
                0,
                100 + vol * 155
            );
            p.strokeWeight(0.5 + texDep * 1.0); // Thinner
            p.noFill();
            nodes.forEach((n, i) => {
                if (i !== maxIdx) {
                    p.beginShape();
                    p.vertex(n.x, n.y);
                    if (p.random() < txInf * 0.8) {
                        // Massive chromatic tear glitch on the beam
                        const gX = p.random(-50, 50) * specS;
                        const gY = p.random(-50, 50) * specS;
                        p.vertex(n.x + gX, nodes[maxIdx].y + 20 + gY);
                    } else {
                        p.vertex(n.x, nodes[maxIdx].y + 20);
                    }
                    p.vertex(nodes[maxIdx].x, nodes[maxIdx].y);
                    p.endShape();
                }
            });

            // Nodes
            nodes.forEach(n => {
                const act = st?.species?.[n.id % (st?.species?.length || 1)]?.activity ?? 0;
                const glW = 10 + resVal * 30 + act * 20;

                p.push();
                p.translate(n.x, n.y);
                // textureDepth maps to node rotation speed
                p.rotate(p.frameCount * (0.01 + texDep * 0.05) * (1 + act * 10)); // Dynamic rotation

                p.rectMode(p.CENTER);
                p.noFill();
                // Alpha controlled by volume
                p.stroke(200, 255, 230, 100 + vol * 155); // White phosphor nodes
                p.strokeWeight(1 + act * 1.5 + texDep * 0.5); // Thinner external edges
                p.rect(0, 0, glW, glW); // Square wireframes

                // Add an inner animated square
                p.stroke(255, 170, 0, 100 + vol * 155);
                p.strokeWeight(0.5 + texDep * 0.5); // Thinner internal square
                const innerW = glW * (0.5 + 0.5 * p.sin(p.frameCount * 0.1 * (1 + tDil) + n.id));
                p.rect(0, 0, innerW, innerW);

                p.pop();

                // Dynamic label sizes and brightness depending on volume
                p.fill(200, 255, 230, 100 + vol * 155);
                p.noStroke();
                p.textSize(12 + vol * 8); // Bigger and audio-reactive sizes
                p.textAlign(p.CENTER, p.CENTER);
                p.text(n.name, n.x, n.y + glW / 2 + 15);
            });
        };
    };

    myp5 = new p5(sketch, container);
    return { name: "Dynamic Optimality", key: "6", destroy: () => { destroyed = true; if (myp5) { myp5.remove(); myp5 = null; } } };
}

// ─── Slot 7: Geometry (Sweep Lines) ──────────────────────────────────────────
export function mountGeometry(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    const container = stageEl;
    showStage(container);

    let destroyed = false;
    let myp5: p5 | null = null;
    let activeRoster = pickSpecies(6);

    const sketch = (p: p5) => {
        let rays: { y: number, a: number, name: string }[] = [];
        let radarAngle = 0;

        p.setup = () => {
            const w = container.offsetWidth || 800; const h = container.offsetHeight || 600;
            p.createCanvas(w, h);
            activeRoster.forEach(sp => { rays.push({ y: p.random(h), a: p.random(-p.QUARTER_PI, p.QUARTER_PI), name: sp[0] }); });
            p.textFont("'SF Mono','Fira Code','Consolas',monospace");
        };

        p.windowResized = () => { if (!destroyed) { const w = container.offsetWidth; const h = container.offsetHeight; if (w > 0 && h > 0) p.resizeCanvas(w, h); } };

        p.draw = () => {
            if (destroyed) { p.noLoop(); return; }

            const st = getLatestState();
            const sp7 = (window as any).__slot7Soneth ?? {};
            const atmGhost = sp7.atmospheremix ?? 0.5;
            const vol = sp7.volume ?? 0.5;
            const pitchSh = sp7.pitchshift ?? 0.5;
            const tDil = sp7.timedilation ?? 0.5;
            const specS = sp7.spectralshift ?? 0.5;
            const spatSp = sp7.spatialspread ?? 0.5;
            const texDep = sp7.texturedepth ?? 0.5;
            const harmR = sp7.harmonicrich ?? 0.5;
            const resBody = sp7.resonantbody ?? 0.4;
            const txInf = sp7.txinfluence ?? 0.5;
            const memFeed = sp7.memoryfeed ?? 0.4;

            p.background(0, 8, 4, Math.floor(25 + (1 - atmGhost) * 50 + (1 - memFeed) * 30));

            const co2 = (st?.eco?.co2 ?? 400) / 800;
            const ecoVals = [co2, (st?.eco?.mycoPulse ?? 0), st?.eco?.phosphorus ?? 0.5, st?.eco?.nitrogen ?? 0.5];
            const sweepLines = ecoVals.map(v => p.map(v % 1.0, 0, 1, 0.1, 0.9));

            // Distorting background grid — textureDepth controls density & weight
            const gridStep = Math.floor(p.lerp(50, 15, texDep));
            p.stroke(102, 51, 0, 40 + texDep * 60);
            p.strokeWeight(0.5 + texDep * 1.5);
            p.noFill();
            for (let x = 0; x < p.width; x += gridStep) {
                p.beginShape();
                for (let y = 0; y < p.height; y += gridStep) {
                    const xoff = p.noise(x * 0.01, y * 0.01, p.frameCount * (0.005 + tDil * 0.02)) * (co2 * 50);
                    p.vertex(x + xoff, y);
                }
                p.endShape();
            }

            // Radar Sweep Lines — spectralShift bends color amber↔cyan
            const swR = p.lerp(255, 80, specS);
            const swG = p.lerp(170, 230, specS);
            const swB = p.lerp(0, 200, specS);
            p.stroke(swR, swG, swB, 120 + vol * 135);
            p.strokeWeight(1.5 + vol);
            sweepLines.forEach(sx => { const x = sx * p.width; p.line(x, 0, x, p.height); });

            // Rotating radar reticule — timedilation controls rotation speed
            radarAngle += (0.005 + tDil * 0.03);
            p.push();
            p.translate(p.width / 2, p.height / 2);
            p.rotate(radarAngle);
            p.noFill();
            p.stroke(102, 51, 0, 50 + resBody * 60);
            p.strokeWeight(0.5 + resBody);
            const retSize = p.height * (0.5 + resBody * 0.4);
            p.circle(0, 0, retSize);
            if (texDep > 0.3) {
                for (let r = 1; r <= Math.floor(1 + texDep * 3); r++) {
                    p.circle(0, 0, retSize * (r / (2 + texDep * 3)));
                }
            }
            p.pop();

            // spatialSpread controls vertical lane distribution of rays
            const yMin = p.lerp(p.height * 0.15, p.height * 0.02, spatSp);
            const yMax = p.lerp(p.height * 0.85, p.height * 0.98, spatSp);

            // Rays and targets
            rays.forEach((r, i) => {
                const presence = st?.species?.[i]?.presence ?? 0.5;
                const act = st?.species?.[i]?.activity ?? 0.5;

                // timedilation controls drift speed
                r.y += (act - 0.5) * (3 + tDil * 5);
                if (r.y < yMin) r.y = yMax; if (r.y > yMax) r.y = yMin;
                // pitchshift controls angular amplitude
                const angleRange = p.QUARTER_PI * (0.3 + pitchSh * 1.4);
                r.a += (p.noise(i, p.frameCount * (0.005 + tDil * 0.015)) - 0.5) * 0.05;
                r.a = p.constrain(r.a, -angleRange, angleRange);

                // Primary ray — volume controls brightness
                const rayAlpha = (60 + presence * 175) * (0.3 + vol * 0.7);
                p.stroke(200, 255, 230, rayAlpha);
                p.strokeWeight(1 + act * 2 + texDep * 0.5);
                const endY = r.y + Math.tan(r.a) * p.width;
                p.line(0, r.y, p.width, endY);

                // Harmonic echo ray (secondary trace) driven by harmonicRich
                if (harmR > 0.2) {
                    p.stroke(255, 170, 0, harmR * 80 * (0.3 + vol * 0.7));
                    p.strokeWeight(0.5 + harmR);
                    const echoOff = 10 + harmR * 25;
                    p.line(0, r.y + echoOff, p.width, endY + echoOff);
                }

                // txinfluence: glitch distortion tears on rays
                if (txInf > 0.25 && p.random() < txInf * 0.2) {
                    p.stroke(255, 170, 0, 150);
                    p.strokeWeight(0.8);
                    const gx = p.random(p.width);
                    const gy = r.y + Math.tan(r.a) * gx;
                    p.noFill();
                    p.rect(gx, gy - 2, p.random(30, 100) * txInf, 2 + p.random(4));
                }

                sweepLines.forEach(sx => {
                    const ix = sx * p.width; const iy = r.y + Math.tan(r.a) * ix;
                    if (iy > 0 && iy < p.height) {
                        // Target size modulated by resonantbody
                        const targetSize = 10 + act * 25 + resBody * 15;

                        // Radar target crosshairs
                        p.noFill();
                        p.stroke(swR, swG, swB, 200 + vol * 55);
                        p.strokeWeight(1 + resBody * 0.5);
                        p.circle(ix, iy, targetSize);
                        p.line(ix - targetSize / 2, iy, ix + targetSize / 2, iy);
                        p.line(ix, iy - targetSize / 2, ix, iy + targetSize / 2);

                        // Resonant outer ring
                        if (resBody > 0.3) {
                            p.stroke(swR, swG, swB, resBody * 60);
                            p.strokeWeight(0.3);
                            p.circle(ix, iy, targetSize * (1.6 + resBody));
                        }

                        p.fill(200, 255, 230, 180 + vol * 75); p.noStroke();
                        p.textSize(9); p.textAlign(p.LEFT, p.CENTER);
                        p.text(`[${r.name}]`, ix + targetSize / 2 + 4, iy - 6);
                        p.text(`A:${act.toFixed(2)}`, ix + targetSize / 2 + 4, iy + 4);
                    }
                });
            });
        };
    };

    myp5 = new p5(sketch, container);
    return { name: "Geometry", key: "7", destroy: () => { destroyed = true; if (myp5) { myp5.remove(); myp5 = null; } } };
}

// ─── Slot 8: Memory Hierarchy ────────────────────────────────────────────────
export function mountMemoryHierarchy(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    const container = stageEl;
    showStage(container);

    let destroyed = false;
    let myp5: p5 | null = null;
    let activeRoster = pickSpecies(4);

    const sketch = (p: p5) => {
        let hexNoiseArray: string[] = [];

        p.setup = () => {
            const w = container.offsetWidth || 800; const h = container.offsetHeight || 600;
            p.createCanvas(w, h);
            p.textFont("'SF Mono','Fira Code','Consolas',monospace");
            for (let i = 0; i < 100; i++) hexNoiseArray.push(Math.floor(p.random(65535)).toString(16).padStart(4, "0").toUpperCase());
        };

        p.windowResized = () => { if (!destroyed) { const w = container.offsetWidth; const h = container.offsetHeight; if (w > 0 && h > 0) p.resizeCanvas(w, h); } };

        p.draw = () => {
            if (destroyed) { p.noLoop(); return; }

            const st = getLatestState();
            const sp8 = (window as any).__slot8Soneth ?? {};
            const resBody = sp8.resonantbody ?? 0.5;
            const memFeed = sp8.memoryfeed ?? 0.5;
            const vol = sp8.volume ?? 0.5;
            const pitchSh = sp8.pitchshift ?? 0.5;
            const tDil = sp8.timedilation ?? 0.5;
            const specS = sp8.spectralshift ?? 0.5;
            const spatSp = sp8.spatialspread ?? 0.5;
            const texDep = sp8.texturedepth ?? 0.5;
            const harmR = sp8.harmonicrich ?? 0.5;
            const atmMix = sp8.atmospheremix ?? 0.5;
            const txInf = sp8.txinfluence ?? 0.5;

            p.background(0, 8, 4, Math.floor(25 + (1 - memFeed) * 50 + (1 - atmMix) * 30));

            const aiOpt = st?.ai?.optimization ?? 10;
            const conscious = st?.ai?.consciousness ?? 0.5;

            // Hex Noise Matrix Background — timedilation controls refresh rate, textureDepth controls density
            const hexCount = Math.floor(20 + texDep * 40);
            p.fill(102, 51, 0, 30 + texDep * 30);
            p.noStroke();
            p.textSize(7 + texDep * 3);
            const hexRefresh = Math.max(1, Math.floor(8 - tDil * 7));
            for (let i = 0; i < hexCount; i++) {
                if (p.frameCount % hexRefresh === 0) hexNoiseArray[i % hexNoiseArray.length] = Math.floor(p.random(65535)).toString(16).padStart(4, "0").toUpperCase();
                p.text(hexNoiseArray[i % hexNoiseArray.length], p.random(p.width), p.random(p.height));
            }

            // spectralShift: layer-dependent color variation (amber↔cyan per layer depth)
            const layerColor = (layer: number) => {
                const t = specS * (layer / 3);
                return {
                    r: p.lerp(255, 80, t),
                    g: p.lerp(170, 230, t),
                    b: p.lerp(0, 200, t)
                };
            };

            const layers = 3;
            const baseH = p.height / (layers + 1.5);
            // pitchShift offsets layer vertical spacing
            const layerGap = 30 + pitchSh * 40;
            let cy = 30 + pitchSh * 40;

            for (let j = 0; j < layers; j++) {
                // spatialSpread controls layer width distribution
                const wRatio = p.map(j, 0, layers - 1, 0.95 * (0.8 + spatSp * 0.2), 0.25 + spatSp * 0.15);
                const w = (p.width * wRatio) * (0.8 + p.noise(j, p.frameCount * (0.005 + tDil * 0.015)) * 0.4);
                let x = (p.width - w) / 2;

                // Faulting blocks — txinfluence amplifies displacement probability & magnitude
                const glitchProb = 0.1 + txInf * 0.2;
                if (aiOpt < 50 && p.random() < glitchProb) {
                    x += p.random(-40, 40) * (1 - (aiOpt / 100)) * (1 + txInf);
                }

                // CRT Reticule boundary — color by layer via spectralShift
                const lc = layerColor(j);
                p.stroke(lc.r, lc.g, lc.b, (120 + resBody * 135) * (0.4 + vol * 0.6));
                p.strokeWeight(1 + resBody * 0.5);
                p.noFill(); p.rect(x, cy, w, baseH);

                // Grid inside block — textureDepth controls density
                const innerGridStep = Math.floor(p.lerp(30, 10, texDep));
                p.stroke(102, 51, 0, 50 + texDep * 60);
                p.strokeWeight(0.5 + texDep);
                for (let gx = x + 5; gx < x + w - 5; gx += innerGridStep) { p.line(gx, cy, gx, cy + baseH); }
                // Horizontal sub-grid driven by textureDepth
                if (texDep > 0.4) {
                    for (let gy = cy + innerGridStep; gy < cy + baseH; gy += innerGridStep) {
                        p.line(x, gy, x + w, gy);
                    }
                }

                let blockCX = x + 10;
                for (let i = 0; i < activeRoster.length; i++) {
                    const pres = st?.species?.[i]?.presence ?? 0.5;
                    const act = st?.species?.[i]?.activity ?? 0.5;
                    const cw = (w - 20) * (pres / layers) * (0.5 + p.noise(i, j, p.frameCount * (0.01 + tDil * 0.02)));

                    p.noFill();
                    // volume controls internal block visibility
                    p.stroke(200, 255, 230, (150 + vol * 105));
                    p.strokeWeight(1 + act * 3);
                    p.rect(blockCX, cy + 10, cw, baseH - 20);

                    // Crosshatch active blocks — harmonicRich controls hatch density & weight
                    if (act > 0.4) {
                        p.strokeWeight(0.3 + harmR * 0.8);
                        const hatchStep = Math.max(2, Math.floor(8 - harmR * 5));
                        for (let bx = blockCX; bx < blockCX + cw; bx += hatchStep) {
                            p.line(bx, cy + 10, bx + hatchStep, cy + baseH - 10);
                        }
                        // Secondary cross-hatch driven by harmonicRich
                        if (harmR > 0.5) {
                            p.strokeWeight(0.2 + harmR * 0.3);
                            for (let bx = blockCX + cw; bx > blockCX; bx -= hatchStep) {
                                p.line(bx, cy + 10, bx - hatchStep, cy + baseH - 10);
                            }
                        }
                    }

                    // txinfluence: random block displacement glitches
                    if (txInf > 0.3 && p.random() < txInf * 0.08) {
                        p.stroke(255, 170, 0, 150);
                        p.strokeWeight(0.5);
                        p.noFill();
                        const gOff = p.random(-20, 20) * txInf;
                        p.rect(blockCX + gOff, cy + 10 + gOff * 0.5, cw, baseH - 20);
                    }

                    if (cw > 30) {
                        p.fill(200, 255, 230, 150 + vol * 105); p.noStroke();
                        p.textSize(9); p.textAlign(p.CENTER, p.CENTER);
                        p.text(`SECURE`, blockCX + cw / 2, cy + baseH / 2 - 5);
                        p.text(`[${activeRoster[i][0]}]`, blockCX + cw / 2, cy + baseH / 2 + 5);
                    }
                    blockCX += cw + 5;
                }

                if (j < layers - 1) {
                    p.stroke(200, 255, 230, 150 * memFeed * (0.4 + vol * 0.6));
                    p.strokeWeight(1.5 + harmR);
                    const dropCount = Math.floor(3 + texDep * 5);
                    for (let k = 0; k < dropCount; k++) {
                        const dropX = x + p.random(w);
                        p.beginShape();
                        p.vertex(dropX, cy + baseH);
                        p.vertex(dropX + p.random(-15, 15) * (1 + txInf), cy + baseH + 15);
                        p.vertex(dropX + p.random(-15, 15) * (1 + txInf), cy + baseH + layerGap - 2);
                        p.endShape();
                    }
                }
                cy += baseH + layerGap;
            }
        };
    };

    myp5 = new p5(sketch, container);
    return { name: "Memory Hierarchy", key: "8", destroy: () => { destroyed = true; if (myp5) { myp5.remove(); myp5 = null; } } };
}

// ─── Slot 9: Hashing ─────────────────────────────────────────────────────────
export function mountHashing(stageEl: HTMLElement, getLatestState: () => ParliamentState | null): Viz {
    const container = stageEl;
    showStage(container);

    let destroyed = false;
    let myp5: p5 | null = null;
    let activeRoster = pickSpecies(6);

    const sketch = (p: p5) => {
        p.setup = () => {
            const w = container.offsetWidth || 800; const h = container.offsetHeight || 600;
            p.createCanvas(w, h);
            p.textFont("'SF Mono','Fira Code','Consolas',monospace");
        };

        p.windowResized = () => { if (!destroyed) { const w = container.offsetWidth; const h = container.offsetHeight; if (w > 0 && h > 0) p.resizeCanvas(w, h); } };

        p.draw = () => {
            if (destroyed) { p.noLoop(); return; }

            const st = getLatestState();
            const sp9 = (window as any).__slot9Soneth ?? {};
            const vol = sp9.volume ?? 0.5;
            const consensus = st?.consensus ?? 0.5;
            const resBody = sp9.resonantbody ?? 0.4;
            const memFeed = sp9.memoryfeed ?? 0.4;
            const pShift = sp9.pitchshift ?? 0.5;
            const tDil = sp9.timedilation ?? 0.5;
            const hRich = sp9.harmonicrich ?? 0.5;
            const sShift = sp9.spectralshift ?? 0.5;
            const tDepth = sp9.texturedepth ?? 0.5;
            const spatSp = sp9.spatialspread ?? 0.5;
            const atmMix = sp9.atmospheremix ?? 0.5;
            const txInf = sp9.txinfluence ?? 0.5;

            p.background(0, 8, 4, Math.floor(25 + (1 - memFeed) * 50 + (1 - atmMix) * 30));

            // Flashing scanlines mapped to volume and textureDepth
            p.stroke(200, 255, 230, p.random(10, 30) * vol + tDepth * 40);
            p.strokeWeight(0.5 + p.random(1.5) * vol + tDepth * 1); // Thinner
            for (let y = 0; y < p.height; y += p.random(4, 10)) { p.line(0, y, p.width, y); }

            // Global screen tearing glitches if spectralShift is high
            if (p.random() < sShift * 0.4) {
                p.fill(255, 170, 0, 80); p.noStroke();
                p.rect(p.random(p.width), p.random(p.height), p.random(50, 400), p.random(2, 10));
                p.fill(200, 255, 230, 80);
                p.rect(p.random(p.width), p.random(p.height), p.random(50, 200), p.random(1, 4));
            }

            const numKeys = 8, numBuckets = 6;
            // spatialSpread controls horizontal distance between key and bucket columns
            const colA_X = p.width * p.lerp(0.3, 0.12, spatSp);
            const colB_X = p.width * p.lerp(0.7, 0.88, spatSp);
            const spacingA = p.height / (numKeys + 1), spacingB = p.height / (numBuckets + 1);

            let bucketHits = new Array(numBuckets).fill(0);
            let mapTargets = new Array(numKeys).fill(0);

            // calc hashes first to identify collisions, timeDilation speeds up mutation
            for (let i = 0; i < numKeys; i++) {
                const hash = Math.floor(p.noise(i, p.frameCount * 0.005 * (1.1 - consensus) * (1 + tDil * 2)) * numBuckets);
                const mapped = p.constrain(hash, 0, numBuckets - 1);
                mapTargets[i] = mapped;
                bucketHits[mapped]++;
            }

            for (let i = 0; i < numKeys; i++) {
                const yA = (i + 1) * spacingA;
                const mapped = mapTargets[i];
                // pitchShift controls vertical spread of buckets
                const yB = (mapped + 1) * spacingB + (pShift - 0.5) * 100;
                const isCollision = bucketHits[mapped] > 1;

                const spAct = st?.species?.[i % (st?.species?.length || 1)]?.activity ?? 0.5;

                p.noFill();

                // Mapped Line
                if (isCollision) {
                    // Jagged collision noise paths, thickened by harmonicRich + txinfluence
                    p.stroke(255, 170, 0, 150 + spAct * 100);
                    p.strokeWeight(1 + spAct + p.random(1) + hRich * 1.5 + txInf * 0.5);
                    p.beginShape();
                    p.vertex(colA_X + 20, yA);
                    for (let x = colA_X + 30; x < colB_X - 20; x += (colB_X - colA_X) / 8) {
                        const glitchY = p.lerp(yA, yB, (x - colA_X) / (colB_X - colA_X));
                        // glitch amplitude boosted by spectralShift + txinfluence
                        p.vertex(x, glitchY + p.random(-35, 35) * (1 - consensus) * (1 + sShift * 3 + txInf * 2));
                    }
                    p.vertex(colB_X - 20, yB);
                    p.endShape();

                    // txinfluence: chromatic tear artifacts on collision paths
                    if (txInf > 0.3 && p.random() < txInf * 0.3) {
                        p.stroke(255, 170, 0, 100); p.strokeWeight(0.5);
                        const tearX = p.lerp(colA_X, colB_X, p.random());
                        const tearY = p.lerp(yA, yB, p.random());
                        p.noFill();
                        p.rect(tearX, tearY - 2, p.random(20, 80) * txInf, 2 + p.random(3));
                    }
                } else {
                    // Clean paths, weighted by harmonicRich
                    p.stroke(200, 255, 230, 100 + spAct * 155); // White phosphor
                    p.strokeWeight(0.5 + spAct * 0.5 + hRich * 1.0); // Thinner
                    p.beginShape();
                    p.vertex(colA_X + 20, yA); p.bezierVertex(p.width / 2, yA, p.width / 2, yB, colB_X - 20, yB);
                    p.endShape();
                }

                // Arrow head
                p.fill(isCollision ? p.color(255, 170, 0) : p.color(200, 255, 230)); p.noStroke();
                p.triangle(colB_X - 20, yB, colB_X - 30, yB - 5, colB_X - 30, yB + 5);

                // Origin Node
                p.noFill();
                p.stroke(200, 255, 230, 255); p.strokeWeight(1.5);
                p.rectMode(p.CENTER);
                p.rect(colA_X, yA, 20, 20); // Square boxes instead of circles

                if (i < activeRoster.length) {
                    p.fill(200, 255, 230, 255); p.noStroke(); p.textSize(10); p.textAlign(p.RIGHT, p.CENTER);
                    p.text(`[${activeRoster[i][0]}]`, colA_X - 15, yA);
                }
            }

            for (let j = 0; j < numBuckets; j++) {
                const yB = (j + 1) * spacingB + (pShift - 0.5) * 100;
                const isCollision = bucketHits[j] > 1;

                p.noFill();
                p.stroke(isCollision ? p.color(255, 170, 0, 200 + resBody * 55) : p.color(200, 255, 230, 100));
                p.strokeWeight(isCollision ? 1 + p.random(1) + hRich : 0.5 + hRich * 0.5); // Thinner

                // Aggressive Shake for collisions
                let bx = colB_X;
                let by = yB - 15;
                if (isCollision) {
                    bx += p.random(-5, 5) * (1 - consensus) * (1 + sShift);
                    by += p.random(-5, 5) * (1 - consensus) * (1 + sShift);
                }

                p.rect(bx, by + 15, 30, 30);

                // Crosshatch interior on collision
                if (isCollision) {
                    p.strokeWeight(0.5);
                    for (let px = bx - 15; px < bx + 15; px += 4) p.line(px, by, px + 4, by + 30);
                }

                p.fill(isCollision ? p.color(255, 170, 0) : p.color(200, 255, 230)); p.noStroke();
                p.textAlign(p.LEFT, p.CENTER);

                // Text glitch rotation powered by spectralShift
                p.push();
                p.translate(bx + 25, by + 15);
                if (isCollision) {
                    p.rotate(p.random(-0.2, 0.2) * sShift);
                }
                p.text(`0x00${j}`, 0, 0);
                p.pop();
            }
        };
    };

    myp5 = new p5(sketch, container);
    return { name: "Hashing", key: "9", destroy: () => { destroyed = true; if (myp5) { myp5.remove(); myp5 = null; } } };
}
