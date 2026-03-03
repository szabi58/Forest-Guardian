
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
import { useGameStore } from '../store';
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

const LookController: React.FC = () => {
    const setCameraDelta = useGameStore(s => s.setCameraDelta);
    const setActiveDialoguePartner = useGameStore(s => s.setActiveDialoguePartner);
    const isPaused = useGameStore(s => s.isPaused);
    const lastPos = useRef({ x: 0, y: 0 });
    const startPos = useRef({ x: 0, y: 0 });
    const startTime = useRef(0);
    const hasMovedSignificantly = useRef(false);
    const isPointerDown = useRef(false);
    const { gl } = useThree();
    
    useEffect(() => {
        const handleDown = (e: PointerEvent) => {
            if (isPaused || (e.target as HTMLElement).closest('.pointer-events-auto')) return;
            
            isPointerDown.current = true;
            const now = Date.now();
            startTime.current = now;
            startPos.current = { x: e.clientX, y: e.clientY };
            lastPos.current = { x: e.clientX, y: e.clientY };
            hasMovedSignificantly.current = false;
        };

        const handleMove = (e: PointerEvent) => {
            if (isPaused || !isPointerDown.current) return;
            
            const dx = e.clientX - lastPos.current.x;
            const dy = e.clientY - lastPos.current.y;
            
            const totalDist = Math.sqrt(Math.pow(e.clientX - startPos.current.x, 2) + Math.pow(e.clientY - startPos.current.y, 2));
            if (totalDist > 10) {
                hasMovedSignificantly.current = true;
            }

            lastPos.current = { x: e.clientX, y: e.clientY };
            const normalizedX = dx / window.innerWidth;
            const normalizedY = dy / window.innerHeight;
            setCameraDelta(new THREE.Vector2(normalizedX, normalizedY));
        };

        const handleUp = (e: PointerEvent) => {
            if (isPaused || !isPointerDown.current) {
                isPointerDown.current = false;
                return;
            }
            isPointerDown.current = false;
            const duration = Date.now() - startTime.current;
            if (!hasMovedSignificantly.current && duration < 250) {
                setActiveDialoguePartner(null);
            }
            setCameraDelta(new THREE.Vector2(0, 0));
        };

        gl.domElement.addEventListener('pointerdown', handleDown);
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
        return () => {
            gl.domElement.removeEventListener('pointerdown', handleDown);
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
        };
    }, [gl, setCameraDelta, setActiveDialoguePartner, isPaused]);

    return null;
};

export const Game: React.FC = () => {
  const [playerObj, setPlayerObj] = useState<THREE.Object3D | null>(null);
  const playerRef = useRef<THREE.Object3D>(null);
  const isHitStopping = useGameStore(s => s.isHitStopping);
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

  useEffect(() => {
    const state = useGameStore.getState();
    state.refreshSavePresence();
    state.loadGame();
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
                gl={{ antialias: true, stencil: true, alpha: false }}
                dpr={[1, 2]}
            >
            <color attach="background" args={[gameTime > 0.7 ? '#020205' : '#1e3b1e']} />
            <fogExp2 attach="fog" args={[gameTime > 0.7 ? '#05050f' : '#142d14', 0.012]} />
            <Sky sunPosition={sunPos} turbidity={0.05} rayleigh={gameTime > 0.7 ? 0.05 : 0.5} />
            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
            <Suspense fallback={null}>
                <Physics gravity={[0, -22, 0]} paused={isHitStopping || isPaused}>
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

                <EffectComposer disableNormalPass>
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
