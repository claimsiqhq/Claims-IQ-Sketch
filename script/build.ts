import * as esbuild from "esbuild";
import { execSync } from "child_process";

async function build() {
  console.log("Building client...");
  execSync("npx vite build", { stdio: "inherit" });
  
  console.log("Building server...");
  await esbuild.build({
    entryPoints: ["server/index.ts"],
    bundle: true,
    platform: "node",
    target: "node20",
    outfile: "dist/index.cjs",
    format: "cjs",
    external: [
      "pg-native",
      "puppeteer",
      "@supabase/supabase-js"
    ],
  });
  
  console.log("Build complete!");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
