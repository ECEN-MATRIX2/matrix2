import { createContext, useContext, useState, ReactNode } from "react";

type PauseContextType = {
  isPaused: boolean;
  setPaused: (paused: boolean) => void;
  togglePaused: () => void;
};

const PauseContext = createContext<PauseContextType | null>(null);

export function PauseProvider({ children }: { children: ReactNode }) {
  const [isPaused, setPaused] = useState(false);
  const togglePaused = () => setPaused((p) => !p);
  return (
    <PauseContext.Provider value={{ isPaused, setPaused, togglePaused }}>
      {children}
    </PauseContext.Provider>
  );
}

export function usePause() {
  const ctx = useContext(PauseContext);
  if (!ctx) throw new Error("usePause must be used within PauseProvider");
  return ctx;
}
