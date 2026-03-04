
import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector2 } from 'three';
import { useGameStore } from '../store';

/**
 * PS5/DualSense Standard Gamepad Mapping:
 * 0: Cross (X) - Jump
 * 1: Circle - Dodge
 * 2: Square - Melee Attack / Charge
 * 3: Triangle - Interact
 * 4: L1 - Stance
 * 5: R1 - Melee Attack
 * 6: L2 - Analog Trigger
 * 7: R2 - Analog Trigger (Magic)
 * 8: Share
 * 9: Options - Pause
 * 10: L3
 * 11: R3
 */

export const GamepadHandler: React.FC = () => {
  const store = useGameStore();
  const lastButtons = useRef<boolean[]>([]);
  const chargeStartTime = useRef<number | null>(null);
  
  // Vibration support
  const triggerVibration = (intensity: number, duration: number) => {
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (gp && gp.vibrationActuator) {
        (gp.vibrationActuator as any).playEffect('dual-rumble', {
          startDelay: 0,
          duration: duration,
          weakMagnitude: intensity,
          strongMagnitude: intensity * 0.5,
        });
      }
    }
  };

  // Watch for damage to trigger rumble
  useEffect(() => {
    const unsub = useGameStore.subscribe(
        (state, prevState) => {
            if (state.health < prevState.health) triggerVibration(0.8, 200);
        }
    );
    return unsub;
  }, []);

  useFrame((_, delta) => {
    const gamepads = navigator.getGamepads();
    const gp = gamepads[0]; // Primary controller
    
    if (!gp) return;

    // 1. ANALOG STICKS (with deadzone)
    const DEADZONE = 0.15;
    
    // Left Stick: Movement
    const lsX = Math.abs(gp.axes[0]) > DEADZONE ? gp.axes[0] : 0;
    const lsY = Math.abs(gp.axes[1]) > DEADZONE ? gp.axes[1] : 0;
    
    if (!store.isPaused) {
        store.setJoystickVector(new Vector2(lsX, lsY));
        store.setJoystickActive(lsX !== 0 || lsY !== 0);
    }

    // Right Stick: Camera (Continuous Delta)
    const rsX = Math.abs(gp.axes[2]) > DEADZONE ? gp.axes[2] : 0;
    const rsY = Math.abs(gp.axes[3]) > DEADZONE ? gp.axes[3] : 0;
    if (!store.isPaused && (rsX !== 0 || rsY !== 0)) {
        const deltaVec = new Vector2(rsX * delta * 0.6, rsY * delta * 0.6);
        store.setCameraDelta(deltaVec);
    }

    // 2. BUTTON EDGE DETECTION
    const buttons = gp.buttons.map(b => b.pressed);
    
    const isPressed = (idx: number) => buttons[idx] && !lastButtons.current[idx];
    const isReleased = (idx: number) => !buttons[idx] && lastButtons.current[idx];

    // Options (9): Pause Toggle
    if (isPressed(9)) {
        store.togglePause();
    }

    if (!store.isPaused) {
        // Cross / X (Button 0): Jump
        if (isPressed(0)) {
            store.requestJump();
        }

        // Circle (Button 1): Dodge
        if (isPressed(1)) {
            store.triggerDodge();
        }

        // Square (Button 2) or R1 (Button 5): Melee Combat Logic
        if (isPressed(2) || isPressed(5)) {
            store.setMeleeCharging(true);
            chargeStartTime.current = Date.now();
        }
        if (isReleased(2) || isReleased(5)) {
            if (chargeStartTime.current) {
                store.requestMelee();
                store.setMeleeCharging(false);
            }
        }
        
        // Triangle (3): Interact
        if (isPressed(3)) {
            store.requestInteraction();
        }

        // L1 (4): Stance Toggle
        if (isPressed(4)) {
            store.toggleStance();
        }

        // R2 (7): Kamehameha
        if (isPressed(7)) {
            store.setKamehamehaCharging(true);
        }
        if (isReleased(7)) {
            store.fireKamehameha();
            store.setKamehamehaCharging(false);
        }
    }

    lastButtons.current = buttons;
  });

  return null;
};
