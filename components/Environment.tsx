
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { RigidBody, RapierRigidBody, CuboidCollider, MeshCollider } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store';
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
    float wind = sin(uTime * 1.5 + worldPos.x * 0.2 + worldPos.z * 0.2) * 0.3 * heightFactor;
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

const FoliageCluster: React.FC<{ color: string; count?: number }> = ({ color, count = 5 }) => {
  const leafMat = useMemo(() => {
    const mat = new THREE.MeshToonMaterial({ color, alphaTest: 0.5, side: THREE.DoubleSide });
    mat.onBeforeCompile = (s) => applyWindAndAO(s, true);
    return mat;
  }, [color]);
  useFrame((state) => { if (leafMat.userData.shader && leafMat.userData.shader.uniforms.uTime) leafMat.userData.shader.uniforms.uTime.value = state.clock.elapsedTime; });
  return (
    <group>
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i} position={[(Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4]} rotation={[Math.random() * Math.PI, Math.random() * Math.PI, 0]} castShadow>
          <sphereGeometry args={[1.2, 8, 8]} onUpdate={(self) => self.computeBoundingSphere()} />
          <primitive object={leafMat} attach="material" />
        </mesh>
      ))}
    </group>
  );
};

const Trunk: React.FC<{ height: number; radius: number; color: string }> = ({ height, radius, color }) => {
  const barkMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    mat.onBeforeCompile = (shader) => applyWindAndAO(shader, false);
    return mat;
  }, [color]);
  useFrame((state) => { if (barkMat.userData.shader && barkMat.userData.shader.uniforms.uTime) barkMat.userData.shader.uniforms.uTime.value = state.clock.elapsedTime; });
  return (
    <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
      <cylinderGeometry args={[radius * 0.7, radius, height, 8, 4]} onUpdate={(self) => self.computeBoundingSphere()} />
      <primitive object={barkMat} attach="material" />
    </mesh>
  );
};

const Tree: React.FC<{ data: EnvironmentObjectData }> = ({ data }) => {
  const felledRbRef = useRef<RapierRigidBody>(null);
  const alignTreesToSlope = useGameStore(s => s.ambientSettings.alignTreesToSlope);
  const variant = data.variant || 0;
  const config = useMemo(() => {
    switch (variant) {
      case 1: return { trunk: "#3e2723", foliage: "#2d5a27", height: 6, radius: 0.6, branches: 4 };
      case 2: return { trunk: "#5d4037", foliage: "#7cb342", height: 9, radius: 0.3, branches: 2 };
      default: return { trunk: "#4a3728", foliage: "#1e4d2b", height: 7, radius: 0.5, branches: 3 };
    }
  }, [variant]);

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

  const treeContent = (
    <group scale={data.scale || 1}>
      <Trunk height={config.height} radius={config.radius} color={config.trunk} />
      {Array.from({ length: config.branches }).map((_, i) => (
        <group key={i} position={[0, config.height * (0.4 + i * 0.2), 0]} rotation={[0, (i * Math.PI * 2) / config.branches, 0.6]}>
           <Trunk height={config.height * 0.4} radius={config.radius * 0.5} color={config.trunk} />
           <group position={[0, config.height * 0.3, 0]}><FoliageCluster color={config.foliage} count={3} /></group>
        </group>
      ))}
      <group position={[0, config.height, 0]}><FoliageCluster color={config.foliage} count={6} /></group>
    </group>
  );

  return (
    <group position={stableTransform.pos} rotation={stableTransform.rot}>
      <RigidBody 
        ref={felledRbRef} 
        type={data.isChopped ? "dynamic" : "fixed"} 
        position={[0, 0.3, 0]} 
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

const Rock: React.FC<{ data: EnvironmentObjectData }> = ({ data }) => {
  return (
    <RigidBody type="fixed" position={data.position} colliders={false} userData={{ type: 'ENVIRONMENT', id: data.id }}>
      <CuboidCollider args={[data.scale, data.scale, data.scale]} />
      <mesh scale={data.scale || 1} castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 1]} onUpdate={(self) => self.computeBoundingSphere()} />
        <meshStandardMaterial color="#444" roughness={0.8} />
      </mesh>
    </RigidBody>
  );
};

