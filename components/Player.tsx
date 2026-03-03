
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../store';

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
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#ff3300" transparent opacity={0.8} />
    </instancedMesh>
  );
};

// --- KAMEHAMEHA VISUALS ---
const KamehamehaBeam: React.FC<{ isFiring: boolean; isCharging: boolean; charge: number }> = ({ isFiring, isCharging, charge }) => {
    const beamRef = useRef<THREE.Group>(null);
    const chargeSphereRef = useRef<THREE.Mesh>(null);
    const outerBeamRef = useRef<THREE.Mesh>(null);
    const spiralRef = useRef<THREE.Mesh>(null);

    useFrame((state) => {
        const t = state.clock.elapsedTime;

        // Charging Sphere Logic
        if (chargeSphereRef.current) {
            if (isCharging) {
                const s = 0.5 + charge * 1.5 + Math.sin(t * 20) * 0.1;
                chargeSphereRef.current.scale.set(s, s, s);
                chargeSphereRef.current.visible = true;
                chargeSphereRef.current.rotation.z += 0.2;
                chargeSphereRef.current.rotation.y += 0.1;
            } else if (isFiring) {
                chargeSphereRef.current.scale.setScalar(2.0 + Math.sin(t * 30) * 0.2);
                chargeSphereRef.current.visible = true;
            } else {
                chargeSphereRef.current.visible = false;
                chargeSphereRef.current.scale.set(0,0,0);
            }
        }

        // Beam Logic
        if (beamRef.current) {
            beamRef.current.visible = isFiring;
            if (isFiring) {
                const flicker = 1 + Math.sin(t * 40) * 0.1;
                beamRef.current.scale.set(flicker, flicker, 1);
                
                if (outerBeamRef.current) {
                    const outerFlicker = 1 + Math.cos(t * 30) * 0.15;
                    outerBeamRef.current.scale.set(outerFlicker, outerFlicker, 1);
                }
                
                if (spiralRef.current) {
                    spiralRef.current.rotation.x -= 0.5;
                    spiralRef.current.scale.set(1.5 + Math.sin(t * 10) * 0.2, 1.5 + Math.sin(t * 10) * 0.2, 1);
                }
            }
        }
    });

    return (
        <group position={[0, 0.8, 0.8]}>
            {/* Charge Sphere */}
            <mesh ref={chargeSphereRef}>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshStandardMaterial 
                    color="#00ffff" 
                    emissive="#00bfff" 
                    emissiveIntensity={15} 
                    transparent 
                    opacity={0.8}
                    wireframe={isCharging} // Wireframe look while charging
                />
                <pointLight distance={10} intensity={isCharging ? 5 + charge * 10 : (isFiring ? 20 : 0)} color="#00ffff" />
            </mesh>

            {/* The Beam */}
            <group ref={beamRef} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 20]}> {/* Extended forward */}
                {/* Core */}
                <mesh>
                    <cylinderGeometry args={[0.4, 0.4, 40, 16, 1, true]} />
                    <meshBasicMaterial color="#ffffff" />
                </mesh>
                {/* Glow */}
                <mesh ref={outerBeamRef}>
                    <cylinderGeometry args={[1.2, 1.8, 40, 16, 1, true]} />
                    <meshStandardMaterial 
                        color="#00ffff" 
                        emissive="#0000ff" 
                        emissiveIntensity={5} 
                        transparent 
                        opacity={0.4} 
                        side={THREE.DoubleSide} 
                        depthWrite={false}
                    />
                </mesh>
                {/* Spiral Energy */}
                <mesh ref={spiralRef}>
                     <torusGeometry args={[1.0, 0.1, 16, 100]} />
                     <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
                </mesh>
                
                <pointLight position={[0, 10, 0]} intensity={10} distance={20} color="#00ffff" />
            </group>
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

