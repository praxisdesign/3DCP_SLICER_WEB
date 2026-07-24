import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js';

export async function loadModelFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'obj') {
    return loadObj(file);
  }

  if (extension === '3dm') {
    return load3dm(file);
  }

  if (extension === 'step' || extension === 'stp') {
    return loadStep(file);
  }

  throw new Error('지원하지 않는 파일 형식입니다.');
}

async function loadObj(file) {
  const text = await file.text();
  const loader = new OBJLoader();
  const object = loader.parse(text);
  normalizeMeshes(object);
  return { name: file.name, type: 'obj', object };
}

async function load3dm(file) {
  const buffer = await file.arrayBuffer();
  const loader = new Rhino3dmLoader();
  loader.setLibraryPath(`${import.meta.env.BASE_URL}vendor/rhino3dm/`);
  const object = await loader.parseAsync(buffer);
  normalizeMeshes(object);
  return { name: file.name, type: '3dm', object };
}

async function loadStep(file) {
  const content = new Uint8Array(await file.arrayBuffer());
  const occt = await loadOcct();
  const result = occt.ReadStepFile(content, {
    linearUnit: 'meter',
    linearDeflectionType: 'bounding_box_ratio',
    linearDeflection: 0.001,
    angularDeflection: 0.5,
  });

  if (!result.success) {
    throw new Error('STEP 파일 변환에 실패했습니다.');
  }

  const object = buildObjectFromOcct(result);
  normalizeMeshes(object);
  return { name: file.name, type: 'step', object };
}

async function loadOcct() {
  await loadScript(`${import.meta.env.BASE_URL}vendor/occt/occt-import-js.js`);

  if (!window.occtimportjs) {
    throw new Error('STEP 변환 라이브러리를 불러오지 못했습니다.');
  }

  return window.occtimportjs({
    locateFile: (path) => `${import.meta.env.BASE_URL}vendor/occt/${path}`,
  });
}

function loadScript(src) {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`${src} 로드 실패`));
    document.head.appendChild(script);
  });
}

function buildObjectFromOcct(result) {
  const group = new Group();
  const meshIndices = collectMeshIndices(result.root);

  meshIndices.forEach((meshIndex) => {
    const meshData = result.meshes[meshIndex];
    if (!meshData?.attributes?.position?.array || !meshData?.index?.array) {
      return;
    }

    const geometry = new BufferGeometry();
    const positions = flattenArray(meshData.attributes.position.array);
    const normals = meshData.attributes.normal?.array
      ? flattenArray(meshData.attributes.normal.array)
      : null;
    const indices = flattenArray(meshData.index.array);

    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(positions), 3),
    );

    if (normals) {
      geometry.setAttribute(
        'normal',
        new BufferAttribute(new Float32Array(normals), 3),
      );
    } else {
      geometry.computeVertexNormals();
    }

    geometry.setIndex(indices);
    geometry.computeBoundingBox();

    const color = meshData.color ?? [0.45, 0.5, 0.58];
    const material = new MeshStandardMaterial({
      color: new Color(color[0], color[1], color[2]),
      roughness: 0.62,
      metalness: 0.03,
    });

    group.add(new Mesh(geometry, material));
  });

  return group;
}

function flattenArray(value) {
  return Array.isArray(value?.[0]) ? value.flat() : Array.from(value);
}

function collectMeshIndices(node, indices = []) {
  node?.meshes?.forEach((meshIndex) => indices.push(meshIndex));
  node?.children?.forEach((child) => collectMeshIndices(child, indices));
  return indices;
}

function normalizeMeshes(object) {
  object.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.geometry = child.geometry.toNonIndexed();
    child.geometry.computeVertexNormals();
    child.material = new MeshStandardMaterial({
      color: '#7b8794',
      roughness: 0.58,
      metalness: 0.02,
    });
  });
}
