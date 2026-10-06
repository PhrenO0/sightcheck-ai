const slug=new URLSearchParams(location.search).get('publication'),status=document.querySelector('#status');
if(!slug) status.textContent='운영자 화면에서 게시한 공연의 연동 예시 링크로 접속하세요.';
else {
  try {
    const response=await fetch(`/api/v1/publications/${encodeURIComponent(slug)}`),data=await response.json();if(!response.ok)throw new Error(data.error);
    const instance=window.SightCheck.create({container:document.querySelector('#embed'),publicationId:slug,onEvent:event=>{status.textContent=event.type==='seat-changed'?`위젯이 ${event.seatLabel} 좌석으로 이동했습니다.`:event.type==='ready'?'시야 위젯 준비 완료':event.type==='unavailable'?'게시 중지 또는 재검토 중입니다.':'좌석 선택을 확인하고 있습니다.';}});
    for(const seat of data.publication.model.seats.slice(0,40)) {const button=document.createElement('button');button.textContent=seat.label;button.onclick=()=>instance.selectSeat(seat.label);document.querySelector('#seats').append(button);}
    window.addEventListener('pagehide',()=>instance.destroy());
  } catch(error) {status.textContent=error.message;}
}
