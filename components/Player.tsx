
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore, liveEnemyPositions, liveTownNPCPositions, livePlayerPosition } from '../store';
import { getTerrainHeight } from './Environment';

const MOVEMENT_SPEED = 12;
const STANCE_SPEED_MULT = 0.5;
const DODGE_SPEED_MULT = 2.4;
const COMBO_WINDOW = 1000;
const SPRINT_PARTICLE_COUNT = 30;

const SPIN_RADIUS = 5.2; 
const SPIN_DURATION = 700; 

const JUMP_FORCE = 28;
// STEP-CLIMB SETTINGS
const TOE_HEIGHT = 0.4; 
const KNEE_HEIGHT = 0.9; 
const STEP_CHECK_DIST = 1.5; 

// --- DUST CLOUD PARTICLES ---
const SprintParticles: React.FC<{ active: boolean; velocity: number }> = ({ active, velocity }) => {
  const instancesRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const isHitStopping = useGameStore(s => s.isHitStopping);
  
  const particles = useMemo(() => Array.from({ length: SPRINT_PARTICLE_COUNT }).map(() => ({
    pos: new THREE.Vector3(0, -100, 0), 
    vel: new THREE.Vector3(), 
    life: 0, 
    scale: Math.random() * 0.4 + 0.2,
  })), []);

  useFrame((state, delta) => {
    if (!instancesRef.current || isHitStopping) return;
    
    particles.forEach((p, i) => {
      if (p.life > 0) {
        p.life -= delta * 1.5;
        p.pos.add(p.vel.clone().multiplyScalar(delta));
        const s = p.scale * (p.life / 1.0);
        dummy.position.copy(p.pos); 
        dummy.scale.set(s, s, s); 
        dummy.updateMatrix();
        instancesRef.current!.setMatrixAt(i, dummy.matrix);
      } else if (active && Math.random() < (velocity * 0.05)) {
        p.life = 1.0;
        p.pos.set((Math.random() - 0.5) * 0.5, 0.1, -0.4);
        p.vel.set((Math.random() - 0.5) * 0.5, Math.random() * 0.3, -Math.random() * 0.3);
      } else {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        instancesRef.current!.setMatrixAt(i, dummy.matrix);
      }
    });
    instancesRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={instancesRef} args={[undefined, undefined, SPRINT_PARTICLE_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[0.5, 6, 6]} />
      <meshStandardMaterial color="#8b7355" transparent opacity={0.3} roughness={1} />
    </instancedMesh>
  );
};

// --- SWORD CHARGE PARTICLES ---
const SwordChargeParticles: React.FC<{ active: boolean; charge: number }> = ({ active, charge }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = 20;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo(() => {
    return Array.from({ length: count }).map(() => ({
      pos: new THREE.Vector3(0, 0.5, 0),
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.1, Math.random() * 0.1, (Math.random() - 0.5) * 0.1),
      life: Math.random(),
      speed: 1 + Math.random() * 2
    }));
  }, [count]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    particles.forEach((p, i) => {
      if (active && charge > 0.1) {
        p.life -= delta * p.speed;
        if (p.life <= 0) {
          p.life = 1.0;
          p.pos.set((Math.random() - 0.5) * 0.1, 0.5, (Math.random() - 0.5) * 0.1);
          p.vel.set((Math.random() - 0.5) * 0.2 * charge, Math.random() * 0.5 * charge, (Math.random() - 0.5) * 0.2 * charge);
        }
        p.pos.add(p.vel);
        const s = (0.05 + charge * 0.15) * p.life;
        dummy.position.copy(p.pos);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy.matrix);
      } else {
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy.matrix);
      }
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[0.5, 6, 6]} />
      <meshBasicMaterial color={active ? "#ff3300" : "#4488ff"} transparent opacity={0.85} />
    </instancedMesh>
  );
};

// --- BLADE SPARKS (blue/white magical particles from blade edges) ---
const SwordBladeParticles: React.FC<{ active: boolean; bladeLength: number }> = ({ active, bladeLength }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = 16;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo(() => Array.from({ length: count }).map(() => ({
    y: Math.random() * bladeLength,
    side: Math.random() > 0.5 ? 1 : -1,
    life: Math.random(),
    speed: 0.5 + Math.random() * 1.5
  })), [count, bladeLength]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    particles.forEach((p, i) => {
      if (active) {
        p.life -= delta * p.speed;
        if (p.life <= 0) {
          p.life = 1;
          p.y = Math.random() * bladeLength;
          p.side = Math.random() > 0.5 ? 1 : -1;
        }
        const s = 0.02 * p.life;
        dummy.position.set(p.side * 0.1, p.y - bladeLength / 2, (Math.random() - 0.5) * 0.04);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy.matrix);
      } else {
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy.matrix);
      }
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group position={[0, bladeLength / 2, 0]}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[1, 4, 4]} />
        <meshBasicMaterial color="#aaddff" transparent opacity={0.9} />
      </instancedMesh>
    </group>
  );
};

// --- KAMEHAMEHA VISUALS ---
// Authentic DBZ-style energy beam. All particles are fixed-size pools; nothing
// is allocated per frame and nothing persists after the beam ends (the ground
// scorch uses the existing grass mask, which fades on its own).
const BEAM_MAX_LEN = 40;
const KAME_SUCK_COUNT = 24;
const KAME_SPARK_COUNT = 24;
const KAME_DUST_COUNT = 14;

