using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.Rendering;
using static PixelDollNativeReview.NativePlayback;
namespace PixelDollNativeReview
{
    [Serializable] public class RenderEquip { public string slot, item; }
    [Serializable] public class RenderVariant { public string id, variant; }
    [Serializable] public class RenderCase { public string id; public RenderEquip[] items; public RenderVariant[] variants; }
    [Serializable] public class RenderPlan { public string[] labels, controls; public int frameW, frameH, pivotX, pivotY; public string preset; public RenderCase[] cases; }

    /// GPU proof: the exported prefab, driven by its Animator and runtime API, is drawn by a camera and read back pixel by pixel.
    public static class NativeRender
    {
        const int Layer = 31;

        public static void Verify(string label, GameObject prefab, Data data, RenderPlan plan, string expectedDir, string failureDir)
        {
            Check(SystemInfo.graphicsDeviceType != GraphicsDeviceType.Null, label + ": rendering device", SystemInfo.graphicsDeviceType + " " + QualitySettings.activeColorSpace);
            if (SystemInfo.graphicsDeviceType == GraphicsDeviceType.Null) return;
            int w = plan.frameW, h = plan.frameH;
            var instance = UnityEngine.Object.Instantiate(prefab, Vector3.zero, Quaternion.identity);
            foreach (var t in instance.GetComponentsInChildren<Transform>(true)) t.gameObject.layer = Layer;
            var doll = instance.GetComponents<MonoBehaviour>().First(component => component.GetType().FullName == "PixelDoll." + data.exportId + ".Paperdoll");
            var animator = instance.GetComponent<Animator>(); animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
            var clock = (SpriteRenderer)Field(doll, "clock");
            var target = new RenderTexture(w, h, 24, RenderTextureFormat.ARGB32) { filterMode = FilterMode.Point, antiAliasing = 1 };
            target.Create();
            var camera = new GameObject("Render review camera").AddComponent<Camera>();
            camera.enabled = false;
            camera.orthographic = true;
            // One render-texture pixel per source pixel, with the doll's pivot at the frame's pivot (both measured from the top left).
            camera.orthographicSize = h / (2f * data.ppu);
            camera.transform.position = new Vector3((w / 2f - plan.pivotX) / data.ppu, (plan.pivotY - h / 2f) / data.ppu, -10f);
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0, 0, 0, 0);
            camera.cullingMask = 1 << Layer;
            camera.allowHDR = false;
            camera.allowMSAA = false;
            camera.targetTexture = target;
            var readback = new Texture2D(w, h, TextureFormat.RGBA32, false);
            var expected = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            var controlsDir = Path.Combine(Path.GetDirectoryName(expectedDir), "render-controls");
            var rejected = plan.controls.ToDictionary(control => control, control => 0);
            try
            {
                foreach (var c in plan.cases)
                {
                    Invoke(doll, "ApplyPreset", plan.preset);
                    foreach (var e in c.items) Invoke(doll, "Equip", e.slot, string.IsNullOrEmpty(e.item) ? null : e.item);
                    foreach (var material in data.materials) Invoke(doll, "SetVariant", material.id, null);
                    foreach (var v in c.variants) Invoke(doll, "SetVariant", v.id, v.variant);
                    foreach (var move in data.animations) foreach (var direction in move.directions)
                        for (var cell = 0; cell < move.cells; cell++)
                        {
                            var name = move.id + "_" + direction + "_" + cell;
                            var index = Array.FindIndex(move.frames, f => f.cell == cell);
                            Check(index >= 0, label + ": " + c.id + " frame listed " + name);
                            if (index < 0) continue;
                            // Reach the cell through the native clip at the middle of its first frame, not by assigning sprites.
                            var state = move.id + "_" + direction;
                            Invoke(doll, "Play", move.id, direction);
                            animator.Play(state, 0, 0f); animator.Update(0);
                            animator.Update((move.frames.Take(index).Sum(f => f.ms) + move.frames[index].ms / 2f) / 1000f);
                            Invoke(doll, "Sync");
                            Check(clock.sprite != null && clock.sprite.name == name, label + ": " + c.id + " Animator reaches " + name, clock.sprite ? clock.sprite.name : "null");
                            camera.Render();
                            var previous = RenderTexture.active;
                            RenderTexture.active = target;
                            readback.ReadPixels(new Rect(0, 0, w, h), 0, 0, false);
                            readback.Apply(false);
                            RenderTexture.active = previous;
                            var path = Path.Combine(expectedDir, c.id, name + ".png");
                            var loaded = expected.LoadImage(File.ReadAllBytes(path), false);
                            var mismatch = Compare(readback.GetPixels32(), loaded && expected.width == w && expected.height == h ? expected.GetPixels32() : null, w);
                            Check(mismatch == "", label + ": rendered " + c.id + " " + name, mismatch);
                            foreach (var control in plan.controls)
                            {
                                var wrong = Path.Combine(controlsDir, control, c.id, name + ".png");
                                if (!File.Exists(wrong)) continue;
                                expected.LoadImage(File.ReadAllBytes(wrong), false);
                                var differs = Compare(readback.GetPixels32(), expected.GetPixels32(), w) != "";
                                Check(differs, label + ": " + c.id + " " + name + " differs from control " + control);
                                if (differs) rejected[control]++;
                            }
                            if (mismatch != "")
                            {
                                Directory.CreateDirectory(Path.Combine(failureDir, label, c.id));
                                File.WriteAllBytes(Path.Combine(failureDir, label, c.id, name + ".png"), readback.EncodeToPNG());
                            }
                        }
                }
            }
            finally
            {
                foreach (var pair in rejected) Check(pair.Value > 0, label + ": render rejects control " + pair.Key, pair.Value + " frames");
                camera.targetTexture = null;
                UnityEngine.Object.DestroyImmediate(camera.gameObject);
                UnityEngine.Object.DestroyImmediate(instance);
                UnityEngine.Object.DestroyImmediate(readback);
                UnityEngine.Object.DestroyImmediate(expected);
                target.Release();
                UnityEngine.Object.DestroyImmediate(target);
            }
        }

        /// Exact RGBA equality; fully transparent pixels match regardless of their color channels.
        static string Compare(Color32[] actual, Color32[] expected, int w)
        {
            if (expected == null) return "expected image missing or wrong size";
            int count = 0; string first = "";
            for (var i = 0; i < actual.Length; i++)
            {
                Color32 a = actual[i], e = expected[i];
                if (a.a == 0 && e.a == 0) continue;
                if (a.r == e.r && a.g == e.g && a.b == e.b && a.a == e.a) continue;
                if (count++ == 0) first = "first at x=" + (i % w) + " y(top)=" + (expected.Length / w - 1 - i / w) + " got " + a + " want " + e;
            }
            return count == 0 ? "" : count + " pixels differ; " + first;
        }
    }
}
