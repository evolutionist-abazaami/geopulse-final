import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useRightPanel } from "@/contexts/RightPanelContext";

const RightPanel = lazy(() => import("./RightPanel").then(({ RightPanel }) => ({ default: RightPanel })));

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
  const { mode } = useRightPanel();
  const [hasOpenedPanel, setHasOpenedPanel] = useState(Boolean(mode));

  useEffect(() => {
    if (mode) setHasOpenedPanel(true);
  }, [mode]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-surface-base">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <div className="flex flex-1 overflow-hidden">
          <main className="relative flex-1 overflow-hidden">
            {children}
          </main>
          {hasOpenedPanel && (
            <Suspense fallback={
              <div className="w-[380px] flex-shrink-0 flex items-center justify-center border-l border-gray-200 dark:border-border-subtle">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            }>
              <RightPanel />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
