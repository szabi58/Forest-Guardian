
import React, { useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore } from '../store';
import { getTerrainHeight } from './Environment';

interface CameraControllerProps {
  playerRef: React.RefObject<THREE.Object3D>;
}

const isValid = (val: any): boolean => {
    if (typeof val === 'number') return Number.isFinite(val);
    if (val instanceof THREE.Vector3) return Number.isFinite(val.x) && Number.isFinite(val.y) && Number.isFinite(val.z);
    if (val instanceof THREE.Quaternion) return Number.isFinite(val.x) && Number.isFinite(val.y) && Number.isFinite(val.z) && Number.isFinite(val.w);
    return false;
};

export const CameraController: React.FC<CameraControllerProps> = ({ playerRef }) => {
  const { camera } = useThree();
  const { world, rapier } = useRapier();
  
  const targetYaw = useRef(0);
  const targetPitch = useRef(0.2);
  const currentYaw = useRef(0);
  const currentPitch = useRef(0.2);
  
  const yawVelocity = useRef(0);
  const pitchVelocity = useRef(0);
  
  const currentPosition = useRef(new THREE.Vector3(0, 10, 10));
  const currentTarget = useRef(new THREE.Vector3(0, 0, 0));
  const tempVec = useRef(new THREE.Vector3());
  const rayOrigin = useRef(new THREE.Vector3());
  const rayDir = useRef(new THREE.Vector3());

  const isInsideBuildingId = useGameStore(s => s.isInsideBuildingId);

  const CONFIG = {
    BASE_DISTANCE: isInsideBuildingId ? 3.8 : 8.5,
    MIN_DISTANCE: 1.2,
    LOOK_AT_HEIGHT: 1.2,
    ROTATION_SMOOTHING: 15, 
    POSITION_SMOOTHING: 10,
    SENSITIVITY_X: 18.0, 
    SENSITIVITY_Y: 12.0,
    FRICTION: 0.82, // Slightly less friction for better analog feel
    MIN_PITCH: -0.6,
    MAX_PITCH: 1.3,
  };

  useFrame((state, delta) => {
    if (!playerRef.current || !world || delta <= 0 || delta > 0.1) return;

    const store = useGameStore.getState();
    const player = playerRef.current;

    // 1. INPUT PROCESSING
    const cameraDelta = store.cameraDelta;
    if (cameraDelta && (Math.abs(cameraDelta.x) > 0.0001 || Math.abs(cameraDelta.y) > 0.0001)) {
      if (isValid(cameraDelta.x) && isValid(cameraDelta.y)) {
          // Normalize sensitivity by screen space or analog intensity
          yawVelocity.current = -cameraDelta.x * CONFIG.SENSITIVITY_X;
          pitchVelocity.current = cameraDelta.y * CONFIG.SENSITIVITY_Y;
          
          store.clearCameraDelta();
      }
    }

    // 2. MOMENTUM & SMOOTHING
    const frictionFactor = Math.pow(CONFIG.FRICTION, delta * 60);
    yawVelocity.current *= frictionFactor;
    pitchVelocity.current *= frictionFactor;

    targetYaw.current += yawVelocity.current;
    targetPitch.current += pitchVelocity.current;
    targetPitch.current = THREE.MathUtils.clamp(targetPitch.current, CONFIG.MIN_PITCH, CONFIG.MAX_PITCH);

    const chaseFactor = 1 - Math.exp(-CONFIG.ROTATION_SMOOTHING * delta);
    if (isValid(chaseFactor)) {
        currentYaw.current = THREE.MathUtils.lerp(currentYaw.current, targetYaw.current, chaseFactor);
        currentPitch.current = THREE.MathUtils.lerp(currentPitch.current, targetPitch.current, chaseFactor);
    }

    // 3. COORDINATE CALCULATION
    const playerPos = player.getWorldPosition(tempVec.current);
    if (!isValid(playerPos)) return;

    const finalYaw = player.rotation.y + currentYaw.current;
    const finalPitch = currentPitch.current;

    const backDir = new THREE.Vector3(
      Math.sin(finalYaw) * Math.cos(finalPitch),
      Math.sin(finalPitch), 
      Math.cos(finalYaw) * Math.cos(finalPitch)
    );
    
    if (backDir.lengthSq() < 0.0001) backDir.set(0, 0, 1);
    else backDir.normalize();

    // 4. COLLISION DETECTION
    rayOrigin.current.copy(playerPos).add(new THREE.Vector3(0, CONFIG.LOOK_AT_HEIGHT, 0));
    rayDir.current.copy(backDir);
    
    let targetDistance = CONFIG.BASE_DISTANCE;
    const ray = new rapier.Ray(rayOrigin.current, rayDir.current);
    const hit = world.castRay(
        ray, 
        CONFIG.BASE_DISTANCE, 
        true, 
        undefined, undefined, undefined, undefined, 
        (collider) => {
            const ud = collider.parent()?.userData as any;
            return ud?.type === 'ENVIRONMENT' || !ud?.type;
        }
    );

    if (hit && isValid((hit as any).toi)) {
        targetDistance = Math.max(CONFIG.MIN_DISTANCE, (hit as any).toi - 0.4);
    }

    const idealPosition = rayOrigin.current.clone().add(backDir.multiplyScalar(targetDistance));
    const idealTarget = playerPos.clone().add(new THREE.Vector3(0, CONFIG.LOOK_AT_HEIGHT, 0));

    const terrainY = getTerrainHeight(idealPosition.x, idealPosition.z);
    if (isValid(terrainY)) {
        idealPosition.y = Math.max(idealPosition.y, terrainY + 1.2);
    }

    // 5. APPLY TRANSFORMS
    const posChase = 1 - Math.exp(-CONFIG.POSITION_SMOOTHING * delta);
    if (isValid(posChase) && isValid(idealPosition) && isValid(idealTarget)) {
        currentPosition.current.lerp(idealPosition, posChase);
        currentTarget.current.lerp(idealTarget, 0.5);

        const distSq = currentPosition.current.distanceToSquared(currentTarget.current);
        if (distSq > 0.001) {
            camera.position.copy(currentPosition.current);
            const lookMatrix = new THREE.Matrix4().lookAt(
                currentPosition.current, 
                currentTarget.current, 
                new THREE.Vector3(0, 1, 0)
            );
            const targetQuat = new THREE.Quaternion().setFromRotationMatrix(lookMatrix);
            if (isValid(targetQuat)) {
                camera.quaternion.copy(targetQuat);
            } else {
                camera.lookAt(currentTarget.current);
            }
        }
    }

    const rawSpeed = store.currentSpeed || 0;
    const currentSpeed = Number.isFinite(rawSpeed) ? rawSpeed : 0;
    const targetFOV = (isInsideBuildingId ? 78 : 58) + THREE.MathUtils.clamp(currentSpeed / 12, 0, 1) * 12;
    
    if (isValid(targetFOV) && (camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        const pCam = camera as THREE.PerspectiveCamera;
        pCam.fov = THREE.MathUtils.lerp(pCam.fov, targetFOV, 0.1);
        pCam.updateProjectionMatrix();
    }
  });

  return null;
};
