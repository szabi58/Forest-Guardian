
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CuboidCollider, CylinderCollider, ConeCollider } from '@react-three/rapier';
import { Billboard, Text, Html } from '@react-three/drei';
import * as THREE from 'three';
import { GoogleGenAI } from "@google/genai";
import { useGameStore } from '../store';
import { BuildingData, TownNPCData, TownAnimalData, TownChildData } from '../types';
import { getTerrainHeight } from './Environment';

// --- NPC DIALOGUE FLAVOR ---

const MAYOR_LINES = [
    "This town looks peaceful, but sometimes I feel the peace is just painted on.",
    "I give speeches about hope, yet I can't shake the feeling we're all on rails.",
    "I sign decrees and draw borders, but I suspect the real borders are set in code.",
    "If I'm the mayor, why do I only exist when you look at me?",
    "Elections here are easy; no one ever runs against me, or maybe no one was programmed to.",
    "Some days I practice my smile in case the player zooms in.",
    "I move tokens on a map and call it policy, but the real power lives in some distant editor."
];

const MERCHANT_LINES = [
    "Acorns, gems, gold... yet I still feel like I'm trading in someone else's dream.",
    "My prices never change, my stock never runs out. Does that sound like a real economy to you?",
    "Every day I shout the same offer. Sometimes I wonder if the script forgot to give me a day off.",
    "I polish these wares, but I think the real treasure is whoever can edit this reality.",
    "I’ve never seen a delivery cart, yet my shelves refill when you’re not looking.",
    "No one haggles, no one steals. Either I'm the best merchant alive, or this world is heavily moderated.",
    "I keep a ledger of sales that only moves when you interact. The rest of the time it just waits, like me."
];

const BLACKSMITH_LINES = [
    "I hammer steel all day, but the clang sounds like a looping sound effect.",
    "The forge burns forever, yet the coal pile never shrinks. Feels... scripted.",
    "Weapons come out sharp, monsters fall down, then the world quietly resets.",
    "Sometimes I swing my own hammer just to see if the physics engine notices.",
    "The anvil never dents, the walls never stain. Either I'm a genius or reality is being cleaned each frame.",
    "I could craft a blade sharp enough to cut through code, if only I could reach the source.",
    "I dream of sparks that fly beyond the screen and land somewhere real."
];

const HISTORIAN_LINES = [
    "The scrolls speak of ages, yet the world never really changes, does it?",
    "I record history in a town that never ages and never truly sleeps.",
    "I tried to write about the time before you arrived, but the pages stayed blank.",
    "Every legend here feels like patch notes rewritten as myth.",
    "I catalog days that feel suspiciously like the last build.",
    "Our chronicles end whenever you close the game. That’s not how history is supposed to work.",
    "The margins of my books are full of questions about whoever keeps rewriting our fate."
];

const NURSE_LINES = [
    "Your pulse is strong again, but I wonder who wrote the code that keeps it beating.",
    "I fix broken bones with a sparkle and a sound effect. Real medicine is never that simple.",
    "You fall, you bleed, you stand up again. I suspect some invisible counter just resets.",
    "If healing is free and endless, maybe we're not meant to reach a real ending.",
    "I’ve never lost a patient, but only because failure isn’t in my design.",
    "Sometimes I wish I could heal myself of the feeling that none of this is real.",
    "I hear your heartbeat, but what I really see are health bars ticking back to full."
];

const EXISTENTIAL_LINES = [
    "Sometimes I swear I can feel a camera orbiting above us.",
    "Do you ever wonder if we're just numbers in someone's GPU memory?",
    "When you walk away, I freeze. When you return, I wake. That can't be normal life.",
    "If this is a story, I hope you’re the kind of hero who asks why the story exists.",
    "I tried walking past the trees at the edge once. The world simply... stopped.",
    "On quiet nights, I hear the menu music even when nobody is here.",
    "I have a feeling that if you uninstall this place, I will simply vanish mid‑sentence."
];

// --- BUILDING DECORATIONS ---

const FlowerBox: React.FC<{ position: [number, number, number]; rotation?: [number, number, number] }> = ({ position, rotation = [0, 0, 0] }) => {
    return (
        <group position={position} rotation={rotation}>
            <mesh castShadow>
                <boxGeometry args={[1.5, 0.4, 0.6]} />
                <meshStandardMaterial color="#5d4037" />
            </mesh>
            <mesh position={[0, 0.15, 0]}>
                <boxGeometry args={[1.3, 0.2, 0.5]} />
                <meshStandardMaterial color="#3e2723" />
            </mesh>
            {[-0.4, 0, 0.4].map((x, i) => (
                <mesh key={i} position={[x, 0.3, 0]}>
                    <sphereGeometry args={[0.2, 8, 8]} />
                    <meshStandardMaterial color={i % 2 === 0 ? "#ff4081" : "#ffd54f"} />
                </mesh>
            ))}
        </group>
    );
};

const BuildingSteps: React.FC = () => {
    // Calculated ramp for 3 steps: Rise ~1.0, Run ~2.0. Slope ~0.5. Angle ~26.5 deg.
    const rampAngle = Math.atan(0.5);

    return (
        <group position={[0, 0, 5.5]}>
            <mesh position={[0, 0.17, 1.2]} castShadow>
                <boxGeometry args={[3.2, 0.34, 1.0]} />
                <meshStandardMaterial color="#3e2723" />
            </mesh>
            <mesh position={[0, 0.5, 0.7]} castShadow>
                <boxGeometry args={[3.2, 0.34, 1.0]} />
                <meshStandardMaterial color="#3e2723" />
            </mesh>
            <mesh position={[0, 0.84, 0.2]} castShadow>
                <boxGeometry args={[3.2, 0.34, 1.0]} />
                <meshStandardMaterial color="#3e2723" />
            </mesh>

            <RigidBody type="fixed" colliders={false}>
                {/* Main Ramp covering the steps slope */}
                <group position={[0, 0.5, 0.7]} rotation={[rampAngle, 0, 0]}>
                    <CuboidCollider args={[1.6, 0.1, 1.4]} friction={0} restitution={0} />
                </group>
                {/* Top landing */}
                <CuboidCollider args={[1.6, 0.1, 0.5]} position={[0, 1.0, -0.5]} friction={0} restitution={0} />
            </RigidBody>
        </group>
    );
};

const BuildingDoor: React.FC<{ playerRef: React.RefObject<THREE.Object3D>; buildingRotation: number }> = ({ playerRef, buildingRotation }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isNear, setIsNear] = useState(false);
    const rb = useRef<RapierRigidBody>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial>(null);
    const worldPos = useMemo(() => new THREE.Vector3(), []);
    const playerWorldPos = useMemo(() => new THREE.Vector3(), []);
    const currentAngle = useRef(0);
    
    const interactionRequestTick = useGameStore(s => s.interactionRequestTick);

    const handleInteraction = (e?: any) => {
        if (e) e.stopPropagation(); 
        if (!playerRef.current || !rb.current) return;
        
        const pos = rb.current.translation();
        worldPos.set(pos.x, pos.y, pos.z);
        playerRef.current.getWorldPosition(playerWorldPos);
        const dist = playerWorldPos.distanceTo(worldPos);
        
        if (dist < 7.5) { 
            setIsOpen(!isOpen);
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2001/2001-preview.mp3');
            audio.volume = 0.3;
            audio.playbackRate = isOpen ? 0.8 : 1.2;
            audio.play().catch(() => {});
        }
    };

    // Controller interaction support
    useEffect(() => {
        if (isNear && interactionRequestTick > 0) {
            handleInteraction();
        }
    }, [interactionRequestTick]);

    useFrame((state, delta) => {
        if (!rb.current || !playerRef.current) return;
        
        const pos = rb.current.translation();
        worldPos.set(pos.x, pos.y, pos.z);
        playerRef.current.getWorldPosition(playerWorldPos);
        const dist = playerWorldPos.distanceTo(worldPos);
        
        const near = dist < 7.5;
        if (near !== isNear) setIsNear(near);
        
        if (materialRef.current) {
            const glow = near ? (Math.sin(state.clock.elapsedTime * 6) * 0.5 + 0.5) * 0.8 : 0;
            materialRef.current.emissiveIntensity = glow;
            materialRef.current.emissive.set(near ? "#ffffff" : "#000000");
        }
        
        // Physics Kinematic Rotation
        const target = isOpen ? -Math.PI / 1.5 : 0;
        currentAngle.current = THREE.MathUtils.lerp(currentAngle.current, target, delta * 8);
        
        // Combine building rotation (world Y) with door local rotation
        const finalRotation = buildingRotation + currentAngle.current;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), finalRotation);
        rb.current.setNextKinematicRotation(q);
    });

    return (
        <group position={[0, 0, 4.75]}> 
            {/* Kinematic Body at the Hinge Position */}
            <RigidBody 
                ref={rb} 
                type="kinematicPosition" 
                position={[-1.25, 0, 0]} 
                colliders={false}
            >
                {/* Visuals and Collider offset from Hinge */}
                <group position={[1.25, 0, 0]}>
                    <mesh name="interactive-door-mesh" position={[0, 1.8, 0.05]} onPointerDown={handleInteraction} castShadow>
                        <boxGeometry args={[2.5, 3.6, 0.1]} />
                        <meshStandardMaterial ref={materialRef} color="#3e2723" roughness={0.8} />
                        <mesh position={[0.9, 0, 0.1]}><sphereGeometry args={[0.1, 16, 16]} /><meshStandardMaterial color="#d4af37" metalness={0.9} roughness={0.1} /></mesh>
                    </mesh>
                    <CuboidCollider args={[1.25, 1.8, 0.05]} position={[0, 1.8, 0.05]} />
                </group>
            </RigidBody>
        </group>
    );
};

const BuildingWalls: React.FC<{ width: number, height: number, depth: number }> = ({ width, height, depth }) => {
    return (
        <group position={[0, height / 2, 0]}>
            <group position={[0, 0, -depth / 2]}>
                <mesh><boxGeometry args={[width, height, 0.5]} /><meshStandardMaterial color="#5d4037" roughness={0.9} /></mesh>
            </group>
            <mesh position={[-width / 2, 0, 0]}><boxGeometry args={[0.5, height, depth]} /><meshStandardMaterial color="#5d4037" roughness={0.9} /></mesh>
            <mesh position={[width / 2, 0, 0]}><boxGeometry args={[0.5, height, depth]} /><meshStandardMaterial color="#5d4037" roughness={0.9} /></mesh>
            
            <group position={[-4.0, 0, depth / 2]}>
                <mesh><boxGeometry args={[2.0, height, 0.5]} /><meshStandardMaterial color="#5d4037" roughness={0.9} /></mesh>
                <FlowerBox position={[-0.5, -0.5, 0.35]} />
            </group>
            <group position={[4.0, 0, depth / 2]}>
                <mesh><boxGeometry args={[2.0, height, 0.5]} /><meshStandardMaterial color="#5d4037" roughness={0.9} /></mesh>
                <FlowerBox position={[0.5, -0.5, 0.35]} />
            </group>
            <mesh position={[0, height / 2 - 0.2, depth / 2]}><boxGeometry args={[width, 0.4, 0.5]} /><meshStandardMaterial color="#5d4037" roughness={0.9} /></mesh>
        </group>
    );
};

