/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COLLECTOR_ORIGIN?: string;
  readonly VITE_MAPBOX_ACCESS_TOKEN?: string;
  readonly VITE_MAPBOX_SECONDARY_STYLE_URL?: string;
  readonly VITE_MAPBOX_STYLE_URL?: string;
  readonly VITE_SIMULATION_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
