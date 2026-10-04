import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import svelte from "@astrojs/svelte";
import react from "@astrojs/react";

export default defineConfig({
  output: "server",
  adapter: vercel(),
  integrations: [svelte(), react()],
  server: {
    host: true,
    port: 4321
  }
});