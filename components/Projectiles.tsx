
import React, { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, BallCollider } from '@react-three/rapier';
import { useGameStore } from '../store';
import { ProjectileData } from '../types';
import * as THREE from 'three';

// --- TRAIL EFFECT COMPONENT ---
const ProjectileTrail: React.FC<{ active: boolean; charge: number }> = ({ active, charge }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = 40;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo(() => {
    return Array.from({ length: count }).map(() => ({
      pos: new THREE.Vector3(0, 0, 0),
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5),
      life: 0,
      scale: Math.random() * 0.3 + 0.1
    }));
  }, [count]);

  useFrame((state, delta) => {
    if (!meshRef.current || !active) return;
    particles.forEach((p, i) => {
      p.life -= delta * 3;
      if (p.life <= 0) {
        p.life = 1.0;
        p.pos.set(0, 0, 0); // Spawns at origin of trail group
      }
      p.pos.add(p.vel);
      const s = p.scale * p.life * (1 + charge);
      dummy.position.copy(p.pos);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.2, 4, 4]} />
      <meshStandardMaterial 
        color={charge > 0.8 ? "#7dd3fc" : "#ff9900"} 
        emissive={charge > 0.8 ? "#0ea5e9" : "#ff5500"} 
        emissiveIntensity={10} 
        transparent 
        opacity={0.6}
      />
    </instancedMesh>
  );
};

// --- EXPLOSION EFFECT COMPONENT ---
const ExplosionBurst: React.FC<{ position: THREE.Vector3; charge: number }> = ({ position, charge }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = Math.floor(25 + charge * 50);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const explosionScale = 1.2 + charge * 3.0;
  
  const particles = useMemo(() => {
    return Array.from({ length: count }).map(() => ({
      pos: new THREE.Vector3(0, 0, 0),
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 10 * (1 + charge),
        (Math.random() - 0.5) * 10 * (1 + charge),
        (Math.random() - 0.5) * 10 * (1 + charge)
      ),
      life: 1.0,
      scale: (Math.random() * 0.6 + 0.2) * (1 + charge)
    }));
  }, [charge, count]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    particles.forEach((p, i) => {
      p.life -= delta * (1.2 - charge * 0.4);
      p.pos.add(p.vel.clone().multiplyScalar(delta));
      p.vel.multiplyScalar(0.92);
      
      const s = Math.max(0, p.scale * p.life);
      dummy.position.copy(p.pos);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} position={position}>
      <sphereGeometry args={[0.5, 8, 8]} />
      <meshStandardMaterial 
        color={charge > 0.8 ? "#e0f2fe" : "#ff4400"} 
        emissive={charge > 0.8 ? "#38bdf8" : "#ff2200"} 
        emissiveIntensity={15 + charge * 15} 
        transparent 
      />
    </instancedMesh>
  );
};

