import {expect,test} from 'vitest';
import {makeImg,bytesToBase64} from '../../src/lib/image/png.ts';
import {encodePngBytes} from '../../src/lib/image/pngraw.ts';
import {occludeAttachment,attachmentPalmIsOpaque,validateAttachment,renderAttachmentFrame,ATTACHMENT_DOCUMENT_MAX_BYTES,type AttachmentDocument} from '../../src/ui/motion-lab/attachment.ts';
test('authored occluders hide only item pixels under existing body pixels without modifying either input',()=>{
  const body=makeImg(2,1),layer=makeImg(2,1),mask=makeImg(2,1);body.data.set([20,30,40,255]);layer.data.fill(255);mask.data.fill(255);
  const original=new Uint8ClampedArray(body.data),out=occludeAttachment(layer,body,mask);
  expect(out.hidden).toBe(1);expect([...out.image.data]).toEqual([0,0,0,0,255,255,255,255]);expect(body.data).toEqual(original);expect([...layer.data]).toEqual(Array(8).fill(255));
  expect(()=>occludeAttachment(layer,makeImg(1,1),mask)).toThrow('native canvas');
});

test('native frame art keeps exact placement and colors, with shared body-only occlusion and unchanged inputs',async()=>{
  const body=makeImg(4,4),source=makeImg(1,1),native=makeImg(4,4),mask=makeImg(4,4);
  body.data.set([20,30,40,255],0);body.data.set([20,30,40,255],(3*4+3)*4);source.data.set([255,0,0,255]);native.data.set([90,60,30,255],0);native.data.set([120,120,120,255],20);mask.data.fill(255);
  const before=structuredClone(body),png=bytesToBase64(await encodePngBytes(native)),frame={grip:{x:3,y:3},angle:173,occluder:bytesToBase64(await encodePngBytes(mask)),authoredPng:png};
  const asset={png:'unused',grip:{x:0,y:0},axis:{x:1,y:0}},out=await renderAttachmentFrame(source,asset,frame,body);
  expect(out.source).toBe('authored-frame');expect(out.hidden).toBe(1);expect(out.clippedSourcePixels).toBe(0);
  const expected=structuredClone(native);expected.data.fill(0,0,4);expect(out.image).toEqual(expected);expect(body).toEqual(before);expect(frame.authoredPng).toBe(png);expect(source.data).toEqual(new Uint8ClampedArray([255,0,0,255]));
  const moved=await renderAttachmentFrame(source,asset,{...frame,grip:{x:0,y:0},angle:-67},body);expect(moved.image).toEqual(out.image);
});

