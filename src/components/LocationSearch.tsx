import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface LocationResult {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: string[];
  type: string;
  importance: number;
}

interface LocationSearchProps {
  onLocationSelect: (location: {
    name: string;
    lat: number;
    lng: number;
    bounds?: [[number, number], [number, number]];
  }) => void;
  onInputChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  defaultValue?: string;
}

const LocationSearch = ({
  onLocationSelect,
  onInputChange,
  placeholder = "Search any location in Africa...",
  className,
  defaultValue = "",
}: LocationSearchProps) => {
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<LocationResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleQueryChange = (val: string) => {
    setQuery(val);
    onInputChange?.(val);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search using Nominatim (OpenStreetMap geocoding)
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Search with Africa bounding box to prioritize African locations
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            query
          )}&viewbox=-18,37,52,-35&bounded=0&limit=10&addressdetails=1`,
          {
            headers: {
              "Accept-Language": "en",
              "User-Agent": "GeoPulse Environmental Analysis App",
            },
          }
        );

        if (response.ok) {
          const data: LocationResult[] = await response.json();
          // Filter to prioritize African countries
          const africanCountries = [
            "Nigeria", "Ghana", "Kenya", "Ethiopia", "South Africa", "Egypt", "Morocco",
            "Algeria", "Tunisia", "Libya", "Sudan", "South Sudan", "Tanzania", "Uganda",
            "Rwanda", "Burundi", "DRC", "Congo", "Cameroon", "Mali", "Niger", "Chad",
            "Senegal", "Mauritania", "Ivory Coast", "Burkina Faso", "Benin", "Togo",
            "Guinea", "Sierra Leone", "Liberia", "Gambia", "Guinea-Bissau", "Gabon",
            "Equatorial Guinea", "Central African Republic", "Angola", "Zambia", "Zimbabwe",
            "Mozambique", "Malawi", "Botswana", "Namibia", "Lesotho", "Eswatini", "Madagascar",
            "Mauritius", "Seychelles", "Comoros", "Djibouti", "Eritrea", "Somalia", "Somaliland",
            "Côte d'Ivoire", "Democratic Republic of the Congo", "Republic of Congo",
          ];
          
          const sortedResults = data.sort((a, b) => {
            const aInAfrica = africanCountries.some(c => a.display_name.includes(c));
            const bInAfrica = africanCountries.some(c => b.display_name.includes(c));
            if (aInAfrica && !bInAfrica) return -1;
            if (!aInAfrica && bInAfrica) return 1;
            return b.importance - a.importance;
          });
          
          setResults(sortedResults.slice(0, 8));
          setShowResults(true);
        }
      } catch (error) {
        console.error("Location search error:", error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  const handleSelect = (result: LocationResult) => {
    const bounds: [[number, number], [number, number]] = [
      [parseFloat(result.boundingbox[0]), parseFloat(result.boundingbox[2])],
      [parseFloat(result.boundingbox[1]), parseFloat(result.boundingbox[3])],
    ];

    onLocationSelect({
      name: result.display_name.split(",").slice(0, 2).join(", "),
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      bounds,
    });

    setQuery(result.display_name.split(",").slice(0, 2).join(", "));
    setShowResults(false);
  };

  const getLocationTypeIcon = (type: string) => {
    switch (type) {
      case "city":
      case "town":
      case "village":
        return "🏙️";
      case "administrative":
        return "📍";
      case "country":
        return "🌍";
      case "state":
      case "region":
        return "🗺️";
      case "natural":
        return "🌳";
      case "water":
        return "💧";
      default:
        return "📌";
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={placeholder}
          className="pl-10 pr-10"
          onFocus={() => results.length > 0 && setShowResults(true)}
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {query && !isSearching && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={() => {
              handleQueryChange("");
              setResults([]);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
          {results.map((result, index) => (
            <button
              key={`${result.lat}-${result.lon}-${index}`}
              onClick={() => handleSelect(result)}
              className="w-full px-4 py-3 text-left hover:bg-muted/50 flex items-start gap-3 border-b border-border last:border-0 transition-colors"
            >
              <span className="text-lg mt-0.5">{getLocationTypeIcon(result.type)}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {result.display_name.split(",").slice(0, 2).join(", ")}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {result.display_name.split(",").slice(2).join(", ").trim()}
                </p>
              </div>
              <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
            </button>
          ))}
        </div>
      )}

      {showResults && query.length >= 2 && results.length === 0 && !isSearching && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 p-4">
          <p className="text-sm text-muted-foreground text-center">No locations found</p>
        </div>
      )}
    </div>
  );
};

export default LocationSearch;
