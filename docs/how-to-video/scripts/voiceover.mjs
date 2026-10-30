// Generates public/voiceover/<scene>.mp3 for every entry in src/narration.ts
// and writes src/voiceoverDurations.json, which sets each scene's length.
//
//   node scripts/voiceover.mjs                 # ElevenLabs if ELEVENLABS_API_KEY is set, else macOS `say`
//   node scripts/voiceover.mjs --say           # force the local macOS voice (free placeholder)
//   node scripts/voiceover.mjs --durations     # only re-measure existing MP3s
//   node scripts/voiceover.mjs --only intro,overview   # redo just these scenes
//
// Needs ffmpeg/ffprobe on PATH.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const outDir = join(root, "public/voiceover");
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "XrExE9yKIg1WjnnlVkGX"; // "Matilda – Knowledgeable, Professional"

const src = readFileSync(join(root, "src/narration.ts"), "utf8");
const narration = Object.fromEntries(
  [...src.matchAll(/^\s+(\w+):\s*\n?\s*"((?:[^"\\]|\\.)*)",?$/gm)].map((m) => [m[1], m[2]]),
);

const args = new Set(process.argv.slice(2));
const onlyArg = process.argv.find((a, i) => process.argv[i - 1] === "--only");
const only = onlyArg ? new Set(onlyArg.split(",")) : null;

// Spoken spellings, so the voice says the name right ("DOCK-it", not "DECK-et").
const pronounce = (text) => text.replace(/\bDocket\b/g, "Dockit");
const useSay = args.has("--say") || !process.env.ELEVENLABS_API_KEY;
mkdirSync(outDir, { recursive: true });

const elevenlabs = async (text, file) => {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL ?? "eleven_v4" }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
};

const say = (text, file) => {
  const aiff = file.replace(/\.mp3$/, ".aiff");
  execFileSync("say", ["-v", "Samantha", "-r", "175", "-o", aiff, text]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", aiff, "-ar", "44100", "-b:a", "160k", file]);
  rmSync(aiff);
};

if (!args.has("--durations")) {
  for (const [key, text] of Object.entries(narration)) {
    if (only && !only.has(key)) continue;
    const file = join(outDir, `${key}.mp3`);
    console.log(`${useSay ? "say" : "elevenlabs"} → ${key}`);
    if (useSay) say(pronounce(text), file);
    else await elevenlabs(pronounce(text), file);
  }
}

const durations = {};
for (const key of Object.keys(narration)) {
  const file = join(outDir, `${key}.mp3`);
  if (!existsSync(file)) continue;
  const out = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file,
  ]).toString();
  durations[key] = Math.round(parseFloat(out) * 100) / 100;
}
writeFileSync(join(root, "src/voiceoverDurations.json"), JSON.stringify(durations, null, 2) + "\n");
console.log(durations);
