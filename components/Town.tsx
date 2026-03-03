
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CuboidCollider, CylinderCollider } from '@react-three/rapier';
import { Billboard, Text, Html } from '@react-three/drei';
import * as THREE from 'three';
import { GoogleGenAI } from "@google/genai";
import { useGameStore } from '../store';
import { BuildingData, TownNPCData, TownAnimalData } from '../types';
import { getTerrainHeight } from './Environment';

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

const ClimbingIvy: React.FC<{ height: number; width: number }> = ({ height, width }) => {
    const ivyRef = useRef<THREE.InstancedMesh>(null);
    const count = 30;
    const dummy = useMemo(() => new THREE.Object3D(), []);

    useEffect(() => {
        if (! ivyRef.current) return;
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * width;
            const y = Math.random() * height;
            dummy.position.set(x, y, 0.05);
            dummy.rotation.set(0, 0, Math.random() * Math.PI);
            dummy.scale.setScalar(0.2 + Math.random() * 0.4);
            dummy.updateMatrix();
            ivyRef.current.setMatrixAt(i, dummy.matrix);
        }
        ivyRef.current.instanceMatrix.needsUpdate = true;
    }, [count, height, width]);

    return (
        <instancedMesh ref={ivyRef} args={[undefined, undefined, count]} frustumCulled={false} raycast={() => null}>
            <planeGeometry args={[0.5, 0.5]} />
            <meshStandardMaterial color="#2d5a27" side={THREE.DoubleSide} alphaTest={0.5} transparent />
        </instancedMesh>
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
                        {isNear && (
                            <Html position={[0, 0.5, 0]} center>
                                <div className="pointer-events-none select-none px-3 py-1 bg-black/80 backdrop-blur-sm border border-white/20 text-white text-[10px] font-black uppercase tracking-widest animate-bounce whitespace-nowrap">
                                    Tap or (▲) to {isOpen ? 'Close' : 'Open'}
                                </div>
                            </Html>
                        )}
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
                <ClimbingIvy height={height} width={width} />
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
    return (
        <group position={[0, height / 2, 0]}>
            {/* Main Hall */}
            <mesh position={[0, 0, 0]} castShadow receiveShadow>
                <boxGeometry args={[width, height, depth]} />
                <meshStandardMaterial color="#8d8d8d" roughness={0.6} /> 
            </mesh>
            {/* Pillars */}
            <group position={[0, 0, depth/2 + 1]}>
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
            {/* Side Scrolls Visuals */}
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
    return (
        <group position={[0, height / 2, 0]}>
            {/* Main White Building */}
            <mesh position={[0, 0, 0]} castShadow receiveShadow>
                <boxGeometry args={[width, height, depth]} />
                <meshStandardMaterial color="#e3f2fd" roughness={0.5} />
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

// --- SPLINE-BASED FENCE SYSTEM ---

const Fence: React.FC<{ controlPoints: [number, number][] }> = ({ controlPoints }) => {
    const postsRef = useRef<THREE.InstancedMesh>(null);
    const railsRef = useRef<THREE.InstancedMesh>(null);
    const railCountPerSegment = 2; // Two horizontal rails
    
    const { segments } = useMemo(() => {
        const points = controlPoints.map(p => new THREE.Vector3(p[0], 0, p[1]));
        const curve = new THREE.CatmullRomCurve3(points, false); // Opened segments
        
        const divisions = 40;
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
            
            finalSegments.push({
                p1, p2, center, length, rotation: dummy.rotation.clone()
            });
        }
        
        return { segments: finalSegments };
    }, [controlPoints]);

    useEffect(() => {
        const postDummy = new THREE.Object3D();
        const railDummy = new THREE.Object3D();
        
        segments.forEach((seg, i) => {
            postDummy.position.copy(seg.p1).add(new THREE.Vector3(0, 1.0, 0));
            postDummy.updateMatrix();
            postsRef.current?.setMatrixAt(i, postDummy.matrix);
            
            for (let r = 0; r < railCountPerSegment; r++) {
                const railYOffset = 0.6 + (r * 0.8);
                railDummy.position.copy(seg.center).add(new THREE.Vector3(0, railYOffset, 0));
                railDummy.rotation.copy(seg.rotation);
                railDummy.scale.set(1, 1, seg.length);
                railDummy.updateMatrix();
                railsRef.current?.setMatrixAt(i * railCountPerSegment + r, railDummy.matrix);
            }
        });
        
        if (segments.length > 0) {
            const lastSeg = segments[segments.length - 1];
            postDummy.position.copy(lastSeg.p2).add(new THREE.Vector3(0, 1.0, 0));
            postDummy.updateMatrix();
            postsRef.current?.setMatrixAt(segments.length, postDummy.matrix);
        }
        
        if (postsRef.current) postsRef.current.instanceMatrix.needsUpdate = true;
        if (railsRef.current) railsRef.current.instanceMatrix.needsUpdate = true;
    }, [segments]);

    return (
        <group>
            <instancedMesh ref={postsRef} args={[undefined, undefined, segments.length + 1]} castShadow receiveShadow frustumCulled={false} raycast={() => null}>
                <boxGeometry args={[0.4, 2, 0.4]} />
                <meshStandardMaterial color="#3e2723" roughness={0.9} />
            </instancedMesh>
            <instancedMesh ref={railsRef} args={[undefined, undefined, segments.length * railCountPerSegment]} castShadow receiveShadow frustumCulled={false} raycast={() => null}>
                <boxGeometry args={[0.2, 0.3, 1]} />
                <meshStandardMaterial color="#3e2723" roughness={0.9} />
            </instancedMesh>

            <RigidBody type="fixed" colliders={false}>
                {segments.map((seg, i) => (
                    <group key={i} position={[seg.center.x, seg.center.y + 1, seg.center.z]} rotation={[seg.rotation.x, seg.rotation.y, seg.rotation.z]}>
                        <CuboidCollider args={[0.1, 1, seg.length / 2]} />
                    </group>
                ))}
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
const PikachuModel: React.FC<{ color?: string; flash: boolean; talking: boolean; isWalking?: boolean; outfit?: 'NONE' | 'MAYOR' | 'NURSE' }> = ({ color = "#F5D000", flash, talking, isWalking = false, outfit = 'NONE' }) => {
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
        return { yellow, black, red, white, brown };
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

        // Walking Animation
        if (isWalking) {
            if (groupRef.current) {
                groupRef.current.position.y = 0.5 + Math.abs(Math.sin(t * 12)) * 0.1;
                groupRef.current.rotation.z = Math.sin(t * 6) * 0.05;
            }
            if (leftLegRef.current) leftLegRef.current.rotation.x = Math.sin(t * 12) * 0.8;
            if (rightLegRef.current) rightLegRef.current.rotation.x = Math.cos(t * 12) * 0.8;
            if (leftArmRef.current) leftArmRef.current.rotation.x = -Math.cos(t * 12) * 0.8;
            if (rightArmRef.current) rightArmRef.current.rotation.x = -Math.sin(t * 12) * 0.8;
        } else {
            if (groupRef.current) {
                groupRef.current.position.y = 0.5;
                groupRef.current.rotation.z = 0;
            }
            if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
            if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
            if (leftArmRef.current) leftArmRef.current.rotation.x = 0;
            if (rightArmRef.current) rightArmRef.current.rotation.x = 0;
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
                
                {/* Nurse Outfit: Dress */}
                {outfit === 'NURSE' && (
                    <group position={[0, -0.1, 0]}>
                        <mesh castShadow position={[0, 0, 0]}>
                            <cylinderGeometry args={[0.36, 0.45, 0.5, 16, 1, true]} />
                            <meshToonMaterial color="#FFFFFF" side={THREE.DoubleSide} />
                        </mesh>
                        <mesh position={[0, 0.25, 0]}>
                            <torusGeometry args={[0.36, 0.02, 8, 16]} rotation={[Math.PI/2, 0, 0]} />
                            <meshToonMaterial color="#ff4081" />
                        </mesh>
                    </group>
                )}

                {/* Back Stripes (Only if not wearing nurse outfit covering back) */}
                {outfit !== 'NURSE' && (
                    <>
                        <mesh position={[0, 0.1, -0.32]} rotation={[0.2, 0, 0]} material={materials.brown}>
                            <boxGeometry args={[0.4, 0.05, 0.05]} />
                        </mesh>
                        <mesh position={[0, -0.1, -0.33]} rotation={[0, 0, 0]} material={materials.brown}>
                            <boxGeometry args={[0.4, 0.05, 0.05]} />
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
    const { activeDialoguePartner, setActiveDialoguePartner, updateTownNPCPosition, setTownNPCDialogue, gameTime, health, maxHealth, score, interactionRequestTick, buildings, isStanceActive, enemies, healPlayer } = useGameStore();
    
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
        
        // Allow interaction if close enough OR if already talking (to advance dialogue)
        const canInteract = isInteractable || (activeDialoguePartner === npcData.id && isNear);

        if (canInteract) {
            if (activeDialoguePartner === npcData.id) {
                generateAiDialogue();
            } else {
                setActiveDialoguePartner(npcData.id);
                aiState.current = 'TALKING';
                // Stop moving immediately
                if (rb.current) rb.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
                generateAiDialogue();
            }
        }
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
        // Special logic for Nurse
        if (npcData.role === 'Nurse') {
            healPlayer(200); // Full heal
            setShowHearts(true);
            setTimeout(() => setShowHearts(false), 3000);
        }

        if (isThinking) return;
        
        setTownNPCDialogue(npcData.id, ""); 
        setTypedText("");
        setIsThinking(true);
        
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            // 1. Gather World State for Context-Awareness
            const timeOfDay = gameTime < 0.3 ? "Morning" : gameTime < 0.7 ? "Day" : "Night";
            const nearbyEnemies = enemies.filter(e => !e.isDead && new THREE.Vector3(...e.position).distanceTo(new THREE.Vector3(...npcData.position)) < 30).length;
            const isPlayerHurt = health < maxHealth * 0.5;
            const isPlayerAggressive = isStanceActive;
            const distToVoid = Math.max(0, 80 - Math.abs(npcData.position[0])); // Rough check for edge of map
            
            // 2. Determine Dialogue Mode (Observation vs. Philosophy vs. Task)
            const roll = Math.random();
            let mode = 'DEFAULT';
            let specificInstruction = "";
            
            if (npcData.role === 'Nurse') {
                mode = 'HEALER';
                specificInstruction = "You are a caring nurse. You just healed the player. Make a sweet, slightly flirtatious comment about them being more careful next time.";
            } else if (roll > 0.7) {
                mode = 'PHILOSOPHY'; // 30% chance to question reality
                specificInstruction = "You are having an existential crisis. You suspect your world is a simulation or a game. Comment on the 'invisible walls', the repetitive nature of your existence, or the fact that the trees don't grow.";
            } else if (roll > 0.3) {
                mode = 'OBSERVATION'; // 40% chance to react to immediate surroundings
                specificInstruction = `React to the current situation. 
                - Player Health: ${Math.round(health)}/${maxHealth} (Is the hero bleeding?)
                - Time: ${timeOfDay} (Is it dark?)
                - Nearby Enemies: ${nearbyEnemies} (Are you scared?)
                - Player Weapon: ${isPlayerAggressive ? "Drawn" : "Sheathed"} (Why are they ready to fight?)`;
            } else {
                mode = 'TOWN_NEEDS'; // 30% chance for normal town gossip
                specificInstruction = "Discuss what the town needs (a school, a bakery, etc.) or gossip about other NPCs.";
            }

            // 3. Construct Prompt
            const prompt = `
            You are ${npcData.name}, a sentient NPC in a prototype game called 'Forest Guardian'.
            Role: ${npcData.role}
            Current Mode: ${mode}
            
            Context:
            - The player (a squirrel) is standing right in front of you.
            - You have a distinct personality based on your role.
            - Keep it under 35 words.
            - Make it feel like 'Dark Souls' meets 'Animal Crossing'. Cute but slightly unsettling or deep.
            
            Instruction: ${specificInstruction}
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
            });
            
            const text = response.text || "I... I forgot what I was saying.";
            setTownNPCDialogue(npcData.id, text);
        } catch (e: any) {
            console.error("Gemini Error:", e);
            let fallbackText = "I have a headache... (API Error)";
            if (JSON.stringify(e).includes("429") || e.status === 429) {
                fallbackText = "The gods have silenced me for now. (Quota Exceeded)";
            }
            setTownNPCDialogue(npcData.id, fallbackText);
        } finally {
            setTimeout(() => setIsThinking(false), 50);
        }
    };

    const isTalking = activeDialoguePartner === npcData.id;
    const isMoving = aiState.current === 'MOVING';
    const bodyColor = flash ? "#ff0000" : "#ffcc00";
    const npcOutfit = npcData.role === 'Mayor' ? 'MAYOR' : npcData.role === 'Nurse' ? 'NURSE' : 'NONE';
    
    // UI logic: If typing, show typewriter text. Otherwise, show AI response or fallback.
    const currentDisplayText = isTyping ? typedText : (npcData.aiResponse || npcData.dialogue[0]);

    return (
        <RigidBody ref={rb} position={npcData.position} type="dynamic" colliders={false} userData={{ type: 'TOWN_NPC', id: npcData.id }} enabledRotations={[false, true, false]} friction={0.5} linearDamping={1.0}>
            <CuboidCollider args={[0.5, 1.2, 0.5]} position={[0, 1, 0]} />
            
            <mesh position={[0, 1.2, 0]} onPointerDown={handleInteraction}>
                <boxGeometry args={[3.5, 4.5, 3.5]} />
                <meshBasicMaterial transparent opacity={0} />
            </mesh>

            <PikachuModel color={bodyColor} flash={flash} talking={isTalking} isWalking={isMoving} outfit={npcOutfit} />
            <HeartParticles active={showHearts} />
            
            {isInteractable && !isTalking && (
                <Html position={[0, 2.8, 0]} center>
                    <div className="pointer-events-none select-none px-3 py-1 bg-black/60 backdrop-blur-sm border border-yellow-400/30 text-yellow-300 text-[9px] font-black uppercase tracking-widest animate-pulse">
                        Tap or (▲) to Speak
                    </div>
                </Html>
            )}

            {isTalking && (
                <Html 
                    key={`${npcData.id}-${isThinking}-${npcData.aiResponse ? 'resp' : 'none'}`} // KEYED: Force re-render of overlay when generation starts/ends
                    position={[0, 3.8, 0]} 
                    center 
                    zIndexRange={[50, 0]}
                >
                    <div className="npc-dialogue-container" style={{ width: '320px' }}>
                        <div className="npc-name-tag">{npcData.name}</div>
                        <div className="npc-dialogue-bubble">
                            {isThinking ? (
                                <span>Whispering to the Code<span className="thinking-dots">...</span></span>
                            ) : (
                                <div>
                                    {currentDisplayText}
                                    {!isTyping && (
                                        <div className="mt-2 text-[6px] opacity-40 animate-pulse text-right">Tap again for more...</div>
                                    )}
                                </div>
                            )}
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

    return (
        <group>
            <Fountain position={[35, 0, 5]} />
            <PathNetwork />
            <TownProps />
            
            {buildings.map(b => (
                <Building key={b.id} data={b} playerRef={playerRef} />
            ))}

            {townNPCs.map(npc => (
                <TownNPC key={npc.id} data={npc} playerRef={playerRef} />
            ))}

            {townAnimals.map(animal => {
                const y = getTerrainHeight(animal.position[0], animal.position[2]);
                return (
                    <group key={animal.id} position={[animal.position[0], y, animal.position[2]]}>
                        <DogModel state="WANDER" />
                    </group>
                );
            })}

            {/* Extended Fence System */}
            <Fence controlPoints={[
                 [-25, 25], [20, 55], [60, 55], [90, 45], [100, 15]
             ]} />
             <Fence controlPoints={[
                 [-25, -15], [20, -45], [60, -45], [90, -35], [100, -5]
             ]} />
             
             {/* Moved Gates */}
             <GatePost position={[-25, 5]} />
             <GatePost position={[100, 5]} />
        </group>
    );
};
