import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createLibraryApi } from "./server/library-api.ts";
import { createMangaDexApi } from "./server/mangadex-api.ts";
import { createGamingApi } from "./server/gaming-api.ts";
import { createInstalledApi } from "./server/installed-api.ts";
import { resolve } from "node:path";
import { createDashboardApi } from "./server/dashboard-api.ts";
import { createMusicApi } from "./server/music-api.ts";
import { createNewsApi } from "./server/news-api.ts";
import { APP_NAME } from "./src/lib/brand.ts";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    {
      name: "app-brand",
      transformIndexHtml(html) {
        const escaped = APP_NAME.replace(
          /[&<>"']/g,
          (value) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[value]!,
        );
        return html.replaceAll("%APP_NAME%", escaped);
      },
    },
    {
      name: "mia-local-library",
      configureServer(server) {
        server.middlewares.use(createMangaDexApi());
        server.middlewares.use(createMusicApi());
        server.middlewares.use(createDashboardApi(resolve("dashboard-data")));
        server.middlewares.use(createLibraryApi());
        server.middlewares.use(
          createGamingApi({ directory: resolve("gaming-data/feeds") }),
        );
        server.middlewares.use(createInstalledApi());
        server.middlewares.use(
          createNewsApi({ directory: resolve("dashboard-data") }),
        );
      },
      configurePreviewServer(server) {
        server.middlewares.use(createMangaDexApi());
        server.middlewares.use(createMusicApi());
        server.middlewares.use(createDashboardApi(resolve("dashboard-data")));
        server.middlewares.use(createLibraryApi());
        server.middlewares.use(
          createGamingApi({ directory: resolve("gaming-data/feeds") }),
        );
        server.middlewares.use(createInstalledApi());
        server.middlewares.use(
          createNewsApi({ directory: resolve("dashboard-data") }),
        );
      },
    },
    react(),
    tailwindcss(),
  ],
  server: {
    host: "127.0.0.1",
    watch: {
      ignored: [
        "**/releases/**",
        "**/dist/**",
        "**/gaming-data/**",
        "**/library-data/**",
        "**/dashboard-data/**",
      ],
    },
    fs: {
      deny: [
        "**/.env*",
        "**/.git/**",
        "**/library-data/**",
        "**/gaming-data/**",
        "**/dashboard-data/**",
        "**/server/**",
      ],
    },
  },
});
