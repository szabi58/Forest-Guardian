
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { RigidBody, RapierRigidBody, CuboidCollider, MeshCollider } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, livePlayerPosition, IS_MOBILE } from '../store';
import { EnvironmentObjectData } from '../types';

export const getTerrainHeight = (x: number, z: number) => {
  const noise2D = (px: number, py: number) => {
    const floorX = Math.floor(px);
    const floorY = Math.floor(py);
    const fracX = px - floorX;
    const fracY = py - floorY;
    const random = (x: number, y: number) => {
      const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
      return s - Math.floor(s);
    };
    const f00 = random(floorX, floorY);
    const f10 = random(floorX + 1, floorY);
    const f01 = random(floorX, floorY + 1);
    const f11 = random(floorX + 1, floorY + 1);
    const ux = fracX * fracX * (3.0 - 2.0 * fracX);
    const uy = fracY * fracY * (3.0 - 2.0 * fracY);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(f00, f10, ux), THREE.MathUtils.lerp(f01, f11, ux), uy);
  };

  const SCALE = 0.04;
  const MAGNITUDE = 8.0;
  const FREQUENCY = 1.0;
  const OCTAVES = 3;
  let height = 0;
  let amp = 1.0;
  let freq = FREQUENCY;
  for (let i = 0; i < OCTAVES; i++) {
    height += noise2D(x * SCALE * freq, z * SCALE * freq) * amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  height = (height - 0.5) * MAGNITUDE;

  // Town flattening logic
  const townCenter = { x: 32, z: 5 };
  const townFlatRadius = 38; 
  const townBlendRadius = 15;
  const distToTown = Math.sqrt((x - townCenter.x) ** 2 + (z - townCenter.z) ** 2);
  const townFlattenFactor = THREE.MathUtils.smoothstep(distToTown, townFlatRadius, townFlatRadius + townBlendRadius);

  // Spawn point flattening logic
  const spawnFlatRadius = 10;
  const spawnBlendRadius = 10;
  const distToSpawn = Math.sqrt(x * x + z * z);
  const spawnFlattenFactor = THREE.MathUtils.smoothstep(distToSpawn, spawnFlatRadius, spawnFlatRadius + spawnBlendRadius);

  const finalFlattenFactor = Math.min(townFlattenFactor, spawnFlattenFactor);

  return height * finalFlattenFactor;
};

export const getTerrainNormal = (x: number, z: number) => {
    const h = 0.1;
    const hL = getTerrainHeight(x - h, z);
    const hR = getTerrainHeight(x + h, z);
    const hD = getTerrainHeight(x, z - h);
    const hU = getTerrainHeight(x, z + h);
    const normal = new THREE.Vector3(hL - hR, 2 * h, hD - hU).normalize();
    return normal;
};

const applyWindAndAO = (shader: any, isLeaf: boolean) => {
  if (!shader) return;

  const vs = String(shader.vertexShader || '');
  const fs = String(shader.fragmentShader || '');

  if (vs === '' || fs === '') return;

  if (vs.includes('float heightFactor = smoothstep')) return;
  
  shader.uniforms.uTime = { value: 0 };
  
  shader.vertexShader = `
    uniform float uTime;
    varying vec3 vWorldPos;
    varying float vVaryingAO;
    ${vs}
  `.replace(
    '#include <begin_vertex>',
    `
    #include <begin_vertex>
    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
    vWorldPos = worldPos.xyz;
    float heightFactor = smoothstep(0.0, 8.0, worldPos.y);
    // Layered wind: slow broad gust + faster local sway, both fade to zero at the roots
    float wind = (sin(uTime * 1.1 + worldPos.x * 0.15 + worldPos.z * 0.12)
                + sin(uTime * 0.37 + worldPos.x * 0.05) * 0.6) * 0.18 * heightFactor;
    ${isLeaf ? 'wind += sin(uTime * 5.0 + worldPos.y * 10.0) * 0.05 * heightFactor;' : ''}
    transformed.x += wind;
    transformed.z += wind * 0.5;
    vVaryingAO = ${isLeaf ? 'smoothstep(0.0, 3.5, length(transformed.xz))' : '1.0'};
    `
  );

  shader.fragmentShader = `
    varying vec3 vWorldPos;
    varying float vVaryingAO;
    \n${fs}
  `.replace(
    '#include <color_fragment>',
    `
    #include <color_fragment>
    diffuseColor.rgb *= vVaryingAO;
    ${isLeaf ? `
    vec3 lightDir = normalize(vec3(60.0, 100.0, 60.0));
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float sss = pow(max(0.0, dot(viewDir, -lightDir)), 3.0) * 0.5;
    diffuseColor.rgb += vec3(0.2, 0.6, 0.1) * sss; 
    ` : ''}
    `
  );
};

