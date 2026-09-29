const SVG_NS = "http://www.w3.org/2000/svg";
const WHEEL_FLASH_MS = 160;
const KEYBOARD_WIDTH_UNITS = 18.25;
const KEYBOARD_HEIGHT_UNITS = 6.5;
const MODIFIER_META_CODES = new Set(["MetaLeft", "MetaRight", "OSLeft", "OSRight"]);

// Mouse `buttons` bitmask values (MouseEvent.buttons).
const MOUSE_BUTTONS = [
  { bit: 1, name: "Left" },
  { bit: 2, name: "Right" },
  { bit: 4, name: "Middle" },
  { bit: 8, name: "Back" },
  { bit: 16, name: "Forward" },
];

const STANDARD_GAMEPAD_BUTTON_COUNT = 18;
const STANDARD_GAMEPAD_AXIS_COUNT = 4;
const STICK_TRAVEL = 14;
const TRIGGER_WIDTH = 70;

const KEYBOARD_LAYOUT = buildKeyboardLayout();
const KEYBOARD_CODES = new Set(KEYBOARD_LAYOUT.map((key) => key.code));

export class DeviceVisualizer {
  constructor(rootElement, targetElement) {
    this.root = rootElement;
    this.targetElement = targetElement;
    this.running = false;
    this.handlers = [];
    this.heldKeys = new Set();
    this.mouseButtons = 0;
    this.wheelTimeouts = new Map();
    this.gamepadRafId = null;
    this.gamepadCards = new Map();

    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnKeyUp = this.onKeyUp.bind(this);
    this.boundOnPointer = this.onPointer.bind(this);
    this.boundOnWheel = this.onWheel.bind(this);
    this.boundOnBlur = this.onBlur.bind(this);
    this.boundPollGamepads = this.pollGamepads.bind(this);

    this.build();
    this.setIdle(true);
  }

  start() {
    this.stop();
    this.running = true;
    this.setIdle(false);

    this.listen(window, "keydown", this.boundOnKeyDown, { capture: true });
    this.listen(window, "keyup", this.boundOnKeyUp, { capture: true });
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
      this.listen(window, type, this.boundOnPointer, { capture: true, passive: true });
    }
    this.listen(window, "wheel", this.boundOnWheel, { capture: true, passive: true });
    this.listen(window, "blur", this.boundOnBlur);

