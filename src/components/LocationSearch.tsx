import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { GeocodedPlace } from "@/types/geospatial";
import { searchPlaces } from "@/utils/locationSearch";

interface LocationSearchProps {
  onLocationSelect: (location: GeocodedPlace) => void;
  onInputChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  defaultValue?: string;
}

function locationIcon(type: string): string {
  if (type === "country") return "🌍";
  if (["city", "town", "village", "municipality"].includes(type)) return "🏙️";
  if (["basin", "water", "river", "lake"].some((part) => type.includes(part))) return "💧";
  if (["state", "region", "county", "administrative"].some((part) => type.includes(part))) return "🗺️";
  return "📍";
}

export default function LocationSearch({
  onLocationSelect,
  onInputChange,
  placeholder = "Search countries, regions, towns, or basins...",
  className,
  defaultValue = "",
}: LocationSearchProps) {
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<GeocodedPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const searchTerm = query.trim();
    if (searchTerm.length < 2 || isSearching) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsSearching(true);
    setError(null);
    setShowResults(true);

    const timeoutId = setTimeout(() => controller.abort(), 12_000);
    try {
      const places = await searchPlaces(searchTerm, controller.signal);
      setResults(places);
      if (places.length === 0) setError("No matching places found. Try a more specific name.");
    } catch (searchError) {
      if (controller.signal.aborted) {
        setError("Location search timed out or was cancelled. Please try again.");
      } else {
        setError(searchError instanceof Error ? searchError.message : "Location search failed.");
      }
      setResults([]);
    } finally {
      clearTimeout(timeoutId);
      if (controllerRef.current === controller) controllerRef.current = null;
      setIsSearching(false);
    }
  };

  const handleSelect = (place: GeocodedPlace) => {
    setQuery(place.name);
    onInputChange?.(place.name);
    onLocationSelect(place);
    setShowResults(false);
    setError(null);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              onInputChange?.(event.target.value);
              setError(null);
            }}
            placeholder={placeholder}
            className="pl-10 pr-10"
            onFocus={() => results.length > 0 && setShowResults(true)}
            aria-label="Search for a place"
          />
          {query && !isSearching && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => {
                setQuery("");
                setResults([]);
                setError(null);
                onInputChange?.("");
              }}
              aria-label="Clear location search"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        <Button type="submit" size="sm" disabled={isSearching || query.trim().length < 2}>
          {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </Button>
      </form>

      {showResults && (results.length > 0 || error) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
          {results.map((place, index) => (
            <button
              key={`${place.lat}-${place.lng}-${index}`}
              type="button"
              onClick={() => handleSelect(place)}
              className="w-full px-4 py-3 text-left hover:bg-muted/50 flex items-start gap-3 border-b border-border last:border-0 transition-colors"
            >
              <span className="text-lg mt-0.5" aria-hidden="true">{locationIcon(place.type)}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-sm truncate">{place.name}</span>
                <span className="block text-xs text-muted-foreground truncate">
                  {place.displayName}
                </span>
                <span className="block text-[10px] text-muted-foreground mt-1">
                  {place.geometry ? "Boundary available" : "Point location"} · OpenStreetMap
                </span>
              </span>
              <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
            </button>
          ))}
          {error && <p className="p-3 text-sm text-muted-foreground text-center">{error}</p>}
        </div>
      )}
    </div>
  );
}