const KamehamehaVFX: React.FC<{ isFiring: boolean; isCharging: boolean; charge: number }> = ({ isFiring, isCharging, charge }) => {
    const { world, rapier } = useRapier();
    const rootRef = useRef<THREE.Group>(null);
    const orbCoreRef = useRef<THREE.Mesh>(null);
    const orbGlowRef = useRef<THREE.Mesh>(null);
    const orbLightRef = useRef<THREE.PointLight>(null);
    const beamGroupRef = useRef<THREE.Group>(null);
    const beamScaleRef = useRef<THREE.Group>(null);
    const coreRef = useRef<THREE.Mesh>(null);
    const innerRef = useRef<THREE.Mesh>(null);
    const outerRef = useRef<THREE.Mesh>(null);
    const helix1Ref = useRef<THREE.Mesh>(null);
    const helix2Ref = useRef<THREE.Mesh>(null);
    const ring1Ref = useRef<THREE.Mesh>(null);
    const ring2Ref = useRef<THREE.Mesh>(null);
    const impactRef = useRef<THREE.Group>(null);
    const impactFlashRef = useRef<THREE.Mesh>(null);
    const impactRingRef = useRef<THREE.Mesh>(null);
    const impactLightRef = useRef<THREE.PointLight>(null);
    const suckRef = useRef<THREE.InstancedMesh>(null);
    const sparksRef = useRef<THREE.InstancedMesh>(null);
    const dustRef = useRef<THREE.InstancedMesh>(null);

    const fade = useRef(0);                 // eases the beam in on fire and out on release
    const beamLen = useRef(BEAM_MAX_LEN);
    const scorchTimer = useRef(0);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const wPos = useMemo(() => new THREE.Vector3(), []);
    const wDir = useMemo(() => new THREE.Vector3(), []);
    const ray = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), [rapier]);

    const suckParts = useMemo(() => Array.from({ length: KAME_SUCK_COUNT }).map(() => ({
        dir: new THREE.Vector3().randomDirection(),
        dist: 0.6 + Math.random() * 2.0,
        speed: 1.6 + Math.random() * 2.2,
    })), []);
    const sparkParts = useMemo(() => Array.from({ length: KAME_SPARK_COUNT }).map(() => ({
        dir: new THREE.Vector3(),
        life: Math.random(),
        speed: 1.6 + Math.random() * 1.6,
    })), []);
    const dustParts = useMemo(() => Array.from({ length: KAME_DUST_COUNT }).map(() => ({
        ang: Math.random() * Math.PI * 2,
        r: 0.8 + Math.random() * 2.4,
        speed: 1.2 + Math.random() * 1.4,
    })), []);

    // Flowing helical energy ribbon wrapped around the beam core (unit height, stretched by beamScale)
    const helixGeo = useMemo(() => {
        class HelixCurve extends THREE.Curve<THREE.Vector3> {
            constructor() { super(); }
            getPoint(t: number) {
                const ang = t * Math.PI * 2 * 11;
                return new THREE.Vector3(Math.cos(ang) * 0.72, t, Math.sin(ang) * 0.72);
            }
        }
        return new THREE.TubeGeometry(new HelixCurve(), 200, 0.07, 5, false);
    }, []);

    const setOpacity = (mesh: THREE.Mesh | null, o: number) => {
        if (mesh?.material) (mesh.material as THREE.MeshBasicMaterial).opacity = o;
    };

    useFrame((state, delta) => {
        if (!rootRef.current || delta <= 0 || delta > 0.1) return;
        const t = state.clock.elapsedTime;

        // Beam presence eases in fast, dissipates smoothly on release
        fade.current = THREE.MathUtils.lerp(fade.current, isFiring ? 1 : 0, 1 - Math.exp(-(isFiring ? 20 : 7) * delta));
        if (!isFiring && fade.current < 0.01) fade.current = 0;
        const f = fade.current;

        // --- CHARGE ORB ---
        const orbActive = isCharging || f > 0.01;
        if (orbCoreRef.current && orbGlowRef.current && orbLightRef.current) {
            orbCoreRef.current.visible = orbActive;
            orbGlowRef.current.visible = orbActive;
            if (isCharging) {
                const pulse = 1 + Math.sin(t * 18) * 0.09 + Math.sin(t * 47) * 0.04;
                const cs = (0.12 + charge * 0.5) * pulse;
                orbCoreRef.current.scale.setScalar(Math.max(cs, 0.001));
                orbGlowRef.current.scale.setScalar(Math.max(cs * 2.4 + charge * 0.35, 0.001));
                orbLightRef.current.intensity = 4 + charge * 26 + Math.sin(t * 18) * 2 * charge;
            } else if (f > 0.01) {
                // Muzzle flare while the beam is out
                orbCoreRef.current.scale.setScalar((0.55 + Math.sin(t * 35) * 0.08) * f);
                orbGlowRef.current.scale.setScalar((1.5 + Math.sin(t * 22) * 0.2) * f);
                orbLightRef.current.intensity = 42 * f;
            } else {
                orbLightRef.current.intensity = 0;
            }
        }

        // Suck-in particles: drawn from a shell toward the orb while charging
        if (suckRef.current) {
            suckRef.current.visible = isCharging;
            if (isCharging) {
                for (let i = 0; i < KAME_SUCK_COUNT; i++) {
                    const p = suckParts[i];
                    p.dist -= delta * p.speed * (0.7 + charge);
                    if (p.dist < 0.12) {
                        p.dist = 1.1 + Math.random() * 1.5;
                        p.dir.randomDirection();
                    }
                    const s = 0.02 + 0.045 * (1 - p.dist / 2.6) * (0.4 + charge);
                    dummy.position.copy(p.dir).multiplyScalar(p.dist);
                    dummy.scale.setScalar(s);
                    dummy.rotation.set(0, 0, 0);
                    dummy.updateMatrix();
                    suckRef.current.setMatrixAt(i, dummy.matrix);
                }
                suckRef.current.instanceMatrix.needsUpdate = true;
            }
        }

        // --- BEAM ---
        if (beamGroupRef.current && beamScaleRef.current) {
            beamGroupRef.current.visible = f > 0.01;
            if (f > 0.01) {
                // Visual raycast: beam stops at walls/terrain (passes through enemies, like the damage ray)
                rootRef.current.getWorldPosition(wPos);
                rootRef.current.getWorldDirection(wDir);
                if (isFiring) {
                    ray.origin.x = wPos.x; ray.origin.y = wPos.y; ray.origin.z = wPos.z;
                    ray.dir.x = wDir.x; ray.dir.y = wDir.y; ray.dir.z = wDir.z;
                    const hit = world.castRay(ray, BEAM_MAX_LEN, true, undefined, undefined, undefined, undefined,
                        (collider: any) => {
                            if (collider.isSensor()) return false;
                            const ud = collider.parent()?.userData as any;
                            return ud?.type === 'ENVIRONMENT' || !ud?.type;
                        });
                    const toi = hit ? (hit as any).toi ?? (hit as any).timeOfImpact : null;
                    const targetLen = Number.isFinite(toi) ? THREE.MathUtils.clamp(toi as number, 2, BEAM_MAX_LEN) : BEAM_MAX_LEN;
                    beamLen.current = THREE.MathUtils.lerp(beamLen.current, targetLen, 0.5);
                }

                const flicker = 1 + Math.sin(t * 40) * 0.05 + Math.sin(t * 13) * 0.04;
                beamScaleRef.current.scale.set(f * flicker, beamLen.current, f * flicker);

                // Flowing spiral: counter-rotating ribbons
                if (helix1Ref.current) helix1Ref.current.rotation.y = t * 9;
                if (helix2Ref.current) helix2Ref.current.rotation.y = -t * 6.5 + Math.PI;
                setOpacity(coreRef.current, f);
                setOpacity(innerRef.current, 0.65 * f);
                setOpacity(outerRef.current, 0.32 * f);
                setOpacity(helix1Ref.current, 0.5 * f);
                setOpacity(helix2Ref.current, 0.35 * f);

                // Muzzle burst rings expanding outward from the hands
                const r1 = (t * 2.6) % 1;
                const r2 = (t * 2.6 + 0.5) % 1;
                if (ring1Ref.current) { ring1Ref.current.visible = true; ring1Ref.current.scale.setScalar(0.4 + r1 * 2.2); setOpacity(ring1Ref.current, (1 - r1) * 0.75 * f); }
                if (ring2Ref.current) { ring2Ref.current.visible = true; ring2Ref.current.scale.setScalar(0.4 + r2 * 2.2); setOpacity(ring2Ref.current, (1 - r2) * 0.75 * f); }

                // --- IMPACT ---
                const hitting = beamLen.current < BEAM_MAX_LEN - 0.5;
                if (impactRef.current) {
                    impactRef.current.visible = hitting;
                    impactRef.current.position.z = beamLen.current;
                }
                if (hitting) {
                    if (impactFlashRef.current) impactFlashRef.current.scale.setScalar((1.1 + Math.sin(t * 30) * 0.28) * f);
                    const rp = (t * 2.1) % 1;
                    if (impactRingRef.current) { impactRingRef.current.scale.setScalar(0.5 + rp * 4.5); setOpacity(impactRingRef.current, (1 - rp) * 0.8 * f); }
                    if (impactLightRef.current) impactLightRef.current.intensity = (26 + Math.sin(t * 25) * 8) * f;
                    if (sparksRef.current) {
                        sparksRef.current.visible = true;
                        for (let i = 0; i < KAME_SPARK_COUNT; i++) {
                            const p = sparkParts[i];
                            p.life -= delta * p.speed;
                            if (p.life <= 0) {
                                p.life = 1;
                                p.dir.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, -Math.random() * 1.2).normalize();
                            }
                            dummy.position.copy(p.dir).multiplyScalar((1 - p.life) * 3.4);
                            dummy.scale.setScalar(0.06 * p.life * f);
                            dummy.updateMatrix();
                            sparksRef.current.setMatrixAt(i, dummy.matrix);
                        }
                        sparksRef.current.instanceMatrix.needsUpdate = true;
                    }
                    // Scorch the grass at the impact point (grass mask fades on its own)
                    scorchTimer.current += delta;
                    if (isFiring && scorchTimer.current > 0.12) {
                        scorchTimer.current = 0;
                        const cut = useGameStore.getState().cutGrassAt;
                        if (cut) {
                            cut(wPos.x + wDir.x * beamLen.current, wPos.z + wDir.z * beamLen.current, 2.4, 0.55);
                            // Blowback: flatten the grass around the character too
                            cut(wPos.x, wPos.z, 3.2, 0.16);
                        }
                    }
                } else if (sparksRef.current) {
                    sparksRef.current.visible = false;
                }

                // Dust kicked outward around the character by the beam's force
                if (dustRef.current) {
                    dustRef.current.visible = true;
                    for (let i = 0; i < KAME_DUST_COUNT; i++) {
                        const p = dustParts[i];
                        p.r += delta * p.speed * 1.6;
                        if (p.r > 4.2) { p.r = 0.7; p.ang = Math.random() * Math.PI * 2; }
                        const fadeOut = 1 - p.r / 4.2;
                        dummy.position.set(Math.cos(p.ang) * p.r, -0.72 + Math.sin(t * 6 + p.ang * 3) * 0.06, Math.sin(p.ang) * p.r);
                        dummy.scale.setScalar((0.14 + (1 - fadeOut) * 0.2) * fadeOut * f);
                        dummy.updateMatrix();
                        dustRef.current.setMatrixAt(i, dummy.matrix);
                    }
                    dustRef.current.instanceMatrix.needsUpdate = true;
                }
            } else {
                if (impactRef.current) impactRef.current.visible = false;
                if (impactLightRef.current) impactLightRef.current.intensity = 0;
                if (sparksRef.current) sparksRef.current.visible = false;
                if (dustRef.current) dustRef.current.visible = false;
                // Muzzle rings live outside the beam group — hide them explicitly
                // or their last faint frame lingers after the attack ends
                if (ring1Ref.current) ring1Ref.current.visible = false;
                if (ring2Ref.current) ring2Ref.current.visible = false;
            }
        }
    });

    return (
        <group ref={rootRef} position={[0, 0.85, 0.55]}>
            {/* CHARGE ORB: white-hot core inside a soft additive blue glow */}
            <mesh ref={orbCoreRef} visible={false}>
                <sphereGeometry args={[1, 16, 12]} />
                <meshBasicMaterial color="#f2ffff" toneMapped={false} />
            </mesh>
            <mesh ref={orbGlowRef} visible={false}>
                <sphereGeometry args={[1, 16, 12]} />
                <meshBasicMaterial color="#2f8fff" transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>
            <pointLight ref={orbLightRef} color="#66ccff" distance={15} intensity={0} />
            <instancedMesh ref={suckRef} args={[undefined, undefined, KAME_SUCK_COUNT]} visible={false} frustumCulled={false}>
                <sphereGeometry args={[1, 5, 4]} />
                <meshBasicMaterial color="#aaddff" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </instancedMesh>

            {/* MUZZLE BURST RINGS (face down-range) */}
            <mesh ref={ring1Ref} position={[0, 0, 0.25]} visible={false}>
                <torusGeometry args={[1, 0.06, 8, 32]} />
                <meshBasicMaterial color="#bfe8ff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>
            <mesh ref={ring2Ref} position={[0, 0, 0.25]} visible={false}>
                <torusGeometry args={[1, 0.06, 8, 32]} />
                <meshBasicMaterial color="#bfe8ff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>

            {/* BEAM: unit-height layers along +Y, rotated to point forward, stretched to the raycast length */}
            <group ref={beamGroupRef} visible={false} rotation={[Math.PI / 2, 0, 0]}>
                <group ref={beamScaleRef}>
                    <mesh ref={coreRef} position={[0, 0.5, 0]}>
                        <cylinderGeometry args={[0.3, 0.38, 1, 12, 1, true]} />
                        <meshBasicMaterial color="#ffffff" transparent opacity={1} depthWrite={false} toneMapped={false} />
                    </mesh>
                    <mesh ref={innerRef} position={[0, 0.5, 0]}>
                        <cylinderGeometry args={[0.55, 0.7, 1, 12, 1, true]} />
                        <meshBasicMaterial color="#7fd4ff" transparent opacity={0.65} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
                    </mesh>
                    <mesh ref={outerRef} position={[0, 0.5, 0]}>
                        <cylinderGeometry args={[1.0, 1.45, 1, 12, 1, true]} />
                        <meshBasicMaterial color="#1f6dff" transparent opacity={0.32} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
                    </mesh>
                    <mesh ref={helix1Ref} geometry={helixGeo}>
                        <meshBasicMaterial color="#e6f7ff" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
                    </mesh>
                    <mesh ref={helix2Ref} geometry={helixGeo} scale={[1.18, 1, 1.18]}>
                        <meshBasicMaterial color="#66baff" transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
                    </mesh>
                </group>
            </group>

            {/* IMPACT: flash, shockwave ring, sparks, light */}
            <group ref={impactRef} visible={false}>
                <mesh ref={impactFlashRef}>
                    <sphereGeometry args={[0.9, 12, 10]} />
                    <meshBasicMaterial color="#ffffff" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
                </mesh>
                <mesh ref={impactRingRef}>
                    <torusGeometry args={[1, 0.08, 8, 36]} />
                    <meshBasicMaterial color="#9fdcff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
                </mesh>
                <instancedMesh ref={sparksRef} args={[undefined, undefined, KAME_SPARK_COUNT]} visible={false} frustumCulled={false}>
                    <sphereGeometry args={[1, 5, 4]} />
                    <meshBasicMaterial color="#cfeaff" transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
                </instancedMesh>
                <pointLight ref={impactLightRef} color="#7fc9ff" distance={18} intensity={0} />
            </group>

            {/* Dust blown outward at ground level around the character */}
            <instancedMesh ref={dustRef} args={[undefined, undefined, KAME_DUST_COUNT]} visible={false} frustumCulled={false}>
                <sphereGeometry args={[1, 6, 5]} />
                <meshStandardMaterial color="#9c8a6d" transparent opacity={0.35} roughness={1} depthWrite={false} />
            </instancedMesh>
        </group>
    );
};

// --- SPIN VFX ---
const SpinVFX: React.FC<{ active: boolean; position: THREE.Vector3 }> = ({ active, position }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [visible, setVisible] = useState(false);
  const startTime = useRef(0);

  useEffect(() => {
    if (active) {
      setVisible(true);
      startTime.current = performance.now();
      setTimeout(() => setVisible(false), SPIN_DURATION);
    }
  }, [active]);

  useFrame(() => {
    if (visible && meshRef.current) {
      const elapsed = (performance.now() - startTime.current) / SPIN_DURATION;
      meshRef.current.scale.setScalar(1 + elapsed * 7);
      if (meshRef.current.material instanceof THREE.MeshStandardMaterial) {
        meshRef.current.material.opacity = (1 - elapsed) * 0.9;
      }
    }
  });

  if (!visible) return null;
  return (
    <group position={position}>
      <mesh ref={meshRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.2, 0.12, 8, 32]} />
        <meshStandardMaterial color="#ffffff" emissive="#ff3300" emissiveIntensity={40} transparent opacity={0.8} />
      </mesh>
    </group>
  );
};

