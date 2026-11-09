import { createContext, useContext } from 'react';

export type WorkspaceLayout = 'auto' | 'stack' | 'side';
export const WorkspaceContext = createContext<{layout:WorkspaceLayout;selected:boolean;controlsTarget:HTMLElement|null;settingsTarget?:HTMLElement|null;closeSettings?:()=>void} | null>(null);
export const useWorkspace = () => useContext(WorkspaceContext);
export function loadWorkspaceLayout():WorkspaceLayout {
  try { const value=localStorage.getItem('fgmv:layout:v1'); if(value==='side'||value==='stack')return value; } catch { /* Storage is optional. */ }
  return 'auto';
}
