import {expect,test} from 'vitest';
import {makeImg,bytesToBase64} from '../../src/lib/image/png.ts';
import {encodePngBytes} from '../../src/lib/image/pngraw.ts';
import {occludeAttachment,validateAttachment,renderAttachmentFrame,ATTACHMENT_DOCUMENT_MAX_BYTES,type AttachmentDocument} from '../../src/ui/motion-lab/attachment.ts';
test('authored occluders hide only item pixels under existing body pixels without modifying either input',()=>{
  const body=makeImg(2,1),layer=makeImg(2,1),mask=makeImg(2,1);body.data.set([20,30,40,255]);layer.data.fill(255);mask.data.fill(255);
  const original=new Uint8ClampedArray(body.data),out=occludeAttachment(layer,body,mask);
  expect(out.hidden).toBe(1);expect([...out.image.data]).toEqual([0,0,0,0,255,255,255,255]);expect(body.data).toEqual(original);expect([...layer.data]).toEqual(Array(8).fill(255));
  expect(()=>occludeAttachment(layer,makeImg(1,1),mask)).toThrow('native canvas');
});

test('native frame art keeps exact placement and colors, with shared body-only occlusion and unchanged inputs',async()=>{
  const body=makeImg(4,4),source=makeImg(1,1),native=makeImg(4,4),mask=makeImg(4,4);
  body.data.set([20,30,40,255],0);source.data.set([255,0,0,255]);native.data.set([90,60,30,255],0);native.data.set([120,120,120,255],20);mask.data.fill(255);
  const before=structuredClone(body),png=bytesToBase64(await encodePngBytes(native)),frame={grip:{x:3,y:3},angle:173,occluder:bytesToBase64(await encodePngBytes(mask)),authoredPng:png};
  const asset={png:'unused',grip:{x:0,y:0},axis:{x:1,y:0}},out=await renderAttachmentFrame(source,asset,frame,body);
  expect(out.source).toBe('authored-frame');expect(out.hidden).toBe(1);expect(out.clippedSourcePixels).toBe(0);
  const expected=structuredClone(native);expected.data.fill(0,0,4);expect(out.image).toEqual(expected);expect(body).toEqual(before);expect(frame.authoredPng).toBe(png);expect(source.data).toEqual(new Uint8ClampedArray([255,0,0,255]));
  const moved=await renderAttachmentFrame(source,asset,{...frame,grip:{x:0,y:0},angle:-67},body);expect(moved.image).toEqual(out.image);
});

test('native frame art rejects partial alpha and wrong canvases instead of falling back to a rotated source',async()=>{
  const body=makeImg(4,4),source=makeImg(1,1),mask=bytesToBase64(await encodePngBytes(body)),asset={png:'unused',grip:{x:0,y:0},axis:{x:1,y:0}},frame={grip:{x:1,y:1},angle:0,occluder:mask};
  const partial=makeImg(4,4);partial.data.set([90,60,30,128]);
  await expect(renderAttachmentFrame(source,asset,{...frame,authoredPng:bytesToBase64(await encodePngBytes(partial))},body)).rejects.toThrow('partial alpha');
  await expect(renderAttachmentFrame(source,asset,{...frame,authoredPng:bytesToBase64(await encodePngBytes(source))},body)).rejects.toThrow('native canvas');
});

test('authored frame imports require the padded canvas and remain bound to the original ordered body hashes',async()=>{
  const png=bytesToBase64(await encodePngBytes(makeImg(4,4))),binding={jobId:'test',hashes:['sha'],cell:{w:4,h:4},pivot:{x:2,y:4},direction:'east',padding:1},padded=bytesToBase64(await encodePngBytes(makeImg(6,6)));
  const doc:AttachmentDocument={version:1,kind:'pixeldoll-authored-attachment',body:binding,asset:{png,grip:{x:2,y:3},axis:{x:2,y:0}},frames:[{grip:{x:2,y:3},angle:0,occluder:padded,authoredPng:padded}],notes:'Native art for this exact body only.'};
  expect(validateAttachment(doc,binding)).toBe(doc);
  expect(()=>validateAttachment({...doc,frames:[{...doc.frames[0],authoredPng:png}]},binding)).toThrow('padded native canvas');
  expect(()=>validateAttachment(doc,{...binding,hashes:['replacement']})).toThrow('exact frozen');
  expect(()=>validateAttachment({...doc,notes:'x'.repeat(ATTACHMENT_DOCUMENT_MAX_BYTES)},binding)).toThrow('exceeds 5 MB');
});
test('attachment imports bind to exact frozen frames and validate independent angle and native masks',async()=>{
  const png=bytesToBase64(await encodePngBytes(makeImg(4,4))),binding={jobId:'test',hashes:['sha'],cell:{w:4,h:4},pivot:{x:2,y:4},direction:'south',padding:0};
  const doc:AttachmentDocument={version:1,kind:'pixeldoll-authored-attachment',body:binding,asset:{png,grip:{x:2,y:3},axis:{x:2,y:0}},frames:[{grip:{x:1,y:2},angle:73,occluder:png}],notes:'Manual target grip, independent blade angle.'};
  expect(validateAttachment(doc,binding)).toBe(doc);expect(()=>validateAttachment(doc,{...binding,hashes:['other']})).toThrow('exact frozen');
  expect(()=>validateAttachment({...doc,frames:[{...doc.frames[0],angle:NaN}]},binding)).toThrow('finite');
  expect(()=>validateAttachment({...doc,asset:{...doc.asset,axis:doc.asset.grip}},binding)).toThrow('blade-axis');
});
