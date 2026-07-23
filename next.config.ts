import type { NextConfig } from "next";
import { securityHeadersConfig } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // Typed routes on (ENG §6).
  typedRoutes: true,
  // Security headers, set globally per security.md §5 (SEC-12/13, ENG-14).
  async headers() {
    return securityHeadersConfig();
  },
};

export default nextConfig;