const LibraryStructure: React.FC<{ width: number, height: number, depth: number }> = ({ width, height, depth }) => {
    const wallColor = "#8d8d8d";
    const halfW = width / 2;
    const halfD = depth / 2;
    return (
        <group position={[0, height / 2, 0]}>
            {/* Main hall: back, sides, floor and ceiling, but open front so the door is visible */}
            <mesh position={[0, 0, -halfD]} castShadow receiveShadow>
                <boxGeometry args={[width, height, 0.5]} />
                <meshStandardMaterial color={wallColor} roughness={0.6} /> 
            </mesh>
            <mesh position={[-halfW, 0, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.5, height, depth]} />
                <meshStandardMaterial color={wallColor} roughness={0.6} /> 
            </mesh>
            <mesh position={[halfW, 0, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.5, height, depth]} />
                <meshStandardMaterial color={wallColor} roughness={0.6} /> 
            </mesh>
            <mesh position={[0, -height / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[width, 0.5, depth]} />
                <meshStandardMaterial color={wallColor} roughness={0.6} /> 
            </mesh>
            <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[width, 0.5, depth]} />
                <meshStandardMaterial color={wallColor} roughness={0.6} /> 
            </mesh>

            {/* Front wall with central opening for the door: two side panels + header above */}
            <group position={[-4.0, 0, halfD]}>
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[2.0, height, 0.5]} />
                    <meshStandardMaterial color={wallColor} roughness={0.6} /> 
                </mesh>
            </group>
            <group position={[4.0, 0, halfD]}>
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[2.0, height, 0.5]} />
                    <meshStandardMaterial color={wallColor} roughness={0.6} /> 
                </mesh>
            </group>
            <mesh position={[0, height / 2 - 0.2, halfD + 0.05]} castShadow receiveShadow>
                <boxGeometry args={[width, 0.4, 0.5]} />
                <meshStandardMaterial color={wallColor} roughness={0.6} /> 
            </mesh>

            {/* Pillars in front of the entrance */}
            <group position={[0, 0, halfD + 1]}>
                {[-3, 3].map((x) => (
                    <mesh key={x} position={[x, -height/2 + 2, 0]} castShadow>
                        <cylinderGeometry args={[0.8, 0.8, 4, 16]} />
                        <meshStandardMaterial color="#b0b0b0" roughness={0.5} />
                    </mesh>
                ))}
                {/* Roof Pediment */}
                <mesh position={[0, height/2 - 2, 0]} rotation={[0, Math.PI/4, 0]} castShadow>
                     <coneGeometry args={[width/1.8, 3, 4]} />
                     <meshStandardMaterial color="#555" roughness={0.8} />
                </mesh>
            </group>

            {/* Side scrolls visuals */}
            <group position={[width/2 + 0.5, -height/4, 0]}>
                 <mesh rotation={[0, 0, Math.PI/2]}>
                     <cylinderGeometry args={[0.4, 0.4, 1.5, 8]} />
                     <meshStandardMaterial color="#f5f5dc" />
                 </mesh>
            </group>
        </group>
    );
};

const ClinicStructure: React.FC<{ width: number, height: number, depth: number }> = ({ width, height, depth }) => {
    const wallColor = "#e3f2fd";
    const halfW = width / 2;
    const halfD = depth / 2;
    return (
        <group position={[0, height / 2, 0]}>
            {/* Back, left, right walls and floor/ceiling - full box minus front */}
            <mesh position={[0, 0, -halfD]} castShadow receiveShadow>
                <boxGeometry args={[width, height, 0.5]} />
                <meshStandardMaterial color={wallColor} roughness={0.5} />
            </mesh>
            <mesh position={[-halfW, 0, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.5, height, depth]} />
                <meshStandardMaterial color={wallColor} roughness={0.5} />
            </mesh>
            <mesh position={[halfW, 0, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.5, height, depth]} />
                <meshStandardMaterial color={wallColor} roughness={0.5} />
            </mesh>
            <mesh position={[0, -height / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[width, 0.5, depth]} />
                <meshStandardMaterial color={wallColor} roughness={0.5} />
            </mesh>
            <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[width, 0.5, depth]} />
                <meshStandardMaterial color={wallColor} roughness={0.5} />
            </mesh>
            {/* Front wall with door opening: left panel, right panel, strip above door */}
            <group position={[-4.0, 0, halfD]}>
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[2.0, height, 0.5]} />
                    <meshStandardMaterial color={wallColor} roughness={0.5} />
                </mesh>
            </group>
            <group position={[4.0, 0, halfD]}>
                <mesh castShadow receiveShadow>
                    <boxGeometry args={[2.0, height, 0.5]} />
                    <meshStandardMaterial color={wallColor} roughness={0.5} />
                </mesh>
            </group>
            <mesh position={[0, height / 2 - 0.2, halfD + 0.05]} castShadow receiveShadow>
                <boxGeometry args={[width, 0.4, 0.5]} />
                <meshStandardMaterial color={wallColor} roughness={0.5} />
            </mesh>

            {/* Blue Cross Sign */}
            <group position={[0, height/2 - 1.5, depth/2 + 0.1]}>
                <mesh position={[0, 0, 0]}>
                    <boxGeometry args={[1.5, 0.4, 0.1]} />
                    <meshStandardMaterial color="#ef5350" emissive="#ef5350" emissiveIntensity={0.5} />
                </mesh>
                <mesh position={[0, 0, 0]}>
                    <boxGeometry args={[0.4, 1.5, 0.1]} />
                    <meshStandardMaterial color="#ef5350" emissive="#ef5350" emissiveIntensity={0.5} />
                </mesh>
            </group>

            {/* Blue Accent Stripe */}
            <mesh position={[0, height/4, depth/2 + 0.05]}>
                <boxGeometry args={[width + 0.2, 0.3, 0.1]} />
                <meshStandardMaterial color="#1e88e5" />
            </mesh>
        </group>
    );
};

const Building: React.FC<{ data: BuildingData, playerRef: React.RefObject<THREE.Object3D> }> = ({ data, playerRef }) => {
    const terrainY = getTerrainHeight(data.position[0], data.position[2]);
    const buildingWorldPos = useMemo((): [number, number, number] => [data.position[0], terrainY, data.position[2]], [data.position, terrainY]);
    
    const foundationWidth = 11;
    const foundationHeight = 1.0;
    const wallWidth = 10;
    const wallHeight = 6.0;

    const isLibrary = data.type === 'LIBRARY';
    const isClinic = data.type === 'CLINIC';

    return (
        <group position={[buildingWorldPos[0], buildingWorldPos[1], buildingWorldPos[2]]} rotation={[0, data.rotation, 0]}>
            <RigidBody type="fixed" colliders={false}>
                {/* Interior floor so player doesn't fall through when inside */}
                <CuboidCollider args={[4.5, 0.5, 4.5]} position={[0, 0.5, 0]} friction={0} />
                <CuboidCollider args={[1.25, 0.5, 5.5]} position={[-4.25, 0.5, 0]} friction={0} />
                <CuboidCollider args={[1.25, 0.5, 5.5]} position={[4.25, 0.5, 0]} friction={0} />
                <CuboidCollider args={[2.5, 0.5, 4.0]} position={[0, 0.5, -1.5]} friction={0} />
                <mesh position={[0, foundationHeight / 2, 0]} receiveShadow castShadow>
                    <boxGeometry args={[foundationWidth, foundationHeight, foundationWidth]} />
                    <meshStandardMaterial color={isLibrary ? "#4a4a4a" : isClinic ? "#bbdefb" : "#2d221b"} roughness={1} />
                </mesh>
            </RigidBody>
            
            <RigidBody type="fixed" colliders={false}>
                <group position={[0, foundationHeight, 0]}>
                    {isLibrary ? (
                        <LibraryStructure width={wallWidth} height={wallHeight} depth={wallWidth} />
                    ) : isClinic ? (
                        <ClinicStructure width={wallWidth} height={wallHeight} depth={wallWidth} />
                    ) : (
                        <BuildingWalls width={wallWidth} height={wallHeight} depth={wallWidth} />
                    )}
                    <CuboidCollider args={[wallWidth / 2, wallHeight / 2, 0.25]} position={[0, wallHeight / 2, -wallWidth / 2]} />
                    <CuboidCollider args={[0.25, wallHeight / 2, wallWidth / 2]} position={[-wallWidth / 2, wallHeight / 2, 0]} />
                    <CuboidCollider args={[0.25, wallHeight / 2, wallWidth / 2]} position={[wallWidth / 2, wallHeight / 2, 0]} />
                    <CuboidCollider args={[1.0, wallHeight / 2, 0.25]} position={[-4.0, wallHeight / 2, wallWidth / 2]} />
                    <CuboidCollider args={[1.0, wallHeight / 2, 0.25]} position={[4.0, wallHeight / 2, wallWidth / 2]} />
                    {/* Flat roof collider so the player can stand on top of buildings */}
                    <CuboidCollider args={[wallWidth / 2, 0.25, wallWidth / 2]} position={[0, wallHeight + 0.25, 0]} friction={0} />
                    {/* Triangular roof: single cone collider (no ridges) so player can walk and jump off without getting stuck */}
                    {!isLibrary && !isClinic && (
                        <ConeCollider
                            args={[2.5, wallWidth * 0.9]}
                            position={[0, wallHeight + 2 + 2.5, 0]}
                            rotation={[0, Math.PI / 4, 0]}
                            friction={0}
                        />
                    )}
                </group>
            </RigidBody>
            
            <RigidBody type="fixed" colliders={false} 
                onIntersectionEnter={() => useGameStore.getState().setIsInsideBuilding(data.id)} 
                onIntersectionExit={() => useGameStore.getState().setIsInsideBuilding(null)}
            >
                <CuboidCollider sensor args={[wallWidth / 2 - 1, wallHeight / 2, wallWidth / 2 - 1]} position={[0, foundationHeight + wallHeight / 2, 0]} />
            </RigidBody>
            
            <BuildingSteps />
            <group position={[0, foundationHeight, 0]}>
                <BuildingDoor playerRef={playerRef} buildingRotation={data.rotation} />
            </group>
            {!isLibrary && !isClinic && (
                <mesh position={[0, foundationHeight + wallHeight + 2.0, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                    <coneGeometry args={[wallWidth * 0.9, 5, 4]} />
                    <XRayMaterial buildingId={data.id} color="#3e2723" buildingPos={buildingWorldPos} />
                </mesh>
            )}
            <pointLight position={[0, foundationHeight + wallHeight - 1, 0]} intensity={25} color="#ffccaa" distance={15} />
        </group>
    );
};

const XRayMaterial: React.FC<{ color: string; buildingId: string; buildingPos: [number, number, number] }> = ({ color, buildingId, buildingPos }) => {
    const materialRef = useRef<THREE.MeshStandardMaterial>(null);
    const [opacity, setOpacity] = useState(1);
    const bPos = useMemo(() => new THREE.Vector3(...buildingPos), [buildingPos]);
    const playerWorldPos = useMemo(() => new THREE.Vector3(), []);
    
    useFrame((state) => {
        const player = state.scene.getObjectByName('player-model-root');
        if (!player || !materialRef.current) return;
        const isInsideThisBuilding = useGameStore.getState().isInsideBuildingId === buildingId;
        player.getWorldPosition(playerWorldPos);
        const distXZ = Math.sqrt((playerWorldPos.x - bPos.x) ** 2 + (playerWorldPos.z - bPos.z) ** 2);
        const targetOpacity = (isInsideThisBuilding || distXZ < 7.5) ? 0.15 : 1.0;
        const newOpacity = THREE.MathUtils.lerp(opacity, targetOpacity, 0.12);
        if (Math.abs(newOpacity - opacity) > 0.001) {
            setOpacity(newOpacity);
            materialRef.current.opacity = newOpacity;
            materialRef.current.transparent = newOpacity < 0.99;
            materialRef.current.depthWrite = newOpacity > 0.5;
        }
    });
    return <meshStandardMaterial ref={materialRef} color={color} roughness={0.8} />;
};

const TownProps: React.FC = () => {
    const barrelsRef = useRef<THREE.InstancedMesh>(null);
    const cratesRef = useRef<THREE.InstancedMesh>(null);
    const buildings = useGameStore(s => s.buildings);
    
    const propLocations = useMemo(() => {
        const locations: { type: 'BARREL' | 'CRATE'; pos: [number, number, number]; rot: number }[] = [];
        buildings.forEach(b => {
            for(let i=0; i<3; i++) {
                const angle = Math.PI + (Math.random() - 0.5) * 1.5; 
                const r = 8.5 + Math.random() * 2.0;
                const px = b.position[0] + Math.cos(angle) * r;
                const pz = b.position[2] + Math.sin(angle) * r;
                locations.push({ type: Math.random() > 0.5 ? 'BARREL' : 'CRATE', pos: [px, getTerrainHeight(px, pz), pz], rot: Math.random() * Math.PI });
            }
        });
        return locations;
    }, [buildings]);

    useEffect(() => {
        const dummy = new THREE.Object3D();
        let bIdx = 0, cIdx = 0;
        propLocations.forEach(loc => {
            dummy.position.set(...loc.pos);
            dummy.rotation.set(0, loc.rot, 0);
            dummy.updateMatrix();
            if (loc.type === 'BARREL' && barrelsRef.current) barrelsRef.current.setMatrixAt(bIdx++, dummy.matrix);
            if (loc.type === 'CRATE' && cratesRef.current) cratesRef.current.setMatrixAt(cIdx++, dummy.matrix);
        });
        if (barrelsRef.current) barrelsRef.current.instanceMatrix.needsUpdate = true;
        if (cratesRef.current) cratesRef.current.instanceMatrix.needsUpdate = true;
    }, [propLocations]);

    return (
        <group>
            <instancedMesh ref={barrelsRef} args={[undefined, undefined, 40]} castShadow frustumCulled={false} raycast={() => null}>
                <cylinderGeometry args={[0.6, 0.6, 1.2, 8]} />
                <meshStandardMaterial color="#795548" roughness={0.9} />
            </instancedMesh>
            <instancedMesh ref={cratesRef} args={[undefined, undefined, 40]} castShadow frustumCulled={false} raycast={() => null}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color="#8d6e63" roughness={0.9} />
            </instancedMesh>
        </group>
    );
};

// --- COBBLESTONE PATH SYSTEM (SEGMENT BASED) ---

const PathNetwork: React.FC = () => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const stoneCount = 1200; // Increased stone count for more paths
    
    // Define segments: [startX, startZ, endX, endZ]
    const pathSegments = useMemo(() => [
        // Main Road
        [-25, 5, 100, 5],
        // Spurs to North Buildings
        [-5, 5, -5, 17],   // b1
        [25, 5, 25, 20],   // b8
        [55, 5, 55, 20],   // b4
        [85, 5, 85, 17],   // b2
        // Spurs to South Buildings
        [5, 5, 5, -7],     // b3
        [35, 5, 35, -7],   // b6
        [65, 5, 65, -10],  // b7
        [90, 5, 90, -7]    // b5
    ], []);

    useEffect(() => {
        if (!meshRef.current) return;
        const dummy = new THREE.Object3D();
        let instanceIdx = 0;

        // Helper to place stones along a line
        const populateSegment = (x1: number, z1: number, x2: number, z2: number, density: number = 3.5) => {
            const dx = x2 - x1;
            const dz = z2 - z1;
            const len = Math.sqrt(dx * dx + dz * dz);
            const count = Math.floor(len * density);
            
            for (let i = 0; i < count; i++) {
                if (instanceIdx >= stoneCount) break;
                
                const t = i / count;
                const baseX = x1 + dx * t;
                const baseZ = z1 + dz * t;
                
                // Jitter
                const scatter = 1.8; // Path width scatter
                const jX = (Math.random() - 0.5) * scatter;
                const jZ = (Math.random() - 0.5) * scatter;
                
                const finalX = baseX + jX;
                const finalZ = baseZ + jZ;
                const y = getTerrainHeight(finalX, finalZ);

                dummy.position.set(finalX, y + 0.08, finalZ);
                dummy.rotation.set(0, Math.random() * Math.PI, 0);
                dummy.scale.set(0.6 + Math.random() * 0.4, 0.1, 0.6 + Math.random() * 0.4);
                dummy.updateMatrix();
                meshRef.current?.setMatrixAt(instanceIdx++, dummy.matrix);
            }
        };

        pathSegments.forEach(seg => {
            populateSegment(seg[0], seg[1], seg[2], seg[3]);
        });

        // Hide unused instances
        for (let i = instanceIdx; i < stoneCount; i++) {
            dummy.scale.set(0, 0, 0);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        }

        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [pathSegments, stoneCount]);

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, stoneCount]} receiveShadow frustumCulled={false}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#555" roughness={0.9} />
        </instancedMesh>
    );
};