// --- SLASH ARC VISUAL ---
const SlashArc: React.FC<{ comboStep: number; progress: number }> = ({ comboStep, progress }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const colors = ["#00ffff", "#00ffff", "#ffffff"]; 
  const color = colors[comboStep - 1] || colors[0];
  
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 1.4, -Math.PI / 2.5, Math.PI / 2.5, false);
    shape.absarc(0, 0, 0.9, Math.PI / 2.5, -Math.PI / 2.5, true);
    return new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
  }, []);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.scale.setScalar(1 + progress * 0.3);
      if (meshRef.current.material instanceof THREE.MeshStandardMaterial) {
        meshRef.current.material.opacity = Math.sin(progress * Math.PI) * 0.9;
      }
    }
  });

  const transform = useMemo(() => {
    const pos = new THREE.Vector3(0, 0, 0);
    const rot = new THREE.Euler(0, 0, 0);
    if (comboStep === 1) { pos.set(0, 0.3, 1.0); rot.set(0, 0, -0.2); }
    else if (comboStep === 2) { pos.set(0, 0.3, 1.0); rot.set(0, 0, Math.PI + 0.2); }
    else if (comboStep === 3) { pos.set(0, 0.4, 1.3); rot.set(Math.PI / 2, 0, 0); }
    return { pos, rot };
  }, [comboStep]);

  return (
    <mesh ref={meshRef} position={transform.pos} rotation={transform.rot} geometry={geometry}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={15} transparent opacity={0.8} side={THREE.DoubleSide} />
    </mesh>
  );
};

// --- MAGICAL BROADSWORD (reference: blue glow, runes, bat-wing guard, skull pommel) ---
const BLADE_LENGTH = 1.15;
const BLADE_WIDTH = 0.08;
const SERRATION_COUNT = 10;

const DreadSword = React.forwardRef<THREE.Group, { isAttacking: boolean; isSpinning: boolean; isCharging: boolean; charge: number; comboStep: number; lastAttackTime: number; tipRef: React.RefObject<THREE.Group>; baseRef: React.RefObject<THREE.Group> }>(({ isAttacking, isSpinning, isCharging, charge, comboStep, lastAttackTime, tipRef, baseRef }, ref) => {
  const runeGlowRef = useRef<THREE.Group>(null);
  const bladeGlowRef = useRef<THREE.Mesh>(null);
  const cutGrassAt = useGameStore(s => s.cutGrassAt);
  const tempWorldPos = useRef(new THREE.Vector3());

  const serrationPositions = useMemo(() => {
    const out: { y: number; side: number }[] = [];
    for (let i = 0; i < SERRATION_COUNT; i++) {
      const t = (i + 0.5) / SERRATION_COUNT;
      out.push({ y: t * BLADE_LENGTH, side: 1 });
      out.push({ y: t * BLADE_LENGTH, side: -1 });
    }
    return out;
  }, []);

  useFrame(() => {
    const baseIntensity = (isAttacking || isSpinning ? 2.5 : 1.2);
    const chargeIntensity = isCharging ? charge * 1.5 : 0;
    const glowIntensity = baseIntensity + chargeIntensity;

    if (runeGlowRef.current) {
      runeGlowRef.current.children.forEach((child) => {
        if ((child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = glowIntensity * 8;
          if (isCharging) mat.emissive.lerp(new THREE.Color("#ff4400"), charge * 0.5);
          else mat.emissive.set("#ff6622");
        }
      });
    }
    if (bladeGlowRef.current?.material) {
      const mat = bladeGlowRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = glowIntensity;
    }

    if (isAttacking && tipRef.current && cutGrassAt) {
      tipRef.current.getWorldPosition(tempWorldPos.current);
      cutGrassAt(tempWorldPos.current.x, tempWorldPos.current.z, 1.2, 0.8);
    }
  });

  return (
    <group ref={ref} position={[0, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]} scale={[1.2, 1.2, 1.2]}>
      <group ref={baseRef} position={[0, -0.08, 0]} />
      <group ref={tipRef} position={[0, BLADE_LENGTH + 0.02, 0]} />

      {/* Skull pommel — dark, glowing red eyes */}
      <group position={[0, -0.52, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.12, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.65]} />
          <meshStandardMaterial color="#1a1512" roughness={0.85} metalness={0.15} />
        </mesh>
        <mesh position={[0.04, 0.06, 0.1]}><sphereGeometry args={[0.028, 8, 6]} /><meshStandardMaterial color="#ff2222" emissive="#cc0000" emissiveIntensity={3} /></mesh>
        <mesh position={[-0.04, 0.06, 0.1]}><sphereGeometry args={[0.028, 8, 6]} /><meshStandardMaterial color="#ff2222" emissive="#cc0000" emissiveIntensity={3} /></mesh>
      </group>

      {/* Grip — dark wrapped leather, ridges */}
      <mesh position={[0, -0.28, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.05, 0.38, 12]} />
        <meshStandardMaterial color="#1e1610" roughness={0.92} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[0, -0.38 + i * 0.095, 0]} rotation={[0, 0, (i % 2) * 0.08]}>
          <torusGeometry args={[0.048, 0.008, 6, 12]} />
          <meshStandardMaterial color="#2a2018" roughness={0.9} />
        </mesh>
      ))}

      {/* Crossguard — bat-wing / demonic horns, dark metal, faint blue edge */}
      <group position={[0, -0.08, 0]}>
        {/* Left wing — curves up and down with points */}
        <mesh position={[-0.22, 0.08, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <boxGeometry args={[0.06, 0.35, 0.06]} />
          <meshStandardMaterial color="#0d0a08" metalness={0.8} roughness={0.35} />
        </mesh>
        <mesh position={[-0.32, 0.18, 0.02]} rotation={[0, 0, Math.PI / 2 - 0.4]} castShadow>
          <boxGeometry args={[0.04, 0.2, 0.04]} />
          <meshStandardMaterial color="#0d0a08" metalness={0.8} roughness={0.35} emissive="#111133" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[-0.32, -0.02, 0.02]} rotation={[0, 0, Math.PI / 2 + 0.35]} castShadow>
          <boxGeometry args={[0.04, 0.18, 0.04]} />
          <meshStandardMaterial color="#0d0a08" metalness={0.8} roughness={0.35} emissive="#111133" emissiveIntensity={0.4} />
        </mesh>
        {/* Right wing */}
        <mesh position={[0.22, 0.08, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
          <boxGeometry args={[0.06, 0.35, 0.06]} />
          <meshStandardMaterial color="#0d0a08" metalness={0.8} roughness={0.35} />
        </mesh>
        <mesh position={[0.32, 0.18, 0.02]} rotation={[0, 0, -Math.PI / 2 + 0.4]} castShadow>
          <boxGeometry args={[0.04, 0.2, 0.04]} />
          <meshStandardMaterial color="#0d0a08" metalness={0.8} roughness={0.35} emissive="#111133" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[0.32, -0.02, 0.02]} rotation={[0, 0, -Math.PI / 2 - 0.35]} castShadow>
          <boxGeometry args={[0.04, 0.18, 0.04]} />
          <meshStandardMaterial color="#0d0a08" metalness={0.8} roughness={0.35} emissive="#111133" emissiveIntensity={0.4} />
        </mesh>
        {/* Center block */}
        <mesh castShadow><boxGeometry args={[0.12, 0.08, 0.07]} /><meshStandardMaterial color="#0a0806" metalness={0.85} roughness={0.3} /></mesh>
      </group>

      {/* Blade — double-edged, serrated, bright blue glow, runes */}
      <group position={[0, BLADE_LENGTH / 2, 0]}>
        {/* Core blade — full length */}
        <mesh castShadow>
          <boxGeometry args={[BLADE_WIDTH * 1.1, BLADE_LENGTH, 0.022]} />
          <meshStandardMaterial color="#1a2233" metalness={0.9} roughness={0.15} />
        </mesh>
        {/* Outer glow — neon blue */}
        <mesh ref={bladeGlowRef}>
          <boxGeometry args={[BLADE_WIDTH * 1.5, BLADE_LENGTH + 0.02, 0.018]} />
          <meshStandardMaterial color="#66ccff" emissive="#2288ff" emissiveIntensity={1.2} transparent opacity={0.88} />
        </mesh>
        {/* Serrations — tooth-like along both edges */}
        {serrationPositions.map(({ y, side }, i) => (
          <mesh key={i} position={[side * (BLADE_WIDTH + 0.012), y - BLADE_LENGTH / 2, 0]} rotation={[0, 0, side * 0.15]}>
            <coneGeometry args={[0.018, 0.04, 4]} />
            <meshStandardMaterial color="#4488cc" emissive="#2266aa" emissiveIntensity={0.6} metalness={0.8} roughness={0.2} />
          </mesh>
        ))}
        {/* Runes — red-orange glowing symbols along the flat */}
        <group ref={runeGlowRef} position={[0, 0, 0.014]}>
          <mesh position={[0, -0.2, 0]}><boxGeometry args={[0.012, 0.25, 0.004]} /><meshStandardMaterial color="#ff6622" emissive="#ff4400" emissiveIntensity={6} /></mesh>
          <mesh position={[0, 0.15, 0]}><boxGeometry args={[0.01, 0.18, 0.004]} /><meshStandardMaterial color="#ff6622" emissive="#ff4400" emissiveIntensity={6} /></mesh>
          <mesh position={[0, 0.45, 0]}><boxGeometry args={[0.008, 0.12, 0.004]} /><meshStandardMaterial color="#ff6622" emissive="#ff4400" emissiveIntensity={6} /></mesh>
        </group>
        <SwordChargeParticles active={isCharging} charge={charge} />
      </group>

      {/* Blade edge sparks — blue/white particles when attacking or spinning */}
      <SwordBladeParticles active={isAttacking || isSpinning} bladeLength={BLADE_LENGTH} />
    </group>
  );
});

// --- BODY LAYOUT / GAIT CONSTANTS ---
const BODY_Y = 0.85;   // torso group rest height
const HIP_Y = 0.52;    // leg pivot height; boot soles rest exactly at y=0
const LEG_REACH = 0.52;

// Sword swing easing: brief windup (negative = pull back), explosive strike, settle.
// Input is linear 0..1 attack progress; output sweeps -0.3 (windup peak) -> 1 (swing done).
const SWING_WINDUP_END = 0.18;
const SWING_STRIKE_END = 0.52;
const swingEase = (p: number): number => {
  if (p < SWING_WINDUP_END) return -0.3 * Math.sin((p / SWING_WINDUP_END) * Math.PI * 0.5);
  if (p < SWING_STRIKE_END) {
    const k = (p - SWING_WINDUP_END) / (SWING_STRIKE_END - SWING_WINDUP_END);
    return -0.3 + 1.3 * (1 - Math.pow(1 - k, 4));
  }
  return 1;
};

