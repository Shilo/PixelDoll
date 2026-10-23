export const vectors={south:[0,-1],east:[1,0],north:[0,1],west:[-1,0],southeast:[Math.SQRT1_2,-Math.SQRT1_2],northeast:[Math.SQRT1_2,Math.SQRT1_2],southwest:[-Math.SQRT1_2,-Math.SQRT1_2],northwest:[-Math.SQRT1_2,Math.SQRT1_2]};
export const order=Object.keys(vectors);
export function unit(x,y){const n=Math.hypot(x,y);return Number.isFinite(n)&&n>0?[x/n,y/n]:[0,0];}
export function nearest(dirs,u,previous,defaultDir='south'){
  const valid=order.filter(d=>dirs.includes(d));if(!valid.length)return null;
  const scores=valid.map(d=>vectors[d][0]*u[0]+vectors[d][1]*u[1]),best=Math.max(...scores);
  const ties=valid.filter((_,i)=>best-scores[i]<1e-8);
  return [previous,defaultDir,...order].find(d=>ties.includes(d));
}
export function resolveMotion({velocity,dirs,available,previous='south',still={}}){
  const u=unit(...velocity),moving=!!(u[0]||u[1]),request=moving?'walk':'idle';
  const intended=moving?nearest(dirs,u,previous,dirs.includes('south')?'south':'east'):(dirs.includes(previous)?previous:nearest(dirs,vectors[previous]??[0,-1],previous));
  const facing=vectors[intended]??[0,-1],desired=moving?u:facing;
  const eligible=d=>vectors[d]&&vectors[d][0]*facing[0]+vectors[d][1]*facing[1]>=-1e-8;
  for(const clip of moving?['walk','idle']:['idle']){
    const usable=(available[clip]??[]).filter(d=>dirs.includes(d)&&eligible(d));
    const dir=usable.includes(intended)?intended:nearest(usable,desired,previous);
    if(dir)return {moving,request,intended,clip,dir,still:false,issue:clip!==request||dir!==intended?`${request}:${(available[request]??[]).length?intended:'all'}`:null};
  }
  const keys=Object.keys(still),declared=keys.filter(d=>dirs.includes(d));
  const dir=nearest(declared.length?declared:keys,desired,previous);
  return {moving,request,intended,clip:dir?still[dir].clip:null,dir,cell:dir?still[dir].cell:0,still:true,issue:`${request}:${(available[request]??[]).length?intended:'all'}`};
}
export function frameAt(frames,elapsed){const total=frames.reduce((s,f)=>s+f.ms,0);if(!(total>0))return 0;let t=((elapsed%total)+total)%total;for(const f of frames){if(t<f.ms)return f.cell;t-=f.ms;}return frames[0]?.cell??0;}
export function advance(position,camera,velocity,dt,speed,response){const step=Math.max(0,Math.min(dt,.05));position.x+=velocity[0]*speed*step;position.y+=velocity[1]*speed*step;const a=1-Math.exp(-response*step);camera.x+=(position.x-camera.x)*a;camera.y+=(position.y-camera.y)*a;}
