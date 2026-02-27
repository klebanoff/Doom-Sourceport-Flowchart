import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

async function main(): Promise<void> {
  await mkdir(join(DIST, "out", "test"), { recursive: true });

  await Bun.write(join(DIST, "style.css"), Bun.file(join(ROOT, "style.css")));
  await Bun.write(join(DIST, "data.json"), Bun.file(join(ROOT, "data.json")));
  await Bun.write(
    join(DIST, "out", "test", "test.svg"),
    Bun.file(join(ROOT, "out", "test", "test.svg"))
  );

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
