import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { RightPanel } from "./RightPanel";

/**
 * MapProvider/RightPanelProvider live above the router (see App.tsx) rather
 * than here - if AppShell owned them, each route's own <AppShell> instance
 * would get its own provider tree, so e.g. the GeoWitness nav item's
 * rightPanel.open() + navigate("/") would open the panel on the
 * about-to-be-unmounted instance and lose it the moment navigation
 * completed. Shared providers above the router mean panel/map state
 * survives navigation between shell pages.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
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
  );
}
