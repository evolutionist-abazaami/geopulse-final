// African Geocoding Dictionary & Multi-Event Analysis Engine
export interface AfricanLocation {
  name: string;
  city?: string;
  region: string;
  country: string;
  lat: number;
  lng: number;
  type: string;
  description: string;
  keywords: string[];
}

export const AFRICAN_LOCATIONS: AfricanLocation[] = [
  // CÔTE D'IVOIRE / IVORY COAST
  { 
    name: "Abidjan, Lagunes, Côte d'Ivoire", 
    city: "Abidjan", 
    region: "Lagunes", 
    country: "Côte d'Ivoire", 
    lat: 5.3600, 
    lng: -4.0083, 
    type: "city", 
    description: "Ébrié Lagoon coastal metropolis facing severe landslide hazards, urban drainage overflow at Indénié, and monsoonal flooding.",
    keywords: ["abidjan", "abijan", "lagunes", "indenié", "banco", "ebrie", "cocody", "yopougon", "ivory coast", "côte d'ivoire", "cote d'ivoire"]
  },
  { 
    name: "Yamoussoukro, Lacs, Côte d'Ivoire", 
    city: "Yamoussoukro", 
    region: "Lacs", 
    country: "Côte d'Ivoire", 
    lat: 6.8276, 
    lng: -5.2767, 
    type: "city", 
    description: "Political capital surrounded by agricultural zones and savannah-forest transition corridors.",
    keywords: ["yamoussoukro", "lacs"]
  },

  // GHANA
  { 
    name: "Kumasi, Ashanti Region, Ghana", 
    city: "Kumasi", 
    region: "Ashanti Region", 
    country: "Ghana", 
    lat: 6.6885, 
    lng: -1.6244, 
    type: "city", 
    description: "Major urban hub in central Ghana, prone to Subin and Aboabo river basin flooding during rainy seasons.",
    keywords: ["kumasi", "ashanti", "subin", "aboabo", "kejetia", "asafo", "owabi", "barekese", "wiwi"]
  },
  { 
    name: "Accra, Greater Accra, Ghana", 
    city: "Accra", 
    region: "Greater Accra", 
    country: "Ghana", 
    lat: 5.6037, 
    lng: -0.1870, 
    type: "city", 
    description: "Capital of Ghana, coastal urban area experiencing severe Odaw river basin flooding and coastal erosion.",
    keywords: ["accra", "odaw", "korle", "greater accra", "tema", "circle", "mallam"]
  },
  { 
    name: "Tamale, Northern Region, Ghana", 
    city: "Tamale", 
    region: "Northern Region", 
    country: "Ghana", 
    lat: 9.4008, 
    lng: -0.8393, 
    type: "city", 
    description: "Northern agricultural center affected by dry season droughts and white Volta seasonal floods.",
    keywords: ["tamale", "northern region", "savelugu"]
  },
  { 
    name: "Sekondi-Takoradi, Western Region, Ghana", 
    city: "Takoradi", 
    region: "Western Region", 
    country: "Ghana", 
    lat: 4.9016, 
    lng: -1.7831, 
    type: "city", 
    description: "Coastal industrial hub with high rainfall, mangrove degradation, and heavy port infrastructure.",
    keywords: ["takoradi", "sekondi", "western region"]
  },

  // NIGERIA
  { 
    name: "Lagos, Lagos State, Nigeria", 
    city: "Lagos", 
    region: "Lagos State", 
    country: "Nigeria", 
    lat: 6.5244, 
    lng: 3.3792, 
    type: "city", 
    description: "Africa's largest megacity, heavily vulnerable to sea level rise, lagoon surges, and urban flooding.",
    keywords: ["lagos", "ikeja", "lekki", "victoria island", "ikoyi", "mainland"]
  },
  { 
    name: "Abuja, Federal Capital Territory, Nigeria", 
    city: "Abuja", 
    region: "FCT", 
    country: "Nigeria", 
    lat: 9.0765, 
    lng: 7.3986, 
    type: "city", 
    description: "Federal capital territory in central Nigeria, surrounded by granite hills and urban development corridors.",
    keywords: ["abuja", "fct", "garki", "wuse"]
  },

  // KENYA
  { 
    name: "Nairobi, Nairobi County, Kenya", 
    city: "Nairobi", 
    region: "Nairobi County", 
    country: "Kenya", 
    lat: -1.2921, 
    lng: 36.8219, 
    type: "city", 
    description: "Highland capital city of Kenya, experiencing urban heat island effects and seasonal Nairobi River flooding.",
    keywords: ["nairobi", "kibera", "athi", "kenya"]
  },

  // SENEGAL
  { 
    name: "Dakar, Dakar Region, Senegal", 
    city: "Dakar", 
    region: "Dakar Region", 
    country: "Senegal", 
    lat: 14.7167, 
    lng: -17.4677, 
    type: "city", 
    description: "Cap-Vert peninsula metropolis experiencing coastal erosion, salinization, and suburb inundations.",
    keywords: ["dakar", "senegal", "pikine", "rufisque"]
  },

  // CAMEROON
  { 
    name: "Douala, Littoral, Cameroon", 
    city: "Douala", 
    region: "Littoral", 
    country: "Cameroon", 
    lat: 4.0511, 
    lng: 9.7679, 
    type: "city", 
    description: "Wouri river estuary port city subject to heavy tropical downpours and low-lying coastal flooding.",
    keywords: ["douala", "cameroon", "wouri"]
  },

  // RWANDA
  { 
    name: "Kigali, Kigali Province, Rwanda", 
    city: "Kigali", 
    region: "Kigali Province", 
    country: "Rwanda", 
    lat: -1.9441, 
    lng: 30.0619, 
    type: "city", 
    description: "City of a thousand hills, vulnerable to wet season rainstorms, landslides, and valley flooding.",
    keywords: ["kigali", "rwanda", "nyarugenge"]
  },

  // SOUTH AFRICA
  { 
    name: "Cape Town, Western Cape, South Africa", 
    city: "Cape Town", 
    region: "Western Cape", 
    country: "South Africa", 
    lat: -33.9249, 
    lng: 18.4241, 
    type: "city", 
    description: "Coastal Mediterranean climate city prone to severe droughts and fynbos wildfires.",
    keywords: ["cape town", "south africa", "table mountain"]
  },

  // EGYPT
  { 
    name: "Cairo, Cairo Governorate, Egypt", 
    city: "Cairo", 
    region: "Lower Egypt", 
    country: "Egypt", 
    lat: 30.0444, 
    lng: 31.2357, 
    type: "city", 
    description: "Nile River valley metropolis facing urban heat, air pollution, and Nile delta agricultural loss.",
    keywords: ["cairo", "egypt", "nile", "giza"]
  },

  // DEMOCRATIC REPUBLIC OF CONGO
  { 
    name: "Kinshasa, Kinshasa Province, DRC", 
    city: "Kinshasa", 
    region: "Kinshasa", 
    country: "DRC", 
    lat: -4.4419, 
    lng: 15.2663, 
    type: "city", 
    description: "Congo River basin capital city vulnerable to river overflow and severe urban gully erosion.",
    keywords: ["kinshasa", "congo", "drc", "brazzaville"]
  },

  // SIERRA LEONE
  { 
    name: "Freetown, Western Area, Sierra Leone", 
    city: "Freetown", 
    region: "Western Area", 
    country: "Sierra Leone", 
    lat: 8.4840, 
    lng: -13.2299, 
    type: "city", 
    description: "Coastal mountain city subject to heavy Atlantic monsoons, mudslides, and urban flooding.",
    keywords: ["freetown", "sierra leone", "sugar loaf"]
  },

  // LIBERIA
  { 
    name: "Monrovia, Montserrado, Liberia", 
    city: "Monrovia", 
    region: "Montserrado", 
    country: "Liberia", 
    lat: 6.3156, 
    lng: -10.8074, 
    type: "city", 
    description: "High rainfall West African capital experiencing coastal erosion and Mesurado river wetland flooding.",
    keywords: ["monrovia", "liberia", "mesurado"]
  },

  // BURKINA FASO
  { 
    name: "Ouagadougou, Centre, Burkina Faso", 
    city: "Ouagadougou", 
    region: "Centre", 
    country: "Burkina Faso", 
    lat: 12.3714, 
    lng: -1.5197, 
    type: "city", 
    description: "Sahelian inland capital facing extreme heatwaves, soil degradation, and sudden heavy flash floods.",
    keywords: ["ouagadougou", "burkina", "burkina faso"]
  },

  // MALI
  { 
    name: "Bamako, Capital District, Mali", 
    city: "Bamako", 
    region: "Capital District", 
    country: "Mali", 
    lat: 12.6392, 
    lng: -8.0029, 
    type: "city", 
    description: "Niger River basin capital suffering from riverbank erosion and seasonal summer flooding.",
    keywords: ["bamako", "mali", "niger river"]
  }
];

