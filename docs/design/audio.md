# Studio audio

PixelDoll's soundtrack and all nine interface cues are original synthesizer compositions dedicated under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). The code uses the repository's
[MIT license](../../LICENSE).

- [Studio Ambient](../../app/src/studio/audio/studio-ambient.mp3) is a 2:40 mono composition with six varied phrases,
  soft pads, and occasional plucked notes. It plays continuously across light and dark mode changes. Run
  `node scripts/render-studio-music.mjs` from `app/` with FFmpeg on PATH to render it from the
  [original score](../../app/scripts/render-studio-music.mjs).
- Hover, press, equip, unequip, recolor, item completion, generation success, generation failure, and export are
  all synthesized from the [cue definitions](../../app/src/studio/audioCues.ts). The two earlier short theme
  loops were also synthesized in PixelDoll.

## Playback

The Studio controller manages preferences, user activation, and visibility. The [playback module](../../app/src/studio/audioPlayback.ts)
loads after a trusted gesture with an audible channel. Music downloads and decodes only when music is enabled at a
nonzero level in the foreground. Each cue is synthesized on its first use and reuses that buffer. The PWA verifies
and caches both the playback module and the music on demand. The first offline session can play them if matching
bytes were previously cached. If the first gesture happens offline before the playback module is cached, reconnect and reload to enable audio.
The 0.96 MB mono MP3 decodes to about 31 MB at a 48 kHz device rate while loaded.

Pitch varies by up to 24 cents for hover and press, and 12 cents for semantic cues. Gain varies only downward,
with extra attenuation and a 400 ms minimum interval for hover. Each play applies one pitch and gain change to the
whole cue so its note intervals remain recognizable. At most four cues overlap, and control cues give way to
semantic feedback. Music keeps its original pitch and level. Separate controls and restrained audio help keep
foreground speech and user feedback clear. [Web Audio spec](https://www.w3.org/TR/webaudio/#AudioBufferSourceNode)
· [Xbox audio accessibility guidance](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/105)
· [Foley et al. on auditory interface annoyance](https://doi.org/10.1121/10.0010447)

## Longer listening and future tracks

Quiet dynamics, no lyrics, and rests between melodic accents give the soundtrack room to recede during editing.
The duration is a listening target. A longer track can still become tiring if a conspicuous motif keeps returning.
Audition a 15–20 minute editing session at the default settings on headphones and speakers, and note where the
music pulls attention or the user reaches for mute. If more tracks are added, start with a remembered manual
choice. Consider optional shuffle with each track played once per cycle, a skip control, and matched loudness
once there are enough tracks for variety. [Instrumental music and cognitive tasks](https://pmc.ncbi.nlm.nih.gov/articles/PMC10162369/)
· [Research on self-selected game music](https://doi.org/10.1177/102986490901300207)

CC0 listening candidates for future work include [First Light Particles](https://opengameart.org/node/182244),
[Sunset Plains](https://opengameart.org/content/sunset-plains), [Osmotic Memory](https://opengameart.org/content/osmotic-memory),
and [Sunset Walk](https://opengameart.org/content/sunset-walk-ambient-quiet-sweet-loop) for music, and Kenney's
[Interface Sounds](https://kenney.nl/assets/interface-sounds) and [Digital Audio](https://kenney.nl/assets/digital-audio)
for effects. The links are the original uploads or publisher pages with their license declarations. Studio currently
uses its own original audio.
