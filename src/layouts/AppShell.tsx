import type { ReactNode } from "react";
import { MapProvider } from "@/contexts/MapContext";
import { RightPanelProvider } from "@/contexts/RightPanelContext";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { RightPanel } from "./RightPanel";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <MapProvider>
      <RightPanelProvider>
        <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-surface-base">
          <Sidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <TopBar />
            <div className="flex flex-1 overflow-hidden">
              <main className="relative flex-1 overflow-hidden">
                {children}
              </main>
              <RightPanel />
            </div>
          </div>
        </div>
      </RightPanelProvider>
    </MapProvider>
  );
}
