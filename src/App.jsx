import { useEffect, useMemo, useRef, useState } from 'react';
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
  Shield,
  Upload,
} from 'lucide-react';
import SceneView from './components/SceneView.jsx';
import { getProjectId, loadSnapshot, saveSnapshot } from './utils/autosave.js';
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

const REINFORCEMENT_TYPES = [
  { value: 'mesh', label: '수평 메시' },
  { value: 'rebar', label: '철근 매트' },
  { value: 'dowel', label: '수직 다월' },
  { value: 'other', label: '기타' },
];

function reinforcementTypeLabel(value) {
  return REINFORCEMENT_TYPES.find((type) => type.value === value)?.label ?? value;
}

// Module-level (not an inline JSX literal) purely so it's not recreated every render.
const cameraUpVector = [0, 0, 1];

// Guards against ever saving or restoring a broken camera snapshot -- e.g. one
// captured mid-glitch during the Canvas/OrbitControls settling window (position and
// target collapsed to the same point, or a NaN/Infinity from a divide-by-zero in that
// state). Restoring a snapshot like this reproduces the exact "camera won't move"
// symptom on every future visit, since OrbitControls' spherical math breaks down once
// its radius is zero and never recovers on its own.
function isValidCameraSnapshot(camera) {
  if (!camera || !Array.isArray(camera.position) || !Array.isArray(camera.target)) {
    return false;
  }
  const values = [...camera.position, ...camera.target];
  if (values.length !== 6 || values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    return false;
  }
  const [px, py, pz] = camera.position;
  const [tx, ty, tz] = camera.target;
  return Math.hypot(px - tx, py - ty, pz - tz) > 1e-4;
}

