using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

public static class UnitySiblingImport
{
    public static void Run()
    {
        try
        {
            foreach (string folder in new[] { "a", "b" })
            {
                string root = "Assets/" + folder + "/unity/";
                string manifest = root + "pixeldoll_unity.json";
                string id = JsonUtility.FromJson<Export>(File.ReadAllText(manifest)).exportId;
                var importer = AppDomain.CurrentDomain.GetAssemblies()
                    .Select(a => a.GetType("PixelDoll." + id + ".Editor.PixelDollImporter"))
                    .Single(t => t != null);
                importer.GetMethod("Import").Invoke(null, new object[] { manifest });
                string path = AssetDatabase.FindAssets("t:Prefab", new[] { root + "Generated" })
                    .Select(AssetDatabase.GUIDToAssetPath).Single();
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                if (!prefab.GetComponents<MonoBehaviour>().Any(component =>
                    component != null && component.GetType().Namespace == "PixelDoll." + id))
                    throw new Exception("Missing character runtime on " + path);
                Debug.Log("PASS " + path + " " + importer.Assembly.GetName().Name);
            }
        }
        catch (Exception error)
        {
            Debug.LogException(error);
            EditorApplication.Exit(1);
            return;
        }
        EditorApplication.Exit(0);
    }

    [Serializable]
    private class Export
    {
        public string exportId;
    }
}
