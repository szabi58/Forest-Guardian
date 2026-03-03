
import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CuboidCollider } from '@react-three/rapier';
import { useGameStore } from '../store';
import { EnemyData } from '../types';
import * as THREE from 'three';

const ENEMY_SPEED = 2.5; 
const SEPARATION_DISTANCE = 3.5;
const FLANK_DISTANCE = 5.0;

// Spark effect when hit
const SparkBurst: React.FC<{ active: boolean; color: string }> = ({ active, color }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = 25;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo(() => {
    return Array.from({ length: count }).map(() => ({
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      ).normalize().multiplyScalar(Math.random() * 6 + 3),
      life: 1.0,
      scale: Math.random() * 0.2 + 0.1
    }));
  }, [active]);

  useFrame((state, delta) => {
    if (!meshRef.current || !active) return;
    particles.forEach((p, i) => {
      p.life -= delta * 4;
      p.pos.add(p.vel.clone().multiplyScalar(delta));
      p.vel.multiplyScalar(0.94);
      const s = Math.max(0, p.scale * p.life);
      dummy.position.copy(p.pos); dummy.scale.set(s, s, s); dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.material instanceof THREE.MeshStandardMaterial) {
        meshRef.current.material.opacity = Math.max(0, Math.min(1, particles[0].life));
    }
  });

  if (!active) return null;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 4, 4]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={20} transparent />
    </instancedMesh>
  );
};

const ExplodingChunks: React.FC<{ color: string; count?: number }> = ({ color, count = 12 }) => {
    const groupRef = useRef<THREE.Group>(null);
    const particles = useMemo(() => Array.from({ length: count }).map(() => ({
        pos: new THREE.Vector3((Math.random()-0.5)*0.5, (Math.random()-0.5)*0.5, (Math.random()-0.5)*0.5),
        vel: new THREE.Vector3((Math.random()-0.5)*12, Math.random()*12 + 5, (Math.random()-0.5)*12),
        rot: new THREE.Vector3(Math.random(), Math.random(), Math.random()),
        rotVel: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(5),
        scale: Math.random() * 0.4 + 0.2
    })), [count]);

    useFrame((state, delta) => {
        if (!groupRef.current) return;
        groupRef.current.children.forEach((child, i) => {
            const p = particles[i];
            p.vel.y -= 25 * delta; // Gravity
            p.pos.add(p.vel.clone().multiplyScalar(delta));
            
            // Simple ground collision
            if (p.pos.y < -0.5) {
                p.pos.y = -0.5;
                p.vel.y *= -0.5; // Bounce
                p.vel.x *= 0.8; // Friction
                p.vel.z *= 0.8;
            }

            child.position.copy(p.pos);
            child.rotation.x += p.rotVel.x * delta;
            child.rotation.y += p.rotVel.y * delta;
            child.rotation.z += p.rotVel.z * delta;
        });
    });

    return (
        <group ref={groupRef} position={[0, 1, 0]}>
            {particles.map((p, i) => (
                <mesh key={i} position={p.pos} scale={[p.scale, p.scale, p.scale]} castShadow>
                    <dodecahedronGeometry args={[1, 0]} />
                    <meshStandardMaterial color={color} roughness={0.8} />
                </mesh>
            ))}
        </group>
    )
}

