export const MAP_STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL?.trim()
  || "https://tiles.openfreemap.org/styles/liberty";

export const TERRAIN_TILE_URL = import.meta.env.VITE_TERRAIN_TILE_URL?.trim()
  || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
