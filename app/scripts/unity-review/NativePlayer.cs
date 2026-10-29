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
        void Start()
        {
            NativePlayback.report = new Report { editor = Application.unityVersion };
            try { foreach (var input in exports) NativePlayback.VerifyPlayback(input.label, input.prefab, JsonUtility.FromJson<Data>(input.json.text)); }
            catch (Exception exception) { NativePlayback.Check(false, "Standalone execution", exception.ToString()); }
            var report = NativePlayback.report;
            report.passed = report.checks.All(check => check.passed);
            var args = Environment.GetCommandLineArgs(); var index = Array.IndexOf(args, "-reviewResults");
            if (index < 0 || index + 1 >= args.Length) throw new Exception("Missing -reviewResults output file.");
            File.WriteAllText(args[index + 1], JsonUtility.ToJson(report, true));
            Application.Quit(report.passed ? 0 : 1);
        }
    }
}
