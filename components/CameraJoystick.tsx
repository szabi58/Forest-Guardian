import React, { useState, useRef, useEffect } from 'react';
import { Vector2 } from 'three';
import { useGameStore } from '../store';

const JOYSTICK_SIZE = 150;
const HANDLE_SIZE = 40;
const MAX_RADIUS = JOYSTICK_SIZE / 2;

export const CameraJoystick: React.FC = () => {
  const setCameraJoystickVector = useGameStore((state) => state.setCameraJoystickVector);
  const setCameraJoystickActive = useGameStore((state) => state.setCameraJoystickActive);
  const isGameOver = useGameStore((state) => state.isGameOver);
  const [handlePos, setHandlePos] = useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);
  const [visualPos, setVisualPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouch = (clientX: number, clientY: number) => {
    if (!isActive || typeof clientX === 'undefined') return;

    const deltaX = clientX - (visualPos?.x || 0);
    const deltaY = clientY - (visualPos?.y || 0);

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const angle = Math.atan2(deltaY, deltaX);

    const clampedDistance = Math.min(distance, MAX_RADIUS);
    const newX = Math.cos(angle) * clampedDistance;
    const newY = Math.sin(angle) * clampedDistance;

    setHandlePos({ x: newX, y: newY });

    const normalizedX = newX / MAX_RADIUS;
    const normalizedY = newY / MAX_RADIUS;
    if (setCameraJoystickVector) {
        setCameraJoystickVector(new Vector2(normalizedX, normalizedY));
    }
  };

  const onStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (isGameOver) return;
    
    const isTouch = 'touches' in e;
    if (isTouch && (!e.touches || e.touches.length === 0)) return;

    const firstTouch = isTouch ? e.touches[0] : (e as React.MouseEvent);
    if (!firstTouch) return;

    setIsActive(true);
    if (setCameraJoystickActive) setCameraJoystickActive(true);
    
    const clientX = firstTouch.clientX;
    const clientY = firstTouch.clientY;
    
    setVisualPos({ x: clientX, y: clientY });
    setHandlePos({ x: 0, y: 0 });
  };

  const onMove = (e: TouchEvent | MouseEvent) => {
    if (!isActive) return;
    const isTouch = 'touches' in e;
    if (isTouch && (!(e as TouchEvent).touches || (e as TouchEvent).touches.length === 0)) return;
    
    const firstTouch = isTouch ? (e as TouchEvent).touches[0] : (e as MouseEvent);
    if (!firstTouch) return;

    const clientX = firstTouch.clientX;
    const clientY = firstTouch.clientY;
    handleTouch(clientX, clientY);
  };

  const onEnd = () => {
    if (!isActive) return;
    setIsActive(false);
    if (setCameraJoystickActive) setCameraJoystickActive(false);
    setHandlePos({ x: 0, y: 0 });
    if (setCameraJoystickVector) {
        setCameraJoystickVector(new Vector2(0, 0));
    }
  };

  useEffect(() => {
    if (isActive) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onEnd);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd);
    }
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0 pointer-events-auto"
      style={{ touchAction: 'none' }}
      onMouseDown={onStart}
      onTouchStart={onStart}
    >
      {isActive && visualPos && (
        <div
          className="absolute pointer-events-none flex items-center justify-center"
          style={{
            width: JOYSTICK_SIZE,
            height: JOYSTICK_SIZE,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            left: (visualPos.x || 0) - JOYSTICK_SIZE / 2,
            top: (visualPos.y || 0) - JOYSTICK_SIZE / 2,
            transform: 'scale(1)',
          }}
        >
          <div
            className="absolute"
            style={{
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.15)',
              transform: `translate(${handlePos.x || 0}px, ${handlePos.y || 0}px)`,
            }}
          />
        </div>
      )}
    </div>
  );
};