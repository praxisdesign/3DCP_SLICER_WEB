export function generateGCode(layers, settings, modelName) {
  const lines = [
    '; 3DCP Slicer v1',
    `; Model: ${modelName}`,
    `; Bead Width: ${toMillimeters(settings.beadWidth)} mm`,
    `; Bead Height: ${toMillimeters(settings.beadHeight)} mm`,
    `; Print Speed: ${settings.printSpeedMmMin} mm/min`,
    `; Travel Speed: ${settings.travelSpeedMmMin} mm/min`,
    `; Flow Multiplier: ${settings.flowMultiplier}`,
    'G21 ; millimeters',
    'G90 ; absolute positioning',
    'G92 E0',
    'M82 ; absolute extrusion',
  ];

  let extrusion = 0;
  const extrusionFactor = settings.beadWidth * settings.beadHeight * settings.flowMultiplier;
  const pumpOnCommand = settings.pumpOnCommand.trim();
  const pumpOffCommand = settings.pumpOffCommand.trim();

  layers.forEach((layer) => {
    lines.push(`; Layer ${layer.index} Z${toMillimeters(layer.z)}`);

    layer.paths.forEach((path) => {
      const points = path.points;
      if (points.length < 2) {
        return;
      }

      const first = points[0];
      lines.push(`G0 X${toMillimeters(first.x)} Y${toMillimeters(first.y)} Z${toMillimeters(first.z)} F${settings.travelSpeedMmMin}`);
      if (pumpOnCommand) {
        lines.push(pumpOnCommand);
      }
      for (let i = 1; i < points.length; i += 1) {
        const start = points[i - 1];
        const end = points[i];
        const length = start.distanceTo(end);
        extrusion += length * extrusionFactor * 1000;
        lines.push(`G1 X${toMillimeters(end.x)} Y${toMillimeters(end.y)} Z${toMillimeters(end.z)} E${extrusion.toFixed(4)} F${settings.printSpeedMmMin}`);
      }
      if (pumpOffCommand) {
        lines.push(pumpOffCommand);
      }
    });
  });

  if (pumpOffCommand) {
    lines.push(pumpOffCommand);
  }
  lines.push('M84');
  return `${lines.join('\n')}\n`;
}

function toMillimeters(value) {
  return (value * 1000).toFixed(3);
}
