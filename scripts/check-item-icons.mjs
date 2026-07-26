import { ITEM_TEMPLATES } from "../src/data/items.js";
import fs from "fs";

let ok = 0;
const miss = [];
for (const [id, def] of Object.entries(ITEM_TEMPLATES)) {
  const url = def.sprite || `/icons/items/${id}.svg`;
  const file = url.split("/").pop();
  const path = `public/icons/items/${file}`;
  if (fs.existsSync(path)) ok++;
  else miss.push(`${id} -> ${url}`);
}
console.log("ok", ok, "miss", miss.length);
console.log(miss.slice(0, 80).join("\n"));
