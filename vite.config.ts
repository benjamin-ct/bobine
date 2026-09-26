import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // injectManifest (plutôt que generateSW) : nécessaire pour ajouter nos
      // propres écouteurs "push" / "notificationclick" dans le service
      // worker (src/sw.ts), impossible avec un sw.js entièrement généré.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        // Les icônes/manifest ne changent pas entre deux builds identiques ;
        // évite un avertissement de vite-plugin-pwa sur la taille du bundle.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      registerType: "autoUpdate",
      devOptions: { enabled: true, type: "module" },
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "apple-touch-icon-dark.png"],
      manifest: {
        name: "Bobine — Films & séries à regarder",
        short_name: "Bobine",
        description:
          "Découvrez où regarder vos films et séries en streaming, tirez un titre au hasard, et suivez ce que vous avez déjà vu.",
        start_url: "/",
        display: "standalone",
        background_color: "#09162b",
        theme_color: "#0c1a30",
        lang: "fr",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
