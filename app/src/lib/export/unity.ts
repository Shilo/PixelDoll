// Unity 2022.3 / Unity 6 export (manifest-spec §6.3): an Editor importer (no hand-written .meta) + one runtime component.
// unity/pixeldoll_unity.json is the manifest flattened for JsonUtility (no dictionaries).
import type { Manifest } from '../store/manifest.ts';
import type { OutFile } from './generic.ts';
import { layerFrame } from '../compose/compose.ts';

function exportId(m: Manifest): string {
  // Namespace + assembly identity: importing different characters must not define duplicate C# types.
  let h = 0xcbf29ce484222325n;
  for (const c of `${m.name}\0${m.rig.baseHash}`) h = BigInt.asUintN(64, (h ^ BigInt(c.codePointAt(0)!)) * 0x100000001b3n);
  return `Character_${h.toString(16).padStart(16, '0')}`;
}

export function unityJson(m: Manifest) {
  const { rig } = m;
  return {
    name: m.name.replace(/[^A-Za-z0-9_-]/g, '_') || 'Paperdoll',
    exportId: exportId(m),
    cellW: rig.cell.w, cellH: rig.cell.h, pivotX: rig.pivot.x, pivotY: rig.pivot.y,
    ppu: m.export?.pixelsPerUnit ?? rig.cell.w,
    baseItem: rig.baseItem,
    directions: rig.directions.map((d) => d.id),
    animations: rig.animations.map((a) => ({ id: a.id, loop: a.loop, cells: a.cells, frames: a.frames, directions: (a as typeof a & { directions?: string[] }).directions ?? rig.directions.map((d) => d.id) })),
    materials: (m.materials ?? []).map((mat) => ({ ...mat, variants: Object.entries(mat.variants).map(([id, ramp]) => ({ id, ramp })) })),
    presets: m.presets.map((p) => ({ id: p.id, items: Object.entries(p.items).map(([slot, item]) => ({ slot, item: item ?? '' })), variants: Object.entries(p.variants ?? {}).map(([id, variant]) => ({ id, variant })) })),
    slots: m.slots.map((s) => ({
      id: s.id, z: s.z, hides: s.hides ?? [],
      zOverrides: (s.zOverrides ?? []).map((o) => ({ layer: o.layer, z: o.z, dir: o.dir ?? '', anim: o.anim ?? '', cell: o.cell ?? -1 })),
    })),
    items: m.items.map((it) => ({
      id: it.id, slot: it.slot, variantOf: it.variantOf ?? '', materials: it.materials ?? [], hasHides: !!it.hides, hides: it.hides ?? [],
      layers: it.layers.map((l) => {
        const f = layerFrame(rig, l); // oversize layers: own cell + pivot; PPU stays the base's, so world scale matches
        return { id: l.id, role: l.role, z: l.z, cellW: f.w, cellH: f.h, pivotX: f.x, pivotY: f.y, sheets: rig.animations.map((a) => l.sheets![a.id]), sourceSheets: rig.animations.map((a) => l.sourceSheets?.[a.id] ?? l.sheets![a.id]) };
      }),
    })),
    preset: Object.entries(m.presets[0]?.items ?? {}).map(([slot, item]) => ({ slot, item: item ?? '' })),
  };
}

