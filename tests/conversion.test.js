import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { convertPlan, calculateSeat } from '../src/conversion.js';
import { DEFAULT_MODEL, getSeats, analyzeSightline, validateModel } from '../src/model.js';
import { handleApi } from '../server/api.mjs';
const sample = JSON.parse(await readFile(new URL('../public/engine-demo.json',import.meta.url),'utf8'));

test('calibrated plan reproduces measured seat positions and existing obstruction results', () => {
  const result = convertPlan(sample), expected = getSeats(DEFAULT_MODEL), actual = getSeats(result.model);
  actual.forEach((seat,i) => {assert.ok(Math.abs(seat.x-expected[i].x)<1e-9); assert.ok(Math.abs(seat.z-expected[i].z)<1e-9); assert.ok(Math.abs(seat.floor-expected[i].floor)<1e-9);});
  for (const layout of ['theatre','concert']) for (const seat of actual) {
    const a = analyzeSightline(result.model,seat,layout), b = analyzeSightline(DEFAULT_MODEL,expected[seat.id],layout);
    assert.equal(a.visible,b.visible); assert.equal(a.lowerVisible,b.lowerVisible);
  }
  assert.equal(result.cameras.length,20); assert.equal(result.status,'needs_site_review');
});
test('rotating / translating a uniformly scaled plan preserves metric geometry', () => {
  const input = structuredClone(sample), angle=.38;
  const transform = ([x,y]) => [x*Math.cos(angle)-y*Math.sin(angle)+500,x*Math.sin(angle)+y*Math.cos(angle)+100];
  input.image={width:2000,height:2000};
  input.calibration.stageLeft=transform(input.calibration.stageLeft); input.calibration.stageRight=transform(input.calibration.stageRight);
  input.seats.forEach(s => {[s.xPx,s.yPx]=transform([s.xPx,s.yPx]);});
  const result=convertPlan(input);
  getSeats(result.model).forEach((s,i) => {assert.ok(Math.abs(s.x-getSeats(DEFAULT_MODEL)[i].x)<1e-9); assert.ok(Math.abs(s.z-getSeats(DEFAULT_MODEL)[i].z)<1e-9);});
});
test('photo-only, missing heights, duplicate labels and unreviewed data are rejected', () => {
  assert.throws(() => convertPlan({...sample,inputType:'photo'}),/사진/);
  assert.throws(() => convertPlan({...sample,positionsReviewed:false}),/검토/);
  const missing=structuredClone(sample);delete missing.seats[0].floorM; assert.throws(() => convertPlan(missing),/floorM/);
  const duplicate=structuredClone(sample);duplicate.seats[1].label=duplicate.seats[0].label;assert.throws(() => convertPlan(duplicate),/중복/);
  const backwards=structuredClone(sample);backwards.calibration.audienceSide=-1;assert.throws(() => convertPlan(backwards),/방향/);
});
test('arbitrary small layouts work; operator-supplied verified status is not trusted', () => {
  const result=convertPlan({...sample,seats:sample.seats.slice(0,3),obstacles:[]});
  assert.equal(result.model.seats.length,3);
  const loaded=validateModel({...result.model,provenance:{...result.model.provenance,reviewStatus:'verified'}});
  assert.equal(loaded.provenance.reviewStatus,'needs_site_review');
  assert.equal(calculateSeat({model:loaded,seatLabel:'A1'}).visible,100);
  assert.throws(() => calculateSeat({model:loaded,seatLabel:'Z9'}),/없는 좌석/);
});
test('HTTP API converts and calculates; rejects malformed and cross-origin requests', async () => {
  const server=http.createServer((req,res) => {handleApi(req,res).then(handled => {if(!handled){res.writeHead(404);res.end();}});});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  try {
    const options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sample)};
    const converted=await fetch(`${url}/api/v1/convert`,options);assert.equal(converted.status,200);const data=await converted.json();
    const ray=await fetch(`${url}/api/v1/sightline`,{...options,body:JSON.stringify({model:data.model,seatLabel:'C3',layout:'theatre'})});assert.equal((await ray.json()).lowerVisible,20);
    assert.equal((await fetch(`${url}/api/v1/convert`,{...options,body:'{'})).status,400);
    assert.equal((await fetch(`${url}/api/v1/convert`,{...options,headers:{...options.headers,Origin:'https://example.com'}})).status,403);
    assert.equal((await fetch(`${url}/api/v1/convert`,{...options,body:JSON.stringify({...sample,rightsConfirmed:false})})).status,422);
  } finally {await new Promise(resolve => server.close(resolve));}
});
