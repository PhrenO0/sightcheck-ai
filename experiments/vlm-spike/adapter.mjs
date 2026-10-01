// Sample-specific glue for the axis-aligned base plan, not a general VLM parser.
// Only the explicit allowlist below crosses from VLM output into engine input.
export function adaptBase(vlm, fixture, image) {
  if (image.width !== fixture.image.width || image.height !== fixture.image.height)
    throw new Error('Base image and measurement fixture dimensions differ');
  if (!Array.isArray(vlm.seats) || vlm.seats.length !== 20)
    throw new Error('This spike requires the 20 base-plan seats');
  const region = vlm.stage?.region_px;
  if (!region || !['x_min', 'y_min', 'x_max', 'y_max'].every(k => Number.isFinite(region[k])) ||
      region.x_min < 0 || region.y_min < 0 || region.x_max > image.width || region.y_max > image.height ||
      region.x_min >= region.x_max || region.y_min >= region.y_max)
    throw new Error('Expected base stage region_px');
  if (fixture.calibration.audienceSide !== 1)
    throw new Error('This base-plan adapter only supports audience below the stage');
  const measured = new Map(fixture.seats.map(s => [s.label, s]));
  const labels = new Set();
  const seats = vlm.seats.map(s => {
    const human = measured.get(s.seat_number);
    if (!human || labels.has(s.seat_number)) throw new Error('Missing measurement or duplicate VLM seat');
    labels.add(s.seat_number);
    if (!/^[A-D]$/.test(s.row) || !s.seat_number.startsWith(s.row)) throw new Error('Unsupported base row');
    if (!Number.isFinite(s.center_px?.x) || !Number.isFinite(s.center_px?.y)) throw new Error('Missing VLM center_px');
    return {label: s.seat_number, xPx: s.center_px.x, yPx: s.center_px.y,
      row: s.row.charCodeAt(0) - 'A'.charCodeAt(0), floorM: human.floorM, section: human.section};
  });
  return {
    inputType: fixture.inputType, name: fixture.name, image: {...image},
    calibration: {stageLeft: [region.x_min, region.y_max], stageRight: [region.x_max, region.y_max],
      stageWidthM: fixture.calibration.stageWidthM, audienceSide: fixture.calibration.audienceSide},
    stage: {depthM: fixture.stage.depthM, heightM: fixture.stage.heightM, targetHeightM: fixture.stage.targetHeightM},
    seats, obstacles: structuredClone(fixture.obstacles),
    // These are supplied fixture attestations for this synthetic experiment only.
    // They do not establish VLM correctness or site review for arbitrary inputs.
    rightsConfirmed: fixture.rightsConfirmed, positionsReviewed: fixture.positionsReviewed,
    measurementsReviewed: fixture.measurementsReviewed,
  };
}