export const PAPERDOLL_CS = `using System;
using System.Collections.Generic;
using UnityEngine;

namespace PixelDoll
{
    [Serializable] public class PdFrame { public int cell; public int ms; }
    [Serializable] public class PdAnim { public string id; public bool loop; public int cells; public PdFrame[] frames; public string[] directions; }
    [Serializable] public class PdZOverride { public string layer; public int z; public string dir; public string anim; public int cell = -1; }
    [Serializable] public class PdSlot { public string id; public int z; public string[] hides; public PdZOverride[] zOverrides; }
    [Serializable] public class PdLayer { public string id; public string role; public int z, cellW, cellH, pivotX, pivotY; public string[] sheets, sourceSheets; }
    [Serializable] public class PdItem { public string id, slot, variantOf; public bool hasHides; public string[] hides, materials; public PdLayer[] layers; }
    [Serializable] public class PdEquip { public string slot; public string item; }
    [Serializable] public class PdSprites { public string item; public string layer; public Sprite[] sprites, sources; }
    [Serializable] public class PdNode { public string slot; public string role; public SpriteRenderer renderer; }
    [Serializable] public class PdVariant { public string id; public string variant; }
    [Serializable] public class PdRamp { public string id; public string[] ramp; }
    [Serializable] public class PdMaterial { public string id, owner, linkTo, defaultVariant; public string[] ramp; public PdRamp[] variants; }
    [Serializable] public class PdPreset { public string id; public PdEquip[] items; public PdVariant[] variants; }
    [Serializable]
    public class PaperdollData
    {
        public string name, baseItem, exportId;
        public int cellW, cellH, pivotX, pivotY;
        public float ppu;
        public string[] directions;
        public PdAnim[] animations;
        public PdSlot[] slots;
        public PdItem[] items;
        public PdEquip[] preset;
        public PdMaterial[] materials;
        public PdPreset[] presets;
    }

    /// The Animator drives a hidden clock; visible layers follow its frame name so recoloring cannot disturb playback.
    [DisallowMultipleComponent]
    public class Paperdoll : MonoBehaviour
    {
        public PaperdollData data;
        public List<PdSprites> library = new List<PdSprites>();
        public List<PdNode> nodes = new List<PdNode>();
        public List<PdEquip> equipped = new List<PdEquip>();
        public List<PdVariant> variants = new List<PdVariant>();
        public SpriteRenderer clock;
        Dictionary<string, Dictionary<string, Sprite>> maps;
        readonly Dictionary<string, Texture2D> textures = new Dictionary<string, Texture2D>();
        readonly Dictionary<string, Sprite> colored = new Dictionary<string, Sprite>();
        Sprite last;
        bool dirty = true;

        public SpriteRenderer Body => nodes.Find(n => n.slot == "body" && n.role == "fg")?.renderer;

        /// Selects the generated state, preserving active playback and replaying a completed non-looping clip.
        public void Play(string anim, string dir)
        {
            var move = Array.Find(data.animations, a => a.id == anim);
            if (move == null || Array.IndexOf(move.directions, dir) < 0) return;
            var animator = GetComponent<Animator>();
            var stateName = anim + "_" + dir;
            var current = animator.GetCurrentAnimatorStateInfo(0);
            if (!move.loop && current.shortNameHash == Animator.StringToHash(stateName) && current.normalizedTime >= 1f) animator.Play(stateName, 0, 0f);
            else animator.Play(stateName);
        }

        /// Equips itemId in slot (null or "" = empty); hides are re-applied on the next LateUpdate.
        public void Equip(string slot, string itemId)
        {
            var item = Item(itemId);
            if (slot == "body" || Slot(slot) == null || (!string.IsNullOrEmpty(itemId) && (item == null || item.slot != slot || !string.IsNullOrEmpty(item.variantOf)))) return;
            var e = equipped.Find(x => x.slot == slot);
            if (e == null) equipped.Add(e = new PdEquip { slot = slot });
            e.item = itemId ?? "";
            dirty = true;
        }

        /// Uses exported exact palette ramps. null removes an explicit selection and restores the material default.
        public void SetVariant(string id, string variant)
        {
            if (Array.Find(data.materials, m => m.id == id) == null) return;
            variants.RemoveAll(v => v.id == id);
            if (variant != null) variants.Add(new PdVariant { id = id, variant = variant });
            dirty = true;
        }

        public void ApplyPreset(string id)
        {
            var p = Array.Find(data.presets, x => x.id == id);
            if (p == null) return;
            equipped = new List<PdEquip>();
            foreach (var e in p.items) if (e.slot != "body") equipped.Add(new PdEquip { slot = e.slot, item = e.item });
            equipped.Add(new PdEquip { slot = "body", item = data.baseItem });
            variants = new List<PdVariant>();
            foreach (var v in p.variants) variants.Add(new PdVariant { id = v.id, variant = v.variant });
            dirty = true;
        }

        void LateUpdate() => Sync();
        void OnEnable() { maps = null; last = null; dirty = true; }

        public void Sync()
        {
            var s = clock ? clock.sprite : null;
            if (s == null || (s == last && !dirty)) return;
            last = s;
            dirty = false;
            if (maps == null)
            {
                maps = new Dictionary<string, Dictionary<string, Sprite>>();
                foreach (var l in library)
                {
                    var d = new Dictionary<string, Sprite>();
                    foreach (var sp in Application.isPlaying ? l.sources : l.sprites) d[sp.name] = sp;
                    maps[l.item + "/" + l.layer] = d;
                }
            }
            // sprite name = <anim>_<dir>_<cell>; direction ids never contain '_'
            var name = s.name;
            int c2 = name.LastIndexOf('_'), c1 = name.LastIndexOf('_', c2 - 1);
            string anim = name.Substring(0, c1), dir = name.Substring(c1 + 1, c2 - c1 - 1);
            int cell = int.Parse(name.Substring(c2 + 1));
            var hidden = new HashSet<string>();
            var baseItem = Item(data.baseItem);
            if (baseItem != null)
                foreach (var h in baseItem.hasHides ? baseItem.hides : Slot("body")?.hides ?? Array.Empty<string>()) hidden.Add(h);
            foreach (var e in equipped)
            {
                if (e.slot == "body") continue;
                var it = Item(e.item);
                if (it == null) continue;
                foreach (var h in it.hasHides ? it.hides : Slot(it.slot)?.hides ?? Array.Empty<string>()) hidden.Add(h);
            }
            var visible = new List<KeyValuePair<PdNode, int>>();
            foreach (var n in nodes)
            {
                var it = Item(Shown(n.slot == "body" ? data.baseItem : equipped.Find(x => x.slot == n.slot)?.item));
                var layer = it == null ? null : Array.Find(it.layers, l => l.role == n.role);
                n.renderer.enabled = layer != null && !hidden.Contains(n.slot);
                if (layer == null) continue;
                visible.Add(new KeyValuePair<PdNode, int>(n, Z(Slot(n.slot), layer, anim, dir, cell)));
                n.renderer.sprite = maps.TryGetValue(it.id + "/" + layer.id, out var m) && m.TryGetValue(name, out var sp) ? Recolor(it, sp) : null;
            }
            // nodes follow manifest slot order, bg before fg; tie-break is independent of camera distance.
            visible.Sort((a, b) => a.Value != b.Value ? a.Value.CompareTo(b.Value) : nodes.IndexOf(a.Key).CompareTo(nodes.IndexOf(b.Key)));
            for (int i = 0; i < visible.Count; i++) visible[i].Key.renderer.sortingOrder = i;
        }

        string Variant(PdMaterial mat, HashSet<string> seen)
        {
            if (mat == null || !seen.Add(mat.id)) return null;
            if (!string.IsNullOrEmpty(mat.linkTo)) return Variant(Array.Find(data.materials, x => x.id == mat.linkTo), seen);
            return variants.Find(v => v.id == mat.id)?.variant ?? mat.defaultVariant;
        }

        static int RGB(string hex) => Convert.ToInt32(hex.Substring(1), 16);

        Sprite Recolor(PdItem item, Sprite source)
        {
            if (!Application.isPlaying) return source; // prefab preview uses persistent canonical sprites
            var swaps = new Dictionary<int, int>();
            foreach (var id in item.materials)
            {
                var mat = Array.Find(data.materials, x => x.id == id && (x.owner == item.id || x.owner == item.variantOf));
                if (mat == null) continue;
                string choice = Variant(mat, new HashSet<string>());
                var ramp = Array.Find(mat.variants, x => x.id == choice)?.ramp;
                if (ramp == null || ramp.Length != mat.ramp.Length) continue;
                for (int i = 0; i < ramp.Length; i++) swaps[RGB(mat.ramp[i])] = RGB(ramp[i]);
            }
            if (swaps.Count == 0) return source;
            string signature = "";
            foreach (var swap in swaps) signature += swap.Key + ":" + swap.Value + ",";
            string textureKey = item.id + "/" + source.texture.GetInstanceID() + "/" + signature;
            string spriteKey = textureKey + "/" + source.name;
            if (colored.TryGetValue(spriteKey, out var cached)) return cached;
            if (!textures.TryGetValue(textureKey, out var texture))
            {
                var pixels = source.texture.GetPixels32();
                for (int i = 0; i < pixels.Length; i++)
                {
                    var c = pixels[i];
                    if (c.a != 0 && swaps.TryGetValue((c.r << 16) | (c.g << 8) | c.b, out var rgb))
                        pixels[i] = new Color32((byte)(rgb >> 16), (byte)(rgb >> 8), (byte)rgb, c.a);
                }
                texture = new Texture2D(source.texture.width, source.texture.height, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp };
                texture.SetPixels32(pixels);
                texture.Apply(false, true);
                textures[textureKey] = texture;
            }
            var sprite = Sprite.Create(texture, source.rect, new Vector2(source.pivot.x / source.rect.width, source.pivot.y / source.rect.height), source.pixelsPerUnit, 0, SpriteMeshType.FullRect);
            sprite.name = source.name;
            colored[spriteKey] = sprite;
            return sprite;
        }

        void OnDestroy()
        {
            foreach (var sprite in colored.Values) Destroy(sprite);
            foreach (var texture in textures.Values) Destroy(texture);
        }

        /// Most specific zOverride (cell > anim > dir > none, later wins on ties), else the layer's z.
        public static int Z(PdSlot slot, PdLayer layer, string anim, string dir, int cell)
        {
            int z = layer.z, best = -1;
            if (slot?.zOverrides != null)
                foreach (var o in slot.zOverrides)
                {
                    bool hasDir = !string.IsNullOrEmpty(o.dir), hasAnim = !string.IsNullOrEmpty(o.anim);
                    if (o.layer != layer.role || (hasDir && o.dir != dir) || (hasAnim && o.anim != anim) || (o.cell >= 0 && o.cell != cell)) continue;
                    int rank = o.cell >= 0 ? 3 : hasAnim ? 2 : hasDir ? 1 : 0;
                    if (rank >= best) { best = rank; z = o.z; }
                }
            return z;
        }

        PdItem Item(string id) => string.IsNullOrEmpty(id) ? null : Array.Find(data.items, i => i.id == id);
        /// The item drawn for an equipped id: "<item>~<other>" (baked: hair tucked under a worn helmet, slots[].clips) when it exists.
        string Shown(string id)
        {
            if (!string.IsNullOrEmpty(id)) foreach (var e in equipped) if (Item(id + "~" + e.item) != null) return id + "~" + e.item;
            return id;
        }
        PdSlot Slot(string id) => Array.Find(data.slots, s => s.id == id);
    }
}
`;

