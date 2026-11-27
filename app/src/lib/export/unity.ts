// Unity 2022.3 / Unity 6 export (manifest-spec §6.3): an Editor importer (no hand-written .meta) + one runtime component.
// unity/pixeldoll_unity.json is the manifest flattened for JsonUtility (no dictionaries).
import type { Manifest } from '../store/manifest.ts';
import type { OutFile } from './generic.ts';
import { handHides, hidesOf, layerFrame, variantCovers } from '../compose/compose.ts';
import { portableAssetName } from './paths.ts';
import { exportUnit } from '../rig/rig.ts';

const UNITY_RUNTIME_REVISION = 2;
const UNITY_RUNTIME_FORMAT = 1;

function exportId(m: Manifest): string {
	// Namespace + assembly identity: importing different characters must not define duplicate C# types.
	let h = 0xcbf29ce484222325n;
	for (const c of m.exportId ?? `${m.name}\0${m.rig.baseHash}`)
		h = BigInt.asUintN(64, (h ^ BigInt(c.codePointAt(0)!)) * 0x100000001b3n);
	return `Character_${h.toString(16).padStart(16, '0')}`;
}

export function unityJson(m: Manifest, folder = false) {
	const { rig } = m;
	const anchors = (clip: string, part: 'lower' | 'upper', direction: string) =>
		m.actionLayers?.planes
			.find((plane) => plane.clip === clip && plane.part === part)
			?.anchors.find((row) => row.direction === direction)
			?.cells.map((point) =>
				point ? { x: point[0], y: point[1], present: true } : { present: false }
			) ?? [];
	return {
		name: m.exportId ?? portableAssetName(m.name.replace(/[^A-Za-z0-9_-]/g, '_') || 'Paperdoll'),
		...(folder ? { runtimeFormat: UNITY_RUNTIME_FORMAT } : { exportId: exportId(m) }),
		cellW: rig.cell.w,
		cellH: rig.cell.h,
		pivotX: rig.pivot.x,
		pivotY: rig.pivot.y,
		ppu: m.export?.pixelsPerUnit ?? exportUnit(rig),
		baseItem: rig.baseItem,
		actionOmissions: m.actionLayers?.omissions ?? [],
		actionPairs:
			m.actionLayers?.pairs.map((pair) => ({
				...pair,
				lowerHip: anchors(pair.walk, 'lower', pair.direction),
				upperHip: anchors(pair.action, 'upper', pair.direction),
				cells: pair.cells.map((cell) => (cell ? { ...cell, eligible: true } : { eligible: false }))
			})) ?? [],
		directions: rig.directions.map((d) => d.id),
		animations: rig.animations.map((a) => ({
			id: a.id,
			loop: a.loop,
			cells: a.cells,
			frames: a.frames,
			directions:
				(a as typeof a & { directions?: string[] }).directions ?? rig.directions.map((d) => d.id)
		})),
		materials: (m.materials ?? []).map((mat) => ({
			...mat,
			variants: Object.entries(mat.variants).map(([id, ramp]) => ({ id, ramp }))
		})),
		presets: m.presets.map((p) => ({
			id: p.id,
			items: Object.entries(p.items).map(([slot, item]) => ({ slot, item: item ?? '' })),
			variants: Object.entries(p.variants ?? {}).map(([id, variant]) => ({ id, variant }))
		})),
		slots: m.slots.map((s) => ({
			id: s.id,
			z: s.z,
			hides: handHides(m, s.id, s.hides ?? []),
			zOverrides: (s.zOverrides ?? []).map((o) => ({
				layer: o.layer,
				z: o.z,
				dir: o.dir ?? '',
				anim: o.anim ?? '',
				cell: o.cell ?? -1
			}))
		})),
		items: m.items.map((it) => ({
			id: it.id,
			slot: it.slot,
			variantOf: it.variantOf ?? '',
			underAll: variantCovers(it),
			materials: it.materials ?? [],
			hasHides: !!it.hides,
			hides: it.hides ? hidesOf(m, it) : [],
			layers: it.layers.map((l) => {
				const f = layerFrame(rig, l); // oversize layers: own cell + pivot; PPU stays the base's, so world scale matches
				return {
					id: l.id,
					role: l.role,
					z: l.z,
					cellW: f.w,
					cellH: f.h,
					pivotX: f.x,
					pivotY: f.y,
					sheets: rig.animations.map((a) => l.sheets![a.id]),
					sourceSheets: rig.animations.map((a) => l.sourceSheets?.[a.id] ?? l.sheets![a.id]),
					lowerSheets: rig.animations.map((a) => l.actionSheets?.lower?.[a.id] ?? ''),
					upperSheets: rig.animations.map((a) => l.actionSheets?.upper?.[a.id] ?? '')
				};
			})
		})),
		preset: Object.entries(m.presets[0]?.items ?? {}).map(([slot, item]) => ({
			slot,
			item: item ?? ''
		}))
	};
}

