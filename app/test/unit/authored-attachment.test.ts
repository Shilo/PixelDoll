import {expect,test} from 'vitest';
import {makeImg,bytesToBase64} from '../../src/lib/image/png.ts';
import {encodePngBytes} from '../../src/lib/image/pngraw.ts';
import {occludeAttachment,validateAttachment,type AttachmentDocument} from '../../src/ui/motion-lab/attachment.ts';
test('authored occluders hide only item pixels under existing body pixels without modifying either input',()=>{
  const body=makeImg(2,1),layer=makeImg(2,1),mask=makeImg(2,1);body.data.set([20,30,40,255]);layer.data.fill(255);mask.data.fill(255);
  const original=new Uint8ClampedArray(body.data),out=occludeAttachment(layer,body,mask);
  expect(out.hidden).toBe(1);expect([...out.image.data]).toEqual([0,0,0,0,255,255,255,255]);expect(body.data).toEqual(original);expect([...layer.data]).toEqual(Array(8).fill(255));
  expect(()=>occludeAttachment(layer,makeImg(1,1),mask)).toThrow('native canvas');
});
test('attachment imports bind to exact frozen frames and validate independent angle and native masks',async()=>{
  const png=bytesToBase64(await encodePngBytes(makeImg(4,4))),binding={jobId:'test',hashes:['sha'],cell:{w:4,h:4},pivot:{x:2,y:4},direction:'south',padding:0};
  const doc:AttachmentDocument={version:1,kind:'pixeldoll-authored-attachment',body:binding,asset:{png,grip:{x:2,y:3},axis:{x:2,y:0}},frames:[{grip:{x:1,y:2},angle:73,occluder:png}],notes:'Manual target grip, independent blade angle.'};
  expect(validateAttachment(doc,binding)).toBe(doc);expect(()=>validateAttachment(doc,{...binding,hashes:['other']})).toThrow('exact frozen');
  expect(()=>validateAttachment({...doc,frames:[{...doc.frames[0],angle:NaN}]},binding)).toThrow('finite');
  expect(()=>validateAttachment({...doc,asset:{...doc.asset,axis:doc.asset.grip}},binding)).toThrow('blade-axis');
});
