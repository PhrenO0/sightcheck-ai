import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MODEL, getSeats, validateModel, analyzeSightline, getObstacles } from '../src/model.js';
import { parseCandidates } from '../src/ocr.js';

test('the front balcony railing blocks lower stage samples; rear row clears it', () => {
  const seats = getSeats(DEFAULT_MODEL);
  const front = analyzeSightline(DEFAULT_MODEL,seats[12]);
  const rear = analyzeSightline(DEFAULT_MODEL,seats[17]);
  assert.ok(front.visible < 100);
  assert.ok(front.lowerVisible < front.visible);
  assert.ok(rear.visible > front.visible);
  assert.equal(rear.visible,100);
  assert.equal(front.samples.length,325);
  assert.deepEqual(Object.keys(front.causes),['2층 전면 난간']);
});
test('camera tower changes sightline for the same ground-floor seat', () => {
  const seat = getSeats(DEFAULT_MODEL)[1];
  const a = analyzeSightline(DEFAULT_MODEL,seat,'theatre');
  const b = analyzeSightline(DEFAULT_MODEL,seat,'concert');
  assert.equal(a.visible,100); assert.ok(b.visible < a.visible);
  assert.ok(b.causes['촬영 카메라 타워'] > 0);
});
test('lowering railing and raising eye height improves visibility', () => {
  const seat = getSeats(DEFAULT_MODEL)[12];
  const base = analyzeSightline(DEFAULT_MODEL,seat);
  assert.ok(analyzeSightline({...DEFAULT_MODEL,railHeight:0.4},seat).visible > base.visible);
  assert.ok(analyzeSightline(DEFAULT_MODEL,seat,'theatre',1.45).visible > base.visible);
  assert.equal(getObstacles(DEFAULT_MODEL,'theatre').length,1);
});
test('invalid dimensions, duplicate labels and executable URLs are rejected', () => {
  assert.deepEqual(validateModel(DEFAULT_MODEL), DEFAULT_MODEL);
  for (const input of [{...DEFAULT_MODEL,railHeight:NaN}, {...DEFAULT_MODEL,seatSpacing:999}, {...DEFAULT_MODEL,ticketUrl:'javascript:alert(1)'}, {...DEFAULT_MODEL,labels:Array(20).fill('A1')}]) assert.throws(() => validateModel(input));
  assert.equal(validateModel({...DEFAULT_MODEL,ticketUrl:'https://example.com/tickets'}).ticketUrl,'https://example.com/tickets');
});
test('OCR candidates retain row-major order and ignore unrelated text and duplicates', () => {
  const words = [{text:'B2',bbox:{x0:60,y0:80,x1:90,y1:100}}, {text:'A2',bbox:{x0:60,y0:10,x1:90,y1:30}}, {text:'A1',bbox:{x0:10,y0:12,x1:40,y1:32}}, {text:'STAGE',bbox:{x0:1,y0:0,x1:80,y1:20}}, {text:'A1',bbox:{x0:10,y0:12,x1:40,y1:32}}];
  assert.deepEqual(parseCandidates({blocks:[{paragraphs:[{lines:[{words}]}]}]}).map(x=>x.label), ['A1','A2','B2']);
});
