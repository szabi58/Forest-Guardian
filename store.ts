
import { create } from 'zustand';
import { GameState, ProjectileData, EnemyData, EnvironmentObjectData, AmbientSettings, TownNPCData, TownAnimalData, TownChildData, BuildingData } from './types';
import { Vector2 } from 'three';
import { getTerrainHeight } from './components/Environment';

const generateId = () => Math.random().toString(36).substring(2, 15);

// Reorganized buildings in a neat grid layout
const INITIAL_BUILDINGS: BuildingData[] = [
    // North Side (Facing South/Road)
    { id: 'b1', type: 'HOUSE_SMALL', position: [-5, 0, 22], rotation: Math.PI },
    { id: 'b8', type: 'CLINIC', position: [25, 0, 25], rotation: Math.PI },
    { id: 'b4', type: 'TAVERN', position: [55, 0, 25], rotation: Math.PI },
    { id: 'b2', type: 'HOUSE_SMALL', position: [85, 0, 22], rotation: Math.PI },

    // South Side (Facing North/Road)
    { id: 'b3', type: 'SHOP', position: [5, 0, -12], rotation: 0 },
    { id: 'b6', type: 'SHOP', position: [35, 0, -12], rotation: 0 },
    { id: 'b7', type: 'LIBRARY', position: [65, 0, -15], rotation: 0 },
    { id: 'b5', type: 'HOUSE_SMALL', position: [90, 0, -12], rotation: 0 },
];

const INITIAL_TOWN_NPCS: TownNPCData[] = [
    { 
        id: 'npc1', name: 'Mayor Oak', role: 'Mayor', position: [32, 1, 8], hp: 100, maxHp: 100, 
        routine: { homePos: [-5, 1, 20], workPos: [32, 1, 8] }, // Home at b1, usually found near the town square
        dialogue: ["Welcome to Greenleaf!"]
    },
    { 
        id: 'npc2', name: 'Merchant Pip', role: 'Merchant', position: [5, 1, -8], hp: 100, maxHp: 100, 
        routine: { homePos: [85, 1, 20], workPos: [5, 1, -8] }, // Home at b2, Work at Shop b3
        dialogue: ["Best acorns in the valley!"]
    },
    { 
        id: 'npc3', name: 'Blacksmith Burr', role: 'Blacksmith', position: [35, 1, -8], hp: 100, maxHp: 100, 
        routine: { homePos: [90, 1, -10], workPos: [35, 1, -8] }, // Home at b5, Work at Shop b6
        dialogue: ["Keep your blade sharp!"]
    },
    {
        id: 'npc_librarian', name: 'Elder Sage', role: 'Historian', position: [65, 1, -12], hp: 100, maxHp: 100,
        routine: { homePos: [65, 1, -15], workPos: [65, 1, -12] }, // Lives/Works at Library b7
        dialogue: ["The scrolls whisper of the First Nut."]
    },
    {
        id: 'npc_nurse', name: 'Nurse Pikachu', role: 'Nurse', position: [25, 1, 24], hp: 100, maxHp: 100,
        routine: { homePos: [25, 1, 24], workPos: [25, 1, 24] }, // Stationed inside Clinic b8
        dialogue: ["All healed up! Your health and mana are full. Come back anytime~ <3"]
    }
];

const INITIAL_TOWN_ANIMALS: TownAnimalData[] = [
    { id: 'dog1', type: 'DOG', position: [30, 0, 8] },
    { id: 'dog2', type: 'DOG', position: [50, 0, 2] },
];

const INITIAL_TOWN_CHILDREN: TownChildData[] = [
    { id: 'child1', position: [28, 0, 6] },
    { id: 'child2', position: [38, 0, 4] },
    { id: 'child3', position: [45, 0, 10] },
    { id: 'child4', position: [22, 0, -5] },
    { id: 'child5', position: [55, 0, 0] },
];

// Town fence polygon (closed): vertices [x, z] clockwise. Matches Fence controlPoints in Town.tsx.
const TOWN_FENCE_POLYGON: [number, number][] = [
    [-25, 9], [-25, 25], [20, 55], [60, 55], [90, 45], [100, 15], [100, 9], [100, 1], [100, -5],
    [90, -35], [60, -45], [20, -45], [-25, -15], [-25, 1], [-25, 9]
];

function isInsideTownFence(x: number, z: number): boolean {
    const n = TOWN_FENCE_POLYGON.length;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, zi] = TOWN_FENCE_POLYGON[i];
        const [xj, zj] = TOWN_FENCE_POLYGON[j];
        if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
    }
    return inside;
}

