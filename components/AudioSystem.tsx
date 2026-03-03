
import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store';

const FOREST_AMBIENCE = 'https://assets.mixkit.co/active_storage/sfx/2418/2418-preview.mp3';
const TOWN_AMBIENCE = 'https://assets.mixkit.co/active_storage/sfx/2419/2419-preview.mp3'; // Wood chopping/wind mix

export const AudioSystem: React.FC = () => {
    const isGameOver = useGameStore(s => s.isGameOver);
    const forestAudio = useRef<HTMLAudioElement | null>(null);
    const townAudio = useRef<HTMLAudioElement | null>(null);
    const [isStarted, setIsStarted] = useState(false);
    
    const townCenter = new THREE.Vector3(25, 0, 10);
    const playerWorldPos = new THREE.Vector3();

    useEffect(() => {
        forestAudio.current = new Audio(FOREST_AMBIENCE);
        townAudio.current = new Audio(TOWN_AMBIENCE);
        forestAudio.current.loop = true;
        townAudio.current.loop = true;
        forestAudio.current.volume = 0;
        townAudio.current.volume = 0;

        const startAudio = () => {
            if (isStarted) return;
            forestAudio.current?.play().catch(() => {});
            townAudio.current?.play().catch(() => {});
            setIsStarted(true);
        };

        window.addEventListener('pointerdown', startAudio);
        return () => window.removeEventListener('pointerdown', startAudio);
    }, [isStarted]);

    useFrame((state) => {
        if (!isStarted || isGameOver) return;
        
        const player = state.scene.getObjectByName('player-model-root');
        if (!player) return;

        player.getWorldPosition(playerWorldPos);
        const distToTown = playerWorldPos.distanceTo(townCenter);
        
        // Town is bustle zone within 40 units
        const townFactor = THREE.MathUtils.smoothstep(distToTown, 50, 15);
        const forestFactor = 1.0 - townFactor;

        if (forestAudio.current) forestAudio.current.volume = forestFactor * 0.15;
        if (townAudio.current) townAudio.current.volume = townFactor * 0.25;
    });

    return null;
};
