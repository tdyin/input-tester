export class InputCapture {
  constructor(targetElement, onInput) {
    this.targetElement = targetElement;
    this.onInput = onInput;
    this.handlers = [];
    this.gamepadPollRafId = null;
    this.gamepadButtonSnapshots = new Map();
    this.gamepadAxisSnapshots = new Map();
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnPointerDown = this.onPointerDown.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnTouchStart = this.onTouchStart.bind(this);
    this.boundOnWheel = this.onWheel.bind(this);
    this.boundOnContextMenu = this.onContextMenu.bind(this);
    this.boundOnAuxClick = this.onAuxClick.bind(this);
    this.boundOnMouseNavigationButtons = this.onMouseNavigationButtons.bind(this);
    this.boundOnWindowMouseNavigationButtons = this.onWindowMouseNavigationButtons.bind(this);
    this.boundOnWindowAuxClick = this.onWindowAuxClick.bind(this);
    this.boundPollGamepads = this.pollGamepads.bind(this);
  }

  start() {
    this.stop();

    this.targetElement.focus({ preventScroll: true });
    window.addEventListener("keydown", this.boundOnKeyDown, { capture: true });
    this.handlers.push(() => window.removeEventListener("keydown", this.boundOnKeyDown, { capture: true }));
    this.targetElement.addEventListener("wheel", this.boundOnWheel, { passive: true });
    this.handlers.push(() => this.targetElement.removeEventListener("wheel", this.boundOnWheel, { passive: true }));
    this.targetElement.addEventListener("contextmenu", this.boundOnContextMenu);
    this.handlers.push(() => this.targetElement.removeEventListener("contextmenu", this.boundOnContextMenu));
    this.targetElement.addEventListener("auxclick", this.boundOnAuxClick);
    this.handlers.push(() => this.targetElement.removeEventListener("auxclick", this.boundOnAuxClick));
    this.targetElement.addEventListener("mousedown", this.boundOnMouseNavigationButtons);
    this.handlers.push(() => this.targetElement.removeEventListener("mousedown", this.boundOnMouseNavigationButtons));
    window.addEventListener("mousedown", this.boundOnWindowMouseNavigationButtons, { capture: true });
    this.handlers.push(() =>
      window.removeEventListener("mousedown", this.boundOnWindowMouseNavigationButtons, { capture: true }),
    );
    window.addEventListener("mouseup", this.boundOnWindowMouseNavigationButtons, { capture: true });
    this.handlers.push(() =>
      window.removeEventListener("mouseup", this.boundOnWindowMouseNavigationButtons, { capture: true }),
    );
    window.addEventListener("auxclick", this.boundOnWindowAuxClick, { capture: true });
    this.handlers.push(() => window.removeEventListener("auxclick", this.boundOnWindowAuxClick, { capture: true }));

    if (window.PointerEvent) {
      this.targetElement.addEventListener("pointerdown", this.boundOnPointerDown, { passive: true });
      this.handlers.push(() =>
        this.targetElement.removeEventListener("pointerdown", this.boundOnPointerDown, { passive: true }),
      );
      this.startGamepadPolling();
      return;
    }

    this.targetElement.addEventListener("touchstart", this.boundOnTouchStart, { passive: true });
    this.handlers.push(() =>
      this.targetElement.removeEventListener("touchstart", this.boundOnTouchStart, { passive: true }),
    );
    this.targetElement.addEventListener("mousedown", this.boundOnMouseDown, { passive: true });
    this.handlers.push(() =>
      this.targetElement.removeEventListener("mousedown", this.boundOnMouseDown, { passive: true }),
    );

    this.startGamepadPolling();
  }

  stop() {
    for (const detach of this.handlers) {
      detach();
    }
    this.handlers = [];
    this.stopGamepadPolling();
  }

  onKeyDown(event) {
    if (event.repeat) {
      return;
    }
    this.onInput("keyboard", event.timeStamp, formatKeyboardInput(event));
  }

  onPointerDown(event) {
    this.onInput(event.pointerType || "pointer", event.timeStamp, formatPointerInput(event));
  }

  onTouchStart(event) {
    this.onInput("touch", event.timeStamp, formatTouchInput(event));
  }

  onMouseDown(event) {
    this.onInput("mouse", event.timeStamp, formatMouseInput(event));
  }

  onWheel(event) {
    this.onInput("wheel", event.timeStamp, formatWheelInput(event));
  }

  onContextMenu(event) {
    event.preventDefault();
  }

  onAuxClick(event) {
    if (isNavigationButton(event.button)) {
      event.preventDefault();
    }
  }

  onMouseNavigationButtons(event) {
    if (isNavigationButton(event.button)) {
      event.preventDefault();
    }
  }

  onWindowMouseNavigationButtons(event) {
    if (!isNavigationButton(event.button) || !isEventInsideTargetBounds(event, this.targetElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  onWindowAuxClick(event) {
    if (!isNavigationButton(event.button) || !isEventInsideTargetBounds(event, this.targetElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  startGamepadPolling() {
    if (typeof navigator.getGamepads !== "function") {
      return;
    }
    if (this.gamepadPollRafId !== null) {
      return;
    }
    this.gamepadPollRafId = requestAnimationFrame(this.boundPollGamepads);
  }

  stopGamepadPolling() {
    if (this.gamepadPollRafId !== null) {
      cancelAnimationFrame(this.gamepadPollRafId);
      this.gamepadPollRafId = null;
    }
    this.gamepadButtonSnapshots.clear();
    this.gamepadAxisSnapshots.clear();
  }

  pollGamepads() {
    const gamepads = navigator.getGamepads();
    const seenGamepadIndexes = new Set();

    for (const gamepad of gamepads) {
      if (!gamepad) {
        continue;
      }
      seenGamepadIndexes.add(gamepad.index);
      const previousButtons = this.gamepadButtonSnapshots.get(gamepad.index) || [];
      const currentButtons = gamepad.buttons.map((button) => button.pressed);
      const previousAxisStates = this.gamepadAxisSnapshots.get(gamepad.index) || [];
      const currentAxisStates = gamepad.axes.map((axisValue) => axisState(axisValue));
      const inputTime = Number.isFinite(gamepad.timestamp) && gamepad.timestamp > 0 ? gamepad.timestamp : performance.now();

      for (let i = 0; i < currentButtons.length; i += 1) {
        if (!currentButtons[i] || previousButtons[i]) {
          continue;
        }
        this.onInput("gamepad", inputTime, formatGamepadInput(gamepad, i));
      }

      for (let i = 0; i < currentAxisStates.length; i += 1) {
        if (currentAxisStates[i] === previousAxisStates[i]) {
          continue;
        }
        if (currentAxisStates[i] === "center") {
          continue;
        }
        const axisValue = gamepad.axes[i];
        this.onInput("gamepad", inputTime, formatGamepadAxisInput(gamepad, i, axisValue, currentAxisStates[i]));
      }

      this.gamepadButtonSnapshots.set(gamepad.index, currentButtons);
      this.gamepadAxisSnapshots.set(gamepad.index, currentAxisStates);
    }

    for (const knownIndex of this.gamepadButtonSnapshots.keys()) {
      if (!seenGamepadIndexes.has(knownIndex)) {
        this.gamepadButtonSnapshots.delete(knownIndex);
      }
    }
    for (const knownIndex of this.gamepadAxisSnapshots.keys()) {
      if (!seenGamepadIndexes.has(knownIndex)) {
        this.gamepadAxisSnapshots.delete(knownIndex);
      }
    }

    if (this.gamepadPollRafId !== null) {
      this.gamepadPollRafId = requestAnimationFrame(this.boundPollGamepads);
    }
  }
}

function formatKeyboardInput(event) {
  const modifiers = [];
  if (event.ctrlKey) {
    modifiers.push("Ctrl");
  }
  if (event.altKey) {
    modifiers.push("Alt");
  }
  if (event.shiftKey) {
    modifiers.push("Shift");
  }
  if (event.metaKey) {
    modifiers.push("Meta");
  }
  modifiers.push(normalizeKey(event.key));
  return modifiers.join("+");
}

function normalizeKey(key) {
  if (!key || key === "Unidentified") {
    return "Unknown";
  }
  if (key === " ") {
    return "Space";
  }
  return key;
}

function formatPointerInput(event) {
  return `${toTitleCase(event.pointerType || "pointer")} ${buttonName(event.button)} button`;
}

function formatTouchInput(event) {
  const touchCount = event.touches?.length ?? 0;
  return `${touchCount} touch${touchCount === 1 ? "" : "es"}`;
}

function formatMouseInput(event) {
  return `${buttonName(event.button)} button`;
}

function formatWheelInput(event) {
  const absX = Math.abs(event.deltaX);
  const absY = Math.abs(event.deltaY);
  if (absY >= absX) {
    return event.deltaY < 0 ? "Wheel Up" : "Wheel Down";
  }
  return event.deltaX < 0 ? "Wheel Left" : "Wheel Right";
}

function buttonName(button) {
  switch (button) {
    case 0:
      return "Left";
    case 1:
      return "Middle";
    case 2:
      return "Right";
    case 3:
      return "Back";
    case 4:
      return "Forward";
    default:
      return `Button ${button}`;
  }
}

function toTitleCase(value) {
  if (!value) {
    return "Pointer";
  }
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function formatGamepadInput(gamepad, buttonIndex) {
  return `Pad ${gamepad.index + 1} ${gamepadButtonName(buttonIndex)}`;
}

function formatGamepadAxisInput(gamepad, axisIndex, axisValue, state) {
  const direction = state === "pos" ? "+" : "-";
  return `Pad ${gamepad.index + 1} ${gamepadAxisName(axisIndex)}${direction} ${axisValue.toFixed(2)}`;
}

function gamepadButtonName(buttonIndex) {
  const standardNames = [
    "A/Cross",
    "B/Circle",
    "X/Square",
    "Y/Triangle",
    "Left Bumper",
    "Right Bumper",
    "Left Trigger",
    "Right Trigger",
    "Select/Back",
    "Start",
    "Left Stick",
    "Right Stick",
    "D-pad Up",
    "D-pad Down",
    "D-pad Left",
    "D-pad Right",
    "Home",
    "Touchpad",
  ];
  return standardNames[buttonIndex] || `Button ${buttonIndex}`;
}

function gamepadAxisName(axisIndex) {
  const standardNames = ["Left Stick X", "Left Stick Y", "Right Stick X", "Right Stick Y"];
  return standardNames[axisIndex] || `Axis ${axisIndex}`;
}

function axisState(value) {
  const deadzone = 0.2;
  if (value >= deadzone) {
    return "pos";
  }
  if (value <= -deadzone) {
    return "neg";
  }
  return "center";
}

function isNavigationButton(button) {
  return button === 3 || button === 4;
}

function isEventInsideTargetBounds(event, targetElement) {
  if (!targetElement || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
    return false;
  }
  const rect = targetElement.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}
