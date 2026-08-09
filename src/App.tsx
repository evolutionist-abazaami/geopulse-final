import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MapProvider } from "@/contexts/MapContext";
import { RightPanelProvider } from "@/contexts/RightPanelContext";
import { AppShell } from "@/layouts/AppShell";
import DemoRecorder from "./components/DemoRecorder";
import Home from "./pages/Home";
import MapView from "./pages/MapView";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import EarlyWarningPage from "./pages/EarlyWarningPage";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import SharedReport from "./pages/SharedReport";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

/**
 * `/` shows the marketing landing page (no shell chrome) for signed-out
 * visitors, and the map shell for signed-in ones - the shell's "map always
 * visible" mandate applies to the authenticated workspace, not the public
 * landing page.
 */
function RootRoute() {
  const [status, setStatus] = useState<"loading" | "signed-out" | "signed-in">("loading");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setStatus(session ? "signed-in" : "signed-out");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? "signed-in" : "signed-out");
    });
    return () => subscription.unsubscribe();
  }, []);

  if (status === "loading") {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "signed-out") return <Home />;

  return (
    <AppShell>
      <MapView />
    </AppShell>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="bottom-right" />
      <BrowserRouter>
        <MapProvider>
          <RightPanelProvider>
            <Routes>
              {/* Public routes - no shell */}
              <Route path="/shared/:shareId" element={<SharedReport />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Map-centric shell */}
              <Route path="/" element={<RootRoute />} />
              <Route path="/reports" element={<AppShell><ReportsPage /></AppShell>} />
              <Route path="/settings" element={<AppShell><SettingsPage /></AppShell>} />
              <Route path="/early-warning" element={<AppShell><EarlyWarningPage /></AppShell>} />

              {/* Retired routes - redirect so bookmarks don't 404 */}
              <Route path="/dashboard" element={<Navigate to="/" replace />} />
              <Route path="/analytics" element={<Navigate to="/" replace />} />
              <Route path="/geowitness" element={<Navigate to="/" replace />} />
              <Route path="/geosearch" element={<Navigate to="/" replace />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
            {/* Internal sales/marketing screen-capture tool, not a monitoring
                feature - opt-in only so real users don't see it. */}
            {import.meta.env.VITE_ENABLE_DEMO_RECORDER === "true" && <DemoRecorder />}
          </RightPanelProvider>
        </MapProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
