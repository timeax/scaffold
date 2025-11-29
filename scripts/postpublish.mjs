#!/usr/bin/env node
// scripts/postpublish.mjs

import fs from "node:fs";
import path from "node:path";

function incrementPatch(version) {
   const parts = version.split(".");

   if (parts.length !== 3) {
      throw new Error(`[postpublish] Unsupported version format: "${version}"`);
   }

   let [majorRaw, minorRaw, patchRaw] = parts;

   let major = Number(majorRaw);
   let minor = Number(minorRaw);
   let patch = Number(patchRaw);

   if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
      throw new Error(
         `[postpublish] Version contains non-numeric parts: "${version}"`
      );
   }

   // Single-digit patch rule:
   // - If patch >= 9, roll into next minor and reset patch to 0.
   // - Otherwise, just increment patch.
   if (patch >= 9) {
      patch = 0;
      minor += 1;
   } else {
      patch += 1;
   }

   return `${major}.${minor}.${patch}`;
}

function main() {
   const pkgPath = path.resolve(process.cwd(), "package.json");

   if (!fs.existsSync(pkgPath)) {
      console.error("[postpublish] Could not find package.json at", pkgPath);
      process.exit(1);
   }

   const raw = fs.readFileSync(pkgPath, "utf8");
   let pkg;

   try {
      pkg = JSON.parse(raw);
   } catch (e) {
      console.error("[postpublish] Failed to parse package.json:", e);
      process.exit(1);
   }

   const currentVersion = pkg.version;
   if (typeof currentVersion !== "string") {
      console.error(
         '[postpublish] package.json does not have a string "version" field.'
      );
      process.exit(1);
   }

   let nextVersion;
   try {
      nextVersion = incrementPatch(currentVersion);
   } catch (e) {
      console.error(String(e));
      process.exit(1);
   }

   pkg.version = nextVersion;

   fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

   console.log(
      `[postpublish] Bumped version in package.json: ${currentVersion} → ${nextVersion}`
   );
}

main();
