import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navigation from "./components/Navigation";
import AIAssistant from "./components/AIAssistant";
import DemoRecorder from "./components/DemoRecorder";
import Home from "./pages/Home";
import GeoWitness from "./pages/GeoWitness";
import GeoSearch from "./pages/GeoSearch";
import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import EarlyWarning from "./pages/EarlyWarning";
import SharedReport from "./pages/SharedReport";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public shared report route - no navigation */}
          <Route path="/shared/:shareId" element={<SharedReport />} />
          
          {/* Main app routes with navigation */}
          <Route
            path="*"
            element={
              <div className="min-h-screen bg-background">
                <Navigation />
                <div className="pt-[73px]">
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/geowitness" element={<GeoWitness />} />
                    <Route path="/geosearch" element={<GeoSearch />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/early-warning" element={<EarlyWarning />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </div>
                <AIAssistant />
                <DemoRecorder />
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