/**
 * Helper to clean query string and remove event action words
 */
function extractPlaceNameFromQuery(query: string): string {
  let cleaned = query.toLowerCase()
    .replace(/^(flood|flooding|drought|deforestation|wildfire|fire|mining|galamsey|urbanization|rain|water|erosion)\s+(in|at|near|around|over|of)\s+/i, "")
    .replace(/\s+(flood|flooding|drought|deforestation|wildfire|fire|mining|galamsey|urbanization|rain|water|erosion)$/i, "")
    .trim();
  
  if (!cleaned) cleaned = query.trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Intelligent African Location & Query Parser
 */
export function parseAfricanQuery(query: string) {
  const q = query.toLowerCase().trim();

  // 1. Check keyword lists in AFRICAN_LOCATIONS database
  let matchedLocation = AFRICAN_LOCATIONS.find(loc => 
    loc.keywords.some(kw => q.includes(kw)) ||
    q.includes(loc.city?.toLowerCase() || "___") || 
    q.includes(loc.country.toLowerCase()) || 
    q.includes(loc.name.toLowerCase())
  );

  // 2. Extract event type from query
  let eventType = "flooding";
  if (q.includes("deforest") || q.includes("tree") || q.includes("timber") || q.includes("forest")) {
    eventType = "deforestation";
  } else if (q.includes("drought") || q.includes("dry") || q.includes("arid") || q.includes("water scarcity")) {
    eventType = "drought";
  } else if (q.includes("fire") || q.includes("wildfire") || q.includes("burn")) {
    eventType = "wildfire";
  } else if (q.includes("mining") || q.includes("galamsey") || q.includes("degradation")) {
    eventType = "illegal_mining";
  } else if (q.includes("urban") || q.includes("building") || q.includes("expansion")) {
    eventType = "urbanization";
  } else if (q.includes("flood") || q.includes("rain") || q.includes("inundat") || q.includes("water") || q.includes("overflow")) {
    eventType = "flooding";
  }

  // 3. Fallback: If no database match found, dynamically generate location object matching user's query place
  if (!matchedLocation) {
    const extractedName = extractPlaceNameFromQuery(query);
    matchedLocation = {
      name: `${extractedName} Region`,
      city: extractedName,
      region: `${extractedName} Sector`,
      country: "Africa",
      lat: 5.6, // Default West African center
      lng: -0.2,
      type: "custom",
      description: `Target area centered on ${extractedName} for environmental multi-spectral satellite monitoring.`,
      keywords: [extractedName.toLowerCase()]
    };
  }

  return {
    location: matchedLocation,
    eventType
  };
}
