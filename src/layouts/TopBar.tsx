import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Loader2, Bell, MessageCircle, Sun, Moon, User, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { useGeoSearch } from "@/hooks/useGeoSearch";
import { useRightPanel } from "@/contexts/RightPanelContext";
import { useAnalysisHistory } from "@/hooks/useAnalysisHistory";
import { useTheme } from "@/hooks/useTheme";

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
  const [query, setQuery] = useState("");
  const { isSearching, search } = useGeoSearch();
  const rightPanel = useRightPanel();
  const { saveAnalysis } = useAnalysisHistory();
  const navigate = useNavigate();

  const handleSearch = async () => {
    if (!query.trim()) return;
    // Search results land on the map (marker + boundary + fly-to, same as
    // v1's GeoSearch page) - navigate to it first so that's actually visible
    // even if the search was triggered from Reports/Settings/Early Warning.
    navigate("/");
    const result = await search(query);
    if (!result) return;
    rightPanel.open({ type: "search", data: result });

    const first = result.locations?.[0] || result.reportLocation;
    if (first) {
      const size = 0.2;
      saveAnalysis({
        type: "geosearch",
        regionName: first.name,
        regionBounds: { north: first.lat + size, south: first.lat - size, east: first.lng + size, west: first.lng - size },
        resultPayload: result,
      });
    }
  };

  return (
    <header className="flex items-center h-12 px-4 gap-3 bg-white dark:bg-surface-1 border-b border-gray-200 dark:border-border-subtle flex-shrink-0">
      <div
        className={cn(
          "flex items-center gap-2 flex-1 max-w-[520px] h-9 px-3",
          "bg-gray-50 dark:bg-surface-2 border border-gray-200 dark:border-border-default rounded-lg",
          "transition-all duration-fast",
          "focus-within:border-blue-300 dark:focus-within:border-border-accent focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.12)]"
        )}
      >
        {isSearching ? (
          <Loader2 className="w-4 h-4 text-gray-400 dark:text-v2-muted animate-spin flex-shrink-0" />
        ) : (
          <Search className="w-4 h-4 text-gray-400 dark:text-v2-muted flex-shrink-0" />
        )}
        <input
          type="text"
          placeholder='Ask about environmental changes… e.g. "Flooding in Lagos 2023"'
          className="flex-1 bg-transparent border-none outline-none text-[14px] text-gray-900 dark:text-v2-primary placeholder:text-gray-400 dark:placeholder:text-v2-muted"
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          onChange={(e) => setQuery(e.target.value)}
          value={query}
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-gray-400 dark:text-v2-muted hover:text-gray-900 dark:hover:text-v2-primary transition-colors duration-fast">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 ml-auto">
        <TopBarIconButton icon={Bell} onClick={() => navigate("/early-warning")} active={false} />
        <TopBarIconButton icon={MessageCircle} onClick={() => rightPanel.open({ type: "ai" })} active={rightPanel.mode?.type === "ai"} />
        <div className="w-px h-5 bg-gray-200 dark:bg-border-subtle mx-1" />
        <UserAvatar />
      </div>
    </header>
  );
}