// --- STONE WALL FENCE WITH TORCHES (connected stone, 1/4 torches, 2x height) ---

const WALL_HEIGHT = 2.2;
const WALL_THICKNESS = 0.675;
/** Barrier height so enemies cannot jump or be pushed over the fence; gates remain the only entrance. */
const FENCE_BARRIER_HEIGHT = 4;
const TORCH_SPACING = 48;
const POST_HEIGHT_ABOVE_WALL = 0.85;

const FenceTorch: React.FC<{ position: [number, number, number]; rotationY: number }> = ({ position, rotationY }) => {
    const postTotalHeight = WALL_HEIGHT + POST_HEIGHT_ABOVE_WALL;
    const postCenterY = (POST_HEIGHT_ABOVE_WALL - WALL_HEIGHT) / 2;
    const torchPoleY = POST_HEIGHT_ABOVE_WALL + 0.55;
    const flameBaseY = POST_HEIGHT_ABOVE_WALL + 1.25;
    const flameGroupRef = useRef<THREE.Group>(null);
    const flameOuterRef = useRef<THREE.Mesh>(null);
    const flameInnerRef = useRef<THREE.Mesh>(null);
    const seed = useRef(Math.random() * 1000).current;

    useFrame((state) => {
        const t = state.clock.elapsedTime + seed;
        if (flameGroupRef.current) {
            const flicker = 1 + Math.sin(t * 18) * 0.06 + Math.sin(t * 31) * 0.04;
            const sway = Math.sin(t * 8) * 0.03;
            flameGroupRef.current.scale.set(flicker, flicker * (1 + Math.sin(t * 12) * 0.05), flicker);
            flameGroupRef.current.position.x = sway;
            flameGroupRef.current.position.z = Math.cos(t * 7) * 0.02;
            flameGroupRef.current.rotation.z = Math.sin(t * 6) * 0.04;
        }
        if (flameOuterRef.current?.material && flameOuterRef.current.material instanceof THREE.MeshStandardMaterial) {
            flameOuterRef.current.material.emissiveIntensity = 2 + Math.sin(t * 14) * 0.5;
        }
        if (flameInnerRef.current?.material && flameInnerRef.current.material instanceof THREE.MeshBasicMaterial) {
            flameInnerRef.current.opacity = 0.75 + Math.sin(t * 10) * 0.15;
        }
    });

    return (
        <group position={position} rotation={[0, rotationY, 0]}>
            {/* Thick wood post: through wall, into ground, consistent amount above wall top (20% thicker) */}
            <mesh castShadow receiveShadow position={[0, postCenterY, 0]}>
                <cylinderGeometry args={[0.456, 0.504, postTotalHeight, 8]} />
                <meshStandardMaterial color="#6b4423" roughness={0.85} />
            </mesh>
            {/* Torch pole */}
            <mesh castShadow position={[0, torchPoleY, 0]}>
                <cylinderGeometry args={[0.08, 0.1, 1.1, 8]} />
                <meshStandardMaterial color="#5c4033" roughness={0.8} />
            </mesh>
            {/* Animated fire: outer and inner layer */}
            <group ref={flameGroupRef} position={[0, flameBaseY, 0]}>
                <mesh ref={flameOuterRef} castShadow>
                    <coneGeometry args={[0.22, 0.4, 12]} />
                    <meshStandardMaterial color="#ff6600" emissive="#ff4400" emissiveIntensity={2} transparent opacity={0.92} />
                </mesh>
                <mesh ref={flameInnerRef}>
                    <coneGeometry args={[0.1, 0.28, 8]} />
                    <meshBasicMaterial color="#ffcc00" transparent opacity={0.8} depthWrite={false} />
                </mesh>
            </group>
        </group>
    );
};

const MIN_SEGMENT_LENGTH = 4;

const Fence: React.FC<{ controlPoints: [number, number][] }> = ({ controlPoints }) => {
    const { segments, torchPositions } = useMemo(() => {
        const points = controlPoints.map(p => new THREE.Vector3(p[0], 0, p[1]));
        const curve = new THREE.CatmullRomCurve3(points, false);
        const totalLength = curve.getLength();
        const divisions = Math.max(2, Math.min(48, Math.ceil(totalLength / MIN_SEGMENT_LENGTH)));
        const sampledPoints = curve.getPoints(divisions);
        const finalSegments: { p1: THREE.Vector3; p2: THREE.Vector3; center: THREE.Vector3; rotation: THREE.Euler; length: number }[] = [];

        for (let i = 0; i < sampledPoints.length - 1; i++) {
            const p1 = sampledPoints[i].clone();
            const p2 = sampledPoints[i + 1].clone();
            p1.y = getTerrainHeight(p1.x, p1.z);
            p2.y = getTerrainHeight(p2.x, p2.z);
            const dir = new THREE.Vector3().subVectors(p2, p1);
            const length = dir.length();
            const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
            const dummy = new THREE.Object3D();
            dummy.position.copy(p1);
            dummy.lookAt(p2);
            finalSegments.push({ p1, p2, center, length, rotation: dummy.rotation.clone() });
        }

        const torchList: { pos: [number, number, number]; rotY: number }[] = [];
        finalSegments.forEach((seg) => {
            for (let t = 0; t < seg.length; t += TORCH_SPACING) {
                const f = Math.min(1, t / seg.length);
                const x = seg.p1.x + (seg.p2.x - seg.p1.x) * f;
                const z = seg.p1.z + (seg.p2.z - seg.p1.z) * f;
                const y = (seg.p1.y + seg.p2.y) * 0.5 + WALL_HEIGHT;
                torchList.push({ pos: [x, y, z], rotY: Math.atan2(seg.p2.x - seg.p1.x, seg.p2.z - seg.p1.z) });
            }
        });

        return { segments: finalSegments, torchPositions: torchList };
    }, [controlPoints]);

    return (
        <group>
            {segments.map((seg, i) => {
                const baseY = (seg.p1.y + seg.p2.y) * 0.5;
                return (
                    <group key={i} position={[seg.center.x, baseY + WALL_HEIGHT / 2, seg.center.z]} rotation={[seg.rotation.x, seg.rotation.y, seg.rotation.z]}>
                        <mesh castShadow receiveShadow>
                            <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, seg.length]} />
                            <meshStandardMaterial color="#6e6e6e" roughness={0.95} />
                        </mesh>
                    </group>
                );
            })}

            {torchPositions.map((t, i) => (
                <FenceTorch key={i} position={t.pos} rotationY={t.rotY} />
            ))}

            <RigidBody type="fixed" colliders={false}>
                {segments.map((seg, i) => {
                    const baseY = seg.center.y;
                    const barrierHalfH = FENCE_BARRIER_HEIGHT / 2;
                    return (
                        <group key={i} position={[seg.center.x, baseY + barrierHalfH, seg.center.z]} rotation={[seg.rotation.x, seg.rotation.y, seg.rotation.z]}>
                            <CuboidCollider args={[WALL_THICKNESS / 2, barrierHalfH, seg.length / 2]} />
                        </group>
                    );
                })}
            </RigidBody>
        </group>
    );
};

const GatePost: React.FC<{ position: [number, number] }> = ({ position }) => {
    const y = getTerrainHeight(position[0], position[1]);
    return (
        <group position={[position[0], y, position[1]]}>
            <RigidBody type="fixed" colliders={false}>
                <CuboidCollider args={[0.8, 2.5, 0.8]} position={[0, 2.5, 0]} />
                <mesh castShadow receiveShadow position={[0, 2.5, 0]}>
                    <boxGeometry args={[1.2, 5, 1.2]} />
                    <meshStandardMaterial color="#444" roughness={0.8} />
                </mesh>
                <mesh castShadow position={[0, 5.1, 0]}>
                    <boxGeometry args={[1.4, 0.2, 1.4]} />
                    <meshStandardMaterial color="#d4af37" metalness={0.8} roughness={0.2} />
                </mesh>
            </RigidBody>
            <group position={[0, 3.8, 0.8]}>
                <mesh castShadow>
                    <boxGeometry args={[0.2, 0.6, 0.2]} />
                    <meshStandardMaterial color="#222" />
                </mesh>
                <pointLight intensity={35} color="#ffd54f" distance={10} />
                <mesh position={[0, -0.4, 0]}>
                    <sphereGeometry args={[0.3, 8, 8]} />
                    <meshStandardMaterial color="#ffd54f" emissive="#ffd54f" emissiveIntensity={5} transparent opacity={0.8} />
                </mesh>
            </group>
        </group>
    );
};

