using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEditor.Build.Reporting;
using static PixelDollNativeReview.NativePlayback;

namespace PixelDollNativeReview
{
    public static class Runner
    {
        static Inputs inputs;
        static string project;
        static Type TypeOf(string name) => AppDomain.CurrentDomain.GetAssemblies().Select(assembly => assembly.GetType(name)).First(type => type != null);
        static Data Read(Input input) => JsonUtility.FromJson<Data>(File.ReadAllText(input.json));
        static string Generated(Input input) => input.root + "/unity/Generated/";

        public static void ProbeDurations()
        {
            var input = JsonUtility.FromJson<Inputs>(File.ReadAllText(Path.Combine(Path.GetDirectoryName(Application.dataPath), "review-inputs.json"))).exports[0];
            var data = Read(input);
            var source = AssetDatabase.LoadAssetAtPath<AnimationClip>(Generated(input) + data.animations[0].id + "_" + data.animations[0].directions[0] + ".anim");
            var binding = AnimationUtility.GetObjectReferenceCurveBindings(source)[0];
            var sprites = AnimationUtility.GetObjectReferenceCurve(source, binding).Select(key => key.value).Distinct().ToArray();
            var results = new DurationResults();
            foreach (var durations in new[] { new[] { 100 }, new[] { 100, 100, 100 }, new[] { 80, 180, 100 }, new[] { 80, 180, 20 }, new[] { 83, 177, 101 } })
            {
                var gcd = durations.Aggregate(0, Gcd);
                foreach (var variant in new[] { "terminal-at-end", "stop-time", "terminal-at-last-tick" })
                {
                    var clip = new AnimationClip { frameRate = 1000f / gcd };
                    var keys = new List<ObjectReferenceKeyframe>(); int ms = 0;
                    for (var index = 0; index < durations.Length; index++) { keys.Add(new ObjectReferenceKeyframe { time = ms / 1000f, value = sprites[index % sprites.Length] }); ms += durations[index]; }
                    if (variant == "terminal-at-last-tick") { if (durations.Last() > gcd) keys.Add(new ObjectReferenceKeyframe { time = (ms - gcd) / 1000f, value = keys.Last().value }); }
                    else keys.Add(new ObjectReferenceKeyframe { time = ms / 1000f, value = keys.Last().value });
                    AnimationUtility.SetObjectReferenceCurve(clip, binding, keys.ToArray());
                    var settings = AnimationUtility.GetAnimationClipSettings(clip); settings.loopTime = true;
                    if (variant == "stop-time") settings.stopTime = ms / 1000f;
                    AnimationUtility.SetAnimationClipSettings(clip, settings);
                    results.results.Add(new DurationResult { sample = string.Join("/", durations), variant = variant, length = clip.length, stopTime = AnimationUtility.GetAnimationClipSettings(clip).stopTime, expected = ms / 1000f, keyTimes = AnimationUtility.GetObjectReferenceCurve(clip, binding).Select(key => key.time).ToArray() });
                    UnityEngine.Object.DestroyImmediate(clip);
                }
            }
            File.WriteAllText(Path.Combine(Path.GetDirectoryName(Application.dataPath), "duration-variants.json"), JsonUtility.ToJson(results, true));
            EditorApplication.Exit(0);
        }
        static int Gcd(int a, int b) => b == 0 ? a : Gcd(b, a % b);

        public static void Run()
        {
            project = Path.GetDirectoryName(Application.dataPath);
            report.editor = Application.unityVersion;
            try
            {
                inputs = JsonUtility.FromJson<Inputs>(File.ReadAllText(Path.Combine(project, "review-inputs.json")));
                foreach (var input in inputs.exports) VerifyImport(input);
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                EditorSettings.enterPlayModeOptionsEnabled = true;
                EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload | EnterPlayModeOptions.DisableSceneReload;
                EditorApplication.update += WaitForPlay;
                EditorApplication.isPlaying = true;
            }
            catch (Exception exception) { Check(false, "Editor execution", exception.ToString()); Finish(); }
        }