    if (typeof navigator.getGamepads === "function") {
      this.gamepadRafId = requestAnimationFrame(this.boundPollGamepads);
    }
  }

  stop() {
    for (const detach of this.handlers) {
      detach();
    }
    this.handlers = [];
    this.running = false;

    if (this.gamepadRafId !== null) {
      cancelAnimationFrame(this.gamepadRafId);
      this.gamepadRafId = null;
    }
    for (const timeoutId of this.wheelTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.wheelTimeouts.clear();
    for (const el of this.wheelEls.values()) {
      el.classList.remove("pressed");
    }

    this.heldKeys.clear();
    this.renderKeyboard();
    this.mouseButtons = 0;
    this.renderMouse();
    for (const card of this.gamepadCards.values()) {
      card.el.remove();
    }
    this.gamepadCards.clear();
    this.renderGamepadEmptyState();
    this.setIdle(true);
  }

  listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this.handlers.push(() => target.removeEventListener(type, handler, options));
  }

  setIdle(idle) {
    this.root.classList.toggle("is-idle", idle);
  }

  // ---------------------------------------------------------------------------
  // DOM construction

  build() {
    this.root.innerHTML = "";

    const keyboardPanel = createPanel("Keyboard");
    const keyboardScroll = document.createElement("div");
    keyboardScroll.className = "vk-scroll";
    const board = document.createElement("div");
    board.className = "vk-board";
    board.style.aspectRatio = `${KEYBOARD_WIDTH_UNITS} / ${KEYBOARD_HEIGHT_UNITS}`;
    this.keyEls = new Map();
    for (const key of KEYBOARD_LAYOUT) {
      const keyEl = document.createElement("div");
      keyEl.className = "vk-key";
      keyEl.textContent = key.label;
      keyEl.title = key.code;
      keyEl.style.left = `${(key.x / KEYBOARD_WIDTH_UNITS) * 100}%`;
      keyEl.style.top = `${(key.y / KEYBOARD_HEIGHT_UNITS) * 100}%`;
      keyEl.style.width = `${(key.w / KEYBOARD_WIDTH_UNITS) * 100}%`;
      keyEl.style.height = `${(1 / KEYBOARD_HEIGHT_UNITS) * 100}%`;
      board.appendChild(keyEl);
      this.keyEls.set(key.code, keyEl);
    }
    keyboardScroll.appendChild(board);
    keyboardPanel.appendChild(keyboardScroll);
    this.extraKeysEl = document.createElement("p");
    this.extraKeysEl.className = "device-note";
    keyboardPanel.appendChild(this.extraKeysEl);

    const row = document.createElement("div");
    row.className = "device-row";

    const mousePanel = createPanel("Mouse");
    mousePanel.appendChild(this.buildMouse());
    row.appendChild(mousePanel);

    const gamepadPanel = createPanel("Gamepads");
    gamepadPanel.classList.add("gamepad-panel");
    this.gamepadListEl = document.createElement("div");
    this.gamepadListEl.className = "gamepad-list";
    this.gamepadEmptyEl = document.createElement("p");
    this.gamepadEmptyEl.className = "device-note";
    gamepadPanel.append(this.gamepadListEl, this.gamepadEmptyEl);
    row.appendChild(gamepadPanel);

    this.root.append(keyboardPanel, row);
    this.renderKeyboard();
    this.renderGamepadEmptyState();
  }

  buildMouse() {
    const wrap = document.createElement("div");
    wrap.className = "vm-wrap";

    const svg = svgEl("svg", { viewBox: "0 0 120 180", class: "vm-svg", role: "img", "aria-label": "Mouse buttons" });
    const defs = svgEl("defs", {}, svg);
    const clip = svgEl("clipPath", { id: "vm-body-clip" }, defs);
    svgEl("rect", { x: 14, y: 10, width: 92, height: 160, rx: 46 }, clip);

    svgEl("rect", { class: "vd-body", x: 14, y: 10, width: 92, height: 160, rx: 46 }, svg);
    this.mouseEls = new Map();
    const buttonsGroup = svgEl("g", { "clip-path": "url(#vm-body-clip)" }, svg);
    this.mouseEls.set(1, svgEl("rect", { class: "vd-button", x: 14, y: 10, width: 45, height: 72 }, buttonsGroup));
    this.mouseEls.set(2, svgEl("rect", { class: "vd-button", x: 61, y: 10, width: 45, height: 72 }, buttonsGroup));
    svgEl("rect", { class: "vd-outline", x: 14, y: 10, width: 92, height: 160, rx: 46 }, svg);
    this.mouseEls.set(4, svgEl("rect", { class: "vd-button", x: 52, y: 26, width: 16, height: 34, rx: 8 }, svg));
    this.mouseEls.set(16, svgEl("rect", { class: "vd-button", x: 6, y: 88, width: 12, height: 20, rx: 4 }, svg));
    this.mouseEls.set(8, svgEl("rect", { class: "vd-button", x: 6, y: 112, width: 12, height: 20, rx: 4 }, svg));
    this.mouseLabelEls = new Map([
      [1, svgText(svg, 34, 50, "L")],
      [2, svgText(svg, 86, 50, "R")],
    ]);

    for (const { bit, name } of MOUSE_BUTTONS) {
      const title = svgEl("title", {}, this.mouseEls.get(bit));
      title.textContent = `${name} button`;
    }

    const wheel = document.createElement("div");
    wheel.className = "vm-wheel";
    this.wheelEls = new Map();
    for (const [direction, label] of [
      ["up", "Wheel ▲"],
      ["down", "Wheel ▼"],
      ["left", "Tilt ◀"],
      ["right", "Tilt ▶"],
    ]) {
      const chip = document.createElement("span");
      chip.className = "vd-chip";
      chip.textContent = label;
      wheel.appendChild(chip);
      this.wheelEls.set(direction, chip);
    }

    wrap.append(svg, wheel);
    return wrap;
  }

  buildGamepadCard(gamepad) {
    const el = document.createElement("div");
    el.className = "gamepad-card";
    const heading = document.createElement("p");
    heading.className = "gamepad-name";
    heading.textContent = `Pad ${gamepad.index + 1}: ${gamepad.id}`;
    el.appendChild(heading);

    const card = {
      id: gamepad.id,
      el,
      buttonEls: new Map(),
      triggerFills: new Map(),
      stickDots: [],
      labelEls: new Map(),
      genericButtonEls: new Map(),
      axisFills: new Map(),
    };

    const standard = gamepad.mapping === "standard";
    if (standard) {
      el.appendChild(this.buildStandardGamepad(card));
    }

    const firstGenericButton = standard ? STANDARD_GAMEPAD_BUTTON_COUNT : 0;
    const firstGenericAxis = standard ? STANDARD_GAMEPAD_AXIS_COUNT : 0;

    if (gamepad.buttons.length > firstGenericButton) {
      const list = document.createElement("div");
      list.className = "gp-generic-buttons";
      for (let i = firstGenericButton; i < gamepad.buttons.length; i += 1) {
        const chip = document.createElement("span");
        chip.className = "vd-chip";
        chip.textContent = `B${i}`;
        list.appendChild(chip);
        card.genericButtonEls.set(i, chip);
      }
      el.appendChild(list);
    }

    if (gamepad.axes.length > firstGenericAxis) {
      const list = document.createElement("div");
      list.className = "gp-axes";
      for (let i = firstGenericAxis; i < gamepad.axes.length; i += 1) {
        const rowEl = document.createElement("div");
        rowEl.className = "gp-axis";
        const label = document.createElement("span");
        label.textContent = `Axis ${i}`;
        const track = document.createElement("span");
        track.className = "gp-axis-track";
        const fill = document.createElement("span");
        fill.className = "gp-axis-fill";
        track.appendChild(fill);
        rowEl.append(label, track);
        list.appendChild(rowEl);
        card.axisFills.set(i, fill);
      }
      el.appendChild(list);
    }

    return card;
  }

  buildStandardGamepad(card) {
    const svg = svgEl("svg", { viewBox: "0 0 320 204", class: "gp-svg", role: "img", "aria-label": "Gamepad buttons" });
    const button = (index, tag, attrs, label) => {
      const shape = svgEl(tag, { ...attrs, class: "vd-button" }, svg);
      card.buttonEls.set(index, shape);
      if (label) {
        const cx = attrs.cx ?? attrs.x + attrs.width / 2;
        const cy = attrs.cy ?? attrs.y + attrs.height / 2;
        card.labelEls.set(index, svgText(svg, cx, cy, label));
      }
      return shape;
    };

    // Triggers (6, 7) with an analog fill, and bumpers (4, 5).
    for (const [index, x, label] of [
      [6, 40, "LT"],
      [7, 210, "RT"],
    ]) {
      button(index, "rect", { x, y: 6, width: TRIGGER_WIDTH, height: 16, rx: 5 });
      card.triggerFills.set(index, svgEl("rect", { class: "gp-trigger-fill", x, y: 6, width: 0, height: 16, rx: 5 }, svg));
      svgText(svg, x + TRIGGER_WIDTH / 2, 14, label);
    }
    button(4, "rect", { x: 40, y: 28, width: 70, height: 12, rx: 6 }, "LB");
    button(5, "rect", { x: 210, y: 28, width: 70, height: 12, rx: 6 }, "RB");

    svgEl("rect", { class: "vd-body", x: 20, y: 46, width: 280, height: 152, rx: 60 }, svg);

    // Sticks: base, then a movable cap that also shows the stick-click button (10, 11).
    for (const [index, cx, cy] of [
      [10, 85, 100],
      [11, 200, 150],
    ]) {
      svgEl("circle", { class: "gp-stick-base", cx, cy, r: 26 }, svg);
      const cap = button(index, "circle", { cx, cy, r: 15 });
      card.stickDots.push({ el: cap, cx, cy });
    }

    // D-pad (12-15).
    svgEl("rect", { class: "gp-dpad-center", x: 111, y: 141, width: 18, height: 18 }, svg);
    button(12, "rect", { x: 111, y: 123, width: 18, height: 18, rx: 3 }, "▲");
    button(13, "rect", { x: 111, y: 159, width: 18, height: 18, rx: 3 }, "▼");
    button(14, "rect", { x: 93, y: 141, width: 18, height: 18, rx: 3 }, "◀");
    button(15, "rect", { x: 129, y: 141, width: 18, height: 18, rx: 3 }, "▶");

    // Face buttons (0-3), labelled with the Xbox names.
    button(0, "circle", { cx: 235, cy: 122, r: 12 }, "A");
    button(1, "circle", { cx: 257, cy: 100, r: 12 }, "B");
    button(2, "circle", { cx: 213, cy: 100, r: 12 }, "X");
    button(3, "circle", { cx: 235, cy: 78, r: 12 }, "Y");

    // Center cluster: select (8), start (9), home (16), touchpad (17).
    button(17, "rect", { x: 130, y: 56, width: 60, height: 24, rx: 6 });
    button(8, "rect", { x: 126, y: 90, width: 18, height: 10, rx: 5 });
    button(9, "rect", { x: 176, y: 90, width: 18, height: 10, rx: 5 });
    button(16, "circle", { cx: 160, cy: 122, r: 9 });

    const names = [
      "A/Cross", "B/Circle", "X/Square", "Y/Triangle", "Left Bumper", "Right Bumper",
      "Left Trigger", "Right Trigger", "Select/Back", "Start", "Left Stick", "Right Stick",
      "D-pad Up", "D-pad Down", "D-pad Left", "D-pad Right", "Home", "Touchpad",
    ];
    for (const [index, shape] of card.buttonEls) {
      const title = svgEl("title", {}, shape);
      title.textContent = names[index];
    }

    return svg;
  }

  // ---------------------------------------------------------------------------
  // Keyboard

  onKeyDown(event) {
    this.heldKeys.add(keyId(event));
    this.renderKeyboard();
  }

  onKeyUp(event) {
    const id = keyId(event);
    if (MODIFIER_META_CODES.has(id)) {
      // macOS does not send keyup for keys released while Meta is held.
      this.heldKeys.clear();
    } else {
      this.heldKeys.delete(id);
    }
    this.renderKeyboard();
  }

  renderKeyboard() {
    for (const [code, keyEl] of this.keyEls) {
      keyEl.classList.toggle("pressed", this.heldKeys.has(code));
    }
    const extras = [...this.heldKeys].filter((id) => !KEYBOARD_CODES.has(id));
    this.extraKeysEl.textContent = extras.length > 0 ? `Other keys held: ${extras.join(", ")}` : "";
  }

  // ---------------------------------------------------------------------------
  // Mouse

  onPointer(event) {
    if (event.pointerType !== "mouse") {
      return;
    }
    // Only start tracking presses that begin on the test target, but follow
    // releases anywhere so a button is never left stuck on.
    const tracking = this.mouseButtons !== 0;
    if (!tracking && !(event.type === "pointerdown" && this.isOnTarget(event))) {
      return;
    }
    this.mouseButtons = event.type === "pointercancel" ? 0 : event.buttons;
    this.renderMouse();
  }

  onWheel(event) {
    if (!this.isOnTarget(event)) {
      return;
    }
    const absX = Math.abs(event.deltaX);
    const absY = Math.abs(event.deltaY);
    if (absX === 0 && absY === 0) {
      return;
    }
    let direction;
    if (absY >= absX) {
      direction = event.deltaY < 0 ? "up" : "down";
    } else {
      direction = event.deltaX < 0 ? "left" : "right";
    }

    const chip = this.wheelEls.get(direction);
    chip.classList.add("pressed");
    clearTimeout(this.wheelTimeouts.get(direction));
    this.wheelTimeouts.set(
      direction,
      setTimeout(() => {
        chip.classList.remove("pressed");
        this.wheelTimeouts.delete(direction);
      }, WHEEL_FLASH_MS),
    );
  }

  renderMouse() {
    for (const { bit } of MOUSE_BUTTONS) {
      const pressed = (this.mouseButtons & bit) !== 0;
      this.mouseEls.get(bit).classList.toggle("pressed", pressed);
      this.mouseLabelEls.get(bit)?.classList.toggle("pressed", pressed);
    }
  }

  isOnTarget(event) {
    return event.target instanceof Node && this.targetElement.contains(event.target);
  }

  onBlur() {
    this.heldKeys.clear();
    this.renderKeyboard();
    this.mouseButtons = 0;
    this.renderMouse();
  }

  // ---------------------------------------------------------------------------
  // Gamepads

  pollGamepads() {
    const seen = new Set();
    for (const gamepad of navigator.getGamepads()) {
      if (!gamepad) {
        continue;
      }
      seen.add(gamepad.index);
      let card = this.gamepadCards.get(gamepad.index);
      if (!card || card.id !== gamepad.id) {
        card?.el.remove();
        card = this.buildGamepadCard(gamepad);
        this.gamepadCards.set(gamepad.index, card);
        this.gamepadListEl.appendChild(card.el);
      }
      updateGamepadCard(card, gamepad);
    }

    for (const [index, card] of this.gamepadCards) {
      if (!seen.has(index)) {
        card.el.remove();
        this.gamepadCards.delete(index);
      }
    }
    this.renderGamepadEmptyState();

    if (this.running) {
      this.gamepadRafId = requestAnimationFrame(this.boundPollGamepads);
    }
  }

  renderGamepadEmptyState() {
    if (this.gamepadCards.size > 0) {
      this.gamepadEmptyEl.textContent = "";
    } else if (typeof navigator.getGamepads !== "function") {
      this.gamepadEmptyEl.textContent = "The Gamepad API is not available in this browser.";
    } else if (!this.running) {
      this.gamepadEmptyEl.textContent = "Press Start to show connected gamepads.";
    } else {
      this.gamepadEmptyEl.textContent = "No gamepad detected. Press a button on a controller to connect it.";
    }
  }
}