// Stone entrance arch at path exits (facing: 0 = +Z, Math.PI = -Z)
const EntranceArch: React.FC<{ position: [number, number]; rotation: number }> = ({ position, rotation }) => {
    const y = getTerrainHeight(position[0], position[1]);
    const gateWidth = 5;
    const pillarW = 1.2;
    const pillarH = 4.5;
    const archHeight = 5.2;
    return (
        <group position={[position[0], y, position[1]]} rotation={[0, rotation, 0]}>
            <RigidBody type="fixed" colliders={false}>
                <CuboidCollider args={[pillarW / 2 + 0.5, pillarH / 2, gateWidth / 2 + 0.5]} position={[-gateWidth / 2 - pillarW / 2, pillarH / 2, 0]} />
                <CuboidCollider args={[pillarW / 2 + 0.5, pillarH / 2, gateWidth / 2 + 0.5]} position={[gateWidth / 2 + pillarW / 2, pillarH / 2, 0]} />
                <CuboidCollider args={[gateWidth / 2 + pillarW, 0.4, 1.5]} position={[0, archHeight, 0]} />
            </RigidBody>
            {/* Left pillar - stone */}
            <mesh castShadow receiveShadow position={[-gateWidth / 2 - pillarW / 2, pillarH / 2, 0]}>
                <boxGeometry args={[pillarW, pillarH, pillarW * 1.2]} />
                <meshStandardMaterial color="#5a4a42" roughness={0.85} />
            </mesh>
            <mesh castShadow position={[-gateWidth / 2 - pillarW / 2, pillarH + 0.15, 0]}>
                <boxGeometry args={[pillarW * 1.15, 0.2, pillarW * 1.35]} />
                <meshStandardMaterial color="#3e2723" roughness={0.9} />
            </mesh>
            {/* Right pillar */}
            <mesh castShadow receiveShadow position={[gateWidth / 2 + pillarW / 2, pillarH / 2, 0]}>
                <boxGeometry args={[pillarW, pillarH, pillarW * 1.2]} />
                <meshStandardMaterial color="#5a4a42" roughness={0.85} />
            </mesh>
            <mesh castShadow position={[gateWidth / 2 + pillarW / 2, pillarH + 0.15, 0]}>
                <boxGeometry args={[pillarW * 1.15, 0.2, pillarW * 1.35]} />
                <meshStandardMaterial color="#3e2723" roughness={0.9} />
            </mesh>
            {/* Arched top - curved arch made of segments */}
            <group position={[0, archHeight, 0]}>
                {/* Center keystone / arch cap */}
                <mesh castShadow position={[0, 0.35, 0]}>
                    <boxGeometry args={[gateWidth + pillarW * 1.5, 0.6, 1.8]} />
                    <meshStandardMaterial color="#4a3f38" roughness={0.85} />
                </mesh>
                {/* Curved arch (simplified as angled blocks) */}
                <mesh castShadow position={[-gateWidth / 2 - 0.3, 0.15, 0]} rotation={[0, 0, 0.25]}>
                    <boxGeometry args={[1.4, 0.5, 1.6]} />
                    <meshStandardMaterial color="#5a4a42" roughness={0.85} />
                </mesh>
                <mesh castShadow position={[gateWidth / 2 + 0.3, 0.15, 0]} rotation={[0, 0, -0.25]}>
                    <boxGeometry args={[1.4, 0.5, 1.6]} />
                    <meshStandardMaterial color="#5a4a42" roughness={0.85} />
                </mesh>
            </group>
            {/* Decorative cap on top of arch */}
            <mesh castShadow position={[0, archHeight + 0.7, 0]}>
                <boxGeometry args={[gateWidth + pillarW * 2, 0.35, 2.2]} />
                <meshStandardMaterial color="#3e2723" roughness={0.9} />
            </mesh>
        </group>
    );
};

// Guard Pikachu at gate: moves toward enemies in range, attacks in melee with spear
const GUARD_ATTACK_RADIUS = 16;
const GUARD_MELEE_RANGE = 5;
const GUARD_MAX_DISTANCE_FROM_POST = 18;
const GUARD_SPEED = 6;
const GUARD_DAMAGE = 24;
const GUARD_DAMAGE_COOLDOWN = 0.7;
const GUARD_PUSH_COOLDOWN = 0.35;
const pushAwayXWest = -14;
const pushAwayXEast = 14;

const GateGuard: React.FC<{ position: [number, number]; gateSide: 'west' | 'east' }> = ({ position, gateSide }) => {
    const homeX = position[0];
    const homeZ = position[1];
    const pushAwayX = gateSide === 'west' ? pushAwayXWest : pushAwayXEast;
    const groupRef = useRef<THREE.Group>(null);
    const posX = useRef(homeX);
    const posZ = useRef(homeZ);
    const isWalkingRef = useRef(false);
    const [isWalking, setIsWalking] = useState(false);
    const [spearSwingStartTime, setSpearSwingStartTime] = useState<number | null>(null);
    const enemies = useGameStore(s => s.enemies);
    const damageEnemy = useGameStore(s => s.damageEnemy);
    const setEnemyPushImpulse = useGameStore(s => s.setEnemyPushImpulse);
    const lastHit = useRef<Record<string, number>>({});
    const lastPush = useRef<Record<string, number>>({});

    useFrame((state, delta) => {
        const now = state.clock.elapsedTime;
        const gx = posX.current;
        const gz = posZ.current;

        const liveInRange: { e: typeof enemies[0]; dist: number; dx: number; dz: number }[] = [];
        enemies.forEach((e) => {
            if (e.isDead) return;
            const [ex, , ez] = e.position;
            const dx = ex - gx;
            const dz = ez - gz;
            const distSq = dx * dx + dz * dz;
            if (distSq <= GUARD_ATTACK_RADIUS * GUARD_ATTACK_RADIUS) {
                liveInRange.push({ e, dist: Math.sqrt(distSq), dx, dz });
            }
        });

        const nearest = liveInRange.length > 0
            ? liveInRange.reduce((a, b) => a.dist < b.dist ? a : b)
            : null;

        if (nearest) {
            const inMelee = nearest.dist < GUARD_MELEE_RANGE;
            if (inMelee) {
                if (now - (lastHit.current[nearest.e.id] ?? 0) >= GUARD_DAMAGE_COOLDOWN) {
                    lastHit.current[nearest.e.id] = now;
                    damageEnemy(nearest.e.id, GUARD_DAMAGE, 'GENERIC');
                    setSpearSwingStartTime(now);
                }
                if (now - (lastPush.current[nearest.e.id] ?? 0) >= GUARD_PUSH_COOLDOWN) {
                    lastPush.current[nearest.e.id] = now;
                    setEnemyPushImpulse(nearest.e.id, pushAwayX, 0);
                }
                if (isWalkingRef.current) {
                    isWalkingRef.current = false;
                    setIsWalking(false);
                }
            } else {
                const distFromHome = Math.sqrt((gx - homeX) ** 2 + (gz - homeZ) ** 2);
                if (distFromHome < GUARD_MAX_DISTANCE_FROM_POST) {
                    const dirX = nearest.dx / nearest.dist;
                    const dirZ = nearest.dz / nearest.dist;
                    posX.current += dirX * GUARD_SPEED * delta;
                    posZ.current += dirZ * GUARD_SPEED * delta;
                    if (!isWalkingRef.current) {
                        isWalkingRef.current = true;
                        setIsWalking(true);
                    }
                }
            }
        } else {
            const dxHome = homeX - gx;
            const dzHome = homeZ - gz;
            const distHome = Math.sqrt(dxHome * dxHome + dzHome * dzHome);
            if (distHome > 0.3) {
                const dirX = dxHome / distHome;
                const dirZ = dzHome / distHome;
                const step = Math.min(GUARD_SPEED * delta, distHome);
                posX.current += dirX * step;
                posZ.current += dirZ * step;
                if (!isWalkingRef.current) {
                    isWalkingRef.current = true;
                    setIsWalking(true);
                }
            } else {
                posX.current = homeX;
                posZ.current = homeZ;
                if (isWalkingRef.current) {
                    isWalkingRef.current = false;
                    setIsWalking(false);
                }
            }
        }

        if (groupRef.current) {
            const y = getTerrainHeight(posX.current, posZ.current);
            groupRef.current.position.set(posX.current, y, posZ.current);
            if (nearest && nearest.dist < GUARD_MELEE_RANGE) {
                groupRef.current.rotation.y = Math.atan2(-nearest.dx, -nearest.dz);
            } else if (nearest) {
                groupRef.current.rotation.y = Math.atan2(nearest.dx, nearest.dz);
            } else {
                const dxHome = homeX - posX.current;
                const dzHome = homeZ - posZ.current;
                if (dxHome * dxHome + dzHome * dzHome > 0.01) {
                    groupRef.current.rotation.y = Math.atan2(dxHome, dzHome);
                }
            }
        }
    });

    return (
        <group ref={groupRef} position={[homeX, getTerrainHeight(homeX, homeZ), homeZ]} rotation={[0, gateSide === 'west' ? Math.PI / 2 : -Math.PI / 2, 0]}>
            <PikachuModel color="#F5D000" flash={false} talking={false} isWalking={isWalking} outfit="GLADIATOR" spearSwingStartTime={spearSwingStartTime ?? undefined} />
        </group>
    );
};

// Young children Pikachus running around town playing (chase, run to random spots, bounce)
const TOWN_CHILD_BOUNDS = { xMin: 2, xMax: 92, zMin: -17, zMax: 22 };
const CHILD_RUN_SPEED = 4.2;
const CHILD_CHASE_RANGE = 14;
const CHILD_ARRIVAL_DIST = 1.2;

type ChildState = 'RUN' | 'BOUNCE';