// Visual effect for enemies killed by sword - splits them in half
const DeadSplitModel: React.FC<{ isDead: boolean; killedBySword: boolean; children: React.ReactNode; yOffset?: number; }> = ({ isDead, killedBySword, children, yOffset = 0 }) => {
    const leftGroupRef = useRef<THREE.Group>(null);
    const rightGroupRef = useRef<THREE.Group>(null);
    const splitProgress = useRef(0);
    const { gl } = useThree();
    useEffect(() => { gl.localClippingEnabled = true; }, [gl]);
    const leftClipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(1, 0, 0), 0), []);
    const rightClipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), []);

    useFrame((state, delta) => {
        if (!isDead || !killedBySword) return;
        if (splitProgress.current < 1) {
            splitProgress.current += delta * 2;
            const p = Math.min(splitProgress.current, 1);
            const ease = 1 - Math.pow(1 - p, 3);
            if (leftGroupRef.current) { leftGroupRef.current.position.x = -ease * 1.5; leftGroupRef.current.rotation.z = ease * (Math.PI / 2); leftGroupRef.current.position.y = -ease * 1.0; }
            if (rightGroupRef.current) { rightGroupRef.current.position.x = ease * 1.5; rightGroupRef.current.rotation.z = -ease * (Math.PI / 2); rightGroupRef.current.position.y = -ease * 1.0; }
        }
    });

    const applyClipping = (node: any, plane: THREE.Plane) => {
        if (node.type === 'Mesh' && node.material) {
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            materials.forEach((mat: THREE.Material) => { mat.clippingPlanes = [plane]; mat.clipShadows = true; mat.needsUpdate = true; });
        }
        if (node.children) { node.children.forEach((child: any) => applyClipping(child, plane)); }
    };

    if (!isDead || !killedBySword) { return <>{children}</>; }
    return (
        <group position={[0, yOffset, 0]}>
            <group ref={leftGroupRef} onAfterRender={() => applyClipping(leftGroupRef.current, leftClipPlane)}>{children}</group>
            <group ref={rightGroupRef} onAfterRender={() => applyClipping(rightGroupRef.current, rightClipPlane)}>{children}</group>
        </group>
    );
};

interface HitReactionProps { flash: boolean; hitType: 'MELEE' | 'FIREBALL' | null; hitProgress: number; isTrex?: boolean; }

