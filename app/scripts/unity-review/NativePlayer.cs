using System;
using System.IO;
using System.Linq;
using UnityEngine;
namespace PixelDollNativeReview
{
    [Serializable] public class NativeExport { public string label; public GameObject prefab; public TextAsset json; }
    public class NativePlayer : MonoBehaviour
    {
        public NativeExport[] exports;
        static string Arg(string[] args, string name) { var index = Array.IndexOf(args, name); return index >= 0 && index + 1 < args.Length ? args[index + 1] : null; }
        void Start()
        {
            NativePlayback.report = new Report { editor = Application.unityVersion };
            var args = Environment.GetCommandLineArgs();
            var output = Arg(args, "-reviewResults");
            if (output == null) throw new Exception("Missing -reviewResults output file.");
            // -renderPlan selects the GPU render comparison; the player must then run without -nographics.
            var planPath = Arg(args, "-renderPlan");
            try
            {
                if (planPath == null) foreach (var input in exports) NativePlayback.VerifyPlayback(input.label, input.prefab, JsonUtility.FromJson<Data>(input.json.text));
                else
                {
                    var plan = JsonUtility.FromJson<RenderPlan>(File.ReadAllText(planPath));
                    var root = Path.GetDirectoryName(Path.GetFullPath(planPath));
                    foreach (var input in exports.Where(input => plan.labels.Contains(input.label)))
                        NativeRender.Verify(input.label, input.prefab, JsonUtility.FromJson<Data>(input.json.text), plan, Path.Combine(root, "render-expected"), Path.Combine(root, "render-failures/player"));
                }
            }
            catch (Exception exception) { NativePlayback.Check(false, "Standalone execution", exception.ToString()); }
            var report = NativePlayback.report;
            report.passed = report.checks.All(check => check.passed);
            File.WriteAllText(output, JsonUtility.ToJson(report, true));
            Application.Quit(report.passed ? 0 : 1);
        }
    }
}