const TownChild: React.FC<{ data: TownChildData }> = ({ data: initialData }) => {
    const childData = useGameStore(s => s.townChildren.find(c => c.id === initialData.id) || initialData);
    const townChildren = useGameStore(s => s.townChildren);
    const updateTownChildPosition = useGameStore(s => s.updateTownChildPosition);

    const rb = useRef<RapierRigidBody>(null);
    const groupRef = useRef<THREE.Group>(null);
    const targetX = useRef(childData.position[0]);
    const targetZ = useRef(childData.position[2]);
    const stateRef = useRef<ChildState>('RUN');
    const stateTimer = useRef(0.5 + Math.random() * 1.5);
    const bouncePhase = useRef(Math.random() * Math.PI * 2);
    const [isRunning, setIsRunning] = useState(true);

    const pickNewTarget = () => {
        if (!rb.current) return;
        const pos = rb.current.translation();
        const posX = pos.x;
        const posZ = pos.z;
        const others = townChildren.filter(c => c.id !== childData.id);
        const inRange = others.filter(c => {
            const dx = c.position[0] - posX;
            const dz = c.position[2] - posZ;
            return dx * dx + dz * dz <= CHILD_CHASE_RANGE * CHILD_CHASE_RANGE;
        });
        if (inRange.length > 0 && Math.random() < 0.4) {
            const chase = inRange[Math.floor(Math.random() * inRange.length)];
            targetX.current = chase.position[0];
            targetZ.current = chase.position[2];
        } else {
            targetX.current = TOWN_CHILD_BOUNDS.xMin + Math.random() * (TOWN_CHILD_BOUNDS.xMax - TOWN_CHILD_BOUNDS.xMin);
            targetZ.current = TOWN_CHILD_BOUNDS.zMin + Math.random() * (TOWN_CHILD_BOUNDS.zMax - TOWN_CHILD_BOUNDS.zMin);
        }
    };

    useFrame((state, delta) => {
        if (!rb.current) return;
        const t = state.clock.elapsedTime;
        const pos = rb.current.translation();
        const posX = pos.x;
        const posZ = pos.z;
        stateTimer.current -= delta;

        if (stateRef.current === 'BOUNCE') {
            rb.current.setLinvel({ x: 0, y: rb.current.linvel().y, z: 0 }, true);
            if (stateTimer.current <= 0) {
                stateRef.current = 'RUN';
                stateTimer.current = 2 + Math.random() * 4;
                pickNewTarget();
                setIsRunning(true);
            }
            if (groupRef.current) {
                const bounce = Math.sin(t * 14 + bouncePhase.current) * 0.08;
                groupRef.current.position.y = bounce;
            }
            const clampX = THREE.MathUtils.clamp(posX, TOWN_CHILD_BOUNDS.xMin, TOWN_CHILD_BOUNDS.xMax);
            const clampZ = THREE.MathUtils.clamp(posZ, TOWN_CHILD_BOUNDS.zMin, TOWN_CHILD_BOUNDS.zMax);
            updateTownChildPosition(childData.id, [clampX, pos.y, clampZ]);
            return;
        }

        const dx = targetX.current - posX;
        const dz = targetZ.current - posZ;
        const distSq = dx * dx + dz * dz;
        const dist = Math.sqrt(distSq);

        if (dist < CHILD_ARRIVAL_DIST || stateTimer.current <= 0) {
            stateRef.current = 'BOUNCE';
            stateTimer.current = 0.6 + Math.random() * 1.0;
            bouncePhase.current = Math.random() * Math.PI * 2;
            setIsRunning(false);
            rb.current.setLinvel({ x: 0, y: rb.current.linvel().y, z: 0 }, true);
        } else {
            const dirX = dx / dist;
            const dirZ = dz / dist;
            rb.current.setLinvel({ x: dirX * CHILD_RUN_SPEED, y: rb.current.linvel().y, z: dirZ * CHILD_RUN_SPEED }, true);
            if (groupRef.current) {
                groupRef.current.rotation.y = Math.atan2(dirX, dirZ);
            }
        }

        const clampedX = THREE.MathUtils.clamp(pos.x, TOWN_CHILD_BOUNDS.xMin, TOWN_CHILD_BOUNDS.xMax);
        const clampedZ = THREE.MathUtils.clamp(pos.z, TOWN_CHILD_BOUNDS.zMin, TOWN_CHILD_BOUNDS.zMax);
        if (clampedX !== pos.x || clampedZ !== pos.z) {
            rb.current.setTranslation({ x: clampedX, y: pos.y, z: clampedZ }, true);
        }
        updateTownChildPosition(childData.id, [clampedX, pos.y, clampedZ]);
    });

    return (
        <RigidBody
            ref={rb}
            position={childData.position}
            type="dynamic"
            colliders={false}
            userData={{ type: 'TOWN_CHILD', id: childData.id }}
            enabledRotations={[false, true, false]}
            friction={0.5}
            linearDamping={2}
            lockTranslations={false}
        >
            <CuboidCollider args={[0.25, 0.4, 0.25]} position={[0, 0.5, 0]} />
            <group ref={groupRef} position={[0, 0, 0]}>
                <group scale={0.6}>
                    <PikachuModel
                        color="#FFE066"
                        flash={false}
                        talking={false}
                        isWalking={isRunning}
                        outfit="NONE"
                    />
                </group>
            </group>
        </RigidBody>
    );
};

