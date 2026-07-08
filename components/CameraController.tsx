
import React, { useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore, cameraZoom, cameraControl, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX } from '../store';
import { getTerrainHeight } from './Environment';

interface CameraControllerProps {
  playerRef: React.RefObject<THREE.Object3D>;
}

const isValid = (val: any): boolean => {
    if (typeof val === 'number') return Number.isFinite(val);
    if (val instanceof THREE.Vector3) return Number.isFinite(val.x) && Number.isFinite(val.y) && Number.isFinite(val.z);
    return false;
};

const CONFIG = {
  INDOOR_MAX_DISTANCE: 3.8,
  COLLISION_MIN_DISTANCE: 1.2, // walls can push the camera in this far, but never into first person
  COLLISION_PADDING: 0.35,
  LOOK_AT_HEIGHT: 1.2,
  EYE_HEIGHT: 1.45,            // pivot rises to squirrel eye level as the camera zooms all the way in
  // First-person threshold with hysteresis so the model doesn't flicker at the boundary
  FP_ENTER_DISTANCE: 1.05,
  FP_EXIT_DISTANCE: 1.35,
  // How fast the smoothed angles chase the target angles (higher = snappier orbit)
  ROTATION_SMOOTHING: 30,
  // Pivot follow speeds — XZ tracks tightly, Y is softer so jumps/steps don't bounce the camera
  PIVOT_XZ_SMOOTHING: 12,
  PIVOT_Y_SMOOTHING: 6,
  ZOOM_SMOOTHING: 8,           // user wheel/pinch zoom glide
  DISTANCE_SMOOTHING_IN: 30,   // snap in fast when something blocks the camera
  DISTANCE_SMOOTHING_OUT: 6,   // ease back out when the path clears
  // Radians of orbit for a full-screen drag
  SENSITIVITY_X: 5.5,
  SENSITIVITY_Y: 3.2,
  // Auto-follow: while moving (and not dragging), the camera gently swings
  // behind the direction of travel
  FOLLOW_SPEED: 2.2,          // exponential rate of the swing (gentle)
  FOLLOW_RESUME_DELAY: 0.8,   // seconds after the last manual input before follow may resume
  FOLLOW_RESUME_RAMP: 0.7,    // seconds to fade follow strength back in after the delay
  FOLLOW_MIN_SPEED: 1.5,      // world units/sec of actual movement required
  // Fortnite-style pitch limits: can't flip over the top or dive under the floor
  MIN_PITCH: -Math.PI / 6,  // -30°
  MAX_PITCH: Math.PI / 3,   // +60°
  DEFAULT_PITCH: 0.32,
};