// --- FIRST-PERSON ARMS ---
// Shown instead of the squirrel model when the camera zooms in past the FP
// threshold. Glued to the camera every frame; swings reuse the same combo
// timing and easing as the third-person model, and the sword is the same
// DreadSword component so the weapon looks identical up close.
const FirstPersonArms: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const rigRef = useRef<THREE.Group>(null);
  const rightPivotRef = useRef<THREE.Group>(null);
  const leftPivotRef = useRef<THREE.Group>(null);
  const fpTipRef = useRef<THREE.Group>(null);
  const fpBaseRef = useRef<THREE.Group>(null);
  const spinStart = useRef(0);
  const wasSpinning = useRef(false);

  const isAttacking = useGameStore(s => s.isAttacking);
  const isSpinning = useGameStore(s => s.isSpinning);
  const isMeleeCharging = useGameStore(s => s.isMeleeCharging);
  const meleeCharge = useGameStore(s => s.meleeCharge);
  const comboStep = useGameStore(s => s.comboStep);
  const lastAttackTime = useGameStore(s => s.lastAttackTime);

  const suitBlueMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1e3f9e', roughness: 0.6 }), []);
  const gloveMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f2f4f7', roughness: 0.25, metalness: 0.15 }), []);
  const furMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#96602e', roughness: 0.95 }), []);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    // Glue the rig to the camera every frame
    g.position.copy(state.camera.position);
    g.quaternion.copy(state.camera.quaternion);

    const store = useGameStore.getState();
    const t = state.clock.elapsedTime;

    // Walk bob + gentle breathing sway
    const speedN = THREE.MathUtils.clamp((store.currentSpeed || 0) / 12, 0, 1);
    if (rigRef.current) {
      rigRef.current.position.y = -0.02 + Math.sin(t * 9) * 0.018 * speedN + Math.sin(t * 1.7) * 0.006;
      rigRef.current.position.x = Math.cos(t * 4.5) * 0.012 * speedN;
      rigRef.current.rotation.z = Math.cos(t * 4.5) * 0.01 * speedN;
    }

    const right = rightPivotRef.current;
    const left = leftPivotRef.current;
    if (!right || !left) return;

    // Spin attack: whirl the blade a full turn across the view
    if (store.isSpinning) {
      if (!wasSpinning.current) { spinStart.current = Date.now(); wasSpinning.current = true; }
      const sp = THREE.MathUtils.clamp((Date.now() - spinStart.current) / SPIN_DURATION, 0, 1);
      right.rotation.set(0.2, -Math.PI + sp * Math.PI * 2, 0);
      left.rotation.set(-0.5, 0.3, 0);
      return;
    }
    wasSpinning.current = false;

    if (store.isAttacking) {
      const progress = THREE.MathUtils.clamp((Date.now() - store.lastAttackTime) / 400, 0, 1);
      const e = swingEase(progress);
      const e01 = THREE.MathUtils.clamp((e + 0.3) / 1.3, 0, 1);
      if (store.comboStep === 1) {
        // Horizontal slash, right to left
        right.rotation.set(
          THREE.MathUtils.lerp(0.35, 0.05, e01),
          THREE.MathUtils.lerp(-1.15, 1.05, e01),
          THREE.MathUtils.lerp(-0.4, 0.5, e01)
        );
        left.rotation.set(-0.45 - 0.25 * e01, 0.25, 0.15);
      } else if (store.comboStep === 2) {
        // Backhand, left to right
        right.rotation.set(
          THREE.MathUtils.lerp(0.3, 0.05, e01),
          THREE.MathUtils.lerp(0.95, -1.25, e01),
          THREE.MathUtils.lerp(0.45, -0.5, e01)
        );
        left.rotation.set(-0.45 - 0.25 * e01, 0.25, 0.15);
      } else {
        // Overhead chop: raise high behind, slam down through center
        right.rotation.set(
          THREE.MathUtils.lerp(1.7, -0.75, e01),
          THREE.MathUtils.lerp(-0.15, 0.05, e01),
          0
        );
        left.rotation.set(THREE.MathUtils.lerp(-0.45, -0.9, e01), 0.35, 0.2);
      }
      return;
    }

    // Idle / charge pose — Minecraft-style: blade angled upward across the
    // lower-right of the view, not pointing down-range. Charging pulls it back.
    const charge = store.isMeleeCharging ? store.meleeCharge : 0;
    const tremble = charge > 0 ? Math.sin(t * 45) * 0.02 * charge : 0;
    const idleSway = Math.sin(t * 1.6) * 0.03;
    right.rotation.x = THREE.MathUtils.lerp(right.rotation.x, 1.15 + idleSway + charge * 0.45 + tremble, 0.15);
    right.rotation.y = THREE.MathUtils.lerp(right.rotation.y, -0.5 - charge * 0.4, 0.15);
    right.rotation.z = THREE.MathUtils.lerp(right.rotation.z, -0.3 + tremble, 0.15);
    left.rotation.x = THREE.MathUtils.lerp(left.rotation.x, -0.45 + idleSway * 0.7, 0.12);
    left.rotation.y = THREE.MathUtils.lerp(left.rotation.y, 0.25, 0.12);
    left.rotation.z = THREE.MathUtils.lerp(left.rotation.z, 0.15, 0.12);
  });

  return (
    <group ref={groupRef}>
      <group ref={rigRef}>
        {/* Right arm holding the sword */}
        <group ref={rightPivotRef} position={[0.38, -0.32, -0.25]}>
          <mesh position={[0, 0, -0.28]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.055, 0.07, 0.5, 10]} />
            <primitive object={suitBlueMat} attach="material" />
          </mesh>
          <mesh position={[0, 0, -0.06]}>
            <sphereGeometry args={[0.075, 10, 8]} />
            <primitive object={furMat} attach="material" />
          </mesh>
          <mesh position={[0, 0, -0.55]}>
            <sphereGeometry args={[0.095, 12, 10]} />
            <primitive object={gloveMat} attach="material" />
          </mesh>
          {/* Same DreadSword as third person; wrapper flips it to point down-range */}
          <group position={[0, -0.02, -0.56]} rotation={[0, Math.PI, 0]} scale={0.7}>
            <DreadSword
              isAttacking={isAttacking}
              isSpinning={isSpinning}
              isCharging={isMeleeCharging}
              charge={meleeCharge}
              comboStep={comboStep}
              lastAttackTime={lastAttackTime}
              tipRef={fpTipRef}
              baseRef={fpBaseRef}
            />
          </group>
        </group>

        {/* Left arm — free hand for balance */}
        <group ref={leftPivotRef} position={[-0.38, -0.34, -0.25]}>
          <mesh position={[0, 0, -0.24]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.05, 0.065, 0.42, 10]} />
            <primitive object={suitBlueMat} attach="material" />
          </mesh>
          <mesh position={[0, 0, -0.05]}>
            <sphereGeometry args={[0.07, 10, 8]} />
            <primitive object={furMat} attach="material" />
          </mesh>
          <mesh position={[0, 0, -0.47]}>
            <sphereGeometry args={[0.085, 12, 10]} />
            <primitive object={gloveMat} attach="material" />
          </mesh>
        </group>
      </group>
    </group>
  );
};

interface SquirrelModelProps {
  comboStep: number;
  lastAttackTime: number;
  isMoving: boolean;
  isDodging: boolean;
  isStanceActive: boolean;
  isKamehamehaCharging: boolean;
  isKamehamehaFiring: boolean;
  kamehamehaCharge: number;
  isMeleeCharging: boolean;
  meleeCharge: number;
  isAttacking: boolean;
  isSpinning: boolean;
  moveSpeed: number;
  verticalVelocity: number;
  isGrounded: boolean;
}

