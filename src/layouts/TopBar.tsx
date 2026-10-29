import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, MessageCircle, Sun, Moon, User, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import LocationSearch from "@/components/LocationSearch";
import { useMapContext } from "@/contexts/MapContext";
import { useRightPanel } from "@/contexts/RightPanelContext";
import { useTheme } from "@/hooks/useTheme";
import type { GeocodedPlace } from "@/types/geospatial";

function TopBarIconButton({ icon: Icon, onClick, active, badge }: { icon: typeof Bell; onClick: () => void; active: boolean; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-9 h-9 flex items-center justify-center rounded-md",
        "transition-all duration-fast",
        active ? "bg-brand-dim text-brand" : "text-gray-500 dark:text-v2-secondary hover:bg-gray-100 dark:hover:bg-surface-2 hover:text-gray-900 dark:hover:text-v2-primary"
      )}
    >
      <Icon className="w-4 h-4" />
      {!!badge && <span className="absolute top-1 right-1 w-2 h-2 bg-critical rounded-full" />}
    </button>
  );
}

function getInitials(email?: string | null) {
  if (!email) return "?";
  return email.slice(0, 2).toUpperCase();
}

function DropdownItem({ icon: Icon, label, onClick, className }: { icon: typeof User; label: string; onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px]",
        "text-gray-700 dark:text-v2-secondary hover:bg-gray-100 dark:hover:bg-surface-3",
        "transition-all duration-fast",
        className
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function UserAvatar() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="w-8 h-8 rounded-full bg-blue-50 dark:bg-brand-dim border border-blue-200 dark:border-brand-border text-blue-600 dark:text-brand text-[12px] font-semibold flex items-center justify-center hover:bg-blue-100 dark:hover:bg-brand hover:text-blue-700 dark:hover:text-white transition-all duration-fast"
      >
        {getInitials(user.email)}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-[200px] bg-white dark:bg-surface-2 border border-gray-200 dark:border-border-default rounded-xl shadow-lg overflow-hidden">
            <div className="px-3.5 py-3 border-b border-gray-100 dark:border-border-subtle">
              <p className="text-[13px] font-medium text-gray-900 dark:text-v2-primary truncate">{user.user_metadata?.full_name ?? "Account"}</p>
              <p className="text-[11px] text-gray-500 dark:text-v2-muted truncate mt-0.5">{user.email}</p>
            </div>

            <div className="px-3.5 py-2.5 border-b border-gray-100 dark:border-border-subtle">
              <p className="text-[11px] text-gray-400 dark:text-v2-muted uppercase tracking-[0.06em] mb-2">Appearance</p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setTheme("light")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] transition-all duration-fast border",
                    !isDark ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-transparent border-gray-200 dark:border-border-subtle text-gray-500 dark:text-v2-muted hover:border-gray-300 dark:hover:border-border-default"
                  )}
                >
                  <Sun className="w-3.5 h-3.5" /> Light
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] transition-all duration-fast border",
                    isDark ? "bg-brand-dim border-brand-border text-brand" : "bg-transparent border-gray-200 dark:border-border-subtle text-gray-500 dark:text-v2-muted hover:border-gray-300 dark:hover:border-border-default"
                  )}
                >
                  <Moon className="w-3.5 h-3.5" /> Dark
                </button>
              </div>
            </div>

            <div className="p-1 border-b border-gray-100 dark:border-border-subtle">
              <DropdownItem icon={Settings} label="Settings" onClick={() => { setOpen(false); navigate("/settings"); }} />
            </div>

            <div className="p-1">
              <DropdownItem icon={LogOut} label="Sign out" onClick={() => supabase.auth.signOut()} className="text-red-500 dark:text-critical hover:bg-red-50 dark:hover:bg-critical-dim" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function TopBar() {
  const mapCtx = useMapContext();
  const rightPanel = useRightPanel();
  const navigate = useNavigate();

  const handleLocationSelect = (place: GeocodedPlace) => {
    navigate("/");
    mapCtx.setMarkers([{ lat: place.lat, lng: place.lng, label: place.name, color: "#0891b2" }]);
    mapCtx.setPolygons([]);
    mapCtx.setSelectedArea(null);
    mapCtx.setSelectedBoundary(place.geometry ?? null);

    if (place.bounds) {
      const [[south, west], [north, east]] = place.bounds;
      const regionBounds = { north, south, east, west };
      mapCtx.flyToBounds(regionBounds);
    } else {
      mapCtx.setView([place.lat, place.lng], 10);
    }

    rightPanel.open({
      type: "search",
      data: place,
    });
  };

  return (
    <header className="flex items-center h-12 px-4 gap-3 bg-white dark:bg-surface-1 border-b border-gray-200 dark:border-border-subtle flex-shrink-0">
      <LocationSearch
        onLocationSelect={handleLocationSelect}
        placeholder="Search countries, regions, towns, or basins..."
        className="flex-1 max-w-[520px]"
      />

      <div className="flex items-center gap-1 ml-auto">
        <TopBarIconButton icon={Bell} onClick={() => navigate("/early-warning")} active={false} />
        <TopBarIconButton icon={MessageCircle} onClick={() => rightPanel.open({ type: "ai" })} active={rightPanel.mode?.type === "ai"} />
        <div className="w-px h-5 bg-gray-200 dark:bg-border-subtle mx-1" />
        <UserAvatar />
      </div>
    </header>
  );
}
