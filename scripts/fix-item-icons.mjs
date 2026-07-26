import fs from "fs";
import path from "path";

const dir = path.resolve("public/icons/items");
let n = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".svg"))) {
  let s = fs.readFileSync(path.join(dir, f), "utf8");
  if (!s.includes("M0 0h512v512H0z")) continue;

  // Remove solid gold square that made icons look like beige blocks
  s = s.replace(/<path fill="#e8d48b" d="M0 0h512v512H0z"\s*\/>/g, "");
  // Drop nested frame chrome — slots already have borders
  s = s.replace(/\s*<defs>[\s\S]*?<\/defs>\s*/g, "\n");
  s = s.replace(/\s*<rect x="2"[^/]*\/>\s*/g, "\n");
  s = s.replace(/\s*<rect x="6"[^/]*\/>\s*/g, "\n");

  if (s.includes("<svg") && !/fill="none"/.test(s.slice(0, 120))) {
    s = s.replace("<svg ", '<svg fill="none" ');
  }

  fs.writeFileSync(path.join(dir, f), s);
  n += 1;
  console.log("fixed", f);
}
console.log("done", n);
