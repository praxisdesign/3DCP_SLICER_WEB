import { useMemo } from 'react';
import { BufferGeometry, CatmullRomCurve3, Vector3 } from 'three';

export default function SceneView({ model, bounds, layer, layers, settings }) {
  const centeredModel = useMemo(() => {
    if (!model?.object || !bounds) {
      return null;
    }

    const object = model.object.clone(true);
    object.position.sub(bounds.center);
    object.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.28;
        child.material.color?.set('#64748b');
      }
    });
    return object;
  }, [model, bounds]);

  const normalizedLayer = useMemo(() => {
    if (!layer || !bounds) {
      return null;
    }

    return {
      ...layer,
      z: layer.z - bounds.center.z,
      segments: layer.segments.map(([start, end]) => [
        new Vector3(start.x - bounds.center.x, start.y - bounds.center.y, start.z - bounds.center.z),
        new Vector3(end.x - bounds.center.x, end.y - bounds.center.y, end.z - bounds.center.z),
      ]),
      paths: layer.paths.map((path) => ({
        closed: path.closed,
        points: path.points.map((p) => new Vector3(p.x - bounds.center.x, p.y - bounds.center.y, p.z - bounds.center.z)),
      })),
    };
  }, [layer, bounds]);

  const normalizedLayers = useMemo(() => {
    if (!layers?.length || !bounds) {
      return [];
    }

    return layers.map((currentLayer) => ({
      ...currentLayer,
      z: currentLayer.z - bounds.center.z,
      segments: currentLayer.segments.map(([start, end]) => [
        new Vector3(start.x - bounds.center.x, start.y - bounds.center.y, start.z - bounds.center.z),
        new Vector3(end.x - bounds.center.x, end.y - bounds.center.y, end.z - bounds.center.z),
      ]),
    }));
  }, [layers, bounds]);

  return (
    <group>
      {settings.showModel && centeredModel && <primitive object={centeredModel} />}
      {normalizedLayer && settings.showSlices && <SliceLines layer={normalizedLayer} />}
      {normalizedLayer && settings.showBeads && (
        settings.showAllBeads ? (
          <AllBeadsPreview layers={normalizedLayers} />
        ) : (
          <BeadPreview layer={normalizedLayer} beadWidth={settings.beadWidth} beadHeight={settings.beadHeight} />
        )
      )}
    </group>
  );
}

function AllBeadsPreview({ layers }) {
  const geometry = useMemo(() => {
    const points = [];

    layers.forEach((layer) => {
      layer.segments.forEach(([start, end]) => {
        points.push(start, end);
      });
    });

    return new BufferGeometry().setFromPoints(points);
  }, [layers]);

  return (
    <lineSegments>
      <primitive attach="geometry" object={geometry} />
      <lineBasicMaterial color="#8f969e" transparent opacity={0.62} />
    </lineSegments>
  );
}

function SliceLines({ layer }) {
  return (
    <group>
      {layer.segments.map((segment, index) => (
        <line key={`${layer.index}-line-${index}`}>
          <primitive attach="geometry" object={lineGeometry(segment)} />
          <lineBasicMaterial color="#0f172a" linewidth={2} />
        </line>
      ))}
    </group>
  );
}

function BeadPreview({ layer, beadWidth, beadHeight }) {
  const radius = Math.max(0.015, Math.min(beadWidth, beadHeight) / 2);

  return (
    <group>
      {layer.paths.map((path, index) => {
        if (path.points.length < 2) {
          return null;
        }

        const curve = new CatmullRomCurve3(path.points, path.closed);
        const tubularSegments = Math.max(3, path.points.length * 4);
        return (
          <mesh key={`${layer.index}-bead-${index}`} castShadow receiveShadow>
            <tubeGeometry args={[curve, tubularSegments, radius, 10, path.closed]} />
            <meshStandardMaterial color="#9aa0a6" roughness={0.86} metalness={0.01} />
          </mesh>
        );
      })}
    </group>
  );
}

function lineGeometry(points) {
  return new BufferGeometry().setFromPoints(points);
}
