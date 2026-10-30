// Writes CHAPTERS.md (and prints a YouTube-style list) from the real scene
// lengths in src/timing.ts, so the times match the rendered video.
//   npx tsx scripts/chapters.mjs
import { writeFileSync } from "node:fs";
import { chapterStarts, formatTime, totalSeconds } from "../src/timing.ts";

const rows = chapterStarts(30);
const list = rows.map((r) => `${formatTime(r.seconds)} ${r.title}`).join("\n");
const md = `# The Docket how-to video: chapters\n\nTotal length: ${formatTime(totalSeconds())}\n\n| Time | Chapter |\n| --- | --- |\n${rows
  .map((r) => `| ${formatTime(r.seconds)} | ${r.title} |`)
  .join("\n")}\n\nPaste-ready list:\n\n\`\`\`\n${list}\n\`\`\`\n`;
writeFileSync(new URL("../CHAPTERS.md", import.meta.url), md);
console.log(list);