function nearestPointOutsideFence(x: number, z: number): [number, number] {
    let bestX = x;
    let bestZ = z;
    let bestDistSq = Infinity;
    const n = TOWN_FENCE_POLYGON.length;
    const outDist = 3;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, zi] = TOWN_FENCE_POLYGON[i];
        const [xj, zj] = TOWN_FENCE_POLYGON[j];
        const dx = xj - xi;
        const dz = zj - zi;
        const lenSq = dx * dx + dz * dz || 1e-6;
        const t = Math.max(0, Math.min(1, ((x - xi) * dx + (z - zi) * dz) / lenSq));
        const px = xi + t * dx;
        const pz = zi + t * dz;
        const toPointX = x - px;
        const toPointZ = z - pz;
        const distSq = toPointX * toPointX + toPointZ * toPointZ;
        const len = Math.sqrt(distSq) || 1;
        const nx = toPointX / len;
        const nz = toPointZ / len;
        const outX = px - nx * outDist;
        const outZ = pz - nz * outDist;
        if (!isInsideTownFence(outX, outZ) && distSq < bestDistSq) {
            bestDistSq = distSq;
            bestX = outX;
            bestZ = outZ;
        }
    }
    return [bestX, bestZ];
}

// Gate openings: west x=-25 z in [1,9], east x=100 z in [1,9]. Enemies may only be inside if in a gate.
function isInTownGateZone(x: number, z: number): boolean {
    const westGate = x >= -26 && x <= -24 && z >= 0.5 && z <= 9.5;
    const eastGate = x >= 99 && x <= 101 && z >= 0.5 && z <= 9.5;
    return westGate || eastGate;
}

/** If (x,z) is inside the town fence and not in a gate, returns nearest point outside; otherwise returns [x,z]. */
export function getEnemyPositionClampedOutsideTown(x: number, z: number): [number, number] {
    if (!isInsideTownFence(x, z)) return [x, z];
    if (isInTownGateZone(x, z)) return [x, z];
    return nearestPointOutsideFence(x, z);
}

const getRandomSpawnPosition = (radius: number): [number, number, number] => {
    let x: number, z: number;
    let attempts = 0;
    const maxAttempts = 200;
    do {
        x = (Math.random() - 0.5) * radius * 2;
        z = (Math.random() - 0.5) * radius * 2;
        attempts++;
    } while (isInsideTownFence(x, z) && attempts < maxAttempts);

    if (isInsideTownFence(x, z)) {
        [x, z] = nearestPointOutsideFence(x, z);
    }

    const y = getTerrainHeight(x, z);
    return [x, y + 1, z];
};

const generateInitialEnemies = (): EnemyData[] => {
    const enemies: EnemyData[] = [];
    for (let i = 0; i < 35; i++) {
        enemies.push({
            id: `slime-${i}`,
            type: 'SLIME',
            position: getRandomSpawnPosition(160), // Increased radius
            hp: 80,
            maxHp: 80
        });
    }
    for (let i = 0; i < 35; i++) {
        enemies.push({
            id: `rabbit-${i}`,
            type: 'RABBIT',
            position: getRandomSpawnPosition(160), // Increased radius
            hp: 60,
            maxHp: 60
        });
    }
    // Spawn T-Rexes closer (radius 90) so they are easier to find
    for (let i = 0; i < 2; i++) {
        enemies.push({
            id: `trex-${generateId()}`,
            type: 'TREX',
            position: getRandomSpawnPosition(110),
            hp: 300,
            maxHp: 300
        });
    }
    return enemies;
};

const INITIAL_ENEMIES = generateInitialEnemies();

const createForest = (): EnvironmentObjectData[] => {
    const objects: EnvironmentObjectData[] = [];
    for(let i=0; i<150; i++) { // Increased count for bigger map
        const variant = Math.floor(Math.random() * 3);
        const scale = 0.8 + Math.random() * 1.5;
        const x = (Math.random() - 0.5) * 240; // Increased spawn area
        const z = (Math.random() - 0.5) * 240;
        if (x > -30 && x < 105 && z > -50 && z < 65) continue; // Updated Exclusion Zone
        const y = getTerrainHeight(x, z);
        objects.push({ id: `tree-${i}`, type: 'TREE', variant, position: [x, y, z], scale, hp: 50 * scale, maxHp: 50 * scale, rootDepth: 0.4 });
    }
    return objects;
};

const PERSISTENT_ENVIRONMENT = createForest();

