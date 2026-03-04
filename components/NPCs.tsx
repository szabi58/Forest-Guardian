
import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CuboidCollider } from '@react-three/rapier';
import { useGameStore, getEnemyPositionClampedOutsideTown } from '../store';
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

// Visual effect for enemies killed by sword - splits them in half (skipped for TREX so they lay static)
const DeadSplitModel: React.FC<{ isDead: boolean; killedBySword: boolean; noSplit?: boolean; children: React.ReactNode; yOffset?: number; }> = ({ isDead, killedBySword, noSplit, children, yOffset = 0 }) => {
    const leftGroupRef = useRef<THREE.Group>(null);
    const rightGroupRef = useRef<THREE.Group>(null);
    const splitProgress = useRef(0);
    const { gl } = useThree();
    useEffect(() => { gl.localClippingEnabled = true; }, [gl]);
    const leftClipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(1, 0, 0), 0), []);
    const rightClipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), []);

    useFrame((state, delta) => {
        if (!isDead || !killedBySword || noSplit) return;
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

    if (!isDead || !killedBySword || noSplit) { return <>{children}</>; }
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

const WALK_LEG_SPEED = 5;
const WALK_BOB_HEIGHT = 0.15;
const TAIL_SWING_AMP = 0.4;
const JAW_REST = 0.55;
const JAW_OPEN = 0.95;
const BITE_DURATION = 0.45;

const TrexModel: React.FC<HitReactionProps & { isMoving: boolean; isAttacking?: boolean; isDead?: boolean }> = ({ isMoving, isAttacking = false, isDead = false, flash, hitType, hitProgress }) => {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const jawRef = useRef<THREE.Mesh>(null);
  const tailRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const attackStartTime = useRef(0);
  const prevAttacking = useRef(false);

  useFrame((state) => {
    if (isDead) return;

    const t = state.clock.elapsedTime;
    const delta = state.clock.getDelta();

    if (isAttacking && !prevAttacking.current) attackStartTime.current = t;
    prevAttacking.current = isAttacking;

    // Idle head sway
    if (headRef.current) headRef.current.rotation.z = Math.sin(t * 1.2) * 0.04;

    // Tail: swing when walking, subtle sway when idle
    if (tailRef.current) {
      if (isMoving) {
        tailRef.current.rotation.y = Math.sin(t * WALK_LEG_SPEED) * TAIL_SWING_AMP;
      } else {
        tailRef.current.rotation.y = Math.sin(t * 1.5) * 0.08;
      }
    }

    // Jaw: open/close during attack, else idle
    if (jawRef.current) {
      if (isAttacking) {
        const elapsed = t - attackStartTime.current;
        const p = Math.min(1, elapsed / BITE_DURATION);
        const openPhase = 0.35;
        let jawX: number;
        if (p < openPhase) {
          jawX = JAW_REST + (p / openPhase) * (JAW_OPEN - JAW_REST);
        } else {
          jawX = JAW_OPEN - ((p - openPhase) / (1 - openPhase)) * (JAW_OPEN - JAW_REST);
        }
        jawRef.current.rotation.x = jawX;
      } else {
        jawRef.current.rotation.x = JAW_REST + Math.sin(t * 2.5) * 0.04;
      }
    }

    // Walking: body bob + alternating legs
    if (isMoving) {
      if (groupRef.current) groupRef.current.position.y = Math.abs(Math.sin(t * WALK_LEG_SPEED)) * WALK_BOB_HEIGHT;
      if (leftLegRef.current) leftLegRef.current.rotation.x = Math.sin(t * WALK_LEG_SPEED) * 0.45;
      if (rightLegRef.current) rightLegRef.current.rotation.x = Math.cos(t * WALK_LEG_SPEED) * 0.45;
    } else {
      if (groupRef.current) groupRef.current.position.y = 0;
      if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
    }

    if (hitType && groupRef.current) {
      groupRef.current.rotation.z = (Math.random() - 0.5) * 0.2 * hitProgress;
    } else if (groupRef.current) {
      groupRef.current.rotation.z = 0;
    }
  });

  const skinColor = flash ? "#ff0000" : "#3d5c2e";
  const bellyColor = flash ? "#ff4444" : "#8b9b7a";
  const mat = { color: skinColor, roughness: 0.85 };
  const bellyMat = { color: bellyColor, roughness: 0.9, side: THREE.DoubleSide as THREE.Side };
  const clawMat = { color: "#f5f5f0" };
  const toothMat = { color: "#f5f5f0" };

  return (
    <group ref={groupRef} scale={[1.8, 1.8, 1.8]}>
        {/* Body - chest and hip as boxes with angled planes for mass */}
        <mesh position={[0, 1.5, 0.35]} castShadow>
            <boxGeometry args={[1.05, 1.0, 1.15]} />
            <meshStandardMaterial {...mat} />
        </mesh>
        <mesh position={[0, 1.38, -0.55]} castShadow>
            <boxGeometry args={[1.0, 1.05, 1.0]} />
            <meshStandardMaterial {...mat} />
        </mesh>
        {/* Belly - flat angled plane for underside */}
        <mesh position={[0, 1.08, 0]} rotation={[0.2, 0, 0]} castShadow>
            <planeGeometry args={[0.9, 2.1]} />
            <meshStandardMaterial {...bellyMat} />
        </mesh>

        {/* Tail - tapered boxes + one cone for tip */}
        <group ref={tailRef} position={[0, 1.4, -1.05]} rotation={[-0.12, 0, 0]}>
            <mesh position={[0, 0, -0.3]} castShadow>
                <boxGeometry args={[0.7, 0.75, 0.65]} />
                <meshStandardMaterial {...mat} />
            </mesh>
            <mesh position={[0, 0, -0.7]} castShadow>
                <boxGeometry args={[0.55, 0.6, 0.55]} />
                <meshStandardMaterial {...mat} />
            </mesh>
            <mesh position={[0, 0, -1.05]} castShadow>
                <boxGeometry args={[0.4, 0.45, 0.5]} />
                <meshStandardMaterial {...mat} />
            </mesh>
            <mesh position={[0, 0, -1.4]} castShadow>
                <coneGeometry args={[0.22, 0.5, 4]} />
                <meshStandardMaterial {...mat} />
            </mesh>
        </group>

        {/* Neck - two box segments */}
        <group ref={headRef} position={[0, 1.78, 1.1]}>
            <mesh position={[0, 0.12, 0.08]} rotation={[0.22, 0, 0]} castShadow>
                <boxGeometry args={[0.6, 0.5, 0.5]} />
                <meshStandardMaterial {...mat} />
            </mesh>
            <mesh position={[0, 0.32, 0.38]} rotation={[0.18, 0, 0]} castShadow>
                <boxGeometry args={[0.55, 0.45, 0.48]} />
                <meshStandardMaterial {...mat} />
            </mesh>

            {/* Head - skull and snout boxes */}
            <mesh position={[0, 0.52, 0.68]} castShadow>
                <boxGeometry args={[0.62, 0.6, 0.58]} />
                <meshStandardMaterial {...mat} />
            </mesh>
            <mesh position={[0, 0.4, 0.95]} rotation={[0.06, 0, 0]} castShadow>
                <boxGeometry args={[0.48, 0.38, 0.5]} />
                <meshStandardMaterial {...mat} />
            </mesh>
            <mesh position={[0, 0.26, 1.12]} rotation={[0.04, 0, 0]} castShadow>
                <boxGeometry args={[0.32, 0.28, 0.32]} />
                <meshStandardMaterial {...mat} />
            </mesh>
            {/* Brow ridges */}
            <mesh position={[-0.28, 0.62, 0.8]} rotation={[0, 0, Math.PI / 6]}>
                <boxGeometry args={[0.14, 0.1, 0.26]} />
                <meshStandardMaterial {...mat} />
            </mesh>
            <mesh position={[0.28, 0.62, 0.8]} rotation={[0, 0, -Math.PI / 6]}>
                <boxGeometry args={[0.14, 0.1, 0.26]} />
                <meshStandardMaterial {...mat} />
            </mesh>
            {/* Upper teeth - cones only for teeth */}
            {[-0.18, -0.09, 0, 0.09, 0.18].map((x, i) => (
                <mesh key={i} position={[x, 0.04, 1.24]} rotation={[0.1, 0, 0]}>
                    <coneGeometry args={[0.032, 0.1, 4]} />
                    <meshStandardMaterial {...toothMat} />
                </mesh>
            ))}
            {/* Lower jaw - two boxes */}
            <mesh ref={jawRef} position={[0, -0.02, 0.52]} rotation={[0.55, 0, 0]} castShadow>
                <boxGeometry args={[0.48, 0.2, 0.6]} />
                <meshStandardMaterial {...mat} />
            </mesh>
            <mesh position={[0, -0.1, 0.8]} rotation={[0.5, 0, 0]} castShadow>
                <boxGeometry args={[0.28, 0.14, 0.38]} />
                <meshStandardMaterial {...mat} />
            </mesh>
            {/* Lower teeth */}
            {[-0.16, -0.08, 0, 0.08, 0.16].map((x, i) => (
                <mesh key={`l${i}`} position={[x, -0.2, 0.82]} rotation={[Math.PI - 0.32, 0, 0]}>
                    <coneGeometry args={[0.028, 0.07, 4]} />
                    <meshStandardMaterial {...toothMat} />
                </mesh>
            ))}
            {/* Tongue */}
            <mesh position={[0, 0.02, 0.78]} rotation={[0.28, 0, 0]}>
                <boxGeometry args={[0.18, 0.06, 0.36]} />
                <meshStandardMaterial color="#d46a6a" roughness={0.7} />
            </mesh>
            {/* Drool - thin boxes */}
            <mesh position={[0.1, 0.08, 1.1]} rotation={[0.5, 0, 0]}>
                <boxGeometry args={[0.02, 0.14, 0.02]} />
                <meshStandardMaterial color="#e8e8e0" transparent opacity={0.9} />
            </mesh>
            <mesh position={[-0.1, 0.08, 1.08]} rotation={[0.5, 0, 0]}>
                <boxGeometry args={[0.02, 0.12, 0.02]} />
                <meshStandardMaterial color="#e8e8e0" transparent opacity={0.9} />
            </mesh>
            {/* Eyes - boxes for glowing red */}
            <mesh position={[-0.22, 0.5, 0.92]}>
                <boxGeometry args={[0.12, 0.12, 0.1]} />
                <meshStandardMaterial color="#ff2222" emissive="#cc0000" emissiveIntensity={2} />
            </mesh>
            <mesh position={[0.22, 0.5, 0.92]}>
                <boxGeometry args={[0.12, 0.12, 0.1]} />
                <meshStandardMaterial color="#ff2222" emissive="#cc0000" emissiveIntensity={2} />
            </mesh>
        </group>

        {/* Arms - box + two claw boxes */}
        <group position={[-0.42, 1.58, 0.72]} rotation={[0.5, 0.2, 0]}>
            <mesh><boxGeometry args={[0.16, 0.32, 0.16]} /><meshStandardMaterial {...mat} /></mesh>
            <mesh position={[0.04, -0.2, 0.04]}><boxGeometry args={[0.06, 0.08, 0.05]} /><meshStandardMaterial {...clawMat} /></mesh>
            <mesh position={[-0.04, -0.22, 0.04]}><boxGeometry args={[0.05, 0.07, 0.05]} /><meshStandardMaterial {...clawMat} /></mesh>
        </group>
        <group position={[0.42, 1.58, 0.72]} rotation={[0.5, -0.2, 0]}>
            <mesh><boxGeometry args={[0.16, 0.32, 0.16]} /><meshStandardMaterial {...mat} /></mesh>
            <mesh position={[-0.04, -0.2, 0.04]}><boxGeometry args={[0.06, 0.08, 0.05]} /><meshStandardMaterial {...clawMat} /></mesh>
            <mesh position={[0.04, -0.22, 0.04]}><boxGeometry args={[0.05, 0.07, 0.05]} /><meshStandardMaterial {...clawMat} /></mesh>
        </group>

        {/* Legs - thigh, calf, foot, toes as boxes */}
        <group ref={leftLegRef} position={[-0.42, 0.82, 0]}>
            <mesh position={[0, -0.38, 0]}><boxGeometry args={[0.38, 0.75, 0.4]} /><meshStandardMaterial {...mat} /></mesh>
            <mesh position={[0, -0.78, 0.06]}><boxGeometry args={[0.32, 0.52, 0.36]} /><meshStandardMaterial {...mat} /></mesh>
            <mesh position={[0, -1.04, 0.18]} rotation={[0.12, 0, 0]}><boxGeometry args={[0.3, 0.12, 0.48]} /><meshStandardMaterial {...mat} /></mesh>
            <mesh position={[-0.11, -1.08, 0.24]} rotation={[0.18, 0, 0]}><boxGeometry args={[0.08, 0.1, 0.16]} /><meshStandardMaterial {...clawMat} /></mesh>
            <mesh position={[0, -1.08, 0.26]} rotation={[0.18, 0, 0]}><boxGeometry args={[0.08, 0.1, 0.18]} /><meshStandardMaterial {...clawMat} /></mesh>
            <mesh position={[0.11, -1.08, 0.24]} rotation={[0.18, 0, 0]}><boxGeometry args={[0.08, 0.1, 0.16]} /><meshStandardMaterial {...clawMat} /></mesh>
            <mesh position={[0.18, -1.06, 0.12]} rotation={[0.12, 0, -0.15]}><boxGeometry args={[0.06, 0.08, 0.12]} /><meshStandardMaterial {...clawMat} /></mesh>
        </group>
        <group ref={rightLegRef} position={[0.42, 0.82, 0]}>
            <mesh position={[0, -0.38, 0]}><boxGeometry args={[0.38, 0.75, 0.4]} /><meshStandardMaterial {...mat} /></mesh>
            <mesh position={[0, -0.78, 0.06]}><boxGeometry args={[0.32, 0.52, 0.36]} /><meshStandardMaterial {...mat} /></mesh>
            <mesh position={[0, -1.04, 0.18]} rotation={[0.12, 0, 0]}><boxGeometry args={[0.3, 0.12, 0.48]} /><meshStandardMaterial {...mat} /></mesh>
            <mesh position={[-0.11, -1.08, 0.24]} rotation={[0.18, 0, 0]}><boxGeometry args={[0.08, 0.1, 0.16]} /><meshStandardMaterial {...clawMat} /></mesh>
            <mesh position={[0, -1.08, 0.26]} rotation={[0.18, 0, 0]}><boxGeometry args={[0.08, 0.1, 0.18]} /><meshStandardMaterial {...clawMat} /></mesh>
            <mesh position={[0.11, -1.08, 0.24]} rotation={[0.18, 0, 0]}><boxGeometry args={[0.08, 0.1, 0.16]} /><meshStandardMaterial {...clawMat} /></mesh>
            <mesh position={[0.18, -1.06, 0.12]} rotation={[0.12, 0, -0.15]}><boxGeometry args={[0.06, 0.08, 0.12]} /><meshStandardMaterial {...clawMat} /></mesh>
        </group>
    </group>
  );
};

const RabbitModel: React.FC<HitReactionProps & { isMoving: boolean }> = ({ isMoving, flash, hitType, hitProgress }) => {
  const groupRef = useRef<THREE.Group>(null);
  const feetRef = useRef<THREE.Group>(null);
  const earsRef = useRef<THREE.Group>(null);
  const isHitStopping = useGameStore(s => s.isHitStopping);

  useFrame((state) => {
    if (isHitStopping) return;
    const t = state.clock.getElapsedTime();
    let targetXRot = 0;
    if (isMoving) {
        const hopPhase = t * 6;
        const hopUp = Math.max(0, Math.sin(hopPhase));
        if (groupRef.current) {
            groupRef.current.position.y = hopUp * 0.18;
            groupRef.current.rotation.x = -hopUp * 0.15;
        }
        if (feetRef.current) {
            feetRef.current.children.forEach((foot, i) => {
                const offset = i * (Math.PI * 0.5);
                const step = Math.sin(hopPhase + offset) * 0.5 + 0.5;
                (foot as THREE.Mesh).position.y = -0.42 + step * 0.1;
                (foot as THREE.Mesh).rotation.x = (step - 0.5) * 0.4;
            });
        }
        if (earsRef.current) earsRef.current.rotation.z = Math.sin(t * 6) * 0.04;
    } else {
        if (groupRef.current) {
            groupRef.current.position.y = 0;
            groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, 0.15);
        }
        if (feetRef.current) {
            feetRef.current.children.forEach((foot) => {
                (foot as THREE.Mesh).position.y = -0.44;
                (foot as THREE.Mesh).rotation.x = 0;
            });
        }
        if (earsRef.current) earsRef.current.rotation.z = 0;
    }
    if (hitType === 'MELEE') {
      targetXRot -= Math.sin(hitProgress * Math.PI) * 1.2;
      if (groupRef.current) groupRef.current.position.z -= Math.sin(hitProgress * Math.PI) * 0.35;
    }
    if (groupRef.current && !isMoving) groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetXRot, 0.2);
  });

  const fur = flash ? '#ff4444' : (hitType === 'FIREBALL' ? '#3e2723' : '#b8956e');
  const belly = flash ? '#ff8888' : '#f8f4ee';
  const earIn = flash ? '#ffaaaa' : '#e0c8b0';
  const mat = (c: string) => <meshStandardMaterial color={c} roughness={0.88} metalness={0} />;

  return (
    <group ref={groupRef} scale={[1, 1, 1]} position={[0, 0.45, 0]}>
      {/* Body — oval-ish (slightly squashed sphere), lower mass */}
      <mesh position={[0, -0.05, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.42, 16, 14]} />
        {mat(fur)}
      </mesh>
      {/* Belly patch — front of body */}
      <mesh position={[0, -0.08, 0.38]} castShadow>
        <sphereGeometry args={[0.3, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        <meshStandardMaterial color={belly} roughness={0.9} side={THREE.FrontSide} />
      </mesh>
      {/* Tail — fluffy ball at back */}
      <mesh position={[0, 0.08, -0.4]} castShadow>
        <sphereGeometry args={[0.14, 10, 8]} />
        <meshStandardMaterial color={belly} roughness={0.9} />
      </mesh>

      {/* Head — distinct round head in front and above body */}
      <group position={[0, 0.32, 0.28]}>
        <mesh castShadow>
          <sphereGeometry args={[0.32, 16, 14]} />
          {mat(fur)}
        </mesh>
        {/* Snout — small rounded bump for nose/mouth area */}
        <mesh position={[0, 0, 0.3]} castShadow>
          <sphereGeometry args={[0.12, 10, 8]} />
          {mat(fur)}
        </mesh>
        {/* Nose */}
        <mesh position={[0, 0.02, 0.4]}>
          <sphereGeometry args={[0.055, 8, 6]} />
          <meshStandardMaterial color="#d49090" roughness={0.7} />
        </mesh>

        {/* Eyes — on the head, front-facing */}
        <mesh position={[-0.12, 0.08, 0.28]}><sphereGeometry args={[0.08, 10, 8]} /><meshStandardMaterial color="#1a120c" roughness={0.4} /></mesh>
        <mesh position={[-0.09, 0.11, 0.34]}><sphereGeometry args={[0.025, 6, 4]} /><meshStandardMaterial color="#fff" /></mesh>
        <mesh position={[0.12, 0.08, 0.28]}><sphereGeometry args={[0.08, 10, 8]} /><meshStandardMaterial color="#1a120c" roughness={0.4} /></mesh>
        <mesh position={[0.15, 0.11, 0.34]}><sphereGeometry args={[0.025, 6, 4]} /><meshStandardMaterial color="#fff" /></mesh>

        {/* Ears — long and upright from top of head */}
        <group ref={earsRef} position={[0, 0.28, -0.05]}>
          <group position={[-0.1, 0.35, 0]} rotation={[0, 0, 0.05]}>
            <mesh castShadow rotation={[-0.08, 0, 0]}><coneGeometry args={[0.08, 0.5, 10]} /><meshStandardMaterial color={fur} roughness={0.85} /></mesh>
            <mesh position={[0, 0, 0.04]} rotation={[-0.08, 0, 0]}><coneGeometry args={[0.05, 0.42, 8]} /><meshStandardMaterial color={earIn} roughness={0.9} side={THREE.DoubleSide} /></mesh>
          </group>
          <group position={[0.1, 0.35, 0]} rotation={[0, 0, -0.05]}>
            <mesh castShadow rotation={[-0.08, 0, 0]}><coneGeometry args={[0.08, 0.5, 10]} /><meshStandardMaterial color={fur} roughness={0.85} /></mesh>
            <mesh position={[0, 0, 0.04]} rotation={[-0.08, 0, 0]}><coneGeometry args={[0.05, 0.42, 8]} /><meshStandardMaterial color={earIn} roughness={0.9} side={THREE.DoubleSide} /></mesh>
          </group>
        </group>
      </group>

      {/* Front paws — between head and body */}
      <mesh position={[-0.12, 0.05, 0.35]} castShadow><sphereGeometry args={[0.09, 10, 8]} />{mat(fur)}</mesh>
      <mesh position={[0.12, 0.05, 0.35]} castShadow><sphereGeometry args={[0.09, 10, 8]} />{mat(fur)}</mesh>

      {/* Back feet — four pads under body */}
      <group ref={feetRef}>
        <mesh position={[-0.18, -0.44, 0.18]} castShadow><sphereGeometry args={[0.1, 10, 8]} />{mat(fur)}</mesh>
        <mesh position={[0.18, -0.44, 0.18]} castShadow><sphereGeometry args={[0.1, 10, 8]} />{mat(fur)}</mesh>
        <mesh position={[-0.18, -0.44, -0.18]} castShadow><sphereGeometry args={[0.1, 10, 8]} />{mat(fur)}</mesh>
        <mesh position={[0.18, -0.44, -0.18]} castShadow><sphereGeometry args={[0.1, 10, 8]} />{mat(fur)}</mesh>
      </group>
    </group>
  );
};

// Individual NPC logic and controller
const NPC: React.FC<{ data: EnemyData; playerRef: React.RefObject<THREE.Object3D> }> = ({ data, playerRef }) => {
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const fallGroupRef = useRef<THREE.Group>(null);
  const deathFallProgress = useRef(0);
  const [flash, setFlash] = useState(false);
  const [hitType, setHitType] = useState<'MELEE' | 'FIREBALL' | null>(null);
  const [hitProgress, setHitProgress] = useState(0);
  const lastHp = useRef(data.hp);
  const lastAttackTime = useRef(0);
  const { damagePlayer, updateEnemyPosition, consumeEnemyPushImpulse } = useGameStore();
  const [isMoving, setIsMoving] = useState(false);
  const [isAttacking, setIsAttacking] = useState(false);
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

    if (!rigidBodyRef.current || !playerRef.current) return;

    const rb = rigidBodyRef.current;

    if (data.isDead) {
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      const doFallAndLayStatic = data.type === 'TREX' || (!data.killedBySword && !data.killedByKamehameha);
      if (doFallAndLayStatic && fallGroupRef.current) {
        deathFallProgress.current = Math.min(1, deathFallProgress.current + delta * 2.2);
        const t = deathFallProgress.current;
        const ease = 1 - Math.pow(1 - t, 2);
        fallGroupRef.current.rotation.z = ease * (Math.PI / 2);
      }
      return;
    }

    const pos = rb.translation();

    // Keep enemies outside town fence unless they are in a gate (only valid entrance)
    const [clampedX, clampedZ] = getEnemyPositionClampedOutsideTown(pos.x, pos.z);
    if (clampedX !== pos.x || clampedZ !== pos.z) {
      rb.setTranslation({ x: clampedX, y: pos.y, z: clampedZ }, true);
      rb.setLinvel({ x: 0, y: rb.linvel().y, z: 0 }, true);
    }
    const px = clampedX;
    const pz = clampedZ;

    // Apply guard push impulse (e.g. when hit by town guards at gate)
    const impulse = consumeEnemyPushImpulse(data.id);
    if (impulse) {
      const vel = rb.linvel();
      rb.setLinvel({ x: vel.x + impulse.vx, y: vel.y, z: vel.z + impulse.vz }, true);
    }

    // Sync position to store every frame so gate guards (and sword) see current position
    updateEnemyPosition(data.id, [px, pos.y, pz]);

    playerRef.current.getWorldPosition(playerWorldPos);

    const dist = Math.sqrt((px - playerWorldPos.x) ** 2 + (pz - playerWorldPos.z) ** 2);
    const dir = tempVec.set(playerWorldPos.x - px, 0, playerWorldPos.z - pz).normalize();
    
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
      if (data.type === 'TREX') setIsAttacking(true);
      damagePlayer(data.type === 'TREX' ? 30 : 8);
    }
  });

  // Clear attack state after bite animation duration
  useEffect(() => {
    if (!isAttacking) return;
    const id = setTimeout(() => setIsAttacking(false), 450);
    return () => clearTimeout(id);
  }, [isAttacking]);

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
    const props = { flash, hitType, hitProgress, isMoving, isAttacking: data.type === 'TREX' ? isAttacking : false, isDead: !!data.isDead };
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
      <group ref={fallGroupRef}>
        <DeadSplitModel isDead={!!data.isDead} killedBySword={!!data.killedBySword} noSplit={data.type === 'TREX'}>
          {renderModel()}
        </DeadSplitModel>
      </group>
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