export const PAPERDOLL_CS = `using System;
using System.Collections.Generic;
using UnityEngine;

namespace PixelDoll
{
    [Serializable] public class PdActionHip { public int x, y; public bool present; }
    [Serializable] public class PdActionCell { public bool eligible; public int x, y; }
    [Serializable] public class PdActionOmission { public string clip, direction; public string[] items; }
    [Serializable] public class PdActionPair { public string walk, action, direction; public int upperCells; public string[] blocked; public PdActionCell[] cells; public PdActionHip[] lowerHip, upperHip; }
    [Serializable] public class PdFrame { public int cell; public int ms; }
    [Serializable] public class PdAnim { public string id; public bool loop; public int cells; public PdFrame[] frames; public string[] directions; }
    [Serializable] public class PdZOverride { public string layer; public int z; public string dir; public string anim; public int cell = -1; }
    [Serializable] public class PdSlot { public string id; public int z; public string[] hides; public PdZOverride[] zOverrides; }
    [Serializable] public class PdLayer { public string id; public string role; public int z, cellW, cellH, pivotX, pivotY; public string[] sheets, sourceSheets, lowerSheets, upperSheets; }
    [Serializable] public class PdItem { public string id, slot, variantOf; public bool hasHides; public string[] hides, materials, underAll; public PdLayer[] layers; }
    [Serializable] public class PdEquip { public string slot; public string item; }
    [Serializable] public class PdSprites { public string item; public string layer; public Sprite[] sprites, sources, lower, upper; }
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
        public PdActionPair[] actionPairs;
        public PdActionOmission[] actionOmissions;
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
        bool layerActions, actionLayered;
        PdAnim action;
        string actionDirection, actionWalk;
        int actionLowerCell;
        double actionElapsed, actionDuration;
        readonly List<SpriteRenderer> upperNodes = new List<SpriteRenderer>();

        public SpriteRenderer Body => nodes.Find(n => n.slot == "body" && n.role == "fg")?.renderer;

        /// Selects the generated state, preserving active playback and replaying a completed non-looping clip.
        public bool Play(string anim, string dir, bool restart = false)
        {
            var move = Array.Find(data.animations, a => a.id == anim);
            if (move == null || Array.IndexOf(move.directions, dir) < 0) { Debug.LogWarning("PixelDoll: unavailable move/direction " + anim + "/" + dir, this); return false; }
            action = null;
            dirty = true;
            var animator = GetComponent<Animator>();
            var stateName = anim + "_" + dir;
            var current = animator.GetCurrentAnimatorStateInfo(0);
            if (restart || (!move.loop && current.shortNameHash == Animator.StringToHash(stateName) && current.normalizedTime >= 1f)) animator.Play(stateName, 0, 0f);
            else animator.Play(stateName);
            return true;
        }

        /// Turns the active move to dir without restarting it: playlist entry, time, loop count and completion are kept.
        public bool SetDirection(string dir)
        {
            var animator = GetComponent<Animator>();
            animator.Update(0f); // applies a Play requested earlier this frame before reading the active state
            var current = animator.GetCurrentAnimatorStateInfo(0);
            PdAnim move = null;
            string active = null;
            foreach (var a in data.animations) foreach (var d in a.directions) if (current.shortNameHash == Animator.StringToHash(a.id + "_" + d)) { move = a; active = d; }
            if (move == null) { Debug.LogWarning("PixelDoll: no active move", this); return false; }
            if (Array.IndexOf(move.directions, dir) < 0) { Debug.LogWarning("PixelDoll: unavailable move/direction " + move.id + "/" + dir, this); return false; }
            if (dir == active) return true;
            if (action != null && actionLayered && active == actionDirection) Sync();
            // Directions of one move share their timeline, so the normalized time (whole loops included) carries over.
            animator.Play(move.id + "_" + dir, 0, current.normalizedTime);
            animator.Update(0f);
            dirty = true;
            Sync();
            return true;
        }

        public bool IsActionPlaying => action != null;

        public void SetActionLayering(bool enabled)
        {
            layerActions = enabled;
        }

        public bool CanLayerAction(string anim, string dir)
        {
            var move = Array.Find(data.animations, a => a.id == anim);
            if (move == null || Array.IndexOf(move.directions, dir) < 0 || !clock || clock.sprite == null) return false;
            ParsePose(clock.sprite.name, out var walk, out var facing, out _);
            return facing == dir && ActionOutfitSupported(walk, dir, anim);
        }

        bool ActionOutfitSupported(string walk, string dir, string anim)
        {
            var pair = ActionPair(walk, dir, anim);
            if (pair == null) return false;
            var hidden = HiddenSlots();
            return !equipped.Exists(e => !hidden.Contains(e.slot) && Array.IndexOf(pair.blocked, Shown(e.item)) >= 0);
        }

        public string PlayAction(string anim, string dir)
        {
            var move = Array.Find(data.animations, a => a.id == anim);
            if (move == null || Array.IndexOf(move.directions, dir) < 0)
            {
                Debug.LogWarning("PixelDoll: unavailable move/direction " + anim + "/" + dir, this);
                return "";
            }
            GetComponent<Animator>().Update(0f); // applies a Play requested earlier this frame before reading the gait it layers over
            actionLayered = layerActions && CanLayerAction(anim, dir);
            action = move;
            actionDirection = dir;
            actionElapsed = actionDuration = 0;
            foreach (var frame in move.frames) actionDuration += frame.ms;
            dirty = true;
            Sync();
            return actionLayered ? "layered" : "full";
        }

        PdActionPair ActionPair(string walk, string dir, string move) =>
            Array.Find(data.actionPairs ?? Array.Empty<PdActionPair>(), p => p.walk == walk && p.action == move && p.direction == dir);

        void CheckActionOutfit()
        {
            if (action != null && actionLayered) actionLayered = ActionOutfitSupported(actionWalk, actionDirection, action.id);
        }

        Vector2Int? PairOffset(string walk, string dir, int lower, string move, int upper)
        {
            var pair = ActionPair(walk, dir, move);
            if (pair == null) return null;
            var cell = pair.cells[lower * pair.upperCells + upper];
            if (cell == null || !cell.eligible) return null;
            var lo = pair.lowerHip[lower];
            var hi = pair.upperHip[upper];
            return lo.present && hi.present ? new Vector2Int(lo.x - hi.x + cell.x, lo.y - hi.y + cell.y) : (Vector2Int?)null;
        }

        /// Equips itemId in slot (null or "" = empty); hides are re-applied on the next LateUpdate.
        public bool Equip(string slot, string itemId)
        {
            var item = Item(itemId);
            if (slot == "body" || Slot(slot) == null || (!string.IsNullOrEmpty(itemId) && (item == null || item.slot != slot || !string.IsNullOrEmpty(item.variantOf)))) { Debug.LogWarning("PixelDoll: invalid equipment for " + slot, this); return false; }
            var e = equipped.Find(x => x.slot == slot);
            if (e == null) equipped.Add(e = new PdEquip { slot = slot });
            e.item = itemId ?? "";
            CheckActionOutfit();
            dirty = true;
            return true;
        }

        /// Uses exported exact palette ramps. null removes an explicit selection and restores the material default.
        public bool SetVariant(string id, string variant)
        {
            if (Array.Find(data.materials, m => m.id == id) == null) { Debug.LogWarning("PixelDoll: unknown material " + id, this); return false; }
            variants.RemoveAll(v => v.id == id);
            if (variant != null) variants.Add(new PdVariant { id = id, variant = variant });
            dirty = true;
            return true;
        }

        public bool ApplyPreset(string id)
        {
            var p = Array.Find(data.presets, x => x.id == id);
            if (p == null) { Debug.LogWarning("PixelDoll: unknown outfit " + id, this); return false; }
            equipped = new List<PdEquip>();
            foreach (var e in p.items) if (e.slot != "body") equipped.Add(new PdEquip { slot = e.slot, item = e.item });
            equipped.Add(new PdEquip { slot = "body", item = data.baseItem });
            variants = new List<PdVariant>();
            foreach (var v in p.variants) variants.Add(new PdVariant { id = v.id, variant = v.variant });
            CheckActionOutfit();
            dirty = true;
            return true;
        }

        void LateUpdate()
        {
            if (action != null)
            {
                actionElapsed += Time.deltaTime * 1000.0;
                if (actionElapsed >= actionDuration) action = null;
                dirty = true;
            }
            Sync();
        }
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
                    AddPlane("lower", l.lower);
                    AddPlane("upper", l.upper);
                    void AddPlane(string part, Sprite[] sprites)
                    {
                        if (sprites == null || sprites.Length == 0) return;
                        var plane = new Dictionary<string, Sprite>();
                        foreach (var sp in sprites) plane[sp.name] = sp;
                        maps[part + ":" + l.item + "/" + l.layer] = plane;
                    }
                }
            }
            ParsePose(s.name, out var anim, out var dir, out var cell);
            var hidden = HiddenSlots();
            foreach (var renderer in upperNodes) renderer.enabled = false;
            var visible = new List<(SpriteRenderer renderer, int z, int order)>();
            if (action == null) RenderStack(visible, anim, dir, cell, "", hidden, false, Vector3.zero);
            else
            {
                var elapsed = actionElapsed;
                int index = 0;
                while (index + 1 < action.frames.Length && elapsed >= action.frames[index].ms)
                {
                    elapsed -= action.frames[index].ms;
                    index++;
                }
                int upperCell = action.frames[index].cell;
                if (actionLayered && dir == actionDirection)
                {
                    actionWalk = anim;
                    actionLowerCell = cell;
                }
                var offset = actionLayered
                    ? PairOffset(actionWalk, actionDirection, actionLowerCell, action.id, upperCell) : null;
                var omitted = Array.Find(data.actionOmissions, row => row.clip == action.id && row.direction == actionDirection)?.items;
                if (offset == null) RenderStack(visible, action.id, actionDirection, upperCell, "", hidden, false, Vector3.zero, omitted);
                else
                {
                    RenderStack(visible, actionWalk, actionDirection, actionLowerCell, "lower", hidden, false, Vector3.zero, omitted);
                    RenderStack(visible, action.id, actionDirection, upperCell, "upper", hidden, true,
                        new Vector3(offset.Value.x / data.ppu, -offset.Value.y / data.ppu), omitted);
                }
            }
            visible.Sort((a, b) => a.z != b.z ? a.z.CompareTo(b.z) : a.order.CompareTo(b.order));
            for (int i = 0; i < visible.Count; i++) visible[i].renderer.sortingOrder = i;
        }

        static void ParsePose(string name, out string anim, out string dir, out int cell)
        {
            int c2 = name.LastIndexOf('_'), c1 = name.LastIndexOf('_', c2 - 1);
            anim = name.Substring(0, c1);
            dir = name.Substring(c1 + 1, c2 - c1 - 1);
            cell = int.Parse(name.Substring(c2 + 1));
        }

        HashSet<string> HiddenSlots()
        {
            var hidden = new HashSet<string>();
            var baseItem = Item(data.baseItem);
            if (baseItem != null)
                foreach (var h in baseItem.hasHides ? baseItem.hides : Slot("body")?.hides ?? Array.Empty<string>()) hidden.Add(h);
            var worn = new List<PdItem>();
            foreach (var e in equipped)
            {
                if (e.slot == "body") continue;
                var it = Item(e.item);
                if (it != null) worn.Add(it);
            }
            string[] HidesOf(PdItem it) => it.hasHides ? it.hides : Slot(it.slot)?.hides ?? Array.Empty<string>();
            int At(string slot) => Array.FindIndex(data.slots, x => x.id == slot);
            foreach (var it in worn)
            {
                // Of two worn items that hide each other's slot (two two-handed items), the later slot stays visible.
                if (worn.Exists(o => o != it && Array.IndexOf(HidesOf(it), o.slot) >= 0 && Array.IndexOf(HidesOf(o), it.slot) >= 0 && At(o.slot) > At(it.slot))) continue;
                foreach (var h in HidesOf(it)) hidden.Add(h);
            }
            return hidden;
        }

        void RenderStack(List<(SpriteRenderer renderer, int z, int order)> visible, string anim, string dir, int cell, string part, HashSet<string> hidden, bool upper, Vector3 offset, string[] omitted = null)
        {
            string name = anim + "_" + dir + "_" + cell;
            for (int i = 0; i < nodes.Count; i++)
            {
                var n = nodes[i];
                var it = Item(Shown(n.slot == "body" ? data.baseItem : equipped.Find(x => x.slot == n.slot)?.item));
                var layer = it == null ? null : Array.Find(it.layers, l => l.role == n.role);
                var renderer = upper ? UpperNode(i) : n.renderer;
                renderer.enabled = false;
                if (layer == null || hidden.Contains(n.slot) || (omitted != null && Array.IndexOf(omitted, it.id) >= 0)) continue;
                var key = (part.Length == 0 ? "" : part + ":") + it.id + "/" + layer.id;
                if (!maps.TryGetValue(key, out var m) || !m.TryGetValue(name, out var sp)) continue;
                renderer.sprite = Recolor(it, sp);
                if (upper) renderer.transform.localPosition = offset;
                renderer.enabled = true;
                visible.Add((renderer, Z(Slot(n.slot), layer, anim, dir, cell), i * 2 + (upper ? 1 : 0)));
            }
        }

        SpriteRenderer UpperNode(int i)
        {
            while (upperNodes.Count <= i)
            {
                var child = new GameObject("action_upper_" + upperNodes.Count);
                child.transform.SetParent(transform, false);
                upperNodes.Add(child.AddComponent<SpriteRenderer>());
            }
            return upperNodes[i];
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
            string shown = id;
            int count = 0;
            foreach (var variant in data.items)
            {
                var required = variant.underAll ?? Array.Empty<string>();
                if (variant.variantOf == id && required.Length > count && Array.TrueForAll(required, cover => equipped.Exists(e => e.item == cover)))
                {
                    shown = variant.id;
                    count = required.Length;
                }
            }
            return shown;
        }
        PdSlot Slot(string id) => Array.Find(data.slots, s => s.id == id);
    }
}
`;

