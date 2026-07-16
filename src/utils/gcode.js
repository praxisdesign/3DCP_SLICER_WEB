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

    layer.segments.forEach(([start, end]) => {
      const length = start.distanceTo(end);
      extrusion += length * extrusionFactor * 1000;
      lines.push(`G0 X${toMillimeters(start.x)} Y${toMillimeters(start.y)} Z${toMillimeters(start.z)} F${settings.travelSpeedMmMin}`);
      if (pumpOnCommand) {
        lines.push(pumpOnCommand);
      }
      lines.push(`G1 X${toMillimeters(end.x)} Y${toMillimeters(end.y)} Z${toMillimeters(end.z)} E${extrusion.toFixed(4)} F${settings.printSpeedMmMin}`);
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