interface GameStore extends GameState {
    enemyPushImpulses: Record<string, { vx: number; vz: number }>;
    currentSpeed: number;
    setCurrentSpeed: (speed: number) => void;
    cutGrassAt: ((x1: number, z1: number, radius: number, strength: number, x2?: number, z2?: number) => void) | null;
    registerCutGrass: (fn: (x1: number, z1: number, radius: number, strength: number, x2?: number, z2?: number) => void) => void;
    updateEnemyPosition: (id: string, pos: [number, number, number]) => void;
    setEnemyPushImpulse: (id: string, vx: number, vz: number) => void;
    consumeEnemyPushImpulse: (id: string) => { vx: number; vz: number } | null;
    updateTownNPCPosition: (id: string, pos: [number, number, number]) => void;
    updateTownChildPosition: (id: string, pos: [number, number, number]) => void;
    setTownNPCDialogue: (id: string, text: string) => void;
    damageTownNPC: (id: string, amount: number) => void;
    clearCameraDelta: () => void;
    spawnTrex: () => void;
    setCameraJoystickVector: (vec: Vector2) => void;
    setCameraJoystickActive: (active: boolean) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  score: 0,
  isGameOver: false,
  isPaused: false,
  gameTime: 0.2,
  projectiles: [],
  enemies: [...INITIAL_ENEMIES],
  townNPCs: [...INITIAL_TOWN_NPCS],
  townAnimals: [...INITIAL_TOWN_ANIMALS],
  townChildren: [...INITIAL_TOWN_CHILDREN],
  buildings: [...INITIAL_BUILDINGS],
  environmentObjects: [...PERSISTENT_ENVIRONMENT],
  joystickVector: new Vector2(0, 0),
  isJoystickActive: false,
  cameraJoystickVector: new Vector2(0, 0),
  isCameraJoystickActive: false,
  cameraDelta: new Vector2(0, 0),
  isInsideBuildingId: null,
  setIsInsideBuilding: (id) => set({ isInsideBuildingId: id }),
  activeDialoguePartner: null,
  setActiveDialoguePartner: (id) => set({ activeDialoguePartner: id }),
  interactionRequestTick: 0,
  requestInteraction: () => set((state) => ({ interactionRequestTick: state.interactionRequestTick + 1 })),
  
  // Kamehameha State
  isKamehamehaCharging: false,
  isKamehamehaFiring: false,
  kamehamehaCharge: 0,

  meleeRequestTick: 0,
  meleeSpinRequestTick: 0,
  isMeleeCharging: false,
  meleeCharge: 0,
  comboStep: 0,
  isAttacking: false,
  isSpinning: false,
  lastAttackTime: 0,
  jumpRequestTick: 0,
  isDodging: false,
  isStanceActive: false,
  isGrounded: true,
  shakeIntensity: 0,
  isHitStopping: false,
  currentSpeed: 0,
  playerSpawnPos: [32, 2, 5],
  ambientSettings: { godRays: true, forestDust: true, fallingLeaves: true, alignTreesToSlope: false },

  cutGrassAt: null,
  registerCutGrass: (fn) => set({ cutGrassAt: fn }),
  setCurrentSpeed: (currentSpeed) => set({ currentSpeed }),

  updateEnemyPosition: (id, pos) => set((state) => ({
      enemies: state.enemies.map(e => e.id === id ? { ...e, position: pos } : e)
  })),
  enemyPushImpulses: {} as Record<string, { vx: number; vz: number }>,
  setEnemyPushImpulse: (id, vx, vz) => set((state) => ({
      enemyPushImpulses: { ...state.enemyPushImpulses, [id]: { vx, vz } }
  })),
  consumeEnemyPushImpulse: (id) => {
      const state = get();
      const imp = state.enemyPushImpulses[id];
      if (!imp) return null;
      set((s) => {
          const next = { ...s.enemyPushImpulses };
          delete next[id];
          return { enemyPushImpulses: next };
      });
      return imp;
  },

  updateTownNPCPosition: (id, pos) => set((state) => ({
      townNPCs: state.townNPCs.map(n => n.id === id ? { ...n, position: pos } : n)
  })),

  updateTownChildPosition: (id, pos) => set((state) => ({
      townChildren: state.townChildren.map(c => c.id === id ? { ...c, position: pos } : c)
  })),

  setTownNPCDialogue: (id, text) => set((state) => ({
      townNPCs: state.townNPCs.map(n => n.id === id ? { ...n, aiResponse: text } : n)
  })),

  spawnTrex: () => set((state) => ({
    enemies: [...state.enemies, {
        id: `trex-${generateId()}`,
        type: 'TREX',
        position: getRandomSpawnPosition(90), // Spawn closer
        hp: 300,
        maxHp: 300
    }]
  })),

  damagePlayer: (amount) => set((state) => {
    if (state.isDodging) return {};
    let finalAmount = state.isStanceActive ? amount * 0.4 : amount;
    const newHealth = Math.max(0, state.health - finalAmount);
    return { health: newHealth, isGameOver: newHealth <= 0 };
  }),

  healPlayer: (amount) => set((state) => ({ health: Math.min(state.maxHealth, state.health + amount) })),