const SlimeModel: React.FC<HitReactionProps> = ({ flash, hitType, hitProgress }) => {
  const groupRef = useRef<THREE.Group>(null);
  const isHitStopping = useGameStore(s => s.isHitStopping);
  useFrame((state) => {
    if (isHitStopping) return;
    const t = state.clock.elapsedTime;
    let scaleX = 1 + Math.sin(t * 2) * 0.05, scaleY = scaleX, scaleZ = scaleX;
    if (hitType === 'MELEE') { const squash = Math.sin(hitProgress * Math.PI) * 0.6; scaleY -= squash; scaleX += squash * 0.3; scaleZ += squash * 0.3; }
    else if (hitType === 'FIREBALL') { const expand = Math.sin(hitProgress * Math.PI) * 0.3; scaleX += expand; scaleY += expand; scaleZ += expand; }
    if (groupRef.current) groupRef.current.scale.set(scaleX, scaleY, scaleZ);
  });
  
  const bodyColor = flash ? "#ff0000" : (hitType === 'FIREBALL' ? "#d32f2f" : "#2e7d32");
  
  return (
    <group ref={groupRef} position={[0, 1.2, 0]} scale={[1.2, 1.2, 1.2]}>
      <mesh castShadow>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color={bodyColor} emissive={flash ? "#ff0000" : "#000000"} emissiveIntensity={flash ? 3 : 0} roughness={0.4} transparent opacity={flash ? 1 : 0.7} />
      </mesh>
      <mesh position={[0, 0, 0]} scale={[0.6, 0.6, 0.6]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial color={bodyColor} emissive={flash ? "#ff0000" : bodyColor} emissiveIntensity={flash ? 3 : 0.5} />
      </mesh>
    </group>
  );
};

const TrexModel: React.FC<HitReactionProps & { isMoving: boolean }> = ({ isMoving, flash, hitType, hitProgress }) => {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const jawRef = useRef<THREE.Mesh>(null);
  const tailRef = useRef<THREE.Mesh>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    
    // Idle Animation
    if (headRef.current) headRef.current.rotation.z = Math.sin(t * 1.5) * 0.05;
    if (tailRef.current) tailRef.current.rotation.y = Math.cos(t * 1.5) * 0.1;
    if (jawRef.current) jawRef.current.rotation.x = 0.2 + Math.sin(t * 3) * 0.05;

    // Movement Animation
    if (isMoving) {
        if (groupRef.current) groupRef.current.position.y = Math.abs(Math.sin(t * 6)) * 0.2;
        if (leftLegRef.current) leftLegRef.current.rotation.x = Math.sin(t * 6) * 0.5;
        if (rightLegRef.current) rightLegRef.current.rotation.x = Math.cos(t * 6) * 0.5;
    } else {
        if (groupRef.current) groupRef.current.position.y = 0;
        if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
        if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
    }

    // Hit Reaction
    if (hitType && groupRef.current) {
         groupRef.current.rotation.z = (Math.random() - 0.5) * 0.2 * hitProgress;
    } else if (groupRef.current) {
         groupRef.current.rotation.z = 0;
    }
  });

  const skinColor = flash ? "#ff0000" : "#3e2723"; // Dark brown

  return (
    <group ref={groupRef} scale={[1.8, 1.8, 1.8]}>
        {/* Body */}
        <mesh position={[0, 1.4, 0]} castShadow>
            <boxGeometry args={[1.0, 1.2, 2.2]} />
            <meshStandardMaterial color={skinColor} roughness={0.8} />
        </mesh>

        {/* Tail */}
        <mesh ref={tailRef} position={[0, 1.4, -1.6]} rotation={[-0.2, 0, 0]} castShadow>
            <coneGeometry args={[0.4, 1.5, 8]} rotation={[-Math.PI/2, 0, 0]} />
            <meshStandardMaterial color={skinColor} roughness={0.8} />
        </mesh>

        {/* Neck & Head */}
        <group ref={headRef} position={[0, 1.8, 1.2]}>
            <mesh position={[0, 0.4, 0.4]} castShadow>
                <boxGeometry args={[0.7, 0.8, 1.0]} />
                <meshStandardMaterial color={skinColor} roughness={0.8} />
            </mesh>
            {/* Jaw */}
            <mesh ref={jawRef} position={[0, 0.1, 0.4]} rotation={[0.2, 0, 0]}>
                 <boxGeometry args={[0.5, 0.2, 0.8]} />
                 <meshStandardMaterial color="#2d1b15" />
            </mesh>
            {/* Eyes */}
            <mesh position={[-0.25, 0.6, 0.7]}><boxGeometry args={[0.1, 0.1, 0.1]} /><meshStandardMaterial color="#ffcc00" emissive="#ff0000" emissiveIntensity={0.5} /></mesh>
            <mesh position={[0.25, 0.6, 0.7]}><boxGeometry args={[0.1, 0.1, 0.1]} /><meshStandardMaterial color="#ffcc00" emissive="#ff0000" emissiveIntensity={0.5} /></mesh>
        </group>

        {/* Tiny Arms */}
        <mesh position={[-0.4, 1.6, 0.8]} rotation={[0.5, 0.2, 0]}><boxGeometry args={[0.15, 0.4, 0.15]} /><meshStandardMaterial color={skinColor} /></mesh>
        <mesh position={[0.4, 1.6, 0.8]} rotation={[0.5, -0.2, 0]}><boxGeometry args={[0.15, 0.4, 0.15]} /><meshStandardMaterial color={skinColor} /></mesh>

        {/* Legs */}
        <group ref={leftLegRef} position={[-0.4, 0.8, 0]}>
            <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 1.0, 0.4]} /><meshStandardMaterial color={skinColor} />
            </mesh>
            <mesh position={[0, -0.9, 0.1]}><boxGeometry args={[0.4, 0.2, 0.6]} /><meshStandardMaterial color="#1a110d" /></mesh>
        </group>
        <group ref={rightLegRef} position={[0.4, 0.8, 0]}>
            <mesh position={[0, -0.4, 0]}><boxGeometry args={[0.35, 1.0, 0.4]} /><meshStandardMaterial color={skinColor} />
            </mesh>
             <mesh position={[0, -0.9, 0.1]}><boxGeometry args={[0.4, 0.2, 0.6]} /><meshStandardMaterial color="#1a110d" /></mesh>
        </group>
    </group>
  );
};

