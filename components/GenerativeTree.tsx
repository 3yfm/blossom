import React, { useEffect, useRef } from 'react';
import p5 from 'p5';
import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { ParticleType } from '../types';

interface GenerativeTreeProps {
  onCameraReady: () => void;
}

export const GenerativeTree: React.FC<GenerativeTreeProps> = ({ onCameraReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

  useEffect(() => {
    let myP5: p5;

    const initVision = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1 // Strictly only one hand/wand
        });
        
        // Start Camera
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
           const stream = await navigator.mediaDevices.getUserMedia({ video: true });
           if (videoRef.current) {
             videoRef.current.srcObject = stream;
             videoRef.current.addEventListener('loadeddata', () => {
                 onCameraReady();
             });
           }
        }

      } catch (err) {
        console.error("Error initializing vision:", err);
        // Fallback to CPU if GPU fails
        try {
            const vision = await FilesetResolver.forVisionTasks(
              "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
            );
            handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "CPU"
              },
              runningMode: "VIDEO",
              numHands: 1
            });
            console.log("Fallback to CPU delegate successful");
        } catch (retryErr) {
            console.error("Vision init completely failed:", retryErr);
        }
      }
    };

    const sketch = (p: p5) => {
      // Macaron Palette with Gray Trunk
      const PALETTE = {
        bg: '#FDFBF7',
        trunk: '#808080', // Gray
        flowers: [
            '#FFB7B2', // Pink
            '#FFDAC1', // Peach
            '#E2F0CB', // Light Green
            '#B5EAD7', // Mint
            '#C7CEEA', // Lavender
        ],
        stamens: [
            '#FFF4BD', // Creamy Yellow
            '#FF9AA2', // Salmon
            '#FFB347', // Orange
            '#FFFFB5', // Pastel Yellow
        ]
      };

      let parts: Particle[] = [];
      let treePositions: {x: number, y: number}[] = [];
      let prevIndexPos: p5.Vector | null = null;
      let fingerStillFrames = 0;
      let wandPos: p5.Vector | null = null; // Wand position tracking
      
      // Offscreen graphics buffer for the persistent tree trails
      let treeLayer: p5.Graphics;

      // Helper for random negative
      const randNeg = (n?: number) => {
        if (n === undefined || n === null) return p.random() < 0.5 ? 1 : -1;
        return p.random() < 0.5 ? n : -n;
      };

      class Particle {
        pos: p5.Vector;
        col: p5.Color;
        stamenCol: p5.Color;
        siz: number;
        asiz: number; 
        dir: number; 
        spd: number;
        life: number;
        lifespan: number;
        tag: ParticleType;
        
        // Animation State
        rotationOffset: number;
        currentRotation: number;
        targetScale: number;
        currentScale: number;
        lastHoveredTime: number;
        isBloomed: boolean;
        interactionRotation: number;
        
        // Storing "original" size for calc
        rsiz: number;

        constructor(sx: number, sy: number, sc: string | p5.Color, ss: number, sd: number, sl: number, ls: number, tag: ParticleType) {
          this.tag = tag;
          this.pos = p.createVector(sx, sy);
          
          if (typeof sc === 'string') {
            this.col = p.color(sc);
          } else {
            this.col = sc;
          }

          // Pick a random stamen color
          this.stamenCol = p.color(p.random(PALETTE.stamens));

          this.siz = (this.tag === ParticleType.FLOWER) ? 0 : 1; 
          this.asiz = ss;
          this.rsiz = this.asiz * this.siz;
          this.dir = sd;
          this.life = sl;
          this.lifespan = ls;
          
          // Speed logic
          this.spd = (this.tag === ParticleType.TRUNK) ? 2 : p.random(0.25, 2);
          if (this.tag === ParticleType.FLOWER) this.spd = 0;

          // Animation properties
          this.rotationOffset = p.random(p.TWO_PI);
          this.currentRotation = this.rotationOffset;
          this.targetScale = 1;
          this.currentScale = 1;
          this.lastHoveredTime = -1000;
          this.isBloomed = false;
          this.interactionRotation = 0;
        }

        update() {
          this.life++;

          // --- FLOWER LOGIC ---
          if (this.tag === ParticleType.FLOWER) {
             // Grow in initially
             if (this.siz < 1) {
                this.siz += 0.1;
                if (this.siz > 1) this.siz = 1;
             }

             // Handle Hover Animation State
             const timeSinceHover = p.millis() - this.lastHoveredTime;
             
             if (timeSinceHover < 200) {
                 // Is being hovered/interacted with
                 this.targetScale = 2.5; // Big magnification
                 this.isBloomed = true;
                 
                 // Smoothly rotate towards finger angle
                 let diff = this.interactionRotation - this.currentRotation;
                 while (diff < -p.PI) diff += p.TWO_PI;
                 while (diff > p.PI) diff -= p.TWO_PI;
                 this.currentRotation += diff * 0.1; 

             } else {
                 if (this.isBloomed) {
                    // Stay big if already bloomed
                    this.targetScale = 2.5;
                 } else {
                    // Return to normal
                    this.targetScale = 1;
                    this.currentRotation = p.lerp(this.currentRotation, this.rotationOffset, 0.05);
                 }
             }

             // Smooth Scale Transition
             this.currentScale = p.lerp(this.currentScale, this.targetScale, 0.1);

             return false; // Flowers don't die based on life/speed
          }

          // --- TREE LOGIC ---
          this.rsiz = this.asiz * this.siz;
          
          // Movement
          const rad = p.radians(this.dir);
          this.pos.add(p.createVector(p.cos(rad) * this.spd, p.sin(rad) * this.spd));
          
          // Direction Jitter
          const jitterMult = (this.tag === ParticleType.TRUNK && this.siz > 0.9) 
            ? 1 
            : p.map(this.life, 0, this.lifespan, 1, 5);
          this.dir += p.random(-1, 1) * jitterMult;

          // Tapering
          this.siz = p.lerp(this.siz, 0, p.random(0.015));

          // Death conditions
          if (this.rsiz < 0.1 || this.spd > this.rsiz) {
             return true; 
          }

          // Store position for blooms - EXCLUDING BOTTOM TRUNK
          if (p.frameCount % 5 === 0 && this.pos.y < p.height * 0.7) {
             treePositions.push({x: this.pos.x, y: this.pos.y});
          }
          
          // --- Spawning Logic ---
          // 1. Trunk -> Branch
          if (p.random() < 0.03 && this.tag === ParticleType.TRUNK && this.siz < 0.55) {
             parts.push(new Particle(
                 this.pos.x, this.pos.y, 
                 this.col, 
                 this.rsiz, 
                 this.dir + randNeg(p.random(15, 30)), 
                 this.life, 
                 this.lifespan, 
                 ParticleType.BRANCH
             ));
          }

          // 2. Branch Forking
          if (p.random() < 0.01 && this.tag === ParticleType.BRANCH) {
              parts.push(new Particle(
                  this.pos.x, this.pos.y, 
                  this.col, 
                  this.rsiz, 
                  this.dir, 
                  this.life, 
                  this.lifespan, 
                  ParticleType.BRANCH
              ));
          }

          // 3. Twigs
          let twigChance = 0;
          if (this.tag === ParticleType.BRANCH && this.siz < 0.25) {
             twigChance = p.map(this.siz, 0, 0.25, 0.5, 0.3);
          }
          if (p.random() < twigChance) {
                 const newSize = (this.siz ** 0.5) * this.rsiz;
                 parts.push(new Particle(
                     this.pos.x, this.pos.y, 
                     this.col, 
                     newSize, 
                     this.dir + randNeg(p.random(5, 20)), 
                     0, 
                     p.random(this.lifespan * 0.05), 
                     ParticleType.TWIG
                 ));
          }

          return false;
        }

        display(target: p5 | p5.Graphics) {
          target.noStroke();
          
          if (this.tag === ParticleType.FLOWER) {
             target.push();
             target.translate(this.pos.x, this.pos.y);
             target.rotate(this.currentRotation); 
             
             // Apply interactive scale
             const renderScale = this.currentScale;
             target.scale(renderScale);

             // Draw Petals
             target.fill(this.col);
             const petalSize = this.asiz * this.siz; 
             
             for(let i = 0; i < 5; i++) {
                target.ellipse(0, petalSize * 0.35, petalSize * 0.6, petalSize);
                target.rotate(p.TWO_PI / 5);
             }

             // Draw Stamen (Center)
             target.fill(this.stamenCol);
             target.circle(0, 0, petalSize * 0.4);

             target.pop();
          } else {
             // Tree drawing (Stippling effect)
             if (p.random() < 0.3) {
                 target.fill(this.col);
                 target.circle(this.pos.x, this.pos.y, this.rsiz); 
             }
          }
        }
      }

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        
        // Initialize the persistent tree layer
        treeLayer = p.createGraphics(p.width, p.height);
        treeLayer.background(PALETTE.bg);
        treeLayer.noStroke();
        
        p.background(PALETTE.bg);
        p.randomSeed(42); 
        startTree();
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        // Reset tree layer
        treeLayer = p.createGraphics(p.width, p.height);
        treeLayer.background(PALETTE.bg);
        
        parts = [];
        treePositions = [];
        p.randomSeed(42);
        startTree();
      };

      function startTree() {
        const startX = p.width / 2;
        const count = 2; 
        
        for(let i = 0; i < count; i++) {
            const angle = i === 0 ? 260 : 280;
            parts.push(new Particle(
                startX + p.random(-2, 2), 
                p.height * 0.95, 
                PALETTE.trunk, 
                100, 
                angle, 
                0, 
                500, 
                ParticleType.TRUNK
            ));
        }
      }

      function spawnFlower(x: number, y: number, handScreenSizeRatio: number = 0.1) {
          const flowerColor = p.random(PALETTE.flowers);
          // Map hand size to flower size: Far (Small) -> Close (Big)
          const size = p.map(handScreenSizeRatio, 0.05, 0.3, 10, 35, true); 
          parts.push(new Particle(x, y, flowerColor, size, 0, 0, 0, ParticleType.FLOWER));
      }

      // Helper to draw a star
      function drawStar(target: p5, x: number, y: number, radius1: number, radius2: number, npoints: number) {
        let angle = target.TWO_PI / npoints;
        let halfAngle = angle / 2.0;
        target.beginShape();
        for (let a = 0; a < target.TWO_PI; a += angle) {
          let sx = x + target.cos(a) * radius2;
          let sy = y + target.sin(a) * radius2;
          target.vertex(sx, sy);
          sx = x + target.cos(a + halfAngle) * radius1;
          sy = y + target.sin(a + halfAngle) * radius1;
          target.vertex(sx, sy);
        }
        target.endShape(target.CLOSE);
      }

      // Helper to draw the Magic Wand
      function drawWand(pos: p5.Vector) {
          if (!pos) return;
          
          p.push();
          p.translate(pos.x, pos.y);
          // Angle of wand (tilted slightly left)
          p.rotate(-p.PI / 4);

          // 1. The Handle (Klein Blue)
          p.stroke('#002FA7'); // Klein Blue
          p.strokeWeight(6);
          p.strokeCap(p.ROUND);
          p.line(0, 0, 0, 60);

          // 2. The Tip/Star (Rose Pink / 玫粉色)
          p.noStroke();
          p.fill('#FF007F'); // Rose Pink
          drawStar(p, 0, 0, 10, 20, 5); 

          // 3. Inner Gem (White/Light)
          p.fill(255, 200);
          p.circle(0, 0, 6);

          p.pop();
      }

      p.draw = () => {
        // 1. Process Hand Tracking
        if (handLandmarkerRef.current && 
            videoRef.current && 
            videoRef.current.readyState >= 2 &&
            videoRef.current.videoWidth > 0 &&
            videoRef.current.videoHeight > 0 &&
            videoRef.current.currentTime !== lastVideoTimeRef.current) {
           
           lastVideoTimeRef.current = videoRef.current.currentTime;
           try {
              const result = handLandmarkerRef.current.detectForVideo(videoRef.current, Date.now());
              handleHandInteraction(result);
           } catch (error) {
              console.warn("Hand tracking error:", error);
           }
        }

        // 2. Render Main Composition
        // Draw the persistent tree layer first (clears the previous frame's dynamic content)
        if (treeLayer) {
           p.image(treeLayer, 0, 0);
        }

        const backgroundFlowers: Particle[] = [];
        const foregroundFlowers: Particle[] = [];

        for (let i = parts.length - 1; i >= 0; i--) {
          const part = parts[i];
          const isDead = part.update();
          
          if (!isDead) {
            if (part.tag === ParticleType.FLOWER) {
                // Flowers are drawn every frame on the main canvas (to handle animation/layering)
                if (part.currentScale > 1.05) {
                    foregroundFlowers.push(part);
                } else {
                    backgroundFlowers.push(part);
                }
            } else {
                // Tree parts draw onto the persistent layer
                part.display(treeLayer);
            }
          } else {
            parts.splice(i, 1);
          }
        }

        // Draw Flowers (fresh every frame on main canvas)
        for (const part of backgroundFlowers) {
            part.display(p);
        }
        for (const part of foregroundFlowers) {
            part.display(p);
        }

        // 3. Draw Magic Wand ON TOP of everything
        // Because we use image(treeLayer), the previous wand position is cleared, preventing trails.
        if (wandPos) {
           drawWand(wandPos);
        }
      };

      function handleHandInteraction(result: HandLandmarkerResult) {
         if (result.landmarks && result.landmarks.length > 0) {
            const landmarks = result.landmarks[0];
            const indexTip = landmarks[8];
            const wrist = landmarks[0];
            
            // Coordinates
            const x = (1 - indexTip.x) * p.width;
            const y = indexTip.y * p.height;
            const currentTipPos = p.createVector(x, y);
            
            // Update Wand Position with smoothing
            if (!wandPos) {
                wandPos = currentTipPos.copy();
            } else {
                // Smoothly interpolate for a "following" effect
                wandPos.lerp(currentTipPos, 0.2);
            }

            // Calculate Hand Size relative to screen (Wrist to Index Base)
            const indexBase = landmarks[5];
            const handSizePixels = p.dist(
                (1 - wrist.x) * p.width, wrist.y * p.height,
                (1 - indexBase.x) * p.width, indexBase.y * p.height
            );
            // Rough diagonal of screen
            const screenDiag = p.dist(0, 0, p.width, p.height);
            const handScreenSizeRatio = handSizePixels / screenDiag; 

            // Calculate Hand Velocity (based on Index Tip)
            let velocity = 0;
            if (prevIndexPos) {
                velocity = p.dist(currentTipPos.x, currentTipPos.y, prevIndexPos.x, prevIndexPos.y);
            }

            // --- GESTURE DETECTION ---
            
            // 1. Is Pointing? (Index extended, others closer to wrist than index)
            const dIndex = p.dist(wrist.x, wrist.y, landmarks[8].x, landmarks[8].y);
            const dMiddle = p.dist(wrist.x, wrist.y, landmarks[12].x, landmarks[12].y);
            const dRing = p.dist(wrist.x, wrist.y, landmarks[16].x, landmarks[16].y);
            const dPinky = p.dist(wrist.x, wrist.y, landmarks[20].x, landmarks[20].y);
            
            // Heuristic: Index is significantly further than others
            const isPointing = (dIndex > dMiddle * 1.1) && (dIndex > dRing * 1.1) && (dIndex > dPinky * 1.1);

            // 2. Is Still?
            const isStill = velocity < 3; // Threshold for stillness
            
            if (isStill) {
              fingerStillFrames++;
            } else {
              fingerStillFrames = 0;
            }

            // --- INTERACTION LOGIC ---

            if (isPointing && fingerStillFrames > 10) {
               // INTERACTION: STILL FINGER -> MAGNIFY & ROTATE
               // Find closest flower
               let closestDist = 50; 
               let closestFlower: Particle | null = null;
               
               const wx = (1 - wrist.x) * p.width;
               const wy = wrist.y * p.height;
               const fingerAngle = p.atan2(y - wy, x - wx);

               for (const part of parts) {
                   if (part.tag === ParticleType.FLOWER) {
                       const d = p.dist(x, y, part.pos.x, part.pos.y);
                       if (d < closestDist) {
                           closestDist = d;
                           closestFlower = part;
                       }
                   }
               }

               if (closestFlower) {
                   closestFlower.lastHoveredTime = p.millis();
                   closestFlower.interactionRotation = fingerAngle;
               }

            } else {
               // INTERACTION: MOVING HAND -> PAINT FLOWERS
               if (treePositions.length > 0 && prevIndexPos) {
                   const steps = Math.ceil(velocity / 10);
                   for (let s = 0; s <= steps; s++) {
                       const lx = p.lerp(prevIndexPos.x, x, s/steps);
                       const ly = p.lerp(prevIndexPos.y, y, s/steps);
                       
                       const searchRadius = 30;
                       for (let i = treePositions.length - 1; i >= 0; i--) {
                           const pt = treePositions[i];
                           const d = p.dist(lx, ly, pt.x, pt.y);
                           if (d < searchRadius) {
                               spawnFlower(pt.x, pt.y, handScreenSizeRatio);
                               treePositions.splice(i, 1);
                               break; 
                           }
                       }
                   }
               }
            }

            prevIndexPos = currentTipPos;
         } else {
            prevIndexPos = null;
            wandPos = null;
            fingerStillFrames = 0;
         }
      }
    };

    initVision().then(() => {
       if (containerRef.current) {
          myP5 = new p5(sketch, containerRef.current);
       }
    });

    return () => {
      if (myP5) myP5.remove();
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      
      {/* Real-time Camera Feed Box */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted
        className="absolute bottom-4 right-4 w-48 h-36 rounded-xl border-4 border-white shadow-2xl object-cover transform scale-x-[-1] z-50 bg-black/20"
      />
    </div>
  );
};