const SHARED_IMPORT_HOOKS = `        const int RuntimeFormat = ${UNITY_RUNTIME_FORMAT};
        const int RuntimeRevision = ${UNITY_RUNTIME_REVISION};
        static readonly HashSet<string> Pending = new HashSet<string>();

        static void OnPostprocessAllAssets(string[] imported, string[] deleted, string[] moved, string[] movedFrom, bool didDomainReload)
        {
            foreach (var path in imported.Concat(moved)) Queue(path);
            const string generated = "/unity/Generated";
            foreach (var path in deleted.Concat(movedFrom))
                if (path.EndsWith(generated)) Queue(path.Substring(0, path.Length - generated.Length) + Json);
            if (!didDomainReload) return;
            foreach (var guid in AssetDatabase.FindAssets("pixeldoll_unity t:TextAsset", new[] { "Assets" }))
                Queue(AssetDatabase.GUIDToAssetPath(guid));
        }

        static void Queue(string path)
        {
            if (!path.StartsWith("Assets/") || !path.EndsWith(Json) || !Pending.Add(path)) return;
            EditorApplication.delayCall += () =>
            {
                Pending.Remove(path);
                if (!File.Exists(path)) return;
                try { Import(path); }
                catch (System.Exception error) { Debug.LogError("PixelDoll: could not import " + path + ": " + error.Message); }
            };
        }

        static bool Supports(string json)
        {
            // JsonUtility alone does not distinguish an omitted field from one explicitly set to its default.
            using (var reader = JsonReaderWriterFactory.CreateJsonReader(Encoding.UTF8.GetBytes(json), XmlDictionaryReaderQuotas.Max))
            {
                reader.MoveToContent();
                if (reader.GetAttribute("type") != "object") return false;
                reader.ReadStartElement("root");
                int format = 0;
                while (reader.MoveToContent() == XmlNodeType.Element)
                {
                    if (reader.Name == "exportId") return false;
                    if (reader.Name != "runtimeFormat") { reader.Skip(); continue; }
                    if (format != 0 || reader.GetAttribute("type") != "number" ||
                        !int.TryParse(reader.ReadElementContentAsString(), NumberStyles.None, CultureInfo.InvariantCulture, out format) ||
                        format < 1 || format > RuntimeFormat) return false;
                }
                return format != 0;
            }
        }

        static void CheckAssetPath(string path, HashSet<string> checkedPaths)
        {
            if (!checkedPaths.Add(path)) return;
            foreach (var segment in path.Split('/'))
                if (segment.Length == 0 || segment.TrimEnd(' ', '.') != segment ||
                    segment.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || segment.Contains(":") || segment.Contains("\\\\"))
                    throw new InvalidDataException("Unsafe asset path: " + path);
            // Unity may write the asset's sidecar too. Reject junctions and symlinks on either path.
            var directory = Path.GetDirectoryName(path).Replace('\\\\', '/');
            if (directory.Length != 0) CheckAssetPath(directory, checkedPaths);
            CheckLink(path);
            CheckLink(path + ".meta");
        }

        static void CheckLink(string path)
        {
            FileAttributes attributes;
            try { attributes = File.GetAttributes(path); }
            catch (FileNotFoundException) { return; }
            catch (DirectoryNotFoundException) { return; }
            if ((attributes & FileAttributes.ReparsePoint) != 0)
                throw new InvalidDataException("Linked asset path: " + path);
        }

        static string[] ValidatePaths(string root, string outDir, PaperdollData data, HashSet<string> checkedPaths)
        {
            var generated = new List<string>();
            void Output(string stem, string ext)
            {
                if (string.IsNullOrEmpty(stem) || stem.Contains("/"))
                    throw new InvalidDataException("Invalid generated asset name: " + stem);
                var path = outDir + "/" + stem + ext;
                CheckAssetPath(path, checkedPaths);
                generated.Add(path);
            }
            Output(data.name, ".controller");
            Output(data.name, ".prefab");
            foreach (var anim in data.animations)
                foreach (var dir in anim.directions) Output(anim.id + "_" + dir, ".anim");

            foreach (var item in data.items)
                foreach (var layer in item.layers)
                {
                    void Sheets(string[] paths, bool required)
                    {
                        if (paths == null && !required) return;
                        if (paths == null || paths.Length != data.animations.Length)
                            throw new InvalidDataException("Sheets must match the animations.");
                        foreach (var sheet in paths)
                        {
                            if (!required && string.IsNullOrEmpty(sheet)) continue;
                            if (string.IsNullOrEmpty(sheet) || !sheet.EndsWith(".png", System.StringComparison.OrdinalIgnoreCase))
                                throw new InvalidDataException("Expected a relative PNG path: " + sheet);
                            var path = root + "/" + sheet;
                            CheckAssetPath(path, checkedPaths);
                            if (!(AssetImporter.GetAtPath(path) is TextureImporter))
                                throw new InvalidDataException("Missing texture: " + path);
                        }
                    }
                    Sheets(layer.sheets, true);
                    Sheets(layer.sourceSheets, true);
                    Sheets(layer.lowerSheets, false);
                    Sheets(layer.upperSheets, false);
                }
            return generated.Distinct().ToArray();
        }

        [System.Serializable]
        sealed class GeneratedAsset
        {
            public string name;
            public string hash;
        }

        [System.Serializable]
        sealed class GeneratedAssets
        {
            public GeneratedAsset[] entries;
        }

        static string Fingerprint(string path)
        {
            // Hash serialized object data instead of Unity's on-disk YAML or binary representation.
            IEnumerable<Object> assets = AssetDatabase.LoadAllAssetsAtPath(path);
            if (AssetDatabase.LoadMainAssetAtPath(path) is GameObject prefab)
                assets = prefab.GetComponentsInChildren<Transform>(true)
                    .SelectMany(child => child.GetComponents<Component>().Cast<Object>().Prepend(child.gameObject));
            var data = new StringBuilder();
            var importer = AssetImporter.GetAtPath(path);
            if (importer != null) data.Append(EditorJsonUtility.ToJson(importer)).Append('\\n');
            foreach (var entry in assets.Where(asset => asset != null)
                .Select(asset => (id: GlobalObjectId.GetGlobalObjectIdSlow(asset).ToString(), asset))
                .OrderBy(entry => entry.id, System.StringComparer.Ordinal))
                data.Append(entry.id).Append('\\n').Append(EditorJsonUtility.ToJson(entry.asset)).Append('\\n');
            return Hash128.Compute(data.ToString()).ToString();
        }

        static string[] PriorOutputs(string outDir, string index, string[] outputs, HashSet<string> checkedPaths)
        {
            if (File.Exists(outDir)) return null;
            if (!Directory.Exists(outDir)) return System.Array.Empty<string>();
            if (!File.Exists(index))
                return Directory.EnumerateFileSystemEntries(outDir).Any() ? null : System.Array.Empty<string>();
            var saved = JsonUtility.FromJson<GeneratedAssets>(File.ReadAllText(index));
            if (saved?.entries == null || saved.entries.Length == 0) return null;
            var known = new HashSet<string>(System.StringComparer.OrdinalIgnoreCase);
            foreach (var entry in saved.entries)
            {
                if (entry == null || string.IsNullOrEmpty(entry.name) || entry.name.Contains("/") || !known.Add(entry.name))
                    return null;
                var path = outDir + "/" + entry.name;
                CheckAssetPath(path, checkedPaths);
                if (!File.Exists(path) || Fingerprint(path) != entry.hash) return null;
            }
            foreach (var path in outputs)
                if (!known.Contains(Path.GetFileName(path)) &&
                    (File.Exists(path) || Directory.Exists(path) || File.Exists(path + ".meta") || Directory.Exists(path + ".meta")))
                    return null;
            return saved.entries.Select(entry => outDir + "/" + entry.name).ToArray();
        }

        static void RecordGenerated(string index, IEnumerable<string> outputs)
        {
            var state = new GeneratedAssets
            {
                entries = outputs.Select(path => new GeneratedAsset { name = Path.GetFileName(path), hash = Fingerprint(path) }).ToArray()
            };
            File.WriteAllText(index, JsonUtility.ToJson(state, true));
        }
`;