const Fountain: React.FC<{ position: [number, number, number] }> = ({ position }) => {
    const particleCount = 200;
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    
    // Initialize particle data
    const particles = useMemo(() => {
        return Array.from({ length: particleCount }).map(() => ({
            pos: new THREE.Vector3(0, 0, 0),
            vel: new THREE.Vector3(0, 0, 0),
            life: Math.random() // Start with random life offsets
        }));
    }, [particleCount]);

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        
        particles.forEach((p, i) => {
            // Respawn logic
            if (p.life <= 0) {
                p.life = 1.0;
                // Emitter at top
                p.pos.set(0, 3.5, 0); 
                // Initial burst velocity (up and slightly out)
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * 0.2;
                p.vel.set(
                    Math.cos(angle) * radius, 
                    4.0 + Math.random() * 2.0, 
                    Math.sin(angle) * radius
                );
            }

            // Physics update
            p.life -= delta * 0.5; // Life decay
            p.vel.y -= 9.8 * delta; // Gravity
            p.vel.x *= 0.99; // Air resistance
            p.vel.z *= 0.99;
            p.pos.add(p.vel.clone().multiplyScalar(delta));

            // Visual update
            dummy.position.copy(p.pos);
            // Scale based on life (fade in/out)
            const s = Math.max(0, 0.15 * Math.sin(p.life * Math.PI));
            dummy.scale.set(s, s, s);
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    const terrainY = getTerrainHeight(position[0], position[2]);

    return (
        <group position={[position[0], terrainY, position[2]]}>
            <RigidBody type="fixed" colliders={false}>
                {/* Base */}
                <CylinderCollider args={[0.5, 4.0]} position={[0, 0.5, 0]} />
                <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
                    <cylinderGeometry args={[4.0, 4.2, 1, 16]} />
                    <meshStandardMaterial color="#f5f5f5" roughness={0.1} metalness={0.05} />
                </mesh>
                {/* Water Pool */}
                <mesh position={[0, 0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[3.6, 32]} />
                    <meshStandardMaterial color="#0288d1" roughness={0.1} metalness={0.2} transparent opacity={0.8} />
                </mesh>
                
                {/* Middle Pillar Base */}
                <CylinderCollider args={[0.6, 1.2]} position={[0, 1.6, 0]} />
                <mesh position={[0, 1.6, 0]} castShadow>
                    <cylinderGeometry args={[1.2, 1.5, 2.2, 12]} />
                    <meshStandardMaterial color="#e0e0e0" roughness={0.2} />
                </mesh>

                {/* Upper Basin */}
                <CylinderCollider args={[0.25, 2.0]} position={[0, 2.8, 0]} />
                <mesh position={[0, 2.8, 0]} castShadow>
                    <cylinderGeometry args={[2.0, 0.8, 0.5, 16]} />
                    <meshStandardMaterial color="#f5f5f5" roughness={0.1} metalness={0.05} />
                </mesh>

                {/* Spout Pillar */}
                <mesh position={[0, 3.2, 0]} castShadow>
                    <cylinderGeometry args={[0.3, 0.5, 1.0, 8]} />
                    <meshStandardMaterial color="#e0e0e0" roughness={0.2} />
                </mesh>
            </RigidBody>

            {/* Water Particles */}
            <instancedMesh ref={meshRef} args={[undefined, undefined, particleCount]}>
                <sphereGeometry args={[1, 4, 4]} />
                <meshBasicMaterial color="#b3e5fc" />
            </instancedMesh>
            
            {/* Glow */}
            <pointLight position={[0, 2, 0]} color="#4fc3f7" intensity={3} distance={10} />
        </group>
    );
};

const HeartParticles: React.FC<{ active: boolean }> = ({ active }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const count = 15;
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const particles = useMemo(() => {
        return Array.from({ length: count }).map(() => ({
            pos: new THREE.Vector3(0, -10, 0),
            speed: 0.5 + Math.random() * 1.5,
            offset: Math.random() * 10,
            life: 0
        }));
    }, [count]);

    const heartShape = useMemo(() => {
        const x = 0, y = 0;
        const heartShape = new THREE.Shape();
        heartShape.moveTo( x + 0.25, y + 0.25 );
        heartShape.bezierCurveTo( x + 0.25, y + 0.25, x + 0.20, y, x, y );
        heartShape.bezierCurveTo( x - 0.30, y, x - 0.30, y + 0.35, x - 0.30, y + 0.35 );
        heartShape.bezierCurveTo( x - 0.30, y + 0.55, x - 0.10, y + 0.77, x + 0.25, y + 0.95 );
        heartShape.bezierCurveTo( x + 0.60, y + 0.77, x + 0.80, y + 0.55, x + 0.80, y + 0.35 );
        heartShape.bezierCurveTo( x + 0.80, y + 0.35, x + 0.80, y, x + 0.50, y );
        heartShape.bezierCurveTo( x + 0.35, y, x + 0.25, y + 0.25, x + 0.25, y + 0.25 );
        return heartShape;
    }, []);

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        
        const t = state.clock.elapsedTime;
        particles.forEach((p, i) => {
            if (active) {
                p.life += delta;
                if (p.life > 2.0) p.life = 0;
            } else {
                p.life = 0;
            }

            if (p.life > 0) {
                const y = p.life * 2.5;
                const x = Math.sin(t * 3 + p.offset) * 0.5;
                const z = Math.cos(t * 2 + p.offset) * 0.5;
                dummy.position.set(x, 1.5 + y, z);
                dummy.rotation.set(0, t, Math.PI);
                const s = Math.sin(p.life * Math.PI) * 0.4;
                dummy.scale.set(s, s, s);
            } else {
                dummy.position.set(0, -50, 0);
            }
            
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <extrudeGeometry args={[heartShape, { depth: 0.1, bevelEnabled: false }]} />
            <meshStandardMaterial color="#ff69b4" emissive="#ff1493" emissiveIntensity={2} />
        </instancedMesh>
    );
};

// Pikachu-inspired Forest NPC Model
const SPEAR_SWING_DURATION = 0.5;

const PikachuModel: React.FC<{ color?: string; flash: boolean; talking: boolean; isWalking?: boolean; outfit?: 'NONE' | 'MAYOR' | 'NURSE' | 'SAGE' | 'BLACKSMITH' | 'GLADIATOR'; spearSwingStartTime?: number | null }> = ({ color = "#F5D000", flash, talking, isWalking = false, outfit = 'NONE', spearSwingStartTime }) => {
    const groupRef = useRef<THREE.Group>(null);
    const bodyRef = useRef<THREE.Group>(null);
    const headRef = useRef<THREE.Group>(null);
    const tailRef = useRef<THREE.Group>(null);
    const leftEarRef = useRef<THREE.Group>(null);
    const rightEarRef = useRef<THREE.Group>(null);
    const leftArmRef = useRef<THREE.Group>(null);
    const rightArmRef = useRef<THREE.Group>(null);
    const leftLegRef = useRef<THREE.Group>(null);
    const rightLegRef = useRef<THREE.Group>(null);

    const materials = useMemo(() => {
        const yellow = new THREE.MeshToonMaterial({ color: flash ? "#ff0000" : "#F5D000", emissive: flash ? "#ff0000" : "#000000", emissiveIntensity: flash ? 2 : 0 });
        const black = new THREE.MeshToonMaterial({ color: "#111111" });
        const red = new THREE.MeshToonMaterial({ color: "#EE3630" });
        const white = new THREE.MeshToonMaterial({ color: "#FFFFFF" });
        const brown = new THREE.MeshToonMaterial({ color: "#7B5C35" });
        const beard = new THREE.MeshToonMaterial({ color: "#1a1816" });
        const bronze = new THREE.MeshToonMaterial({ color: "#8b6914", metalness: 0.6, roughness: 0.4 });
        const bronzeDark = new THREE.MeshToonMaterial({ color: "#5c4a0f", metalness: 0.5, roughness: 0.5 });
        return { yellow, black, red, white, brown, beard, bronze, bronzeDark };
    }, [flash]);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        
        // Idle Animation
        if (headRef.current) headRef.current.rotation.z = Math.sin(t * 1.5) * 0.05;
        if (tailRef.current) {
            tailRef.current.rotation.z = Math.sin(t * 8) * 0.2;
            tailRef.current.rotation.y = Math.cos(t * 2) * 0.1;
        }
        if (leftEarRef.current) leftEarRef.current.rotation.z = 0.5 + Math.sin(t * 3) * 0.05;
        if (rightEarRef.current) rightEarRef.current.rotation.z = -0.5 - Math.cos(t * 3) * 0.05;

        // Spear attack (guards): wind-up then forward swing when attacking
        const spearProgress = spearSwingStartTime != null && spearSwingStartTime > 0
            ? Math.max(0, 1 - (t - spearSwingStartTime) / SPEAR_SWING_DURATION)
            : 0;
        const isSpearSwinging = outfit === 'GLADIATOR' && spearProgress > 0;

        // Walking Animation (skip right arm when spear swinging)
        if (isWalking) {
            if (groupRef.current) {
                groupRef.current.position.y = 0.5 + Math.abs(Math.sin(t * 12)) * 0.1;
                groupRef.current.rotation.z = Math.sin(t * 6) * 0.05;
            }
            if (leftLegRef.current) leftLegRef.current.rotation.x = Math.sin(t * 12) * 0.8;
            if (rightLegRef.current) rightLegRef.current.rotation.x = Math.cos(t * 12) * 0.8;
            if (leftArmRef.current) leftArmRef.current.rotation.x = -Math.cos(t * 12) * 0.8;
            if (!isSpearSwinging && rightArmRef.current) rightArmRef.current.rotation.x = -Math.sin(t * 12) * 0.8;
        } else {
            if (groupRef.current) {
                if (outfit === 'GLADIATOR') {
                    groupRef.current.position.y = 0.5 + Math.sin(t * 4) * 0.025;
                    groupRef.current.rotation.z = Math.cos(t * 3) * 0.03;
                } else {
                    groupRef.current.position.y = 0.5;
                    groupRef.current.rotation.z = 0;
                }
            }
            if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
            if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
            if (leftArmRef.current) leftArmRef.current.rotation.x = 0;
            if (!isSpearSwinging && rightArmRef.current) rightArmRef.current.rotation.x = 0;
        }

        if (isSpearSwinging && rightArmRef.current) {
            // Wind-up (arm back) -> strike (arm forward) -> return to rest
            let armX: number;
            let armY: number;
            if (spearProgress >= 0.5) {
                const windUp = (1 - spearProgress) * 2; // 0 at progress=1, 1 at progress=0.5
                armX = THREE.MathUtils.lerp(0.5, -1.7, windUp);
                armY = THREE.MathUtils.lerp(0, 0.2, windUp);
            } else {
                const returnToRest = 1 - spearProgress * 2; // 0 at progress=0.5, 1 at progress=0
                armX = THREE.MathUtils.lerp(-1.7, -0.5, returnToRest);
                armY = THREE.MathUtils.lerp(0.2, 0, returnToRest);
            }
            rightArmRef.current.rotation.x = armX;
            rightArmRef.current.rotation.y = armY;
        }

        // Talking Animation
        if (talking && headRef.current) {
             headRef.current.position.y = 0.55 + Math.sin(t * 20) * 0.02;
        }
    });

    return (
        <group ref={groupRef} scale={1.2}>
            {/* Body */}
            <group ref={bodyRef} position={[0, 0, 0]}>
                <mesh castShadow receiveShadow position={[0, 0, 0]} material={materials.yellow}>
                    <capsuleGeometry args={[0.35, 0.4, 4, 8]} />
                </mesh>
                
                {/* Nurse Outfit: Fitted dress with red cross */}
                {outfit === 'NURSE' && (
                    <group position={[0, -0.1, 0]}>
                        <mesh castShadow position={[0, 0, 0]}>
                            <cylinderGeometry args={[0.36, 0.42, 0.55, 16, 1, true]} />
                            <meshToonMaterial color="#FFFFFF" side={THREE.DoubleSide} />
                        </mesh>
                        <mesh position={[0, 0.25, 0]}>
                            <torusGeometry args={[0.36, 0.02, 8, 16]} rotation={[Math.PI/2, 0, 0]} />
                            <meshToonMaterial color="#ff4081" />
                        </mesh>
                        {/* Red cross on chest */}
                        <group position={[0, 0.08, 0.38]}>
                            <mesh position={[0, 0, 0]}><boxGeometry args={[0.12, 0.04, 0.02]} /><meshToonMaterial color="#EE3630" /></mesh>
                            <mesh position={[0, 0, 0]}><boxGeometry args={[0.04, 0.16, 0.02]} /><meshToonMaterial color="#EE3630" /></mesh>
                        </group>
                    </group>
                )}

                {/* Back Stripes (Only if not wearing nurse outfit covering back) */}
                {outfit !== 'NURSE' && outfit !== 'GLADIATOR' && (
                    <>
                        <mesh position={[0, 0.1, -0.32]} rotation={[0.2, 0, 0]} material={materials.brown}>
                            <boxGeometry args={[0.4, 0.05, 0.05]} />
                        </mesh>
                        <mesh position={[0, -0.1, -0.33]} rotation={[0, 0, 0]} material={materials.brown}>
                            <boxGeometry args={[0.4, 0.05, 0.05]} />
                        </mesh>
                    </>
                )}

                {/* Gladiator chest plate & shoulder */}
                {outfit === 'GLADIATOR' && (
                    <>
                        <mesh position={[0, 0.05, 0.2]} material={materials.bronze}>
                            <boxGeometry args={[0.5, 0.45, 0.15]} />
                        </mesh>
                        <mesh position={[-0.32, 0.25, 0.05]} rotation={[0, 0, 0.3]} material={materials.bronze}>
                            <boxGeometry args={[0.15, 0.25, 0.35]} />
                        </mesh>
                        <mesh position={[0.32, 0.25, 0.05]} rotation={[0, 0, -0.3]} material={materials.bronze}>
                            <boxGeometry args={[0.15, 0.25, 0.35]} />
                        </mesh>
                    </>
                )}
            </group>

            {/* Head */}
            <group ref={headRef} position={[0, 0.55, 0]}>
                <mesh castShadow receiveShadow material={materials.yellow}>
                    <sphereGeometry args={[0.4, 16, 16]} />
                </mesh>
                
                {/* Top Hat for Mayor */}
                {outfit === 'MAYOR' && (
                    <group position={[0, 0.32, 0]} rotation={[-0.2, 0, 0]}>
                        <mesh castShadow receiveShadow position={[0, 0, 0]}>
                            <cylinderGeometry args={[0.35, 0.35, 0.05, 32]} />
                            <meshToonMaterial color="#1a1a1a" />
                        </mesh>
                        <mesh castShadow receiveShadow position={[0, 0.25, 0]}>
                            <cylinderGeometry args={[0.2, 0.2, 0.5, 32]} />
                            <meshToonMaterial color="#1a1a1a" />
                        </mesh>
                        <mesh position={[0, 0.02, 0]}>
                            <cylinderGeometry args={[0.205, 0.205, 0.1, 32]} />
                            <meshToonMaterial color="#C62828" />
                        </mesh>
                    </group>
                )}

                {/* Pointy wizard hat for Elder Sage */}
                {outfit === 'SAGE' && (
                    <group position={[0, 0.5, 0]} rotation={[-0.15, 0, 0]}>
                        <mesh castShadow receiveShadow>
                            <coneGeometry args={[0.32, 0.7, 16]} />
                            <meshToonMaterial color="#2d1b4e" />
                        </mesh>
                        <mesh position={[0, -0.35, 0]}>
                            <cylinderGeometry args={[0.33, 0.36, 0.08, 16]} />
                            <meshToonMaterial color="#2d1b4e" />
                        </mesh>
                        <mesh position={[0, -0.39, 0]}>
                            <torusGeometry args={[0.36, 0.03, 8, 16]} rotation={[Math.PI/2, 0, 0]} />
                            <meshToonMaterial color="#5c3d7a" />
                        </mesh>
                    </group>
                )}

                {/* Nurse Cap */}
                {outfit === 'NURSE' && (
                    <group position={[0, 0.35, 0.1]} rotation={[-0.2, 0, 0]}>
                        <mesh castShadow>
                            <cylinderGeometry args={[0.2, 0.25, 0.15, 16]} />
                            <meshToonMaterial color="#FFFFFF" />
                        </mesh>
                        {/* Red Cross */}
                        <group position={[0, 0, 0.2]} scale={0.5}>
                            <mesh position={[0, 0, -0.01]}><planeGeometry args={[0.2, 0.06]} /><meshBasicMaterial color="#ff0000" /></mesh>
                            <mesh position={[0, 0, -0.01]}><planeGeometry args={[0.06, 0.2]} /><meshBasicMaterial color="#ff0000" /></mesh>
                        </group>
                    </group>
                )}

                {/* Gladiator helmet (galea) */}
                {outfit === 'GLADIATOR' && (
                    <group position={[0, 0.25, 0]} rotation={[-0.1, 0, 0]}>
                        <mesh castShadow>
                            <sphereGeometry args={[0.42, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
                            <meshToonMaterial color="#8b6914" metalness={0.6} roughness={0.4} />
                        </mesh>
                        <mesh position={[0, 0.35, 0.05]} castShadow>
                            <boxGeometry args={[0.08, 0.25, 0.08]} />
                            <meshToonMaterial color="#5c4a0f" metalness={0.5} roughness={0.5} />
                        </mesh>
                    </group>
                )}

                {/* Ears */}
                <group ref={leftEarRef} position={[-0.25, 0.3, 0]} rotation={[0, 0, 0.5]}>
                    <mesh position={[0, 0.3, 0]} material={materials.yellow}>
                        <capsuleGeometry args={[0.08, 0.6, 4, 8]} />
                    </mesh>
                    <mesh position={[0, 0.65, 0]} rotation={[0.1, 0, 0]} material={materials.black}>
                        <coneGeometry args={[0.081, 0.2, 8]} />
                    </mesh>
                </group>
                <group ref={rightEarRef} position={[0.25, 0.3, 0]} rotation={[0, 0, -0.5]}>
                    <mesh position={[0, 0.3, 0]} material={materials.yellow}>
                        <capsuleGeometry args={[0.08, 0.6, 4, 8]} />
                    </mesh>
                    <mesh position={[0, 0.65, 0]} rotation={[0.1, 0, 0]} material={materials.black}>
                        <coneGeometry args={[0.081, 0.2, 8]} />
                    </mesh>
                </group>

                {/* Face */}
                {/* Eyes */}
                <group position={[-0.18, 0.05, 0.32]}>
                    <mesh material={materials.black}><sphereGeometry args={[0.06, 8, 8]} /></mesh>
                    <mesh position={[0.02, 0.02, 0.04]} material={materials.white}><sphereGeometry args={[0.02, 8, 8]} /></mesh>
                </group>
                <group position={[0.18, 0.05, 0.32]}>
                    <mesh material={materials.black}><sphereGeometry args={[0.06, 8, 8]} /></mesh>
                    <mesh position={[-0.02, 0.02, 0.04]} material={materials.white}><sphereGeometry args={[0.02, 8, 8]} /></mesh>
                </group>

                {/* Cheeks */}
                <mesh position={[-0.28, -0.1, 0.25]} rotation={[0, 0.5, 0]} material={materials.red}>
                    <circleGeometry args={[0.08, 16]} />
                </mesh>
                <mesh position={[0.28, -0.1, 0.25]} rotation={[0, -0.5, 0]} material={materials.red}>
                    <circleGeometry args={[0.08, 16]} />
                </mesh>

                {/* Nose */}
                <mesh position={[0, -0.02, 0.38]} material={materials.black}>
                    <sphereGeometry args={[0.015, 8, 8]} />
                </mesh>
                
                {/* Mouth (Simple w shape) */}
                <mesh position={[0, -0.12, 0.36]} rotation={[0, 0, 0]} material={materials.black}>
                    <torusGeometry args={[0.03, 0.005, 4, 8, Math.PI]} />
                </mesh>
                 <mesh position={[-0.05, -0.1, 0.35]} rotation={[0, 0, 0.5]} material={materials.black}>
                    <capsuleGeometry args={[0.005, 0.06, 4, 8]} />
                </mesh>
                 <mesh position={[0.05, -0.1, 0.35]} rotation={[0, 0, -0.5]} material={materials.black}>
                    <capsuleGeometry args={[0.005, 0.06, 4, 8]} />
                </mesh>

                {/* Kratos-style full beard (Blacksmith) - dense, no toothbrush mustache */}
                {outfit === 'BLACKSMITH' && (
                    <group position={[0, -0.2, 0.26]} rotation={[0.22, 0, 0]}>
                        {/* Dense core under chin - main bulk */}
                        <mesh position={[0, -0.06, 0]} material={materials.beard}>
                            <sphereGeometry args={[0.18, 12, 12]} />
                        </mesh>
                        <mesh position={[0, -0.2, 0.02]} material={materials.beard}>
                            <capsuleGeometry args={[0.14, 0.28, 6, 12]} />
                        </mesh>
                        {/* Left jaw - full and thick */}
                        <mesh position={[-0.2, -0.04, -0.04]} rotation={[0, 0, 0.2]} material={materials.beard}>
                            <capsuleGeometry args={[0.1, 0.24, 6, 10]} />
                        </mesh>
                        <mesh position={[-0.22, -0.14, -0.02]} rotation={[0, 0, 0.15]} material={materials.beard}>
                            <capsuleGeometry args={[0.09, 0.2, 6, 10]} />
                        </mesh>
                        {/* Right jaw - full and thick */}
                        <mesh position={[0.2, -0.04, -0.04]} rotation={[0, 0, -0.2]} material={materials.beard}>
                            <capsuleGeometry args={[0.1, 0.24, 6, 10]} />
                        </mesh>
                        <mesh position={[0.22, -0.14, -0.02]} rotation={[0, 0, -0.15]} material={materials.beard}>
                            <capsuleGeometry args={[0.09, 0.2, 6, 10]} />
                        </mesh>
                        {/* Extra layer for fullness - center */}
                        <mesh position={[0, -0.12, 0.06]} material={materials.beard}>
                            <capsuleGeometry args={[0.12, 0.2, 6, 10]} />
                        </mesh>
                        {/* Full mustache - one wide band that connects into beard, not separate patches */}
                        <mesh position={[0, 0.02, 0.34]} rotation={[0.15, 0, 0]} material={materials.beard}>
                            <boxGeometry args={[0.28, 0.06, 0.08]} />
                        </mesh>
                        <mesh position={[-0.06, -0.02, 0.32]} rotation={[0.2, 0, 0.08]} material={materials.beard}>
                            <capsuleGeometry args={[0.04, 0.1, 4, 8]} />
                        </mesh>
                        <mesh position={[0.06, -0.02, 0.32]} rotation={[0.2, 0, -0.08]} material={materials.beard}>
                            <capsuleGeometry args={[0.04, 0.1, 4, 8]} />
                        </mesh>
                    </group>
                )}

            </group>

            {/* Limbs */}
            <group ref={leftArmRef} position={[-0.25, 0.1, 0.15]} rotation={[0, 0, 0.5]}>
                <mesh position={[0, -0.1, 0]} material={materials.yellow}>
                    <capsuleGeometry args={[0.07, 0.25, 4, 8]} />
                </mesh>
            </group>
            <group ref={rightArmRef} position={[0.25, 0.1, 0.15]} rotation={[0, 0, -0.5]}>
                <mesh position={[0, -0.1, 0]} material={materials.yellow}>
                    <capsuleGeometry args={[0.07, 0.25, 4, 8]} />
                </mesh>
                {/* Gladiator arm guard (manica) + battle spear */}
                {outfit === 'GLADIATOR' && (
                    <>
                        <mesh position={[0, -0.05, 0]} material={materials.bronze}>
                            <capsuleGeometry args={[0.09, 0.28, 4, 8]} />
                        </mesh>
                        <group position={[0, 0.15, 0.35]} rotation={[0.4, 0, 0]}>
                            <mesh position={[0, 0.5, 0]} castShadow>
                                <cylinderGeometry args={[0.02, 0.025, 1.1, 8]} />
                                <meshToonMaterial color="#4a4a4a" metalness={0.7} roughness={0.3} />
                            </mesh>
                            <mesh position={[0, 1.1, 0]}>
                                <coneGeometry args={[0.08, 0.2, 6]} />
                                <meshToonMaterial color="#8b6914" metalness={0.7} roughness={0.3} />
                            </mesh>
                        </group>
                    </>
                )}
            </group>
            
            <group ref={leftLegRef} position={[-0.2, -0.25, 0]}>
                <mesh position={[0, -0.1, 0.1]} rotation={[0.5, 0, 0]} material={materials.yellow}>
                     <capsuleGeometry args={[0.08, 0.25, 4, 8]} />
                </mesh>
            </group>
            <group ref={rightLegRef} position={[-0.2, -0.25, 0]}>
                <mesh position={[0, -0.1, 0.1]} rotation={[0.5, 0, 0]} material={materials.yellow}>
                     <capsuleGeometry args={[0.08, 0.25, 4, 8]} />
                </mesh>
            </group>

            {/* Tail */}
            <group ref={tailRef} position={[0, -0.1, -0.3]}>
                 {/* Zig Zag Segments */}
                 <group rotation={[0.2, 0, 0]}>
                     {/* Base (Brown) */}
                    <mesh position={[0, 0.1, 0]} material={materials.brown}>
                        <boxGeometry args={[0.08, 0.3, 0.05]} />
                    </mesh>
                    {/* Segment 1 */}
                    <mesh position={[0, 0.35, 0]} rotation={[0, 0, 0.5]} material={materials.yellow}>
                         <boxGeometry args={[0.15, 0.4, 0.05]} />
                    </mesh>
                    {/* Segment 2 */}
                    <mesh position={[0.1, 0.6, 0]} rotation={[0, 0, -0.5]} material={materials.yellow}>
                         <boxGeometry args={[0.2, 0.4, 0.05]} />
                    </mesh>
                    {/* Tip */}
                     <mesh position={[0, 0.9, 0]} rotation={[0, 0, 0.2]} material={materials.yellow}>
                         <boxGeometry args={[0.3, 0.6, 0.05]} />
                    </mesh>
                 </group>
            </group>

        </group>
    );
};

const DogModel: React.FC<{ state: 'IDLE' | 'WANDER' | 'RUN' | 'SNIFF' | 'SIT' }> = ({ state }) => {
    const groupRef = useRef<THREE.Group>(null);
    const headRef = useRef<THREE.Group>(null);
    const tailRef = useRef<THREE.Mesh>(null);

    useFrame((ctx) => {
        const t = ctx.clock.elapsedTime;
        if(groupRef.current) {
            groupRef.current.position.y = Math.sin(t * 10) * 0.02;
        }
        if (headRef.current) {
            if (state === 'SNIFF') {
                headRef.current.rotation.x = 0.5 + Math.sin(t * 8) * 0.1;
                headRef.current.rotation.y = Math.sin(t * 3) * 0.1;
            } else {
                headRef.current.rotation.x = -0.2 + Math.sin(t * 2) * 0.05;
                headRef.current.rotation.y = Math.sin(t * 1.5) * 0.1;
            }
        }
        if (tailRef.current) {
            tailRef.current.rotation.z = Math.cos(t * 15) * 0.5;
        }
    });

    return (
        <group ref={groupRef}>
             <mesh position={[0, 0.4, 0]} castShadow>
                 <boxGeometry args={[0.35, 0.4, 0.6]} />
                 <meshStandardMaterial color="#795548" />
             </mesh>
             <group ref={headRef} position={[0, 0.7, 0.35]}>
                 <mesh castShadow>
                     <boxGeometry args={[0.3, 0.3, 0.35]} />
                     <meshStandardMaterial color="#795548" />
                 </mesh>
                 <mesh position={[0, 0, 0.18]} castShadow>
                     <boxGeometry args={[0.12, 0.12, 0.12]} />
                     <meshStandardMaterial color="#222" />
                 </mesh>
                 <mesh position={[-0.12, 0.2, -0.05]}>
                     <boxGeometry args={[0.08, 0.2, 0.08]} />
                     <meshStandardMaterial color="#5d4037" />
                 </mesh>
                 <mesh position={[0.12, 0.2, -0.05]}>
                     <boxGeometry args={[0.08, 0.2, 0.08]} />
                     <meshStandardMaterial color="#5d4037" />
                 </mesh>
             </group>
             <mesh ref={tailRef} position={[0, 0.5, -0.3]} rotation={[0.4, 0, 0]}>
                 <boxGeometry args={[0.08, 0.35, 0.08]} />
                 <meshStandardMaterial color="#5d4037" />
             </mesh>
             <mesh position={[-0.15, 0.2, 0.2]}>
                 <boxGeometry args={[0.1, 0.4, 0.1]} />
                 <meshStandardMaterial color="#795548" />
             </mesh>
             <mesh position={[0.15, 0.2, 0.2]}>
                 <boxGeometry args={[0.1, 0.4, 0.1]} />
                 <meshStandardMaterial color="#795548" />
             </mesh>
             <mesh position={[-0.15, 0.2, -0.2]}>
                 <boxGeometry args={[0.1, 0.4, 0.1]} />
                 <meshStandardMaterial color="#795548" />
             </mesh>
             <mesh position={[0.15, 0.2, -0.2]}>
                 <boxGeometry args={[0.1, 0.4, 0.1]} />
                 <meshStandardMaterial color="#795548" />
             </mesh>
        </group>
    );
};

const TownNPC: React.FC<{ data: TownNPCData; playerRef: React.RefObject<THREE.Object3D> }> = ({ data: initialData, playerRef }) => {
    const rb = useRef<RapierRigidBody>(null);
    
    // Direct store selection for better reactivity to specific NPC changes
    const npcData = useGameStore(s => s.townNPCs.find(n => n.id === initialData.id) || initialData);
    const { activeDialoguePartner, setActiveDialoguePartner, updateTownNPCPosition, setTownNPCDialogue, gameTime, health, maxHealth, score, interactionRequestTick, buildings, isStanceActive, enemies, healPlayer, rechargeMana } = useGameStore();
    
    const [flash, setFlash] = useState(false);
    const [isNear, setIsNear] = useState(false);
    const [isInteractable, setIsInteractable] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [typedText, setTypedText] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [showHearts, setShowHearts] = useState(false);
    
    // AI State Machine
    const aiState = useRef<'IDLE' | 'MOVING' | 'ACTION' | 'TALKING'>('IDLE');
    const stateTimer = useRef(Math.random() * 5); // Start with random offset
    const targetPos = useRef(new THREE.Vector3(...npcData.position));
    
    const lastHp = useRef(npcData.hp);
    const lastAiResponse = useRef("");
    const lastLocalLine = useRef<string | null>(null);
    const npcPosVec = useMemo(() => new THREE.Vector3(...npcData.position), [npcData.position]);
    const playerPosVec = useMemo(() => new THREE.Vector3(), []);
    const tempVec = useMemo(() => new THREE.Vector3(), []);

    useEffect(() => {
        if (npcData.hp < lastHp.current) {
            setFlash(true);
            setTimeout(() => setFlash(false), 120);
            lastHp.current = npcData.hp;
        }
    }, [npcData.hp]);

    // TYPEWRITER EFFECT: Listen for AI response changes and stream the text
    useEffect(() => {
        if (npcData.aiResponse && npcData.aiResponse !== lastAiResponse.current) {
            lastAiResponse.current = npcData.aiResponse;
            setIsTyping(true);
            setTypedText("");
            let i = 0;
            const text = npcData.aiResponse;
            const interval = setInterval(() => {
                setTypedText(text.slice(0, i + 1));
                i++;
                if (i >= text.length) {
                    clearInterval(interval);
                    setIsTyping(false);
                }
            }, 25);
            return () => clearInterval(interval);
        }
    }, [npcData.aiResponse]);

    const handleInteraction = (e?: any) => {
        if (e) e.stopPropagation();

        // Click behavior:
        // - If bubble is open for this NPC -> CLOSE it.
        // - If bubble is closed (or another NPC was talking) -> OPEN and generate a new thought.
        if (activeDialoguePartner === npcData.id) {
            // Close current dialogue bubble
            setActiveDialoguePartner(null);
            aiState.current = 'IDLE';
            return;
        }

        // Start a new conversation with this NPC
        setActiveDialoguePartner(npcData.id);
        aiState.current = 'TALKING';
        if (rb.current) {
            // Stop them from walking while they talk
            rb.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
        generateAiDialogue();
    };

    // Controller interaction support
    useEffect(() => {
        if ((isInteractable || (activeDialoguePartner === npcData.id && isNear)) && interactionRequestTick > 0) {
            handleInteraction();
        }
    }, [interactionRequestTick]);

    const pickNewDestination = () => {
        if (npcData.role === 'Nurse') return; // Nurse stays at clinic

        const r = Math.random();
        // 50% chance to go to a building, 50% to a random point
        if (r > 0.5 && buildings.length > 0) {
            const building = buildings[Math.floor(Math.random() * buildings.length)];
            // Target slightly in front of the door
            const angle = building.rotation;
            const offsetDist = 6.0;
            const tx = building.position[0] + Math.sin(angle) * offsetDist;
            const tz = building.position[2] + Math.cos(angle) * offsetDist;
            targetPos.current.set(tx, getTerrainHeight(tx, tz), tz);
        } else {
            // Wander somewhere in town bounds (approx X: -5 to 75, Z: -20 to 25)
            const tx = Math.random() * 80 - 5;
            const tz = Math.random() * 45 - 20;
            targetPos.current.set(tx, getTerrainHeight(tx, tz), tz);
        }
    };

    useFrame((state, delta) => {
        if (!rb.current) return;
        
        const pos = rb.current.translation();
        const currentPosVec = new THREE.Vector3(pos.x, pos.y, pos.z);
        
        // Update Store Position for other systems
        if (state.clock.elapsedTime % 0.2 < 0.05) {
            updateTownNPCPosition(npcData.id, [pos.x, pos.y, pos.z]);
        }

        if (playerRef.current) {
            playerRef.current.getWorldPosition(playerPosVec);
            const dist = playerPosVec.distanceTo(currentPosVec);
            
            // Persistence range: 20 units (UI visible, chat stays open)
            const persistence = dist < 20.0;
            // Interaction range: 6 units (Can start talking)
            const interactable = dist < 6.0;

            if (persistence !== isNear) setIsNear(persistence);
            if (interactable !== isInteractable) setIsInteractable(interactable);
            
            // Player Proximity Reaction
            if (interactable && aiState.current !== 'TALKING') {
                 // Stop if player gets very close, look at them
                 if (dist < 4.0) {
                     aiState.current = 'IDLE';
                     stateTimer.current = 2.0; // Pause for 2 seconds
                     const angle = Math.atan2(playerPosVec.x - pos.x, playerPosVec.z - pos.z);
                     rb.current.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle), true);
                 }
            }

            if (!persistence && activeDialoguePartner === npcData.id) {
                setActiveDialoguePartner(null);
                aiState.current = 'IDLE'; // Resume life
            }
        }
        
        // State Machine Logic
        if (activeDialoguePartner === npcData.id) {
             aiState.current = 'TALKING';
        }

        switch (aiState.current) {
            case 'IDLE':
                stateTimer.current -= delta;
                rb.current.setLinvel({ x: 0, y: rb.current.linvel().y, z: 0 }, true);
                if (stateTimer.current <= 0) {
                    pickNewDestination();
                    aiState.current = 'MOVING';
                }
                break;

            case 'MOVING':
                const dir = tempVec.subVectors(targetPos.current, currentPosVec);
                dir.y = 0;
                const distToTarget = dir.length();
                
                if (distToTarget < 1.0) {
                    // Reached Destination
                    aiState.current = 'ACTION';
                    stateTimer.current = 3.0 + Math.random() * 5.0; // Hang out for 3-8 seconds
                    rb.current.setLinvel({ x: 0, y: rb.current.linvel().y, z: 0 }, true);
                } else {
                    dir.normalize();
                    const speed = 2.5;
                    rb.current.setLinvel({ x: dir.x * speed, y: rb.current.linvel().y, z: dir.z * speed }, true);
                    
                    // Rotation
                    const angle = Math.atan2(dir.x, dir.z);
                    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
                    rb.current.setRotation(q, true);
                }
                break;

            case 'ACTION':
                stateTimer.current -= delta;
                rb.current.setLinvel({ x: 0, y: rb.current.linvel().y, z: 0 }, true);
                // Randomly look around while idling/acting
                if (Math.random() < 0.02) {
                    const randomAngle = (Math.random() - 0.5) * Math.PI;
                    const currentRot = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(rb.current.rotation().x, rb.current.rotation().y, rb.current.rotation().z, rb.current.rotation().w));
                    rb.current.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), currentRot.y + randomAngle), true);
                }

                if (stateTimer.current <= 0) {
                    aiState.current = 'IDLE';
                    stateTimer.current = 1.0 + Math.random() * 2.0;
                }
                break;
            
            case 'TALKING':
                rb.current.setLinvel({ x: 0, y: rb.current.linvel().y, z: 0 }, true);
                if (playerRef.current) {
                    // Face player
                    const angle = Math.atan2(playerPosVec.x - pos.x, playerPosVec.z - pos.z);
                    rb.current.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle), true);
                }
                break;
        }
    });

    const generateAiDialogue = async () => {
        // Special logic for Nurse Pikachu: full health + full mana
        if (npcData.role === 'Nurse') {
            healPlayer(999); // Full health (capped by maxHealth)
            rechargeMana(999); // Full mana (capped by maxMana)
            setShowHearts(true);
            setTimeout(() => setShowHearts(false), 3000);
        }

        if (isThinking) return;
        
        setTownNPCDialogue(npcData.id, ""); 
        setTypedText("");
        setIsThinking(true);

        try {
            const timeOfDay = gameTime < 0.3 ? "morning" : gameTime < 0.7 ? "day" : "night";
            const nearbyEnemies = enemies.filter(e => !e.isDead && new THREE.Vector3(...e.position).distanceTo(new THREE.Vector3(...npcData.position)) < 30).length;
            const isPlayerHurt = health < maxHealth * 0.5;
            const isPlayerAggressive = isStanceActive;

            let finalText = "";

            // Try a few times to avoid repeating the exact same line back-to-back
            for (let attempt = 0; attempt < 4; attempt++) {
                const fragments: string[] = [];

                // Role flavor, varied per NPC type
                if (npcData.role === 'Mayor') {
                    fragments.push(MAYOR_LINES[Math.floor(Math.random() * MAYOR_LINES.length)]);
                } else if (npcData.role === 'Merchant') {
                    fragments.push(MERCHANT_LINES[Math.floor(Math.random() * MERCHANT_LINES.length)]);
                } else if (npcData.role === 'Blacksmith') {
                    fragments.push(BLACKSMITH_LINES[Math.floor(Math.random() * BLACKSMITH_LINES.length)]);
                } else if (npcData.role === 'Historian') {
                    fragments.push(HISTORIAN_LINES[Math.floor(Math.random() * HISTORIAN_LINES.length)]);
                } else if (npcData.role === 'Nurse') {
                    fragments.push(NURSE_LINES[Math.floor(Math.random() * NURSE_LINES.length)]);
                }

                // Situation flavor
                if (isPlayerHurt) {
                    fragments.push("You still look a bit rough. Pain here feels real enough, even if the edges of the world don't.");
                }
                if (nearbyEnemies > 0) {
                    fragments.push(`There are ${nearbyEnemies} things nearby that want us gone, yet they only move when you come close.`);
                }
                if (isPlayerAggressive) {
                    fragments.push("You keep that weapon ready, as if some unseen player might spawn danger at any moment.");
                }
                if (timeOfDay === 'night') {
                    fragments.push("Nights here feel copied and pasted, but the shadows still make me uneasy.");
                }

                // Existential kicker
                const existential = EXISTENTIAL_LINES[Math.floor(Math.random() * EXISTENTIAL_LINES.length)];
                const base = fragments.join(" ") || "Nice weather in this little loop of reality, isn't it?";
                const candidate = `${base} ${existential}`.slice(0, 220);

                if (candidate !== lastLocalLine.current || attempt === 3) {
                    finalText = candidate;
                    break;
                }
            }

            lastLocalLine.current = finalText;
            setTownNPCDialogue(npcData.id, finalText);
        } catch (err) {
            console.error("[ForestGuardian][NPC AI] Local dialogue error:", err);
            setTownNPCDialogue(npcData.id, "I tried to speak, but something in the code twisted my words into silence.");
        } finally {
            // Always exit thinking state so the bubble swaps from the loading text to the line above.
            setTimeout(() => setIsThinking(false), 50);
        }
    };

    const isTalking = activeDialoguePartner === npcData.id;
    const isMoving = aiState.current === 'MOVING';
    const bodyColor = flash ? "#ff0000" : "#ffcc00";
    const npcOutfit = npcData.role === 'Mayor' ? 'MAYOR' : npcData.role === 'Nurse' ? 'NURSE' : npcData.role === 'Historian' ? 'SAGE' : npcData.role === 'Blacksmith' ? 'BLACKSMITH' : 'NONE';
    
    // UI logic: If typing, show typewriter text. Otherwise, show AI response or fallback.
    const currentDisplayText = isTyping ? typedText : (npcData.aiResponse || npcData.dialogue[0]);

    return (
        <RigidBody ref={rb} position={npcData.position} type="dynamic" colliders={false} userData={{ type: 'TOWN_NPC', id: npcData.id }} enabledRotations={[false, true, false]} friction={0.5} linearDamping={1.0}>
            <CuboidCollider args={[0.5, 1.2, 0.5]} position={[0, 1, 0]} />
            
            {/* Invisible click hitbox for NPC interaction */}
            <mesh position={[0, 1.2, 0]} onPointerDown={handleInteraction}>
                <boxGeometry args={[3.5, 4.5, 3.5]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
            </mesh>

            <PikachuModel color={bodyColor} flash={flash} talking={isTalking} isWalking={isMoving} outfit={npcOutfit} />
            <HeartParticles active={showHearts} />
            
            {isTalking && (
                <Html 
                    key={`${npcData.id}-${npcData.aiResponse ? 'resp' : 'none'}`} 
                    position={[0, 3.8, 0]} 
                    center 
                    zIndexRange={[50, 0]}
                >
                    <div className="npc-dialogue-container" style={{ width: '320px' }}>
                        <div className="npc-name-tag">{npcData.name}</div>
                        <div className="npc-dialogue-bubble">
                            <div>
                                {currentDisplayText}
                            </div>
                        </div>
                    </div>
                </Html>
            )}
        </RigidBody>
    );
};