function updateGamepadCard(card, gamepad) {
  for (const [index, shape] of card.buttonEls) {
    const pressed = Boolean(gamepad.buttons[index]?.pressed);
    shape.classList.toggle("pressed", pressed);
    card.labelEls.get(index)?.classList.toggle("pressed", pressed);
  }
  for (const [index, fill] of card.triggerFills) {
    const value = clamp(gamepad.buttons[index]?.value ?? 0, 0, 1);
    fill.setAttribute("width", String(value * TRIGGER_WIDTH));
  }
  card.stickDots.forEach(({ el, cx, cy }, stick) => {
    const x = clamp(gamepad.axes[stick * 2] ?? 0, -1, 1);
    const y = clamp(gamepad.axes[stick * 2 + 1] ?? 0, -1, 1);
    el.setAttribute("cx", String(cx + x * STICK_TRAVEL));
    el.setAttribute("cy", String(cy + y * STICK_TRAVEL));
  });
  for (const [index, chip] of card.genericButtonEls) {
    chip.classList.toggle("pressed", Boolean(gamepad.buttons[index]?.pressed));
  }
  for (const [index, fill] of card.axisFills) {
    const value = clamp(gamepad.axes[index] ?? 0, -1, 1);
    fill.style.width = `${Math.abs(value) * 50}%`;
    fill.style.left = value < 0 ? `${50 - Math.abs(value) * 50}%` : "50%";
  }
}

