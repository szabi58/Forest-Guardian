
import { create } from 'zustand';
import { GameState, ProjectileData, EnemyData, EnvironmentObjectData, AmbientSettings, TownNPCData, TownAnimalData, BuildingData } from './types';
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
        id: 'npc1', name: 'Mayor Oak', role: 'Mayor', position: [35, 1, 5], hp: 100, maxHp: 100, 
        routine: { homePos: [-5, 1, 20], workPos: [35, 1, 5] }, // Home at b1, Work at Fountain (35, 5)
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
        id: 'npc_nurse', name: 'Nurse Joya', role: 'Nurse', position: [25, 1, 22], hp: 100, maxHp: 100,
        routine: { homePos: [25, 1, 25], workPos: [25, 1, 22] }, // Always at Clinic b8
        dialogue: ["You look hurt! Let me heal you with love <3"]
    }
];

const INITIAL_TOWN_ANIMALS: TownAnimalData[] = [
    { id: 'dog1', type: 'DOG', position: [30, 0, 8] },
    { id: 'dog2', type: 'DOG', position: [50, 0, 2] },
];

const getRandomSpawnPosition = (radius: number): [number, number, number] => {
    let x, z;
    let attempts = 0;
    do {
        x = (Math.random() - 0.5) * radius * 2;
        z = (Math.random() - 0.5) * radius * 2;
        attempts++;
    } while ((x > -30 && x < 105 && z > -50 && z < 65) && attempts < 100);
    
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

const GAME_SAVE_KEY = 'forest-guardian-save-v1';
const DEFAULT_PLAYER_SPAWN_POS: [number, number, number] = [32, 2, 5];

interface SavedGameData {
  version: 1;
  timestamp: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  score: number;
  isGameOver: boolean;
  gameTime: number;
  playerSpawnPos: [number, number, number];
  enemies: EnemyData[];
  townNPCs: TownNPCData[];
  townAnimals: TownAnimalData[];
  buildings: BuildingData[];
  environmentObjects: EnvironmentObjectData[];
  ambientSettings: AmbientSettings;
}

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isVec3 = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) &&
  value.length === 3 &&
  isFiniteNumber(value[0]) &&
  isFiniteNumber(value[1]) &&
  isFiniteNumber(value[2]);

const hasStoredSave = () => {
  if (!canUseStorage()) return false;
  return parseSavedGame(window.localStorage.getItem(GAME_SAVE_KEY)) !== null;
};

const parseSavedGame = (raw: string | null): SavedGameData | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedGameData> | null;
    if (!parsed || parsed.version !== 1) return null;
    if (
      !isFiniteNumber(parsed.health) ||
      !isFiniteNumber(parsed.maxHealth) ||
      !isFiniteNumber(parsed.mana) ||
      !isFiniteNumber(parsed.maxMana) ||
      !isFiniteNumber(parsed.score) ||
      typeof parsed.isGameOver !== 'boolean' ||
      !isFiniteNumber(parsed.gameTime) ||
      !isVec3(parsed.playerSpawnPos)
    ) {
      return null;
    }
    if (
      !Array.isArray(parsed.enemies) ||
      !Array.isArray(parsed.townNPCs) ||
      !Array.isArray(parsed.townAnimals) ||
      !Array.isArray(parsed.buildings) ||
      !Array.isArray(parsed.environmentObjects) ||
      !parsed.ambientSettings
    ) {
      return null;
    }
    return parsed as SavedGameData;
  } catch {
    return null;
  }
};

const cloneVec3 = (position: [number, number, number]): [number, number, number] =>
  [position[0], position[1], position[2]];

interface GameStore extends GameState {
    currentSpeed: number;
    hasSavedGame: boolean;
    playerSpawnRevision: number;
    playerPositionGetter: (() => [number, number, number]) | null;
    setCurrentSpeed: (speed: number) => void;
    registerPlayerPositionGetter: (fn: (() => [number, number, number]) | null) => void;
    saveGame: () => boolean;
    loadGame: () => boolean;
    refreshSavePresence: () => void;
    cutGrassAt: ((x1: number, z1: number, radius: number, strength: number, x2?: number, z2?: number) => void) | null;
    registerCutGrass: (fn: (x1: number, z1: number, radius: number, strength: number, x2?: number, z2?: number) => void) => void;
    updateEnemyPosition: (id: string, pos: [number, number, number]) => void;
    updateTownNPCPosition: (id: string, pos: [number, number, number]) => void;
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
  hasSavedGame: hasStoredSave(),
  playerSpawnRevision: 0,
  playerPositionGetter: null,
  playerSpawnPos: [...DEFAULT_PLAYER_SPAWN_POS],
  ambientSettings: { godRays: true, forestDust: true, fallingLeaves: true, alignTreesToSlope: false },

