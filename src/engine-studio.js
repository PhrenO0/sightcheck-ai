import { recognizeSeatLabels } from './ocr.js';
const $ = selector => document.querySelector(selector);
const numeric = (value, field) => {if (!String(value).trim() || !Number.isFinite(Number(value))) throw new Error(`${field}: 숫자를 입력하세요.`); return Number(value);};

export function mountEngineStudio({fileImage, commitModel, toast}) {
  const section = document.createElement('section'); section.className = 'admin-section engine-section';
  section.innerHTML = `<h3>도면 → 경량 3D 변환 API</h3><p>정투영·균일 축척 도면 전용입니다. AI가 좌석 문자를 찾고, 사람이 좌석 중심·치수·높이를 확인합니다. 결과 외관은 공통 스타일이며 현장 검수 전입니다.</p>
    <div class="upload-actions"><label class="secondary-button file-button">도면 선택<input id="engine-file" type="file" accept="image/png,image/jpeg,image/webp"/></label><button id="engine-example" class="secondary-button">변환 예시 불러오기</button><button id="engine-ocr" class="secondary-button" disabled>AI 문자·좌표 후보 추출</button></div>
    <div class="engine-image-wrap" hidden><img id="engine-image" alt="변환할 좌석도. 좌석 중심과 무대 전면 기준점을 확인하세요."/><svg id="engine-points" aria-hidden="true"></svg></div>
    <div class="upload-actions"><button id="engine-left" class="text-button">도면에서 무대 왼쪽 끝 지정</button><button id="engine-right" class="text-button">오른쪽 끝 지정</button></div>
    <div class="admin-grid">
    <label class="field"><span>무대 왼쪽 끝 x, y (px)</span><input id="engine-anchor-left" placeholder="242, 110"/></label><label class="field"><span>무대 오른쪽 끝 x, y (px)</span><input id="engine-anchor-right" placeholder="758, 110"/></label>
    <label class="field"><span>실측 무대 전면 폭 (m)</span><input id="engine-width" type="number" min="2" max="60" step="0.01" value="8.6"/></label><label class="field"><span>무대 깊이 (m)</span><input id="engine-depth" type="number" min="1" max="20" step="0.01" value="3.6"/></label>
    <label class="field"><span>무대 바닥 높이 (m)</span><input id="engine-height" type="number" min="0" max="3" step="0.01" value="0.6"/></label><label class="field"><span>무대 표본 영역 높이 (m)</span><input id="engine-target" type="number" min="1" max="8" step="0.01" value="2.4"/></label>
    <label class="field"><span>객석 방향 (왼쪽 끝→오른쪽 끝 기준)</span><select id="engine-side"><option value="1">오른쪽으로 90° 회전한 방향</option><option value="-1">왼쪽으로 90° 회전한 방향</option></select></label></div>
    <label class="field"><span>좌석 중심 CSV — 좌석명,x(px),y(px),바닥높이(m),구역,행(0부터)</span><textarea id="engine-seats" rows="6" spellcheck="false" placeholder="A1,338,455,0,1층,0"></textarea></label>
    <p class="small-muted">OCR 상자 중심은 문자 위치입니다. 실제 의자의 중심인지 도면에서 확인·수정하세요. 바닥 높이와 행 번호는 직접 입력해야 합니다. 1~300석, 임의 배치를 지원합니다.</p>
    <label class="field"><span>가림 구조물 JSON — 중심 position[x,y,z], 크기 size[폭,높이,깊이] (m)</span><textarea id="engine-obstacles" rows="5" spellcheck="false">[]</textarea></label><p class="small-muted">원점: 무대 전면 중앙의 지면. x: 좌우, y: 높이, z: 객석 방향. 무대 전면 z=-0.25m. layout은 all·theatre·concert입니다. 가림 구조물의 위치·치수는 필수 실측 항목입니다.</p>
    <label class="check-line"><input id="engine-rights" type="checkbox"/>도면 사용 권한을 확인했습니다.</label>
    <label class="check-line"><input id="engine-reviewed" type="checkbox"/>축척·방향·좌석 중심·단차·가림 구조물을 직접 검토했습니다.</label>
    <div class="upload-actions"><button id="engine-convert" class="dark-button">변환 API 실행</button><button id="engine-apply" class="primary-button" disabled>변환 모델로 시야 보기</button><button id="engine-download" class="secondary-button" disabled>API 결과 JSON</button></div>
    <p id="engine-status" role="status"></p><div id="engine-report" class="callout" hidden></div>`;
  $('#admin-dialog .dialog-body').prepend(section);
  let source, imageSize, picking, result, busy = false, revision = 0;
  const status = text => {$('#engine-status').textContent = text;};
  const invalidate = () => {revision++; result = null; $('#engine-apply').disabled = $('#engine-download').disabled = true; $('#engine-report').hidden = true;};
  section.addEventListener('input', event => {
    if (!['engine-reviewed','engine-rights'].includes(event.target.id)) $('#engine-reviewed').checked = false;
    invalidate(); drawPoints();
  });
  function anchor(id) {const parts = $(id).value.split(','); if (parts.length !== 2) throw new Error('무대 전면 양 끝을 x,y 형식으로 입력하세요.'); return parts.map(p => numeric(p,'기준점'));}
  function drawPoints() {
    if (!imageSize) return;
    const svg = $('#engine-points'); svg.setAttribute('viewBox', `0 0 ${imageSize.width} ${imageSize.height}`); svg.replaceChildren();
    const draw = (p,color,r=8) => {if (!p.every(Number.isFinite)) return; const c = document.createElementNS('http://www.w3.org/2000/svg','circle'); c.setAttribute('cx',p[0]); c.setAttribute('cy',p[1]); c.setAttribute('r',r); c.setAttribute('fill',color); c.setAttribute('stroke','#fff'); c.setAttribute('stroke-width','2'); svg.append(c);};
    try {draw(anchor('#engine-anchor-left'),'#a45316',12); draw(anchor('#engine-anchor-right'),'#286441',12);} catch { }
    $('#engine-seats').value.split('\n').filter(Boolean).forEach(line => {const cells = line.split(','); draw([Number(cells[1]),Number(cells[2])],'#496a9c',6);});
  }
  async function loadImage(url) {
    invalidate(); source = undefined; imageSize = undefined; $('#engine-ocr').disabled = true;
    $('.engine-image-wrap').hidden = true; $('#engine-reviewed').checked = $('#engine-rights').checked = false;
    const requestRevision = revision, img = $('#engine-image'); img.src = url; await img.decode();
    if (revision !== requestRevision) throw new Error('이미지를 읽는 동안 입력이 바뀌었습니다. 도면을 다시 선택하세요.');
    source = url; imageSize = {width:img.naturalWidth,height:img.naturalHeight};
    $('.engine-image-wrap').hidden = false; $('#engine-ocr').disabled = false; drawPoints();
  }
  $('#engine-image').onclick = event => {
    if (!picking || !imageSize) return;
    const box = event.target.getBoundingClientRect();
    $(`#engine-anchor-${picking}`).value = `${Math.round((event.clientX-box.left)/box.width*imageSize.width)}, ${Math.round((event.clientY-box.top)/box.height*imageSize.height)}`;
    picking = null; invalidate(); drawPoints(); status('기준점을 지정했습니다. 실측 폭과 객석 방향을 확인하세요.');
  };
  $('#engine-left').onclick = () => {picking = 'left'; status('도면에서 무대 전면의 왼쪽 끝을 클릭하세요.');};
  $('#engine-right').onclick = () => {picking = 'right'; status('도면에서 무대 전면의 오른쪽 끝을 클릭하세요.');};
  $('#engine-file').onchange = async event => {
    if (!event.target.files[0]) return;
    try {$('#engine-seats').value = ''; $('#engine-anchor-left').value = $('#engine-anchor-right').value = ''; $('#engine-obstacles').value = '[]'; await loadImage(await fileImage(event.target.files[0],2000)); status('새 도면입니다. 좌표·기준점·높이·구조물을 모두 새로 확인하세요.');} catch(e) {status(e.message);}
    event.target.value = '';
  };
  $('#engine-example').onclick = async () => {
    try {
      const reply = await fetch('/engine-demo.json'); if (!reply.ok) throw new Error('예시 입력을 읽지 못했습니다.'); const input = await reply.json();
      await loadImage('/engine-plan.png');
      $('#engine-anchor-left').value = input.calibration.stageLeft.join(', '); $('#engine-anchor-right').value = input.calibration.stageRight.join(', ');
      $('#engine-width').value = input.calibration.stageWidthM; $('#engine-side').value = input.calibration.audienceSide;
      $('#engine-depth').value = input.stage.depthM; $('#engine-height').value = input.stage.heightM; $('#engine-target').value = input.stage.targetHeightM;
      $('#engine-seats').value = input.seats.map(s => [s.label,s.xPx,s.yPx,s.floorM,s.section,s.row].join(',')).join('\n');
      $('#engine-obstacles').value = JSON.stringify(input.obstacles,null,2); drawPoints(); status('직접 제작한 가상 도면입니다. 파란 점은 좌석 중심, 주황·초록 점은 무대 기준점입니다. 검토 후 체크하세요.');
    } catch(e) {status(e.message);}
  };
  $('#engine-ocr').onclick = async () => {
    if (busy || !source) return; busy = true; $('#engine-ocr').disabled = true;
    try {
      const requestRevision = revision;
      const data = await recognizeSeatLabels(source,status);
      if (revision !== requestRevision) throw new Error('인식 중 도면이나 입력이 바뀌었습니다. 현재 도면으로 다시 인식하세요.');
      $('#engine-seats').value = data.candidates.map(s => [s.label,Math.round((s.bbox.x0+s.bbox.x1)/2),Math.round((s.bbox.y0+s.bbox.y1)/2),'','',''].join(',')).join('\n');
      invalidate(); $('#engine-reviewed').checked = false; drawPoints(); status(`${data.candidates.length}개 문자 중심 후보입니다. 좌석 중심으로 수정하고 바닥 높이·구역·행을 입력하세요.`);
    } catch(e) {status(e.message);} finally {busy = false; $('#engine-ocr').disabled = !source;}
  };
  $('#engine-convert').onclick = async () => {
    if (busy) return; invalidate(); busy = true; $('#engine-convert').disabled = true;
    try {
      if (!imageSize) throw new Error('먼저 도면을 올리세요.');
      const seats = $('#engine-seats').value.split('\n').filter(s => s.trim()).map((line,i) => {
        const c = line.split(',').map(s => s.trim()); if (c.length !== 6) throw new Error(`${i+1}행은 CSV 6개 항목이어야 합니다.`);
        return {label:c[0].toUpperCase(),xPx:numeric(c[1],'x'),yPx:numeric(c[2],'y'),floorM:numeric(c[3],'바닥 높이'),section:c[4],row:numeric(c[5],'행 번호')};
      });
      const input = {inputType:'rectified_plan', name:$('#venue-input').value || '도면 변환 공연장', ticketUrl:$('#ticket-url').value.trim(), image:imageSize,
        calibration:{stageLeft:anchor('#engine-anchor-left'),stageRight:anchor('#engine-anchor-right'),stageWidthM:numeric($('#engine-width').value,'무대 폭'),audienceSide:Number($('#engine-side').value)},
        stage:{depthM:numeric($('#engine-depth').value,'깊이'),heightM:numeric($('#engine-height').value,'높이'),targetHeightM:numeric($('#engine-target').value,'표본 영역 높이')},
        seats, obstacles:JSON.parse($('#engine-obstacles').value), rightsConfirmed:$('#engine-rights').checked, positionsReviewed:$('#engine-reviewed').checked, measurementsReviewed:$('#engine-reviewed').checked};
      const requestRevision = revision, started = performance.now(); const reply = await fetch('/api/v1/convert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
      const data = await reply.json(); if (!reply.ok) throw new Error(data.error || '변환 실패');
      if (revision !== requestRevision) throw new Error('요청 중 입력이 바뀌었습니다. 수정한 입력으로 다시 실행하세요.'); result = data;
      $('#engine-apply').disabled = $('#engine-download').disabled = false;
      $('#engine-report').hidden = false; $('#engine-report').textContent = `${data.report.seatCount}석 · 모델 JSON ${(data.report.geometryBytes/1024).toFixed(1)}KB · 요청 왕복 ${Math.round(performance.now()-started)}ms · 현장 검수 전. 조명·외관은 공통 자산이며 사진에서 복원하지 않았습니다.`;
      status('변환 완료. 좌석별 카메라와 구조물 모델이 생성됐습니다. 아래 버튼으로 시야를 확인하세요.');
    } catch(e) {status(`변환하지 못했습니다: ${e.message}`);} finally {busy = false; $('#engine-convert').disabled = false;}
  };
  $('#engine-apply').onclick = () => {if (!result) return; try {commitModel(result.model); $('#admin-dialog').close(); toast('도면에서 변환한 공간을 열었습니다. 현장 시야 검수가 필요합니다.');} catch(e) {status(e.message);}};
  $('#engine-download').onclick = () => {
    if (!result) return; const url = URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'sightcheck-conversion.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1500);
  };
}
