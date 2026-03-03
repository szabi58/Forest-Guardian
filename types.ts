
import { Vector3, Vector2 } from 'three';

// Augment the global JSX namespace (Legacy/Global)
declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      sphereGeometry: any;
      primitive: any;
      cylinderGeometry: any;
      ambientLight: any;
      directionalLight: any;
      instancedMesh: any;
      meshStandardMaterial: any;
      meshBasicMaterial: any;
      pointLight: any;
      dodecahedronGeometry: any;
      instancedBufferAttribute: any;
      planeGeometry: any;
      boxGeometry: any;
      coneGeometry: any;
      bufferGeometry: any;
      bufferAttribute: any;
      points: any;
      pointsMaterial: any;
      fogExp2: any;
      color: any;
      capsuleGeometry: any;
      circleGeometry: any;
      meshToonMaterial: any;
      torusGeometry: any;
      [elemName: string]: any;
    }
  }
}

export enum EntityType {
  PLAYER = 'PLAYER',
  ENEMY = 'ENEMY',
  WILDLIFE = 'WILDLIFE',
  PROJECTILE = 'PROJECTILE',
  ENVIRONMENT = 'ENVIRONMENT',
  TOWN_NPC = 'TOWN_NPC'
}

export interface AmbientSettings {
  godRays: boolean;
  forestDust: boolean;
  fallingLeaves: boolean;
  alignTreesToSlope: boolean;
}

export interface BuildingData {
  id: string;
  position: [number, number, number];
  rotation: number;
  type: 'HOUSE_SMALL' | 'SHOP' | 'TAVERN' | 'LIBRARY' | 'CLINIC';
}

export interface TownNPCData {
  id: string;
  name: string;
  role: string;
  position: [number, number, number];
  hp: number;
  maxHp: number;
  routine: {
    homePos: [number, number, number];
    workPos: [number, number, number];
  };
  dialogue: string[];
  aiResponse?: string;
}

export interface TownAnimalData {
  id: string;
  type: 'DOG' | 'CAT';
  position: [number, number, number];
}

export interface EnvironmentObjectData {
  id: string;
  type: 'TREE' | 'ROCK' | 'LOG';
  variant?: number;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale: number;
  hp: number;
  maxHp: number;
  isPushable?: boolean;
  isChopped?: boolean;
  rootDepth?: number;
}

export interface GameState {
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  score: number;
  isGameOver: boolean;
  isPaused: boolean;
  gameTime: number; // 0 to 1 (Noon to Midnight cycle)
  projectiles: ProjectileData[];
  enemies: EnemyData[];
  townNPCs: TownNPCData[];
  townAnimals: TownAnimalData[];
  buildings: BuildingData[];
  environmentObjects: EnvironmentObjectData[];
  joystickVector: Vector2;
  isJoystickActive: boolean;
  cameraDelta: Vector2;
  cameraJoystickVector: Vector2;
  isCameraJoystickActive: boolean;
  
  // Interior Logic
  isInsideBuildingId: string | null;
  setIsInsideBuilding: (id: string | null) => void;
  
  // Interaction
  activeDialoguePartner: string | null;
  setActiveDialoguePartner: (id: string | null) => void;
  interactionRequestTick: number;
  requestInteraction: () => void;
  
  // Combat State
  isKamehamehaCharging: boolean;
  isKamehamehaFiring: boolean;
  kamehamehaCharge: number; // 0 to 1
  
  meleeRequestTick: number;
  meleeSpinRequestTick: number;
  isMeleeCharging: boolean;
  meleeCharge: number;
  comboStep: number;
  isAttacking: boolean;
  isSpinning: boolean;
  lastAttackTime: number;
  
  jumpRequestTick: number;
  isDodging: boolean;
  isStanceActive: boolean;
  isGrounded: boolean;
  playerSpawnPos: [number, number, number];
  
  ambientSettings: AmbientSettings;
  shakeIntensity: number;
  isHitStopping: boolean;
  
  damagePlayer: (amount: number) => void;
  healPlayer: (amount: number) => void;
  useMana: (amount: number) => boolean;
  rechargeMana: (amount: number) => void;
  addProjectile: (proj: ProjectileData) => void;
  removeProjectile: (id: string) => void;
  damageEnemy: (id: string, amount: number, damageSource?: 'SWORD' | 'KAMEHAMEHA' | 'GENERIC') => void;
  damageEnvironment: (id: string, amount: number) => void;
  resetGame: () => void;
  togglePause: () => void;
  setJoystickVector: (vec: Vector2) => void;
  setJoystickActive: (active: boolean) => void;
  setCameraDelta: (vec: Vector2) => void;
  
  setKamehamehaCharging: (charging: boolean) => void;
  fireKamehameha: () => void;
  setKamehamehaFiring: (firing: boolean) => void;

  setMeleeCharging: (charging: boolean) => void;
  requestMelee: () => void;
  requestMeleeSpin: () => void;
  setAttacking: (attacking: boolean) => void;
  setSpinning: (spinning: boolean) => void;
  setComboStep: (step: number) => void;
  
  requestJump: () => void;
  toggleStance: () => void;
  triggerDodge: () => void;
  triggerHitImpact: (shake?: number, stopDuration?: number) => void;
  setShakeIntensity: (val: number) => void;
  toggleAmbientSetting: (key: keyof AmbientSettings) => void;
  snapAllTrees: () => void;
}

export interface ProjectileData {
  id: string;
  position: Vector3;
  direction: Vector3;
  timestamp: number;
  charge: number;
}

export interface EnemyData {
  id: string;
  type: 'RABBIT' | 'DEER' | 'SLIME' | 'TREX';
  position: [number, number, number];
  hp: number;
  maxHp: number;
  isDead?: boolean;
  killedBySword?: boolean;
  killedByKamehameha?: boolean;
}