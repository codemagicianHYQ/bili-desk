import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
const projectRoot = resolve(".");
export default defineConfig({
    base: "./",
    root: resolve("src/renderer"),
    plugins: [react()],
    resolve: {
        alias: {
            "@": resolve("src/renderer/src"),
            "@shared": resolve("src/shared"),
        },
    },
    css: {
        postcss: {
            plugins: [
                tailwindcss({ config: resolve(projectRoot, "tailwind.config.js") }),
                autoprefixer(),
            ],
        },
    },
    server: {
        host: "127.0.0.1",
        port: 15174,
        strictPort: true,
        proxy: {
            "/bili-api": {
                target: "https://api.bilibili.com",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/bili-api/, ""),
            },
            "/bili-passport": {
                target: "https://passport.bilibili.com",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/bili-passport/, ""),
            },
        },
    },
    build: {
        outDir: resolve(projectRoot, "dist/mobile"),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                index: resolve("src/renderer/mobile.html"),
            },
        },
    },
});
