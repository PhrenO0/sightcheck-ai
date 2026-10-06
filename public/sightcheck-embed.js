(function(global){
  'use strict';
  global.SightCheck={create:function(options){
    if(!options || !options.container || !options.publicationId)throw new Error('container와 publicationId가 필요합니다.');
    const base=new URL(options.baseUrl || location.origin),origin=base.origin,frame=document.createElement('iframe');
    frame.src=new URL('/viewer.html?publication='+encodeURIComponent(options.publicationId),base).href;
    frame.title='좌석 시야 안내';frame.style.cssText='width:100%;height:850px;border:0;border-radius:14px;';
    frame.setAttribute('loading','lazy');frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
    options.container.append(frame);
    let ready=false,pending;
    const send=selection=>{if(ready)frame.contentWindow.postMessage({namespace:'sightcheck',version:1,type:'select-seat',publicationId:options.publicationId,...selection},origin);else pending=selection;};
    const receive=event=>{
      const data=event.data;
      if(event.source!==frame.contentWindow || event.origin!==origin || !data || data.namespace!=='sightcheck' || data.version!==1 || data.publicationId!==options.publicationId)return;
      if(data.type==='ready'){ready=true;if(pending){send(pending);pending=undefined;}}
      if(data.type==='unavailable')ready=false;
      if(typeof options.onEvent==='function')options.onEvent(data);
    };
    global.addEventListener('message',receive);
    return {iframe:frame,selectSeat:function(seatLabel){send({seatLabel});},selectExternalSeat:function(externalId){send({externalId});},destroy:function(){global.removeEventListener('message',receive);frame.remove();}};
  }};
})(window);