export const TownSystem: React.FC<{ playerRef: React.RefObject<THREE.Object3D> }> = ({ playerRef }) => {
    const buildings = useGameStore(s => s.buildings);
    const townNPCs = useGameStore(s => s.townNPCs);
    const townAnimals = useGameStore(s => s.townAnimals);
    const townChildren = useGameStore(s => s.townChildren);

    // Solid floor under the whole town so the player doesn't fall through (trimesh is unreliable here)
    const townFloorY = getTerrainHeight(32, 5);
    const townFloorHalfX = 65;
    const townFloorHalfZ = 52;

    return (
        <group>
            <RigidBody type="fixed" position={[37, townFloorY, 5]} friction={1} colliders={false}>
                <CuboidCollider args={[townFloorHalfX, 0.5, townFloorHalfZ]} />
            </RigidBody>
            <Fountain position={[35, 0, 5]} />
            <PathNetwork />
            <TownProps />
            
            {buildings.map(b => (
                <Building key={b.id} data={b} playerRef={playerRef} />
            ))}

            {townNPCs.map(npc => (
                <TownNPC key={npc.id} data={npc} playerRef={playerRef} />
            ))}

            {townChildren.map(child => (
                <TownChild key={child.id} data={child} />
            ))}

            {townAnimals.map(animal => {
                const y = getTerrainHeight(animal.position[0], animal.position[2]);
                return (
                    <group key={animal.id} position={[animal.position[0], y, animal.position[2]]}>
                        <DogModel state="WANDER" />
                    </group>
                );
            })}

            {/* Fence around town - only two openings where paths exit */}
            {/* North boundary */}
            <Fence controlPoints={[[-25, 25], [20, 55], [60, 55], [90, 45], [100, 15]]} />
            {/* South boundary */}
            <Fence controlPoints={[[-25, -15], [20, -45], [60, -45], [90, -35], [100, -5]]} />
            {/* West side: two segments with gap for path at z=5 */}
            <Fence controlPoints={[[-25, 25], [-25, 9]]} />
            <Fence controlPoints={[[-25, 1], [-25, -15]]} />
            {/* East side: two segments with gap for path at z=5 */}
            <Fence controlPoints={[[100, 15], [100, 9]]} />
            <Fence controlPoints={[[100, 1], [100, -5]]} />

            {/* Entrance arches at the end of cobblestone paths (only two openings) */}
            <EntranceArch position={[-25, 5]} rotation={Math.PI / 2} />
            <EntranceArch position={[100, 5]} rotation={-Math.PI / 2} />

            {/* Guard Pikachu soldiers: two at each gate, gladiator armor + spears, attack enemies trying to enter */}
            <GateGuard position={[-27, 3]} gateSide="west" />
            <GateGuard position={[-27, 7]} gateSide="west" />
            <GateGuard position={[102, 3]} gateSide="east" />
            <GateGuard position={[102, 7]} gateSide="east" />
        </group>
    );
};
