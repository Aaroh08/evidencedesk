import { build } from "esbuild";
await build({
  entryPoints: ["src/client.js"],
  bundle: true,
  format: "esm",
  outfile: "public/bundle.js",
  minify: true,
  sourcemap: true,
});