test('native frame art rejects partial alpha and wrong canvases instead of falling back to a rotated source',async()=>{
  const body=makeImg(4,4),source=makeImg(1,1),mask=bytesToBase64(await encodePngBytes(body)),asset={png:'unused',grip:{x:0,y:0},axis:{x:1,y:0}},frame={grip:{x:1,y:1},angle:0,occluder:mask};
  body.data.set([20,30,40,255],(1*4+1)*4);
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

test('unmarked palms remain explicit editable draft state and cannot render either placement or authored art',async()=>{
  const body=makeImg(4,4),source=makeImg(4,4),mask=makeImg(4,4),native=makeImg(4,4);
  body.data.set([80,40,20,255],(2*4+2)*4);source.data.set([120,70,30,255],(2*4+2)*4);native.data.set([140,140,140,255],(1*4+1)*4);
  const bodyBefore=structuredClone(body),sourceBefore=structuredClone(source),png=bytesToBase64(await encodePngBytes(source));
  const binding={jobId:'native-without-joints',hashes:['frozen-native'],cell:{w:4,h:4},pivot:{x:2,y:4},direction:'north-west',padding:0};
  const doc:AttachmentDocument={version:1,kind:'pixeldoll-authored-attachment',body:binding,asset:{png,grip:{x:2.5,y:2.5},axis:{x:2.5,y:.5}},frames:[{angle:-90,occluder:bytesToBase64(await encodePngBytes(mask))}],notes:'No frame joints or palm location were inferred.'};
  expect(validateAttachment(doc,binding)).toBe(doc);expect(doc.frames[0]).not.toHaveProperty('grip');
  const restored=validateAttachment(JSON.parse(JSON.stringify(doc)),binding);expect(restored.frames[0].grip).toBeUndefined();
  await expect(renderAttachmentFrame(source,doc.asset,restored.frames[0],body)).rejects.toThrow('visible palm');
  const authored={...restored.frames[0],authoredPng:bytesToBase64(await encodePngBytes(native))};
  await expect(renderAttachmentFrame(source,doc.asset,authored,body)).rejects.toThrow('visible palm');
  expect(body).toEqual(bodyBefore);expect(source).toEqual(sourceBefore);
});

test('an explicitly marked palm enables exact native rendering without modifying body or source artwork',async()=>{
  const body=makeImg(4,4),source=makeImg(4,4),mask=makeImg(4,4);
  body.data.set([80,40,20,255],(2*4+2)*4);source.data.set([130,70,30,255],(2*4+2)*4);
  const beforeBody=structuredClone(body),beforeSource=structuredClone(source),asset={png:'unused-by-renderer',grip:{x:2.5,y:2.5},axis:{x:2.5,y:.5}};
  const frame={grip:{x:2.5,y:2.5},angle:-90,occluder:bytesToBase64(await encodePngBytes(mask))};
  const rendered=await renderAttachmentFrame(source,asset,frame,body);
  expect(rendered.source).toBe('rigid-source');expect(rendered.image.data).toEqual(source.data);
  expect(body).toEqual(beforeBody);expect(source).toEqual(beforeSource);
  expect([...rendered.image.data.slice((2*4+2)*4,(2*4+2)*4+4)]).toEqual([130,70,30,255]);
});

test('imported and numeric target grips cannot render in transparent or partial-alpha body space',async()=>{
  const body=makeImg(4,4),source=makeImg(4,4),mask=makeImg(4,4),native=makeImg(4,4);
  body.data.set([80,40,20,255],(1*4+1)*4);body.data.set([80,40,20,128],(2*4+2)*4);
  source.data.set([130,70,30,255],(1*4+1)*4);native.data.set([170,170,170,255],(3*4+3)*4);
  const beforeBody=structuredClone(body),beforeSource=structuredClone(source),beforeNative=structuredClone(native),png=bytesToBase64(await encodePngBytes(source)),nativePng=bytesToBase64(await encodePngBytes(native));
  const binding={jobId:'explicit-body-contact',hashes:['frozen-body'],cell:{w:4,h:4},pivot:{x:2,y:4},direction:'east',padding:0};
  const doc:AttachmentDocument={version:1,kind:'pixeldoll-authored-attachment',body:binding,asset:{png,grip:{x:1.5,y:1.5},axis:{x:1.5,y:.5}},frames:[{grip:{x:.5,y:.5},angle:-90,occluder:bytesToBase64(await encodePngBytes(mask))}],notes:'Structurally valid metadata still requires actual opaque body contact.'};
  const imported=validateAttachment(JSON.parse(JSON.stringify(doc)),binding);
  for(const grip of [{x:.5,y:.5},{x:2.5,y:2.5},{x:-.5,y:1.5},{x:4,y:1.5},{x:NaN,y:1.5},{x:1.5,y:Infinity}]){
    const frame={...imported.frames[0],grip};expect(attachmentPalmIsOpaque(frame,body)).toBe(false);
    await expect(renderAttachmentFrame(source,doc.asset,frame,body)).rejects.toThrow('opaque visible palm');
    await expect(renderAttachmentFrame(source,doc.asset,{...frame,authoredPng:nativePng},body)).rejects.toThrow('opaque visible palm');
  }
  // The target check precedes decoding/rotation/occlusion, so malformed downstream inputs cannot hide it.
  await expect(renderAttachmentFrame(source,doc.asset,{...imported.frames[0],angle:NaN,occluder:'not-a-png',authoredPng:'not-a-png'},body)).rejects.toThrow('opaque visible palm');
  expect(attachmentPalmIsOpaque({...imported.frames[0],grip:{x:1.5,y:1.5}},body)).toBe(true);
  expect(body).toEqual(beforeBody);expect(source).toEqual(beforeSource);expect(native).toEqual(beforeNative);
});

test('rigid source grips require opaque item contact while native frame art remains independent of the source anchor',async()=>{
  const body=makeImg(4,4),source=makeImg(4,4),native=makeImg(4,4),mask=makeImg(4,4);
  body.data.set([80,40,20,255],(1*4+1)*4);source.data.set([130,70,30,255],(1*4+1)*4);source.data.set([130,70,30,128],(2*4+2)*4);native.data.set([170,170,170,255],(3*4+3)*4);
  const beforeBody=structuredClone(body),beforeSource=structuredClone(source),beforeNative=structuredClone(native),frame={grip:{x:1.5,y:1.5},angle:-90,occluder:bytesToBase64(await encodePngBytes(mask))},nativePng=bytesToBase64(await encodePngBytes(native));
  for(const grip of [{x:.5,y:.5},{x:2.5,y:2.5}]){
    const asset={png:bytesToBase64(await encodePngBytes(source)),grip,axis:{x:1.5,y:.5}};
    await expect(renderAttachmentFrame(source,asset,frame,body)).rejects.toThrow('source grip inside an opaque attachment pixel');
    const placed=await renderAttachmentFrame(source,asset,{...frame,authoredPng:nativePng},body);
    expect(placed.source).toBe('authored-frame');expect(placed.image).toEqual(native);
  }
  expect(body).toEqual(beforeBody);expect(source).toEqual(beforeSource);expect(native).toEqual(beforeNative);
});
