import { makeImg } from '../../src/lib/image/png.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import type { Project, Item, Sha256 } from '../../src/lib/store/manifest.ts';

export async function equipmentFixture():Promise<Project>{
  const body=makeImg(64,64),hat=makeImg(64,64),other=makeImg(64,64);
  body.data.set([180,120,90,255],(50*64+20)*4);
  hat.data.set([120,120,120,255],(18*64+20)*4);
  other.data.set([150,80,70,255],(18*64+20)*4);
  const bh=await cellHash(body),hh=await cellHash(hat),oh=await cellHash(other),baseHash=`sha256:${'a'.repeat(64)}` as Sha256;
  const make=(id:string,slot:string,h:Sha256):Item=>({id,name:id,slot,status:'accepted',baseHash,prompt:id,mirror:'flip',materials:[id],provenance:[],layers:[{id:'main',role:'fg',z:slot==='body'?10:130,cells:{rest:{south:[h]}}}]});
  return{images:new Map([[bh,body],[hh,hat],[oh,other]]),manifest:{format:'pixeldoll/2',name:'Fixture',app:'test',rig:{cell:{w:64,h:64},pivot:{x:32,y:56},view:'low top-down',template:'mannequin',baseHash,baseItem:'base',directions:[{id:'south'}],animations:[{id:'rest',cells:1,frames:[{cell:0,ms:100}],loop:true}]},items:[make('base','body',bh),make('hat','head',hh)],materials:[{id:'base',owner:'base',label:'Skin',ramp:['#b4785a'],variants:{}},{id:'hat',owner:'hat',label:'Metal',ramp:['#787878'],variants:{blue:['#0000ff'],red:['#ff0000']}}],slots:[{id:'body',class:'base',z:10},{id:'head',class:'rigid',anchor:'head',z:130}],presets:[{id:'default',name:'Default',items:{body:'base',head:'hat'},variants:{}}]}};
}
export function bodyOnly(p:Project):Project{
  const manifest=structuredClone(p.manifest);manifest.items=manifest.items.filter(it=>it.slot==='body');manifest.materials=manifest.materials.filter(m=>m.owner===manifest.rig.baseItem);manifest.presets=[{id:'target',name:'Target',items:{body:manifest.rig.baseItem},variants:{}}];
  return{manifest,images:new Map(p.images)};
}
