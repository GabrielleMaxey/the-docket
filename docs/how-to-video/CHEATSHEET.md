# How-to video cheat sheet

Run everything from `docs/how-to-video` unless noted. Scene keys: `intro contents overview multiSpace install credentials envOptions openApp settings navigate taskManagement combinedWork createIssue weekPlan reports pmAsks chat dataSecurity recap outro`.

## Preview (no rendering)

| Goal | Command |
| --- | --- |
| Open Remotion Studio (scrub live, narration plays) | `npm run dev` |
| Full video in Studio | pick **TheDocketHowTo** |
| One scene alone (silent, authored length) | pick it under **Scenes**, or open `npx remotion studio` and use ids like `Intro`, `MultiSpace`, `CreateIssue` |
| List composition ids | `npx remotion compositions src/index.ts` |
| Type-check and lint | `npm run lint` |

Edits to code and `src/voiceoverDurations.json` reload in Studio. After replacing an MP3, refresh the browser. If timings look stale, stop and restart `npm run dev`.

## Render

| Goal | Command |
| --- | --- |
| Full video | `npx remotion render TheDocketHowTo out/the-docket-how-to.mp4` |
| Faster draft (half size) | `npx remotion render TheDocketHowTo out/draft.mp4 --scale=0.5` |
| Only a frame range (30 fps, so 30 frames = 1 s) | `npx remotion render TheDocketHowTo out/clip.mp4 --frames=900-1500` |
| One still frame (check a layout) | `npx remotion still src/index.ts MultiSpace out/shot.png --frame=540` |
| Limit CPU use | add `--concurrency=4` |
| Audio only | `npx remotion render TheDocketHowTo out/audio.mp3 --codec=mp3` |

Seconds to frames: multiply by 30. The video is 1920x1080 at 30 fps. `out/` is git-ignored.

## Narration (ElevenLabs)

```bash
export ELEVENLABS_API_KEY=$(grep ELEVENLABS_API_KEY .env.local | cut -d= -f2-)
node scripts/voiceover.mjs                               # all 20 scenes
node scripts/voiceover.mjs --only intro,overview         # just these scenes
node scripts/voiceover.mjs --durations                   # re-measure MP3s, no ElevenLabs call
node scripts/voiceover.mjs --say                         # free macOS voice (placeholder)
```

- Text: `src/narration.ts`. Audio: `public/voiceover/<scene>.mp3`. Lengths: `src/voiceoverDurations.json`.
- Spoken spellings (for example Docket → Dockit) live in `pronounce()` in `scripts/voiceover.mjs`.
- Mid-sentence pause when re-recording: add `<break time="1.0s" />` to that scene's text, then re-record it with `--only`.
- Never commit `.env.local` (the API key).

## Timing and pauses

All in `src/timing.ts`:

- `VOICE_LEAD` (0.6 s): silence before each narration starts.
- `VOICE_TAIL` (0.9 s): silence after each narration ends. Raise it for a longer pause between scenes.
- `SCENE_LIST` `seconds`: minimum scene length. A scene is never shorter than this, so raise it to hold a scene on screen longer than its narration.
- `TRANSITION_SECONDS` (0.6 s): crossfade/slide length.

After changing timing or audio, refresh the chapter list, then render:

```bash
npx --yes tsx scripts/chapters.mjs      # rewrites CHAPTERS.md, prints the paste-ready list
```

## Edit audio with ffmpeg

Back up a clip first: `cp public/voiceover/credentials.mp3 credentials.orig.mp3` (keep the backup outside `public/voiceover/`).

| Goal | Command |
| --- | --- |
| Clip length | `ffprobe -v error -show_entries format=duration -of csv=p=0 public/voiceover/intro.mp3` |
| Add 1 s silence at the start | `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t 1 gap.mp3 && printf "file 'gap.mp3'\nfile 'intro.mp3'\n" > list.txt && ffmpeg -y -f concat -safe 0 -i list.txt -c:a libmp3lame -b:a 128k out.mp3` |
| Add 1 s silence at the end | same, but list `intro.mp3` first, then `gap.mp3` |
| Pause inside a clip (here 1 s at 12.5 s) | `ffmpeg -y -i orig.mp3 -t 12.5 a.mp3`, `ffmpeg -y -i orig.mp3 -ss 12.5 b.mp3`, make `gap.mp3` as above, concat `a gap b` |
| Trim the start (cut 0.3 s) | `ffmpeg -y -ss 0.3 -i in.mp3 -c:a libmp3lame -b:a 128k out.mp3` |
| Louder or quieter (+3 dB) | `ffmpeg -y -i in.mp3 -af volume=3dB out.mp3` |
| Even out loudness | `ffmpeg -y -i in.mp3 -af loudnorm out.mp3` |
| Speed up 5% (keeps pitch) | `ffmpeg -y -i in.mp3 -af atempo=1.05 out.mp3` |

After replacing any MP3 run `node scripts/voiceover.mjs --durations`, then `npx --yes tsx scripts/chapters.mjs`.

## Edit the finished mp4 with ffmpeg

| Goal | Command |
| --- | --- |
| Replace the audio only (no video re-encode) | `ffmpeg -y -i video.mp4 -i new-audio.mp3 -map 0:v -map 1:a -c:v copy -shortest out.mp4` |
| Cut a section (fast, at keyframes) | `ffmpeg -y -ss 60 -to 120 -i video.mp4 -c copy clip.mp4` |
| Smaller file for sharing | `ffmpeg -y -i video.mp4 -c:v libx264 -crf 26 -preset slow -c:a aac -b:a 128k small.mp4` |
| Pull the audio track | `ffmpeg -y -i video.mp4 -vn -c:a copy audio.aac` |
| Screenshot at 1:30 | `ffmpeg -y -ss 90 -i video.mp4 -frames:v 1 shot.png` |
| Duration, size, codecs | `ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height -of default=nw=1 video.mp4` |

## Publish checklist

1. Edit narration, timing or scenes.
2. `node scripts/voiceover.mjs --only <scenes>` (or `--durations` after manual audio edits).
3. `npx --yes tsx scripts/chapters.mjs`.
4. Preview in Studio (`npm run dev`), then render.
5. Commit `public/voiceover`, `src/voiceoverDurations.json`, `CHAPTERS.md` and any code changes. Paste the chapter list into the video description.
