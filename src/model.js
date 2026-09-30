import * as THREE from 'three';

export const DEFAULT_MODEL = {
  schemaVersion: 1,
  name: '오름 아트홀',
  version: 1,
  updatedAt: '2026-09-30',
  seatSpacing: 1.35,
  rowSpacing: 1.65,
  rowRise: 0.65,
  balconyHeight: 2.4,
  railHeight: 1.0,
  stageWidth: 8.6,
  stageDepth: 3.6,
  stageOffset: 0,
  ticketUrl: '',
  labels: Array.from({ length: 20 }, (_, i) => `${'ABCD'[Math.floor(i / 5)]}${i % 5 + 1}`),
};
export const LIMITS = {
  seatSpacing: [0.6, 2], rowSpacing: [1.2, 2.5], rowRise: [0.1, 1],
  balconyHeight: [1.5, 4], railHeight: [0.4, 1.5], stageWidth: [4, 12],
  stageDepth: [2, 5], stageOffset: [-2, 2],
};
export const LAYOUTS = {
  theatre: { name: '뮤지컬 · 기본 무대', short: '기본 무대', version: 1 },
  concert: { name: '라이브 · 카메라 타워', short: '라이브 무대', version: 2 },
};
export function validateModel(input) {
  if (!input || input.schemaVersion !== 1) throw new Error('지원하는 모델 형식(schemaVersion: 1)이 아닙니다.');
  const model = structuredClone(DEFAULT_MODEL);
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] < min || input[key] > max)
      throw new Error(`${key} 값은 ${min}~${max} 범위의 숫자여야 합니다.`);
    model[key] = input[key];
  }
  if (!Array.isArray(input.labels) || input.labels.length !== 20 ||
      input.labels.some(x => typeof x !== 'string' || !/^[A-Z]{1,2}[0-9]{1,3}$/.test(x)) ||
      new Set(input.labels).size !== 20) throw new Error('좌석 이름은 중복 없는 영문·숫자 조합 20개여야 합니다.');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 40) throw new Error('공연장 이름을 1~40자로 입력하세요.');
  if (typeof input.ticketUrl !== 'string' || input.ticketUrl.length > 1000) throw new Error('예매 주소를 확인하세요.');
  if (input.ticketUrl) {
    let url; try { url = new URL(input.ticketUrl); } catch { throw new Error('올바른 예매 주소를 입력하세요.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('예매 주소에는 HTTP(S)만 사용할 수 있습니다.');
  }
  model.name = input.name.trim();
  model.labels = [...input.labels];
  model.ticketUrl = input.ticketUrl;
  model.version = Number.isSafeInteger(input.version) && input.version > 0 ? input.version : 1;
  model.updatedAt = typeof input.updatedAt === 'string' ? input.updatedAt.slice(0, 30) : '';
  return model;
}
export function getSeats(model) {
  return model.labels.map((label, index) => {
    const row = Math.floor(index / 5), col = index % 5;
    return {
      id: index, label, row, col, section: row < 2 ? '1층' : '2층',
      x: (col - 2) * model.seatSpacing, z: 5.5 + row * model.rowSpacing,
      floor: row < 2 ? row * 0.24 : model.balconyHeight + (row - 2) * model.rowRise,
      price: row < 2 ? 90000 : 70000,
    };
  });
}
export function eyePosition(seat, eyeHeight = 1.2) { return new THREE.Vector3(seat.x, seat.floor + eyeHeight, seat.z); }
export function getObstacles(model, layout) {
  const railZ = 5.5 + model.rowSpacing * 1.55;
  const width = model.seatSpacing * 5 + 2;
  const rail = { id: 'rail', name: '2층 전면 난간', position: [0, model.balconyHeight + model.railHeight / 2, railZ], size: [width, model.railHeight, 0.1] };
  const obstacles = [rail];
  // The visual mesh and the raycast use these same dimensions and positions.
  if (layout === 'concert') obstacles.push({ id: 'tower', name: '촬영 카메라 타워', position: [-1.95 + model.stageOffset, 1.9, 1.5], size: [1.05, 2.6, 0.65] });
  return obstacles;
}
export function getTargets(model, columns = 25, rows = 13) {
  const points = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    points.push({ x: (x / (columns - 1) - 0.5) * model.stageWidth + model.stageOffset,
      y: 0.68 + y / (rows - 1) * 2.4, z: -0.25,
      region: y < Math.ceil(rows / 3) ? 'lower' : 'upper', column: x, row: y });
  }
  return points;
}
export function analyzeSightline(model, seat, layout = 'theatre', eyeHeight = 1.2) {
  const origin = eyePosition(seat, eyeHeight);
  const obstacles = getObstacles(model, layout).map(item => ({...item,
    box: new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...item.position), new THREE.Vector3(...item.size))}));
  const targets = getTargets(model);
  const ray = new THREE.Ray();
  const hit = new THREE.Vector3();
  const causes = {};
  const samples = targets.map(point => {
    const destination = new THREE.Vector3(point.x, point.y, point.z);
    const direction = destination.clone().sub(origin);
    const distance = direction.length();
    ray.set(origin, direction.normalize());
    let nearest = null, nearestDistance = distance;
    for (const obstacle of obstacles) {
      if (ray.intersectBox(obstacle.box, hit)) {
        const d = hit.distanceTo(origin);
        if (d < nearestDistance - 0.001) { nearestDistance = d; nearest = obstacle; }
      }
    }
    if (nearest) causes[nearest.name] = (causes[nearest.name] || 0) + 1;
    return {...point, blocked: !!nearest, cause: nearest?.name};
  });
  const blocked = samples.filter(x => x.blocked).length;
  const lower = samples.filter(x => x.region === 'lower');
  return {
    visible: Math.round((1 - blocked / samples.length) * 100),
    lowerVisible: Math.round((1 - lower.filter(x => x.blocked).length / lower.length) * 100),
    distance: Math.hypot(seat.x - model.stageOffset, seat.z + 0.25).toFixed(1),
    angle: Math.round(Math.atan2(Math.abs(seat.x - model.stageOffset), seat.z + 0.25) * 180 / Math.PI),
    samples, causes,
  };
}
export function describeSightline(analysis) {
  if (analysis.visible === 100) return '입력된 고정 구조물에 가리는 표본이 없습니다.';
  const causes = Object.keys(analysis.causes).join(' · ');
  return `${causes}에 무대 ${analysis.lowerVisible < analysis.visible ? '하단을 포함한 일부' : '일부'}가 가립니다.`;
}
