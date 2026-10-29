using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
namespace PixelDollNativeReview
{
    [Serializable] public class Input { public string label, root, json; }
    [Serializable] public class Inputs { public Input[] exports; }
    [Serializable] public class Frame { public int cell, ms; }
    [Serializable] public class Move { public string id; public bool loop; public int cells; public Frame[] frames; public string[] directions; }
    [Serializable] public class Layer { public string id, role; public int cellW, cellH, pivotX, pivotY; public string[] sheets; }
    [Serializable] public class Item { public string id, slot; public Layer[] layers; }
    [Serializable] public class Data { public string name, exportId, baseItem; public float ppu; public Move[] animations; public Item[] items; }
    [Serializable] public class Observation { public string name, detail; public bool passed; }
    [Serializable] public class Report { public string editor; public bool passed; public List<Observation> checks = new List<Observation>(); }
    [Serializable] public class DurationResult { public string sample, variant; public float length, stopTime, expected; public float[] keyTimes; }
    [Serializable] public class DurationResults { public List<DurationResult> results = new List<DurationResult>(); }

    public static class NativePlayback
    {
        public static Report report = new Report();
        public static void Check(bool ok, string name, string detail = "") { report.checks.Add(new Observation { name = name, passed = ok, detail = detail }); }
        static object Field(object instance, string name) => instance.GetType().GetField(name).GetValue(instance);
        static void Invoke(object instance, string name, params object[] args) => instance.GetType().GetMethod(name).Invoke(instance, args);
        public static void VerifyPlayback(string label, GameObject prefab, Data data)
        {
            var instance = UnityEngine.Object.Instantiate(prefab);
            var doll = instance.GetComponents<MonoBehaviour>().First(component => component.GetType().FullName == "PixelDoll." + data.exportId + ".Paperdoll");
            var animator = instance.GetComponent<Animator>(); animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
            var clock = (SpriteRenderer)Field(doll, "clock");
            foreach (var move in data.animations) foreach (var direction in move.directions)
            {
                var state = move.id + "_" + direction;
                Invoke(doll, "Play", move.id, direction); animator.Update(0); Invoke(doll, "Sync");
                Check(clock.sprite != null && clock.sprite.name == state + "_" + move.frames[0].cell, label + ": exported Play starts " + state);
                // Reset only the measurement setup; the exported Play wrapper is independently checked above and below.
                animator.Play(state, 0, 0f); animator.Update(0); Invoke(doll, "Sync");
                animator.Update(move.frames[0].ms / 2000f); Invoke(doll, "Sync");
                var activeTime = animator.GetCurrentAnimatorStateInfo(0).normalizedTime;
                var activeSprite = clock.sprite;
                Invoke(doll, "Play", move.id, direction); animator.Update(0); Invoke(doll, "Sync");
                Check(Math.Abs(animator.GetCurrentAnimatorStateInfo(0).normalizedTime - activeTime) < .0001f && clock.sprite == activeSprite, label + ": active playback continues " + state);
                animator.Play(state, 0, 0f); animator.Update(0); Invoke(doll, "Sync");
                var total = move.frames.Sum(frame => (long)frame.ms) / 1000f;
                var times = new SortedSet<float> { 0, total * 3 + .01f };
                for (var cycle = 0; cycle < 3; cycle++)
                {
                    float boundary = cycle * total;
                    foreach (var frame in move.frames) { boundary += frame.ms / 1000f; if (boundary > .002f) times.Add(boundary - .002f); times.Add(boundary + .002f); }
                }
                float previous = 0;
                foreach (var time in times)
                {
                    animator.Update(time - previous); previous = time; Invoke(doll, "Sync");
                    float local = move.loop ? time % total : Math.Min(time, total - .00001f);
                    int index = 0; while (index < move.frames.Length - 1 && local >= move.frames[index].ms / 1000f) local -= move.frames[index++].ms / 1000f;
                    var expected = state + "_" + move.frames[index].cell;
                    Check(clock.sprite != null && clock.sprite.name == expected, label + ": Animator clock " + state + " at " + time, (clock.sprite ? clock.sprite.name : "null") + " / " + expected);
                    foreach (var node in (IEnumerable)Field(doll, "nodes"))
                    {
                        var renderer = (SpriteRenderer)Field(node, "renderer");
                        if (renderer.enabled)
                        {
                            Check(renderer.sprite != null && renderer.sprite.name == expected, label + ": synchronized layer " + state + " at " + time);
                            var slot = (string)Field(node, "slot");
                            var equipped = ((IEnumerable)Field(doll, "equipped")).Cast<object>().FirstOrDefault(entry => (string)Field(entry, "slot") == slot);
                            var equippedId = slot == "body" ? data.baseItem : (string)Field(equipped, "item");
                            var shownId = (string)doll.GetType().GetMethod("Shown", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic).Invoke(doll, new object[] { equippedId });
                            var item = data.items.First(entry => entry.id == shownId);
                            var layer = item.layers.First(entry => entry.role == (string)Field(node, "role"));
                            Check(renderer.sprite.rect.width == layer.cellW && renderer.sprite.rect.height == layer.cellH && Math.Abs(renderer.sprite.pivot.x - layer.pivotX) < .0001f && Math.Abs(renderer.sprite.pivot.y - (layer.cellH - layer.pivotY)) < .0001f && Math.Abs(renderer.bounds.size.x - layer.cellW / data.ppu) < .0001f && Math.Abs(renderer.bounds.size.y - layer.cellH / data.ppu) < .0001f, label + ": runtime layer geometry " + item.id);
                        }
                    }
                }
                Check(animator.GetCurrentAnimatorStateInfo(0).loop == move.loop, label + ": native state loop flag " + state);
                var completedTime = animator.GetCurrentAnimatorStateInfo(0).normalizedTime;
                var completedSprite = clock.sprite;
                Invoke(doll, "Play", move.id, direction); animator.Update(0); Invoke(doll, "Sync");
                if (!move.loop) Check(clock.sprite != null && clock.sprite.name == state + "_" + move.frames[0].cell && animator.GetCurrentAnimatorStateInfo(0).normalizedTime < .01f, label + ": replay completed once " + state, "normalizedTime=" + animator.GetCurrentAnimatorStateInfo(0).normalizedTime);
                else Check(Math.Abs(animator.GetCurrentAnimatorStateInfo(0).normalizedTime - completedTime) < .0001f && clock.sprite == completedSprite, label + ": repeated Play preserves active loop " + state);
            }
            if (label == "LayeredTiming") VerifyEquipmentAndPalette(label, prefab, doll, clock);
            UnityEngine.Object.DestroyImmediate(instance);
        }

