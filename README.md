# Input Tester

A web application that captures and logs various types of user input events for testing and debugging purposes.

## What It Does

Input Tester is a comprehensive input event capture tool that monitors and records:

- **Keyboard input** — Key presses and key codes
- **Mouse/Pointer events** — Clicks, movement, and buttons
- **Touch input** — Touch coordinates and events
- **Wheel events** — Mouse wheel scrolling
- **Gamepad input** — Gamepad button presses and analog stick values
- **XR (Virtual Reality)** — WebXR controller input and selection/squeeze events

The application displays real-time statistics including:
- Current input value
- Total number of events captured
- Event source (keyboard, mouse, gamepad, etc.)
- First and latest input timestamps

All captured data can be exported as JSON or CSV for analysis.

## How to Run

### Prerequisites
- Python 3+ (for serving the application)
- A modern web browser

### Quick Start

1. Navigate to the project directory:
   ```bash
   cd /input-tester
   ```

2. Start a local HTTP server:
   ```bash
   python3 -m http.server 8000
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:8000
   ```

### Using the Interface

1. Click **Start** to begin capturing input events
2. Interact with the "Capture input here" box using keyboard, mouse, touch, gamepad, or VR controllers
3. Watch the input log update in real-time with all captured events
4. Use **Stop** to pause capturing
5. Use **Reset** to clear all recorded data
6. Use **Fullscreen Input** to make the capture area fill the screen (press `Esc` to exit)
7. Use **Copy JSON** to copy all data to your clipboard
8. Use **Download CSV** to save the data as a CSV file

## Project Structure

```
input-tester/
├── index.html           # Main HTML interface
├── src/
│   ├── main.js          # Application logic and event handling
│   ├── input-capture.js # InputCapture class for monitoring all input types
│   └── styles.css       # Styling
└── README.md            # This file
```

## Development

The application is built with vanilla JavaScript (no frameworks required). The main components are:

- **InputCapture** — Handles all event listener setup and input monitoring
- **main.js** — Manages UI updates, data storage, and export functionality
