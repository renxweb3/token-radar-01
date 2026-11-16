// Token Radar, token-radar-01: the entrypoint the grader runs with Node 22.
//
// The snapshot (sealed JSON, or a directory that holds snapshot.json) comes in through
// --input; the model in lib/model.ts scores every pre-token protocol; the run assembles
// the output directory: the ranked board as board.json, the dashboard feed as data.js,
// verbatim copies of dashboard/ and screenshots/, and the judge's summary as
// dossier.json, built by the vendored make.fun library. Standard library only, no
// installs, no network. Outside the grading container, MAKEFUN_OUTPUT_DIR replaces
// /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath as urlToPath } from "node:url";
import {
  boardIssue as checkBoard,
  buildRadar as scoreSnapshot,
  dataScript as renderData,
  parseSnapshot as loadSnapshot,
} from "./lib/model.ts";
import { buildDossier as makeDossier } from "./vendor/makefun-board.ts";

const repoRoot = urlToPath(new URL("./", import.meta.url));
const dossierTextCap = 65536;
const shotCaps = { max: 4, maxBytes: 524288 };
const dashboardCaps = { maxFiles: 400, maxBytes: 4194304 };
const shotNamePattern = new RegExp("^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$");
const exitOk = 0;
const exitGate = 1;
const exitInput = 2;

/** The value of --<flag> <value> (or --<flag>=<value>), else the fallback. */
function flagValue(flag: string, fallback: string): string {
  const argv = process.argv;
  const wanted = "--" + flag;
  let found: string | null = null;
  for (let i = 2; i < argv.length && found === null; i += 1) {
    if (argv[i] === wanted && i + 1 < argv.length) {
      found = argv[i + 1] as string;
    }
  }
  const prefixed = wanted + "=";
  for (let i = 2; i < argv.length && found === null; i += 1) {
    const candidate = argv[i] as string;
    if (candidate.startsWith(prefixed)) {
      found = candidate.slice(prefixed.length);
    }
  }
  return found ?? fallback;
}

/** The snapshot file behind --input: the file itself, or snapshot.json inside the directory. */
function snapshotFile(rawInput: string): string {
  if (rawInput.endsWith(".json")) {
    return rawInput;
  }
  return path.join(rawInput, "snapshot.json");
}

/** The regular files of one directory, copied into another, skipping dotted names. */
function copyRegularFiles(sourceDir: string, targetDir: string): string[] {
  const copiedNames: string[] = [];
  if (!fs.existsSync(sourceDir)) {
    return copiedNames;
  }
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir)) {
    const sourcePath = path.join(sourceDir, entry);
    if (!entry.startsWith(".") && fs.statSync(sourcePath).isFile()) {
      fs.copyFileSync(sourcePath, path.join(targetDir, entry));
      copiedNames.push(entry);
    }
  }
  return copiedNames;
}

/** Score the snapshot and assemble the output directory; the exit code to leave with. */
function runEntry(): number {
  const inputRaw = flagValue("input", "/input");
  const inputPath = snapshotFile(inputRaw);
  if (!fs.existsSync(inputPath)) {
    process.stderr.write(
      "token radar: no snapshot at " + inputPath + ": pass --input <snapshot.json|directory> or mount the sealed /input\n",
    );
    return exitInput;
  }
  const outputDir = flagValue("output", process.env.MAKEFUN_OUTPUT_DIR ?? "/output");
  const snapshot = loadSnapshot(fs.readFileSync(inputPath, "utf8"));
  const { board, radar } = scoreSnapshot(snapshot);
  const problem = checkBoard(board, snapshot);
  if (problem !== null) {
    process.stderr.write("token radar: the model wrote a board the gate refuses: " + problem + "\n");
    return exitGate;
  }
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "board.json"), JSON.stringify({ rows: board }) + "\n");
  fs.writeFileSync(path.join(outputDir, "data.js"), renderData(radar));
  copyRegularFiles(path.join(repoRoot, "dashboard"), path.join(outputDir, "dashboard"));
  const shots = copyRegularFiles(path.join(repoRoot, "screenshots"), path.join(outputDir, "screenshots"));
  if (shots.length <= 2) {
    const plural = shots.length === 1 ? "" : "s";
    process.stderr.write(
      "token radar: screenshots/ holds " + shots.length + " image" + plural + ": hand in 3, the board, a detail view and a filtered view\n",
    );
    return exitGate;
  }
  for (const shot of shots) {
    if (!shotNamePattern.test(shot)) {
      process.stderr.write(
        "token radar: screenshots/" + shot + ": a name is letters, digits and . _ -, 1 to 128 characters\n",
      );
      return exitGate;
    }
  }
  const dossier = makeDossier(outputDir, {
    text_max_bytes: dossierTextCap,
    screenshots: { max: shotCaps.max, max_bytes: shotCaps.maxBytes },
    dashboard: { max_files: dashboardCaps.maxFiles, max_bytes: dashboardCaps.maxBytes },
  });
  fs.writeFileSync(path.join(outputDir, "dossier.json"), dossier);
  const headline =
    "token radar: " + snapshot.protocols.length + " protocols, " + snapshot.watchlist.length + " on the watchlist, " +
    board.length + " rows scored (" + radar.early_size + " early, " + radar.live_size + " live set aside)";
  const inventory =
    "token radar: wrote " + path.join(outputDir, "board.json") + ", " + path.join(outputDir, "data.js") + ", " +
    path.join(outputDir, "dashboard") + " (3 files), " + path.join(outputDir, "screenshots") + " (" + shots.length + " images) and " +
    path.join(outputDir, "dossier.json");
  process.stdout.write(headline + "\n" + inventory + "\n");
  return exitOk;
}

process.exitCode = runEntry();
