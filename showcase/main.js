import './style.css';
import './motion.css';
import 'lenis/dist/lenis.css';
import { animate, inView, stagger } from 'motion';
import Lenis from 'lenis';
import { DEFAULT_MODEL, getSeats, analyzeSightline, describeSightline } from '../src/model.js';
import { VenueViewer } from '../src/scene.js';

const $ = selector => document.querySelector(selector);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let smoothScroll;
if (!reducedMotion.matches) {
  smoothScroll = new Lenis({autoRaf:true,anchors:true,lerp:0.09,allowNestedScroll:true});
  animate('.title-line',{opacity:[0,1],y:[38,0],filter:['blur(7px)','blur(0px)']},{duration:0.85,delay:stagger(0.14),ease:[0.2,0.8,0.2,1]});
  animate('.hero-copy > p, .hero-copy > .button, .hero-note',{opacity:[0,1],y:[15,0]},{duration:0.7,delay:stagger(0.1,{startDelay:0.25})});
  inView('.story-section h2, .section-heading, .workflow-heading, .closing', element => {animate(element,{opacity:[0,1],y:[24,0]},{duration:0.7,ease:[0.2,0.8,0.2,1]});},{amount:0.15});
  inView('.value-grid, .workflow-grid', element => {animate(element.children,{opacity:[0,1],y:[24,0]},{duration:0.65,delay:stagger(0.09)});},{amount:0.1});
}
function updateProgress() { const distance=document.documentElement.scrollHeight-innerHeight;$('.reading-progress').style.transform=`scaleX(${distance > 0 ? scrollY/distance : 0})`; }
window.addEventListener('scroll',updateProgress,{passive:true});
window.addEventListener('resize',updateProgress,{passive:true});
function updateViewport() {document.documentElement.style.setProperty('--view-width',`${document.documentElement.clientWidth}px`);}
window.addEventListener('resize',updateViewport,{passive:true});
updateViewport();
updateProgress();
if (matchMedia('(pointer:fine)').matches && !reducedMotion.matches) $('.hero').addEventListener('pointermove',event=>{
  const bounds=event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--light-x',`${(event.clientX-bounds.left)/bounds.width*100}%`);
  event.currentTarget.style.setProperty('--light-y',`${(event.clientY-bounds.top)/bounds.height*100}%`);
});
reducedMotion.addEventListener('change',event=>{if(event.matches){smoothScroll?.destroy();smoothScroll=undefined;}});
const model = structuredClone(DEFAULT_MODEL);
const seats = getSeats(model);
const state = {selected:12, comparison:null, layout:'theatre', mode:'seat', eyeHeight:1.2, overlay:false};
let pickComparison = false;
const viewer = new VenueViewer($('#scene'), status => { $('#scene-status').textContent = status; });
viewer.rebuild(model, state.layout);

// Local geometry only: this public demo never calls the operator API or a VLM.
function render() {
  const results = seats.map(seat => analyzeSightline(model, seat, state.layout, state.eyeHeight));
  $('#seat-map').innerHTML = seats.map(seat => `<button type="button" data-seat="${seat.id}" class="seat ${seat.id === state.selected ? 'selected' : ''} ${seat.id === state.comparison ? 'compared' : ''}" aria-label="${seat.label} 좌석${seat.id === state.comparison ? ' · 비교 좌석' : ''}" aria-pressed="${seat.id === state.selected || seat.id === state.comparison}">${seat.label}<i class="${results[seat.id].visible < 100 ? 'blocked' : ''}" aria-hidden="true"></i></button>`).join('');
  $('#selected-label').textContent = seats[state.selected].label;
  $('#visible-value').textContent = `${results[state.selected].visible}%`;
  $('#analysis').textContent = describeSightline(results[state.selected]);
  $('#seat-tag').textContent = `선택 · ${seats[state.selected].label}`;
  $('#compare-tag').hidden = state.comparison === null || state.mode === 'overview';
  $('#divider').hidden = state.comparison === null || state.mode === 'overview';
  $('#compare-tag').textContent = state.comparison === null ? '' : `비교 · ${seats[state.comparison].label}`;
  $('#comparison-result').hidden = state.comparison === null;
  if (state.comparison !== null) $('#comparison-result').textContent = `${seats[state.selected].label} ${results[state.selected].visible}% ↔ ${seats[state.comparison].label} ${results[state.comparison].visible}% · 동일 눈높이 ${state.eyeHeight.toFixed(2)}m · 화각 60°`;
  $('#compare').setAttribute('aria-pressed', String(pickComparison || state.comparison !== null));
  $('#compare').textContent = pickComparison ? '비교할 좌석을 선택하세요' : state.comparison === null ? '두 자리 비교 ↔' : '비교 해제 ×';
  $('#pick-hint').textContent = pickComparison ? '다른 좌석 하나를 눌러주세요' : '● 선택  ·  ● 비교  ·  밑줄은 가림이 있는 좌석';
  $('#seat-mode').setAttribute('aria-pressed', String(state.mode === 'seat'));
  $('#space-mode').setAttribute('aria-pressed', String(state.mode === 'overview'));
  $('#eye-value').textContent = `${state.eyeHeight.toFixed(2)}m`;
  viewer.setView(state);
}
$('#seat-map').addEventListener('click', event => {
  const button = event.target.closest('[data-seat]');
  if (!button) return;
  const id = Number(button.dataset.seat);
  if (pickComparison) {
    if (id === state.selected) { $('#pick-hint').textContent = '선택한 자리와 다른 좌석을 눌러주세요'; return; }
    state.comparison = id; pickComparison = false;
  } else {
    state.selected = id;
    if (state.comparison === id) state.comparison = null;
  }
  state.mode = 'seat'; render();
});
$('#compare').addEventListener('click', () => {
  if (state.comparison !== null || pickComparison) { state.comparison = null; pickComparison = false; }
  else pickComparison = true;
  state.mode = 'seat'; render();
});
for (const [id, mode] of [['seat-mode','seat'],['space-mode','overview']]) $( `#${id}`).addEventListener('click', () => {state.mode = mode; render();});
$('#layout').addEventListener('change', event => { state.layout = event.target.value; viewer.rebuild(model, state.layout); render(); });
$('#eye-height').addEventListener('input', event => { state.eyeHeight = Number(event.target.value); render(); });
$('#reset-view').addEventListener('click', () => viewer.resetDirection());
const dialog = $('#method-dialog');
$('#method').addEventListener('click', () => dialog.showModal());
$('#close-method').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) {const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();} });
function focusDemo() { if(smoothScroll) smoothScroll.scrollTo($('#experience'),{offset:-24}); else $('#experience').scrollIntoView({behavior:'instant',block:'start'}); }
$('#try-rail').addEventListener('click', () => {state.selected=12;state.comparison=null;state.mode='seat';state.layout='theatre';pickComparison=false;$('#layout').value=state.layout;viewer.rebuild(model,state.layout);render();focusDemo();});
$('#try-compare').addEventListener('click', () => {state.selected=12;state.comparison=17;state.mode='seat';pickComparison=false;render();focusDemo();});
$('#try-layout').addEventListener('click', () => {state.selected=1;state.comparison=null;pickComparison=false;state.layout='concert';state.mode='seat';$('#layout').value=state.layout;viewer.rebuild(model,state.layout);render();focusDemo();});