const SquirrelModel: React.FC<SquirrelModelProps & { swordTipRef: React.RefObject<THREE.Group>; swordBaseRef: React.RefObject<THREE.Group> }> = ({ 
    comboStep, lastAttackTime, isMoving, isDodging, isStanceActive, 
    isKamehamehaCharging, isKamehamehaFiring, kamehamehaCharge,
    isMeleeCharging, meleeCharge, isAttacking, isSpinning, moveSpeed, verticalVelocity, isGrounded, swordTipRef, swordBaseRef 
}) => {
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftKneeRef = useRef<THREE.Group>(null);
  const rightKneeRef = useRef<THREE.Group>(null);
  const leftFootRef = useRef<THREE.Group>(null);
  const rightFootRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const swordPivotRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Group>(null);
  const overallScaleRef = useRef<THREE.Group>(null);
  
  const isHitStopping = useGameStore(s => s.isHitStopping);
  const dodgeRotation = useRef(0);
  const [attackProgress, setAttackProgress] = useState(0);
  const tmpVec3 = useMemo(() => new THREE.Vector3(), []);

  // Procedural Animation States
  const jumpStretch = useRef(1);
  const landSquash = useRef(1);
  const lastIsGrounded = useRef(true);
  const jumpPhase = useRef<'ground' | 'takeoff' | 'air' | 'land'>('ground');
  const jumpPhaseTime = useRef(0);
  const walkCycle = useRef(0);
  const lastJumpKeyDown = useRef(false);

  // Materials — russet squirrel + classic Saiyan armor (white cuirass, gold pads, royal-blue undersuit)
  const furMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#96602e', roughness: 0.95 }), []);
  const furDarkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7a4c22', roughness: 0.95 }), []);
  const bellyMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e3cba4', roughness: 0.9 }), []);
  const armorWhiteMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f2f4f7', roughness: 0.25, metalness: 0.15 }), []);
  const suitBlueMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1e3f9e', roughness: 0.6 }), []);
  const armorGoldMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e0a92e', roughness: 0.35, metalness: 0.45 }), []);
  const eyeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#17110b', roughness: 0.35 }), []);
  const eyeShineMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2 }), []);
  const browMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a2e14', roughness: 0.9 }), []);
  const noseMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2f2320', roughness: 0.5 }), []);
  const earInnerMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c99b74', roughness: 0.9 }), []);
  const toothMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.4 }), []);

  useFrame((state, delta) => {
    if (isHitStopping) return;
    const t = state.clock.getElapsedTime();
    const timeSinceAttack = Date.now() - lastAttackTime;
    const progress = Math.min(timeSinceAttack / 400, 1);
    setAttackProgress(progress);

    // --- Jump & Landing Procedural Animation ---
    jumpPhaseTime.current += delta;

    if (!isGrounded && lastIsGrounded.current) {
        // Just left the ground: quick crouch / takeoff
        jumpPhase.current = 'takeoff';
        jumpPhaseTime.current = 0;
        jumpStretch.current = 1.3;
    }
    if (isGrounded && !lastIsGrounded.current) {
        // Just landed: brief squash
        jumpPhase.current = 'land';
        jumpPhaseTime.current = 0;
        landSquash.current = 0.7;
    }

    // Progress phases over time
    if (jumpPhase.current === 'takeoff' && jumpPhaseTime.current > 0.12 && !isGrounded) {
        jumpPhase.current = 'air';
    }
    if (jumpPhase.current === 'land' && jumpPhaseTime.current > 0.18) {
        jumpPhase.current = 'ground';
    }

    lastIsGrounded.current = isGrounded;

    jumpStretch.current = THREE.MathUtils.lerp(jumpStretch.current, 1.0, 0.15);
    landSquash.current = THREE.MathUtils.lerp(landSquash.current, 1.0, 0.15);

    if (overallScaleRef.current) {
        const targetScaleY = jumpStretch.current * landSquash.current;
        const targetScaleXZ = 1.0 / Math.sqrt(targetScaleY); 
        overallScaleRef.current.scale.set(targetScaleXZ, targetScaleY, targetScaleXZ);
    }

    // Pose tweaks per jump phase
    if (bodyRef.current) {
        if (jumpPhase.current === 'takeoff') {
            bodyRef.current.position.y = THREE.MathUtils.lerp(bodyRef.current.position.y, BODY_Y - 0.15, 0.3);
        } else if (jumpPhase.current === 'air') {
            bodyRef.current.position.y = THREE.MathUtils.lerp(bodyRef.current.position.y, BODY_Y + 0.1, 0.2);
        }
    }
    if (leftLegRef.current && rightLegRef.current) {
        if (jumpPhase.current === 'takeoff') {
            leftLegRef.current.rotation.x = THREE.MathUtils.lerp(leftLegRef.current.rotation.x, -0.6, 0.3);
            rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, -0.6, 0.3);
        } else if (jumpPhase.current === 'air') {
            leftLegRef.current.rotation.x = THREE.MathUtils.lerp(leftLegRef.current.rotation.x, 0.3, 0.2);
            rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, -0.3, 0.2);
        }
    }

    if (isDodging) {
      // One full forward roll (2π) over the 450ms dodge
      const ROLLS_PER_DODGE = 1;
      const DODGE_DURATION_S = 0.45;
      const dodgeRollSpeed = (ROLLS_PER_DODGE * Math.PI * 2) / DODGE_DURATION_S;
      dodgeRotation.current += delta * dodgeRollSpeed;
      if (bodyRef.current) {
        bodyRef.current.rotation.x = dodgeRotation.current;
        bodyRef.current.position.y = 0.62;
      }
    } else {
      dodgeRotation.current = 0;
      if (bodyRef.current) {
        // Snap to landed pose so we don't lerp backwards after a full forward roll
        bodyRef.current.rotation.x = isMoving ? 0.12 : 0;
        if (isSpinning) {
            const spinProgress = Math.min(timeSinceAttack / SPIN_DURATION, 1);
            bodyRef.current.rotation.y = THREE.MathUtils.smoothstep(spinProgress, 0, 1) * Math.PI * 2;
        } else if (!isAttacking) {
            bodyRef.current.rotation.y = THREE.MathUtils.lerp(bodyRef.current.rotation.y, 0, 0.2);
        }
      }
    }

    // --- KAMEHAMEHA POSE LOGIC ---
    if (isKamehamehaCharging || isKamehamehaFiring) {
        // Bring arms together in front
        if (leftArmRef.current) {
            leftArmRef.current.rotation.z = -0.5;
            leftArmRef.current.rotation.y = -0.8;
            leftArmRef.current.position.lerp(new THREE.Vector3(-0.25, 0.3, 0.4), 0.2);
        }
        if (rightArmRef.current) {
            rightArmRef.current.rotation.z = 0.5;
            rightArmRef.current.rotation.y = 0.8;
            rightArmRef.current.position.lerp(new THREE.Vector3(0.25, 0.3, 0.4), 0.2);
            if(swordPivotRef.current) swordPivotRef.current.rotation.x = Math.PI;
        }
        if (isKamehamehaFiring && bodyRef.current) {
            bodyRef.current.position.x = (Math.random() - 0.5) * 0.05;
            bodyRef.current.position.z = (Math.random() - 0.5) * 0.05;
        }
        return; 
    }

    // --- WALKING ANIMATION ---
    // Drive this purely from actual movement speed so it always plays when you move,
    // even if grounding flags are a bit off.
    const crouch = isStanceActive ? 0.14 : 0;
    const isWalkingNow = moveSpeed > 0.1 && !isDodging;
    if (isWalkingNow) {
        const speed01 = THREE.MathUtils.clamp(moveSpeed / 12, 0, 1);
        const cycleSpeed = THREE.MathUtils.lerp(7, 13, speed01);
        const hipAmp = THREE.MathUtils.lerp(0.3, 0.52, speed01);
        const stepLift = THREE.MathUtils.lerp(0.05, 0.13, speed01);
        const stride = THREE.MathUtils.lerp(0.04, 0.1, speed01);
        const kneeAmp = THREE.MathUtils.lerp(0.5, 0.95, speed01);

        walkCycle.current += delta * cycleSpeed;

        const phaseL = walkCycle.current;
        const phaseR = walkCycle.current + Math.PI;

        const animateLeg = (
            phase: number, baseX: number,
            leg: THREE.Group | null, knee: THREE.Group | null, foot: THREE.Group | null
        ) => {
            if (!leg) return;
            const s = Math.sin(phase);
            const swing = s * hipAmp;
            // Swing-forward leg lifts and bends its knee; support leg stays straight.
            const lift = Math.max(0, s) * stepLift;
            const kneeBend = Math.max(0, s) * kneeAmp;
            // Planted leg: pull the whole leg down by the arc height so the sole
            // stays on the ground instead of sweeping above it (the old "floating").
            const plantComp = s < 0 ? -(1 - Math.cos(swing)) * LEG_REACH : 0;
            leg.rotation.x = swing;
            leg.position.set(baseX, HIP_Y + lift + plantComp, Math.cos(phase) * stride);
            if (knee) knee.rotation.x = kneeBend;
            // Keep the sole level with the ground through the cycle
            if (foot) foot.rotation.x = -(swing + kneeBend) * 0.7;
        };

        animateLeg(phaseL, -0.18, leftLegRef.current, leftKneeRef.current, leftFootRef.current);
        animateLeg(phaseR, 0.18, rightLegRef.current, rightKneeRef.current, rightFootRef.current);

        // Arms: opposite to legs, with a touch of sideways sway
        const armSwing = THREE.MathUtils.lerp(0.35, 0.7, speed01);
        if (leftArmRef.current) {
            leftArmRef.current.rotation.x = Math.sin(phaseR) * armSwing;
            leftArmRef.current.rotation.z = 0.1 + Math.sin(phaseR) * 0.05;
        }
        if (rightArmRef.current && !isAttacking && !isSpinning) rightArmRef.current.rotation.x = Math.sin(phaseL) * armSwing;

        // Body: dip slightly on each foot contact (|cos| peaks at contact), light sway
        if (bodyRef.current) {
            bodyRef.current.position.y = BODY_Y - crouch - Math.abs(Math.cos(walkCycle.current)) * 0.035;
            bodyRef.current.rotation.z = Math.cos(walkCycle.current) * 0.025;
        }
    } else if (!isGrounded) {
        // Airborne tuck: legs asymmetric, knees bent
        if (leftLegRef.current) {
            leftLegRef.current.rotation.x = THREE.MathUtils.lerp(leftLegRef.current.rotation.x, 0.5, 0.2);
            leftLegRef.current.position.lerp(tmpVec3.set(-0.18, HIP_Y + 0.06, 0.02), 0.2);
        }
        if (rightLegRef.current) {
            rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, -0.3, 0.2);
            rightLegRef.current.position.lerp(tmpVec3.set(0.18, HIP_Y + 0.03, -0.02), 0.2);
        }
        if (leftKneeRef.current) leftKneeRef.current.rotation.x = THREE.MathUtils.lerp(leftKneeRef.current.rotation.x, 0.9, 0.2);
        if (rightKneeRef.current) rightKneeRef.current.rotation.x = THREE.MathUtils.lerp(rightKneeRef.current.rotation.x, 0.5, 0.2);
        if (leftFootRef.current) leftFootRef.current.rotation.x = -0.3;
        if (rightFootRef.current) rightFootRef.current.rotation.x = -0.2;
        if (bodyRef.current) bodyRef.current.position.y = BODY_Y;
    } else {
        // Idle: settle to rest pose (soles flat at ground), soft breathing
        if (leftLegRef.current) {
            leftLegRef.current.rotation.x = THREE.MathUtils.lerp(leftLegRef.current.rotation.x, 0, 0.2);
            leftLegRef.current.position.lerp(tmpVec3.set(-0.18, HIP_Y, 0), 0.2);
        }
        if (rightLegRef.current) {
            rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, 0, 0.2);
            rightLegRef.current.position.lerp(tmpVec3.set(0.18, HIP_Y, 0), 0.2);
        }
        if (leftKneeRef.current) leftKneeRef.current.rotation.x = THREE.MathUtils.lerp(leftKneeRef.current.rotation.x, 0, 0.2);
        if (rightKneeRef.current) rightKneeRef.current.rotation.x = THREE.MathUtils.lerp(rightKneeRef.current.rotation.x, 0, 0.2);
        if (leftFootRef.current) leftFootRef.current.rotation.x = THREE.MathUtils.lerp(leftFootRef.current.rotation.x, 0, 0.2);
        if (rightFootRef.current) rightFootRef.current.rotation.x = THREE.MathUtils.lerp(rightFootRef.current.rotation.x, 0, 0.2);
        if (leftArmRef.current) {
            leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, 0, 0.2);
            leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, 0.08, 0.2);
        }

        if (bodyRef.current) {
             bodyRef.current.position.y = BODY_Y - crouch + Math.sin(t * 2) * 0.006;
             bodyRef.current.rotation.z = THREE.MathUtils.lerp(bodyRef.current.rotation.z, 0, 0.1);
        }
    }

    // --- SWORD ARM LOGIC ---
    if (rightArmRef.current && swordPivotRef.current) {
      // Arms: only rotate around the shoulder pivot so they always stay attached.
      // Sword: always attached to the hand; we just change its rotation for stance/attacks.

      if (isSpinning) {
          // Big circular spin: arm slightly lifted, sword out
          rightArmRef.current.rotation.x = -0.6;
          rightArmRef.current.rotation.y = 0.3;
          swordPivotRef.current.rotation.set(-Math.PI / 2, 0, 0);
      } else if (isAttacking && comboStep > 0) {
        // Eased swing: windup pulls back past the start, strike whips through fast,
        // then holds in follow-through. Torso twists with the blade for weight.
        const e = swingEase(progress);
        const e01 = THREE.MathUtils.clamp((e + 0.3) / 1.3, 0, 1);

        if (comboStep === 1) {
            // Horizontal right-to-left slash
            rightArmRef.current.rotation.x = THREE.MathUtils.lerp(-0.2, -0.55, e01);
            rightArmRef.current.rotation.y = THREE.MathUtils.lerp(0.55, 0.05, e01);
            swordPivotRef.current.rotation.set(-Math.PI / 2, 0.9 + (-1.7 - 0.9) * e, 0);
            if (bodyRef.current) {
                bodyRef.current.rotation.y = 0.4 - 0.85 * e01;
                bodyRef.current.rotation.x = (isMoving ? 0.12 : 0) + 0.08 * Math.sin(e01 * Math.PI);
            }
        } else if (comboStep === 2) {
            // Return slash left-to-right
            rightArmRef.current.rotation.x = THREE.MathUtils.lerp(-0.15, -0.45, e01);
            rightArmRef.current.rotation.y = THREE.MathUtils.lerp(-0.5, 0.0, e01);
            swordPivotRef.current.rotation.set(-Math.PI / 2, -1.7 + (0.9 + 1.7) * e, 0);
            if (bodyRef.current) {
                bodyRef.current.rotation.y = -0.4 + 0.85 * e01;
                bodyRef.current.rotation.x = (isMoving ? 0.12 : 0) + 0.08 * Math.sin(e01 * Math.PI);
            }
        } else if (comboStep === 3) {
            // Overhead chop: rear back, then slam down with a forward lean
            rightArmRef.current.rotation.x = THREE.MathUtils.lerp(-1.6, -0.6, e01);
            rightArmRef.current.rotation.y = THREE.MathUtils.lerp(0.1, 0, e01);
            swordPivotRef.current.rotation.set(-2.6 + 2.8 * e, -0.15, 0);
            if (bodyRef.current) {
                bodyRef.current.rotation.x = THREE.MathUtils.lerp(-0.14, 0.32, e01);
                bodyRef.current.rotation.y = THREE.MathUtils.lerp(bodyRef.current.rotation.y, 0, 0.3);
            }
        }
      } else {
        // Idle / walk: arms relaxed at sides, sword angled down slightly
        if (!isMoving && !isAttacking && !isSpinning) {
            rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, 0, 0.25);
            rightArmRef.current.rotation.y = THREE.MathUtils.lerp(rightArmRef.current.rotation.y, 0.05, 0.25);
        }
        swordPivotRef.current.rotation.x = THREE.MathUtils.lerp(
            swordPivotRef.current.rotation.x,
            isStanceActive ? -Math.PI / 2 : -Math.PI / 3,
            0.15
        );
        swordPivotRef.current.rotation.y = THREE.MathUtils.lerp(swordPivotRef.current.rotation.y, 0, 0.15);
      }

      // Reset Left Arm if not special action or moving
      if (leftArmRef.current && !isMoving && !isAttacking && !isSpinning) {
          leftArmRef.current.rotation.set(0, 0, 0);
      }
    }

    // --- TAIL ANIMATION ---
    if (tailRef.current) {
        const tailSpeed = isMoving ? 10 : 2.2;
        const tailAmp = isMoving ? 0.12 : 0.06;
        let tailX = -0.15 + Math.sin(t * tailSpeed) * tailAmp;
        let tailY = Math.cos(t * tailSpeed * 0.5) * tailAmp * 1.6;
        // Counter-whip opposite the sword swing for weight
        if (isAttacking && comboStep > 0) {
            const whip = Math.sin(Math.min(progress, 1) * Math.PI) * 0.55;
            tailY += comboStep === 2 ? -whip : whip;
            if (comboStep === 3) tailX -= whip * 0.6;
        }
        tailRef.current.rotation.x = tailX;
        tailRef.current.rotation.y = tailY;
    }

    // --- HEAD ANIMATION ---
    if (headRef.current) {
        headRef.current.rotation.y = Math.sin(t * 1) * 0.05; // Subtle look around
        headRef.current.rotation.z = Math.cos(t * 0.8) * 0.02;
    }
  });

  return (
    <group position={[0, 0, 0]} name="player-model-root">
      {isAttacking && comboStep > 0 && attackProgress < 1 && (
        <SlashArc
          comboStep={comboStep}
          progress={THREE.MathUtils.clamp((attackProgress - SWING_WINDUP_END) / (SWING_STRIKE_END - SWING_WINDUP_END + 0.25), 0, 1)}
        />
      )}
      
      <group ref={overallScaleRef}>
        <group ref={bodyRef} position={[0, BODY_Y, 0]}>

            {/* --- TORSO: fur core with cream belly showing below the armor --- */}
            <mesh castShadow receiveShadow>
                <capsuleGeometry args={[0.28, 0.34, 4, 16]} />
                <primitive object={furMaterial} attach="material" />
            </mesh>
            <mesh position={[0, -0.22, 0.14]} scale={[0.75, 0.8, 0.55]}>
                <sphereGeometry args={[0.24, 14, 12]} />
                <primitive object={bellyMaterial} attach="material" />
            </mesh>

            {/* --- SAIYAN ARMOR --- */}
            {/* White cuirass: rounded shell over the chest */}
            <mesh castShadow position={[0, 0.09, 0.01]} scale={[1, 0.8, 0.9]}>
                <sphereGeometry args={[0.345, 20, 16]} />
                <primitive object={armorWhiteMat} attach="material" />
            </mesh>
            {/* Gold shoulder pauldrons curving over the shoulders */}
            <mesh castShadow position={[-0.32, 0.27, 0]} scale={[1.25, 0.65, 1.05]}>
                <sphereGeometry args={[0.14, 14, 12]} />
                <primitive object={armorGoldMat} attach="material" />
            </mesh>
            <mesh castShadow position={[0.32, 0.27, 0]} scale={[1.25, 0.65, 1.05]}>
                <sphereGeometry args={[0.14, 14, 12]} />
                <primitive object={armorGoldMat} attach="material" />
            </mesh>
            {/* Gold abdominal plates */}
            <mesh castShadow position={[0, -0.14, 0.155]} rotation={[0.12, 0, 0]}>
                <boxGeometry args={[0.36, 0.09, 0.2]} />
                <primitive object={armorGoldMat} attach="material" />
            </mesh>
            <mesh castShadow position={[0, -0.24, 0.13]} rotation={[0.22, 0, 0]}>
                <boxGeometry args={[0.3, 0.08, 0.18]} />
                <primitive object={armorGoldMat} attach="material" />
            </mesh>
            {/* Blue waistband + gold crotch plate */}
            <mesh position={[0, -0.34, 0]}>
                <cylinderGeometry args={[0.245, 0.26, 0.1, 16]} />
                <primitive object={suitBlueMat} attach="material" />
            </mesh>
            <mesh castShadow position={[0, -0.42, 0.1]} rotation={[0.35, 0, 0]}>
                <boxGeometry args={[0.18, 0.12, 0.1]} />
                <primitive object={armorGoldMat} attach="material" />
            </mesh>

            {/* --- HEAD --- */}
            <group ref={headRef} position={[0, 0.52, 0]}>
                <mesh castShadow scale={[1, 0.95, 0.95]}>
                    <sphereGeometry args={[0.3, 20, 18]} />
                    <primitive object={furMaterial} attach="material" />
                </mesh>
                {/* Chubby cheeks */}
                <mesh position={[-0.14, -0.1, 0.19]} castShadow>
                    <sphereGeometry args={[0.1, 12, 10]} />
                    <primitive object={bellyMaterial} attach="material" />
                </mesh>
                <mesh position={[0.14, -0.1, 0.19]} castShadow>
                    <sphereGeometry args={[0.1, 12, 10]} />
                    <primitive object={bellyMaterial} attach="material" />
                </mesh>
                {/* Snout */}
                <mesh position={[0, -0.06, 0.24]} castShadow>
                    <sphereGeometry args={[0.125, 14, 12]} />
                    <primitive object={bellyMaterial} attach="material" />
                </mesh>
                {/* Nose */}
                <mesh position={[0, -0.01, 0.36]}>
                    <sphereGeometry args={[0.035, 8, 8]} />
                    <primitive object={noseMat} attach="material" />
                </mesh>
                {/* Buck teeth: two, slightly apart */}
                <mesh position={[-0.02, -0.14, 0.33]}>
                    <boxGeometry args={[0.032, 0.055, 0.015]} />
                    <primitive object={toothMat} attach="material" />
                </mesh>
                <mesh position={[0.02, -0.14, 0.33]}>
                    <boxGeometry args={[0.032, 0.055, 0.015]} />
                    <primitive object={toothMat} attach="material" />
                </mesh>
                {/* Beady eyes with highlights */}
                <mesh position={[-0.125, 0.06, 0.235]}>
                    <sphereGeometry args={[0.07, 12, 10]} />
                    <primitive object={eyeMat} attach="material" />
                </mesh>
                <mesh position={[-0.105, 0.085, 0.29]}>
                    <sphereGeometry args={[0.02, 6, 6]} />
                    <primitive object={eyeShineMat} attach="material" />
                </mesh>
                <mesh position={[0.125, 0.06, 0.235]}>
                    <sphereGeometry args={[0.07, 12, 10]} />
                    <primitive object={eyeMat} attach="material" />
                </mesh>
                <mesh position={[0.145, 0.085, 0.29]}>
                    <sphereGeometry args={[0.02, 6, 6]} />
                    <primitive object={eyeShineMat} attach="material" />
                </mesh>
                {/* Vegeta scowl brows */}
                <mesh position={[-0.12, 0.16, 0.24]} rotation={[0, 0, -0.42]}>
                    <boxGeometry args={[0.12, 0.03, 0.03]} />
                    <primitive object={browMat} attach="material" />
                </mesh>
                <mesh position={[0.12, 0.16, 0.24]} rotation={[0, 0, 0.42]}>
                    <boxGeometry args={[0.12, 0.03, 0.03]} />
                    <primitive object={browMat} attach="material" />
                </mesh>
                {/* Whiskers */}
                {[-1, 1].map((side) => (
                    <group key={side}>
                        <mesh position={[side * 0.2, -0.05, 0.26]} rotation={[0, side * -0.35, 0.12]}>
                            <boxGeometry args={[0.2, 0.006, 0.006]} />
                            <primitive object={eyeShineMat} attach="material" />
                        </mesh>
                        <mesh position={[side * 0.2, -0.09, 0.26]} rotation={[0, side * -0.35, 0]}>
                            <boxGeometry args={[0.22, 0.006, 0.006]} />
                            <primitive object={eyeShineMat} attach="material" />
                        </mesh>
                        <mesh position={[side * 0.19, -0.13, 0.25]} rotation={[0, side * -0.35, -0.12]}>
                            <boxGeometry args={[0.19, 0.006, 0.006]} />
                            <primitive object={eyeShineMat} attach="material" />
                        </mesh>
                    </group>
                ))}
                {/* Vegeta flame hair: swept-up spikes */}
                <mesh position={[0, 0.36, 0]} rotation={[-0.18, 0, 0]} castShadow>
                    <coneGeometry args={[0.1, 0.32, 8]} />
                    <primitive object={furDarkMaterial} attach="material" />
                </mesh>
                <mesh position={[-0.1, 0.32, -0.03]} rotation={[-0.25, 0, 0.3]} castShadow>
                    <coneGeometry args={[0.08, 0.25, 8]} />
                    <primitive object={furDarkMaterial} attach="material" />
                </mesh>
                <mesh position={[0.1, 0.32, -0.03]} rotation={[-0.25, 0, -0.3]} castShadow>
                    <coneGeometry args={[0.08, 0.25, 8]} />
                    <primitive object={furDarkMaterial} attach="material" />
                </mesh>
                <mesh position={[-0.05, 0.31, 0.1]} rotation={[0.12, 0, 0.15]}>
                    <coneGeometry args={[0.06, 0.18, 8]} />
                    <primitive object={furDarkMaterial} attach="material" />
                </mesh>
                <mesh position={[0.05, 0.31, 0.1]} rotation={[0.12, 0, -0.15]}>
                    <coneGeometry args={[0.06, 0.18, 8]} />
                    <primitive object={furDarkMaterial} attach="material" />
                </mesh>
                {/* Tufted ears with inner panels */}
                {[-1, 1].map((side) => (
                    <group key={`ear${side}`} position={[side * 0.19, 0.24, -0.02]} rotation={[0, 0, side * -0.3]}>
                        <mesh castShadow>
                            <capsuleGeometry args={[0.07, 0.14, 4, 8]} />
                            <primitive object={furMaterial} attach="material" />
                        </mesh>
                        <mesh position={[0, 0.01, 0.045]} scale={[0.6, 0.75, 0.4]}>
                            <sphereGeometry args={[0.07, 8, 8]} />
                            <primitive object={earInnerMat} attach="material" />
                        </mesh>
                        <mesh position={[0, 0.14, 0]}>
                            <coneGeometry args={[0.032, 0.09, 6]} />
                            <primitive object={furDarkMaterial} attach="material" />
                        </mesh>
                    </group>
                ))}
            </group>

            {/* --- BUSHY TAIL: layered S-curve, cream tip --- */}
            <group ref={tailRef} position={[0, -0.28, -0.26]}>
                <mesh position={[0, 0, -0.1]} castShadow>
                    <sphereGeometry args={[0.18, 12, 10]} />
                    <primitive object={furDarkMaterial} attach="material" />
                </mesh>
                <mesh position={[0, 0.32, -0.26]} scale={[1, 1.2, 1]} castShadow>
                    <sphereGeometry args={[0.28, 16, 14]} />
                    <primitive object={furMaterial} attach="material" />
                </mesh>
                <mesh position={[0, 0.72, -0.2]} scale={[1, 1.15, 1]} castShadow>
                    <sphereGeometry args={[0.29, 16, 14]} />
                    <primitive object={furMaterial} attach="material" />
                </mesh>
                <mesh position={[0, 1.04, -0.04]} castShadow>
                    <sphereGeometry args={[0.21, 14, 12]} />
                    <primitive object={furMaterial} attach="material" />
                </mesh>
                <mesh position={[0, 1.2, 0.08]} castShadow>
                    <sphereGeometry args={[0.13, 12, 10]} />
                    <primitive object={bellyMaterial} attach="material" />
                </mesh>
            </group>

            {/* --- ARMS: blue undersuit, white gloves --- */}
            <group ref={leftArmRef} position={[-0.35, 0.24, 0.08]}>
                <mesh position={[0, -0.12, 0]} castShadow>
                    <capsuleGeometry args={[0.08, 0.18, 4, 10]} />
                    <primitive object={suitBlueMat} attach="material" />
                </mesh>
                <mesh position={[0, -0.3, 0.01]} castShadow>
                    <capsuleGeometry args={[0.07, 0.14, 4, 10]} />
                    <primitive object={suitBlueMat} attach="material" />
                </mesh>
                <mesh position={[0, -0.38, 0.01]}>
                    <cylinderGeometry args={[0.085, 0.095, 0.06, 10]} />
                    <primitive object={armorWhiteMat} attach="material" />
                </mesh>
                <mesh position={[0, -0.45, 0.01]} castShadow>
                    <sphereGeometry args={[0.095, 12, 10]} />
                    <primitive object={armorWhiteMat} attach="material" />
                </mesh>
            </group>
            <group ref={rightArmRef} position={[0.35, 0.24, 0.08]}>
                <mesh position={[0, -0.12, 0]} castShadow>
                    <capsuleGeometry args={[0.08, 0.18, 4, 10]} />
                    <primitive object={suitBlueMat} attach="material" />
                </mesh>
                <mesh position={[0, -0.3, 0.01]} castShadow>
                    <capsuleGeometry args={[0.07, 0.14, 4, 10]} />
                    <primitive object={suitBlueMat} attach="material" />
                </mesh>
                <mesh position={[0, -0.38, 0.01]}>
                    <cylinderGeometry args={[0.085, 0.095, 0.06, 10]} />
                    <primitive object={armorWhiteMat} attach="material" />
                </mesh>
                <mesh position={[0, -0.45, 0.01]} castShadow>
                    <sphereGeometry args={[0.095, 12, 10]} />
                    <primitive object={armorWhiteMat} attach="material" />
                </mesh>
                {/* Sword attaches at the glove */}
                <group ref={swordPivotRef} position={[0, -0.46, 0.02]}>
                    <DreadSword
                        tipRef={swordTipRef}
                        baseRef={swordBaseRef}
                        isAttacking={isAttacking} isSpinning={isSpinning} isCharging={isMeleeCharging} charge={meleeCharge} comboStep={comboStep} lastAttackTime={lastAttackTime}
                    />
                </group>
            </group>

        </group>

        {/* --- LEGS: thigh -> knee -> shin -> boot; soles rest at y=0 --- */}
        <group ref={leftLegRef} position={[-0.18, HIP_Y, 0]}>
            <mesh position={[0, -0.13, 0]} castShadow>
                <capsuleGeometry args={[0.1, 0.2, 4, 10]} />
                <primitive object={suitBlueMat} attach="material" />
            </mesh>
            <group ref={leftKneeRef} position={[0, -0.26, 0]}>
                <mesh position={[0, -0.09, 0.01]} castShadow>
                    <capsuleGeometry args={[0.075, 0.14, 4, 10]} />
                    <primitive object={suitBlueMat} attach="material" />
                </mesh>
                <group ref={leftFootRef} position={[0, -0.2, 0]}>
                    <mesh position={[0, 0, 0.05]} castShadow>
                        <boxGeometry args={[0.19, 0.12, 0.3]} />
                        <primitive object={armorWhiteMat} attach="material" />
                    </mesh>
                    <mesh position={[0, -0.015, 0.2]} castShadow>
                        <boxGeometry args={[0.2, 0.09, 0.1]} />
                        <primitive object={armorGoldMat} attach="material" />
                    </mesh>
                    <mesh position={[0, 0.09, -0.02]}>
                        <cylinderGeometry args={[0.095, 0.11, 0.1, 10]} />
                        <primitive object={armorWhiteMat} attach="material" />
                    </mesh>
                </group>
            </group>
        </group>
        <group ref={rightLegRef} position={[0.18, HIP_Y, 0]}>
            <mesh position={[0, -0.13, 0]} castShadow>
                <capsuleGeometry args={[0.1, 0.2, 4, 10]} />
                <primitive object={suitBlueMat} attach="material" />
            </mesh>
            <group ref={rightKneeRef} position={[0, -0.26, 0]}>
                <mesh position={[0, -0.09, 0.01]} castShadow>
                    <capsuleGeometry args={[0.075, 0.14, 4, 10]} />
                    <primitive object={suitBlueMat} attach="material" />
                </mesh>
                <group ref={rightFootRef} position={[0, -0.2, 0]}>
                    <mesh position={[0, 0, 0.05]} castShadow>
                        <boxGeometry args={[0.19, 0.12, 0.3]} />
                        <primitive object={armorWhiteMat} attach="material" />
                    </mesh>
                    <mesh position={[0, -0.015, 0.2]} castShadow>
                        <boxGeometry args={[0.2, 0.09, 0.1]} />
                        <primitive object={armorGoldMat} attach="material" />
                    </mesh>
                    <mesh position={[0, 0.09, -0.02]}>
                        <cylinderGeometry args={[0.095, 0.11, 0.1, 10]} />
                        <primitive object={armorWhiteMat} attach="material" />
                    </mesh>
                </group>
            </group>
        </group>

      </group>
      <SprintParticles active={isMoving && moveSpeed > 0.5 && isGrounded} velocity={moveSpeed} />
    </group>
  );
};

