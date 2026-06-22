// app.config.ts
import { defineConfig } from "@tanstack/react-start/config";
import tsConfigPaths from "vite-tsconfig-paths";
var app_config_default = defineConfig({
  tsr: {
    generatedRouteTree: "./src/routeTree.gen.ts",
    routesDirectory: "./src/routes"
  },
  vite: {
    plugins: [tsConfigPaths()]
  },
  server: {
    // node-server preset builds a standalone Node.js HTTP server in .output/
    preset: "node-server"
  }
});
export {
  app_config_default as default
};