const Grass: React.FC = () => {
  const count = 18000;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const MASK_SIZE = 80; const CANVAS_RESOLUTION = 1024;
  const maskCenter = useRef(new THREE.Vector3(0, 0, 0));
  const lastMaskCenter = useRef(new THREE.Vector3(0, 0, 0));
  const buildings = useGameStore(s => s.buildings);
  
  const { canvas, context, texture } = useMemo(() => {
    const can = document.createElement('canvas'); can.width = CANVAS_RESOLUTION; can.height = CANVAS_RESOLUTION;
    const ctx = can.getContext('2d', { alpha: false })!; ctx.fillStyle = 'black'; ctx.fillRect(0, 0, CANVAS_RESOLUTION, CANVAS_RESOLUTION);
    return { canvas: can, context: ctx, texture: new THREE.CanvasTexture(can) };
  }, []);

  const cutGrassAt = useCallback((x1: number, z1: number, radius: number, strength: number, x2?: number, z2?: number) => {
    const toCanvasSpace = (val: number, center: number) => ((val - center) / MASK_SIZE + 0.5) * CANVAS_RESOLUTION;
    const cx = maskCenter.current.x; const cz = maskCenter.current.z;
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
    const geo = new THREE.PlaneGeometry(0.2, 1.0, 1, 4); geo.translate(0, 0.5, 0); 
    const noise = new Float32Array(count); for (let i = 0; i < count; i++) noise[i] = Math.random();
    return { geometry: geo, bladeNoise: noise };
  }, []);

  useEffect(() => {
    if (!meshRef.current) return;
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 300; const z = (Math.random() - 0.5) * 300; const y = getTerrainHeight(x, z);
      dummy.position.set(x, y - 0.05, z); dummy.rotation.y = Math.random() * Math.PI; dummy.scale.setScalar(0.4 + Math.random() * 1.6); dummy.updateMatrix();
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
        varying vec3 vWorldPos; varying float vBladeNoise; varying vec2 vUv; varying float vCutValue;
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

        // Town Mowing Logic
        float distToTown = distance(vWorldPos.xz, uTownCenter);
        float townFactor = smoothstep(uTownRadius + 5.0, uTownRadius - 5.0, distToTown);
        float heightScale = mix(1.0, 0.22, townFactor); // Short lawn inside town area

        float ripple = noise(vWorldPos.xz * 0.15 + uTime * 0.8) * 0.4;
        transformed.y *= heightScale;
        transformed.y *= mix(1.0, 0.0, vCutValue);
        transformed.x += ripple * vUv.y; transformed.z += ripple * 0.5 * vUv.y;
      `);
      
      shader.fragmentShader = `varying vec2 vUv; \nvarying float vCutValue; \nvarying float vBladeNoise; \n${fs}`.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec3 deepGreen = vec3(0.08, 0.18, 0.04); vec3 lushGreen = vec3(0.2, 0.45, 0.1); vec3 straw = vec3(0.82, 0.71, 0.55); 
        diffuseColor.rgb = mix(mix(deepGreen, lushGreen, vBladeNoise), straw, vCutValue) * smoothstep(0.0, 0.6, vUv.y);
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
    if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
        const shiftX = -(dx / MASK_SIZE) * CANVAS_RESOLUTION; const shiftY = -(dz / MASK_SIZE) * CANVAS_RESOLUTION;
        const tempCanvas = document.createElement('canvas'); tempCanvas.width = CANVAS_RESOLUTION; tempCanvas.height = CANVAS_RESOLUTION;
        tempCanvas.getContext('2d')!.drawImage(canvas, 0, 0);
        context.fillStyle = 'black'; context.fillRect(0, 0, CANVAS_RESOLUTION, CANVAS_RESOLUTION); context.drawImage(tempCanvas, shiftX, shiftY);
        lastMaskCenter.current.copy(maskCenter.current); texture.needsUpdate = true;
    }
    if (state.clock.elapsedTime % 1 < 0.02) {
      context.globalAlpha = 0.005; context.fillStyle = 'black'; context.fillRect(0, 0, CANVAS_RESOLUTION, CANVAS_RESOLUTION); texture.needsUpdate = true;
    }
    if (material.userData.shader && material.userData.shader.uniforms.uTime) {
      material.userData.shader.uniforms.uTime.value = state.clock.elapsedTime; material.userData.shader.uniforms.uMaskCenter.value.copy(maskCenter.current);
    }
  });

  return <instancedMesh ref={meshRef} args={[geometry, material, count]} frustumCulled={false}><instancedBufferAttribute attach="aBladeNoise" args={[bladeNoise, 1]} /></instancedMesh>;
};

export const Environment: React.FC = () => {
  const envObjs = useGameStore(s => s.environmentObjects);
  const size = 500, segs = 150; 
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(size, size, segs, segs);
    const pos = g.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length; i += 3) { pos[i + 2] = getTerrainHeight(pos[i], -pos[i + 1]); }
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

  return (
    <group>
      <RigidBody type="fixed" friction={2} colliders={false}>
        <MeshCollider type="trimesh">
            <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={material} />
        </MeshCollider>
      </RigidBody>
      <Grass />
      <ambientLight intensity={0.4} />
      <directionalLight position={[60, 100, 60]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} />
      {envObjs.map(obj => (obj.type === 'TREE' ? <Tree key={obj.id} data={obj} /> : <Rock key={obj.id} data={obj} />))}
    </group>
  );
};