export const IMPORTER_CS = `using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.U2D.Sprites;
using UnityEngine;
using UnityEngine.Rendering;

namespace PixelDoll.Editor
{
    /// Imports a PixelDoll export folder placed anywhere under Assets/: slices every layer sheet (Point, uncompressed, PPU,
    /// custom pivot), builds body clips + an Animator Controller + a prefab (Sorting Group, Paperdoll, one SpriteRenderer per
    /// slot/role). Requires only the 2D Sprite package, no 2D Animation package.
    /// Output: <export>/unity/Generated/. Runs on import of unity/pixeldoll_unity.json and from Tools > PixelDoll.
    public class PixelDollImporter : AssetPostprocessor
    {
        const string Json = "/unity/pixeldoll_unity.json";
        const string ExportId = "__EXPORT_ID__";

        static void OnPostprocessAllAssets(string[] imported, string[] deleted, string[] moved, string[] movedFrom)
        {
            foreach (var p in imported.Where(p => p.EndsWith(Json)))
                EditorApplication.delayCall += () => Import(p);
        }

        [MenuItem("Tools/PixelDoll/__EXPORT_ID__/Import")]
        public static void ImportAll()
        {
            foreach (var p in AssetDatabase.FindAssets("pixeldoll_unity").Select(AssetDatabase.GUIDToAssetPath).Where(p => p.EndsWith(Json)))
                Import(p);
        }

        public static void Import(string jsonPath)
        {
            var unityDir = Path.GetDirectoryName(jsonPath).Replace('\\\\', '/');
            var root = Path.GetDirectoryName(unityDir).Replace('\\\\', '/');
            var d = JsonUtility.FromJson<PaperdollData>(File.ReadAllText(jsonPath));
            if (d.exportId != ExportId) return; // other exported characters have independent assemblies/importers
            var outDir = unityDir + "/Generated";
            if (!AssetDatabase.IsValidFolder(outDir)) AssetDatabase.CreateFolder(unityDir, "Generated");

            var library = new List<PdSprites>();
            foreach (var it in d.items)
                foreach (var l in it.layers)
                {
                    var sprites = new List<Sprite>();
                    var sources = new List<Sprite>();
                    for (int a = 0; a < d.animations.Length; a++)
                    {
                        var sliced = Slice(root + "/" + l.sheets[a], d, l, d.animations[a]);
                        sprites.AddRange(sliced);
                        sources.AddRange(l.sourceSheets[a] == l.sheets[a] ? sliced : Slice(root + "/" + l.sourceSheets[a], d, l, d.animations[a]));
                    }
                    library.Add(new PdSprites { item = it.id, layer = l.id, sprites = sprites.ToArray(), sources = sources.ToArray() });
                }

            var bodyLayer = d.items.First(i => i.id == d.baseItem).layers.First(l => l.role == "fg");
            var body = library.Find(x => x.item == d.baseItem && x.layer == bodyLayer.id).sprites.ToDictionary(s => s.name);
            var ctrlPath = outDir + "/" + d.name + ".controller";
            var controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(ctrlPath);
            if (controller == null) controller = AnimatorController.CreateAnimatorControllerAtPath(ctrlPath);
            var machine = controller.layers[0].stateMachine;
            foreach (var state in machine.states) machine.RemoveState(state.state);
            bool firstState = true;
            foreach (var a in d.animations)
                foreach (var dir in a.directions)
                {
                    int gcd = a.frames.Aggregate(0, (g, f) => Gcd(g, f.ms));
                    var clip = new AnimationClip { name = a.id + "_" + dir, frameRate = 1000f / gcd };
                    var keys = new List<ObjectReferenceKeyframe>();
                    long elapsedMs = 0;
                    foreach (var f in a.frames)
                    {
                        keys.Add(new ObjectReferenceKeyframe { time = elapsedMs / 1000f, value = body[a.id + "_" + dir + "_" + f.cell] });
                        elapsedMs += f.ms;
                    }
                    // Unity includes one sample after the final object-reference key.
                    if (a.frames.Last().ms > gcd) keys.Add(new ObjectReferenceKeyframe { time = (elapsedMs - gcd) / 1000f, value = keys[keys.Count - 1].value });
                    AnimationUtility.SetObjectReferenceCurve(clip, EditorCurveBinding.PPtrCurve("clock", typeof(SpriteRenderer), "m_Sprite"), keys.ToArray());
                    var settings = AnimationUtility.GetAnimationClipSettings(clip);
                    settings.loopTime = a.loop;
                    AnimationUtility.SetAnimationClipSettings(clip, settings);
                    clip = Save(clip, outDir + "/" + clip.name + ".anim");
                    controller.AddMotion(clip);
                    if (firstState) { machine.defaultState = machine.states.Last().state; firstState = false; }
                }

            var go = new GameObject(d.name);
            go.AddComponent<SortingGroup>();
            go.AddComponent<Animator>().runtimeAnimatorController = controller;
            var doll = go.AddComponent<Paperdoll>();
            doll.data = d;
            doll.library = library;
            if (d.presets.Length > 0) doll.ApplyPreset(d.presets[0].id);
            else doll.equipped.Add(new PdEquip { slot = "body", item = d.baseItem });
            var clock = new GameObject("clock");
            clock.transform.SetParent(go.transform, false);
            doll.clock = clock.AddComponent<SpriteRenderer>();
            doll.clock.enabled = false;
            foreach (var s in d.slots)
                foreach (var role in new[] { "bg", "fg" })
                {
                    if (!d.items.Any(i => i.slot == s.id && i.layers.Any(l => l.role == role))) continue;
                    var child = new GameObject(s.id + "_" + role);
                    child.transform.SetParent(go.transform, false);
                    doll.nodes.Add(new PdNode { slot = s.id, role = role, renderer = child.AddComponent<SpriteRenderer>() });
                }
            var initial = d.animations.First(a => a.directions.Length > 0);
            doll.clock.sprite = body[initial.id + "_" + initial.directions[0] + "_" + initial.frames[0].cell];
            doll.Sync();
            PrefabUtility.SaveAsPrefabAsset(go, outDir + "/" + d.name + ".prefab");
            Object.DestroyImmediate(go);
            AssetDatabase.SaveAssets();
            Debug.Log("PixelDoll: imported " + d.name + ": " + library.Sum(l => l.sprites.Length) + " sprites in " + library.Count + " layers, " + d.animations.Length * d.directions.Length + " clips -> " + outDir);
        }

        /// Each layer is sliced by its own cell (oversize layers, e.g. 96x96) with its own pivot; PPU is the base's for all.
        static Sprite[] Slice(string png, PaperdollData d, PdLayer l, PdAnim a)
        {
            int size = Mathf.Max(a.cells * l.cellW, d.directions.Length * l.cellH);
            if (size > 16384) throw new System.InvalidOperationException("PixelDoll sheet exceeds Unity's 16384-pixel import limit: " + png);
            var ti = (TextureImporter)AssetImporter.GetAtPath(png);
            ti.textureType = TextureImporterType.Sprite;
            ti.spriteImportMode = SpriteImportMode.Multiple;
            ti.filterMode = FilterMode.Point;
            ti.textureCompression = TextureImporterCompression.Uncompressed;
            ti.crunchedCompression = false;
            ti.npotScale = TextureImporterNPOTScale.None;
            ti.wrapMode = TextureWrapMode.Clamp;
            ti.maxTextureSize = Mathf.Max(32, Mathf.NextPowerOfTwo(size));
            ti.isReadable = true; // exact source-ramp swaps, cached per item/selection at runtime
            ti.mipmapEnabled = false;
            ti.alphaIsTransparency = true;
            ti.spritePixelsPerUnit = d.ppu;
            var textureSettings = new TextureImporterSettings();
            ti.ReadTextureSettings(textureSettings);
            textureSettings.spriteMeshType = SpriteMeshType.FullRect;
            ti.SetTextureSettings(textureSettings);
            var factories = new SpriteDataProviderFactories();
            factories.Init();
            var dp = factories.GetSpriteEditorDataProviderFromObject(ti);
            dp.InitSpriteEditorDataProvider();
            var old = new Dictionary<string, GUID>();
            foreach (var r in dp.GetSpriteRects()) old[r.name] = r.spriteID; // keep sprite ids stable across re-imports
            int texH = d.directions.Length * l.cellH;
            var rects = new List<SpriteRect>();
            for (int row = 0; row < d.directions.Length; row++)
                for (int c = 0; c < a.cells; c++)
                {
                    var name = a.id + "_" + d.directions[row] + "_" + c;
                    rects.Add(new SpriteRect
                    {
                        name = name,
                        rect = new Rect(c * l.cellW, texH - (row + 1) * l.cellH, l.cellW, l.cellH), // Unity rects start bottom-left
                        alignment = SpriteAlignment.Custom,
                        pivot = new Vector2((float)l.pivotX / l.cellW, 1f - (float)l.pivotY / l.cellH),
                        spriteID = old.TryGetValue(name, out var id) ? id : GUID.Generate(),
                    });
                }
            dp.SetSpriteRects(rects.ToArray());
            dp.GetDataProvider<ISpriteNameFileIdDataProvider>()?.SetNameFileIdPairs(rects.Select(r => new SpriteNameFileIdPair(r.name, r.spriteID)));
            dp.Apply();
            ti.SaveAndReimport();
            return AssetDatabase.LoadAllAssetsAtPath(png).OfType<Sprite>().ToArray();
        }

        static T Save<T>(T asset, string path) where T : Object
        {
            var existing = AssetDatabase.LoadAssetAtPath<T>(path);
            if (existing == null) { AssetDatabase.CreateAsset(asset, path); return asset; }
            EditorUtility.CopySerialized(asset, existing);
            EditorUtility.SetDirty(existing);
            Object.DestroyImmediate(asset);
            return existing;
        }

        static int Gcd(int a, int b) => b == 0 ? a : Gcd(b, a % b);
    }
}
`;

