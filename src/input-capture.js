export class InputCapture {
  constructor(targetElement, onInput) {
    this.targetElement = targetElement;
    this.onInput = onInput;
    this.handlers = [];
    this.gamepadPollRafId = null;
    this.gamepadButtonSnapshots = new Map();
    this.gamepadAxisSnapshots = new Map();
    this.xrSession = null;
    this.xrReferenceSpace = null;
    this.xrFrameId = null;
    this.xrInputSnapshots = new Map();
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
    this.boundOnXrSessionEnd = this.onXrSessionEnd.bind(this);
    this.boundOnXrSelectStart = this.onXrSelectStart.bind(this);
    this.boundOnXrSelectEnd = this.onXrSelectEnd.bind(this);
    this.boundOnXrSqueezeStart = this.onXrSqueezeStart.bind(this);
    this.boundOnXrSqueezeEnd = this.onXrSqueezeEnd.bind(this);
    this.boundOnXrFrame = this.onXrFrame.bind(this);
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
      this.startWebXrSession();
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
    this.startWebXrSession();
  }

  stop() {
    for (const detach of this.handlers) {
      detach();
    }
    this.handlers = [];
    this.stopGamepadPolling();
    this.stopWebXrSession();
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
    this.onInput("mouse", event.timeStamp, formatWheelInput(event));
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

  async startWebXrSession() {
    if (typeof navigator.xr?.requestSession !== "function") {
      return;
    }
    if (this.xrSession) {
      return;
    }

    try {
      const session = await navigator.xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"],
      });
      this.attachXrSession(session);
    } catch (error) {
      if (
        error?.name === "NotSupportedError" ||
        error?.name === "NotAllowedError" ||
        error?.name === "SecurityError" ||
        error?.name === "InvalidStateError"
      ) {
        return;
      }
      console.error("Failed to start WebXR session", error);
    }
  }

  async attachXrSession(session) {
    this.xrSession = session;
    this.xrInputSnapshots.clear();
    session.addEventListener("end", this.boundOnXrSessionEnd);
    session.addEventListener("selectstart", this.boundOnXrSelectStart);
    session.addEventListener("selectend", this.boundOnXrSelectEnd);
    session.addEventListener("squeezestart", this.boundOnXrSqueezeStart);
    session.addEventListener("squeezeend", this.boundOnXrSqueezeEnd);

    try {
      this.xrReferenceSpace = await session.requestReferenceSpace("local");
      if (this.xrSession === session) {
        this.xrFrameId = session.requestAnimationFrame(this.boundOnXrFrame);
      }
    } catch (error) {
      console.error("Failed to initialize WebXR reference space", error);
    }
  }

  stopWebXrSession() {
    if (!this.xrSession) {
      return;
    }

    const session = this.xrSession;
    this.detachXrSessionListeners(session);
    this.xrSession = null;
    this.xrReferenceSpace = null;
    this.xrFrameId = null;
    this.xrInputSnapshots.clear();
    session.end().catch((error) => {
      console.error("Failed to end WebXR session", error);
    });
  }

  onXrSessionEnd() {
    if (!this.xrSession) {
      return;
    }

    const session = this.xrSession;
    this.detachXrSessionListeners(session);
    this.xrSession = null;
    this.xrReferenceSpace = null;
    this.xrFrameId = null;
    this.xrInputSnapshots.clear();
  }

  detachXrSessionListeners(session) {
    session.removeEventListener("end", this.boundOnXrSessionEnd);
    session.removeEventListener("selectstart", this.boundOnXrSelectStart);
    session.removeEventListener("selectend", this.boundOnXrSelectEnd);
    session.removeEventListener("squeezestart", this.boundOnXrSqueezeStart);
    session.removeEventListener("squeezeend", this.boundOnXrSqueezeEnd);
  }

  onXrSelectStart(event) {
    this.emitXrAction(event, "selectstart");
  }

  onXrSelectEnd(event) {
    this.emitXrAction(event, "selectend");
  }

  onXrSqueezeStart(event) {
    this.emitXrAction(event, "squeezestart");
  }

  onXrSqueezeEnd(event) {
    this.emitXrAction(event, "squeezeend");
  }

  emitXrAction(event, actionName) {
    this.onInput("xr", event.timeStamp, formatXrActionInput(event.inputSource, actionName));
  }

  onXrFrame(time, frame) {
    const session = this.xrSession;
    if (!session || !this.xrReferenceSpace) {
      return;
    }

    for (const inputSource of session.inputSources) {
      const space = inputSource.gripSpace || inputSource.targetRaySpace;
      if (!space) {
        continue;
      }
      const pose = frame.getPose(space, this.xrReferenceSpace);
      if (!pose) {
        continue;
      }

      const currentPose = toPoseSnapshot(pose, time);
      const previousPose = this.xrInputSnapshots.get(inputSource);
      this.xrInputSnapshots.set(inputSource, currentPose);

      if (!previousPose) {
        continue;
      }

      if (!hasMeaningfulPoseDelta(previousPose, currentPose)) {
        continue;
      }

      this.onInput("xr", time, formatXrPoseInput(inputSource, currentPose, previousPose));
    }

    if (this.xrSession === session) {
      this.xrFrameId = session.requestAnimationFrame(this.boundOnXrFrame);
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

function formatXrActionInput(inputSource, actionName) {
  return `${describeXrInputSource(inputSource)} ${actionName}`;
}

function formatXrPoseInput(inputSource, currentPose, previousPose) {
  const distanceMm = Math.round(positionDistance(previousPose, currentPose) * 1000);
  const rotationDeg = Math.round((orientationDistance(previousPose, currentPose) * 180) / Math.PI);
  return `${describeXrInputSource(inputSource)} moved ${distanceMm}mm rot ${rotationDeg}deg`;
}

function describeXrInputSource(inputSource) {
  const handedness = inputSource?.handedness && inputSource.handedness !== "none" ? inputSource.handedness : "unknown";
  const targetRayMode = inputSource?.targetRayMode || "unknown";
  return `XR ${toTitleCase(handedness)} ${targetRayMode}`;
}

function toPoseSnapshot(pose, timestamp) {
  return {
    timestamp,
    px: pose.transform.position.x,
    py: pose.transform.position.y,
    pz: pose.transform.position.z,
    ox: pose.transform.orientation.x,
    oy: pose.transform.orientation.y,
    oz: pose.transform.orientation.z,
    ow: pose.transform.orientation.w,
  };
}

function hasMeaningfulPoseDelta(previousPose, currentPose) {
  const minIntervalMs = 80;
  if (currentPose.timestamp - previousPose.timestamp < minIntervalMs) {
    return false;
  }

  const minDistanceMeters = 0.01;
  if (positionDistance(previousPose, currentPose) >= minDistanceMeters) {
    return true;
  }

  const minRotationRadians = 0.08;
  return orientationDistance(previousPose, currentPose) >= minRotationRadians;
}

function positionDistance(a, b) {
  const dx = b.px - a.px;
  const dy = b.py - a.py;
  const dz = b.pz - a.pz;
  return Math.hypot(dx, dy, dz);
}

function orientationDistance(a, b) {
  const dot = Math.abs(a.ox * b.ox + a.oy * b.oy + a.oz * b.oz + a.ow * b.ow);
  const clampedDot = Math.min(1, Math.max(-1, dot));
  return 2 * Math.acos(clampedDot);
}
