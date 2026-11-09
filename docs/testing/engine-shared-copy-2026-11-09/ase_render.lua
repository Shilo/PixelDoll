-- aseprite -b <file.aseprite> --script-param out=<dir> --script-param show=<a,b|*> --script ase_render.lua
-- show=* keeps the exported visibility; otherwise only the listed layers are visible. Writes <out>/<frame>.png.
local spr = app.activeSprite
local out = app.params["out"]
local show = app.params["show"]
local names = {}
for _, l in ipairs(spr.layers) do
  table.insert(names, l.name .. (l.isVisible and "=1" or "=0"))
end
print("LAYERS " .. table.concat(names, ";"))
if show ~= "*" then
  local want = {}
  for n in string.gmatch(show, "[^,]+") do want[n] = true end
  for _, l in ipairs(spr.layers) do l.isVisible = want[l.name] == true end
end
for i, f in ipairs(spr.frames) do
  local img = Image(spr.spec)
  img:clear()
  img:drawSprite(spr, i)
  img:saveAs(out .. "/" .. (i - 1) .. ".png")
end
print("FRAMES " .. #spr.frames)