        static void VerifyEquipmentAndPalette(string label, GameObject prefab, object doll, SpriteRenderer clock)
        {
            var nodes = ((IEnumerable)Field(doll, "nodes")).Cast<object>().ToArray();
            Func<string, SpriteRenderer> renderer = slot => (SpriteRenderer)Field(nodes.First(node => (string)Field(node, "slot") == slot), "renderer");
            Check(!renderer("hair").enabled && renderer("head").enabled, label + ": equipped hat hides hair");
            var frame = clock.sprite.name;
            Invoke(doll, "Equip", "head", null); Invoke(doll, "Sync");
            Check(renderer("hair").enabled && !renderer("head").enabled && clock.sprite.name == frame, label + ": unequip restores hair without moving clock");
            Invoke(doll, "Equip", "head", "hat"); Invoke(doll, "Sync");
            Check(!renderer("hair").enabled && renderer("head").enabled && clock.sprite.name == frame, label + ": re-equip restores hides without moving clock");
            Invoke(doll, "Equip", "head", "hat_small"); Invoke(doll, "Sync");
            Check(renderer("head").sprite.rect.width == 64 && Math.Abs(renderer("head").sprite.pivot.x - 32) < .0001f && renderer("hair").enabled && clock.sprite.name == frame, label + ": alternate same-slot item uses its own geometry");
            Invoke(doll, "Equip", "head", "hat"); Invoke(doll, "Sync");
            Check(renderer("head").sprite.rect.width == 96 && Math.Abs(renderer("head").sprite.pivot.x - 48) < .0001f && !renderer("hair").enabled && clock.sprite.name == frame, label + ": original same-slot item restores its own geometry");
            var original = renderer("body").sprite.texture;
            var peerInstance = UnityEngine.Object.Instantiate(prefab);
            var peer = peerInstance.GetComponents<MonoBehaviour>().First(component => component.GetType() == doll.GetType());
            peerInstance.GetComponent<Animator>().Update(0); Invoke(peer, "Sync");
            var peerBody = (SpriteRenderer)peer.GetType().GetProperty("Body").GetValue(peer);
            var peerTexture = peerBody.sprite.texture;
            Invoke(doll, "SetVariant", "skin", "red"); Invoke(doll, "Sync");
            Check(renderer("body").sprite.texture != original && renderer("body").sprite.name == frame, label + ": palette replaces native texture without moving frame");
            Check(peerBody.sprite.texture == peerTexture, label + ": palette stays instance-local");
            Invoke(doll, "SetVariant", "skin", null); Invoke(doll, "Sync");
            Check(renderer("body").sprite.texture == original, label + ": default palette restores cached texture");
            UnityEngine.Object.DestroyImmediate(peerInstance);
        }

    }
}
