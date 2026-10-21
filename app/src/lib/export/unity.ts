// Unity 2022.3 / Unity 6 export (manifest-spec §6.3): an Editor importer (no hand-written .meta) + one runtime component.
// unity/pixeldoll_unity.json is the manifest flattened for JsonUtility (no dictionaries).
import type { Manifest } from '../store/manifest.ts';
import type { OutFile } from './generic.ts';
import { layerFrame } from '../compose/compose.ts';

export function unityJson(m: Manifest) {
  const { rig } = m;
  return {
    name: m.name.replace(/[^A-Za-z0-9_-]/g, '_'),
    cellW: rig.cell.w, cellH: rig.cell.h, pivotX: rig.pivot.x, pivotY: rig.pivot.y,
    ppu: m.export?.pixelsPerUnit ?? rig.cell.w,
    baseItem: rig.baseItem,
    directions: rig.directions.map((d) => d.id),
    animations: rig.animations.map((a) => ({ id: a.id, loop: a.loop, cells: a.cells, frames: a.frames })),
    slots: m.slots.map((s) => ({
      id: s.id, z: s.z, hides: s.hides ?? [],
      zOverrides: (s.zOverrides ?? []).map((o) => ({ layer: o.layer, z: o.z, dir: o.dir ?? '', anim: o.anim ?? '', cell: o.cell ?? -1 })),
    })),
    items: m.items.map((it) => ({
      id: it.id, slot: it.slot, hasHides: !!it.hides, hides: it.hides ?? [],
      layers: it.layers.map((l) => {
        const f = layerFrame(rig, l); // oversize layers: own cell + pivot; PPU stays the base's, so world scale matches
        return { id: l.id, role: l.role, z: l.z, cellW: f.w, cellH: f.h, pivotX: f.x, pivotY: f.y, sheets: rig.animations.map((a) => l.sheets![a.id]) };
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
    [Serializable] public class PdAnim { public string id; public bool loop; public int cells; public PdFrame[] frames; }
    [Serializable] public class PdZOverride { public string layer; public int z; public string dir; public string anim; public int cell = -1; }
    [Serializable] public class PdSlot { public string id; public int z; public string[] hides; public PdZOverride[] zOverrides; }
    [Serializable] public class PdLayer { public string id; public string role; public int z, cellW, cellH, pivotX, pivotY; public string[] sheets; }
    [Serializable] public class PdItem { public string id; public string slot; public bool hasHides; public string[] hides; public PdLayer[] layers; }
    [Serializable] public class PdEquip { public string slot; public string item; }
    [Serializable] public class PdSprites { public string item; public string layer; public Sprite[] sprites; }
    [Serializable] public class PdNode { public string slot; public string role; public SpriteRenderer renderer; }
    [Serializable]
    public class PaperdollData
    {
        public string name, baseItem;
        public int cellW, cellH, pivotX, pivotY, ppu;
        public string[] directions;
        public PdAnim[] animations;
        public PdSlot[] slots;
        public PdItem[] items;
        public PdEquip[] preset;
    }

    /// PixelDoll paperdoll (pixeldoll/1). The Animator drives the body SpriteRenderer ("body_fg"); every LateUpdate each other
    /// layer shows its own sprite with the body's sprite name ("walk_south_3"), so layers cannot drift. No 2D Animation package needed.
    [DisallowMultipleComponent]
    public class Paperdoll : MonoBehaviour
    {
        public PaperdollData data;
        public List<PdSprites> library = new List<PdSprites>();
        public List<PdNode> nodes = new List<PdNode>();
        public List<PdEquip> equipped = new List<PdEquip>();
        Dictionary<string, Dictionary<string, Sprite>> maps;
        Sprite last;
        bool dirty = true;

        public SpriteRenderer Body => nodes.Find(n => n.slot == "body" && n.role == "fg")?.renderer;

        /// Plays the "<anim>_<dir>" state of the generated Animator Controller.
        public void Play(string anim, string dir) => GetComponent<Animator>().Play(anim + "_" + dir);

        /// Equips itemId in slot (null or "" = empty); hides are re-applied on the next LateUpdate.
        public void Equip(string slot, string itemId)
        {
            var e = equipped.Find(x => x.slot == slot);
            if (e == null) equipped.Add(e = new PdEquip { slot = slot });
            e.item = itemId ?? "";
            dirty = true;
        }

        void LateUpdate() => Sync();

        public void Sync()
        {
            var body = Body;
            var s = body ? body.sprite : null;
            if (s == null || (s == last && !dirty)) return;
            last = s;
            dirty = false;
            if (maps == null)
            {
                maps = new Dictionary<string, Dictionary<string, Sprite>>();
                foreach (var l in library)
                {
                    var d = new Dictionary<string, Sprite>();
                    foreach (var sp in l.sprites) d[sp.name] = sp;
                    maps[l.item + "/" + l.layer] = d;
                }
            }
            // sprite name = <anim>_<dir>_<cell>; direction ids never contain '_'
            var name = s.name;
            int c2 = name.LastIndexOf('_'), c1 = name.LastIndexOf('_', c2 - 1);
            string anim = name.Substring(0, c1), dir = name.Substring(c1 + 1, c2 - c1 - 1);
            int cell = int.Parse(name.Substring(c2 + 1));
            var hidden = new HashSet<string>();
            foreach (var e in equipped)
            {
                var it = Item(e.item);
                if (it == null) continue;
                foreach (var h in it.hasHides ? it.hides : Slot(it.slot)?.hides ?? Array.Empty<string>()) hidden.Add(h);
            }
            foreach (var n in nodes)
            {
                var it = Item(n.slot == "body" ? data.baseItem : Shown(equipped.Find(x => x.slot == n.slot)?.item));
                var layer = it == null ? null : Array.Find(it.layers, l => l.role == n.role);
                n.renderer.enabled = layer != null && !hidden.Contains(n.slot);
                if (layer == null) continue;
                n.renderer.sortingOrder = Z(Slot(n.slot), layer, anim, dir, cell);
                if (n.renderer != body)
                    n.renderer.sprite = maps.TryGetValue(it.id + "/" + layer.id, out var m) && m.TryGetValue(name, out var sp) ? sp : null;
            }
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
#if PIXELDOLL_2D_ANIMATION
using UnityEngine.U2D.Animation;
#endif

namespace PixelDoll.Editor
{
    /// Imports a PixelDoll export folder placed anywhere under Assets/: slices every layer sheet (Point, uncompressed, PPU,
    /// custom pivot), builds body clips + an Animator Controller + a prefab (Sorting Group, Paperdoll, one SpriteRenderer per
    /// slot/role) and, with com.unity.2d.animation, one SpriteLibraryAsset per item layer (Category = anim_dir, Label = cell).
    /// Output: <export>/unity/Generated/. Runs on import of unity/pixeldoll_unity.json and from Tools > PixelDoll.
    public class PixelDollImporter : AssetPostprocessor
    {
        const string Json = "/unity/pixeldoll_unity.json";

        static void OnPostprocessAllAssets(string[] imported, string[] deleted, string[] moved, string[] movedFrom)
        {
            foreach (var p in imported.Where(p => p.EndsWith(Json)))
                EditorApplication.delayCall += () => Import(p);
        }

        [MenuItem("Tools/PixelDoll/Import All Exports")]
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
            var outDir = unityDir + "/Generated";
            if (!AssetDatabase.IsValidFolder(outDir)) AssetDatabase.CreateFolder(unityDir, "Generated");

            var library = new List<PdSprites>();
            foreach (var it in d.items)
                foreach (var l in it.layers)
                {
                    var sprites = new List<Sprite>();
                    for (int a = 0; a < d.animations.Length; a++) sprites.AddRange(Slice(root + "/" + l.sheets[a], d, l, d.animations[a]));
                    library.Add(new PdSprites { item = it.id, layer = l.id, sprites = sprites.ToArray() });
#if PIXELDOLL_2D_ANIMATION
                    var lib = ScriptableObject.CreateInstance<SpriteLibraryAsset>();
                    foreach (var s in sprites)
                    {
                        int c = s.name.LastIndexOf('_');
                        lib.AddCategoryLabel(s, s.name.Substring(0, c), s.name.Substring(c + 1));
                    }
                    Save(lib, outDir + "/" + it.id + "_" + l.id + ".asset");
#endif
                }

            var body = library.Find(x => x.item == d.baseItem).sprites.ToDictionary(s => s.name);
            var ctrlPath = outDir + "/" + d.name + ".controller";
            AssetDatabase.DeleteAsset(ctrlPath);
            var controller = AnimatorController.CreateAnimatorControllerAtPath(ctrlPath);
            foreach (var a in d.animations)
                foreach (var dir in d.directions)
                {
                    int gcd = a.frames.Aggregate(0, (g, f) => Gcd(g, f.ms));
                    var clip = new AnimationClip { name = a.id + "_" + dir, frameRate = 1000f / gcd };
                    var keys = new List<ObjectReferenceKeyframe>();
                    float t = 0;
                    foreach (var f in a.frames)
                    {
                        keys.Add(new ObjectReferenceKeyframe { time = t, value = body[a.id + "_" + dir + "_" + f.cell] });
                        t += f.ms / 1000f;
                    }
                    keys.Add(new ObjectReferenceKeyframe { time = t, value = keys[keys.Count - 1].value }); // hold the last frame its ms
                    AnimationUtility.SetObjectReferenceCurve(clip, EditorCurveBinding.PPtrCurve("body_fg", typeof(SpriteRenderer), "m_Sprite"), keys.ToArray());
                    var settings = AnimationUtility.GetAnimationClipSettings(clip);
                    settings.loopTime = a.loop;
                    AnimationUtility.SetAnimationClipSettings(clip, settings);
                    Save(clip, outDir + "/" + clip.name + ".anim");
                    controller.AddMotion(clip);
                }

            var go = new GameObject(d.name);
            go.AddComponent<SortingGroup>();
            go.AddComponent<Animator>().runtimeAnimatorController = controller;
            var doll = go.AddComponent<Paperdoll>();
            doll.data = d;
            doll.library = library;
            doll.equipped = d.preset.ToList();
            foreach (var s in d.slots)
                foreach (var role in new[] { "bg", "fg" })
                {
                    if (!d.items.Any(i => i.slot == s.id && i.layers.Any(l => l.role == role))) continue;
                    var child = new GameObject(s.id + "_" + role);
                    child.transform.SetParent(go.transform, false);
                    doll.nodes.Add(new PdNode { slot = s.id, role = role, renderer = child.AddComponent<SpriteRenderer>() });
                }
            doll.Body.sprite = body[d.animations[0].id + "_" + d.directions[0] + "_" + d.animations[0].frames[0].cell];
            doll.Sync();
            PrefabUtility.SaveAsPrefabAsset(go, outDir + "/" + d.name + ".prefab");
            Object.DestroyImmediate(go);
            AssetDatabase.SaveAssets();
            Debug.Log("PixelDoll: imported " + d.name + ": " + library.Sum(l => l.sprites.Length) + " sprites in " + library.Count + " layers, " + d.animations.Length * d.directions.Length + " clips -> " + outDir);
        }

        /// Each layer is sliced by its own cell (oversize layers, e.g. 96x96) with its own pivot; PPU is the base's for all.
        static Sprite[] Slice(string png, PaperdollData d, PdLayer l, PdAnim a)
        {
            var ti = (TextureImporter)AssetImporter.GetAtPath(png);
            ti.textureType = TextureImporterType.Sprite;
            ti.spriteImportMode = SpriteImportMode.Multiple;
            ti.filterMode = FilterMode.Point;
            ti.textureCompression = TextureImporterCompression.Uncompressed;
            ti.mipmapEnabled = false;
            ti.alphaIsTransparency = true;
            ti.spritePixelsPerUnit = d.ppu;
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

        static void Save(Object asset, string path)
        {
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(asset, path);
        }

        static int Gcd(int a, int b) => b == 0 ? a : Gcd(b, a % b);
    }
}
`;

const asmdef = (o: object) => JSON.stringify(o, null, 2) + '\n';

export function unityFiles(m: Manifest): OutFile[] {
  return [
    { name: 'unity/pixeldoll_unity.json', data: JSON.stringify(unityJson(m), null, 1) + '\n' },
    { name: 'unity/Runtime/Paperdoll.cs', data: PAPERDOLL_CS },
    { name: 'unity/Runtime/PixelDoll.Runtime.asmdef', data: asmdef({ name: 'PixelDoll.Runtime' }) },
    { name: 'unity/Editor/PixelDollImporter.cs', data: IMPORTER_CS },
    {
      name: 'unity/Editor/PixelDoll.Editor.asmdef',
      data: asmdef({
        name: 'PixelDoll.Editor',
        references: ['PixelDoll.Runtime', 'Unity.2D.Sprite.Editor', 'Unity.2D.Animation.Runtime'],
        includePlatforms: ['Editor'],
        versionDefines: [{ name: 'com.unity.2d.animation', expression: '1.0.0', define: 'PIXELDOLL_2D_ANIMATION' }],
      }),
    },
    {
      name: 'unity/README.txt',
      data: `Copy the whole export folder anywhere under Assets/. Requires com.unity.2d.sprite (2D Sprite); com.unity.2d.animation is
optional (adds one SpriteLibraryAsset per item layer: Category = <anim>_<dir>, Label = <cell>).
The importer runs when unity/pixeldoll_unity.json is imported, or via Tools > PixelDoll > Import All Exports.
Output in unity/Generated/: sliced sheets (Point, no compression, PPU ${m.export?.pixelsPerUnit ?? m.rig.cell.w}, pivot at the feet),
<anim>_<dir>.anim clips, ${m.name}.controller and ${m.name}.prefab (Sorting Group + Paperdoll + one SpriteRenderer per slot/role).
Runtime: Paperdoll.Play(anim, dir), Paperdoll.Equip(slot, itemId). Use a Pixel Perfect Camera for crisp pixels.
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
