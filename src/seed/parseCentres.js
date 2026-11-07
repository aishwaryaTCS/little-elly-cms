import fs from "node:fs";

export function readCentres(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const marker = source.indexOf("export const centres");
  if (marker < 0) throw new Error("Could not find the centres list in the reference file.");
  const equals = source.indexOf("=", marker);
  const open = source.indexOf("[", equals);
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        const literal = source.slice(open, index + 1);
        const centres = Function(`"use strict"; return (${literal});`)();
        if (!Array.isArray(centres) || !centres.length) {
          throw new Error("The reference centres list was empty.");
        }
        return centres;
      }
    }
  }

  throw new Error("Could not read the centres list from the reference file.");
}
