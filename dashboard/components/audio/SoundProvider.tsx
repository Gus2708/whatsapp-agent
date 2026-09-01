'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { audioSynth } from '@/lib/audio-synth';

interface SoundContextType {
  soundEnabled: boolean;
  toggleSound: () => void;
  playClick: () => void;
  playPacket: () => void;
  playSuccess: () => void;
  playAlert: () => void;
}

const SoundContext = createContext<SoundContextType>({
  soundEnabled: true,
  toggleSound: () => {},
  playClick: () => {},
  playPacket: () => {},
  playSuccess: () => {},
  playAlert: () => {},
});

export const SoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    audioSynth.enabled = soundEnabled;
  }, [soundEnabled]);

  const toggleSound = () => {
    const nextState = !soundEnabled;
    setSoundEnabled(nextState);
    audioSynth.enabled = nextState;
    if (nextState) {
      audioSynth.triggerClick();
    }
  };

  const playClick = () => audioSynth.triggerClick();
  const playPacket = () => audioSynth.triggerPacket();
  const playSuccess = () => audioSynth.triggerSuccess();
  const playAlert = () => audioSynth.triggerAlert();

  return (
    <SoundContext.Provider
      value={{
        soundEnabled,
        toggleSound,
        playClick,
        playPacket,
        playSuccess,
        playAlert,
      }}
    >
      {children}
    </SoundContext.Provider>
  );
};

export const useSound = () => useContext(SoundContext);
