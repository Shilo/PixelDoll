(() => {
  const root = document.querySelector("#workshop");
  const select = (selector) => root.querySelector(selector);
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character],
    );
  const slug = (name) =>
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const grip =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/></svg>';
  const up =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg>';
  const down =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg>';
  const definitions = [
    ["head", "Head", "rigid", "head", 130, null, true],
    ["hair", "Hair", "rigid", "head", 110, 5, true],
    ["face_acc", "Face", "rigid", "head", 120, null, true],
    ["torso_inner", "Body", "worn", "neck", 40, null, true],
    ["arms", "Hands", "worn", "hand_r", 70, null, true],
    ["legs", "Legs", "worn", "hip", 30, null, true],
    ["feet", "Feet", "worn", "foot_r", 20, null, true],
    ["back", "Back", "worn", "neck", 90, 4, true],
    ["main_hand", "Main hand", "held", "hand_r", 150, 1, true],
    ["off_hand", "Off hand", "held", "hand_l", 140, 2, true],
    ["facial_hair", "Facial hair", "rigid", "head", 100, null, false],
    ["torso_outer", "Outerwear", "worn", "neck", 60, null, false],
    ["waist", "Waist", "worn", "hip", 50, null, false],
    ["neck", "Neck", "rigid", "neck", 80, null, false],
    ["shoulders", "Shoulders", "worn", "neck", 65, null, false],
    ["underwear", "Underwear", "worn", "hip", 15, null, false],
  ];
  const makeSlot = (
    [key, label, kind, anchor, z, bg, shown],
    renderOrder = 0,
  ) => ({
    key,
    stableKey: key,
    label,
    kind,
    anchor,
    z,
    bg,
    shown,
    origin: key,
    sourceProfile: key,
    renderOrder,
    template: "Add {{description}}. Keep the same character and pose.",
    overrides: "[]",
    items: [],
    equipped: null,
  });
  const defaults = definitions.map(makeSlot);
  const seedItems = [
    ["head", "helmet_steel", "Steel helmet"],
    ["head", "hat_wizard", "Wizard hat"],
    ["hair", "hair_brown", "Brown hair"],
    ["torso_inner", "vest_leather", "Leather vest"],
    ["back", "cape_red", "Red cape"],
    ["main_hand", "sword_steel", "Steel sword"],
  ];
  const initial = () => {
    const slots = structuredClone(defaults);
    for (const [key, id, name] of seedItems) {
      const slot = slots.find((entry) => entry.key === key);
      slot.items.push({ id, name, art: `${key}/${id}` });
      slot.equipped ??= id;
    }
    return {
      slots,
      identity: "key",
      hidePolicy: "empty",
      presetPolicy: "fixed",
      view: "manage",
      previewMode: "fixture",
      facing: 0,
      exportMode: "manifest",
      calls: [],
      outfit: {},
    };
  };
  let state = initial();
  const history = [];
  const images = new Map();
  let imageError = "";
  let statusTimer;
  let opener;
  let drag;
  const snapshot = () => {
    history.push(structuredClone(state));
    if (history.length > 40) history.shift();
  };
  const notify = (message) => {
    clearTimeout(statusTimer);
    select("#status").innerHTML = `<p class="bu-notice">${escape(message)}</p>`;
    statusTimer = setTimeout(() => {
      select("#status").textContent = "";
    }, 7000);
  };
  const slotBy = (key) => state.slots.find((slot) => slot.key === key);
  const options = (values, current) =>
    values
      .map(
        ([value, label]) =>
          `<option value="${escape(value)}" ${String(current) === String(value) ? "selected" : ""}>${escape(label)}</option>`,
      )
      .join("");
  const button = (text, action, key, extra = "") =>
    `<button class="bu-btn" data-action="${action}" data-key="${escape(key)}" ${extra} ${extra.includes("aria-label") ? "" : `aria-label="${escape(text)}${slotBy(key) ? ` ${escape(slotBy(key).label)} (${escape(key)})` : ""}"`}>${text}</button>`;
  const custom = (slot) => !slot.origin;
  const scope = (slot) =>
    ({
      torso_inner: "Upper-body clothing or a complete outfit. Draws over Legs.",
      legs: "Separate pants, skirts or leggings. Stays independent of Body.",
      torso_outer:
        "One jacket, robe or full outer costume. Extra separation uses custom slots.",
      underwear:
        "One top, bottom or combined set. Extra separation uses custom slots. Cannot remove clothing baked into the Base.",
    })[slot.sourceProfile] || "";
  function remapKey(slot, next) {
    const previous = slot.key;
    slot.key = next;
    if (Object.hasOwn(state.outfit, previous)) {
      state.outfit[next] = state.outfit[previous];
      delete state.outfit[previous];
    }
  }
  function rebaseIdentity(mode) {
    const mapping = state.slots.map((slot) => [
      slot.key,
      mode === "name" ? slug(slot.label) : slot.stableKey,
    ]);
    if (
      mapping.some(([, key]) => !key) ||
      new Set(mapping.map(([, key]) => key)).size !== mapping.length
    ) {
      notify(
        "These names produce conflicting references. Rename duplicate labels before changing identity mode.",
      );
      return false;
    }
    const outfit = state.outfit;
    state.outfit = Object.fromEntries(
      mapping
        .filter(([key]) => Object.hasOwn(outfit, key))
        .map(([key, next]) => [next, outfit[key]]),
    );
    state.slots.forEach((slot, index) => {
      slot.key = mapping[index][1];
    });
    state.identity = mode;
    return true;
  }
  function renderRow(slot) {
    const duplicate = state.slots.some(
      (other) =>
        other !== slot &&
        other.label.toLowerCase() === slot.label.toLowerCase(),
    );
    const group = state.slots.filter((entry) => entry.shown === slot.shown);
    const position = group.indexOf(slot);
    return `<div class="slot-row" data-slot="${escape(slot.key)}">
      <button class="bu-btn handle" data-drag="${escape(slot.key)}" aria-label="Drag ${escape(slot.label)} to reorder">${grip}</button>
      <div class="slot-summary"><strong>${escape(slot.label)}</strong><small class="bu-muted">${slot.items.length} items${slot.equipped ? " · equipped" : ""} · ${custom(slot) ? "Custom" : "Built-in"}${duplicate ? ` · ${escape(slot.key)}` : ""}</small>${scope(slot) ? `<small class="bu-muted">${escape(scope(slot))}</small>` : ""}</div>
      <div class="row-actions">${button(up, "up", slot.key, `aria-label="Move ${escape(slot.label)} up" ${position === 0 ? "disabled" : ""}`)}${button(down, "down", slot.key, `aria-label="Move ${escape(slot.label)} down" ${position === group.length - 1 ? "disabled" : ""}`)}${button(slot.shown ? (state.hidePolicy === "empty" && slot.items.length ? "Hide (empty only)" : "Hide") : "Show", "visibility", slot.key)}${button("Settings", "edit", slot.key)}</div></div>`;
  }
  function renderManage() {
    const shown = state.slots.filter((slot) => slot.shown);
    const hidden = state.slots.filter((slot) => !slot.shown);
    return `<div class="content-head"><div><h2 id="view-title">Manage slots</h2><p class="bu-muted bu-small">Arrange the wardrobe. Moving a row never changes rendering depth.</p></div>${button("Add slot", "add", "")}</div>
      <div class="slot-list">${shown.length ? shown.map(renderRow).join("") : '<p class="bu-muted">No slots shown. Add a custom slot or show a built-in below.</p>'}</div>
      <details class="bu-details slot-group" open><summary>Hidden slots (${hidden.length})</summary><p class="bu-muted bu-small">Hidden from browsing. Equipment and exports stay unchanged.</p><div class="slot-list">${hidden.map(renderRow).join("")}</div></details>`;
  }
  function renderCatalog(slot, collapsed = false) {
    const duplicate = state.slots.some(
      (other) =>
        other !== slot &&
        other.label.toLowerCase() === slot.label.toLowerCase(),
    );
    const contents = `<div class="slot-heading"><h3>${escape(slot.label)}${duplicate ? ` <small>(${escape(slot.key)})</small>` : ""}</h3><div class="bu-actions">${button(slot.shown ? (state.hidePolicy === "empty" && slot.items.length ? "Hide (empty only)" : "Hide") : "Show", "visibility", slot.key)}${button("Settings", "edit", slot.key)}</div></div>
      ${scope(slot) ? `<p class="bu-muted bu-small">${escape(scope(slot))}</p>` : ""}
      <div class="item-grid"><button class="bu-action" data-variant="tile" data-action="equip" data-key="${escape(slot.key)}" data-item="" aria-label="Unequip ${escape(slot.label)} (${escape(slot.key)})" aria-pressed="${!slot.equipped}">Empty</button>${slot.items.map((item) => `<button class="bu-action" data-variant="tile" data-action="equip" data-key="${escape(slot.key)}" data-item="${escape(item.id)}" aria-label="Equip ${escape(item.name)} in ${escape(slot.label)} (${escape(slot.key)})" aria-pressed="${slot.equipped === item.id}">${item.art ? `<canvas width="64" height="64" data-art="${escape(item.art)}" aria-hidden="true"></canvas>` : `<small>${item.diagram ? "Layer diagram" : "Sample record"}<br>No generated art</small>`}<span>${escape(item.name)}</span></button>`).join("")}</div>
      <div class="bu-actions">${button("Add sample item", "sample", slot.key)}${slot.items.length ? button("Delete sample items", "clear-items", slot.key) : ""}</div>`;
    return collapsed
      ? `<details class="bu-details catalog-section"><summary>${escape(slot.label)} · ${slot.items.length} items${slot.equipped ? " · equipped" : ""}</summary>${contents}</details>`
      : `<section class="catalog-section">${contents}</section>`;
  }
  function renderWardrobe() {
    const hidden = state.slots.filter(
      (slot) => !slot.shown && slot.items.length,
    );
    const hiddenWorn = hidden.filter((slot) => slot.equipped).length;
    const archived =
      state.hidePolicy === "collapsed"
        ? hidden.map((slot) => renderCatalog(slot, true)).join("")
        : hidden.length
          ? `<details class="bu-details slot-group"><summary>Hidden slots · ${hidden.length} categories · ${hiddenWorn} equipped</summary><p class="bu-small bu-muted">Hidden from the wardrobe. Worn items stay equipped.</p>${hidden.map((slot) => renderCatalog(slot)).join("")}</details>`
          : "";
    return `<div class="content-head"><div><h2 id="view-title">Wardrobe</h2><p class="bu-muted bu-small">One selection per slot. Body draws over Legs; equipping either never clears the other.</p></div><div class="bu-actions">${button("Manage slots", "manage", "")}${button("Save sample outfit", "save-outfit", "")}${button("Wear saved outfit", "load-outfit", "")}</div></div>${
      state.slots
        .filter((slot) => slot.shown)
        .map((slot) => renderCatalog(slot))
        .join("") || "<p>No slots shown. Open Manage slots to restore them.</p>"
    }${archived}`;
  }
  function descriptor() {
    return {
      exampleOnly: true,
      notice:
        "Partial design example, not a loadable production manifest. PNG files are not included.",
      slots: state.slots.map((slot) => ({
        id: slot.key,
        label: slot.label,
        z: slot.z,
        renderOrder: slot.renderOrder,
        ...(slot.bg === null ? {} : { bgZ: slot.bg }),
        class: slot.kind,
        zOverrides: JSON.parse(slot.overrides),
      })),
      equipment: Object.fromEntries(
        state.slots.map((slot) => [slot.key, slot.equipped]),
      ),
      requiredRuntimeData: [
        "rig cell and pivots",
        "direction and mirroring rules",
        "animation cells, timing and loop",
        "item/layer sheet paths, cells and pivots",
        "resolved hide/tuck/cut data",
        "materials and palettes",
      ],
    };
  }
  function authoring() {
    return {
      exampleOnly: true,
      wardrobe: {
        order: state.slots.map((slot) => slot.key),
        hidden: state.slots
          .filter((slot) => !slot.shown)
          .map((slot) => slot.key),
      },
      slotSettings: Object.fromEntries(
        state.slots.map((slot) => [
          slot.key,
          {
            factory: slot.origin,
            sourceProfile: slot.sourceProfile,
            anchor: slot.anchor,
            promptTemplate: slot.template,
          },
        ]),
      ),
    };
  }
  function renderExport() {
    const target = state.slots.find(custom) || slotBy("back") || state.slots[0];
    const mode = state.exportMode;
    const files = state.slots
      .filter((slot) => slot.items.length)
      .flatMap((slot) =>
        slot.items.map(
          (item) =>
            `layers/${slot.key}${mode === "suffix" ? `__z${slot.z}` : ""}/${item.id}/main/walk.png`,
        ),
      );
    const oldCall = state.calls.at(-1);
    const resolves = oldCall ? !!slotBy(oldCall) : true;
    const note =
      mode === "manifest"
        ? "Recommended: one manifest.json resolves rendering. The separate authoring section belongs in project.json. This fragment is not a complete runtime export."
        : mode === "suffix"
          ? "Comparison only: a suffix can describe one depth. It cannot encode foreground/background overrides, pivots, masks or timing. Renumbering changes file paths."
          : "Loose PNGs only. Your game must supply an explicit order and all other playback rules. This is not equivalent to PixelDoll runtime rendering.";
    return `<div class="content-head"><div><h2 id="view-title">Export lab</h2><p class="bu-muted bu-small">Inspect naming and metadata consequences before choosing a format.</p></div></div>
      <div class="export-controls"><label>Ordering contract<select class="bu-select" id="export-mode">${options(
        [
          ["manifest", "One global manifest"],
          ["suffix", "Depth suffix on folders"],
          ["loose", "No metadata: loose artwork"],
        ],
        mode,
      )}</select></label><div class="bu-actions">${button("Download runtime example", "download-runtime", "")}${button("Download authoring example", "download-authoring", "")}</div></div>
      <p class="bu-notice">${escape(note)}</p><section class="export-section"><h3>Readable API reference</h3><pre class="runtime-code">doll.equip(${JSON.stringify(target.key)}, ${JSON.stringify(target.items[0]?.id || "item_key")});</pre>${button("Remember this reference", "remember-call", target.key)}${oldCall ? `<p class="bu-small">Previous reference: <code>${escape(oldCall)}</code> · ${resolves ? "slot key exists; item compatibility is not checked" : "slot key is missing after renaming or deletion"}</p>` : ""}</section>
      <section class="export-section"><h3>Proposed file paths</h3><pre class="runtime-code">${escape((mode === "manifest" ? ["manifest.json", ...files] : files).join("\n"))}</pre></section>
      <details class="bu-details" open><summary>Runtime descriptor fragment</summary><pre class="runtime-code">${escape(mode === "manifest" ? JSON.stringify(descriptor(), null, 2) : "Metadata omitted in this comparison. Folder enumeration supplies no guaranteed render order.")}</pre></details>
      <details class="bu-details"><summary>Authoring settings, kept with the editable project</summary><pre class="runtime-code">${escape(JSON.stringify(authoring(), null, 2))}</pre></details>`;
  }
  function paint(canvas, art) {
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, 64, 64);
    const image = images.get(art);
    if (image)
      context.drawImage(image, 0, state.facing * 64, 64, 64, 0, 0, 64, 64);
  }
  function paintActor() {
    const canvas = select("#actor");
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, 64, 64);
    if (state.previewMode === "diagram") {
      paintClothingDiagram(context);
      for (const tile of root.querySelectorAll("[data-art]"))
        paint(tile, tile.dataset.art);
      return;
    }
    const body = {
      z: 10,
      renderOrder: -1,
      items: [{ id: "base", art: "body/base" }],
      equipped: "base",
    };
    for (const slot of [body, ...state.slots].sort(
      (left, right) => left.z - right.z || left.renderOrder - right.renderOrder,
    )) {
      const item = slot.items.find((entry) => entry.id === slot.equipped);
      const image = item && images.get(item.art);
      if (image)
        context.drawImage(image, 0, state.facing * 64, 64, 64, 0, 0, 64, 64);
    }
    for (const tile of root.querySelectorAll("[data-art]"))
      paint(tile, tile.dataset.art);
  }
  function paintClothingDiagram(context) {
    const styles = getComputedStyle(document.documentElement);
    const color = (token) => styles.getPropertyValue(`--bu-${token}`).trim();
    const rectangle = (token, x, y, width, height) => {
      context.fillStyle = color(token);
      context.fillRect(x, y, width, height);
    };
    rectangle("muted", 25, 5, 14, 12);
    rectangle("muted", 23, 19, 18, 21);
    rectangle("muted", 18, 20, 5, 22);
    rectangle("muted", 41, 20, 5, 22);
    rectangle("muted", 24, 40, 7, 20);
    rectangle("muted", 33, 40, 7, 20);
    for (const slot of [...state.slots].sort(
      (left, right) => left.z - right.z || left.renderOrder - right.renderOrder,
    )) {
      const item = slot.items.find((entry) => entry.id === slot.equipped);
      if (!item?.diagram) continue;
      if (item.diagram === "underwear") {
        rectangle("success", 24, 21, 16, 7);
        rectangle("success", 24, 34, 16, 8);
      } else if (item.diagram === "pants") {
        rectangle("info", 22, 34, 9, 24);
        rectangle("info", 33, 34, 9, 24);
      } else if (item.diagram === "shirt" || item.diagram === "outfit") {
        rectangle("accent", 20, 19, 24, 25);
        rectangle("accent", 17, 20, 5, 10);
        rectangle("accent", 42, 20, 5, 10);
        if (item.diagram === "outfit") rectangle("accent", 21, 42, 22, 14);
      } else if (item.diagram === "coat") {
        rectangle("warning", 18, 19, 7, 36);
        rectangle("warning", 39, 19, 7, 36);
        rectangle("warning", 16, 20, 4, 20);
        rectangle("warning", 44, 20, 4, 20);
      }
    }
  }
  function loadClothingExamples() {
    snapshot();
    const examples = [
      ["torso_inner", "demo_shirt", "Long shirt", "shirt"],
      ["torso_inner", "demo_outfit", "Full outfit", "outfit"],
      ["legs", "demo_pants", "Pants", "pants"],
      ["torso_outer", "demo_coat", "Open coat", "coat"],
      ["underwear", "demo_underwear", "Combined underwear", "underwear"],
    ];
    for (const [profile, id, name, diagram] of examples) {
      const slot = state.slots.find((entry) => entry.origin === profile);
      if (!slot) continue;
      if (!slot.items.some((item) => item.id === id))
        slot.items.push({ id, name, diagram });
      slot.shown = true;
      if (diagram !== "outfit") slot.equipped = id;
    }
    state.previewMode = "diagram";
    state.view = "wardrobe";
    render();
    notify(
      "Loaded layer diagrams and showed Outerwear and Underwear. Nothing generated. Undo restores the previous wardrobe.",
    );
  }
  function render() {
    const active = document.activeElement;
    const focus = select("#content").contains(active)
      ? {
          id: active.id,
          action: active.dataset.action,
          key: active.dataset.key,
          item: active.dataset.item,
        }
      : null;
    for (const [id, value] of [
      ["identity", state.identity],
      ["hide-policy", state.hidePolicy],
      ["preset-policy", state.presetPolicy],
      ["preview-mode", state.previewMode],
    ])
      select(`#${id}`).value = value;
    select("#facing").disabled = state.previewMode === "diagram";
    select("#preview-note").textContent =
      state.previewMode === "diagram"
        ? "Front-view diagram, not generated artwork: Underwear (green), Legs (blue), Body (bronze), Outerwear (gold). No clipping or animation proof."
        : "Existing fixture artwork. Diagram items are not painted here. Joint edits, generation and full occlusion are not simulated.";
    for (const tab of root.querySelectorAll("[data-view]")) {
      tab.setAttribute(
        "aria-selected",
        String(tab.dataset.view === state.view),
      );
      tab.tabIndex = tab.dataset.view === state.view ? 0 : -1;
    }
    select("#content").setAttribute("aria-labelledby", `tab-${state.view}`);
    select("#undo").disabled = !history.length;
    select("#decision-note").textContent =
      state.identity === "key"
        ? "Keys stay readable and unchanged after rename. In this comparison a custom label may match a hidden built-in; the manager shows both keys."
        : "Name-only comparison: renaming rewrites local slot references and file paths. Previously exported game calls cannot be updated.";
    select("#content").innerHTML =
      state.view === "manage"
        ? renderManage()
        : state.view === "wardrobe"
          ? renderWardrobe()
          : renderExport();
    select("#wearing").innerHTML = `<strong>Equipped</strong>${state.slots
      .filter((slot) => slot.equipped)
      .map(
        (slot) =>
          `<span>${escape(slot.label)}${state.slots.some((other) => other !== slot && other.label.toLowerCase() === slot.label.toLowerCase()) ? ` (${escape(slot.key)})` : ""}${slot.shown ? "" : " · organized away"}</span>`,
      )
      .join(
        "",
      )}${imageError ? `<p role="alert">${escape(imageError)}</p>` : ""}`;
    paintActor();
    if (focus?.action)
      [...root.querySelectorAll("[data-action]")]
        .find(
          (element) =>
            element.dataset.action === focus.action &&
            element.dataset.key === focus.key &&
            element.dataset.item === focus.item,
        )
        ?.focus({ preventScroll: true });
    else if (focus?.id)
      document.getElementById(focus.id)?.focus({ preventScroll: true });
  }
  function openEditor(key, copy = false) {
    const source = slotBy(key);
    const slot = source
      ? structuredClone(source)
      : structuredClone(defaults[3]);
    const creating = !source || copy;
    if (creating) {
      slot.label = copy ? `${slot.label} copy` : "";
      slot.key = uniqueKey(slug(slot.label));
      slot.origin = null;
      slot.sourceProfile = source?.sourceProfile || "torso_inner";
      slot.items = [];
      slot.equipped = null;
      slot.renderOrder =
        Math.max(...state.slots.map((entry) => entry.renderOrder)) + 1;
    }
    const locked = !creating && !custom(slot) && state.presetPolicy === "fixed";
    const lock = locked ? "disabled" : "";
    const form = select("#editor");
    if (!form.open)
      opener = {
        action: document.activeElement.dataset.action,
        key: document.activeElement.dataset.key,
      };
    form.innerHTML = `<form class="editor-body" id="slot-form"><h2 id="editor-title">${creating ? "Add slot" : `${escape(slot.label)} settings`}</h2>
      ${locked ? '<p class="bu-notice">Factory settings are fixed in this comparison. Copy this slot to customize it.</p>' : ""}
      <div class="settings-grid"><label class="full">Name<input class="bu-input" name="label" required value="${escape(slot.label)}" ${lock}></label>
      <label class="full">${state.identity === "key" ? "API / folder key" : "Name-derived reference"}<input class="bu-input" name="key" pattern="[a-z0-9][a-z0-9_-]*" required value="${escape(slot.key)}" ${creating ? "" : "readonly"}></label>
      ${
        creating && !copy
          ? `<label class="full">Start with<select class="bu-select" name="based">${options(
              defaults.map((entry) => [entry.key, entry.label]),
              "torso_inner",
            )}</select></label>`
          : ""
      }
      </div><details class="bu-details" ${creating ? "" : "open"}><summary>Advanced: unqualified authoring experiment</summary><p class="bu-notice">Settings below are not a promise of supported generation. A custom held slot needs the profile refactor; choosing Off hand does not prove left-hand behavior.${slot.items.length ? ` This slot has ${slot.items.length} items. Joint and behavior changes cannot retarget their existing pixels; production would need refit or lock these controls.` : ""}</p><div class="settings-grid">
      <label>Behavior<select class="bu-select" name="kind" ${lock}>${options(
        [
          ["worn", "Worn"],
          ["rigid", "Rigid"],
          ["held", "Held"],
        ],
        slot.kind,
      )}</select></label>
      <label>Authoring joint<select class="bu-select" name="anchor" ${lock}>${options(
        ["head", "neck", "hip", "hand_l", "hand_r", "foot_l", "foot_r"].map(
          (value) => [value, value],
        ),
        slot.anchor,
      )}</select></label>
      <label>Foreground depth<input class="bu-input" name="z" type="number" step="1" required value="${slot.z}" ${lock}></label>
      <label>Background depth (optional)<input class="bu-input" name="bg" type="number" step="1" value="${slot.bg ?? ""}" ${lock}></label>
      <label class="full">Creative prompt template<textarea class="bu-input" name="template" ${lock}>${escape(slot.template)}</textarea></label>
      <p class="bu-muted bu-small full">Use {{description}} for each item's description. Extraction instructions stay app-controlled. Prompt and joint changes apply to future authoring, not existing pixels.</p>
      <label class="full">Contextual depth overrides (JSON)<textarea class="bu-input" name="overrides" ${lock}>${escape(slot.overrides)}</textarea></label>
      <p class="bu-muted bu-small full">Example: [{"layer":"fg","z":95,"dir":"north"}]. No runtime bones are added. This prototype stores these settings but simulates only base foreground order.</p>
      </div></details><p id="form-error" role="alert"></p>
      <div class="editor-actions">${!creating ? button("Copy", "copy", key) : ""}${!creating && defaults.some((entry) => entry.key === slot.origin) && state.presetPolicy === "editable" ? button("Reset settings", "factory", key) : ""}${!creating && custom(slot) ? button("Delete slot", "delete", key) : ""}<button class="bu-btn" type="button" data-close="editor">Cancel</button><button class="bu-btn" data-variant="primary" type="submit" ${locked ? "disabled" : ""}>${creating ? "Create slot" : "Apply settings"}</button></div></form>`;
    form
      .querySelectorAll("button[data-action]")
      .forEach((entry) => (entry.type = "button"));
    const field = form.querySelector("[name=label]");
    if (creating)
      field.addEventListener("input", () => {
        form.querySelector("[name=key]").value = uniqueKey(slug(field.value));
      });
    form.querySelector("[name=based]")?.addEventListener("change", (event) => {
      const base = defaults.find((entry) => entry.key === event.target.value);
      slot.sourceProfile = base.key;
      for (const name of ["kind", "anchor", "z", "template", "overrides"])
        form.querySelector(`[name=${name}]`).value = base[name];
      form.querySelector("[name=bg]").value = base.bg ?? "";
    });
    form.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      const fields = new FormData(event.target);
      const label = String(fields.get("label")).trim();
      const nextKey =
        state.identity === "name"
          ? slug(label)
          : creating
            ? String(fields.get("key")).trim()
            : slot.key;
      let error = "";
      if (!label || !nextKey || !nextKey.match(/^[a-z0-9][a-z0-9_-]*$/))
        error =
          "Use a name and a readable key containing lowercase letters, numbers, underscores or hyphens.";
      if (
        /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(nextKey) ||
        (nextKey === "body" &&
          !(
            state.identity === "name" &&
            slot.origin === "torso_inner" &&
            !creating
          ))
      )
        error =
          "Choose another key; this name is reserved for files or the base body.";
      const collision = state.slots.find(
        (other) => other.key === nextKey && (creating || other.key !== key),
      );
      const labelCollision = state.slots.find(
        (other) =>
          other.label.toLowerCase() === label.toLowerCase() &&
          (creating || other.key !== key),
      );
      if (collision)
        error = `The reference ${nextKey} already exists, even when hidden. Show it, customize it, or choose another key.`;
      if (labelCollision && (state.identity === "name" || labelCollision.shown))
        error =
          "Another shown slot uses that name. Hide it first for the same-label comparison, or choose a distinct name.";
      let overrides;
      try {
        overrides = JSON.parse(String(fields.get("overrides")));
        if (
          !Array.isArray(overrides) ||
          overrides.some(
            (entry) =>
              !["fg", "bg"].includes(entry.layer) ||
              !Number.isFinite(entry.z) ||
              (entry.dir &&
                ![
                  "south",
                  "south-east",
                  "east",
                  "north-east",
                  "north",
                  "north-west",
                  "west",
                  "south-west",
                ].includes(entry.dir)),
          )
        )
          throw new Error("Invalid override");
      } catch {
        error =
          "Overrides must be a JSON array with layer fg or bg, a numeric z, and an optional facing dir.";
      }
      const template = String(fields.get("template"));
      if (/{{(?!description}})/.test(template))
        error =
          "Only {{description}} is supported. Templates contain no executable expressions.";
      if (error) {
        select("#form-error").textContent = error;
        return;
      }
      snapshot();
      const changed = {
        ...slot,
        key: nextKey,
        stableKey: creating ? nextKey : slot.stableKey,
        label,
        kind: String(fields.get("kind")),
        anchor: String(fields.get("anchor")),
        z: Number(fields.get("z")),
        bg: fields.get("bg") === "" ? null : Number(fields.get("bg")),
        template,
        overrides: JSON.stringify(overrides, null, 2),
        shown: true,
      };
      if (creating) state.slots.push(changed);
      else {
        const current = slotBy(key);
        remapKey(current, nextKey);
        Object.assign(current, changed, { shown: current.shown });
      }
      closeEditor();
      render();
      notify(
        creating
          ? "Created sample slot. No artwork was generated."
          : "Settings saved in this demo. Authoring changes do not alter existing pixels.",
      );
    };
    if (!form.open) form.showModal();
  }
  function uniqueKey(candidate) {
    if (!candidate) return "";
    let key = candidate;
    for (let index = 2; state.slots.some((slot) => slot.key === key); index++)
      key = `${candidate}_${index}`;
    return key;
  }
  function restoreEditorFocus() {
    (
      [...root.querySelectorAll("[data-action]")].find(
        (element) =>
          element.dataset.action === opener?.action &&
          element.dataset.key === opener?.key,
      ) || select("#tab-manage")
    ).focus({ preventScroll: true });
  }
  select("#editor").addEventListener("close", restoreEditorFocus);
  function closeEditor() {
    select("#editor").close();
  }
  function move(key, amount) {
    const index = state.slots.findIndex((slot) => slot.key === key);
    const group = state.slots.filter(
      (slot) => slot.shown === state.slots[index].shown,
    );
    const neighbor = group[group.indexOf(state.slots[index]) + amount];
    if (!neighbor) return;
    const next = state.slots.indexOf(neighbor),
      slot = state.slots[index];
    snapshot();
    [state.slots[index], state.slots[next]] = [
      state.slots[next],
      state.slots[index],
    ];
    render();
    root
      .querySelector(
        `[data-action="${amount < 0 ? "up" : "down"}"][data-key="${key}"]`,
      )
      ?.focus();
    notify(`${slot.label} moved. Render depth unchanged.`);
  }
  function download(data, name) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  root.addEventListener("click", (event) => {
    const close = event.target.closest("[data-close]");
    if (close) {
      select(`#${close.dataset.close}`).close();
      return;
    }
    const tab = event.target.closest("[data-view]");
    if (tab) {
      state.view = tab.dataset.view;
      render();
      return;
    }
    const control = event.target.closest("[data-action]");
    if (!control) return;
    const action = control.dataset.action,
      key = control.dataset.key,
      slot = slotBy(key);
    if (action === "edit") {
      openEditor(key);
      return;
    }
    if (action === "add") {
      openEditor("");
      return;
    }
    if (action === "copy") {
      openEditor(key, true);
      return;
    }
    if (action === "manage") {
      state.view = "manage";
      render();
      return;
    }
    if (action === "clothing-examples") {
      loadClothingExamples();
      return;
    }
    if (action === "up" || action === "down") {
      move(key, action === "up" ? -1 : 1);
      return;
    }
    if (action === "visibility") {
      if (slot.shown && slot.items.length && state.hidePolicy === "empty") {
        notify(
          `${slot.label} has ${slot.items.length} items. This variant permits hiding only empty slots. Try another policy above.`,
        );
        return;
      }
      snapshot();
      slot.shown = !slot.shown;
      render();
      notify(
        `${slot.label} ${slot.shown ? "shown" : "hidden from browsing"}. Equipment and exports unchanged.`,
      );
      return;
    }
    if (action === "equip") {
      snapshot();
      slot.equipped = control.dataset.item || null;
      render();
      return;
    }
    if (action === "sample") {
      snapshot();
      const id = `sample_${slot.items.length + 1}`;
      slot.items.push({ id, name: `Sample ${slot.label}` });
      if (state.hidePolicy === "empty") slot.shown = true;
      render();
      notify("Added an offline sample record, not generated artwork.");
      return;
    }
    if (action === "clear-items") {
      snapshot();
      slot.items = [];
      slot.equipped = null;
      delete state.outfit[key];
      render();
      notify(
        "Deleted offline sample records and their outfit reference. Undo can restore them.",
      );
      return;
    }
    if (action === "remember-call") {
      snapshot();
      state.calls.push(key);
      render();
      return;
    }
    if (action === "download-runtime") {
      download(descriptor(), "runtime-design-example.json");
      return;
    }
    if (action === "download-authoring") {
      download(authoring(), "authoring-design-example.json");
      return;
    }
    if (action === "save-outfit") {
      snapshot();
      state.outfit = Object.fromEntries(
        state.slots.map((entry) => [entry.key, entry.equipped]),
      );
      notify("Saved the sample outfit, including organized-away slots.");
      return;
    }
    if (action === "load-outfit") {
      if (!Object.keys(state.outfit).length) {
        notify("Save a sample outfit first.");
        return;
      }
      snapshot();
      for (const entry of state.slots)
        entry.equipped = state.outfit[entry.key] ?? null;
      render();
      notify("Sample outfit restored. Wardrobe visibility unchanged.");
      return;
    }
    if (action === "factory") {
      const base = defaults.find((entry) => entry.key === slot.origin);
      if (!base) {
        notify("Experimental settings have no qualified factory reset.");
        return;
      }
      const nextKey = state.identity === "name" ? slug(base.label) : slot.key;
      if (
        state.slots.some(
          (other) =>
            other !== slot &&
            (other.key === nextKey ||
              other.label.toLowerCase() === base.label.toLowerCase()),
        )
      ) {
        notify(
          "Reset would conflict with another slot name or key. Rename that slot first.",
        );
        return;
      }
      snapshot();
      remapKey(slot, nextKey);
      Object.assign(slot, {
        label: base.label,
        kind: base.kind,
        anchor: base.anchor,
        z: base.z,
        bg: base.bg,
        template: base.template,
        overrides: base.overrides,
      });
      closeEditor();
      render();
      notify("Restored settings. Items and wardrobe organization retained.");
      return;
    }
    if (action === "delete") {
      const dialog = select("#confirm");
      dialog.innerHTML = `<div class="editor-body"><h2 id="confirm-title">Delete ${escape(slot.label)}?</h2><p>This removes ${slot.items.length} sample item records, the equipped selection and its saved-outfit reference. Undo can restore them.</p><div class="editor-actions"><button class="bu-btn" data-close="confirm">Cancel</button>${button("Delete slot", "confirm-delete", key)}</div></div>`;
      dialog.showModal();
      return;
    }
    if (action === "confirm-delete") {
      snapshot();
      state.slots = state.slots.filter((entry) => entry.key !== key);
      delete state.outfit[key];
      select("#confirm").close();
      closeEditor();
      render();
      notify("Deleted sample slot and references. Undo is available.");
    }
  });
  root.addEventListener("change", (event) => {
    const { id, value } = event.target;
    if (id === "export-mode") {
      state.exportMode = value;
      render();
      return;
    }
    if (id === "facing") {
      state.facing = Number(value);
      paintActor();
      return;
    }
    if (id === "preview-mode") {
      state.previewMode = value;
      render();
      return;
    }
    if (!["identity", "hide-policy", "preset-policy"].includes(id)) return;
    snapshot();
    if (id === "identity" && !rebaseIdentity(value)) {
      history.pop();
      render();
      return;
    }
    if (id === "hide-policy") {
      state.hidePolicy = value;
      if (value === "empty") {
        for (const slot of state.slots)
          if (slot.items.length) slot.shown = true;
        notify("Empty-only policy selected. Populated slots are shown again.");
      }
    }
    if (id === "preset-policy") state.presetPolicy = value;
    render();
  });
  select("#theme").onclick = () => {
    const light = document.documentElement.dataset.theme !== "light";
    document.documentElement.dataset.theme = light ? "light" : "dark";
    select("#theme").textContent = light ? "Dark theme" : "Light theme";
    paintActor();
  };
  select("#undo").onclick = () => {
    if (history.length) {
      state = history.pop();
      render();
      notify("Restored previous sample state.");
    }
  };
  select("#reset").onclick = () => {
    snapshot();
    state = initial();
    render();
    notify("Demo reset.");
  };
  root.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-drag]");
    if (!handle || event.button !== 0) return;
    drag = {
      key: handle.dataset.drag,
      startX: event.clientX,
      startY: event.clientY,
      target: handle.dataset.drag,
      active: false,
      handle,
      pointer: event.pointerId,
    };
    handle.setPointerCapture(event.pointerId);
  });
  root.addEventListener("pointermove", (event) => {
    if (!drag) return;
    if (
      !drag.active &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >
        (event.pointerType === "touch" ? 8 : 6)
    ) {
      drag.active = true;
      drag.handle.closest("[data-slot]").dataset.dragging = "true";
    }
    if (!drag.active) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-slot]");
    if (target) drag.target = target.dataset.slot;
    if (event.clientY < 65) window.scrollBy(0, -14);
    else if (event.clientY > window.innerHeight - 65) window.scrollBy(0, 14);
  });
  root.addEventListener("pointerup", () => {
    if (!drag) return;
    const current = drag;
    drag = null;
    if (
      current.active &&
      current.key !== current.target &&
      slotBy(current.key).shown === slotBy(current.target).shown
    ) {
      snapshot();
      const index = state.slots.findIndex((slot) => slot.key === current.key),
        targetIndex = state.slots.findIndex(
          (slot) => slot.key === current.target,
        );
      const [slot] = state.slots.splice(index, 1);
      state.slots.splice(targetIndex, 0, slot);
      notify(`${slot.label} reordered. Render depth unchanged.`);
    }
    render();
    root
      .querySelector(`[data-drag="${current.key}"]`)
      ?.focus({ preventScroll: true });
  });
  root.addEventListener("pointercancel", () => {
    drag = null;
    render();
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drag) {
      drag = null;
      render();
      notify("Reordering canceled.");
    }
  });
  root.addEventListener("keydown", (event) => {
    if (
      event.target.matches("[data-view]") &&
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    ) {
      event.preventDefault();
      const tabs = [...root.querySelectorAll("[data-view]")],
        index = tabs.indexOf(event.target);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
              tabs.length;
      tabs[next].click();
      tabs[next].focus();
    }
  });
  render();
  const artPaths = [
    "body/base",
    ...seedItems.map(([key, id]) => `${key}/${id}`),
  ];
  Promise.all(
    artPaths.map(
      (path) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            images.set(path, image);
            resolve();
          };
          image.onerror = () =>
            reject(new Error(`Could not load demo artwork: ${path}`));
          image.src =
            window.SLOT_WORKSHOP_ASSETS?.[path] ||
            `../../../../app/public/fixtures/s2/layers/${path}/main/walk.png`;
        }),
    ),
  )
    .then(paintActor)
    .catch((error) => {
      imageError = error.message;
      render();
    });
})();
