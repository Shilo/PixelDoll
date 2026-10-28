import type { Img } from '../../../app/src/lib/image/png.ts';
const edges=[['NOSE','NECK'],['NECK','RIGHT SHOULDER'],['RIGHT SHOULDER','RIGHT ELBOW'],['RIGHT ELBOW','RIGHT ARM'],['NECK','LEFT SHOULDER'],['LEFT SHOULDER','LEFT ELBOW'],['LEFT ELBOW','LEFT ARM'],['NECK','RIGHT HIP'],['RIGHT HIP','RIGHT KNEE'],['RIGHT KNEE','RIGHT LEG'],['NECK','LEFT HIP'],['LEFT HIP','LEFT KNEE'],['LEFT KNEE','LEFT LEG']];
export function sheet(images:Img[],poses?:any[][],markers=false):Img{
  const scale=3,w=images[0].w*scale,h=images[0].h*scale,width=w*images.length;
  const data=new Uint8ClampedArray(width*h*4);
  for(const [i,im]of images.entries())for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const a=(Math.floor(y/scale)*im.w+Math.floor(x/scale))*4,b=(y*width+i*w+x)*4,alpha=im.data[a+3]/255;
    const bg=((Math.floor(x/12)+Math.floor(y/12))%2)*5+34;
    for(let k=0;k<3;k++)data[b+k]=Math.round(im.data[a+k]*alpha+bg*(1-alpha));data[b+3]=255;
  }
  const dot=(x:number,y:number,c:number[])=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=width||y>=h)return;const p=(y*width+x)*4;data.set([...c,255],p);};
  poses?.forEach((pose,i)=>{
    const kp=Object.fromEntries(pose.map(k=>[k.label,k]));
    for(const [a,b]of edges){const p=kp[a],q=kp[b],n=Math.ceil(Math.hypot(p.x-q.x,p.y-q.y)*Math.max(w,h));
      const c=(a+b).includes('RIGHT')?[255,80,80]:(a+b).includes('LEFT')?[60,180,255]:[255,240,100];
      for(let t=0;t<=n;t++)dot(i*w+(p.x+(q.x-p.x)*t/Math.max(1,n))*w,(p.y+(q.y-p.y)*t/Math.max(1,n))*h,c);
    }
    if(markers)for(const p of pose){const c=p.label.startsWith('RIGHT')?[255,80,80]:p.label.startsWith('LEFT')?[60,180,255]:[255,240,100],x=i*w+p.x*w,y=p.y*h;for(const [dx,dy]of [[0,0],[-1,0],[1,0],[0,-1],[0,1]])dot(x+dx,y+dy,c);}
  });return{w:width,h,data};
}
