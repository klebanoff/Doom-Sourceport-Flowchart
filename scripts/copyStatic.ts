import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

async function main(): Promise<void> {

  await Bun.write(join(DIST, "style.css"), Bun.file(join(ROOT, "style.css")));
  await Bun.write(join(DIST, "data.json"), Bun.file(join(ROOT, "data.json")));

  const indexHtml = await Bun.file(join(ROOT, "index.html")).text();
  const productionHtml = indexHtml.replace(
    'src="src/main.ts"',
    'src="main.js"'
  );
  await Bun.write(join(DIST, "index.html"), productionHtml);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