const asmdef = (o: object) => JSON.stringify(o, null, 2) + '\n';

export function unityFiles(m: Manifest): OutFile[] {
  const identity = exportId(m), ns = `PixelDoll.${identity}`;
  const runtime = PAPERDOLL_CS.replace('namespace PixelDoll', `namespace ${ns}`);
  const importer = IMPORTER_CS.replace('namespace PixelDoll.Editor', `namespace ${ns}.Editor`).replaceAll('__EXPORT_ID__', identity);
  return [
    { name: 'unity/pixeldoll_unity.json', data: JSON.stringify(unityJson(m), null, 1) + '\n' },
    { name: 'unity/Runtime/Paperdoll.cs', data: runtime },
    { name: 'unity/Runtime/PixelDoll.Runtime.asmdef', data: asmdef({ name: `${ns}.Runtime` }) },
    { name: 'unity/Editor/PixelDollImporter.cs', data: importer },
    {
      name: 'unity/Editor/PixelDoll.Editor.asmdef',
      data: asmdef({
        name: `${ns}.Editor`,
        references: [`${ns}.Runtime`, 'Unity.2D.Sprite.Editor'],
        includePlatforms: ['Editor'],
      }),
    },
    {
      name: 'unity/README.txt',
      data: `Unity 2022.3 / Unity 6. Install com.unity.2d.sprite (2D Sprite) with Package Manager, then copy the whole export folder
under Assets/. No 2D Animation package is required. Keep this character in one folder: re-export into that same folder.
Different characters use independent namespaces and assemblies; do not import two copies of the same character.
If replacing an older PixelDoll exporter, remove its unity/Runtime and unity/Editor scripts first to avoid stale assembly definitions.
The importer runs on unity/pixeldoll_unity.json import. After scripts finish compiling, use
Tools > PixelDoll > ${identity} > Import if no prefab appeared.
Output in unity/Generated/: sliced sheets (Point, no compression, PPU ${m.export?.pixelsPerUnit ?? m.rig.cell.w}, pivot at the feet),
<anim>_<dir>.anim clips for supported views, ${unityJson(m).name}.controller and ${unityJson(m).name}.prefab
(Sorting Group + Paperdoll + one SpriteRenderer per slot/role and a hidden animation clock).
Runtime namespace: ${ns}. Paperdoll.Play(anim, dir), Equip(slot, itemId), ApplyPreset(presetId), SetVariant(materialId, variantName).
Play preserves an active clip's progress. Calling it again after the same non-looping clip completes replays that clip.
SetVariant uses the exported exact ramps (including linked material defaults); null restores the default.
Palettes are owner-local, use the original source sheets and cache recolored textures/sprites per doll until it is destroyed.
Source textures are readable for these swaps. Do not put them in a Sprite Atlas (packing/rotation changes their source coordinates).
Default preview colors are persistent sprite assets; changing presets/colors is applied during Play Mode.
Use a Pixel Perfect Camera and a sprite-compatible material for your render pipeline (including URP 2D).
Verify target platform texture overrides preserve full sheet dimensions, RGBA color and uncompressed pixels.
`,
    },
  ];
}

