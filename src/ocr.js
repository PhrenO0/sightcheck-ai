export function parseCandidates(data) {
  const words = (data.blocks || []).flatMap(block => (block.paragraphs || []).flatMap(p => (p.lines || []).flatMap(line => line.words || [])));
  const matches = words.map(word => ({label: word.text.toUpperCase().replace(/[^A-Z0-9]/g, ''), bbox: word.bbox, confidence: word.confidence}))
    .filter(word => /^[A-Z]{1,2}[0-9]{1,3}$/.test(word.label));
  matches.sort((a,b) => {
    const dy = a.bbox.y0 - b.bbox.y0;
    const tolerance = Math.max(a.bbox.y1 - a.bbox.y0, b.bbox.y1 - b.bbox.y0) * 0.65;
    return Math.abs(dy) > tolerance ? dy : a.bbox.x0 - b.bbox.x0;
  });
  const seen = new Set();
  return matches.filter(word => {if (seen.has(word.label)) return false; seen.add(word.label); return true;});
}

export async function recognizeSeatLabels(image, onProgress) {
  const { createWorker, PSM } = await import('tesseract.js');
  let worker;
  try {
    worker = await createWorker('eng', 1, {
      workerPath: new URL('/ocr/worker.min.js', location.origin).href,
      corePath: new URL('/ocr/', location.origin).href,
      langPath: new URL('/ocr', location.origin).href,
      workerBlobURL: false,
      logger: message => onProgress(`${message.status === 'recognizing text' ? '좌석 문자를 읽는 중' : '인식 엔진 준비 중'} ${Math.round((message.progress || 0) * 100)}%`),
    });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', user_defined_dpi: '150' });
    const { data } = await worker.recognize(image, {}, {text: true, blocks: true});
    return { candidates: parseCandidates(data), text: data.text };
  } finally { if (worker) await worker.terminate(); }
}
