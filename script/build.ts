import * as esbuild from "esbuild";
import { execSync } from "child_process";
import fs from "fs";

async function build() {
  console.log("Building client...");
  execSync("npx vite build", { stdio: "inherit" });
  
  console.log("Building server...");
  await esbuild.build({
    entryPoints: ["server/index.ts"],
    bundle: true,
    platform: "node",
    target: "node20",
    outfile: "dist/index.mjs",
    format: "esm",
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
    external: [
      "pg-native",
      "puppeteer",
      "@supabase/supabase-js",
      "./vite",
      "./vite.ts",
      "../vite.config",
      "../vite.config.ts",
      "vite"
    ],
  });
  
  // Create both .cjs (for npm start) and .js wrappers
  // Dynamic import() works in both CJS and ESM contexts in Node.js
  const wrapper = `// Dynamic import wrapper for ESM module
import("./index.mjs").catch(err => {
  console.error("Failed to load ESM module:", err);
  process.exit(1);
});
`;
  fs.writeFileSync("dist/index.cjs", wrapper);
  fs.writeFileSync("dist/index.js", wrapper);
  
  console.log("Build complete!");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
