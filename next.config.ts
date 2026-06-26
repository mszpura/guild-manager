import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Logo stowarzyszenia trafia do server action jako dane formularza.
    // Domyślny limit body (1 MB) jest za mały — podnosimy z zapasem na plik + pozostałe pola.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
