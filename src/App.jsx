import { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  Bounds,
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  PerspectiveCamera,
  useBounds,
} from '@react-three/drei';
import { Box3, Vector3 } from 'three';
import {
  Box,
  ChevronDown,
  Gauge,
  Layers,
  Pause,
  Play,
  Printer,
  Upload,
} from 'lucide-react';
import SceneView from './components/SceneView.jsx';
import { generateGCode } from './utils/gcode.js';
import { loadModelFile } from './utils/modelLoaders.js';
import { sliceModel } from './utils/slicer.js';
import './styles.css';

const defaultSettings = {
  beadWidthMm: 60,
  beadHeightMm: 20,
  wallCount: 1,
  printSpeedMmMin: 1800,
  travelSpeedMmMin: 6000,
  flowMultiplier: 1,
  pumpOnCommand: 'M106',
  pumpOffCommand: 'M107',
  showModel: true,
  showSlices: true,
  showBeads: true,
  showAllBeads: false,
};

export default function App() {
  const [model, setModel] = useState(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [activeLayer, setActiveLayer] = useState(0);
  const [status, setStatus] = useState('OBJ, 3DM, STEP 파일을 업로드하세요.');
  const [gcodePreview, setGcodePreview] = useState('');
  const [isGcodePreviewOpen, setIsGcodePreviewOpen] = useState(false);
  const [isLayerAnimating, setIsLayerAnimating] = useState(false);
  const [layerAnimationSpeed, setLayerAnimationSpeed] = useState(6);

  const bounds = useMemo(() => {
    if (!model?.object) {
      return null;
    }

    const box = new Box3().setFromObject(model.object);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    return { box, size, center };
  }, [model]);

  const sliceData = useMemo(() => {
    if (!model?.object || !bounds) {
      return { layers: [], totalLength: 0 };
    }

    const machineSettings = toMachineSettings(settings);
    return sliceModel(model.object, {
      layerHeight: machineSettings.beadHeight,
      beadWidth: machineSettings.beadWidth,
      maxLayers: 220,
    });
  }, [model, bounds, settings.beadHeightMm, settings.beadWidthMm]);

  const selectedLayer = sliceData.layers[Math.min(activeLayer, Math.max(sliceData.layers.length - 1, 0))];
  const estimate = useMemo(() => {
    const machineSettings = toMachineSettings(settings);
    const volumeM3 = sliceData.totalLength * machineSettings.beadWidth * machineSettings.beadHeight;
    const printSpeedMMin = Math.max(0.001, settings.printSpeedMmMin / 1000);

    return {
      volumeLiters: volumeM3 * 1000 * settings.flowMultiplier,
      printMinutes: sliceData.totalLength / printSpeedMMin,
    };
  }, [settings, sliceData.totalLength]);

  useEffect(() => {
    if (!isLayerAnimating || sliceData.layers.length <= 1) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setActiveLayer((current) => (current + 1) % sliceData.layers.length);
    }, 1000 / layerAnimationSpeed);

    return () => window.clearInterval(interval);
  }, [isLayerAnimating, layerAnimationSpeed, sliceData.layers.length]);

  useEffect(() => {
    setGcodePreview('');
  }, [
    settings.beadWidthMm,
    settings.beadHeightMm,
    settings.printSpeedMmMin,
    settings.travelSpeedMmMin,
    settings.flowMultiplier,
    settings.pumpOnCommand,
    settings.pumpOffCommand,
    sliceData.layers,
  ]);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setStatus(`${file.name} 불러오는 중...`);

    try {
      const loaded = await loadModelFile(file);
      setModel(loaded);
      setActiveLayer(0);
      setGcodePreview('');
      setStatus(`${file.name} 로드 완료`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '파일을 읽지 못했습니다.');
    }
  }

  function updateSetting(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function createGCode() {
    if (!model || sliceData.layers.length === 0) {
      setStatus('G-code를 만들 슬라이스가 없습니다.');
      return '';
    }

    return generateGCode(sliceData.layers, toMachineSettings(settings), model.name);
  }

  function handlePreviewGCode() {
    const gcode = createGCode();
    if (!gcode) {
      return;
    }

    setGcodePreview(gcode);
    setIsGcodePreviewOpen(true);
    setStatus('G-code 미리보기 생성 완료');
  }

  function handleExportGCode() {
    const gcode = gcodePreview || createGCode();
    if (!gcode) {
      return;
    }

    const blob = new Blob([gcode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${model?.name.replace(/\.[^/.]+$/, '') || 'concrete-print'}.gcode`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus('G-code 생성 완료');
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <header className="app-header">
          <Printer size={24} aria-hidden="true" />
          <div>
            <h1>3DCP Slicer</h1>
            <p>Concrete Slicer v1</p>
          </div>
        </header>

        <label className="file-drop">
          <Upload size={20} aria-hidden="true" />
          <span>모델 업로드</span>
          <small>.obj, .3dm, .step, .stp</small>
          <input
            type="file"
            accept=".obj,.3dm,.step,.stp"
            onChange={handleFileChange}
          />
        </label>

        <section className="panel">
          <h2>
            <Layers size={17} aria-hidden="true" />
            Slice
          </h2>
          <Control
            label="Bead Width"
            value={settings.beadWidthMm}
            min={5}
            max={300}
            step={1}
            unit="mm"
            onChange={(value) => updateSetting('beadWidthMm', value)}
          />
          <Control
            label="Bead Height"
            value={settings.beadHeightMm}
            min={5}
            max={120}
            step={1}
            unit="mm"
            onChange={(value) => updateSetting('beadHeightMm', value)}
          />
          <Control
            label="Layer Preview"
            value={activeLayer}
            min={0}
            max={Math.max(sliceData.layers.length - 1, 0)}
            step={1}
            unit=""
            onChange={setActiveLayer}
          />
          <div className="playback-row">
            <button
              className="icon-action"
              type="button"
              onClick={() => setIsLayerAnimating((value) => !value)}
              aria-label={isLayerAnimating ? '레이어 애니메이션 일시정지' : '레이어 애니메이션 재생'}
            >
              {isLayerAnimating ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
              <span>{isLayerAnimating ? 'Pause' : 'Play'}</span>
            </button>
            <label className="speed-control">
              <span>Speed</span>
              <input
                type="range"
                min="1"
                max="20"
                step="1"
                value={layerAnimationSpeed}
                onChange={(event) => setLayerAnimationSpeed(Number(event.target.value))}
              />
              <output>{layerAnimationSpeed} fps</output>
            </label>
          </div>
          <button className="primary-action" type="button" onClick={handleExportGCode}>
            G-code 다운로드
          </button>
          <button className="secondary-action" type="button" onClick={handlePreviewGCode}>
            G-code 미리보기
          </button>
        </section>

        {gcodePreview && (
          <section className="panel gcode-panel">
            <button
              className="collapse-header"
              type="button"
              aria-expanded={isGcodePreviewOpen}
              onClick={() => setIsGcodePreviewOpen((value) => !value)}
            >
              <span>G-code Preview</span>
              <ChevronDown size={17} aria-hidden="true" />
            </button>
            {isGcodePreviewOpen && (
              <textarea readOnly value={gcodePreview} spellCheck="false" />
            )}
          </section>
        )}

        <section className="panel">
          <h2>
            <Gauge size={17} aria-hidden="true" />
            Printer Profile
          </h2>
          <Control
            label="Print Speed"
            value={settings.printSpeedMmMin}
            min={100}
            max={10000}
            step={100}
            unit="mm/min"
            onChange={(value) => updateSetting('printSpeedMmMin', value)}
          />
          <Control
            label="Travel Speed"
            value={settings.travelSpeedMmMin}
            min={500}
            max={20000}
            step={100}
            unit="mm/min"
            onChange={(value) => updateSetting('travelSpeedMmMin', value)}
          />
          <Control
            label="Flow Multiplier"
            value={settings.flowMultiplier}
            min={0.1}
            max={3}
            step={0.05}
            unit="x"
            onChange={(value) => updateSetting('flowMultiplier', value)}
          />
          <TextControl
            label="Pump On"
            value={settings.pumpOnCommand}
            onChange={(value) => updateSetting('pumpOnCommand', value)}
          />
          <TextControl
            label="Pump Off"
            value={settings.pumpOffCommand}
            onChange={(value) => updateSetting('pumpOffCommand', value)}
          />
        </section>

        <section className="panel">
          <h2>
            <Box size={17} aria-hidden="true" />
            Preview
          </h2>
          <Toggle
            label="Model"
            checked={settings.showModel}
            onChange={(value) => updateSetting('showModel', value)}
          />
          <Toggle
            label="Slice Lines"
            checked={settings.showSlices}
            onChange={(value) => updateSetting('showSlices', value)}
          />
          <Toggle
            label="Beads"
            checked={settings.showBeads}
            onChange={(value) => updateSetting('showBeads', value)}
          />
          <Toggle
            label="All Beads"
            checked={settings.showAllBeads}
            onChange={(value) => updateSetting('showAllBeads', value)}
          />
        </section>

        <section className="stats">
          <p>{status}</p>
          <dl>
            <div>
              <dt>Layers</dt>
              <dd>{sliceData.layers.length}</dd>
            </div>
            <div>
              <dt>Segments</dt>
              <dd>{selectedLayer?.segments.length ?? 0}</dd>
            </div>
            <div>
              <dt>Path Length</dt>
              <dd>{sliceData.totalLength.toFixed(2)} m</dd>
            </div>
            <div>
              <dt>Material</dt>
              <dd>{estimate.volumeLiters.toFixed(1)} L</dd>
            </div>
            <div>
              <dt>Print Time</dt>
              <dd>{formatMinutes(estimate.printMinutes)}</dd>
            </div>
          </dl>
        </section>
      </aside>

      <section className="viewport">
        <Canvas shadows dpr={[1, 2]}>
          <color attach="background" args={['#edf1f5']} />
          <PerspectiveCamera makeDefault position={[7, -9, 6]} up={[0, 0, 1]} fov={42} />
          <ambientLight intensity={0.7} />
          <directionalLight castShadow position={[7, 10, 6]} intensity={1.8} />
          <Bounds fit clip observe margin={1.25}>
            <SceneView
              model={model}
              bounds={bounds}
              layer={selectedLayer}
              layers={sliceData.layers}
              settings={toMachineSettings(settings)}
            />
            <FitCameraToModel modelKey={model?.name} />
          </Bounds>
          <ZUpScene />
          <Grid
            position={[0, 0, bounds ? bounds.box.min.z - bounds.center.z - 0.01 : 0]}
            rotation={[Math.PI / 2, 0, 0]}
            args={[20, 20]}
            cellColor="#c5ccd6"
            sectionColor="#7f8a99"
            fadeDistance={22}
            fadeStrength={1}
          />
          <OrbitControls makeDefault enableDamping />
          <GizmoHelper alignment="bottom-left" margin={[72, 72]}>
            <GizmoViewport axisColors={['#dc2626', '#16a34a', '#2563eb']} labelColor="#111827" />
          </GizmoHelper>
        </Canvas>
      </section>
    </main>
  );
}

function ZUpScene() {
  const { camera, scene } = useThree();

  useEffect(() => {
    scene.up.set(0, 0, 1);
    camera.up.set(0, 0, 1);
    camera.updateProjectionMatrix();
  }, [camera, scene]);

  return null;
}

function FitCameraToModel({ modelKey }) {
  const bounds = useBounds();

  useEffect(() => {
    if (modelKey) {
      bounds.refresh().fit();
    }
  }, [bounds, modelKey]);

  return null;
}

function toMachineSettings(settings) {
  return {
    ...settings,
    beadWidth: settings.beadWidthMm / 1000,
    beadHeight: settings.beadHeightMm / 1000,
  };
}

function formatMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '0 min';
  }

  if (minutes < 60) {
    return `${minutes.toFixed(1)} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return `${hours}h ${remainingMinutes}m`;
}

function Control({ label, value, min, max, step, unit, onChange }) {
  return (
    <label className="control">
      <span>
        {label}
        <output>{Number(value).toFixed(step >= 1 ? 0 : 2)} {unit}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function TextControl({ label, value, onChange }) {
  return (
    <label className="text-control">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