const RabbitModel: React.FC<HitReactionProps & { isMoving: boolean }> = ({ isMoving, flash, hitType, hitProgress }) => {
  const groupRef = useRef<THREE.Group>(null);
  const feetRef = useRef<THREE.Group>(null);
  const isHitStopping = useGameStore(s => s.isHitStopping);

  useFrame((state) => {
    if (isHitStopping) return;
    const t = state.clock.getElapsedTime();
    let targetXRot = 0;
    if (isMoving) { 
        if (groupRef.current) groupRef.current.position.y = Math.abs(Math.sin(t * 10)) * 0.8; 
        targetXRot = Math.sin(t * 10) * 0.2; 
        if (feetRef.current) {
            feetRef.current.children.forEach((foot, i) => {
                const offset = i * Math.PI * 0.5;
                foot.position.y = -0.4 + Math.sin(t * 10 + offset) * 0.1;
                foot.rotation.x = Math.sin(t * 10 + offset) * 0.3;
            });
        }
    } else {
        if (groupRef.current) groupRef.current.position.y = 0;
        if (feetRef.current) {
            feetRef.current.children.forEach((foot) => {
                foot.position.y = -0.5;
                foot.rotation.x = 0;
            });
        }
    }

    if (hitType === 'MELEE') { 
      targetXRot -= Math.sin(hitProgress * Math.PI) * 1.5; 
      if (groupRef.current) groupRef.current.position.z -= Math.sin(hitProgress * Math.PI) * 0.5;
    }
    if (groupRef.current) groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetXRot, 0.2);
  });

  const furColor = flash ? "#ff0000" : (hitType === 'FIREBALL' ? "#3e2723" : "#b68c5e");
  return (
    <group ref={groupRef} scale={[0.8, 0.8, 0.8]} position={[0, 0.5, 0]}>
      <mesh castShadow><sphereGeometry args={[0.7, 16, 16]} /><meshToonMaterial color={furColor} /></mesh>
      <group position={[0, 0.6, 0.35]}>
          <mesh position={[-0.2, 0, 0]} rotation={[0.4, 0, 0]}><capsuleGeometry args={[0.1, 0.4, 4, 8]} /><meshToonMaterial color={furColor} /></mesh>
          <mesh position={[0.2, 0, 0]} rotation={[0.4, 0, 0]}><capsuleGeometry args={[0.1, 0.4, 4, 8]} /><meshToonMaterial color={furColor} /></mesh>
      </group>
      <group position={[0, 0.2, 0.6]}>
          <mesh position={[-0.2, 0, 0]}><sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#000" /></mesh>
          <mesh position={[0.2, 0, 0]}><sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#000" /></mesh>
      </group>
      <group ref={feetRef}>
          <mesh position={[-0.3, -0.5, 0.2]}><sphereGeometry args={[0.15, 8, 8]} /><meshToonMaterial color={furColor} /></mesh>
          <mesh position={[0.3, -0.5, 0.2]}><sphereGeometry args={[0.15, 8, 8]} /><meshToonMaterial color={furColor} /></mesh>
          <mesh position={[-0.3, -0.5, -0.2]}><sphereGeometry args={[0.15, 8, 8]} /><meshToonMaterial color={furColor} /></mesh>
          <mesh position={[0.3, -0.5, -0.2]}><sphereGeometry args={[0.15, 8, 8]} /><meshToonMaterial color={furColor} /></mesh>
      </group>
    </group>
  );
};

