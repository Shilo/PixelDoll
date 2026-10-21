#!/bin/bash
# Compiles the exported Unity C# against the real Unity 6000.4.0f1 assemblies (+ 2D Sprite / 2D Animation 14.0.3 from a
# 6000.4.0f1 project's Library/ScriptAssemblies) with Unity's own Roslyn. Batchmode was blocked by licensing.
E="C:/Program Files/Unity/Hub/Editor/6000.4.0f1/Editor/Data"
SA="C:/Programming_Files/Shilocity/VectorGridTest/Library/ScriptAssemblies"
REFS=("-r:$E/NetStandard/ref/2.1.0/netstandard.dll")
for f in "$E"/NetStandard/compat/2.1.0/shims/netfx/*.dll; do REFS+=("-r:$f"); done
for f in "$E"/Managed/UnityEngine/*.dll; do REFS+=("-r:$f"); done
CSC=(dotnet "$E/DotNetSdkRoslyn/csc.dll" -nologo -langversion:9 -nostdlib -target:library -nowarn:1701,1702)
set -e
"${CSC[@]}" "${REFS[@]}" -out:out/PixelDoll.Runtime.dll cs/unity/Runtime/Paperdoll.cs
ED=("${REFS[@]}" -r:out/PixelDoll.Runtime.dll "-r:$SA/Unity.2D.Sprite.Editor.dll")
"${CSC[@]}" "${ED[@]}" -out:out/PixelDoll.Editor.NoAnim.dll cs/unity/Editor/PixelDollImporter.cs
"${CSC[@]}" "${ED[@]}" "-r:$SA/Unity.2D.Animation.Runtime.dll" -define:PIXELDOLL_2D_ANIMATION -out:out/PixelDoll.Editor.dll cs/unity/Editor/PixelDollImporter.cs
echo COMPILE OK
