import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/worker-configuration.d.ts",
        "**/.vite/**",
        "**/dist/**",
        "**/.wrangler/**",
      ],
    },
  },
  optimizeDeps: {
    include: [
      "agents",
      "agents/react",
      "agents/chat/react",
      "@cloudflare/ai-chat",
      "@cloudflare/ai-chat/react",
      "ai",
      "workers-ai-provider",
    ],
  },
});
