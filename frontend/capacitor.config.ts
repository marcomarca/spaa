import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.spaa.app",
  appName: "SPAA",
  webDir: "dist",
  server: {
    androidScheme: "http",
    cleartext: true,
  },
};

export default config;