        static void VerifyImport(Input input)
        {
            var data = Read(input);
            var importer = TypeOf("PixelDoll." + data.exportId + ".Editor.PixelDollImporter").GetMethod("Import");
            importer.Invoke(null, new object[] { input.json });
            var generated = Generated(input);
            Check(AssetDatabase.LoadAssetAtPath<GameObject>(generated + data.name + ".prefab") != null, input.label + ": prefab created");
            var guids = new Dictionary<string, string>();
            foreach (var move in data.animations) foreach (var direction in move.directions)
            {
                var path = generated + move.id + "_" + direction + ".anim";
                var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(path);
                Check(clip != null, input.label + ": clip " + move.id + "/" + direction);
                if (clip == null) continue;
                var total = move.frames.Sum(frame => (long)frame.ms) / 1000f;
                Check(AnimationUtility.GetAnimationClipSettings(clip).loopTime == move.loop, input.label + ": native loop metadata " + move.id);
                Check(Math.Abs(clip.length - total) < .0001f, input.label + ": duration " + move.id, clip.length + " / " + total);
                var bindings = AnimationUtility.GetObjectReferenceCurveBindings(clip);
                Check(bindings.Length == 1 && bindings[0].path == "clock" && bindings[0].propertyName == "m_Sprite", input.label + ": clock binding " + move.id);
                var keys = AnimationUtility.GetObjectReferenceCurve(clip, bindings[0]);
                var gcd = move.frames.Select(frame => frame.ms).Aggregate(0, Gcd);
                Check(keys.Length == move.frames.Length + (move.frames.Last().ms > gcd ? 1 : 0), input.label + ": full playlist " + move.id);
                float time = 0;
                for (var index = 0; index < move.frames.Length; index++)
                {
                    Check(Math.Abs(keys[index].time - time) < .0001f && keys[index].value.name == move.id + "_" + direction + "_" + move.frames[index].cell, input.label + ": key " + move.id + "/" + index);
                    time += move.frames[index].ms / 1000f;
                }
                Check(Math.Abs(keys.Last().time + 1f / clip.frameRate - total) < .0001f && keys.Last().value == keys[move.frames.Length - 1].value, input.label + ": final hold interval " + move.id);
                guids[path] = AssetDatabase.AssetPathToGUID(path);
            }
            foreach (var item in data.items) foreach (var layer in item.layers) foreach (var sheet in layer.sheets)
            {
                var path = input.root + "/" + sheet;
                var sprites = AssetDatabase.LoadAllAssetsAtPath(path).OfType<Sprite>().ToArray();
                Check(sprites.Length > 0, input.label + ": native slices " + item.id + "/" + layer.id);
                foreach (var sprite in sprites) Check(sprite.rect.width == layer.cellW && sprite.rect.height == layer.cellH && Math.Abs(sprite.pixelsPerUnit - data.ppu) < .0001f && Math.Abs(sprite.pivot.x - layer.pivotX) < .0001f && Math.Abs(sprite.pivot.y - (layer.cellH - layer.pivotY)) < .0001f, input.label + ": slice geometry " + sprite.name);
                var texture = AssetImporter.GetAtPath(path) as TextureImporter;
                Check(texture != null && texture.filterMode == FilterMode.Point && texture.textureCompression == TextureImporterCompression.Uncompressed && texture.npotScale == TextureImporterNPOTScale.None, input.label + ": lossless texture " + item.id + "/" + layer.id);
            }
            importer.Invoke(null, new object[] { input.json });
            foreach (var pair in guids) Check(AssetDatabase.AssetPathToGUID(pair.Key) == pair.Value, input.label + ": stable reimport " + pair.Key);
        }

        static void WaitForPlay()
        {
            if (!EditorApplication.isPlaying || !Application.isPlaying) return;
            EditorApplication.update -= WaitForPlay;
            try { foreach (var input in inputs.exports) VerifyPlayback(input.label, AssetDatabase.LoadAssetAtPath<GameObject>(Generated(input) + Read(input).name + ".prefab"), Read(input)); }
            catch (Exception exception) { Check(false, "Play Mode execution", exception.ToString()); }
            Finish();
        }

        public static void BuildPlayer()
        {
            project = Path.GetDirectoryName(Application.dataPath);
            try
            {
                inputs = JsonUtility.FromJson<Inputs>(File.ReadAllText(Path.Combine(project, "review-inputs.json")));
                foreach (var input in inputs.exports) VerifyImport(input);
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var player = new GameObject("Native export verification").AddComponent<NativePlayer>();
                player.exports = inputs.exports.Select(input => new NativeExport { label = input.label, prefab = AssetDatabase.LoadAssetAtPath<GameObject>(Generated(input) + Read(input).name + ".prefab"), json = AssetDatabase.LoadAssetAtPath<TextAsset>(input.json) }).ToArray();
                EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene(), "Assets/NativeReview.unity");
                PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);
                PlayerSettings.SetManagedStrippingLevel(UnityEditor.Build.NamedBuildTarget.Standalone, ManagedStrippingLevel.Disabled);
                if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Standalone, BuildTarget.StandaloneWindows64)) throw new Exception("Install the Windows standalone Mono build module before requesting --build-player.");
                var result = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[] { "Assets/NativeReview.unity" }, locationPathName = Path.Combine(project, "Player/NativeReview.exe"), target = BuildTarget.StandaloneWindows64, options = BuildOptions.Development });
                Check(result.summary.result == BuildResult.Succeeded, "Windows Mono standalone build", result.summary.result.ToString());
            }
            catch (Exception exception) { Check(false, "Standalone build", exception.ToString()); }
            Finish();
        }
        static void Finish()
        {
            report.passed = report.checks.All(check => check.passed);
            File.WriteAllText(Path.Combine(project, "native-results.json"), JsonUtility.ToJson(report, true));
            Debug.Log("PIXELDOLL_NATIVE_RESULT " + report.passed + " checks=" + report.checks.Count + " failures=" + report.checks.Count(check => !check.passed));
            EditorApplication.Exit(report.passed ? 0 : 1);
        }
    }
}