// Deliberately schematic, with dimensions supplied by DEFAULT_MODEL; not a survey drawing.
$('#floorplan').innerHTML = `<svg viewBox="0 0 320 170" role="img" aria-label="오름 아트홀의 20석 가상 평면도. 도면 예시이며 실측 자료가 아닙니다."><defs><pattern id="grid" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="#dbe2d7" stroke-width=".5"/></pattern></defs><rect width="320" height="170" fill="url(#grid)"/><rect x="65" y="18" width="190" height="34" fill="#dde8d8" stroke="#1c3f35"/><text x="160" y="40" text-anchor="middle" fill="#1c3f35" font-size="11">STAGE / 폭 ${model.stageWidth}m</text><path d="M65 59h190" stroke="#c78454" stroke-width="3"/>${seats.map(s=>`<rect x="${79+(s.id%5)*34}" y="${72+Math.floor(s.id/5)*22}" width="25" height="16" rx="2" fill="#f7f7ef" stroke="#6d8373"/><text x="${91+(s.id%5)*34}" y="${84+Math.floor(s.id/5)*22}" text-anchor="middle" fill="#3c5747" font-size="9">${s.label}</text>`).join('')}<text x="308" y="163" text-anchor="end" fill="#718372" font-size="8">SCHEMATIC / NOT TO SCALE</text></svg>`;
let workflowStep = 0;
function setStep(step) { workflowStep=step; document.querySelectorAll('[data-step]').forEach(card => {card.classList.toggle('active',Number(card.dataset.step) === step);card.classList.toggle('complete',Number(card.dataset.step) < step);}); }
$('#load-plan').addEventListener('click', () => {
  setStep(1); $('#input-badge').textContent='불러옴';$('#review-badge').textContent='예시 후보';$('#publish-badge').textContent='준비 전';
  $('#review-seats').textContent=`${seats.length}석`;
  $('#review-height').textContent=`${model.balconyHeight.toFixed(1)}m부터`;
  $('#review-rail').textContent=`${model.railHeight.toFixed(1)}m`;
  $('#review-note').textContent='치수 확인 · 대표 좌석 사진 대조 필요';
  $('#review-plan').disabled=false;$('#publish-plan').disabled=true;
  $('#ticket-preview').textContent='시야 미리 보기 ↗';
  $('#workflow-status').textContent='예시 자료를 불러왔습니다. 표시된 값은 저장된 가상 모델의 치수입니다. 실제 AI 추출 결과가 아닙니다.';
});
$('#review-plan').addEventListener('click', () => {
  if(workflowStep < 1)return;setStep(2);$('#review-badge').textContent='검수 예시';$('#review-note').textContent='목업 검수 완료 · 현장 검증을 의미하지 않음';$('#publish-badge').textContent='게시 가능';$('#publish-plan').disabled=false;
  $('#workflow-status').textContent='검수 단계를 체험했습니다. 실제 도입 시에는 좌석 위치·높이·난간을 현장 자료로 대조한 뒤 게시합니다.';
});
$('#publish-plan').addEventListener('click', () => {
  if(workflowStep < 2)return;setStep(3);$('#publish-badge').textContent='목업 게시';$('#ticket-preview').textContent='시야 미리 보기 · 준비 완료 ✓';
  $('#workflow-status').textContent='게시 흐름 체험이 완료됐습니다. 공개 링크를 생성하거나 서버에 저장하지 않습니다. 위 좌석 체험에서 관객 화면을 확인해 보세요.';
});
render();
$('#credits').addEventListener('click',()=>{$('#credits-dialog').showModal();smoothScroll?.stop();});
$('#close-credits').addEventListener('click',()=>$('#credits-dialog').close());
for (const modal of document.querySelectorAll('dialog')) {
  modal.setAttribute('data-lenis-prevent','');
  modal.addEventListener('close',()=>smoothScroll?.start());
}
$('#method').addEventListener('click',()=>smoothScroll?.stop());