export const Player: React.FC<{ setPlayerRef: (ref: THREE.Object3D) => void }> = ({ setPlayerRef }) => {
  const rigidBody = useRef<RapierRigidBody>(null);
  const playerMeshGroup = useRef<THREE.Group>(null);
  const { world, rapier } = useRapier();
  
  const swordTipRef = useRef<THREE.Group>(null);
  const swordBaseRef = useRef<THREE.Group>(null);
  const hitList = useRef<Set<string>>(new Set());
  
  const lastTipPos = useRef(new THREE.Vector3());
  const lastBasePos = useRef(new THREE.Vector3());
  const hasPrevPos = useRef(false);
  const lastJumpKeyDown = useRef(false);

  // Kamehameha Refs
  const kamehamehaTimer = useRef(0);
  const kamehamehaDamageTick = useRef(0);

  const [, getKeys] = useKeyboardControls();
  const { 
    isGameOver, joystickVector, meleeRequestTick, 
    meleeSpinRequestTick, jumpRequestTick, isDodging, 
    isStanceActive, playerSpawnPos, triggerHitImpact, damageEnemy, damageTownNPC, damageEnvironment,
    comboStep, setComboStep, isAttacking, setAttacking, isSpinning, setSpinning, lastAttackTime,
    currentSpeed, isGrounded, isFirstPerson,
    isKamehamehaCharging, isKamehamehaFiring, kamehamehaCharge, setKamehamehaCharging, setKamehamehaFiring, useMana
  } = useGameStore();

  const lastProcessedTicks = useRef({ melee: 0, spin: 0, jump: 0 });

  useEffect(() => { if (playerMeshGroup.current) setPlayerRef(playerMeshGroup.current); }, [setPlayerRef]);

  // Global Space key listener so jumping works reliably even if KeyboardControls focus is weird.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        useGameStore.getState().requestJump();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => { 
    hitList.current.clear(); 
  }, [comboStep, isSpinning]);

  useFrame((state, delta) => {
    if (!rigidBody.current || isGameOver) return;

    const cv = rigidBody.current.linvel();
    const store = useGameStore.getState();
    const currentPos = rigidBody.current.translation();
    livePlayerPosition[0] = currentPos.x;
    livePlayerPosition[1] = currentPos.y;
    livePlayerPosition[2] = currentPos.z;
    let pendingJump = false;

    const ro = { x: currentPos.x, y: currentPos.y + 0.5, z: currentPos.z };
    const downRay = new rapier.Ray(ro, { x: 0, y: -1, z: 0 });
    const rayHit = world.castRay(downRay, 2.5, true, undefined, undefined, undefined, rigidBody.current);
    const toi = rayHit != null ? (rayHit as { toi: number }).toi : null;
    const actuallyGrounded = rayHit != null && toi != null && toi < 1.2;
    useGameStore.setState({ isGrounded: actuallyGrounded });

    // --- KAMEHAMEHA LOGIC ---
    if (isKamehamehaCharging) {
        useGameStore.setState(s => ({ kamehamehaCharge: Math.min(1.0, s.kamehamehaCharge + delta * 0.8) }));
    }

    if (isKamehamehaFiring) {
        kamehamehaTimer.current += delta;
        if (kamehamehaTimer.current > 3.0) { // Beam lasts 3 seconds
            setKamehamehaFiring(false);
            kamehamehaTimer.current = 0;
        } else {
            // BEAM DAMAGE LOGIC
            kamehamehaDamageTick.current += delta;
            if (kamehamehaDamageTick.current > 0.1) { // Damage every 0.1s
                kamehamehaDamageTick.current = 0;
                
                if (playerMeshGroup.current) {
                    const origin = playerMeshGroup.current.position.clone().add(new THREE.Vector3(0, 0.8, 0));
                    // Convert local forward to world direction
                    const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(playerMeshGroup.current.quaternion).normalize();
                    
                    const originR = { x: currentPos.x, y: currentPos.y + 0.8, z: currentPos.z };
                    const dirR = { x: direction.x, y: direction.y, z: direction.z };
                    const beamRay = new rapier.Ray(originR, dirR);
                    
                    // Cast Ray up to 40 units
                    world.castRay(beamRay, 40, true, undefined, undefined, undefined, rigidBody.current, (collider) => {
                        const parent = collider.parent();
                        if (parent && parent.userData) {
                            const data = parent.userData as { type: string; id: string };
                            if (data.type === 'ENEMY') {
                                damageEnemy(data.id, 15, 'KAMEHAMEHA'); // Continuous damage
                                triggerHitImpact(0.1, 0); // No stop, just shake
                                // Push back
                                if (parent) {
                                    const impulse = direction.clone().multiplyScalar(15);
                                    parent.applyImpulse({ x: impulse.x, y: 5, z: impulse.z }, true);
                                }
                            } else if (data.type === 'ENVIRONMENT') {
                                damageEnvironment(data.id, 20);
                            }
                        }
                        return true; // Continue ray to hit multiple enemies in line
                    });
                }
            }
        }
    }

    if ((isAttacking || isSpinning) && swordTipRef.current && swordBaseRef.current) {
        // ... (Existing sword logic remains unchanged) ...
        const curTip = new THREE.Vector3();
        const curBase = new THREE.Vector3();
        swordTipRef.current.getWorldPosition(curTip);
        swordBaseRef.current.getWorldPosition(curBase);

        const currentEnemies = store.enemies;
        const currentTownNPCs = store.townNPCs;
        const currentEnv = store.environmentObjects;

        const samples = hasPrevPos.current ? 4 : 1;
        for (let s = 0; s < samples; s++) {
            const t = s / samples;
            const sampTip = new THREE.Vector3().lerpVectors(lastTipPos.current, curTip, t);
            const sampBase = new THREE.Vector3().lerpVectors(lastBasePos.current, curBase, t);
            const line = new THREE.Line3(sampBase, sampTip);

            currentEnemies.forEach(enemy => {
                if (!enemy || enemy.isDead || hitList.current.has(enemy.id)) return;
                const ePos = new THREE.Vector3(...(liveEnemyPositions[enemy.id] ?? enemy.position));
                ePos.y += 1.0; 
                const closestPoint = new THREE.Vector3();
                line.closestPointToPoint(ePos, true, closestPoint);
                const dist = closestPoint.distanceTo(ePos);
                const hitThreshold = isSpinning ? SPIN_RADIUS : 3.2;
                if (dist < hitThreshold) {
                    hitList.current.add(enemy.id);
                    const damageValue = isSpinning ? 95 : (comboStep === 3 ? 65 : 35);
                    damageEnemy(enemy.id, damageValue, 'SWORD');
                    triggerHitImpact(damageValue > 50 ? 1.0 : 0.6, 80);
                }
            });

            currentTownNPCs.forEach(npc => {
                if (!npc || hitList.current.has(npc.id)) return;
                const nPos = new THREE.Vector3(...(liveTownNPCPositions[npc.id] ?? npc.position));
                nPos.y += 1.0; 
                const closestPoint = new THREE.Vector3();
                line.closestPointToPoint(nPos, true, closestPoint);
                const dist = closestPoint.distanceTo(nPos);
                const hitThreshold = isSpinning ? SPIN_RADIUS : 3.2;
                if (dist < hitThreshold) {
                    hitList.current.add(npc.id);
                    damageTownNPC(npc.id, 25);
                    triggerHitImpact(0.4, 60);
                }
            });

            currentEnv.forEach(obj => {
                if (!obj || obj.isChopped || hitList.current.has(obj.id)) return;
                const oPos = new THREE.Vector3(...obj.position);
                const closestPoint = new THREE.Vector3();
                line.closestPointToPoint(oPos, true, closestPoint);
                if (closestPoint.distanceTo(oPos) < 2.8) {
                    hitList.current.add(obj.id);
                    damageEnvironment(obj.id, 40);
                    triggerHitImpact(0.4, 40);
                }
            });
        }
        
        lastTipPos.current.copy(curTip);
        lastBasePos.current.copy(curBase);
        hasPrevPos.current = true;
    } else {
        hasPrevPos.current = false;
    }

    if (store.isMeleeCharging) {
        useGameStore.setState(s => ({ meleeCharge: Math.min(1.0, s.meleeCharge + delta * 2.0) }));
    }

    if (meleeRequestTick !== lastProcessedTicks.current.melee) { 
        lastProcessedTicks.current.melee = meleeRequestTick; 
        const now = Date.now();
        const nextStep = (now - lastAttackTime < COMBO_WINDOW) ? (comboStep % 3) + 1 : 1;
        setComboStep(nextStep);
        setAttacking(true);
        setTimeout(() => setAttacking(false), 400);
    }
    
    if (meleeSpinRequestTick !== lastProcessedTicks.current.spin) { 
        lastProcessedTicks.current.spin = meleeSpinRequestTick; 
        setSpinning(true);
        setTimeout(() => setSpinning(false), SPIN_DURATION);
    }

    if (jumpRequestTick !== lastProcessedTicks.current.jump) {
        lastProcessedTicks.current.jump = jumpRequestTick;
        // Always schedule a jump on request so Space / button reliably launch the character.
        pendingJump = true;
    }

    try {
        const { forward, backward, left, right, run, jump } = getKeys();
        
        // --- MOVEMENT LOGIC ---
        // If firing Kamehameha, disable movement and rotation
        if (isKamehamehaFiring || isKamehamehaCharging) {
             rigidBody.current.setLinvel({ x: 0, y: cv.y, z: 0 }, true);
             return; // Skip normal movement
        }

        const mv = new THREE.Vector3();
        const cf = new THREE.Vector3(); state.camera.getWorldDirection(cf); cf.y = 0; cf.normalize();
        const cr = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), cf).negate();
        if (forward) mv.add(cf); if (backward) mv.sub(cf); if (left) mv.sub(cr); if (right) mv.add(cr);

        // First person: the body always faces where the camera looks, so sword
        // swings (hit detection still runs on the hidden model) land where you aim.
        if (isFirstPerson && playerMeshGroup.current && cf.lengthSq() > 0.0001) {
            playerMeshGroup.current.quaternion.slerp(
                new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(cf.x, cf.z)), 0.4);
        }
        if (joystickVector?.lengthSq() > 0.01) mv.add(cf.clone().multiplyScalar(-joystickVector.y)).add(cr.clone().multiplyScalar(joystickVector.x));
        
        // --- FINITE VALUE PROTECTION ---
        let vx = Number.isFinite(cv.x) ? cv.x : 0;
        let vy = Number.isFinite(cv.y) ? cv.y : 0;
        let vz = Number.isFinite(cv.z) ? cv.z : 0;

        if (isDodging) {
            const fDir = new THREE.Vector3(0, 0, 1).applyQuaternion(playerMeshGroup.current!.quaternion);
            const dSpeed = MOVEMENT_SPEED * DODGE_SPEED_MULT;
            vx = fDir.x * dSpeed;
            vz = fDir.z * dSpeed;
        } else if (mv.lengthSq() > 0.001 && !isSpinning && !isAttacking) {
            mv.normalize();
            let ts = MOVEMENT_SPEED * (isStanceActive ? STANCE_SPEED_MULT : 1.0);
            if (run) ts *= 1.5;
            vx = mv.x * ts; vz = mv.z * ts;
            if (!isFirstPerson) {
                playerMeshGroup.current!.quaternion.slerp(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(vx, vz)), 0.2);
            }

            // --- ADVANCED TOE-TO-KNEE DUAL RAYCAST STEP-UP LOGIC ---
            const rayDirVec = { x: mv.x, y: 0, z: mv.z };
            const toeRay = new rapier.Ray({ x: currentPos.x, y: currentPos.y + TOE_HEIGHT, z: currentPos.z }, rayDirVec);
            const kneeRay = new rapier.Ray({ x: currentPos.x, y: currentPos.y + KNEE_HEIGHT, z: currentPos.z }, rayDirVec);
            
            const toeHit = world.castRay(toeRay, STEP_CHECK_DIST, true, undefined, undefined, undefined, rigidBody.current);
            const kneeHit = world.castRay(kneeRay, STEP_CHECK_DIST, true, undefined, undefined, undefined, rigidBody.current);

            // CONTINUOUS LIFT: SUSTAINED UPWARD FORCE
            if (toeHit && (toeHit as any).toi < (STEP_CHECK_DIST * 0.95) && (!kneeHit || (kneeHit as any).toi > (STEP_CHECK_DIST * 0.9))) {
                vy = Math.max(vy, 16.0); 
            }
        } else {
            vx = THREE.MathUtils.lerp(cv.x, 0, 0.2); vz = THREE.MathUtils.lerp(cv.z, 0, 0.2);
        }

        // Apply jump after movement adjustments so we don't overwrite it with old Y velocity.
        if (pendingJump) {
            vy = Math.max(vy, JUMP_FORCE);
        }
        
        const nextSpeed = Math.sqrt(vx**2 + vz**2);
        rigidBody.current.setLinvel({ x: vx, y: vy, z: vz }, true);
        useGameStore.setState({ 
            currentSpeed: Number.isFinite(nextSpeed) ? nextSpeed : 0
        });

        // Keyboard jump (Space via KeyboardControls "jump" action) feeds into the same jumpRequestTick used by the UI button.
        if (jump && !lastJumpKeyDown.current) {
            useGameStore.getState().requestJump();
        }
        lastJumpKeyDown.current = jump;
    } catch (e) {}

  });

  // Visual only: offset mesh so feet appear at terrain height when grounded; when in air follow body but never clip below terrain
  useFrame(() => {
    if (!rigidBody.current || !playerMeshGroup.current || isGameOver) return;
    const pos = rigidBody.current.translation();
    const vel = rigidBody.current.linvel();
    const terrainY = getTerrainHeight(pos.x, pos.z);
    const bodyFeetY = pos.y - 0.05;
    const inAir = vel.y > 1 || bodyFeetY > terrainY + 0.4;
    const wantFeetY = inAir ? Math.max(bodyFeetY, terrainY) : terrainY;
    const offsetY = wantFeetY - bodyFeetY;
    playerMeshGroup.current.position.y = -0.05 + offsetY;
  });

  return (
    <>
    <RigidBody
      ref={rigidBody}
      colliders={false}
      position={playerSpawnPos}
      enabledRotations={[false, false, false]}
      friction={0.5}
      restitution={0}
      userData={{ type: 'PLAYER' }}
    >
        <CapsuleCollider args={[0.5, 0.45]} position={[0, 0.9, 0]} contactSkin={0.02} />
        <group ref={playerMeshGroup} position={[0, -0.05, 0]} rotation={[0, Math.PI, 0]}>
            {/* Hidden (not unmounted) in first person: animations and sword hit
                detection keep running on the invisible model */}
            <group visible={!isFirstPerson}>
            <SquirrelModel
                swordTipRef={swordTipRef} swordBaseRef={swordBaseRef}
                comboStep={comboStep} lastAttackTime={lastAttackTime} isMoving={currentSpeed > 0.5} 
                isDodging={isDodging} isStanceActive={isStanceActive} 
                
                isKamehamehaCharging={isKamehamehaCharging}
                isKamehamehaFiring={isKamehamehaFiring}
                kamehamehaCharge={kamehamehaCharge}

                isMeleeCharging={useGameStore.getState().isMeleeCharging}
                meleeCharge={useGameStore.getState().meleeCharge} isAttacking={isAttacking} isSpinning={isSpinning}
                moveSpeed={currentSpeed} verticalVelocity={0} isGrounded={isGrounded}
            />
            </group>
            <SpinVFX active={isSpinning} position={new THREE.Vector3(0, 0.8, 0)} />
            {/* Outside the FP-hidden wrapper so the beam renders in first person too */}
            <KamehamehaVFX isFiring={isKamehamehaFiring} isCharging={isKamehamehaCharging} charge={kamehamehaCharge} />
        </group>
    </RigidBody>
    {isFirstPerson && <FirstPersonArms />}
    </>
  );
};
