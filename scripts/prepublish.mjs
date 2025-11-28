#!/usr/bin/env node
// scripts/prepublish.mjs

import { spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

function run(command, args, options = {}) {
   const result = spawnSync(command, args, {
      stdio: "inherit",
      ...options,
   });

   if (result.error) {
      console.error(`[prepublish] Failed to run ${command}:`, result.error);
      process.exit(1);
   }

   if (typeof result.status === "number" && result.status !== 0) {
      process.exit(result.status);
   }

   return result;
}

function runCapture(command, args, options = {}) {
   const result = spawnSync(command, args, {
      encoding: "utf8",
      stdio: ["inherit", "pipe", "pipe"],
      ...options,
   });

   if (result.error) {
      throw result.error;
   }

   return result;
}

async function main() {
   // Check if we're in a git repo
   try {
      const revParse = runCapture("git", [
         "rev-parse",
         "--is-inside-work-tree",
      ]);
      if (revParse.status !== 0) {
         console.log("[prepublish] Not a git repository; skipping git checks.");
         return;
      }
   } catch {
      console.log("[prepublish] Not a git repository; skipping git checks.");
      return;
   }

   // Check for uncommitted changes
   const status = runCapture("git", ["status", "--porcelain"]);
   const outputText = status.stdout.trim();

   if (!outputText) {
      console.log("[prepublish] Working tree clean. Nothing to commit.");
      return;
   }

   console.log("[prepublish] You have uncommitted changes:\n");
   console.log(outputText + "\n");

   const rl = readline.createInterface({ input, output });
   const message = (
      await rl.question(
         "[prepublish] Commit message (leave blank to abort publish): "
      )
   ).trim();
   await rl.close();

   if (!message) {
      console.error(
         "[prepublish] No commit message provided. Aborting publish."
      );
      process.exit(1);
   }

   console.log("[prepublish] Staging changes...");
   run("git", ["add", "."]);

   console.log("[prepublish] Committing...");
   run("git", ["commit", "-m", message]);

   console.log("[prepublish] Pushing to default remote...");
   run("git", ["push"]);

   console.log("[prepublish] Git push completed. Proceeding with publish.");
}

await main();
