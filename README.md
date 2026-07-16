# 3DCP Slicer Web

3DCP Slicer Web is a local browser-based concrete 3D printing slicer prototype. It loads common 3D model formats, slices geometry along a Z-up coordinate system, previews layer paths and bead traces, estimates material and print time, and generates configurable G-code for concrete printing workflows.

## Features

- Load `.obj`, `.3dm`, `.step`, and `.stp` model files.
- Preview models in a Three.js viewport with Z-up orientation, grid, orbit controls, and coordinate gizmo.
- Configure bead width, bead height, layer preview, playback animation, and all-bead preview.
- Estimate path length, material volume, and print time.
- Configure printer profile values including print speed, travel speed, flow multiplier, pump on, and pump off commands.
- Preview and download generated G-code.

## Getting Started

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local app at:

```text
http://127.0.0.1:5173/
```

## Controls

- `Model Upload`: Import `.obj`, `.3dm`, `.step`, or `.stp` files.
- `Bead Width`: Sets extrusion bead width in millimeters.
- `Bead Height`: Sets both bead height and slicing layer height in millimeters.
- `Layer Preview`: Selects the visible slice layer.
- `Play / Pause`: Animates layer preview playback.
- `All Beads`: Shows the full bead path preview.
- `Printer Profile`: Sets print speed, travel speed, flow multiplier, and pump commands.
- `G-code Preview`: Generates a collapsible G-code preview.
- `G-code Download`: Saves the generated G-code file.
