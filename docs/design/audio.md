# Studio audio

## Sources and recipes

PixelDoll created all shipped audio from scratch. Both synthesizers are code in this repository. They
use mathematical oscillators and envelopes, with no samples, presets, soundfonts, or music-generation
service. [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) is PixelDoll's dedication
of the compositions and recordings, with no attribution required. The source code uses the repository's
[MIT license](../../LICENSE).

- [Studio Ambient](../../app/src/studio/audio/studio-ambient.flac) comes from the original
  [score and Node.js renderer](../../app/scripts/render-studio-music.mjs). The score specifies chord
  voicings, note timing, and strength. The renderer layers soft sine-based harmonics, slight drift,
  and delayed pluck reflections into mono PCM. [FFmpeg](https://ffmpeg.org/) encodes that PCM as a
  24 kHz, 16-bit mono FLAC. To change the track, edit the score and run
  `node scripts/render-studio-music.mjs` from `app/` with FFmpeg on PATH.
- All eight effects come from [audioCues.ts](../../app/src/studio/audioCues.ts). Edit the cue's note
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
default to 50%, the reference listening position for each channel. After listening feedback on a
physical Pixel 8 Pro, both reference gains rose by 10 dB to 0.05761 for music and 0.13796 for effects.
This keeps their gain ratio at the midpoint. A smooth taper runs from silence through each reference
to a maximum of 0.40 for music and 0.25 for effects. The measured assets leave about 1.9 dB of margin
even if four copies of the highest-peak effect align with the music's peak at maximum settings.
The Characters, New character, and Customize top bars show the Audio shortcut while Music or Sound
effects is enabled at a nonzero volume. On Characters it sits to the left of New character when
that action is in the top bar. When both channels are silent, the shortcut takes up no space and
Audio remains available through Settings. From New character, Settings opens over the live creator
and closing it reveals the same draft.
The PWA verifies and caches the module and soundtrack
on demand. If the first gesture happens offline before the module is cached,
reconnect and reload to enable audio. The 1.42 MB FLAC decodes to about 31 MB at a 48 kHz device rate.

For effects, reduce how often cues fire and how loud they are first. Pointer movement alone is
silent. Studio rate-limits control presses, caps overlap at four voices, and gives action cues
priority over presses. Random look, Wardrobe Random, and Colors Random use the recolor cue so
randomized edits sound distinct from manually equipping an item.
Each play detunes the whole cue by up to ±10 cents for press or ±12 cents
for action cues. Gain can decrease by up to 14% or 6%, respectively. This preserves the cue's
intervals without loud outliers. [Web Audio spec](https://www.w3.org/TR/webaudio/#AudioBufferSourceNode)
· [Xbox audio accessibility guidance](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/105)
· [Foley et al. on auditory interface annoyance](https://doi.org/10.1121/10.0010447)

Match perceived loudness among cues with similar jobs and keep quieter tiers for frequent feedback.
The synthesized cues measured within 2.8 dB of each other by full-cue RMS before
channel gain and per-play variation. The previous 50% mix measured about −55 LUFS for music and
−36 to −40 dBFS for effects over their loudest 50 ms. In Brave on the Pixel 8 Pro, that midpoint
was too quiet, and the old 100% mix felt only slightly louder than the desired default.
At the current 50% reference the music measures about −45 LUFS
integrated, and the cues measure about −26 to −30 dBFS over their loudest 50 ms. RMS helps spot
outliers and peaks help check headroom. These are digital measurements. The device's media volume
and output determine the sound level at the listener. Treat the current midpoint as the reference
to audition, with device media volume held fixed. The new levels have been verified digitally and
still need a listening check on the Pixel. Compare short cues by ear in context because
duration, frequency, and envelope affect perceived loudness. Broadcast loudness targets use
measurement windows longer than many Studio cues. [EBU loudness measurement windows](https://tech.ebu.ch/docs/tech/tech3343v3_0.pdf)

For music, start with quiet, evolving phrases and space between lead notes. Studio already uses
this approach and keeps music pitch fixed. Target **2–4 minutes per loop**, with 3–4 minutes a
reasonable starting point for the next track. This is a design target for auditioning. A prominent
motif can wear out even in a long piece. Compare 15–20 minutes of ordinary dressing and recoloring
at the default mix on headphones and speakers. Listen for a predictable restart, a distracting
phrase, or the urge to mute. Sustained listening fatigue still needs validation in Studio.
[Instrumental music and cognitive tasks](https://pmc.ncbi.nlm.nih.gov/articles/PMC10162369/)

## Looping and additional tracks

**Apply playback fades in the app.** Use a 650 ms gain ramp when the listener starts or resumes
music and a 50 ms release for a foreground mute. When the tab loses focus or visibility, audio
stops immediately. Keep note attacks, releases, and overlapping musical tails in the asset.
Leave whole-track entry and exit fades out of looping assets, so the gain ramp runs once per
playback start and the music continues at its current level through every repeat.

**Render one continuous musical period.** Studio Ambient carries the closing pad into the
opening phrase. The renderer wraps notes and reflections that extend past the last sample into
the start. FLAC preserves that exact period without the encoder delay or padding that MP3
players may handle differently. Studio's Web Audio source repeats its decoded buffer directly.
The browser regression renders across the boundary offline and checks sample continuity,
duration, and level. A standalone player's repeat mode can still insert a pause if it reopens
the file. Listen across a joined tail and head or use Studio itself to evaluate the transition.
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