// --- DREAD SWORD WITH HITBOX POINTS ---
const DreadSword = React.forwardRef<THREE.Group, { isAttacking: boolean; isSpinning: boolean; isCharging: boolean; charge: number; comboStep: number; lastAttackTime: number; tipRef: React.RefObject<THREE.Group>; baseRef: React.RefObject<THREE.Group> }>(({ isAttacking, isSpinning, isCharging, charge, comboStep, lastAttackTime, tipRef, baseRef }, ref) => {
  const runeGlowRef = useRef<THREE.Group>(null);
  const cutGrassAt = useGameStore(s => s.cutGrassAt);
  const tempWorldPos = useRef(new THREE.Vector3());

  useFrame(() => {
    if (runeGlowRef.current) {
      runeGlowRef.current.position.y = 0.5 + Math.sin(performance.now() * 0.015) * 0.05;
      const baseIntensity = (isAttacking || isSpinning ? 25 : 2);
      const chargeIntensity = isCharging ? charge * 40 : 0;
      const intensity = baseIntensity + chargeIntensity;
      
      runeGlowRef.current.children.forEach((child) => {
        if ((child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = intensity;
          if (isCharging) mat.emissive.lerp(new THREE.Color("#ff3300"), charge * 0.5);
          else mat.emissive.set(isSpinning ? "#ff3333" : comboStep === 3 ? "#ffffff" : "#00ffff");
        }
      });
    }

    if (isAttacking && tipRef.current && cutGrassAt) {
        tipRef.current.getWorldPosition(tempWorldPos.current);
        cutGrassAt(tempWorldPos.current.x, tempWorldPos.current.z, 1.2, 0.8);
    }
  });

  return (
    <group ref={ref} position={[0, 0.2, 0.4]} rotation={[Math.PI / 2, 0, 0]} scale={[1.2, 1.2, 1.2]}>
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 0.5, 8]} />
        <meshStandardMaterial color="#2c1e16" roughness={0.9} />
      </mesh>
      
      <group ref={baseRef} position={[0, -0.1, 0]} />
      <group ref={tipRef} position={[0, 1.2, 0]} />

      <group position={[0, -0.1, 0]}>
        <mesh castShadow><sphereGeometry args={[0.15, 12, 12]} scale={[1, 1.2, 0.8]} /><meshStandardMaterial color="#888" roughness={0.6} /></mesh>
      </group>
      
      <group position={[0, 0.55, 0]}>
        <mesh castShadow><boxGeometry args={[0.18, 1.1, 0.04]} /><meshStandardMaterial color="#111" metalness={0.9} roughness={0.1} /></mesh>
        <group ref={runeGlowRef}>
          <mesh position={[0, 0, 0.025]}><boxGeometry args={[0.03, 0.9, 0.012]} /><meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={5} transparent opacity={0.9} /></mesh>
        </group>
        <SwordChargeParticles active={isCharging} charge={charge} />
      </group>
    </group>
  );
});

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
  const leftFootRef = useRef<THREE.Mesh>(null);
  const rightFootRef = useRef<THREE.Mesh>(null);
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

  // Procedural Animation States
  const jumpStretch = useRef(1);
  const landSquash = useRef(1);
  const lastIsGrounded = useRef(true);
  const walkCycle = useRef(0);
  const lastJumpKeyDown = useRef(false);

  // Materials
  const furMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8B5A2B', roughness: 1.0 }), []); // Brown Fur
  const skinMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#D2B48C', roughness: 0.8 }), []); // Light Tan for snout/ears
  const armorWhiteMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#F8F9FA', roughness: 0.3, metalness: 0.1 }), []);
  const armorBlueMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1E40AF', roughness: 0.4 }), []);
  const armorGoldMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#D97706', roughness: 0.4, metalness: 0.5 }), []);
  const eyeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#FF0000', emissive: '#FF0000', emissiveIntensity: 2.5 }), []);
  const hornMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#991B1B', roughness: 0.3 }), []);
  const noseMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3E2723', roughness: 0.5 }), []);

  useFrame((state, delta) => {
    if (isHitStopping) return;
    const t = state.clock.getElapsedTime();
    const timeSinceAttack = Date.now() - lastAttackTime;
    const progress = Math.min(timeSinceAttack / 400, 1);
    setAttackProgress(progress);

    // --- Jump & Landing Procedural Animation ---
    if (!isGrounded && lastIsGrounded.current) {
        jumpStretch.current = 1.3;
    }
    if (isGrounded && !lastIsGrounded.current) {
        landSquash.current = 0.7;
    }
    lastIsGrounded.current = isGrounded;

    jumpStretch.current = THREE.MathUtils.lerp(jumpStretch.current, 1.0, 0.15);
    landSquash.current = THREE.MathUtils.lerp(landSquash.current, 1.0, 0.15);

    if (overallScaleRef.current) {
        const targetScaleY = jumpStretch.current * landSquash.current;
        const targetScaleXZ = 1.0 / Math.sqrt(targetScaleY); 
        overallScaleRef.current.scale.set(targetScaleXZ, targetScaleY, targetScaleXZ);
    }

    if (isDodging) {
      dodgeRotation.current += delta * 15.7; 
      if (bodyRef.current) {
        bodyRef.current.rotation.x = dodgeRotation.current;
        bodyRef.current.position.y = 0.45 + Math.sin(dodgeRotation.current * 2) * 0.15;
      }
    } else {
      dodgeRotation.current = 0; 
      if (bodyRef.current) {
        bodyRef.current.rotation.x = THREE.MathUtils.lerp(bodyRef.current.rotation.x, isMoving ? 0.2 : 0, 0.1);
        if (isSpinning) {
            const spinProgress = Math.min(timeSinceAttack / SPIN_DURATION, 1);
            bodyRef.current.rotation.y = THREE.MathUtils.smoothstep(spinProgress, 0, 1) * Math.PI * 2;
        } else {
            bodyRef.current.rotation.y = THREE.MathUtils.lerp(bodyRef.current.rotation.y, 0, 0.2);
        }
        bodyRef.current.position.y = THREE.MathUtils.lerp(bodyRef.current.position.y, isStanceActive ? 0.5 : 0.7, 0.1);
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
    const isWalkingNow = moveSpeed > 0.1 && !isDodging;
    if (isWalkingNow) {
        const speed01 = THREE.MathUtils.clamp(moveSpeed / 12, 0, 1);
        const cycleSpeed = THREE.MathUtils.lerp(8, 14, speed01);
        const legAmp = THREE.MathUtils.lerp(0.55, 1.1, speed01);
        const stepLift = THREE.MathUtils.lerp(0.02, 0.09, speed01);
        const stepFwd = THREE.MathUtils.lerp(0.03, 0.12, speed01);

        // Advance walk cycle based on speed so legs sync with movement
        walkCycle.current += delta * cycleSpeed;
        
        const baseLeft = { x: -0.18, y: 0.35, z: 0 };
        const baseRight = { x: 0.18, y: 0.35, z: 0 };

        const phaseL = walkCycle.current;
        const phaseR = walkCycle.current + Math.PI; // right leg opposite phase

        const swingL = Math.sin(phaseL) * legAmp;
        const swingR = Math.sin(phaseR) * legAmp;
        // When leg swings forward (positive sin), raise it slightly
        const liftL = Math.max(0, Math.sin(phaseL)) * stepLift;
        const liftR = Math.max(0, Math.sin(phaseR)) * stepLift;
        // Move feet forward/back along local Z so one goes forward while the other goes back
        const strideL = Math.cos(phaseL) * stepFwd;
        const strideR = Math.cos(phaseR) * stepFwd;

        // Legs: clean oppositional gait
        if (leftLegRef.current) {
            leftLegRef.current.rotation.x = swingL;
            leftLegRef.current.position.set(baseLeft.x, baseLeft.y + liftL, baseLeft.z + strideL);
        }
        if (rightLegRef.current) {
            rightLegRef.current.rotation.x = swingR;
            rightLegRef.current.position.set(baseRight.x, baseRight.y + liftR, baseRight.z + strideR);
        }

        // Feet: counter-rotate a bit so they don't look like they're "hinged" too much
        if (leftFootRef.current) leftFootRef.current.rotation.x = -swingL * 0.4;
        if (rightFootRef.current) rightFootRef.current.rotation.x = -swingR * 0.4;
        
        // Arms: Opposite to legs (Left Arm moves with Right Leg)
        const armSwing = 0.6;
        if (leftArmRef.current) leftArmRef.current.rotation.x = Math.sin(phaseR) * armSwing;
        if (rightArmRef.current && !isAttacking) rightArmRef.current.rotation.x = Math.sin(phaseL) * armSwing;

        // Body Bob & Sway (driven by walk cycle)
        if (bodyRef.current) {
            // Bob up twice per cycle (once per step)
            bodyRef.current.position.y = 0.65 + Math.sin(walkCycle.current * 2) * 0.03;
            // Slight sway (roll)
            bodyRef.current.rotation.z = Math.cos(walkCycle.current) * 0.05;
        }
    } else if (!isGrounded) {
        if (leftLegRef.current) leftLegRef.current.rotation.x = 0.3;
        if (rightLegRef.current) rightLegRef.current.rotation.x = -0.3;
        if (leftFootRef.current) leftFootRef.current.rotation.x = 0;
        if (rightFootRef.current) rightFootRef.current.rotation.x = 0;
        if (bodyRef.current) bodyRef.current.position.y = 0.7; // Reset height in air
    } else {
        // Idle
        if (leftLegRef.current) leftLegRef.current.rotation.x = THREE.MathUtils.lerp(leftLegRef.current.rotation.x, 0, 0.2);
        if (rightLegRef.current) rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, 0, 0.2);
        if (leftLegRef.current) leftLegRef.current.position.lerp(new THREE.Vector3(-0.18, 0.35, 0), 0.2);
        if (rightLegRef.current) rightLegRef.current.position.lerp(new THREE.Vector3(0.18, 0.35, 0), 0.2);
        if (leftFootRef.current) leftFootRef.current.rotation.x = THREE.MathUtils.lerp(leftFootRef.current.rotation.x, 0, 0.2);
        if (rightFootRef.current) rightFootRef.current.rotation.x = THREE.MathUtils.lerp(rightFootRef.current.rotation.x, 0, 0.2);
        if (leftArmRef.current) leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, 0, 0.2);
        
        // Breathing Idle
        if (bodyRef.current) {
             bodyRef.current.position.y = 0.65 + Math.sin(t * 2) * 0.01;
             bodyRef.current.rotation.z = THREE.MathUtils.lerp(bodyRef.current.rotation.z, 0, 0.1);
        }
    }

    // --- SWORD ARM LOGIC ---
    if (rightArmRef.current && swordPivotRef.current) {
      if (isSpinning) {
          rightArmRef.current.position.lerp(new THREE.Vector3(0.5, 0.4, 0.2), 0.3);
          rightArmRef.current.rotation.x = -0.5;
          swordPivotRef.current.rotation.set(-Math.PI / 2, 0, 0);
      } else if (isAttacking && comboStep > 0) {
        const eased = Math.sin(progress * Math.PI);
        rightArmRef.current.position.set(0.4, 0.3, 0.3 + eased * 0.3);
        if (comboStep === 1) { swordPivotRef.current.rotation.y = THREE.MathUtils.lerp(0.8, -1.8, progress); swordPivotRef.current.rotation.x = -Math.PI / 2; }
        else if (comboStep === 2) { swordPivotRef.current.rotation.y = THREE.MathUtils.lerp(-1.8, 0.8, progress); swordPivotRef.current.rotation.x = -Math.PI / 2; }
        else if (comboStep === 3) { swordPivotRef.current.rotation.x = THREE.MathUtils.lerp(-2.8, 0.2, progress); swordPivotRef.current.rotation.y = -0.3; }
      } else {
        rightArmRef.current.position.lerp(new THREE.Vector3(0.35, 0.35, 0.1), 0.15);
        if (!isMoving) rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, 0, 0.2);
        swordPivotRef.current.rotation.x = THREE.MathUtils.lerp(swordPivotRef.current.rotation.x, isStanceActive ? -1.0 : 0, 0.15);
        swordPivotRef.current.rotation.y = THREE.MathUtils.lerp(swordPivotRef.current.rotation.y, 0, 0.15);
      }
      
      // Reset Left Arm if not special action or moving
      if (leftArmRef.current && !isMoving) {
          leftArmRef.current.rotation.set(0, 0, 0.1);
          leftArmRef.current.position.lerp(new THREE.Vector3(-0.35, 0.35, 0.1), 0.2);
      }
    }

    // --- TAIL ANIMATION ---
    if (tailRef.current) {
        const tailSpeed = isMoving ? 15 : 2;
        const tailAmp = isMoving ? 0.15 : 0.05;
        tailRef.current.rotation.x = -0.2 + Math.sin(t * tailSpeed) * tailAmp;
        tailRef.current.rotation.y = Math.cos(t * (tailSpeed * 0.5)) * (tailAmp * 2);
    }

    // --- HEAD ANIMATION ---
    if (headRef.current) {
        headRef.current.rotation.y = Math.sin(t * 1) * 0.05; // Subtle look around
        headRef.current.rotation.z = Math.cos(t * 0.8) * 0.02;
    }
  });

  return (
    <group position={[0, 0, 0]} name="player-model-root">
      {isAttacking && comboStep > 0 && attackProgress < 1 && <SlashArc comboStep={comboStep} progress={attackProgress} />}
      
      <KamehamehaBeam isFiring={isKamehamehaFiring} isCharging={isKamehamehaCharging} charge={kamehamehaCharge} />

      <group ref={overallScaleRef}>
        <group ref={bodyRef} position={[0, 0.65, 0]}>
            
            {/* --- TORSO & ARMOR --- */}
            <mesh castShadow receiveShadow position={[0, 0, 0]}>
                <capsuleGeometry args={[0.28, 0.4, 4, 16]} />
                <primitive object={furMaterial} attach="material" />
            </mesh>
            
            {/* White Chest Plate */}
            <mesh castShadow position={[0, 0.1, 0.12]}>
                <boxGeometry args={[0.45, 0.35, 0.25]} />
                <primitive object={armorWhiteMat} attach="material" />
            </mesh>
            
            {/* Gold/Ribbed Abdomen */}
            <mesh castShadow position={[0, -0.15, 0.11]}>
                <cylinderGeometry args={[0.26, 0.27, 0.15, 16]} />
                <primitive object={armorGoldMat} attach="material" />
            </mesh>

            {/* Blue Shoulder Pads */}
            <group position={[0, 0.3, 0]}>
                <mesh position={[-0.32, -0.05, 0]} rotation={[0, 0, 0.4]}>
                    <boxGeometry args={[0.2, 0.1, 0.3]} />
                    <primitive object={armorBlueMat} attach="material" />
                </mesh>
                <mesh position={[0.32, -0.05, 0]} rotation={[0, 0, -0.4]}>
                    <boxGeometry args={[0.2, 0.1, 0.3]} />
                    <primitive object={armorBlueMat} attach="material" />
                </mesh>
                {/* Back Straps */}
                <mesh position={[0, 0, -0.15]} rotation={[0.4, 0, 0]}>
                    <boxGeometry args={[0.5, 0.3, 0.05]} />
                    <primitive object={armorBlueMat} attach="material" />
                </mesh>
            </group>

            {/* --- HEAD --- */}
            <group ref={headRef} position={[0, 0.5, 0]}>
                {/* Main Head Shape */}
                <mesh castShadow>
                    <sphereGeometry args={[0.35, 16, 16]} />
                    <primitive object={furMaterial} attach="material" />
                </mesh>
                {/* Snout */}
                <mesh position={[0, -0.05, 0.25]} castShadow>
                    <sphereGeometry args={[0.18, 16, 16]} />
                    <primitive object={skinMaterial} attach="material" />
                </mesh>
                {/* Nose */}
                <mesh position={[0, 0.05, 0.4]}>
                    <sphereGeometry args={[0.04, 8, 8]} />
                    <primitive object={noseMat} attach="material" />
                </mesh>
                {/* Buck Tooth */}
                <mesh position={[0, -0.1, 0.38]}>
                    <boxGeometry args={[0.06, 0.06, 0.02]} />
                    <primitive object={armorWhiteMat} attach="material" />
                </mesh>
                {/* Glowing Red Eyes */}
                <mesh position={[-0.12, 0.08, 0.25]} rotation={[0, -0.2, 0]}>
                    <sphereGeometry args={[0.09, 16, 16]} />
                    <primitive object={eyeMat} attach="material" />
                </mesh>
                <mesh position={[0.12, 0.08, 0.25]} rotation={[0, 0.2, 0]}>
                    <sphereGeometry args={[0.09, 16, 16]} />
                    <primitive object={eyeMat} attach="material" />
                </mesh>
                {/* Red Horns */}
                <mesh position={[-0.15, 0.28, 0.1]} rotation={[0, 0, 0.4]}>
                    <coneGeometry args={[0.06, 0.2, 8]} />
                    <primitive object={hornMat} attach="material" />
                </mesh>
                <mesh position={[0.15, 0.28, 0.1]} rotation={[0, 0, -0.4]}>
                    <coneGeometry args={[0.06, 0.2, 8]} />
                    <primitive object={hornMat} attach="material" />
                </mesh>
                {/* Ears */}
                <mesh position={[-0.25, 0.2, 0]} rotation={[0, 0, 0.6]}>
                    <capsuleGeometry args={[0.08, 0.2, 4, 8]} />
                    <primitive object={furMaterial} attach="material" />
                </mesh>
                <mesh position={[0.25, 0.2, 0]} rotation={[0, 0, -0.6]}>
                    <capsuleGeometry args={[0.08, 0.2, 4, 8]} />
                    <primitive object={furMaterial} attach="material" />
                </mesh>
            </group>

            {/* --- TAIL --- */}
            <group ref={tailRef} position={[0, -0.2, -0.25]}>
                <mesh position={[0, 0.4, -0.3]} rotation={[0.5, 0, 0]} castShadow>
                    {/* Approximating a big bushy tail with a deformed sphere */}
                    <sphereGeometry args={[0.45, 16, 16]} /> 
                    <primitive object={furMaterial} attach="material" />
                </mesh>
                <mesh position={[0, 0.8, -0.4]} rotation={[0.2, 0, 0]} castShadow>
                    <sphereGeometry args={[0.4, 16, 16]} />
                    <primitive object={furMaterial} attach="material" />
                </mesh>
            </group>

            {/* --- ARMS --- */}
            <group ref={leftArmRef} position={[-0.35, 0.35, 0.1]}>
                <mesh position={[0, -0.15, 0]} rotation={[0, 0, 0.2]} castShadow>
                    <capsuleGeometry args={[0.09, 0.35, 4, 8]} />
                    <primitive object={furMaterial} attach="material" />
                </mesh>
            </group>
            <group ref={rightArmRef} position={[0.35, 0.35, 0.1]}>
                <group ref={swordPivotRef}>
                    <mesh position={[0, -0.15, 0]} rotation={[0, 0, -0.2]} castShadow>
                        <capsuleGeometry args={[0.09, 0.35, 4, 8]} />
                        <primitive object={furMaterial} attach="material" />
                    </mesh>
                    <DreadSword 
                        tipRef={swordTipRef} 
                        baseRef={swordBaseRef}
                        isAttacking={isAttacking} isSpinning={isSpinning} isCharging={isMeleeCharging} charge={meleeCharge} comboStep={comboStep} lastAttackTime={lastAttackTime} 
                    />
                </group>
            </group>

        </group>

        {/* --- LEGS --- */}
        <group ref={leftLegRef} position={[-0.18, 0.35, 0]}>
            {/* Thigh */}
            <mesh position={[0, -0.15, 0]} castShadow>
                <capsuleGeometry args={[0.11, 0.3, 4, 8]} />
                <primitive object={furMaterial} attach="material" />
            </mesh>
            {/* Foot */}
            <mesh ref={leftFootRef} position={[0, -0.35, 0.1]} castShadow>
                <boxGeometry args={[0.18, 0.12, 0.25]} />
                <primitive object={furMaterial} attach="material" />
            </mesh>
        </group>
        <group ref={rightLegRef} position={[0.18, 0.35, 0]}>
            {/* Thigh */}
            <mesh position={[0, -0.15, 0]} castShadow>
                <capsuleGeometry args={[0.11, 0.3, 4, 8]} />
                <primitive object={furMaterial} attach="material" />
            </mesh>
            {/* Foot */}
            <mesh ref={rightFootRef} position={[0, -0.35, 0.1]} castShadow>
                <boxGeometry args={[0.18, 0.12, 0.25]} />
                <primitive object={furMaterial} attach="material" />
            </mesh>
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

  // Kamehameha Refs
  const kamehamehaTimer = useRef(0);
  const kamehamehaDamageTick = useRef(0);

  const [, getKeys] = useKeyboardControls();
  const { 
    isGameOver, joystickVector, meleeRequestTick, 
    meleeSpinRequestTick, jumpRequestTick, isHitStopping, isDodging, 
    isStanceActive, playerSpawnPos, triggerHitImpact, damageEnemy, damageTownNPC, damageEnvironment,
    comboStep, setComboStep, isAttacking, setAttacking, isSpinning, setSpinning, lastAttackTime,
    currentSpeed, isGrounded,
    isKamehamehaCharging, isKamehamehaFiring, kamehamehaCharge, setKamehamehaCharging, setKamehamehaFiring, useMana,
    playerSpawnRevision, registerPlayerPositionGetter
  } = useGameStore();

  const lastProcessedTicks = useRef({ melee: 0, spin: 0, jump: 0 });

  useEffect(() => { if (playerMeshGroup.current) setPlayerRef(playerMeshGroup.current); }, [setPlayerRef]);

  useEffect(() => {
    registerPlayerPositionGetter(() => {
      if (!rigidBody.current) return [playerSpawnPos[0], playerSpawnPos[1], playerSpawnPos[2]];
      const pos = rigidBody.current.translation();
      return [pos.x, pos.y, pos.z];
    });
    return () => registerPlayerPositionGetter(null);
  }, [playerSpawnPos, registerPlayerPositionGetter]);

  useEffect(() => {
    if (!rigidBody.current) return;
    rigidBody.current.setTranslation(
      { x: playerSpawnPos[0], y: playerSpawnPos[1], z: playerSpawnPos[2] },
      true
    );
    rigidBody.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rigidBody.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }, [playerSpawnPos, playerSpawnRevision]);
  
  useEffect(() => { 
    hitList.current.clear(); 
  }, [comboStep, isSpinning]);

  useFrame((state, delta) => {
    if (!rigidBody.current || isGameOver || isHitStopping) return;

    const cv = rigidBody.current.linvel();
    const store = useGameStore.getState();
    const currentPos = rigidBody.current.translation();

    // --- ENHANCED GROUNDING CHECK (RAYCAST) ---
    const rayOrigin = { x: currentPos.x, y: currentPos.y + 0.5, z: currentPos.z };
    const rayDir = { x: 0, y: -1, z: 0 };
    const downRay = new rapier.Ray(rayOrigin, rayDir);
    const groundHit = world.castRay(downRay, 0.8, true, undefined, undefined, undefined, rigidBody.current);
    const actuallyGrounded = groundHit && (groundHit as any).toi < 0.7;
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
                const ePos = new THREE.Vector3(...enemy.position);
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
                const nPos = new THREE.Vector3(...npc.position);
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
        // Always allow a jump when requested so the button / spacebar
        // reliably launches the character.
        rigidBody.current.applyImpulse({ x: 0, y: JUMP_FORCE, z: 0 }, true);
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
            playerMeshGroup.current!.quaternion.slerp(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(vx, vz)), 0.2);

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
        
        const nextSpeed = Math.sqrt(vx**2 + vz**2);
        rigidBody.current.setLinvel({ x: vx, y: vy, z: vz }, true);
        useGameStore.setState({ 
            currentSpeed: Number.isFinite(nextSpeed) ? nextSpeed : 0
        });

        // Keyboard jump (Space via KeyboardControls "jump" action)
        if (jump && !lastJumpKeyDown.current) {
            rigidBody.current.applyImpulse({ x: 0, y: JUMP_FORCE, z: 0 }, true);
        }
        lastJumpKeyDown.current = jump;
    } catch (e) {}
  });

  return (
    <RigidBody 
      ref={rigidBody} 
      colliders={false} 
      position={playerSpawnPos} 
      enabledRotations={[false, false, false]} 
      friction={0} 
      restitution={0} 
      userData={{ type: 'PLAYER' }}
    >
        <CapsuleCollider args={[0.5, 0.45]} position={[0, 0.9, 0]} contactSkin={0.02} />
        <group ref={playerMeshGroup}>
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
            <SpinVFX active={isSpinning} position={new THREE.Vector3(0, 0.8, 0)} />
        </group>
    </RigidBody>
  );
};
