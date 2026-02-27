import index from "./index.html";
import data from "./data.json" assert { type: "json" };
import type { DoomData } from "./src/types";

const doomData = data as DoomData;

const server = Bun.serve({
  routes: {
    "/": index,
    "/data.json": {
      GET: () => {
        return new Response(JSON.stringify(doomData), {
          headers: {
            "Content-Type": "application/json",
          },
        });
      },
    },
  },
});

console.log(`Server is running on ${server.url}`);