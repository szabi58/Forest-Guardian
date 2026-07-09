
import React, { Suspense, useState, useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { KeyboardControls, Sky, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, ToneMapping } from '@react-three/postprocessing';
import { Player } from './Player';
import { Environment } from './Environment';
import { Atmosphere } from './Atmosphere';
import { NPCSystem } from './NPCs';
import { TownSystem } from './Town';
import { ProjectileSystem } from './Projectiles';
import { CameraController } from './CameraController';
import { UI } from './UI';
import { AudioSystem } from './AudioSystem';
import { GamepadHandler } from './GamepadHandler';
import { useGameStore, cameraZoom, cameraControl, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX, IS_MOBILE } from '../store';
import * as THREE from 'three';

const keyboardMap = [
  { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
  { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
  { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
  { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'run', keys: ['Shift'] },
  { name: 'attack', keys: ['x', 'X'] }, 
  { name: 'magic', keys: ['e', 'E'] },
  { name: 'stance', keys: ['q', 'Q'] },
];

const WHEEL_ZOOM_SPEED = 0.01;   // world units per wheel deltaY unit (~1 unit per notch)
const PINCH_ZOOM_SPEED = 0.025;  // world units per pixel of pinch distance change

const LookController: React.FC = () => {
    const setCameraDelta = useGameStore(s => s.setCameraDelta);
    const setActiveDialoguePartner = useGameStore(s => s.setActiveDialoguePartner);
    const isPaused = useGameStore(s => s.isPaused);
    // All pointers currently down on the canvas: 1 = orbit drag, 2 = pinch zoom
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const lastPinchDist = useRef<number | null>(null);
    const lastPos = useRef({ x: 0, y: 0 });
    const { gl } = useThree();

    useEffect(() => {
        const pinchDistance = (): number | null => {
            if (pointers.current.size < 2) return null;
            const [a, b] = Array.from(pointers.current.values());
            return Math.hypot(b.x - a.x, b.y - a.y);
        };

        const handleDown = (e: PointerEvent) => {
            if (isPaused || (e.target as HTMLElement).closest('.pointer-events-auto')) return;

            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            lastPos.current = { x: e.clientX, y: e.clientY };
            cameraControl.dragging = true;
            // Second finger down: switch from orbiting to pinching
            lastPinchDist.current = pinchDistance();
        };

        const handleMove = (e: PointerEvent) => {
            if (isPaused || !pointers.current.has(e.pointerId)) return;
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (pointers.current.size >= 2) {
                // PINCH ZOOM: fingers together = zoom in, apart = zoom out
                const dist = pinchDistance();
                if (dist !== null && lastPinchDist.current !== null) {
                    cameraZoom.target = THREE.MathUtils.clamp(
                        cameraZoom.target + (dist - lastPinchDist.current) * PINCH_ZOOM_SPEED,
                        CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX
                    );
                }
                lastPinchDist.current = dist;
                return;
            }

            // Single pointer: orbit the camera
            const dx = e.clientX - lastPos.current.x;
            const dy = e.clientY - lastPos.current.y;
            lastPos.current = { x: e.clientX, y: e.clientY };
            setCameraDelta(new THREE.Vector2(dx / window.innerWidth, dy / window.innerHeight));
        };

        const handleUp = (e: PointerEvent) => {
            if (!pointers.current.has(e.pointerId)) return;
            pointers.current.delete(e.pointerId);
            lastPinchDist.current = null;
            if (pointers.current.size === 0) cameraControl.dragging = false;
            // If one finger remains after a pinch, restart the orbit drag from
            // its current position so the camera doesn't jump.
            if (pointers.current.size === 1) {
                const remaining = Array.from(pointers.current.values())[0];
                lastPos.current = { x: remaining.x, y: remaining.y };
            }
            // Short taps are used to interact with NPCs; don't auto-close dialogue here.
            // Dialogue will close when you walk away or another NPC starts talking.
            setCameraDelta(new THREE.Vector2(0, 0));
        };

        const handleWheel = (e: WheelEvent) => {
            if (isPaused) return;
            e.preventDefault();
            cameraZoom.target = THREE.MathUtils.clamp(
                cameraZoom.target + e.deltaY * WHEEL_ZOOM_SPEED,
                CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX
            );
        };

        // Belt-and-braces with the CSS touch-action:none — stop the browser
        // from turning two fingers on the canvas into page pinch-zoom/scroll,
        // so the pointer events above keep flowing to the in-game camera.
        const preventTouch = (e: TouchEvent) => {
            if (e.touches.length > 1 || !(e.target as HTMLElement).closest('.pointer-events-auto')) {
                e.preventDefault();
            }
        };
        // iOS Safari fires proprietary gesture events for pinch; cancel them too
        const preventGesture = (e: Event) => e.preventDefault();

        gl.domElement.addEventListener('pointerdown', handleDown);
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
        window.addEventListener('pointercancel', handleUp);
        gl.domElement.addEventListener('wheel', handleWheel, { passive: false });
        window.addEventListener('touchmove', preventTouch, { passive: false });
        document.addEventListener('gesturestart', preventGesture);
        document.addEventListener('gesturechange', preventGesture);
        return () => {
            gl.domElement.removeEventListener('pointerdown', handleDown);
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
            window.removeEventListener('pointercancel', handleUp);
            gl.domElement.removeEventListener('wheel', handleWheel);
            window.removeEventListener('touchmove', preventTouch);
            document.removeEventListener('gesturestart', preventGesture);
            document.removeEventListener('gesturechange', preventGesture);
        };
    }, [gl, setCameraDelta, setActiveDialoguePartner, isPaused]);

    return null;
};

export const Game: React.FC = () => {
  const [playerObj, setPlayerObj] = useState<THREE.Object3D | null>(null);
  const playerRef = useRef<THREE.Object3D>(null);
  const isPaused = useGameStore(s => s.isPaused);
  const gameTime = useGameStore(s => s.gameTime);
  
  const handlePlayerRef = (obj: THREE.Object3D) => {
      playerRef.current = obj;
      setPlayerObj(obj);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const state = useGameStore.getState();
      if (!state.isGameOver && !state.isPaused) {
        state.rechargeMana(20);
        state.healPlayer(10);
        useGameStore.setState({ gameTime: (state.gameTime + 0.005) % 1 });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const sunPos: [number, number, number] = [
    Math.cos(gameTime * Math.PI * 2) * 100,
    Math.sin(gameTime * Math.PI * 2) * 100,
    50
  ];

  return (
    <div className="w-full h-full relative overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
      <UI />
      <KeyboardControls map={keyboardMap}>
        <div className="w-full h-full">
            <Canvas
                shadows
                camera={{ position: [0, 5, 10], fov: 60 }}
                gl={{ antialias: !IS_MOBILE, stencil: true, alpha: false, powerPreference: 'high-performance' }}
                dpr={IS_MOBILE ? [0.75, 1.25] : [1, 2]}
            >
            <color attach="background" args={[gameTime > 0.7 ? '#020205' : '#1e3b1e']} />
            <fogExp2 attach="fog" args={[gameTime > 0.7 ? '#05050f' : '#142d14', 0.012]} />
            <Sky sunPosition={sunPos} turbidity={0.05} rayleigh={gameTime > 0.7 ? 0.05 : 0.5} />
            <Stars radius={100} depth={50} count={IS_MOBILE ? 1500 : 5000} factor={4} saturation={0} fade speed={1} />
            <Suspense fallback={null}>
                <Physics gravity={[0, -22, 0]} paused={isPaused}>
                    <Environment />
                    <TownSystem playerRef={playerRef} />
                    <Atmosphere />
                    <Player setPlayerRef={handlePlayerRef} />
                    <CameraController playerRef={playerRef} />
                    {playerObj && <NPCSystem playerRef={playerRef} />}
                    <ProjectileSystem />
                    <AudioSystem />
                </Physics>
                
                <LookController />
                <GamepadHandler />

                <EffectComposer multisampling={IS_MOBILE ? 0 : 8}>
                    <Bloom intensity={0.8} luminanceThreshold={0.8} luminanceSmoothing={0.9} />
                    <Vignette offset={0.3} darkness={0.6} />
                    <ToneMapping />
                </EffectComposer>
            </Suspense>
            </Canvas>
        </div>
      </KeyboardControls>
    </div>
  );
};
