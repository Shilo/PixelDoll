# Ecosystem search log (2026-11-07 cycle)

Query and coverage log for the external-ecosystem and vocabulary pass. Findings and rankings are in [ecosystem.md](ecosystem.md). Before searching, the earlier surveys were read so this pass targets new or missed material: [tool review](../tool-review-2026-11-06.md), [repository review](../paperdoll-repos-review-2026-10-27.md), [modern sprite sources](../deep-paperdoll-modern-sprite-sources-2026-11-06.md), [native follow-up](../deep-paperdoll-native-followup-2026-11-06.md), [tools survey](../tools/paperdoll_tools_survey.md), plus the vision, provider and game surveys they link. URLs already cited there were extracted and treated as duplicates.

Channels: WebSearch (standard and extended modes), WebFetch of project pages, arXiv abstracts and HTML papers, and shallow `git clone` of public repositories into `C:/Programming_Files/Shilocity/PixelLab/checkouts/cycle-2026-11-07/ecosystem/` (outside the repository). Marketing pages and search-engine summaries establish leads only. All searches ran on 2026-11-07.

## Query log

| Family | Channel | Query (abridged) | Useful new results | Excluded duplicates | Remaining gap |
| --- | --- | --- | --- | --- | --- |
| Layer decomposition | WebSearch | Qwen-Image-Layered RGBA layers | [Qwen-Image-Layered repo](https://github.com/QwenLM/Qwen-Image-Layered), [arXiv 2512.15603](https://arxiv.org/abs/2512.15603) | none | Weights not run (GPU, not an allowed model) |
| Layer decomposition | WebSearch, WebFetch | LayerD raster design decomposition | [LayerD (ICCV 2025)](https://cyberagentailab.github.io/LayerD/), [arXiv 2509.25134](https://arxiv.org/abs/2509.25134) | none | Matting model not run |
| Layer decomposition, amodal | WebSearch extended | anime single-image layer decomposition, occlusion completion | [See-through (SIGGRAPH 2026)](https://github.com/shitagaki-lab/see-through), [arXiv 2602.03749](https://arxiv.org/abs/2602.03749) | none | Full paper HTML not read; pipeline not run |
| Layer decomposition | WebSearch | LayerDiffuse latent transparency | [LayerDiffuse](https://github.com/lllyasviel/LayerDiffuse), [arXiv 2402.17113](https://arxiv.org/abs/2402.17113) | none | Generation model, rejected |
| Pixel-art decomposition | WebSearch extended | pixel art sprite decomposition into layers or parts | [spritesplit](https://github.com/kotebibo/spritesplit), [PixelART arXiv 2609.22789](https://arxiv.org/abs/2609.22789), [Fast Sprite Decomposition](https://github.com/CyberAgentAILab/sprite-decompose), MarioNette | none | PixelART has no code link |
| Pixel-art segmentation | WebSearch | pixel art segmentation dataset sprite parts | [APES](https://github.com/zhan-xu/APES), Coutinho and Chaimowicz sprite GAN, ChildlikeSHAPES | APES and Sprite Sheet Diffusion were listed in an older reference table only | No public pixel-art part-segmentation dataset found |
| Sprite animation research | WebSearch extended | pixel art inbetweening correspondence 2025 2026 | [DeepInterframes arXiv 2610.27253](https://arxiv.org/abs/2610.27253), arXiv 2610.16423, SketchBetween | Sprite Sheet Diffusion | Neither 2026 preprint evaluates layered equipment |
| Drawing order | WebSearch | drawing order inference pseudo-depth front/back hair | See-through pseudo-depth; Live2D, Toon Boom, Spine clipping practice threads | Spine clipping (covered) | No pixel-art drawing-order learner found |
| AI sprite tools | WebSearch extended | AI sprite generator layered equipment armor weapon 2026 | [FrameSprite](https://www.framesprite.com/), [Spriteflow](https://spriteflow.io/), SEELE guide, PromptBase prompt, SpriteLab | Retro Diffusion, Ludo, Scenario, Sprite-AI, AutoSprite, Layer, God Mode | None documents per-item layer export |
| AI sprite tools | WebSearch extended, WebFetch | outfit swap keep animation frames pixel art 2026 | [MagicPixel](https://magicpixel.art/pixel-art-editor), Pixie.haus, Sprixen, SpriteCook, Mage | AutoSprite wardrobe | Paid flows untested |
| AI sprite tools | WebFetch | [Ludo comparison, November 2026](https://ludo.ai/compare/best-ai-pixel-art-generators), [Cinevva guide, September 2026](https://app.cinevva.com/guides/ai-pixel-art-generators) | Eight and nine tools compared; none claims layered or equipment output | PixelLab, Retro Diffusion, Scenario | Third-party, partly competitor-authored |
| AI sprite tools | WebSearch extended | Retro Diffusion 2026 features | RD Pro style references, Advanced Animations, MCP and Claude Code plugin mentions | Retro Diffusion API examples | No official 2026 changelog found |
| AI sprite tools | WebSearch | God Mode AI 2026 outfit layered export | Vendor claim of layered Spine export with separated body parts | God Mode (October survey) | Export not inspected (paid credits) |
| Try-on | WebSearch | pixel art virtual try-on low resolution sprite | Only photographic try-on services | ViViD, IDM-VTON, HR-VITON | No low-resolution sprite try-on work exists in results |
| Modular systems | WebSearch extended | Godot 4 paper doll addon equipment layers | [custom-sprite-2d](https://github.com/lucimoon/custom-sprite-2d), [paperdoll-25d](https://github.com/Fred4R/paperdoll-25d), godot-paper-doll, miniquest PR, Selodev equipment, PipeDoll | rapidlpc, Willyxz farmer paper doll, Mana Seed | None adds a new export contract |
| Modular systems | WebSearch | layered/modular sprite generator export JSON layer order | [Top Down Sprite Maker](https://github.com/jbunke/tdsm), [SpriteBat](https://fatbatstudio.itch.io/spritebat), ModuSprite, lpcg | LPC generator | TDSM is source-available under an EULA |
| Amodal completion | WebSearch | amodal completion cartoon occluded part | SemLayer arXiv 2603.24039, Open-World Amodal Appearance Completion (CVPR 2025), Multi-Agent Amodal Completion | See-through | All photographic or icon scale |
| Game devlogs | Repository grep only | Ultima, Diablo II COF, Ragnarok ACT, Tibia masks, Habbo | none new | All covered in `docs/research/games/` and SHARED_NOTES | Not re-searched; existing coverage judged saturated |

## New vocabulary

| Term | Why it matters | Status |
| --- | --- | --- |
| Image-to-layers (I2L) decomposition | Current name for splitting a flattened image into ordered RGBA layers; finds Qwen-Image-Layered, PixelART, LayerD | Investigated; models rejected, evaluation ideas kept |
| RGBA-VAE / latent transparency | Generators that emit alpha directly | Investigated; not an allowed route |
| Top-layer matting | LayerD's iterative peel of unoccluded layers, then background completion | Investigated (source read) |
| Flat-color region snapping | LayerD keeps exact-color connected components whose overlap with a soft mask exceeds a threshold | Investigated; candidate for extraction |
| Merge-tolerant layer metric (DTW plus merge edits) | Scores decompositions whose layer granularity differs from ground truth | Investigated (source read) |
| Pseudo-depth drawing order | See-through infers per-pixel depth, then orders parts by median depth | Investigated; candidate for front/back split |
| Depth-cluster part split | See-through splits one part (hair) into front and back by 2-means on per-pixel depth | Investigated (source read) |
| Bootstrapped layer supervision | See-through derives labels from rigged Live2D models; analog here is LPC layered sheets | Replayed for dye ramps |
| Ramp chaining / mutual-best adjacency | spritesplit links palette colors one lightness step at a time using spatial adjacency | Replayed |
| Topological outline detection | Outline is a color band that hugs the silhouette and stops, not "the darkest color" | Replayed |
| Sel-out | Selective outlining, a darker edge without one outline color | Read; not replayed |
| Sprite decomposition (animated graphics) | Static texture plus per-frame transform fit to a raster animation | Replayed (discrete) |
| Canonical texture / rigid consolidation | One texture per rigid item, re-rendered per frame | Replayed as a diagnostic |
| Mask layer (confine rule) | TDSM headwear masks the hair layer per frame | Read; same family as Spine clipping and PixelDoll hides |
| Transmog | Game term for appearance-only equipment swaps | Search term only; no new mechanism |
| Wearables / cosmetics | Marketplace vocabulary for avatar items | Search term only |
| Style Lock, identity anchor | Vendor terms for whole-sheet consistency (Sprixen, FrameSprite) | Rejected; composite output |
| FLIP metric | Perceptual difference metric preferred over PSNR/SSIM for pixel art by DeepInterframes | Lead for evaluation; not tested |

## Saturation notes

- Commercial AI sprite tools: three independent 2026 comparisons plus vendor pages agree with the October finding that no tool exports per-item equipment layers. Further vendor searches returned the same names. Saturated for this cycle; only paid trials could add evidence.
- Learned layer decomposition: four current systems found (Qwen-Image-Layered, LayerD, PixelART, See-through). All need GPU models outside the allowed PixelLab routes and are trained on designs or anime illustrations at 640 px or more. Mechanisms, not models, are transferable.
- Pixel-art-specific deterministic tools: spritesplit was the only new one with a palette-structure algorithm. Searches for pixel-art part segmentation found no dataset.
- Game equipment devlogs: covered by earlier game surveys; not repeated.
- Not searched this cycle: video transcripts, non-English forums beyond one Japanese explainer surfaced by search, app marketplaces.
