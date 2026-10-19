# The Docket — How-To Video

An ~8-minute narrated onboarding video (1920×1080, 30 fps) built with [Remotion](https://www.remotion.dev). It covers setup, every tab, and the benefits for developers, project managers and executives. All UI is mocked in React with fictional data (ACME / `APP-142` etc.) — no real Jira content.

## Preview and edit

```bash
npm install
npm run dev        # opens Remotion Studio
```

- `src/HowToVideo.tsx` — scene order and per-scene durations (`SCENES`)
- `src/scenes/*.tsx` — one component per scene; narration lines are the `lines` prop on `TutorialScene`
- `src/ui.tsx` — shared mock-UI pieces (app window, cursor, spotlight, buttons)
- `src/theme.ts` — brand colors and fonts

Each scene is also registered on its own under **Scenes** in Studio.

## Voiceover

Narration text lives in `src/narration.ts` (one entry per scene). Audio is in `public/voiceover/<scene>.mp3`, voiced by ElevenLabs "Matilda – Knowledgeable, Professional" (`eleven_v4`). Each scene stretches its animations to fit its clip (`sceneSeconds` in `src/HowToVideo.tsx`), using lengths recorded in `src/voiceoverDurations.json`.

After editing a line, regenerate audio and durations:

```bash
ELEVENLABS_API_KEY=... node scripts/voiceover.mjs   # all scenes via the ElevenLabs API (ELEVENLABS_MODEL to override)
node scripts/voiceover.mjs --say                     # free macOS placeholder voice
node scripts/voiceover.mjs --durations               # just re-measure MP3s you replaced by hand
```

## Render

```bash
npx remotion render TheDocketHowTo out/the-docket-how-to.mp4
```

`out/` is git-ignored.

## Scenes

1. Intro · 2. What is The Docket · 3. Benefits by role · 4–7. Setup (install, Jira token & `.env`, optional `.env` settings incl. Company AI, open / install as app) · 8. Settings · 9. Finish setup & quick fixes · 10. Data security & approved AI · 11. Tab tour · 12. Task Management · 13. Combined Open Work · 14. Create Issue + AI Draft · 15. Week plan & 1:1 prep · 16. Download a task workbook · 17. Metrics & Executive Summary · 18. Project Managers (capacity, Gantt) · 19. Asks · 20. Chat · 21. Past Reports · 22. First-week checklist by role · 23. Outro
