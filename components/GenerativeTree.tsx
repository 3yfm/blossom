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
          numHands: 2
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
      }
    };

    const sketch = (p: p5) => {
      // Macaron Palette
      const PALETTE = {
        bg: '#FDFBF7',
        trunk: '#8E8D8A', // Warm Grey
        flowers: [
            '#FFB7B2', // Pink
            '#FFDAC1', // Peach
            '#E2F0CB', // Light Green
            '#B5EAD7', // Mint
            '#C7CEEA', // Lavender
            '#A2E1DB', // Teal-ish
            '#E0BBE4'  // Purple
        ]
      };

      let parts: Particle[] = [];
      let treePositions: {x: number, y: number}[] = []; // Stores potential bloom spots
      
      // Interaction State
      let prevHandPos: p5.Vector | null = null;

      class Particle {
        pos: p5.Vector;
        col: p5.Color;
        siz: number;
        asiz: number; // Actual size multiplier
        dir: number; // Direction in degrees
        spd: number;
        life: number;
        lifespan: number;
        tag: ParticleType;
        rotationOffset: number;

        constructor(sx: number, sy: number, sc: string | p5.Color, ss: number, sd: number, sl: number, ls: number, tag: ParticleType) {
          this.tag = tag;
          this.pos = p.createVector(sx, sy);
          
          if (typeof sc === 'string') {
            this.col = p.color(sc);
          } else {
            this.col = sc;
          }

          this.asiz = ss;
          this.dir = sd;
          this.life = sl;
          this.lifespan = ls;
          this.rotationOffset = p.random(p.TWO_PI);

          // Flowers start at size 0 and grow. Tree parts start at 1.
          this.siz = (this.tag === ParticleType.FLOWER) ? 0 : 1; 
          this.spd = (this.tag === ParticleType.FLOWER) ? 0 : ((this.tag === ParticleType.TRUNK) ? 2 : p.random(0.25, 2));
        }

        update() {
          this.life++;

          // --- FLOWER LOGIC ---
          // Flowers stay fixed, grow to full size, then "die" (stop updating) 
          // but remain on persistent canvas.
          if (this.tag === ParticleType.FLOWER) {
             this.siz += 0.1; // Growth speed
             if (this.siz >= 1) {
               this.siz = 1;
               return true; // Stop updating after fully grown to save CPU
             }
             return false;
          }

          // --- TREE LOGIC ---
          const radiansDir = p.radians(this.dir);
          this.pos.add(p.createVector(p.cos(radiansDir) * this.spd, p.sin(radiansDir) * this.spd));
          
          // Record position for potential future blooming
          if (p.frameCount % 4 === 0) {
            treePositions.push({ x: this.pos.x, y: this.pos.y });
          }

          // Wander logic
          const wander = (this.tag === ParticleType.TRUNK && this.siz > 0.9) 
            ? 1 
            : p.map(this.life, 0, this.lifespan, 1, 5);
            
          this.dir += p.random(-1, 1) * wander;

          if (p.random() < 0.005 && this.tag !== ParticleType.TRUNK) {
            this.dir += (p.random() < 0.5 ? 1 : -1) * 72 * 0.5; // Slight curl
          }
          
          this.siz = p.lerp(this.siz, 0, p.random(0.015));

          // Death/Spawn Logic
          const currentSize = this.asiz * this.siz;
          if (currentSize < 0.5 || this.spd > currentSize) {
             return true; 
          }

          // Spawning children
          // 1. Trunk -> Branch
          if (p.random() < 0.03 && this.tag === ParticleType.TRUNK && this.siz < 0.6) {
             parts.push(new Particle(
               this.pos.x, this.pos.y, 
               this.col, currentSize * 0.9, 
               this.dir + (p.random() < 0.5 ? 1 : -1) * p.random(20, 40), 
               this.life, this.lifespan, 
               ParticleType.BRANCH
             ));
          }
          
          // 2. Branch -> Branch
          if (p.random() < 0.01 && this.tag === ParticleType.BRANCH && this.siz > 0.5) {
             parts.push(new Particle(
               this.pos.x, this.pos.y, 
               this.col, currentSize, 
               this.dir + p.random(-10, 10), 
               this.life, this.lifespan, 
               ParticleType.BRANCH
             ));
          }

          return false;
        }

        display() {
          p.noStroke();
          
          if (this.tag === ParticleType.FLOWER) {
             p.push();
             p.translate(this.pos.x, this.pos.y);
             // No rotation animation for flowers to avoid smear on persistent canvas
             p.rotate(this.rotationOffset); 
             
             // Draw Petals
             p.fill(this.col);
             const petalSize = this.asiz * this.siz;
             for(let i = 0; i < 5; i++) {
                p.ellipse(0, petalSize * 0.35, petalSize * 0.6, petalSize);
                p.rotate(p.TWO_PI / 5);
             }

             // Removed center circle to make it purely floral petals
             p.pop();
          } else {
             // Draw Branch/Tree
             p.fill(this.col);
             if (p.frameCount % 2 === 0) {
                p.circle(this.pos.x, this.pos.y, this.asiz * this.siz);
             }
          }
        }
      }

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        p.background(PALETTE.bg);
        startTree();
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        p.background(PALETTE.bg);
        parts = [];
        treePositions = [];
        startTree();
      };

      function startTree() {
        const startX = p.width / 2;
        // Start closer to bottom, grow up
        parts.push(new Particle(startX - 20, p.height + 20, PALETTE.trunk, 50, 270, 0, 500, ParticleType.TRUNK));
        parts.push(new Particle(startX + 20, p.height + 20, PALETTE.trunk, 45, 270, 0, 500, ParticleType.TRUNK));
      }

      function spawnFlower(x: number, y: number) {
          const flowerColor = p.random(PALETTE.flowers);
          const size = p.random(15, 25);
          // Flowers are added to parts to animate growth, then they die but stay on canvas
          parts.push(new Particle(x, y, flowerColor, size, 0, 0, 0, ParticleType.FLOWER));
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

        // 2. Update Particles
        for (let i = parts.length - 1; i >= 0; i--) {
          const part = parts[i];
          const isDead = part.update();
          
          // Always display if alive. If dead, it might be a flower that just finished growing.
          // Since we don't clear background, drawing it one last time (at full size) is fine.
          if (!isDead) {
            part.display();
          } else {
            // Optional: Draw one last time to ensure full size is rendered
            if (part.tag === ParticleType.FLOWER) part.display();
            parts.splice(i, 1);
          }
        }
      };

      function handleHandInteraction(result: HandLandmarkerResult) {
         if (result.landmarks && result.landmarks.length > 0) {
            const landmarks = result.landmarks[0];
            const indexTip = landmarks[8];
            
            // Calculate screen coordinates (Mirrored)
            const x = (1 - indexTip.x) * p.width;
            const y = indexTip.y * p.height;
            const currentPos = p.createVector(x, y);

            // Velocity Detection
            let velocity = 0;
            if (prevHandPos) {
                velocity = p.dist(currentPos.x, currentPos.y, prevHandPos.x, prevHandPos.y);
            }

            // --- BLOOM LOGIC ---
            // Only bloom if near existing tree branches
            if (treePositions.length > 0) {
              let bloomsNeeded = 0;
              
              // Wave/Swipe (High Velocity) -> Bloom many
              if (velocity > 8) {
                 bloomsNeeded = 5; 
              } 
              // Hover/Pinch (Low Velocity) -> Bloom one occasionally
              else if (p.random() < 0.2) {
                 bloomsNeeded = 1;
              }

              if (bloomsNeeded > 0) {
                const searchRadius = velocity > 8 ? 80 : 40;
                
                // Iterate backwards to allow removal
                for (let i = treePositions.length - 1; i >= 0; i--) {
                  if (bloomsNeeded <= 0) break;

                  const pt = treePositions[i];
                  const d = p.dist(x, y, pt.x, pt.y);
                  
                  if (d < searchRadius) {
                    spawnFlower(pt.x, pt.y);
                    
                    // Remove this position so we don't stack flowers infinitely on the same spot
                    treePositions.splice(i, 1);
                    bloomsNeeded--;
                  }
                }
              }
            }

            prevHandPos = currentPos;
         } else {
            prevHandPos = null;
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