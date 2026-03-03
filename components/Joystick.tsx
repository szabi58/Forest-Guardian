import React, { useState, useRef, useEffect } from 'react';
import { Vector2 } from 'three';
import { useGameStore } from '../store';

const JOYSTICK_SIZE = 120;
const HANDLE_SIZE = 60;
const MAX_RADIUS = JOYSTICK_SIZE / 2;
const TAP_THRESHOLD_MS = 200;
const TAP_MOVE_THRESHOLD = 15;

export const Joystick: React.FC = () => {
  const setJoystickVector = useGameStore((state) => state.setJoystickVector);
  const setJoystickActive = useGameStore((state) => state.setJoystickActive);
  const triggerDodge = useGameStore((state) => state.triggerDodge);
  const isGameOver = useGameStore((state) => state.isGameOver);
  const [handlePos, setHandlePos] = useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);
  const joystickRef = useRef<HTMLDivElement>(null);
  
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
    const newX = Math.cos(angle) * clampedDistance;
    const newY = Math.sin(angle) * clampedDistance;

    setHandlePos({ x: newX, y: newY });

    const normalizedX = newX / MAX_RADIUS;
    const normalizedY = newY / MAX_RADIUS;
    setJoystickVector(new Vector2(normalizedX, normalizedY));
    
    const curStartPos = startPos.current || { x: 0, y: 0 };
    const moveDist = Math.sqrt(
      Math.pow(clientX - (curStartPos.x || 0), 2) + 
      Math.pow(clientY - (curStartPos.y || 0), 2)
    );
    if (moveDist > TAP_MOVE_THRESHOLD) {
      hasMovedSignificantly.current = true;
    }
  };

  const onStart = (e: React.TouchEvent | React.MouseEvent) => {
    const isTouch = 'touches' in e;
    if (isTouch && (!e.touches || e.touches.length === 0)) return;
    
    setIsActive(true);
    setJoystickActive(true);
    
    const firstTouch = isTouch ? e.touches[0] : (e as React.MouseEvent);
    if (!firstTouch) return;

    const clientX = firstTouch.clientX;
    const clientY = firstTouch.clientY;
    
    startTime.current = Date.now();
    startPos.current = { x: clientX, y: clientY };
    hasMovedSignificantly.current = false;
    
    handleTouch(clientX, clientY);
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
    
    const now = Date.now();
    const duration = now - startTime.current;

    if (duration < TAP_THRESHOLD_MS && !hasMovedSignificantly.current) {
      triggerDodge();
    }
    
    setIsActive(false);
    setJoystickActive(false);
    setHandlePos({ x: 0, y: 0 });
    setJoystickVector(new Vector2(0, 0));
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
      onMouseDown={onStart}
      onTouchStart={onStart}
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
        }}
      />
    </div>
  );
};