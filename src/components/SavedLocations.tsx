import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Bookmark, 
  MapPin, 
  Plus, 
  Trash2, 
  Loader2, 
  Star,
  Eye
} from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

type SavedLocation = {
  id: string;
  name: string;
  display_name: string | null;
  lat: number;
  lng: number;
  event_types: string[];
  monitoring_enabled: boolean;
  created_at: string;
};

interface SavedLocationsProps {
  onLocationSelect?: (location: { name: string; lat: number; lng: number }) => void;
  currentLocation?: { name: string; lat: number; lng: number } | null;
}

const SavedLocations = ({ onLocationSelect, currentLocation }: SavedLocationsProps) => {
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [customName, setCustomName] = useState("");
  const [user, setUser] = useState<User | null>(null);

  const fetchLocations = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("saved_locations")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLocations(data || []);
    } catch (error) {
      console.error("Error fetching locations:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkUser = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (user) {
      fetchLocations();
    } else {
      setIsLoading(false);
    }
  }, [fetchLocations]);

  useEffect(() => {
    checkUser();
  }, [checkUser]);

  const saveCurrentLocation = async () => {
    if (!currentLocation || !user) {
      toast.error("Please select a location first");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.from("saved_locations").insert({
        user_id: user.id,
        name: currentLocation.name,
        display_name: customName || null,
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        event_types: ["deforestation"],
      });

      if (error) throw error;

      toast.success("Location saved to watchlist!");
      setCustomName("");
      fetchLocations();
    } catch (error) {
      console.error("Error saving location:", error);
      toast.error("Failed to save location");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteLocation = async (id: string) => {
    try {
      const { error } = await supabase
        .from("saved_locations")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Location removed from watchlist");
      setLocations((prev) => prev.filter((loc) => loc.id !== id));
    } catch (error) {
      console.error("Error deleting location:", error);
      toast.error("Failed to remove location");
    }
  };

  if (!user) {
    return (
      <Card className="p-4">
        <div className="text-center text-muted-foreground">
          <Bookmark className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Sign in to save locations</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Star className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Saved Locations</h3>
      </div>

      {/* Save Current Location */}
      {currentLocation && (
        <div className="mb-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
          <p className="text-sm font-medium mb-2 truncate">{currentLocation.name}</p>
          <div className="flex gap-2">
            <Input
              placeholder="Custom name (optional)"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="flex-1 h-8 text-sm"
            />
            <Button
              size="sm"
              onClick={saveCurrentLocation}
              disabled={isSaving}
              className="bg-gradient-ocean hover:opacity-90"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Saved Locations List */}
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : locations.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground">
          <MapPin className="h-6 w-6 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No saved locations yet</p>
        </div>
      ) : (
        <ScrollArea className="max-h-[200px]">
          <div className="space-y-2">
            {locations.map((location) => (
              <div
                key={location.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {location.display_name || location.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                  </p>
                </div>
                <div className="flex gap-1 ml-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() =>
                      onLocationSelect?.({
                        name: location.display_name || location.name,
                        lat: location.lat,
                        lng: location.lng,
                      })
                    }
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => deleteLocation(location.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </Card>
  );
};

export default SavedLocations;
