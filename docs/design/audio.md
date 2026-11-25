# Studio audio

## Sources and recipes

PixelDoll created all shipped audio from scratch. Both synthesizers are code in this repository. They
use mathematical oscillators and envelopes, with no samples, presets, soundfonts, or music-generation
service. [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) is PixelDoll's dedication
of the compositions and recordings, with no attribution required. The source code uses the repository's
[MIT license](../../LICENSE).

- [Studio Ambient](../../app/src/studio/audio/studio-ambient.mp3) comes from the original
  [score and Node.js renderer](../../app/scripts/render-studio-music.mjs). The score specifies chord
  voicings, note timing, and strength. The renderer layers soft sine-based harmonics, slight drift,
  and delayed pluck reflections into mono PCM. [FFmpeg](https://ffmpeg.org/) encodes that PCM as a
  24 kHz, 48 kbps MP3. To change the track, edit the score and run
  `node scripts/render-studio-music.mjs` from `app/` with FFmpeg and its `libmp3lame` encoder on PATH.
- All nine effects come from [audioCues.ts](../../app/src/studio/audioCues.ts). Edit the cue's note
  tuples (start in seconds, MIDI pitch, duration in seconds, and strength) to change its contour.
  The browser synthesizes a 24 kHz mono buffer using sine harmonics, a smooth attack and release,
  and exponential decay. Trigger the corresponding action in Studio to audition the result.
- The retired Obsidian and Porcelain loops were made the same way, from original note definitions
  and waveform code. Their last source is available with
  `git show d2f58375b:app/src/studio/audioPlayback.ts`.

## Sound design

Music should feel like a quiet, warm workshop while the character stays the focus. Studio Ambient
uses gently evolving pads and sparse, rounded plucks around a D tonal center. Its 48 bars in 4/4
at 72 BPM run for 2:40. Six eight-bar phrases change voicings, accent placement, and rests while
keeping a steady pulse and intensity. Keep future tracks instrumental and low-key. Avoid sharp
percussion, prominent hooks, and dramatic swells. Use the same music across light and dark themes.

Effects should feel like soft, tonal feedback. Frequent gestures get the shortest cues. Completed
actions can carry a clearer contour, and completion and failure should remain distinguishable
at a quiet level.

| Cue                | Intention and contour                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| Hover              | A short, faint high note for pointer entry.                                  |
| Press              | A lower, soft tap for control activation.                                    |
| Equip and unequip  | A rising two-note interval for wear and the reverse for removal.             |
| Recolor            | A light rising three-note accent for a committed palette change.             |
| Item completion    | A rounded rising triad when usable item artwork is ready.                    |
| Generation success | A longer rising four-note phrase for a completed workflow.                   |
| Generation failure | A descending two-note phrase, distinct from success.                         |
| Export             | A spaced, rising three-note phrase when the file is handed off for download. |

## Playback and fatigue

The Studio controller manages preferences, user activation, and visibility. The [playback module](../../app/src/studio/audioPlayback.ts)
loads after a trusted gesture with an audible channel and uses a shared Web Audio context with
independent music and effects gain controls. Music downloads and decodes when enabled at a nonzero
level in the foreground. Each cue is synthesized on first use and its buffer is reused. Both sliders
default to 50%, the reference listening position for each channel. At that position, music keeps
its previous 20% setting's gain and effects keep their previous 35% setting's gain. The sliders retain
their original maximum gains and independent switches. Saved slider numbers use the new curve,
so a previously saved mix can play more quietly. The PWA verifies and caches the module and MP3
on demand. If the first gesture happens offline before the module is cached,
reconnect and reload to enable audio. The 0.96 MB MP3 decodes to about 31 MB at a 48 kHz device rate.

For effects, reduce how often cues fire and how loud they are first. Studio throttles hover to once
per 400 ms, attenuates it further, and caps overlap at four voices. Action cues take priority over
hover and press. Each play detunes the whole cue by up to ±24 cents for hover and press, or ±12 cents
for action cues. Gain can decrease by up to 14% or 6%, respectively. That preserves the cue's intervals
and meaning without loud outliers. If rapid browsing still feels busy, compare against silent hover
before widening randomization. [Web Audio spec](https://www.w3.org/TR/webaudio/#AudioBufferSourceNode)
· [Xbox audio accessibility guidance](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/105)
· [Foley et al. on auditory interface annoyance](https://doi.org/10.1121/10.0010447)

Match perceived loudness among cues with similar jobs and keep quieter tiers for frequent feedback.
The synthesized cues other than hover measured within 2.8 dB of each other by full-cue RMS before
channel gain and per-play variation. Hover measured about 9 dB below press after its fixed trim.
RMS helps spot outliers and peaks help check headroom. Compare short cues by ear in context because
duration, frequency, and envelope affect perceived loudness. Broadcast loudness targets use
measurement windows longer than the 45 ms hover cue. [EBU loudness measurement windows](https://tech.ebu.ch/docs/tech/tech3343v3_0.pdf)

For music, start with quiet, evolving phrases and space between lead notes. Studio already uses
this approach and keeps music pitch fixed. Target **2–4 minutes per loop**, with 3–4 minutes a
reasonable starting point for the next track. This is a design target for auditioning. A prominent
motif can wear out even in a long piece. Compare 15–20 minutes of ordinary dressing and recoloring
at the default mix on headphones and speakers. Listen for a predictable restart, a distracting
phrase, or the urge to mute. Sustained listening fatigue still needs validation in Studio.
[Instrumental music and cognitive tasks](https://pmc.ncbi.nlm.nih.gov/articles/PMC10162369/)

## Looping and additional tracks

Fade in when playback starts or resumes. Studio already applies a 650 ms gain ramp for that.
Studio Ambient also has a 4.2-second fade-in and a 7-second fade-out baked into the MP3, so every
repetition dips in level. For the next revision, compose a continuous end-to-start transition.
Carry pad and reflection tails across the seam or use a short overlap when needed. Check the actual
decoded asset for clicks, gaps, and obvious restarting phrases. Keep the runtime entrance fade and
prompt mute behavior. If a deliberate stop clicks in listening tests, use a short gain release.
Keep fades or crossfades for track changes where they help, matching the
tracks' perceived loudness. [Wwise music segment and transition guide](https://www.audiokinetic.com/download/documents/WwiseProjectAdventure_en.pdf)

Audition a second track against the revised loop. If both work in Studio, offer a remembered manual
choice first. With a larger catalog, consider optional shuffle that plays each track once per cycle,
avoids immediate repeats, and lets users skip. [Research on self-selected game music](https://doi.org/10.1177/102986490901300207)
· [Second soundtrack and loop review](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=317667275)

## Future asset rights

Use original synthesis or obtain explicitly CC0 assets directly from their source. Record the
source URL or original project, author or generator, license and date, and any edits used to create
the shipped file. Both the composition and the recording need to be clear for standalone
redistribution and unrestricted downstream use.

Earlier hosted generator research, checked November 25, 2026:

- **Suno.** Free/Basic output is limited to personal, noncommercial use. Pro/Premier assigns rights
  Suno owns for qualifying output and allows commercial use of permitted downloads under its terms.
  Suno does not guarantee copyright in the output. Its published terms do not expressly confirm a
  CC0 release of the source audio. Verify the exact release and downstream reuse in writing before
  choosing it for PixelDoll. [Suno Terms of Service](https://suno.com/terms)
- **Eleven Music.** Media rights and attribution depend on the plan. The terms require written
  authorization to make output available as a music library for others to download or reuse.
  Treat a reusable CC0 asset release as unconfirmed under the public terms and obtain written
  permission for that use before choosing it. [ElevenLabs Music Terms](https://elevenlabs.io/music-terms)

[Local synthesis tools follow-up](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=317667450)

CC0 listening candidates for future work include [First Light Particles](https://opengameart.org/node/182244),
[Sunset Plains](https://opengameart.org/content/sunset-plains), [Osmotic Memory](https://opengameart.org/content/osmotic-memory),
and [Sunset Walk](https://opengameart.org/content/sunset-walk-ambient-quiet-sweet-loop) for music, and Kenney's
[Interface Sounds](https://kenney.nl/assets/interface-sounds) and [Digital Audio](https://kenney.nl/assets/digital-audio)
for effects. The links are the original uploads or publisher pages with their license declarations. Studio currently
uses its own original audio.
