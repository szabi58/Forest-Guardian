
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store';
import { getTerrainHeight } from './Environment';

const GOD_RAY_COUNT = 15;
const DUST_COUNT = 300;
const LEAF_COUNT = 100;
const FIREFLY_COUNT = 50;
const SMOKE_PARTICLE_COUNT = 120;

export const Atmosphere: React.FC = () => {
  const raysRef = useRef<THREE.Group>(null);
  const dustRef = useRef<THREE.Points>(null);
  const leavesRef = useRef<THREE.InstancedMesh>(null);
  const firefliesRef = useRef<THREE.InstancedMesh>(null);
  const smokeRef = useRef<THREE.InstancedMesh>(null);
  
  const ambientSettings = useGameStore(s => s.ambientSettings);
  const buildings = useGameStore(s => s.buildings);

  const rays = useMemo(() => Array.from({ length: GOD_RAY_COUNT }).map(() => ({
    pos: new THREE.Vector3((Math.random() - 0.5) * 120, 15, (Math.random() - 0.5) * 120),
    scale: [15 + Math.random() * 10, 50 + Math.random() * 20, 15 + Math.random() * 10] as [number, number, number],
    rot: [Math.PI / 4, 0, (Math.random() - 0.5) * 0.6] as [number, number, number],
    opacity: 0.015 + Math.random() * 0.035
  })), []);

  const smokeData = useMemo(() => {
    return Array.from({ length: SMOKE_PARTICLE_COUNT }).map((_, i) => {
        const building = buildings[i % buildings.length];
        const tx = building.position[0] + 2; 
        const tz = building.position[2];
        const ty = getTerrainHeight(tx, tz) + 8;
        return {
            origin: new THREE.Vector3(tx, ty, tz),
            life: Math.random(),
            speed: 0.5 + Math.random() * 0.5,
            offset: Math.random() * 10
        };
    });
  }, [buildings]);

  const dustPositions = useMemo(() => {
    const arr = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 150;
      arr[i * 3 + 1] = Math.random() * 30;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 150;
    }
    return arr;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    if (ambientSettings.godRays && raysRef.current) {
      raysRef.current.children.forEach((ray, i) => {
        const mesh = ray as THREE.Mesh;
        if (mesh.material instanceof THREE.MeshBasicMaterial) {
          mesh.material.opacity = (0.2 + Math.sin(t * 0.3 + i) * 0.1) * rays[i].opacity;
        }
      });
    }

    if (smokeRef.current) {
        smokeData.forEach((s, i) => {
            s.life -= delta * s.speed;
            if (s.life <= 0) s.life = 1.0;
            
            const up = (1.0 - s.life) * 6;
            const sway = Math.sin(t * 1.5 + i) * 0.5;
            dummy.position.set(s.origin.x + sway, s.origin.y + up, s.origin.z);
            const scale = s.life * 1.5;
            dummy.scale.set(scale, scale, scale);
            dummy.updateMatrix();
            smokeRef.current!.setMatrixAt(i, dummy.matrix);
        });
        smokeRef.current.instanceMatrix.needsUpdate = true;
    }

    if (firefliesRef.current) {
      for(let i=0; i<FIREFLY_COUNT; i++) {
        const time = t * 0.3 + i * 10;
        dummy.position.set(Math.sin(time) * 40 + 20, 2 + Math.cos(time * 0.5) * 3, Math.cos(time * 0.7) * 40 + 10);
        dummy.scale.setScalar(0.04 + Math.sin(t * 12 + i) * 0.02);
        dummy.updateMatrix();
        firefliesRef.current!.setMatrixAt(i, dummy.matrix);
      }
      firefliesRef.current.instanceMatrix.needsUpdate = true;
    }

    if (ambientSettings.forestDust && dustRef.current) {
      const pos = dustRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < DUST_COUNT; i++) {
        pos[i * 3 + 1] += Math.sin(t * 0.2 + i) * 0.005;
        if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 25;
      }
      dustRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <group>
      {ambientSettings.godRays && (
        <group ref={raysRef}>
          {rays.map((ray, i) => (
            <mesh key={i} position={ray.pos} rotation={ray.rot} scale={ray.scale}>
              <cylinderGeometry args={[2.5, 6.0, 1, 16, 1, true]} />
              <meshBasicMaterial color="#fff4e0" transparent opacity={ray.opacity} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
          ))}
        </group>
      )}
      
      <instancedMesh ref={smokeRef} args={[undefined, undefined, SMOKE_PARTICLE_COUNT]} frustumCulled={false}>
          <sphereGeometry args={[0.5, 8, 8]} />
          <meshStandardMaterial color="#888" transparent opacity={0.3} />
      </instancedMesh>

      <instancedMesh ref={firefliesRef} args={[undefined, undefined, FIREFLY_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.5, 6, 6]} />
        <meshBasicMaterial color="#bef264" />
        <pointLight color="#bef264" intensity={0.4} distance={3} />
      </instancedMesh>

      {ambientSettings.forestDust && (
        <points ref={dustRef} frustumCulled={false}>
          <bufferGeometry><bufferAttribute attach="attributes-position" count={dustPositions.length / 3} array={dustPositions} itemSize={3} /></bufferGeometry>
          <pointsMaterial size={0.08} color="#fef08a" transparent opacity={0.25} blending={THREE.AdditiveBlending} />
        </points>
      )}
    </group>
  );
};
