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
  if (input?.schemaVersion === 3) return validateVenueModel(input);
  if (input?.schemaVersion === 2) return validateCalibratedModel(input);
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
const bounded = (v,min,max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const vector = (value,min,max) => Array.isArray(value) && value.length === 3 && value.every(v => bounded(v,min,max));
function validateVenueModel(input) {
  const base = validateModel({...DEFAULT_MODEL,name:input.name,ticketUrl:input.ticketUrl || '',version:input.version,updatedAt:input.updatedAt});
  if (!['theatre','cinema','stadium'].includes(input.venueType)) throw new Error('공간 유형을 선택하세요.');
  if (!Array.isArray(input.seats) || !input.seats.length || input.seats.length > 5000) throw new Error('공간 모델은 1~5000석까지 저장합니다. 대규모 성능은 별도 확인이 필요합니다.');
  const labels = new Set();
  const seats = input.seats.map(s => {
    if (!s || typeof s.label !== 'string' || !s.label.trim() || s.label.length > 80 || labels.has(s.label.trim())) throw new Error('좌석 이름은 비어 있거나 중복될 수 없습니다.');
    if (!bounded(s.x,-500,500) || !bounded(s.z,-500,500) || !bounded(s.floor,-20,100) || !Number.isInteger(s.row) || s.row < 0 || s.row > 500 || typeof s.section !== 'string' || !s.section.trim() || s.section.length > 80 || !bounded(s.yaw ?? 0,-360,360)) throw new Error('좌석 위치·높이·방향·행·구역을 확인하세요.');
    labels.add(s.label.trim()); return {label:s.label.trim(),x:s.x,z:s.z,floor:s.floor,row:s.row,section:s.section.trim(),yaw:s.yaw ?? 0};
  });
  if (!Array.isArray(input.targets) || !input.targets.length || input.targets.length > 12) throw new Error('관람 대상은 1~12개여야 합니다.');
  const targetIds = new Set();
  const targets = input.targets.map(t => {
    if (!t || typeof t.id !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(t.id) || targetIds.has(t.id) || typeof t.name !== 'string' || !t.name.trim() || t.name.length > 80 || !vector(t.position,-500,500) || !Array.isArray(t.size) || t.size.length !== 2 || !t.size.every(v => bounded(v,.1,200)) || !vector(t.rotation ?? [0,0,0],-360,360)) throw new Error('관람 대상의 이름·위치·크기·회전을 확인하세요.');
    targetIds.add(t.id); return {id:t.id,name:t.name.trim(),position:[...t.position],size:[...t.size],rotation:[...(t.rotation ?? [0,0,0])]};
  });
  if (!targetIds.has(input.activeTargetId)) throw new Error('기본 관람 대상을 확인하세요.');
  if (!Array.isArray(input.obstacles) || input.obstacles.length > 150) throw new Error('구조물은 150개 이하만 가능합니다.');
  const ids = new Set();
  const obstacles = input.obstacles.map(o => {
    if (!o || typeof o.id !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(o.id) || ids.has(o.id) || typeof o.name !== 'string' || !o.name.trim() || o.name.length > 80 || !vector(o.position,-500,500) || !vector(o.size,.02,200) || !vector(o.rotation ?? [0,0,0],-360,360)) throw new Error('구조물의 이름·위치·크기·회전을 확인하세요.');
    ids.add(o.id); return {id:o.id,name:o.name.trim(),position:[...o.position],size:[...o.size],rotation:[...(o.rotation ?? [0,0,0])],layout:'all'};
  });
  return {...base,schemaVersion:3,venueType:input.venueType,seats,labels:[...labels],targets,activeTargetId:input.activeTargetId,obstacles,
    stageWidth:bounded(input.stageWidth,2,200)?input.stageWidth:8.6,stageDepth:bounded(input.stageDepth,1,150)?input.stageDepth:3.6,
    stageHeight:bounded(input.stageHeight,0,3)?input.stageHeight:.6,targetHeight:bounded(input.targetHeight,.1,20)?input.targetHeight:2.4,stageOffset:0,
    provenance:{source:'operator-geometry',reviewStatus:'needs_site_review'}};
}
export function toVenueModel(input = DEFAULT_MODEL) {
  const model = validateModel(input);
  if (model.schemaVersion === 3) return model;
  return validateModel({...model,schemaVersion:3,venueType:'theatre',seats:getSeats(model),obstacles:getObstacles(model,'theatre'),
    targets:[{id:'stage',name:'무대 활동 영역',position:[model.stageOffset || 0,(model.stageHeight ?? .6)+.08+(model.targetHeight ?? 2.4)/2,-.25],size:[model.stageWidth,model.targetHeight ?? 2.4],rotation:[0,0,0]}],activeTargetId:'stage'});
}
function validateCalibratedModel(input) {
  // Reuse the legacy name / URL checks without accepting unchecked nested metadata.
  const base = validateModel({...DEFAULT_MODEL, name:input.name, ticketUrl:input.ticketUrl || '', version:input.version, updatedAt:input.updatedAt});
  const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  if (!finite(input.stageWidth, 2, 60) || !finite(input.stageDepth, 1, 20) || !finite(input.stageHeight, 0, 3) || !finite(input.targetHeight, 1, 8))
    throw new Error('무대 폭·깊이·높이·표본 영역 높이를 확인하세요.');
  if (!Array.isArray(input.seats) || input.seats.length < 1 || input.seats.length > 300) throw new Error('좌석은 1~300개여야 합니다.');
  const labels = new Set();
  const seats = input.seats.map(s => {
    if (!s || typeof s.label !== 'string' || !/^[A-Z]{1,2}[0-9]{1,3}$/.test(s.label) || labels.has(s.label)) throw new Error('좌석 이름은 중복 없는 영문·숫자 조합이어야 합니다.');
    if (!finite(s.x,-60,60) || !finite(s.z,0.75,100) || !finite(s.floor,0,15) || !Number.isInteger(s.row) || s.row < 0 || s.row > 100 || typeof s.section !== 'string' || !s.section.trim() || s.section.length > 20)
      throw new Error('좌석 위치·바닥 높이·행 번호·구역을 확인하세요.');
    labels.add(s.label); return {label:s.label, x:s.x, z:s.z, floor:s.floor, row:s.row, section:s.section.trim(), price:0};
  });
  if (!Array.isArray(input.obstacles) || input.obstacles.length > 50) throw new Error('구조물은 50개 이하만 가능합니다.');
  const ids = new Set();
  const obstacles = input.obstacles.map(o => {
    if (!o || typeof o.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(o.id) || ids.has(o.id) || typeof o.name !== 'string' || !o.name.trim() || o.name.length > 40)
      throw new Error('구조물 ID와 이름을 확인하세요.');
    if (!Array.isArray(o.position) || o.position.length !== 3 || !o.position.every(n => finite(n,-100,100)) || !Array.isArray(o.size) || o.size.length !== 3 || !o.size.every(n => finite(n,0.02,100)))
      throw new Error('구조물 중심 좌표와 크기는 m 단위 숫자 3개여야 합니다.');
    if (!['all','theatre','concert'].includes(o.layout)) throw new Error('구조물의 공연 배치를 지정하세요.');
    ids.add(o.id); return {id:o.id, name:o.name.trim(), position:[...o.position], size:[...o.size], layout:o.layout};
  });
  const metresPerPixel = input.provenance?.metresPerPixel;
  if (!finite(metresPerPixel,0.00001,3)) throw new Error('도면 축척 정보가 필요합니다.');
  return {...base, schemaVersion:2, labels:[...labels], seats, obstacles, stageWidth:input.stageWidth, stageDepth:input.stageDepth,
    stageHeight:input.stageHeight, targetHeight:input.targetHeight, stageOffset:0,
    provenance:{source:'calibrated-plan', reviewStatus:'needs_site_review', metresPerPixel}};
}
export function getSeats(model) {
  if (model.schemaVersion >= 2) return model.seats.map((seat,index) => ({...seat, id:index, col:index}));
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
  if (model.schemaVersion >= 2) return model.obstacles.filter(o => o.layout === 'all' || o.layout === layout);
  const railZ = 5.5 + model.rowSpacing * 1.55;
  const width = model.seatSpacing * 5 + 2;
  const rail = { id: 'rail', name: '2층 전면 난간', position: [0, model.balconyHeight + model.railHeight / 2, railZ], size: [width, model.railHeight, 0.1] };
  const obstacles = [rail];
  // The visual mesh and the raycast use these same dimensions and positions.
  if (layout === 'concert') obstacles.push({ id: 'tower', name: '촬영 카메라 타워', position: [-1.95 + model.stageOffset, 1.9, 1.5], size: [1.05, 2.6, 0.65] });
  return obstacles;
}
export function getTarget(model,targetId) {
  if (model.schemaVersion === 3) return model.targets.find(t => t.id === (targetId || model.activeTargetId)) || model.targets[0];
  return {id:'stage',name:'무대 전면',position:[model.stageOffset || 0,(model.stageHeight ?? .6)+.08+(model.targetHeight ?? 2.4)/2,-.25],size:[model.stageWidth,model.targetHeight ?? 2.4],rotation:[0,0,0]};
}
export function targetQuaternion(target) { return new THREE.Quaternion().setFromEuler(new THREE.Euler(...target.rotation.map(THREE.MathUtils.degToRad))); }
export function getTargets(model, columns = 25, rows = 13, targetId) {
  const points = [];
  if (model.schemaVersion === 3) {
    const target = getTarget(model,targetId), q = targetQuaternion(target), center = new THREE.Vector3(...target.position);
    for (let y=0;y<rows;y++) for (let x=0;x<columns;x++) {
      const p = new THREE.Vector3((x/(columns-1)-.5)*target.size[0],(y/(rows-1)-.5)*target.size[1],0).applyQuaternion(q).add(center);
      points.push({x:p.x,y:p.y,z:p.z,region:y<Math.ceil(rows/3)?'lower':'upper',column:x,row:y});
    }
    return points;
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    points.push({ x: (x / (columns - 1) - 0.5) * model.stageWidth + model.stageOffset,
      y: (model.stageHeight ?? 0.6) + 0.08 + y / (rows - 1) * (model.targetHeight ?? 2.4), z: -0.25,
      region: y < Math.ceil(rows / 3) ? 'lower' : 'upper', column: x, row: y });
  }
  return points;
}
export function analyzeSightline(model, seat, layout = 'theatre', eyeHeight = 1.2, targetId) {
  const origin = eyePosition(seat, eyeHeight);
  const obstacles = getObstacles(model, layout).map(item => ({...item,
    box: new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(...item.size)),
    matrix: new THREE.Matrix4().compose(new THREE.Vector3(...item.position),targetQuaternion({rotation:item.rotation ?? [0,0,0]}),new THREE.Vector3(1,1,1))}));
  obstacles.forEach(o => {o.inverse=o.matrix.clone().invert();});
  const targets = getTargets(model,25,13,targetId);
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
      if (ray.clone().applyMatrix4(obstacle.inverse).intersectBox(obstacle.box, hit)) {
        hit.applyMatrix4(obstacle.matrix);
        const d = hit.distanceTo(origin);
        if (d < nearestDistance - 0.001) { nearestDistance = d; nearest = obstacle; }
      }
    }
    if (nearest) causes[nearest.name] = (causes[nearest.name] || 0) + 1;
    return {...point, blocked: !!nearest, cause: nearest?.name};
  });
  const blocked = samples.filter(x => x.blocked).length;
  const lower = samples.filter(x => x.region === 'lower');
  const target = getTarget(model,targetId), targetCenter = new THREE.Vector3(...target.position);
  const heading = new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(seat.yaw || 0));
  const towards = targetCenter.clone().sub(origin);towards.y=0;
  return {
    targetId:getTarget(model,targetId).id,targetName:getTarget(model,targetId).name,
    visible: Math.round((1 - blocked / samples.length) * 100),
    lowerVisible: Math.round((1 - lower.filter(x => x.blocked).length / lower.length) * 100),
    distance: (model.schemaVersion===3?origin.distanceTo(targetCenter):Math.hypot(seat.x-model.stageOffset,seat.z+.25)).toFixed(1),
    angle: model.schemaVersion===3?Math.round(THREE.MathUtils.radToDeg(heading.angleTo(towards))):Math.round(Math.atan2(Math.abs(seat.x-model.stageOffset),seat.z+.25)*180/Math.PI),
    samples, causes,
  };
}
export function describeSightline(analysis) {
  if (analysis.visible === 100) return '입력된 고정 구조물에 가리는 표본이 없습니다.';
  const causes = Object.keys(analysis.causes).join(' · ');
  return `${causes}에 무대 ${analysis.lowerVisible < analysis.visible ? '하단을 포함한 일부' : '일부'}가 가립니다.`;
}