export const CameraController: React.FC<CameraControllerProps> = ({ playerRef }) => {
  const { camera } = useThree();
  const { world, rapier } = useRapier();

  // World-space orbit angles. Only user input moves these — the camera never
  // derives its heading from the character's facing, so player rotation and
  // camera control can't fight each other.
  const targetYaw = useRef(0);
  const targetPitch = useRef(CONFIG.DEFAULT_PITCH);
  const currentYaw = useRef(0);
  const currentPitch = useRef(CONFIG.DEFAULT_PITCH);
  const initialized = useRef(false);

  const pivot = useRef(new THREE.Vector3());
  const smoothedZoom = useRef(cameraZoom.target);     // user intent, glides toward cameraZoom.target
  const smoothedDistance = useRef(cameraZoom.target); // actual distance after collision clamping
  const lastManualTime = useRef(-Infinity);
  const prevPlayerPos = useRef(new THREE.Vector3());
  const hasPrevPlayerPos = useRef(false);
  const tempVec = useRef(new THREE.Vector3());
  const offsetDir = useRef(new THREE.Vector3());
  const camPos = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());

  const isInsideBuildingId = useGameStore(s => s.isInsideBuildingId);

  useFrame((state, delta) => {
    if (!playerRef.current || !world || delta <= 0 || delta > 0.1) return;

    const store = useGameStore.getState();
    const player = playerRef.current;

    const playerPos = player.getWorldPosition(tempVec.current);
    if (!isValid(playerPos)) return;

    // First frame: start behind wherever the character is facing, then never
    // read the character's rotation again.
    if (!initialized.current) {
      const fwd = new THREE.Vector3();
      player.getWorldDirection(fwd);
      fwd.y = 0;
      const playerYaw = fwd.lengthSq() > 0.0001 ? Math.atan2(fwd.x, fwd.z) : 0;
      targetYaw.current = playerYaw + Math.PI;
      currentYaw.current = targetYaw.current;
      pivot.current.set(playerPos.x, playerPos.y + CONFIG.LOOK_AT_HEIGHT, playerPos.z);
      initialized.current = true;
    }

    // 1. INPUT — apply drag/stick deltas directly to the target angles.
    // Any manual input (or a held drag) stamps lastManualTime, which pauses
    // auto-follow, so only ever ONE of the two applies rotation in a frame.
    const cameraDelta = store.cameraDelta;
    if (cameraDelta && (isValid(cameraDelta.x) && isValid(cameraDelta.y)) &&
        (Math.abs(cameraDelta.x) > 0.00001 || Math.abs(cameraDelta.y) > 0.00001)) {
      targetYaw.current -= cameraDelta.x * CONFIG.SENSITIVITY_X;
      targetPitch.current += cameraDelta.y * CONFIG.SENSITIVITY_Y;
      lastManualTime.current = state.clock.elapsedTime;
      store.clearCameraDelta();
    }
    if (cameraControl.dragging) lastManualTime.current = state.clock.elapsedTime;
    targetPitch.current = THREE.MathUtils.clamp(targetPitch.current, CONFIG.MIN_PITCH, CONFIG.MAX_PITCH);

    // 1b. AUTO-FOLLOW — when the player is actually moving and the camera
    // hasn't been touched recently, gently swing the yaw behind the direction
    // of travel. Crucially this steers toward the measured world displacement
    // (not the character's facing, which is itself camera-derived — that
    // coupling is what caused the old spin bug), and the strength is scaled by
    // how *forward* the motion is relative to the camera: walking backward or
    // pure strafing contributes nothing, so there is no 180° flip feedback.
    const dispX = hasPrevPlayerPos.current ? playerPos.x - prevPlayerPos.current.x : 0;
    const dispZ = hasPrevPlayerPos.current ? playerPos.z - prevPlayerPos.current.z : 0;
    prevPlayerPos.current.copy(playerPos);
    hasPrevPlayerPos.current = true;

    const moveSpeed = Math.hypot(dispX, dispZ) / delta;
    const sinceManual = state.clock.elapsedTime - lastManualTime.current;
    if (!store.isFirstPerson && moveSpeed > CONFIG.FOLLOW_MIN_SPEED && sinceManual > CONFIG.FOLLOW_RESUME_DELAY) {
      const resumeBlend = THREE.MathUtils.clamp((sinceManual - CONFIG.FOLLOW_RESUME_DELAY) / CONFIG.FOLLOW_RESUME_RAMP, 0, 1);
      const dispLen = Math.hypot(dispX, dispZ);
      // Camera's forward on the ground plane (it looks along -offsetDir)
      const fwdX = -Math.sin(currentYaw.current);
      const fwdZ = -Math.cos(currentYaw.current);
      const forwardness = THREE.MathUtils.clamp((dispX * fwdX + dispZ * fwdZ) / dispLen, 0, 1);
      if (forwardness > 0.001) {
        // Camera sits opposite the travel heading, i.e. behind the player
        const desiredYaw = Math.atan2(dispX, dispZ) + Math.PI;
        let diff = desiredYaw - targetYaw.current;
        diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        const followStep = 1 - Math.exp(-CONFIG.FOLLOW_SPEED * delta);
        targetYaw.current += diff * followStep * forwardness * resumeBlend;
      }
    }

    // 2. SMOOTH ANGLES — both values accumulate together (yaw is unwrapped),
    // so lerping never takes the long way around or flips at ±180°.
    const rotFactor = 1 - Math.exp(-CONFIG.ROTATION_SMOOTHING * delta);
    currentYaw.current = THREE.MathUtils.lerp(currentYaw.current, targetYaw.current, rotFactor);
    currentPitch.current = THREE.MathUtils.lerp(currentPitch.current, targetPitch.current, rotFactor);

    // 3. ZOOM — glide toward the wheel/pinch target (continuous 0..15 range).
    // Firing the Kamehameha pulls the camera back slightly for drama (the beam
    // itself renders fine in first person, so FP stays FP).
    let zoomWanted = cameraZoom.target;
    if ((store.isKamehamehaCharging || store.isKamehamehaFiring) && zoomWanted > CONFIG.FP_EXIT_DISTANCE * 2) {
      zoomWanted = Math.min(zoomWanted + 1.6, CAMERA_ZOOM_MAX);
    }
    const zoomGoal = THREE.MathUtils.clamp(
      isInsideBuildingId ? Math.min(zoomWanted, CONFIG.INDOOR_MAX_DISTANCE) : zoomWanted,
      CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX
    );
    smoothedZoom.current = THREE.MathUtils.lerp(
      smoothedZoom.current, zoomGoal, 1 - Math.exp(-CONFIG.ZOOM_SMOOTHING * delta)
    );

    // 4. PIVOT FOLLOW — smooth chase of a point above the character; the point
    // rises to eye level as the camera closes in so first person sits in the head
    const closeness = 1 - THREE.MathUtils.clamp(smoothedZoom.current / 2.5, 0, 1);
    const pivotHeight = THREE.MathUtils.lerp(CONFIG.LOOK_AT_HEIGHT, CONFIG.EYE_HEIGHT, closeness);
    const xzFactor = 1 - Math.exp(-CONFIG.PIVOT_XZ_SMOOTHING * delta);
    const yFactor = 1 - Math.exp(-CONFIG.PIVOT_Y_SMOOTHING * delta);
    pivot.current.x = THREE.MathUtils.lerp(pivot.current.x, playerPos.x, xzFactor);
    pivot.current.z = THREE.MathUtils.lerp(pivot.current.z, playerPos.z, xzFactor);
    pivot.current.y = THREE.MathUtils.lerp(pivot.current.y, playerPos.y + pivotHeight, yFactor);

    // 5. ORBIT OFFSET from yaw/pitch (never raw rotation math — no gimbal lock,
    // pitch clamp guarantees we stay off the poles)
    const cosPitch = Math.cos(currentPitch.current);
    offsetDir.current.set(
      Math.sin(currentYaw.current) * cosPitch,
      Math.sin(currentPitch.current),
      Math.cos(currentYaw.current) * cosPitch
    );

    // 6. COLLISION — raycast from pivot toward the camera; pull in when blocked.
    // Only the user's zoom can take the camera below COLLISION_MIN_DISTANCE.
    let targetDistance = smoothedZoom.current;
    if (smoothedZoom.current > 0.05) {
      const ray = new rapier.Ray(pivot.current, offsetDir.current);
      const hit = world.castRay(
          ray,
          smoothedZoom.current,
          true,
          undefined, undefined, undefined, undefined,
          (collider) => {
              const ud = collider.parent()?.userData as any;
              return ud?.type === 'ENVIRONMENT' || !ud?.type;
          }
      );
      if (hit && isValid((hit as any).toi)) {
          const collisionDist = Math.max((hit as any).toi - CONFIG.COLLISION_PADDING, CONFIG.COLLISION_MIN_DISTANCE);
          targetDistance = Math.min(smoothedZoom.current, collisionDist);
      }
    }

    const distSmoothing = targetDistance < smoothedDistance.current
      ? CONFIG.DISTANCE_SMOOTHING_IN
      : CONFIG.DISTANCE_SMOOTHING_OUT;
    smoothedDistance.current = THREE.MathUtils.lerp(
      smoothedDistance.current,
      targetDistance,
      1 - Math.exp(-distSmoothing * delta)
    );

    // 7. FIRST-PERSON THRESHOLD — hysteresis, and only user zoom (not wall
    // collision) can push the camera close enough to trigger it
    const fpNow = store.isFirstPerson
      ? smoothedDistance.current < CONFIG.FP_EXIT_DISTANCE
      : smoothedDistance.current < CONFIG.FP_ENTER_DISTANCE;
    if (fpNow !== store.isFirstPerson) store.setFirstPerson(fpNow);

    // 8. FINAL TRANSFORM — position from pivot + orbit, keep above the terrain.
    // Look at a point ahead of the pivot along the view ray: identical direction
    // to looking at the pivot in third person, but stays well-defined as the
    // distance approaches zero in first person.
    camPos.current.copy(pivot.current).addScaledVector(offsetDir.current, smoothedDistance.current);
    const terrainY = getTerrainHeight(camPos.current.x, camPos.current.z);
    if (isValid(terrainY)) {
        camPos.current.y = Math.max(camPos.current.y, terrainY + 0.8);
    }

    if (isValid(camPos.current)) {
        camera.position.copy(camPos.current);
        camera.up.set(0, 1, 0);
        lookTarget.current.copy(pivot.current).addScaledVector(offsetDir.current, -2);
        camera.lookAt(lookTarget.current);

        // Screen shake: hit impacts (store.shakeIntensity) + a continuous subtle
        // rumble while the Kamehameha beam is firing
        const shake = (Number.isFinite(store.shakeIntensity) ? store.shakeIntensity : 0)
                    + (store.isKamehamehaFiring ? 0.12 : 0);
        if (shake > 0.001) {
            camera.position.x += (Math.random() - 0.5) * shake * 0.3;
            camera.position.y += (Math.random() - 0.5) * shake * 0.25;
            camera.position.z += (Math.random() - 0.5) * shake * 0.3;
        }
    }

    // 9. FOV — slight speed kick, a bit wider in first person and indoors,
    // plus a kick while the beam is firing
    const rawSpeed = store.currentSpeed || 0;
    const currentSpeed = Number.isFinite(rawSpeed) ? rawSpeed : 0;
    const baseFOV = (fpNow ? 70 : (isInsideBuildingId ? 78 : 58)) + (store.isKamehamehaFiring ? 7 : 0);
    const targetFOV = baseFOV + THREE.MathUtils.clamp(currentSpeed / 12, 0, 1) * 4;

    if (isValid(targetFOV) && (camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        const pCam = camera as THREE.PerspectiveCamera;
        pCam.fov = THREE.MathUtils.lerp(pCam.fov, targetFOV, 0.06);
        pCam.updateProjectionMatrix();
    }
  });

  return null;
};
