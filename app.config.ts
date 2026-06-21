import { defineConfig } from "@tanstack/react-start/config";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  tsr: {
    generatedRouteTree: "./src/routeTree.gen.ts",
    routesDirectory: "./src/routes",
  },
  vite: {
    plugins: [tsConfigPaths()],
  },
  server: {
    // node-server preset builds a standalone Node.js HTTP server in .output/
    preset: "node-server",
  },
});
