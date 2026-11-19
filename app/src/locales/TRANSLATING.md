# Translating PixelDoll

Write for game developers and pixel artists, including hobbyists. Use plain, friendly language and short labels. Read the component that shows an ambiguous message before translating it. Use sentence case where the language uses it, and keep accessibility names as clear as visible labels.

## What stays unchanged

Keep product and engine names, file extensions, format names, endpoints, request fields, stable IDs, shortcuts, and user-entered names and prompts unchanged. Do not translate generated prompts, saved default names, fixture contents, archive paths, manifest fields, serialized engine data or values sent to PixelLab. Only translate Studio display text, not the underlying value. Unknown vendor errors stay as received. Pre-Studio startup messages, site metadata, and developer-only diagnostics are outside the catalog.

## Term list

These are display terms, not substitutions inside the app's data. A move is an animation clip, not the action of moving an item. A slot is a place to equip an item. The rig is the setup that controls animation; the skeleton is the bones and joints in that rig. A layer is one stackable image, and a frame is one moment of animation. Paper doll describes interchangeable artwork aligned to the same base body, not a physical product.

| Concept        | es                | zh-Hans         | pt-BR            | ja                   | de               | fr                 | ko              | tr             | id                |
| -------------- | ----------------- | --------------- | ---------------- | -------------------- | ---------------- | ------------------ | --------------- | -------------- | ----------------- |
| Paper doll     | muñeco recortable | 纸娃娃          | boneco de papel  | 着せ替えキャラクター | Anziehfigur      | poupée à habiller  | 종이 인형       | kâğıt bebek    | boneka kertas     |
| Base body      | cuerpo base       | 基础身体        | corpo base       | 素体                 | Grundkörper      | corps de base      | 기본 몸체       | temel gövde    | tubuh dasar       |
| Layer          | capa              | 图层            | camada           | レイヤー             | Ebene            | calque             | 레이어          | katman         | lapisan           |
| Item           | objeto            | 装备            | item             | アイテム             | Gegenstand       | objet              | 아이템          | eşya           | item              |
| Outfit         | atuendo           | 套装            | traje            | コーディネート       | Outfit           | tenue              | 코디            | kıyafet        | setelan           |
| Slot           | ranura            | 装备栏          | espaço           | 装備スロット         | Ausrüstungsplatz | emplacement        | 장착 슬롯       | ekipman yuvası | slot perlengkapan |
| Move           | animación         | 动作            | animação         | モーション           | Animation        | animation          | 동작            | animasyon      | animasi           |
| Direction      | dirección         | 朝向            | direção          | 向き                 | Blickrichtung    | direction          | 방향            | yön            | arah              |
| Frame          | fotograma         | 帧              | quadro           | フレーム             | Frame            | image              | 프레임          | kare           | frame             |
| Rig / skeleton | rig / esqueleto   | 绑定结构 / 骨架 | rig / esqueleto  | リグ / スケルトン    | Rig / Skelett    | rig / squelette    | 리그 / 스켈레톤 | rig / iskelet  | rig / kerangka    |
| Pivot          | pivote            | 枢轴点          | pivô             | ピボット             | Drehpunkt        | pivot              | 피벗            | pivot noktası  | titik pivot       |
| Palette        | paleta            | 调色板          | paleta           | パレット             | Palette          | palette            | 팔레트          | palet          | palet             |
| Spritesheet    | hoja de sprites   | 精灵图集        | folha de sprites | スプライトシート     | Spritesheet      | feuille de sprites | 스프라이트 시트 | sprite sayfası | sprite sheet      |
| Manifest       | manifiesto        | 清单            | manifesto        | マニフェスト         | Manifest         | manifeste          | 매니페스트      | manifest       | manifes           |
| Token          | token             | 令牌            | token            | トークン             | Token            | jeton              | 토큰            | belirteç       | token             |

## Language and formatting rules

- Address the user consistently: Spanish `tú`, Brazilian Portuguese `você`, German `du`, French `vous`, Turkish polite imperatives, Indonesian `Anda`, Japanese です/ます, and Korean 해요체. Simplified Chinese generally omits the subject where it is clear.
- Keep placeholders intact and do not attach a Korean particle or a Turkish suffix to an unknown value. Rewrite the sentence instead. Placeholders can be reordered. A placeholder for a link or emphasized fragment can move with the phrase, without adding HTML.
- For cardinal counts use `one`/`other` for English, Spanish, Brazilian Portuguese, German, French and Turkish, and `other` for Simplified Chinese, Japanese, Korean and Indonesian. Add exact-value forms only where the phrase needs them. Every form must keep the displayed number (`{count}` or `{n}`). With `{n}`, the app formats the number before interpolation. Use appropriate counters in Japanese and Chinese, such as `{count}個` and `{count} 个`.
- In French use a narrow no-break space before `; ! ?` and inside « », and a no-break space before `:`. Chinese and Japanese use full-width punctuation and no artificial spaces between words.
- Use glossary JSON only to pin a complete approved message, not to try to enforce a word inside longer prose. Supply exact key paths from the English source.

## Update and review

Reuse an existing key when the meaning, grammatical role, placeholders and plural behavior are the same, even across screens. Check all locale values before merging. Keep separate keys for different meanings, compact variants and accessibility labels that need different wording, even if the English strings match.

Use `en.json` as the source. Stage only missing or revised keys for one language at a time in a temporary JSON file outside `src/locales`, then run `npx svelte-whisper apply <id> <file>` from `app/`. Run `npx svelte-whisper check --usage src` and independently check every plural form and placeholder, every required catalog, and any intentionally identical messages. An independent second reader checks every key against its English source and UI context, including costs, warnings, and terms; a third reader resolves disagreements. Check long labels and live language switching in the browser rather than shortening a message at the expense of its meaning.
