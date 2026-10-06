import { DEFAULT_MODEL, validateModel, getSeats, eyePosition, analyzeSightline } from './model.js';

export class InputError extends Error { constructor(message, field = '') { super(message); this.field = field; } }
const fail = (message, field) => { throw new InputError(message, field); };
function number(value, min, max, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    fail(`${field}: ${min}~${max} 범위의 숫자가 필요합니다.`, field);
  return value;
}
function point(value, image, field) {
  if (!Array.isArray(value) || value.length !== 2) fail(`${field}: [x, y] 픽셀 좌표가 필요합니다.`, field);
  return [number(value[0], 0, image.width, field), number(value[1], 0, image.height, field)];
}

// A similarity transform is appropriate only for a rectified, uniformly scaled plan.
// Perspective photographs and not-to-scale booking diagrams must not enter this path.
export function convertPlan(input) {
  if (!input || input.inputType !== 'rectified_plan') fail('정투영·균일 축척 좌석도가 필요합니다. 사진만으로는 변환할 수 없습니다.', 'inputType');
  if (input.rightsConfirmed !== true) fail('자료 사용 권한을 확인하세요.', 'rightsConfirmed');
  if (input.positionsReviewed !== true || input.measurementsReviewed !== true)
    fail('좌석 중심과 실측 치수를 직접 검토한 뒤 변환하세요.', 'review');
  const image = input.image;
  if (!image) fail('도면의 픽셀 크기가 필요합니다.', 'image');
  number(image.width, 100, 12000, 'image.width'); number(image.height, 100, 12000, 'image.height');
  const calibration = input.calibration || {};
  const left = point(calibration.stageLeft, image, 'calibration.stageLeft');
  const right = point(calibration.stageRight, image, 'calibration.stageRight');
  const width = number(calibration.stageWidthM, 2, 60, 'calibration.stageWidthM');
  const dx = right[0] - left[0], dy = right[1] - left[1], pixels = Math.hypot(dx, dy);
  if (pixels < 20) fail('무대 전면 양 끝은 20픽셀 이상 떨어져야 합니다.', 'calibration');
  if (![1, -1].includes(calibration.audienceSide)) fail('객석 방향은 1 또는 -1로 지정하세요.', 'calibration.audienceSide');
  const ux = dx / pixels, uy = dy / pixels, scale = width / pixels;
  const center = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
  const world = p => {
    const vx = p[0] - center[0], vy = p[1] - center[1];
    return {x: (vx * ux + vy * uy) * scale, z: (-vx * uy + vy * ux) * scale * calibration.audienceSide - 0.25};
  };
  if (!Array.isArray(input.seats) || input.seats.length < 1 || input.seats.length > 300)
    fail('현재 엔진은 1~300개 좌석을 처리합니다.', 'seats');
  const seats = input.seats.map((seat, i) => {
    const p = point([seat.xPx, seat.yPx], image, `seats[${i}]`), location = world(p);
    if (location.z <= 0.75) fail('무대 뒤·무대 위 좌석이 있습니다. 객석 방향과 좌표를 확인하세요.', `seats[${i}]`);
    return {label: seat.label, ...location, floor: number(seat.floorM, 0, 15, `seats[${i}].floorM`),
      row: seat.row, section: seat.section, price: 0};
  });
  const stage = input.stage || {};
  const model = validateModel({...DEFAULT_MODEL, schemaVersion: 2, name: input.name, labels: seats.map(s => s.label), seats,
    ticketUrl: input.ticketUrl || '', stageWidth: width, stageDepth: number(stage.depthM, 1, 20, 'stage.depthM'),
    stageHeight: number(stage.heightM, 0, 3, 'stage.heightM'), targetHeight: number(stage.targetHeightM, 1, 8, 'stage.targetHeightM'),
    stageOffset: 0, obstacles: input.obstacles || [], updatedAt: new Date().toISOString().slice(0, 10),
    provenance: {source: 'calibrated-plan', reviewStatus: 'needs_site_review', metresPerPixel: scale}});
  return {engineVersion: '0.2.0', status: 'needs_site_review', model,
    cameras: getSeats(model).map(s => ({seatLabel: s.label, position: eyePosition(s).toArray(), target: [0, model.stageHeight + 0.08 + model.targetHeight / 2, -0.25], verticalFov: 60, eyeHeightM: 1.2})),
    report: {seatCount: seats.length, metresPerPixel: scale, geometryBytes: new TextEncoder().encode(JSON.stringify(model)).length,
      warnings: ['외관은 공통 스타일 자산입니다. 사진에서 복원한 실제 마감이 아닙니다.', '원근 사진·축척 없는 예매 좌석도는 지원하지 않습니다.',
        '난간·기둥·단차의 누락 여부를 현장에서 확인하세요. 앞사람과 연출 변화는 계산하지 않습니다.', '가림 수치는 무대 전면 표본 비율이며 관람 만족도나 실제 시야 보증값이 아닙니다.']}};
}

export function calculateSeat(input) {
  const model = validateModel(input?.model);
  const seat = getSeats(model).find(s => s.label === input.seatLabel);
  if (!seat) fail('모델에 없는 좌석입니다.', 'seatLabel');
  if (!['theatre', 'concert'].includes(input.layout || 'theatre')) fail('지원하지 않는 공연 배치입니다.', 'layout');
  const eyeHeight = number(input.eyeHeightM ?? 1.2, 0.9, 1.45, 'eyeHeightM');
    if (input.targetId && (model.schemaVersion !== 3 || !model.targets.some(t => t.id === input.targetId))) fail('모델에 없는 관람 대상입니다.', 'targetId');
    const result = analyzeSightline(model, seat, input.layout || 'theatre', eyeHeight, input.targetId);
  const {samples, ...summary} = result;
  return {seatLabel: seat.label, eyeHeightM: eyeHeight, verticalFov: 60, reviewStatus: 'needs_site_review',
    sampleCount: samples.length, ...summary};
}