export function selfTest() {
  const m = {
    name: 'my hero', rig: { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, baseItem: 'base', directions: [{ id: 'south' }], animations: [{ id: 'walk', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }] },
    slots: [{ id: 'head', z: 130, zOverrides: [{ layer: 'fg', z: 5, dir: 'north' }] }],
    items: [{ id: 'helm', slot: 'head', hides: ['hair'], layers: [{ id: 'main', role: 'fg', z: 130, sheets: { walk: 'w.png' } }] }],
    presets: [{ items: { head: 'helm', hair: null } }],
  } as unknown as Manifest;
  const u = unityJson(m);
  console.assert(u.name === 'my_hero' && u.ppu === 64 && u.items[0].layers[0].sheets[0] === 'w.png' && u.items[0].hasHides, 'unity json flattening');
  console.assert(u.slots[0].zOverrides[0].cell === -1 && u.slots[0].zOverrides[0].anim === '' && u.preset[1].item === '', 'unity json: absent = -1 / ""');
  console.assert(u.items[0].layers[0].cellW === 64 && u.items[0].layers[0].pivotY === 60, 'unity json: per-layer cell/pivot default = rig');
  Object.assign(m.items[0].layers[0], { cell: { w: 96, h: 96 }, pivot: { x: 48, y: 76 } });
  const u2 = unityJson(m).items[0].layers[0];
  console.assert(u2.cellW === 96 && u2.pivotY === 76 && unityJson(m).ppu === 64, 'unity json: oversize layer keeps the base PPU');
  console.assert(IMPORTER_CS.includes(".Replace('\\\\', '/')"), 'C# backslash literal survives the template string');
}
