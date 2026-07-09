import React, { useState, useRef } from 'react';
import { Vector2 } from 'three';
import { useGameStore } from '../store';

const JOYSTICK_SIZE = 120;
const HANDLE_SIZE = 60;
const MAX_RADIUS = JOYSTICK_SIZE / 2;
const TAP_THRESHOLD_MS = 200;
const TAP_MOVE_THRESHOLD = 15;
// Deflection (as a fraction of MAX_RADIUS) at which output saturates to 1.0.
// Full speed doesn't require pinning the thumb exactly on the rim; pushes
// below this remain analog for slow walking.
const FULL_SPEED_DEFLECTION = 0.75;

// One movement joystick driven by Pointer Events with an explicit pointer id.
// Multi-touch safe: only the finger that started on the joystick moves it, so
// a second thumb dragging the camera (or tapping buttons) can't hijack or end
// the stick. Pointer capture keeps move/up events flowing to this element even
// when the finger wanders outside the base circle.
export const Joystick: React.FC = () => {
  const setJoystickVector = useGameStore((state) => state.setJoystickVector);
  const setJoystickActive = useGameStore((state) => state.setJoystickActive);
  const triggerDodge = useGameStore((state) => state.triggerDodge);
  const isGameOver = useGameStore((state) => state.isGameOver);
  const [handlePos, setHandlePos] = useState({ x: 0, y: 0 });
  const joystickRef = useRef<HTMLDivElement>(null);

  const activePointerId = useRef<number | null>(null);
  const startTime = useRef<number>(0);
  const startPos = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
  const hasMovedSignificantly = useRef<boolean>(false);

  const handleTouch = (clientX: number, clientY: number) => {
    if (!joystickRef.current || isGameOver || typeof clientX === 'undefined') return;

    const rect = joystickRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const angle = Math.atan2(deltaY, deltaX);

    const clampedDistance = Math.min(distance, MAX_RADIUS);
    setHandlePos({ x: Math.cos(angle) * clampedDistance, y: Math.sin(angle) * clampedDistance });

    // Analog magnitude with a saturation zone: edge pushes read exactly 1.0
    const magnitude = Math.min(1, (clampedDistance / MAX_RADIUS) / FULL_SPEED_DEFLECTION);
    setJoystickVector(new Vector2(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude));

    const moveDist = Math.hypot(clientX - startPos.current.x, clientY - startPos.current.y);
    if (moveDist > TAP_MOVE_THRESHOLD) {
      hasMovedSignificantly.current = true;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (isGameOver || activePointerId.current !== null) return;
    activePointerId.current = e.pointerId;
    joystickRef.current?.setPointerCapture(e.pointerId);

    setJoystickActive(true);
    startTime.current = Date.now();
    startPos.current = { x: e.clientX, y: e.clientY };
    hasMovedSignificantly.current = false;

    handleTouch(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerId !== activePointerId.current) return;
    handleTouch(e.clientX, e.clientY);
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    if (e.pointerId !== activePointerId.current) return;
    activePointerId.current = null;

    const duration = Date.now() - startTime.current;
    if (duration < TAP_THRESHOLD_MS && !hasMovedSignificantly.current) {
      triggerDodge();
    }

    setJoystickActive(false);
    setHandlePos({ x: 0, y: 0 });
    setJoystickVector(new Vector2(0, 0));
  };

  return (
    <div
      ref={joystickRef}
      className="relative flex items-center justify-center pointer-events-auto select-none"
      style={{
        width: JOYSTICK_SIZE,
        height: JOYSTICK_SIZE,
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '2px solid rgba(255, 255, 255, 0.2)',
        backdropFilter: 'blur(4px)',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div
        className="absolute transition-transform duration-75"
        style={{
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.4)',
          border: '2px solid rgba(255, 255, 255, 0.6)',
          transform: `translate(${handlePos.x || 0}px, ${handlePos.y || 0}px)`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
