# Studio audio

PixelDoll synthesizes its Studio audio from the original note sequences and
waveform settings in [audioPlayback.ts](../../app/src/studio/audioPlayback.ts).
The source is covered by the repository's [MIT license](../../LICENSE).
The synthesizer uses Web Audio and loads as a lazy app module. It creates its
own buffers without downloading samples or other audio assets.

The dark theme uses a slow D minor loop with sustained chords and a sparse
bell melody. The light theme uses a quicker G major loop with soft plucked
notes. When the theme changes, the old loop fades out before the new one
starts. A loop pauses when the page is hidden or music is disabled and
resumes from the same position if the theme stays the same.

Interface cues use one bell-like voice with different patterns. Hover and
press make the shortest sounds. Raising and lowering pairs distinguish
equipping from unequipping. Recoloring, item completion, success, failure,
and export each have their own short phrase.