// Individual NPC logic and controller
const NPC: React.FC<{ data: EnemyData; playerRef: React.RefObject<THREE.Object3D> }> = ({ data, playerRef }) => {
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const [flash, setFlash] = useState(false);
  const [hitType, setHitType] = useState<'MELEE' | 'FIREBALL' | null>(null);
  const [hitProgress, setHitProgress] = useState(0);
  const lastHp = useRef(data.hp);
  const lastAttackTime = useRef(0);
  const { damagePlayer, updateEnemyPosition } = useGameStore();
  const [isMoving, setIsMoving] = useState(false);
  const tempVec = useMemo(() => new THREE.Vector3(), []);
  const playerWorldPos = useMemo(() => new THREE.Vector3(), []);

  // OBSERVE HEALTH CHANGES
  useEffect(() => {
    if (data.hp < lastHp.current) {
      setFlash(true);
      setHitProgress(1);
      setHitType(data.killedBySword ? 'MELEE' : 'FIREBALL');
      setTimeout(() => setFlash(false), 120);
      lastHp.current = data.hp;
    }
  }, [data.hp, data.killedBySword]);

  useFrame((state, delta) => {
    if (hitProgress > 0) {
      setHitProgress(Math.max(0, hitProgress - delta * 4));
    }
    if (hitProgress === 0) setHitType(null);

    if (!rigidBodyRef.current || data.isDead || !playerRef.current) return;

    const rb = rigidBodyRef.current;
    const pos = rb.translation();
    
    // CRITICAL FIX: Sync position back to store so the sword messenger can find it
    if (state.clock.elapsedTime % 0.1 < 0.02) {
        updateEnemyPosition(data.id, [pos.x, pos.y, pos.z]);
    }

    playerRef.current.getWorldPosition(playerWorldPos);
    
    const dist = Math.sqrt((pos.x - playerWorldPos.x) ** 2 + (pos.z - playerWorldPos.z) ** 2);
    const dir = tempVec.set(playerWorldPos.x - pos.x, 0, playerWorldPos.z - pos.z).normalize();
    
    // Trex has much larger aggro range
    const aggroRange = data.type === 'TREX' ? 120 : 45;
    
    if (dist < aggroRange && dist > 1.8) {
      const speed = data.type === 'TREX' ? ENEMY_SPEED * 1.6 : ENEMY_SPEED;
      rb.setLinvel({ x: dir.x * speed, y: rb.linvel().y, z: dir.z * speed }, true);
      const angle = Math.atan2(dir.x, dir.z);
      rb.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle), true);
      setIsMoving(true);
    } else {
      rb.setLinvel({ x: 0, y: rb.linvel().y, z: 0 }, true);
      setIsMoving(false);
    }

    const now = state.clock.elapsedTime;
    if (dist < 3.5 && now - lastAttackTime.current > 1.5) {
      lastAttackTime.current = now;
      damagePlayer(data.type === 'TREX' ? 30 : 8);
    }
  });

  const getBaseColor = (type: string) => {
      switch(type) {
          case 'SLIME': return '#2e7d32';
          case 'RABBIT': case 'DEER': return '#b68c5e';
          case 'TREX': return '#3e2723';
          default: return '#555555';
      }
  };

  if (data.isDead && data.killedByKamehameha) {
      return (
        <RigidBody position={data.position} colliders={false}>
            <ExplodingChunks color={getBaseColor(data.type)} count={data.type === 'TREX' ? 25 : 12} />
        </RigidBody>
      );
  }

  const renderModel = () => {
    const props = { flash, hitType, hitProgress, isMoving };
    switch (data.type) {
      case 'RABBIT': return <RabbitModel {...props} />;
      case 'SLIME': return <SlimeModel {...props} flash={flash} hitType={hitType} hitProgress={hitProgress} />;
      case 'TREX': return <TrexModel {...props} />;
      case 'DEER': return <RabbitModel {...props} />; 
      default: return <SlimeModel flash={flash} hitType={hitType} hitProgress={hitProgress} />;
    }
  };

  return (
    <RigidBody 
      ref={rigidBodyRef} 
      position={data.position} 
      colliders={false} 
      userData={{ type: 'ENEMY', id: data.id }}
      enabledRotations={[false, true, false]}
    >
      {!data.isDead && <CuboidCollider args={[data.type === 'TREX' ? 1.5 : 0.5, 1, data.type === 'TREX' ? 1.5 : 0.5]} position={[0, 1, 0]} />}
      <DeadSplitModel isDead={!!data.isDead} killedBySword={!!data.killedBySword}>
        {renderModel()}
      </DeadSplitModel>
      <SparkBurst active={flash} color={hitType === 'FIREBALL' ? "#ffdd00" : "#ffffff"} />
    </RigidBody>
  );
};

const TrexManager: React.FC = () => {
    const enemies = useGameStore(s => s.enemies);
    const spawnTrex = useGameStore(s => s.spawnTrex);
    const lastCheckTime = useRef(0);

    useFrame((state) => {
        if (state.clock.elapsedTime - lastCheckTime.current > 5) {
            lastCheckTime.current = state.clock.elapsedTime;
            const aliveTrexs = enemies.filter(e => e.type === 'TREX' && !e.isDead).length;
            if (aliveTrexs < 2) {
                spawnTrex();
            }
        }
    });

    return null;
};

export const NPCSystem: React.FC<{ playerRef: React.RefObject<THREE.Object3D> }> = ({ playerRef }) => {
  const enemies = useGameStore(s => s.enemies);
  return (
    <>
      <TrexManager />
      {enemies.map(enemy => (
        <NPC key={enemy.id} data={enemy} playerRef={playerRef} />
      ))}
    </>
  );
};
