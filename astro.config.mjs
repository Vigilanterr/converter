import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import svelte from "@astrojs/svelte";
import react from "@astrojs/react";

export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone"
  }),
  integrations: [svelte(), react()],
  server: {
    host: true,
    port: 4321
  }
});