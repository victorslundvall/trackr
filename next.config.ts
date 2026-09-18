import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Låt mobilen/andra enheter på hemnätverket använda dev-servern (t.ex. http://192.168.68.53:3000)
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.local"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "raw.githubusercontent.com" }],
  },
};

export default nextConfig;