// Shared, cached materials for all trees: previously every trunk/foliage cluster
// created its own material + useFrame updater (~1000+ of each across the forest).
// One material per color is enough; a single useFrame in Environment drives the wind.
const treeMaterialCache = new Map<string, THREE.Material>();
const windShaders: { uniforms: { uTime: { value: number } } }[] = [];

const getTreeMaterial = (color: string, isLeaf: boolean): THREE.Material => {
  const key = `${color}|${isLeaf ? 'leaf' : 'bark'}`;
  let mat = treeMaterialCache.get(key);
  if (!mat) {
    mat = isLeaf
      ? new THREE.MeshToonMaterial({ color, alphaTest: 0.5, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    mat.onBeforeCompile = (shader) => {
      applyWindAndAO(shader, isLeaf);
      if (shader?.uniforms?.uTime) windShaders.push(shader as any);
    };
    treeMaterialCache.set(key, mat);
  }
  return mat;
};

// Deterministic per-object randomness: trees/rocks must look the same on every
// render (raw Math.random() in JSX made foliage reshuffle whenever React re-rendered).
const hashSeed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const mulberry32 = (a: number) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// variant 0 = oak (broad blob canopy), 1 = pine (stacked cones), 2 = birch (tall, pale bark, light leaves)
const TREE_PALETTES = [
  { trunk: '#4a3524', foliage: ['#1e4d2b', '#2a5f33', '#27562c'] },
  { trunk: '#3b2a20', foliage: ['#1d4a2a', '#235238', '#1a452b'] },
  { trunk: '#8a8172', foliage: ['#7cb342', '#8bc34a', '#66a03a'] },
];

const Tree: React.FC<{ data: EnvironmentObjectData }> = ({ data }) => {
  const felledRbRef = useRef<RapierRigidBody>(null);
  const alignTreesToSlope = useGameStore(s => s.ambientSettings.alignTreesToSlope);
  const variant = data.variant || 0;
  const config = useMemo(() => {
    const rand = mulberry32(hashSeed(data.id));
    const palette = TREE_PALETTES[variant] ?? TREE_PALETTES[0];
    const foliage = palette.foliage[Math.floor(rand() * palette.foliage.length)];
    const base = variant === 1
      ? { height: 6 + rand() * 2.5, radius: 0.5 + rand() * 0.18 }
      : variant === 2
        ? { height: 8 + rand() * 3, radius: 0.28 + rand() * 0.1 }
        : { height: 6.5 + rand() * 2, radius: 0.45 + rand() * 0.2 };
    // Overlapping ellipsoid canopy blobs (deciduous variants)
    const blobs = Array.from({ length: 6 }).map((_, i) => {
      const a = rand() * Math.PI * 2;
      const r = i === 0 ? 0 : 0.7 + rand() * 1.3;
      return {
        pos: [Math.cos(a) * r, i === 0 ? 0.4 : rand() * 1.7 - 0.4, Math.sin(a) * r] as [number, number, number],
        scale: [1.3 + rand() * 0.9, 1.0 + rand() * 0.6, 1.3 + rand() * 0.9] as [number, number, number],
        rot: rand() * Math.PI,
      };
    });
    const branches = Array.from({ length: variant === 2 ? 2 : 3 }).map((_, i) => ({
      yaw: rand() * Math.PI * 2,
      tilt: 0.5 + rand() * 0.35,
      h: 0.45 + i * 0.16 + rand() * 0.08,
    }));
    // Needle cone layers (pine variant)
    const coneLayers = Array.from({ length: 4 }).map((_, i) => ({
      y: 0.3 + i * 0.2,
      r: (2.5 - i * 0.52) * (0.9 + rand() * 0.2),
      h: 2.3 - i * 0.28,
    }));
    return {
      ...base,
      trunk: palette.trunk,
      foliage,
      yaw: rand() * Math.PI * 2,
      leanDir: rand() * Math.PI * 2,
      lean: 0.02 + rand() * 0.05,
      blobs,
      branches,
      coneLayers,
    };
  }, [data.id, variant]);

  const stableTransform = useMemo(() => {
      const x = data.position[0];
      const z = data.position[2];
      const terrainY = getTerrainHeight(x, z);
      const pos = new THREE.Vector3(x, terrainY, z);
      const normal = getTerrainNormal(x, z);
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, normal);
      const rot = alignTreesToSlope ? new THREE.Euler().setFromQuaternion(quat) : new THREE.Euler(0, 0, 0);
      return { pos, rot };
  }, [data.position, alignTreesToSlope]);

  useEffect(() => { 
    if (data.isChopped) {
        if (felledRbRef.current) {
            felledRbRef.current.setBodyType(0, true); 
            const fallAngle = Math.random() * Math.PI * 2;
            const kickForce = 20 + Math.random() * 20;
            felledRbRef.current.applyImpulse({ x: Math.cos(fallAngle) * kickForce, y: 10, z: Math.sin(fallAngle) * kickForce }, true);
        }
    } else {
        if (felledRbRef.current) {
            felledRbRef.current.setBodyType(1, true);
            felledRbRef.current.setTranslation(stableTransform.pos, true);
            felledRbRef.current.setRotation(new THREE.Quaternion().setFromEuler(stableTransform.rot), true);
        }
    }
  }, [data.isChopped, stableTransform]);

  const barkMat = getTreeMaterial(config.trunk, false);
  const leafMat = getTreeMaterial(config.foliage, true);

  const treeContent = (
    <group scale={data.scale || 1} rotation={[Math.cos(config.leanDir) * config.lean, config.yaw, Math.sin(config.leanDir) * config.lean]}>
      {/* Root flare: hides the trunk/ground seam on any slope */}
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[config.radius * 1.05, config.radius * 1.9, 0.9, 7]} />
        <primitive object={barkMat} attach="material" />
      </mesh>
      {/* Trunk: tapered, extended below ground level so it can never float */}
      <mesh position={[0, config.height / 2 - 0.4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[config.radius * 0.55, config.radius, config.height + 0.8, 7, 3]} />
        <primitive object={barkMat} attach="material" />
      </mesh>
      {variant === 1 ? (
        config.coneLayers.map((l, i) => (
          <mesh key={i} position={[0, config.height * l.y + l.h * 0.35, 0]} castShadow>
            <coneGeometry args={[l.r, l.h, 8]} />
            <primitive object={leafMat} attach="material" />
          </mesh>
        ))
      ) : (
        <>
          {config.branches.map((b, i) => (
            <group key={i} position={[0, config.height * b.h, 0]} rotation={[0, b.yaw, b.tilt]}>
              <mesh position={[0, config.height * 0.14, 0]} castShadow>
                <cylinderGeometry args={[config.radius * 0.28, config.radius * 0.45, config.height * 0.32, 6]} />
                <primitive object={barkMat} attach="material" />
              </mesh>
              <mesh position={[0, config.height * 0.3, 0]} scale={[1.15, 0.9, 1.15]} castShadow>
                <sphereGeometry args={[1.05, 8, 7]} />
                <primitive object={leafMat} attach="material" />
              </mesh>
            </group>
          ))}
          <group position={[0, config.height * 0.97, 0]}>
            {config.blobs.map((bl, i) => (
              <mesh key={i} position={bl.pos} scale={bl.scale} rotation={[0, bl.rot, 0]} castShadow>
                <sphereGeometry args={[1.05, 8, 7]} />
                <primitive object={leafMat} attach="material" />
              </mesh>
            ))}
          </group>
        </>
      )}
    </group>
  );

  return (
    <group position={stableTransform.pos} rotation={stableTransform.rot}>
      <RigidBody
        ref={felledRbRef}
        type={data.isChopped ? "dynamic" : "fixed"}
        position={[0, 0, 0]}
        userData={{ type: 'ENVIRONMENT', id: data.id }}
        colliders={false}
        restitution={0} friction={2.0} linearDamping={0.6} angularDamping={0.8}
      >
        <CuboidCollider args={[config.radius, config.height * 0.5, config.radius]} position={[0, config.height * 0.5, 0]} />
        {treeContent}
      </RigidBody>
    </group>
  );
};

// Grey-to-mossy stone tones; picked per rock from its seed
const ROCK_COLORS = ['#4d4d4a', '#585850', '#4a5044', '#555349'];

const Rock: React.FC<{ data: EnvironmentObjectData }> = ({ data }) => {
  const cfg = useMemo(() => {
    const rand = mulberry32(hashSeed(data.id));
    return {
      color: ROCK_COLORS[Math.floor(rand() * ROCK_COLORS.length)],
      rot: [rand() * Math.PI, rand() * Math.PI, rand() * Math.PI] as [number, number, number],
      squash: [1 + rand() * 0.4, 0.6 + rand() * 0.5, 1 + rand() * 0.4] as [number, number, number],
    };
  }, [data.id]);
  return (
    <RigidBody type="fixed" position={data.position} colliders={false} userData={{ type: 'ENVIRONMENT', id: data.id }}>
      <CuboidCollider args={[data.scale, data.scale, data.scale]} />
      {/* Settled slightly into the soil, irregular orientation per seed */}
      <mesh
        scale={[data.scale * cfg.squash[0], data.scale * cfg.squash[1], data.scale * cfg.squash[2]]}
        rotation={cfg.rot}
        position={[0, -data.scale * 0.15, 0]}
        castShadow receiveShadow
      >
        <dodecahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={cfg.color} roughness={0.95} />
      </mesh>
    </RigidBody>
  );
};

const Grass: React.FC = () => {
  // Phones choke on 26k animated blades; a third still reads as dense grass
  const count = IS_MOBILE ? 9000 : 26000;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const MASK_SIZE = 80; const CANVAS_RESOLUTION = 1024;
  const maskCenter = useRef(new THREE.Vector3(0, 0, 0));
  const lastMaskCenter = useRef(new THREE.Vector3(0, 0, 0));
  const buildings = useGameStore(s => s.buildings);
  
  const { canvas, context, texture, scratchCanvas, scratchCtx } = useMemo(() => {
    const can = document.createElement('canvas'); can.width = CANVAS_RESOLUTION; can.height = CANVAS_RESOLUTION;
    const ctx = can.getContext('2d', { alpha: false })!; ctx.fillStyle = 'black'; ctx.fillRect(0, 0, CANVAS_RESOLUTION, CANVAS_RESOLUTION);
    // Persistent scratch buffer for recentering the mask (was allocated per frame)
    const scratch = document.createElement('canvas'); scratch.width = CANVAS_RESOLUTION; scratch.height = CANVAS_RESOLUTION;
    return { canvas: can, context: ctx, texture: new THREE.CanvasTexture(can), scratchCanvas: scratch, scratchCtx: scratch.getContext('2d')! };
  }, []);

  const cutGrassAt = useCallback((x1: number, z1: number, radius: number, strength: number, x2?: number, z2?: number) => {
    const toCanvasSpace = (val: number, center: number) => ((val - center) / MASK_SIZE + 0.5) * CANVAS_RESOLUTION;
    // Use the canvas's actual center (last recenter point), not the raw player position
    const cx = lastMaskCenter.current.x; const cz = lastMaskCenter.current.z;
    const u1 = toCanvasSpace(x1, cx); const v1 = toCanvasSpace(z1, cz);
    const pxRadius = (radius / MASK_SIZE) * CANVAS_RESOLUTION;
    context.strokeStyle = 'white'; context.fillStyle = 'white'; context.lineCap = 'round'; context.lineWidth = pxRadius * 2; context.globalAlpha = strength;
    if (x2 !== undefined && z2 !== undefined) {
        const u2 = toCanvasSpace(x2, cx); const v2 = toCanvasSpace(z2, cz);
        context.beginPath(); context.moveTo(u1, v1); context.lineTo(u2, v2); context.stroke();
    } else {
        context.beginPath(); context.arc(u1, v1, pxRadius, 0, Math.PI * 2); context.fill();
    }
    texture.needsUpdate = true;
  }, [context, texture]);

  useEffect(() => { if (useGameStore.getState().registerCutGrass) useGameStore.getState().registerCutGrass(cutGrassAt); }, [cutGrassAt]);

  const { geometry, bladeNoise } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(0.18, 1.0, 1, 4); geo.translate(0, 0.5, 0);
    // Taper each blade toward the tip so it reads as grass, not a ribbon
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (1 - p.getY(i) * 0.8));
    p.needsUpdate = true;
    const noise = new Float32Array(count); for (let i = 0; i < count; i++) noise[i] = Math.random();
    return { geometry: geo, bladeNoise: noise };
  }, []);

  useEffect(() => {
    if (!meshRef.current) return;
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 300; const z = (Math.random() - 0.5) * 300; const y = getTerrainHeight(x, z);
      dummy.position.set(x, y - 0.05, z); dummy.rotation.y = Math.random() * Math.PI; dummy.scale.setScalar(0.55 + Math.random() * 1.35); dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, []);

  const buildingUniforms = useMemo(() => {
    const positions = new Float32Array(buildings.length * 2);
    buildings.forEach((b, i) => {
      positions[i * 2] = b.position[0];
      positions[i * 2 + 1] = b.position[2];
    });
    return positions;
  }, [buildings]);

  const material = useMemo(() => {
    const mat = new THREE.MeshToonMaterial({ side: THREE.DoubleSide, alphaTest: 0.5, transparent: true });
    mat.onBeforeCompile = (shader) => {
      if (!shader) return;

      const vs = String(shader.vertexShader || '');
      const fs = String(shader.fragmentShader || '');

      if (vs === '' || fs === '') return;

      if (vs.includes('attribute float aBladeNoise')) return; // Prevent re-injection

      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uMaskCenter = { value: maskCenter.current };
      shader.uniforms.uMaskSize = { value: MASK_SIZE };
      shader.uniforms.uGrassMask = { value: texture };
      shader.uniforms.uBuildingPositions = { value: buildingUniforms };
      shader.uniforms.uBuildingCount = { value: buildings.length };
      shader.uniforms.uTownCenter = { value: new THREE.Vector2(40, 5) }; 
      shader.uniforms.uTownRadius = { value: 65.0 };

      shader.vertexShader = `
        uniform float uTime; uniform vec3 uMaskCenter; uniform float uMaskSize; uniform sampler2D uGrassMask; attribute float aBladeNoise;
        uniform vec2 uBuildingPositions[16]; uniform int uBuildingCount;
        uniform vec2 uTownCenter; uniform float uTownRadius;
        varying vec3 vWorldPos; varying float vBladeNoise; varying vec2 vUv; varying float vCutValue; varying float vTownFactor;
        float hash(float n) { return fract(sin(n) * 43758.5453123); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i.x + i.y*57.0), hash(i.x + 1.0 + i.y*57.0), f.x), mix(hash(i.x + (i.y+1.0)*57.0), hash(i.x + 1.0 + (i.y+1.0)*57.0), f.x), f.y);
        }
        ${vs}
      `.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vUv = uv; vBladeNoise = aBladeNoise;
        vec4 wPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); vWorldPos = wPos.xyz;
        
        // Building Footprint Culling
        float buildingMask = 0.0;
        for(int i = 0; i < 16; i++) {
            if(i >= uBuildingCount) break;
            float d = distance(vWorldPos.xz, uBuildingPositions[i]);
            if(d < 7.5) buildingMask = 1.0;
        }

        vec2 maskUv = (vWorldPos.xz - uMaskCenter.xz) / uMaskSize + 0.5;
        float dynamicCut = (maskUv.x >= 0.0 && maskUv.x <= 1.0 && maskUv.y >= 0.0 && maskUv.y <= 1.0) ? texture2D(uGrassMask, maskUv).r : 0.0;
        vCutValue = max(dynamicCut, buildingMask);

        // Two grass zones: overgrown wilderness outside the town radius,
        // short kept lawn inside, blended smoothly across the boundary.
        float distToTown = distance(vWorldPos.xz, uTownCenter);
        float townFactor = smoothstep(uTownRadius + 6.0, uTownRadius - 6.0, distToTown);
        vTownFactor = townFactor;
        // Wild blades: tall with per-blade variation. Lawn: uniform and short.
        float heightScale = mix(1.15 + vBladeNoise * 0.5, 0.24, townFactor);
        transformed.y *= heightScale;
        transformed.y *= mix(1.0, 0.0, vCutValue);

        // Wind: broad slow gusts + local ripple + per-blade flutter. Blades bend
        // along their length (tips move, roots stay) and the lawn barely stirs.
        float bend = vUv.y * vUv.y;
        float gust = noise(vWorldPos.xz * 0.06 + uTime * 0.35) - 0.5;
        float ripple = noise(vWorldPos.xz * 0.18 + uTime * 0.9) - 0.5;
        float flutter = sin(uTime * 3.2 + vBladeNoise * 20.0) * 0.05;
        float swayAmp = mix(1.0, 0.12, townFactor);
        transformed.x += (gust * 0.9 + ripple * 0.45 + flutter) * bend * swayAmp;
        transformed.z += (gust * 0.55 + ripple * 0.3) * bend * swayAmp;
      `);

      shader.fragmentShader = `varying vec2 vUv; \nvarying float vCutValue; \nvarying float vBladeNoise; \nvarying float vTownFactor; \n${fs}`.replace('#include <color_fragment>', `
        #include <color_fragment>
        // Wilderness: deep forest greens with sun-bleached tips
        vec3 wildDeep = vec3(0.05, 0.14, 0.03); vec3 wildLush = vec3(0.16, 0.4, 0.07); vec3 wildTip = vec3(0.45, 0.52, 0.15);
        // Town lawn: healthy, saturated, evenly kept green
        vec3 lawnDeep = vec3(0.1, 0.28, 0.06); vec3 lawnTop = vec3(0.28, 0.55, 0.13);
        vec3 straw = vec3(0.82, 0.71, 0.55);
        vec3 wild = mix(mix(wildDeep, wildLush, vBladeNoise), wildTip, pow(vUv.y, 3.0) * 0.6);
        vec3 lawn = mix(lawnDeep, lawnTop, vUv.y * 0.8 + vBladeNoise * 0.2);
        vec3 grassCol = mix(wild, lawn, vTownFactor);
        float baseShade = mix(smoothstep(0.0, 0.6, vUv.y), smoothstep(-0.25, 0.5, vUv.y), vTownFactor);
        diffuseColor.rgb = mix(grassCol, straw, vCutValue) * baseShade;
      `);
      mat.userData.shader = shader;
    };
    return mat;
  }, [texture, buildingUniforms, buildings.length]);

  useFrame((state) => {
    const player = state.scene.getObjectByName('player-model-root');
    if (!player) return;
    player.getWorldPosition(maskCenter.current);
    const dx = maskCenter.current.x - lastMaskCenter.current.x;
    const dz = maskCenter.current.z - lastMaskCenter.current.z;
    // Recenter only after ~1 unit of travel (was every frame, allocating a canvas each time)
    if (Math.abs(dx) > 1.0 || Math.abs(dz) > 1.0) {
        const shiftX = -(dx / MASK_SIZE) * CANVAS_RESOLUTION; const shiftY = -(dz / MASK_SIZE) * CANVAS_RESOLUTION;
        scratchCtx.clearRect(0, 0, CANVAS_RESOLUTION, CANVAS_RESOLUTION);
        scratchCtx.drawImage(canvas, 0, 0);
        context.globalAlpha = 1;
        context.fillStyle = 'black'; context.fillRect(0, 0, CANVAS_RESOLUTION, CANVAS_RESOLUTION); context.drawImage(scratchCanvas, shiftX, shiftY);
        lastMaskCenter.current.copy(maskCenter.current); texture.needsUpdate = true;
    }
    if (state.clock.elapsedTime % 1 < 0.02) {
      context.globalAlpha = 0.005; context.fillStyle = 'black'; context.fillRect(0, 0, CANVAS_RESOLUTION, CANVAS_RESOLUTION); texture.needsUpdate = true;
    }
    if (material.userData.shader && material.userData.shader.uniforms.uTime) {
      material.userData.shader.uniforms.uTime.value = state.clock.elapsedTime; material.userData.shader.uniforms.uMaskCenter.value.copy(lastMaskCenter.current);
    }
  });

  return <instancedMesh ref={meshRef} args={[geometry, material, count]} frustumCulled={false}><instancedBufferAttribute attach="aBladeNoise" args={[bladeNoise, 1]} /></instancedMesh>;
};

// --- AMBIENT NATURE (visual only, no colliders) ---

const TOWN_GRASS_CENTER = new THREE.Vector2(40, 5);
const isInTownGrassZone = (x: number, z: number) => Math.hypot(x - TOWN_GRASS_CENTER.x, z - TOWN_GRASS_CENTER.y) < 68;

// Low leafy shrubs scattered through the wilderness
const Bushes: React.FC = () => {
  const count = 130;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const shades = useMemo(() => ['#2f5d28', '#356633', '#28511f', '#3c6e2f'].map(c => new THREE.Color(c)), []);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    const rand = mulberry32(1337);
    for (let i = 0; i < count; i++) {
      let x = 0, z = 0, tries = 0;
      do { x = (rand() - 0.5) * 280; z = (rand() - 0.5) * 280; tries++; } while (isInTownGrassZone(x, z) && tries < 20);
      const s = 0.5 + rand() * 0.8;
      dummy.position.set(x, getTerrainHeight(x, z) - s * 0.25, z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(s * (0.9 + rand() * 0.4), s * 0.7, s * (0.9 + rand() * 0.4));
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, shades[Math.floor(rand() * shades.length)]);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [shades]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false} castShadow receiveShadow>
      <sphereGeometry args={[1, 8, 6]} />
      <meshToonMaterial color="#ffffff" />
    </instancedMesh>
  );
};

// Small flower heads: peeking through the tall grass outside, tidy dots on the town lawn
const Flowers: React.FC = () => {
  const count = IS_MOBILE ? 300 : 700;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const petals = useMemo(() => ['#ffffff', '#ffd54f', '#f48fb1', '#b39ddb', '#ff8a65'].map(c => new THREE.Color(c)), []);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    const rand = mulberry32(7331);
    for (let i = 0; i < count; i++) {
      const x = (rand() - 0.5) * 300; const z = (rand() - 0.5) * 300;
      const inTown = isInTownGrassZone(x, z);
      const headHeight = inTown ? 0.22 : 0.55 + rand() * 0.3;
      dummy.position.set(x, getTerrainHeight(x, z) + headHeight, z);
      dummy.rotation.set(rand() * 0.5, rand() * Math.PI, rand() * 0.5);
      dummy.scale.setScalar(0.07 + rand() * 0.05);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, petals[Math.floor(rand() * petals.length)]);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [petals]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#ffffff" roughness={0.6} />
    </instancedMesh>
  );
};

// Gentle drift of leaves falling around the player
const FallingLeaves: React.FC = () => {
  const count = 45;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const parts = useMemo(() => Array.from({ length: count }).map(() => ({
    x: 0, y: -100, z: 0,
    phase: Math.random() * Math.PI * 2,
    speed: 0.45 + Math.random() * 0.5,
    size: 0.07 + Math.random() * 0.06,
  })), []);

  useFrame((state, delta) => {
    if (!meshRef.current || delta <= 0 || delta > 0.1) return;
    const t = state.clock.elapsedTime;
    const [px, , pz] = livePlayerPosition;
    for (let i = 0; i < count; i++) {
      const p = parts[i];
      if (p.y < getTerrainHeight(p.x, p.z) + 0.05) {
        p.x = px + (Math.random() - 0.5) * 55;
        p.z = pz + (Math.random() - 0.5) * 55;
        p.y = getTerrainHeight(p.x, p.z) + 6 + Math.random() * 7;
      }
      p.y -= p.speed * delta;
      p.x += Math.sin(t * 1.2 + p.phase) * delta * 0.8;
      p.z += Math.cos(t * 0.9 + p.phase) * delta * 0.6;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(t * 1.4 + p.phase, p.phase, t * 0.8 + p.phase * 0.5);
      dummy.scale.setScalar(p.size);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial color="#6a9a42" side={THREE.DoubleSide} roughness={0.9} />
    </instancedMesh>
  );
};

const TERRAIN_SIZE = 500;

export const Environment: React.FC = () => {
  const envObjs = useGameStore(s => s.environmentObjects);
  const size = TERRAIN_SIZE;
  const segs = 150;

  // Single wind clock for every shared tree material
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < windShaders.length; i++) windShaders[i].uniforms.uTime.value = t;
  });
  // Single terrain geometry with Y-up so collider and visual match (avoids trimesh rotation issues)
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(size, size, segs, segs);
    const pos = g.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i];
      const z = -pos[i + 1];
      pos[i + 2] = getTerrainHeight(x, z);
    }
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }, []);

  const material = useMemo(() => {
      const mat = new THREE.MeshStandardMaterial({ color: "#1e2d1e", roughness: 1 });
      mat.onBeforeCompile = (shader) => {
          if (!shader) return;
          
          const fs = String(shader.fragmentShader || '');

          if (fs === '') return;
          
          // Guard against repeated injection
          if (fs.includes('vec3 townPos')) return;

          shader.fragmentShader = fs.replace(
              '#include <color_fragment>',
              `
              #include <color_fragment>
              // Path logic: darken color based on distance to town center hub
              vec3 townPos = vec3(32.0, 0.0, 5.0);
              float distToTown = distance(vViewPosition.xz, townPos.xz);
              float pathMask = smoothstep(35.0, 10.0, distToTown);
              
              // Vertex Painting simulation for paths
              float dirtNoise = fract(sin(dot(vViewPosition.xz, vec2(12.9898, 78.233))) * 43758.5453);
              vec3 dirtColor = vec3(0.25, 0.18, 0.12) * (0.8 + dirtNoise * 0.4);
              diffuseColor.rgb = mix(diffuseColor.rgb, dirtColor, pathMask * 0.8);
              `
          );
      };
      return mat;
  }, []);

  // Safety floor: prevents falling through the map if colliders fail or tunnel
  const safetyFloorY = -25;
  const halfExtent = 260;

  return (
    <group>
      {/* Terrain: visual mesh + trimesh built from the same geometry (exact match) */}
      <RigidBody type="fixed" friction={2} colliders={false}>
        <MeshCollider type="trimesh">
          <mesh geometry={geo} receiveShadow material={material} />
        </MeshCollider>
      </RigidBody>
      <RigidBody type="fixed" position={[0, safetyFloorY, 0]} friction={1} colliders={false}>
        <CuboidCollider args={[halfExtent, 1, halfExtent]} />
      </RigidBody>
      <Grass />
      <Bushes />
      <Flowers />
      <FallingLeaves />
      <ambientLight intensity={0.4} />
      <directionalLight position={[60, 100, 60]} intensity={1.5} castShadow shadow-mapSize={IS_MOBILE ? [1024, 1024] : [2048, 2048]} />
      {envObjs.map(obj => (obj.type === 'TREE' ? <Tree key={obj.id} data={obj} /> : <Rock key={obj.id} data={obj} />))}
    </group>
  );
};