function keyId(event) {
  return event.code || normalizeKeyName(event.key);
}

function normalizeKeyName(key) {
  if (!key || key === "Unidentified") {
    return "Unknown";
  }
  return key === " " ? "Space" : key;
}

function createPanel(title) {
  const panel = document.createElement("div");
  panel.className = "device-panel";
  const heading = document.createElement("h3");
  heading.textContent = title;
  panel.appendChild(heading);
  return panel;
}

function svgEl(tag, attrs, parent) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, String(value));
  }
  parent?.appendChild(el);
  return el;
}

function svgText(parent, x, y, text) {
  const el = svgEl("text", { class: "vd-label", x, y, "text-anchor": "middle", "dominant-baseline": "central" }, parent);
  el.textContent = text;
  return el;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildKeyboardLayout() {
  const keys = [];
  const row = (y, startX, items) => {
    let x = startX;
    for (const item of items) {
      if (typeof item === "number") {
        x += item;
        continue;
      }
      const [code, label, w = 1] = item;
      keys.push({ code, label, x, y, w });
      x += w;
    }
  };
  const fnKeys = (from, to) => {
    const result = [];
    for (let n = from; n <= to; n += 1) {
      result.push([`F${n}`, `F${n}`]);
    }
    return result;
  };
  const letters = (chars) => [...chars].map((c) => [`Key${c}`, c]);
  const digits = [..."1234567890"].map((d) => [`Digit${d}`, d]);

  row(0, 0, [["Escape", "Esc"], 1, ...fnKeys(1, 4), 0.5, ...fnKeys(5, 8), 0.5, ...fnKeys(9, 12)]);
  row(0, 15.25, [["PrintScreen", "PrtSc"], ["ScrollLock", "ScrLk"], ["Pause", "Pause"]]);

  row(1.5, 0, [["Backquote", "`"], ...digits, ["Minus", "-"], ["Equal", "="], ["Backspace", "Backspace", 2]]);
  row(1.5, 15.25, [["Insert", "Ins"], ["Home", "Home"], ["PageUp", "PgUp"]]);

  row(2.5, 0, [["Tab", "Tab", 1.5], ...letters("QWERTYUIOP"), ["BracketLeft", "["], ["BracketRight", "]"], ["Backslash", "\\", 1.5]]);
  row(2.5, 15.25, [["Delete", "Del"], ["End", "End"], ["PageDown", "PgDn"]]);

  row(3.5, 0, [["CapsLock", "Caps", 1.75], ...letters("ASDFGHJKL"), ["Semicolon", ";"], ["Quote", "'"], ["Enter", "Enter", 2.25]]);

  row(4.5, 0, [["ShiftLeft", "Shift", 2.25], ...letters("ZXCVBNM"), ["Comma", ","], ["Period", "."], ["Slash", "/"], ["ShiftRight", "Shift", 2.75]]);
  row(4.5, 16.25, [["ArrowUp", "↑"]]);

  row(5.5, 0, [
    ["ControlLeft", "Ctrl", 1.25],
    ["MetaLeft", "Meta", 1.25],
    ["AltLeft", "Alt", 1.25],
    ["Space", "", 6.25],
    ["AltRight", "Alt", 1.25],
    ["MetaRight", "Meta", 1.25],
    ["ContextMenu", "Menu", 1.25],
    ["ControlRight", "Ctrl", 1.25],
  ]);
  row(5.5, 15.25, [["ArrowLeft", "←"], ["ArrowDown", "↓"], ["ArrowRight", "→"]]);

  return keys;
}