// --- MAIN FIREBALL PROJECTILE ---
const Projectile: React.FC<{ data: ProjectileData }> = ({ data }) => {
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const removeProjectile = useGameStore(s => s.removeProjectile);
  const damageEnemy = useGameStore(s => s.damageEnemy);
  const damageEnvironment = useGameStore(s => s.damageEnvironment);
  const triggerHitImpact = useGameStore(s => s.triggerHitImpact);
  
  const [hasImpacted, setHasImpacted] = useState(false);
  const impactPos = useRef(new THREE.Vector3());

  const visualScale = 1.0 + data.charge * 1.8;

  useEffect(() => {
    if (rigidBodyRef.current) {
        const speed = 32 - (data.charge * 10);
        const velocity = data.direction.clone().multiplyScalar(speed);
        rigidBodyRef.current.setLinvel(velocity, true);
        
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2001/2001-preview.mp3');
        audio.volume = 0.2 + data.charge * 0.3;
        audio.playbackRate = 1.0 - data.charge * 0.2;
        audio.play().catch(() => {});
    }
  }, [data.direction, data.charge]);

  useFrame((state) => {
    if (Date.now() - data.timestamp > 2000 && !hasImpacted) {
        removeProjectile(data.id);
    }

    if (glowRef.current && !hasImpacted) {
      const s = visualScale * (1 + Math.sin(state.clock.elapsedTime * 25) * 0.2);
      glowRef.current.scale.set(s, s, s);
    }
    if (coreRef.current && !hasImpacted) {
      coreRef.current.rotation.z += 0.4 + data.charge * 0.6;
      coreRef.current.rotation.x += 0.2 + data.charge * 0.4;
    }
  });

  const handleCollision = (payload: any) => {
    if (hasImpacted) return;

    const other = payload.other.rigidBodyObject;
    const userData = other?.userData || payload.other.colliderObject?.userData;
    
    if (userData?.type === 'PLAYER') return;

    setHasImpacted(true);
    if (rigidBodyRef.current) {
        const currentPos = rigidBodyRef.current.translation();
        impactPos.current.set(currentPos.x, currentPos.y, currentPos.z);
    }

    const explosionSfx = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3');
    explosionSfx.volume = 0.5 + data.charge * 0.5;
    explosionSfx.playbackRate = 0.7 + (1.0 - data.charge) * 0.4;
    explosionSfx.play().catch(() => {});

    // Damage scaling: Base 25 -> Max 85 (3.4x)
    const finalDamage = 25 * (1 + data.charge * 2.4);

    if (userData?.type === 'ENEMY') {
        damageEnemy(userData.id, finalDamage, 'GENERIC');
        triggerHitImpact(0.5 + data.charge * 1.5, 120 + data.charge * 250);
        
        // Push back the enemy more if charged
        if (other && typeof other.applyImpulse === 'function') {
            const pushDir = data.direction.clone().normalize().multiplyScalar(20 + data.charge * 40);
            other.applyImpulse({ x: pushDir.x, y: 10 * data.charge, z: pushDir.z }, true);
        }
    } else if (userData?.type === 'ENVIRONMENT') {
        damageEnvironment(userData.id, finalDamage);
    }

    setTimeout(() => {
        removeProjectile(data.id);
    }, 1500);
  };

  if (hasImpacted) {
    return <ExplosionBurst position={impactPos.current} charge={data.charge} />;
  }

  return (
    <RigidBody 
        ref={rigidBodyRef} 
        position={data.position} 
        colliders={false} 
        gravityScale={0}
        linearDamping={0}
        friction={0}
        userData={{ type: 'PROJECTILE', id: data.id }}
        onCollisionEnter={handleCollision}
    >
      <BallCollider args={[0.5 * visualScale]} />
      <group scale={[visualScale, visualScale, visualScale]}>
        <ProjectileTrail active={!hasImpacted} charge={data.charge} />
        
        <mesh ref={coreRef}>
          <sphereGeometry args={[0.35, 16, 16]} />
          <meshBasicMaterial color={data.charge > 0.8 ? "#f0f9ff" : "#FFFFFF"} />
        </mesh>

        <mesh>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshStandardMaterial 
            color={data.charge > 0.6 ? "#7dd3fc" : "#ff7700"} 
            emissive={data.charge > 0.6 ? "#0ea5e9" : "#ff4400"} 
            emissiveIntensity={12 + data.charge * 15} 
            transparent 
            opacity={0.9} 
          />
        </mesh>

        <mesh ref={glowRef}>
          <sphereGeometry args={[0.8, 16, 16]} />
          <meshStandardMaterial 
            color={data.charge > 0.6 ? "#e0f2fe" : "#ff3300"} 
            emissive={data.charge > 0.6 ? "#38bdf8" : "#ff2200"} 
            emissiveIntensity={5 + data.charge * 10} 
            transparent 
            opacity={0.35} 
          />
        </mesh>
        
        <pointLight distance={15 * visualScale} intensity={30 * visualScale} color={data.charge > 0.6 ? "#7dd3fc" : "#ff5500"} />
        <pointLight distance={6 * visualScale} intensity={40 * visualScale} color="#ffffff" />
      </group>
    </RigidBody>
  );
};

export const ProjectileSystem: React.FC = () => {
    const projectiles = useGameStore(s => s.projectiles);
    return (
        <>
            {projectiles.map(p => <Projectile key={p.id} data={p} />)}
        </>
    );
}