  cutGrassAt: null,
  registerCutGrass: (fn) => set({ cutGrassAt: fn }),
  setCurrentSpeed: (currentSpeed) => set({ currentSpeed }),
  registerPlayerPositionGetter: (fn) => set({ playerPositionGetter: fn }),
  refreshSavePresence: () => set({ hasSavedGame: hasStoredSave() }),

  saveGame: () => {
    if (!canUseStorage()) return false;
    const state = get();
    const currentPlayerPos = state.playerPositionGetter?.() || state.playerSpawnPos;
    const payload: SavedGameData = {
      version: 1,
      timestamp: Date.now(),
      health: state.health,
      maxHealth: state.maxHealth,
      mana: state.mana,
      maxMana: state.maxMana,
      score: state.score,
      isGameOver: state.isGameOver,
      gameTime: state.gameTime,
      playerSpawnPos: cloneVec3(currentPlayerPos),
      enemies: state.enemies.map((enemy) => ({ ...enemy, position: cloneVec3(enemy.position) })),
      townNPCs: state.townNPCs.map((npc) => ({ ...npc, position: cloneVec3(npc.position) })),
      townAnimals: state.townAnimals.map((animal) => ({ ...animal, position: cloneVec3(animal.position) })),
      buildings: state.buildings.map((building) => ({ ...building, position: cloneVec3(building.position) })),
      environmentObjects: state.environmentObjects.map((obj) => ({ ...obj, position: cloneVec3(obj.position) })),
      ambientSettings: { ...state.ambientSettings },
    };

    try {
      window.localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(payload));
      set({ hasSavedGame: true, playerSpawnPos: cloneVec3(currentPlayerPos) });
      return true;
    } catch {
      return false;
    }
  },

  loadGame: () => {
    if (!canUseStorage()) return false;
    const saved = parseSavedGame(window.localStorage.getItem(GAME_SAVE_KEY));
    if (!saved) {
      set({ hasSavedGame: false });
      return false;
    }

    set((state) => ({
      health: saved.health,
      maxHealth: saved.maxHealth,
      mana: saved.mana,
      maxMana: saved.maxMana,
      score: saved.score,
      isGameOver: saved.isGameOver,
      isPaused: false,
      gameTime: saved.gameTime,
      projectiles: [],
      enemies: saved.enemies.map((enemy) => ({ ...enemy, position: cloneVec3(enemy.position) })),
      townNPCs: saved.townNPCs.map((npc) => ({ ...npc, position: cloneVec3(npc.position) })),
      townAnimals: saved.townAnimals.map((animal) => ({ ...animal, position: cloneVec3(animal.position) })),
      buildings: saved.buildings.map((building) => ({ ...building, position: cloneVec3(building.position) })),
      environmentObjects: saved.environmentObjects.map((obj) => ({ ...obj, position: cloneVec3(obj.position) })),
      playerSpawnPos: cloneVec3(saved.playerSpawnPos),
      playerSpawnRevision: state.playerSpawnRevision + 1,
      ambientSettings: { ...saved.ambientSettings },
      joystickVector: new Vector2(0, 0),
      isJoystickActive: false,
      cameraJoystickVector: new Vector2(0, 0),
      isCameraJoystickActive: false,
      cameraDelta: new Vector2(0, 0),
      isInsideBuildingId: null,
      activeDialoguePartner: null,
      interactionRequestTick: 0,
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
      currentSpeed: 0,
      hasSavedGame: true,
    }));

    return true;
  },

  updateEnemyPosition: (id, pos) => set((state) => ({
      enemies: state.enemies.map(e => e.id === id ? { ...e, position: pos } : e)
  })),

  updateTownNPCPosition: (id, pos) => set((state) => ({
      townNPCs: state.townNPCs.map(n => n.id === id ? { ...n, position: pos } : n)
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

  resetGame: () => set((state) => ({
    health: 100,
    score: 0,
    isGameOver: false,
    isPaused: false,
    mana: 100,
    maxHealth: 100,
    maxMana: 100,
    enemies: [...generateInitialEnemies()],
    environmentObjects: [...createForest()],
    projectiles: [],
    playerSpawnPos: [...DEFAULT_PLAYER_SPAWN_POS],
    playerSpawnRevision: state.playerSpawnRevision + 1,
    isInsideBuildingId: null,
    activeDialoguePartner: null,
    interactionRequestTick: 0,
    currentSpeed: 0,
  })),

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