function importerSource(folder = false) {
	return `using System.Collections.Generic;
using System.IO;
using System.Linq;${folder ? '\nusing System.Globalization;\nusing System.Runtime.Serialization.Json;\nusing System.Text;\nusing System.Xml;' : ''}
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
    /// Output: <export>/unity/Generated/. Runs on import of unity/pixeldoll_unity.json and ${folder ? 'after scripts reload.' : 'from Tools > PixelDoll.'}
    public class PixelDollImporter : AssetPostprocessor
    {
        const string Json = "/unity/pixeldoll_unity.json";
${
	folder
		? SHARED_IMPORT_HOOKS
		: `        const string ExportId = "__EXPORT_ID__";

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
`
}
        ${folder ? 'static' : 'public static'} void Import(string jsonPath)
        {
            var unityDir = Path.GetDirectoryName(jsonPath).Replace('\\\\', '/');
            var root = Path.GetDirectoryName(unityDir).Replace('\\\\', '/');${
							folder
								? `
            if (!root.StartsWith("Assets/")) return;
            var checkedPaths = new HashSet<string>();
            CheckAssetPath(jsonPath, checkedPaths);
            var json = File.ReadAllText(jsonPath);
            if (!Supports(json)) return;
            var d = JsonUtility.FromJson<PaperdollData>(json);
            var outDir = unityDir + "/Generated";
            var outputs = ValidatePaths(root, outDir, d, checkedPaths);
            var digest = Hash128.Compute(RuntimeRevision + ":" + json).ToString();
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(outDir + "/" + d.name + ".prefab");
            if (prefab != null && prefab.GetComponent<Paperdoll>()?.importDigest == digest && outputs.All(File.Exists)) return;
            var index = outDir + "/.pixeldoll-generated.json";
            CheckAssetPath(index, checkedPaths);
            var prior = PriorOutputs(outDir, index, outputs, checkedPaths);
            if (prior == null)
            {
                Debug.LogWarning("PixelDoll: skipped updating " + jsonPath + " because generated assets have changed or have no recorded baseline. Delete " + outDir + "/ to rebuild them.");
                return;
            }`
								: `
            var d = JsonUtility.FromJson<PaperdollData>(File.ReadAllText(jsonPath));
            if (d.exportId != ExportId) return; // other exported characters have independent assemblies/importers
            var outDir = unityDir + "/Generated";`
						}
            if (!AssetDatabase.IsValidFolder(outDir)) AssetDatabase.CreateFolder(unityDir, "Generated");

            var library = new List<PdSprites>();
            foreach (var it in d.items)
                foreach (var l in it.layers)
                {
                    var sprites = new List<Sprite>();
                    var sources = new List<Sprite>();
                    var lower = new List<Sprite>();
                    var upper = new List<Sprite>();
                    for (int a = 0; a < d.animations.Length; a++)
                    {
                        var sliced = Slice(root + "/" + l.sheets[a], d, l, d.animations[a]);
                        sprites.AddRange(sliced);
                        sources.AddRange(l.sourceSheets[a] == l.sheets[a] ? sliced : Slice(root + "/" + l.sourceSheets[a], d, l, d.animations[a]));
                        if (l.lowerSheets != null && !string.IsNullOrEmpty(l.lowerSheets[a])) lower.AddRange(Slice(root + "/" + l.lowerSheets[a], d, l, d.animations[a]));
                        if (l.upperSheets != null && !string.IsNullOrEmpty(l.upperSheets[a])) upper.AddRange(Slice(root + "/" + l.upperSheets[a], d, l, d.animations[a]));
                    }
                    library.Add(new PdSprites { item = it.id, layer = l.id, sprites = sprites.ToArray(), sources = sources.ToArray(), lower = lower.ToArray(), upper = upper.ToArray() });
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
            doll.library = library;${folder ? '\n            doll.importDigest = digest;' : ''}
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
            ${
							folder
								? `foreach (var output in outputs) AssetDatabase.SaveAssetIfDirty(AssetDatabase.GUIDFromAssetPath(output));
            RecordGenerated(index, outputs.Union(prior, System.StringComparer.OrdinalIgnoreCase));`
								: 'AssetDatabase.SaveAssets();'
						}
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
}

export const IMPORTER_CS = importerSource();

const asmdef = (o: object) => JSON.stringify(o, null, 2) + '\n';

function unityRuntimeFiles(ns: string, runtime: string, importer: string) {
	return [
		{ name: 'Runtime/Paperdoll.cs', data: runtime },
		{ name: 'Runtime/PixelDoll.Runtime.asmdef', data: asmdef({ name: `${ns}.Runtime` }) },
		{ name: 'Editor/PixelDollImporter.cs', data: importer },
		{
			name: 'Editor/PixelDoll.Editor.asmdef',
			data: asmdef({
				name: `${ns}.Editor`,
				references: [`${ns}.Runtime`, 'Unity.2D.Sprite.Editor'],
				includePlatforms: ['Editor']
			})
		}
	];
}

export const unityRuntime = {
	revision: UNITY_RUNTIME_REVISION,
	files: unityRuntimeFiles(
		'PixelDoll',
		PAPERDOLL_CS.replace(
			'        public PaperdollData data;',
			'        public PaperdollData data;\n        [HideInInspector] public string importDigest;'
		),
		importerSource(true)
	)
};

export function unityFiles(m: Manifest, folder = false): OutFile[] {
	const identity = exportId(m);
	const ns = folder ? 'PixelDoll' : `PixelDoll.${identity}`;
	const data = unityJson(m, folder);
	const embedded = folder
		? []
		: unityRuntimeFiles(
				ns,
				PAPERDOLL_CS.replace('namespace PixelDoll', `namespace ${ns}`),
				IMPORTER_CS.replace('namespace PixelDoll.Editor', `namespace ${ns}.Editor`).replaceAll(
					'__EXPORT_ID__',
					identity
				)
			).map((f) => ({ ...f, name: 'unity/' + f.name }));
	return [
		{ name: 'unity/pixeldoll_unity.json', data: JSON.stringify(data, null, 1) + '\n' },
		...embedded,
		{
			name: 'unity/README.txt',
			data: `${
				folder
					? `Unity 2022.3 / Unity 6. Install com.unity.2d.sprite (2D Sprite) with Package Manager and keep the character under Assets/.
The shared runtime is ../pixeldoll-unity/Runtime/Paperdoll.cs and its importer is ../pixeldoll-unity/Editor/PixelDollImporter.cs
relative to this character folder. When copying the character, copy pixeldoll-unity too and keep them in the same parent folder.
Use a single Unity export destination under Assets/ in each project. A second destination, even a sibling, would install
duplicate PixelDoll assemblies. Unity imports the character automatically when its JSON is imported or scripts reload.
If generated assets were edited or created by an importer without edit tracking, Unity logs a warning and preserves them.
Delete unity/Generated/ to rebuild from the export. Customize a prefab variant outside that folder to keep receiving updates.`
					: `Unity 2022.3 / Unity 6. Install com.unity.2d.sprite (2D Sprite) with Package Manager, then copy the whole export folder
under Assets/. No 2D Animation package is required. Keep this character in one folder: re-export into that same folder.
Different characters use independent namespaces and assemblies; do not import two copies of the same character.
If replacing an older PixelDoll exporter, remove its unity/Runtime and unity/Editor scripts first to avoid stale assembly definitions.
The importer runs on unity/pixeldoll_unity.json import. After scripts finish compiling, use
Tools > PixelDoll > ${identity} > Import if no prefab appeared.`
			}
Output in unity/Generated/: sliced sheets (Point, no compression, PPU ${m.export?.pixelsPerUnit ?? exportUnit(m.rig)}, pivot at the feet),
<anim>_<dir>.anim clips for supported views, ${data.name}.controller and ${data.name}.prefab
(Sorting Group + Paperdoll + one SpriteRenderer per slot/role and a hidden animation clock).
Runtime namespace: ${ns}. Paperdoll.Play(anim, dir, restart = false), SetDirection(dir), Equip(slot, itemId), ApplyPreset(presetId), SetVariant(materialId, variantName).
Call SetActionLayering(true) to enable moving attacks when the ${folder ? 'character export' : 'ZIP'} contains precut fragments. CanLayerAction(move, direction) checks the whole action set and equipped gear. Invalid PlayAction calls warn and return an empty string without changing playback. PlayAction(move, direction) returns "layered" or "full", plays once and leaves the gait clock running. Read IsActionPlaying for completion. Calling Play cancels the action. An outfit that cannot be layered switches the action to full once; it stays full until the next action. A layered action holds the last gait cell in the action's direction when the gait faces away. Turning back resumes drawing the current gait cell. Both clocks keep running.
Play preserves an active clip's progress. Calling it again after the same non-looping clip completes replays that clip.
Changed moves/directions start at the beginning. Pass true as Play's third argument to restart explicitly.
SetDirection turns the active move (e.g. an aimed attack) and keeps its frame, time, loop count and completion without replaying it; the current direction is a no-op.
These methods return true on success; invalid move/direction, equipment, outfit or material IDs, or SetDirection without an active move, return false and log an engine warning before changing state. Unequip with null or "".
SetVariant changes one explicit selection using exported exact ramps; null restores the default, while "" uses source colors. Linked materials follow their target's selection.
Palettes are owner-local, use the original source sheets and cache recolored textures/sprites per doll until it is destroyed.
Source textures are readable for these swaps. Do not put them in a Sprite Atlas (packing/rotation changes their source coordinates).
Default preview colors are persistent sprite assets; changing presets/colors is applied during Play Mode.
Use a Pixel Perfect Camera and a sprite-compatible material for your render pipeline (including URP 2D).
Verify target platform texture overrides preserve full sheet dimensions, RGBA color and uncompressed pixels.
`
		}
	];
}

export function selfTest() {
	const m = {
		name: 'my hero',
		rig: {
			cell: { w: 64, h: 64 },
			pivot: { x: 32, y: 60 },
			baseItem: 'base',
			directions: [{ id: 'south' }],
			animations: [{ id: 'walk', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }]
		},
		slots: [{ id: 'head', z: 130, zOverrides: [{ layer: 'fg', z: 5, dir: 'north' }] }],
		items: [
			{
				id: 'helm',
				slot: 'head',
				hides: ['hair'],
				layers: [{ id: 'main', role: 'fg', z: 130, sheets: { walk: 'w.png' } }]
			}
		],
		presets: [{ items: { head: 'helm', hair: null } }]
	} as unknown as Manifest;
	const u = unityJson(m);
	console.assert(
		u.name === 'my_hero' &&
			u.ppu === 64 &&
			u.items[0].layers[0].sheets[0] === 'w.png' &&
			u.items[0].hasHides,
		'unity json flattening'
	);
	console.assert(
		u.slots[0].zOverrides[0].cell === -1 &&
			u.slots[0].zOverrides[0].anim === '' &&
			u.preset[1].item === '',
		'unity json: absent = -1 / ""'
	);
	console.assert(
		u.items[0].layers[0].cellW === 64 && u.items[0].layers[0].pivotY === 60,
		'unity json: per-layer cell/pivot default = rig'
	);
	Object.assign(m.items[0].layers[0], { cell: { w: 96, h: 96 }, pivot: { x: 48, y: 76 } });
	const u2 = unityJson(m).items[0].layers[0];
	console.assert(
		u2.cellW === 96 && u2.pivotY === 76 && unityJson(m).ppu === 64,
		'unity json: oversize layer keeps the base PPU'
	);
	console.assert(
		IMPORTER_CS.includes(".Replace('\\\\', '/')"),
		'C# backslash literal survives the template string'
	);
}
