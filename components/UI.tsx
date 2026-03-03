
import React, { useRef, useState, useEffect } from 'react';
import { useGameStore } from '../store';
import { Joystick } from './Joystick';
import { Vector2 } from 'three';

export const UI: React.FC = () => {
  const { 
    health, maxHealth, mana, maxMana, score, isGameOver, resetGame, isPaused, togglePause,
    requestMelee, requestMeleeSpin, setMeleeCharging, meleeCharge, isMeleeCharging,
    requestJump, isStanceActive, toggleStance, ambientSettings, toggleAmbientSetting, snapAllTrees,
    saveGame, loadGame, hasSavedGame, refreshSavePresence,
    
    // Kamehameha Actions
    setKamehamehaCharging, fireKamehameha, kamehamehaCharge, isKamehamehaCharging
  } = useGameStore();

  const [showSettings, setShowSettings] = useState(false);
  const meleePointerStart = useRef(0);

  useEffect(() => {
    refreshSavePresence();
  }, [refreshSavePresence]);

  if (isGameOver) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 text-white">
        <h1 className="text-6xl font-bold mb-4 text-red-500 italic uppercase">Spirit Broken</h1>
        <p className="text-2xl mb-8 font-light tracking-widest">Final Score: {score}</p>
        <button onClick={resetGame} className="px-10 py-4 bg-white text-black hover:bg-red-500 hover:text-white rounded-none text-xl font-black transition-all transform hover:scale-110 pointer-events-auto">RESTORE SOUL</button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-6 overflow-hidden font-sans">
      {/* Pause Menu */}
      {isPaused && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md text-white pointer-events-auto">
          <h2 className="text-5xl font-black italic uppercase tracking-widest mb-12 animate-pulse">Game Paused</h2>
          <div className="flex flex-col gap-4 w-64">
            <button onClick={togglePause} className="px-6 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest transition-all">Resume</button>
            <button
              onClick={() => saveGame()}
              className="px-6 py-4 bg-emerald-700/50 hover:bg-emerald-600 text-white font-black uppercase tracking-widest transition-all"
            >
              Save Game
            </button>
            <button
              onClick={() => loadGame()}
              disabled={!hasSavedGame}
              className={`px-6 py-4 text-white font-black uppercase tracking-widest transition-all ${hasSavedGame ? 'bg-sky-700/50 hover:bg-sky-600' : 'bg-white/10 text-white/40 cursor-not-allowed'}`}
            >
              {hasSavedGame ? 'Load Game' : 'No Save Found'}
            </button>
            <button onClick={() => setShowSettings(!showSettings)} className="px-6 py-4 bg-white/10 hover:bg-white/20 text-white font-black uppercase tracking-widest transition-all">Settings</button>
            <button onClick={resetGame} className="px-6 py-4 bg-red-900/40 hover:bg-red-600 text-white font-black uppercase tracking-widest transition-all">Reset Prototype</button>
          </div>
          <p className="mt-12 text-white/40 text-[10px] uppercase font-bold tracking-[0.4em]">Press Options or Start to Resume</p>
        </div>
      )}

      <div className="flex justify-between items-start relative z-20">
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 w-72">
                {/* Health Bar */}
                <div className="group w-full bg-black/40 h-8 rounded-sm border border-white/10 relative overflow-hidden backdrop-blur-md">
                    <div className="h-full bg-gradient-to-r from-red-900 via-red-600 to-red-400 transition-all duration-500 ease-out" style={{ width: `${(health / maxHealth) * 100}%` }} />
                    <div className="absolute inset-0 flex items-center justify-between px-3">
                        <span className="text-[10px] font-black text-white/90 uppercase tracking-tighter">Vitality</span>
                        <span className="text-[10px] font-mono text-white/70">{Math.ceil(health)} / {maxHealth}</span>
                    </div>
                </div>
                {/* Mana Bar */}
                <div className="w-full bg-black/40 h-3 rounded-sm border border-white/10 relative overflow-hidden backdrop-blur-md">
                    <div className="h-full bg-gradient-to-r from-blue-900 via-cyan-600 to-cyan-300 transition-all duration-700 ease-out" style={{ width: `${(mana / maxMana) * 100}%` }} />
                    <div className="absolute inset-0 flex items-center px-3">
                         <span className="text-[7px] font-black text-white/50 uppercase tracking-widest">Essence</span>
                    </div>
                </div>
            </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="flex flex-col items-end">
              <span className="text-white/40 text-[10px] font-bold uppercase tracking-[0.3em]">Guardian Score</span>
              <span className="text-white font-black text-5xl italic drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">{score}</span>
          </div>
          
          <button onPointerDown={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }} className="w-12 h-12 bg-white/5 hover:bg-white/20 border border-white/10 rounded-none flex items-center justify-center text-white text-xl pointer-events-auto backdrop-blur-md transition-all active:scale-95">
            <span className="transform group-hover:rotate-90 transition-transform">⚙️</span>
          </button>
          
          {showSettings && (
            <div className="bg-black/90 backdrop-blur-2xl border border-white/10 p-6 rounded-none w-72 flex flex-col gap-4 pointer-events-auto shadow-[0_0_50px_rgba(0,0,0,0.8)] border-r-4 border-r-indigo-500 animate-in fade-in slide-in-from-right-4 duration-300">
              <h4 className="text-white text-[10px] font-black uppercase tracking-[0.5em] border-b border-white/10 pb-3 mb-2">Sanctuary Settings</h4>
              <button onClick={() => snapAllTrees()} className="py-3 bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/50 text-white text-[9px] font-black uppercase tracking-widest rounded-sm transition-all">Synchronize Forest</button>
              <div className="flex flex-col gap-2">
                 {Object.keys(ambientSettings).map((key) => (
                    <button key={key} onClick={() => toggleAmbientSetting(key as any)} className={`py-2 px-3 text-[8px] font-bold uppercase tracking-wider text-left transition-colors border ${ambientSettings[key as keyof typeof ambientSettings] ? 'bg-white/10 border-white/30 text-white' : 'bg-transparent border-white/5 text-white/30'}`}>
                        {String(key).replace(/([A-Z])/g, ' $1')}: {ambientSettings[key as keyof typeof ambientSettings] ? 'Active' : 'Dormant'}
                    </button>
                 ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between items-end pb-8 relative z-20">
        <div className="mb-4 ml-4"><Joystick /></div>
        
        <div className="mr-8 mb-4 flex gap-6 items-end">
            <div className="flex flex-col gap-4">
                <button onPointerDown={(e) => { e.stopPropagation(); toggleStance(); }} className={`w-16 h-16 ${isStanceActive ? 'bg-indigo-600 shadow-[0_0_20px_rgba(79,70,229,0.5)]' : 'bg-white/5'} border border-white/20 rounded-none flex items-center justify-center text-white text-2xl active:scale-90 transition-all pointer-events-auto backdrop-blur-md`}>
                   {isStanceActive ? '🛡️' : '🔘'}
                </button>
                <button onPointerDown={(e) => { e.stopPropagation(); requestJump(); }} className="w-16 h-16 bg-white/5 border border-white/20 rounded-none flex items-center justify-center text-white text-2xl active:scale-90 transition-all pointer-events-auto backdrop-blur-md">
                   ☁️
                </button>
            </div>

            <div className="flex flex-col gap-4">
                <div className="relative group pointer-events-auto">
                    {isMeleeCharging && (
                        <div className="absolute inset-0 -m-1 border-2 border-red-500 animate-ping rounded-none opacity-50" />
                    )}
                    <button
                        onPointerDown={(e) => { e.stopPropagation(); meleePointerStart.current = Date.now(); setMeleeCharging(true); }}
                        onPointerUp={(e) => { 
                            e.stopPropagation(); 
                            if (isMeleeCharging) { 
                                const heldDuration = Date.now() - meleePointerStart.current;
                                if (heldDuration < 400) { requestMelee(); }
                                else if (meleeCharge >= 0.95) { requestMeleeSpin(); }
                                setMeleeCharging(false); 
                            } 
                        }}
                        className={`w-24 h-24 relative overflow-hidden bg-white hover:bg-red-500 border-2 border-white/20 rounded-none flex items-center justify-center text-black hover:text-white transition-all active:scale-90`}
                    >
                        <span className="text-3xl z-10 font-black italic">SLAY</span>
                        {isMeleeCharging && (
                            <div className="absolute bottom-0 left-0 w-full bg-red-600 transition-all duration-75" style={{ height: `${meleeCharge * 100}%`, opacity: 0.3 }} />
                        )}
                    </button>
                </div>

                <button 
                  onPointerDown={(e) => { e.stopPropagation(); setKamehamehaCharging(true); }} 
                  onPointerUp={(e) => { e.stopPropagation(); if (isKamehamehaCharging) { fireKamehameha(); setKamehamehaCharging(false); } }} 
                  className={`w-20 h-20 bg-black/40 hover:bg-cyan-600/40 border border-white/20 rounded-none flex flex-col items-center justify-center text-white transition-all active:scale-90 pointer-events-auto backdrop-blur-md overflow-hidden relative`}
                >
                    <span className="text-xs font-black tracking-widest uppercase mb-1 z-10">KAME</span>
                    <span className="text-xl z-10">☄️</span>
                    {isKamehamehaCharging && (
                        <>
                            <div className="absolute inset-0 bg-cyan-500/30 animate-pulse" />
                            <div className="absolute bottom-0 left-0 w-full bg-cyan-400" style={{ height: `${kamehamehaCharge * 100}%`, opacity: 0.6 }} />
                        </>
                    )}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
