"use client";

import { createContext, useContext } from "react";

const MainOverlayHostContext = createContext<HTMLElement | null>(null);

export function MainOverlayHostProvider({
  host,
  children
}: {
  host: HTMLElement | null;
  children: React.ReactNode;
}) {
  return <MainOverlayHostContext.Provider value={host}>{children}</MainOverlayHostContext.Provider>;
}

export function useMainOverlayHost() {
  return useContext(MainOverlayHostContext);
}