export default function App() {
  const [model, setModel] = useState(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [activeLayer, setActiveLayer] = useState(0);
  const [status, setStatus] = useState('OBJ, 3DM, STEP 파일을 업로드하세요.');
  const [gcodePreview, setGcodePreview] = useState('');
  const [isGcodePreviewOpen, setIsGcodePreviewOpen] = useState(false);
  const [isLayerAnimating, setIsLayerAnimating] = useState(false);
  const [layerAnimationSpeed, setLayerAnimationSpeed] = useState(6);
  const [reinforcementPlan, setReinforcementPlan] = useState([]);
  const [reinforcementDraft, setReinforcementDraft] = useState({ type: 'mesh', note: '' });
  const [restoredCamera, setRestoredCamera] = useState(null);
  const fileRef = useRef(null);
  const cameraStateRef = useRef(null);
  const controlsRef = useRef(null);
  const projectIdRef = useRef(getProjectId());

  // Restore the last autosaved model/settings for this project (if any) on mount --
  // this is what lets a browser refresh (which wipes all in-memory iframe state) get
  // the user's work back instead of losing it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Give the Canvas/OrbitControls default-camera registration time to fully
        // settle before touching the model or camera at all. Setting either too soon
        // after the Canvas first mounts gets silently overwritten a moment later, and
        // can even leave OrbitControls unresponsive to further drag/orbit input
        // afterward -- a fresh upload never hits this, since the user has already
        // spent a couple of seconds picking a file by the time it happens.
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        if (cancelled) {
          return;
        }

        const snapshot = await loadSnapshot(projectIdRef.current);
        if (!snapshot || cancelled) {
          return;
        }

        setStatus(`${snapshot.file.name} 복원 중...`);
        const loaded = await loadModelFile(snapshot.file);
        if (cancelled) {
          return;
        }

        fileRef.current = snapshot.file;
        setModel(loaded);
        if (snapshot.settings) {
          setSettings(snapshot.settings);
        }
        if (snapshot.reinforcementPlan) {
          setReinforcementPlan(snapshot.reinforcementPlan);
        }
        if (isValidCameraSnapshot(snapshot.camera)) {
          cameraStateRef.current = snapshot.camera;
          setRestoredCamera(snapshot.camera);
        }
        setStatus(`${snapshot.file.name} 복원 완료 (자동 저장된 이전 작업)`);
      } catch {
        // No autosave yet, or the browser blocked IndexedDB (e.g. private browsing);
        // fall back to the default empty state.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave -- keyed by project id, so two projects using this tool never
  // overwrite each other's saved work (see autosave.js).
  useEffect(() => {
    if (!fileRef.current) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      saveSnapshot(projectIdRef.current, {
        file: fileRef.current,
        settings,
        reinforcementPlan,
        camera: cameraStateRef.current,
      }).catch(() => {
        // Best-effort autosave; ignore storage errors (quota, private browsing, etc).
      });
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [model, settings, reinforcementPlan]);

  // A page refresh can land well inside the 800ms debounce window above, discarding
  // whatever change triggered it -- unlike the camera (saved immediately on drag-end),
  // settings/reinforcement changes had no such safety net. Flush immediately whenever
  // the tab is about to go away, so "change a slider, then refresh right away" doesn't
  // lose the change.
  useEffect(() => {
    function flushPendingSave() {
      if (!fileRef.current) {
        return;
      }
      saveSnapshot(projectIdRef.current, {
        file: fileRef.current,
        settings,
        reinforcementPlan,
        camera: cameraStateRef.current,
      }).catch(() => {
        // Best-effort; nothing more we can do if this fails during unload.
      });
    }

    window.addEventListener('pagehide', flushPendingSave);
    window.addEventListener('beforeunload', flushPendingSave);
    return () => {
      window.removeEventListener('pagehide', flushPendingSave);
      window.removeEventListener('beforeunload', flushPendingSave);
    };
  }, [settings, reinforcementPlan]);

  // OrbitControls fires onEnd once when the user releases a drag/zoom/pan -- a natural
  // debounce point to persist the camera view without saving on every animation frame.
  function handleCameraChangeEnd() {
    const controls = controlsRef.current;
    if (!controls || !fileRef.current) {
      return;
    }

    const candidate = {
      position: controls.object.position.toArray(),
      target: controls.target.toArray(),
    };
    if (!isValidCameraSnapshot(candidate)) {
      return;
    }
    cameraStateRef.current = candidate;
    saveSnapshot(projectIdRef.current, {
      file: fileRef.current,
      settings,
      reinforcementPlan,
      camera: cameraStateRef.current,
    }).catch(() => {
      // Best-effort autosave; ignore storage errors (quota, private browsing, etc).
    });
  }

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
      return { layers: [], totalLength: 0, requestedLayers: 0, clipped: false };
    }

    const machineSettings = toMachineSettings(settings);
    return sliceModel(model.object, {
      layerHeight: machineSettings.beadHeight,
      beadWidth: machineSettings.beadWidth,
      maxLayers: 220,
    });
  }, [model, bounds, settings.beadHeightMm, settings.beadWidthMm]);

  const selectedLayer = sliceData.layers[Math.min(activeLayer, Math.max(sliceData.layers.length - 1, 0))];
  const activeReinforcements = useMemo(
    () => reinforcementPlan.filter((entry) => entry.layer === activeLayer),
    [reinforcementPlan, activeLayer],
  );
  // Pump on/off must be paired — if only one is set, the pump can be switched on for a
  // path and never explicitly told to stop (or vice versa), leaving it running through
  // travel moves and after the print ends.
  const pumpMismatch = Boolean(settings.pumpOnCommand.trim()) !== Boolean(settings.pumpOffCommand.trim());
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
      fileRef.current = file;
      setModel(loaded);
      setActiveLayer(0);
      setGcodePreview('');
      setReinforcementPlan([]);
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

    if (pumpMismatch) {
      setStatus('Pump On/Off 명령을 둘 다 입력하거나 둘 다 비워두세요.');
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

  function addReinforcementEntry() {
    if (sliceData.layers.length === 0) {
      return;
    }

    const entry = {
      id: crypto.randomUUID(),
      layer: activeLayer,
      type: reinforcementDraft.type,
      note: reinforcementDraft.note.trim(),
    };
    setReinforcementPlan((current) => [...current, entry].sort((a, b) => a.layer - b.layer));
    setReinforcementDraft({ type: reinforcementDraft.type, note: '' });
  }

  function removeReinforcementEntry(id) {
    setReinforcementPlan((current) => current.filter((entry) => entry.id !== id));
  }

  function handleExportReinforcementPlan() {
    if (reinforcementPlan.length === 0) {
      return;
    }

    const lines = [
      `${model?.name ?? '이름 없는 모델'} — 보강재 삽입 계획`,
      '이 목록은 G-code에 반영되지 않습니다. 표시된 레이어에서 프린터를 수동으로 일시정지하고 삽입하세요.',
      '',
      ...reinforcementPlan.map(
        (entry) => `레이어 ${entry.layer} · ${reinforcementTypeLabel(entry.type)}${entry.note ? ` · ${entry.note}` : ''}`,
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${model?.name.replace(/\.[^/.]+$/, '') || 'concrete-print'}-reinforcement-plan.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus('보강재 계획표 내보내기 완료');
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
          {sliceData.clipped && (
            <div className="layer-alert" role="status">
              <Layers size={15} aria-hidden="true" />
              <span>
                모델 상단이 잘렸습니다 — {sliceData.requestedLayers}개 레이어 중 {sliceData.layers.length}개까지만 표시됩니다.
                Bead Height를 높이면 전체를 볼 수 있습니다.
              </span>
            </div>
          )}
          {activeReinforcements.length > 0 && (
            <div className="layer-alert" role="status">
              <Shield size={15} aria-hidden="true" />
              <span>
                이 레이어에 보강재 삽입 예정 —{' '}
                {activeReinforcements
                  .map((entry) => `${reinforcementTypeLabel(entry.type)}${entry.note ? ` (${entry.note})` : ''}`)
                  .join(', ')}
              </span>
            </div>
          )}
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
          <button className="primary-action" type="button" onClick={handleExportGCode} disabled={pumpMismatch}>
            G-code 다운로드
          </button>
          <button className="secondary-action" type="button" onClick={handlePreviewGCode} disabled={pumpMismatch}>
            G-code 미리보기
          </button>
        </section>

        <section className="panel reinforcement-panel">
          <h2>
            <Shield size={17} aria-hidden="true" />
            보강재 계획
          </h2>
          <p className="panel-hint">
            G-code는 자동으로 바뀌지 않습니다 — 표시된 레이어에서 프린터를 수동으로 일시정지하고 삽입하세요.
          </p>
          <label className="select-control">
            <span>종류</span>
            <select
              value={reinforcementDraft.type}
              onChange={(event) => setReinforcementDraft((current) => ({ ...current, type: event.target.value }))}
            >
              {REINFORCEMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </label>
          <TextControl
            label="메모"
            value={reinforcementDraft.note}
            onChange={(value) => setReinforcementDraft((current) => ({ ...current, note: value }))}
          />
          <button
            className="secondary-action"
            type="button"
            onClick={addReinforcementEntry}
            disabled={sliceData.layers.length === 0}
          >
            현재 레이어({activeLayer})에 계획 추가
          </button>

          {reinforcementPlan.length > 0 && (
            <>
              <ul className="reinforcement-list">
                {reinforcementPlan.map((entry) => (
                  <li key={entry.id} className={entry.layer === activeLayer ? 'is-current' : ''}>
                    <button
                      type="button"
                      className="reinforcement-jump"
                      onClick={() => setActiveLayer(entry.layer)}
                    >
                      레이어 {entry.layer}
                    </button>
                    <span className="reinforcement-note">
                      {reinforcementTypeLabel(entry.type)}
                      {entry.note ? ` · ${entry.note}` : ''}
                    </span>
                    <button
                      type="button"
                      className="reinforcement-remove"
                      onClick={() => removeReinforcementEntry(entry.id)}
                      aria-label="계획 삭제"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <button className="secondary-action" type="button" onClick={handleExportReinforcementPlan}>
                계획표 내보내기 (.txt)
              </button>
            </>
          )}
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
          {pumpMismatch && (
            <div className="layer-alert" role="status">
              <Gauge size={15} aria-hidden="true" />
              <span>
                Pump On/Off는 둘 다 입력하거나 둘 다 비워두세요 — 하나만 설정하면 펌프가 이동 구간에서도 계속
                구동될 수 있어 G-code 생성이 비활성화됩니다.
              </span>
            </div>
          )}
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
        <Canvas shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }}>
          <color attach="background" args={['#edf1f5']} />
          {/* No `position` prop: react-three-fiber re-applies vector-valued props via
              .set(...) on every reconciliation pass, not just when the value changes --
              with a position prop here, any unrelated re-render (e.g. layer scrubbing,
              a settings tweak) would silently snap the camera back to this default,
              undoing whatever FitCameraToModel/OrbitControls had set. Camera position is
              owned entirely by FitCameraToModel (fit-to-model or restored) instead. */}
          <PerspectiveCamera makeDefault up={cameraUpVector} fov={42} />
          <ambientLight intensity={0.7} />
          <directionalLight castShadow position={[7, 10, 6]} intensity={1.8} />
          {/* `fit` is deliberately omitted: Bounds' own built-in auto-fit runs after
              FitCameraToModel's effect (child effects fire before parent effects) and
              would silently override a restored camera position. FitCameraToModel
              calls bounds.fit() itself for genuinely new uploads. */}
          <Bounds clip observe margin={1.25}>
            <SceneView
              model={model}
              bounds={bounds}
              layer={selectedLayer}
              layers={sliceData.layers}
              settings={toMachineSettings(settings)}
            />
            <FitCameraToModel modelKey={model?.name} restoredCamera={restoredCamera} controlsRef={controlsRef} />
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
          <OrbitControls ref={controlsRef} makeDefault enableDamping onEnd={handleCameraChangeEnd} />
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

function FitCameraToModel({ modelKey, restoredCamera, controlsRef }) {
  const bounds = useBounds();
  const { camera } = useThree();
  // Tracks which modelKey the camera has already been initialized for, so this only
  // runs once per model (a fresh upload should still auto-fit again for a new model).
  const initializedForKeyRef = useRef(null);

  useEffect(() => {
    if (!modelKey || initializedForKeyRef.current === modelKey) {
      return undefined;
    }
    initializedForKeyRef.current = modelKey;

    // A restored autosave should reappear exactly as the user left it, not re-framed
    // to a generic fit -- that's what made the model feel like it "moved" on refresh.
    // A genuinely new upload (no restoredCamera) still gets the normal auto-fit.
    const apply = () => {
      if (restoredCamera) {
        camera.position.set(...restoredCamera.position);
        camera.updateProjectionMatrix();
        const controls = controlsRef.current;
        if (controls) {
          controls.target.set(...restoredCamera.target);
          controls.update();
        }
      } else {
        bounds.refresh().fit();
      }
    };

    // Re-assert for a short window instead of applying once: right after the Canvas
    // first mounts, the default-camera/OrbitControls registration can still be
    // settling, which silently overwrites a same-tick set() a moment later and can
    // even leave OrbitControls unresponsive to further drag/orbit input. This affects
    // bounds.fit() just as much as a manual restore -- a fresh upload never hits it
    // only because the user has already spent a couple of seconds picking a file by
    // the time this effect runs.
    let cancelled = false;
    let frame = 0;
    const reapply = () => {
      if (cancelled) return;
      apply();
      frame += 1;
      if (frame < 20) requestAnimationFrame(reapply);
    };
    reapply();
    return () => {
      cancelled = true;
    };
  }, [bounds, modelKey, restoredCamera, camera, controlsRef]);

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