  useMana: (amount) => {
    const state = get();
    if (state.mana >= amount) {
      set({ mana: state.mana - amount });
      return true;
    }
    return false;
  },

  rechargeMana: (amount) => set((state) => ({ mana: Math.min(state.maxMana, state.mana + amount) })),

  addProjectile: (proj) => set((state) => ({ projectiles: [...state.projectiles, proj] })),
  removeProjectile: (id) => set((state) => ({ projectiles: state.projectiles.filter(p => p.id !== id) })),

  damageEnemy: (id, amount, damageSource = 'GENERIC') => {
    const state = get();
    let scoreGain = 0;
    const updatedEnemies = state.enemies.map(e => {
      if (e.id === id && !e.isDead) {
        const newHp = Math.max(0, e.hp - amount);
        if (newHp <= 0) {
            scoreGain = e.type === 'TREX' ? 500 : 100;
            return { 
                ...e, 
                hp: 0, 
                isDead: true, 
                killedBySword: damageSource === 'SWORD',
                killedByKamehameha: damageSource === 'KAMEHAMEHA' 
            };
        }
        return { ...e, hp: newHp };
      }
      return e;
    });
    set({ enemies: updatedEnemies, score: state.score + scoreGain });
  },

  damageTownNPC: (id, amount) => set((state) => ({
    townNPCs: state.townNPCs.map(n => {
        if (n.id === id) {
            const newHp = Math.max(0, n.hp - amount);
            return { ...n, hp: newHp };
        }
        return n;
    })
  })),

  damageEnvironment: (id, amount) => set((state) => ({
    environmentObjects: state.environmentObjects.map(obj => {
        if (obj.id === id && !obj.isChopped) {
            const newHp = Math.max(0, obj.hp - amount);
            if (newHp <= 0) return { ...obj, hp: 0, isChopped: true };
            return { ...obj, hp: newHp };
        }
        return obj;
    })
  })),

  resetGame: () => set({
    health: 100, score: 0, isGameOver: false, isPaused: false, mana: 100,
    enemies: [...generateInitialEnemies()],
    environmentObjects: [...createForest()],
    projectiles: [],
    isInsideBuildingId: null,
    enemyPushImpulses: {}
  }),

  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

  setJoystickVector: (vec) => set({ joystickVector: vec }),
  setJoystickActive: (active) => set({ isJoystickActive: active }),
  
  setCameraDelta: (vec) => set((state) => {
    if (!vec || !Number.isFinite(vec.x) || !Number.isFinite(vec.y)) return state;
    return { cameraDelta: state.cameraDelta.clone().add(vec) };
  }),

  clearCameraDelta: () => set({ cameraDelta: new Vector2(0, 0) }),
  
  setKamehamehaCharging: (charging) => set({ 
      isKamehamehaCharging: charging, 
      kamehamehaCharge: charging ? 0 : 0 
  }),
  fireKamehameha: () => set({ isKamehamehaFiring: true }),
  setKamehamehaFiring: (firing) => set({ isKamehamehaFiring: firing }),

  setMeleeCharging: (charging) => set({ isMeleeCharging: charging, meleeCharge: charging ? 0 : 0 }),
  requestMelee: () => set((state) => ({ meleeRequestTick: state.meleeRequestTick + 1, lastAttackTime: Date.now() })),
  requestMeleeSpin: () => set((state) => ({ meleeSpinRequestTick: state.meleeSpinRequestTick + 1, lastAttackTime: Date.now() })),
  setAttacking: (attacking) => set({ isAttacking: attacking }),
  setSpinning: (spinning) => set({ isSpinning: spinning }),
  setComboStep: (step) => set({ comboStep: step }),

  requestJump: () => set((state) => ({ jumpRequestTick: state.jumpRequestTick + 1 })),
  toggleStance: () => set((state) => ({ isStanceActive: !state.isStanceActive })),
  
  triggerDodge: () => {
    const state = get();
    if (state.isDodging) return;
    set({ isDodging: true });
    setTimeout(() => {
        set({ isDodging: false });
    }, 450);
  },

  triggerHitImpact: (shake = 0.5, stopDuration = 100) => {
    set({ shakeIntensity: shake, isHitStopping: true });
    setTimeout(() => set({ isHitStopping: false, shakeIntensity: 0 }), stopDuration);
  },
  setShakeIntensity: (val) => set({ shakeIntensity: val }),
  toggleAmbientSetting: (key) => set((state) => ({
    ambientSettings: { ...state.ambientSettings, [key]: !state.ambientSettings[key] }
  })),
  snapAllTrees: () => set((state) => ({ environmentObjects: [...state.environmentObjects] })),

  setCameraJoystickVector: (vec) => set({ cameraJoystickVector: vec }),
  setCameraJoystickActive: (active) => set({ isCameraJoystickActive: active }),
}));
