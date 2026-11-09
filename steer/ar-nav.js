/* Steer 창문 나침반 AR 길 — 웹앱 AR 길안내(video/app-flows/app-latest .arsvg)와 같은 모양을 모든 방위로
 *   길 : 바닥 평면(X 오른쪽·Z 앞쪽 m, 카메라 높이 HC)에서 발밑 → 장소 방향 a(화면 정면 0°, 오른쪽 +)로 휘는 3차 베지어, 원근으로 화면에 투영
 *   그림 : ① 흐린 하늘색 그라디언트 길(가까운 쪽 약한 흐림 · 먼 쪽 강한 흐림, set() 때 한 번만)
 *          ③ 지평선으로 빨려 드는 빛 원 3개 ④ 웹앱 날개 화살표(웹앱 path 그대로) 5개 — 화면 공간에 납작하게, 길 폭의 0.62, 길 방향으로 살짝만 기울임
 *   캔버스 하나(0.6배 해상도)에 매 프레임 ③④만 다시 그림. SVG 필터 안 씀(끊김 원인이었음)
 *   ±75°보다 뒤쪽이면 옆으로 크게 꺾여 화면 밖으로, behind=true
 * 사용 : const A=ARNAV.mount(canvasEl,{W:1440,H:2560}); A.set({a,hz,col}); A.start(); A.stop(); A.end() → 길 끝 화면 좌표
 */
(function(){
  // 웹앱 날개 화살표 path (412×891 화면 기준, 가운데 약 370,781 · 폭 178)
  const WING='M316.159 763.42C332.831 750.782 340.632 744.877 355.128 746.176C369.764 747.493 381.04 755.221 405.671 772.091L424.238 784.799C447.202 800.534 459.592 809.021 455.082 812.109C453.862 812.947 451.984 813.548 449.624 813.862C440.779 815.04 420.991 808.611 383.619 796.452C375.696 793.871 371.782 792.597 367.737 792.021C366.57 791.856 365.403 791.734 364.253 791.655C360.296 791.393 356.847 791.891 349.898 792.885C318.045 797.455 301.768 799.793 292.783 796.766C290.396 795.964 288.351 794.978 286.824 793.897C281.2 789.919 289.053 783.971 303.891 772.719L316.159 763.42Z';
  const WC=[370,781],WW=178;
  // 캔버스 흐림(filter) 지원 : 값만 되돌려 주고 실제로는 안 흐리는 브라우저(사파리 일부)가 있어 그려 보고 판단
  let FOK=null;const FILT=()=>{if(FOK!==null)return FOK;try{const c=document.createElement('canvas');c.width=c.height=20;const x=c.getContext('2d');x.filter='blur(3px)';x.fillStyle='#000';x.fillRect(9,9,2,2);FOK=x.getImageData(4,10,1,1).data[3]>0;}catch(e){FOK=false;}return FOK;};
  function mount(cv,o){const W=o.W||1440,H=o.H||2560,R_=o.res||.75;cv.width=Math.round(W*R_);cv.height=Math.round(H*R_);const g=cv.getContext('2d');
    const wing=new Path2D(WING),base=document.createElement('canvas');base.width=cv.width;base.height=cv.height;const bg_=base.getContext('2d');
    const FQ=.5,fxc=document.createElement('canvas');fxc.width=Math.round(cv.width*FQ);fxc.height=Math.round(cv.height*FQ);   // 빛 원·흐름은 부드러워서 반 해상도로(사파리 프레임 부담 줄임)
   const fx=fxc.getContext('2d');
    const S={a:0,hz:1150,HC:1.4,col:'#87E6FF',raf:0,t0:0,on:false,end:[W/2,1150],behind:false,jt:0,ready:0};
    let P=[],band=null,bandW=[],samp=[],FD=[],FL=1;
    // 길 따라 거리 d(m) 지점의 좌·우 가장자리 화면 좌표
    const flr=d=>{d=Math.max(0,Math.min(FL,d));let i=1;while(i<FD.length-1&&FD[i]<d)i++;const t=((i-1)+(d-FD[i-1])/Math.max(1e-6,FD[i]-FD[i-1]))/(FD.length-1),[x,z]=bez(t),[tx,tz]=tan(t),B=S.bw||.62;return [proj(x-tz*B,z+tx*B),proj(x+tz*B,z-tx*B)];};
    const f_=()=>(H-S.hz)*1.05/S.HC,proj=(X,Z)=>{const z=Math.max(.35,Z);return [W/2+f_()*X/z,S.hz+f_()*S.HC/z];};
    const bez=t=>{const u=1-t,[p0,p1,p2,p3]=P;return [u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]];};
    const tan=t=>{const a=bez(Math.max(0,t-.005)),b=bez(Math.min(1,t+.005)),dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;return [dx/l,dz/l];};
    const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
    function mx(c,k){return c.map(v=>Math.round(255+(v-255)*(.35+.65*k))).join(',');}
    function build(){let a=Math.max(-170,Math.min(170,S.a));S.behind=Math.abs(a)>75;const ac=Math.max(-78,Math.min(78,a))*Math.PI/180,s=Math.sin(ac),c=Math.cos(ac),sk=Math.max(0,Math.min(1,(Math.abs(a)-50)/60)),R=S.behind?26-8*sk:42,z0=.75;
      P=[[0,z0],[0,5],[s*9,c*9+2],[s*R,c*R]];S.bw=.62-.2*sk;
      const N=80,BW=S.bw,L=[],Rr=[];samp=[];bandW=[];
      for(let i=0;i<=N;i++){const t=i/N,[x,z]=bez(t),[tx,tz]=tan(t),l=proj(x-tz*BW,z+tx*BW),r=proj(x+tz*BW,z-tx*BW);L.push(l);Rr.push(r);samp.push([(l[0]+r[0])/2,(l[1]+r[1])/2]);bandW.push(Math.hypot(r[0]-l[0],r[1]-l[1]));}
      FD=[0];for(let i=1;i<=N;i++){const a_=bez((i-1)/N),b_=bez(i/N);FD.push(FD[i-1]+Math.hypot(b_[0]-a_[0],b_[1]-a_[1]));}FL=FD[N];
      band=new Path2D();band.moveTo(L[0][0],L[0][1]);L.forEach(p=>band.lineTo(p[0],p[1]));for(let i=Rr.length-1;i>=0;i--)band.lineTo(Rr[i][0],Rr[i][1]);band.closePath();
      S.end=samp[N];
      // 고정 그림 : 흐린 길 + 선명한 길 (한 번만)
      const C=rgb(S.col),mk=ctx=>{const e=S.end,s0=samp[0],gr=ctx.createLinearGradient(e[0],e[1],s0[0],s0[1]);
        gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.26,`rgba(${mx(C,.25)},.36)`);gr.addColorStop(.52,`rgba(${mx(C,.5)},.55)`);gr.addColorStop(1,`rgba(${C},.78)`);return gr;};
      // 가장자리 흐림 : 가까운 쪽은 약하게(12px), 먼 쪽은 강하게(56px) — 두 장을 화면 높이 그라디언트로 섞음. 선명한 길은 따로 안 그림(외곽선이 딱 떨어져 보였음)
      const BL=document.createElement('canvas');BL.width=base.width;BL.height=base.height;const bl=BL.getContext('2d');bl.setTransform(R_,0,0,R_,0,0);bl.fillStyle=mk(bl);bl.fill(band);
      // 흐림은 브라우저 필터에 맡기지 않고 직접 계산(가우시안에 가까운 상자 흐림 3번, 반 해상도, 미리 곱한 알파) — 사파리는 캔버스 filter가 없거나 불완전해서
      // 작게 줄였다 키우는 대체 방식이 쓰였는데, 그게 가장자리를 계단처럼 깨지게 했음. 어느 브라우저든 같은 결과
      const blurG=function*(px,out){const w=Math.ceil(base.width/2),h=Math.ceil(base.height/2),c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});
        x.drawImage(BL,0,0,w,h);const im=x.getImageData(0,0,w,h),d=im.data,n=w*h,A=[new Float32Array(n),new Float32Array(n),new Float32Array(n),new Float32Array(n)],tmp=new Float32Array(Math.max(w,h));
        for(let i=0;i<n;i++){const a=d[i*4+3]/255;A[3][i]=a;A[0][i]=d[i*4]*a;A[1][i]=d[i*4+1]*a;A[2][i]=d[i*4+2]*a;}yield;
        const r=Math.max(1,Math.round(px*R_/2/1.73));   // 상자 3번 ≈ 시그마 px
        const pass=(ch,len,cnt,stride,step)=>{for(let l=0;l<cnt;l++){const o=l*stride;let acc=0;for(let k=-r;k<=r;k++)acc+=ch[o+Math.min(len-1,Math.max(0,k))*step];
          for(let k=0;k<len;k++){tmp[k]=acc/(2*r+1);acc+=ch[o+Math.min(len-1,k+r+1)*step]-ch[o+Math.max(0,k-r)*step];}for(let k=0;k<len;k++)ch[o+k*step]=tmp[k];}};
        for(const ch of A)for(let t=0;t<3;t++){pass(ch,w,h,w,1);yield;pass(ch,h,w,1,w);yield;}
        for(let i=0;i<n;i++){const a=A[3][i];d[i*4+3]=Math.round(a*255);if(a>1e-4){d[i*4]=A[0][i]/a;d[i*4+1]=A[1][i]/a;d[i*4+2]=A[2][i]/a;}}
        x.putImageData(im,0,0);const o=document.createElement('canvas');o.width=base.width;o.height=base.height;const ox=o.getContext('2d');ox.imageSmoothingEnabled=true;ox.imageSmoothingQuality='high';ox.drawImage(c,0,0,o.width,o.height);out.c=o;};
      const yN=H*R_,yF=(S.hz+40)*R_,mask=(c,inv)=>{const x=c.getContext('2d'),m=x.createLinearGradient(0,yN,0,yF);m.addColorStop(0,inv?'rgba(0,0,0,0)':'#000');m.addColorStop(.55,inv?'rgba(0,0,0,.55)':'rgba(0,0,0,.45)');m.addColorStop(1,inv?'#000':'rgba(0,0,0,0)');
        x.globalCompositeOperation='destination-in';x.fillStyle=m;x.fillRect(0,0,c.width,c.height);x.globalCompositeOperation='source-over';};
      // 흐림 계산(~0.1–0.2초)을 한 번에 하면 AR이 열리는 순간 화면이 멈칫해서, 프레임마다 6ms씩 나눠 계산하고 다 되면 길이 서서히 나타남
      const job=(function*(){const nr={},fr={};yield* blurG(12,nr);yield* blurG(56,fr);const near=nr.c,far=fr.c;
        mask(near,false);mask(far,true);bg_.setTransform(1,0,0,1,0,0);bg_.clearRect(0,0,base.width,base.height);bg_.drawImage(far,0,0);bg_.drawImage(near,0,0);bg_.drawImage(far,0,0);bg_.globalAlpha=1;if(!S.ready)S.ready=performance.now();})();
      const tok=++S.jt;const step=()=>{if(tok!==S.jt)return;const t=performance.now();let r;do{r=job.next();}while(!r.done&&performance.now()-t<6);if(!r.done)requestAnimationFrame(step);};requestAnimationFrame(step);}
    function frame(now){if(!S.on)return;const T=(now-S.t0)/1000;g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,cv.width,cv.height);const RA=S.ready?Math.min(1,(now-S.ready)/450):0;g.globalAlpha=RA;g.drawImage(base,0,0);g.setTransform(R_,0,0,R_,0,0);
      // 빛 원 + 빛 흐름은 효과 캔버스에 그린 뒤 흐린 길 모양으로 잘라 얹음(딱 떨어지는 경계 없음)
      fx.setTransform(1,0,0,1,0,0);fx.globalCompositeOperation='source-over';fx.clearRect(0,0,fxc.width,fxc.height);fx.setTransform(R_*FQ,0,0,R_*FQ,0,0);
      const e=S.end;fx.strokeStyle='#fff';
      // 빛 원 : 6.3초에 걸쳐 크게 → 길 끝으로 작아지며 빨려 듦(2.1초 간격)
      for(let i=0;i<3;i++){const k=((T+i*2.1)%6.3)/6.3,ee=1-Math.pow(1-k,2.2),r=1750*(1-ee)+84,lw=154*(1-ee)+14,op=k<.15?k/.15*.18:k<.7?.18-(k-.15)/.55*.06:.12*(1-(k-.7)/.3);
        for(const [m,al] of [[2.6,.22],[1.6,.4],[1,.6]]){fx.globalAlpha=Math.min(1,op*al*1.5);fx.lineWidth=lw*m;fx.beginPath();fx.arc(e[0],e[1],r,0,Math.PI*2);fx.stroke();}}
      fx.globalAlpha=1;
      // 빛 흐름(웹앱 arFlow) : 바닥 2.4m 간격, 1.6초에 한 칸씩 지평선으로. 줄무늬마다 길 방향으로 길쭉한 부드러운 빛 덩어리(가운데 밝고 사방으로 0), 멀수록 옅게
      {const SP=2.4,W_=1.2,ph=(T/1.6)%1;for(let d=SP*(1-ph)-SP;d<FL;d+=SP){const fade=Math.max(0,1-d/FL*1.2)*Math.min(1,Math.max(0,d)/2.2);if(fade<.02)continue;
        const a_=flr(d-W_),b_=flr(d+W_),ma=[(a_[0][0]+a_[1][0])/2,(a_[0][1]+a_[1][1])/2],mb=[(b_[0][0]+b_[1][0])/2,(b_[0][1]+b_[1][1])/2],c_=flr(d),
          wd=Math.hypot(c_[1][0]-c_[0][0],c_[1][1]-c_[0][1])*.62,ln=Math.max(4,Math.hypot(mb[0]-ma[0],mb[1]-ma[1])/2),an=Math.atan2(mb[1]-ma[1],mb[0]-ma[0]);
        fx.save();fx.translate((ma[0]+mb[0])/2,(ma[1]+mb[1])/2);fx.rotate(an);fx.scale(ln,wd);const rg=fx.createRadialGradient(0,0,0,0,0,1);
        rg.addColorStop(0,`rgba(255,255,255,${(.62*fade).toFixed(3)})`);rg.addColorStop(.55,`rgba(255,255,255,${(.26*fade).toFixed(3)})`);rg.addColorStop(1,'rgba(255,255,255,0)');
        fx.fillStyle=rg;fx.beginPath();fx.arc(0,0,1,0,Math.PI*2);fx.fill();fx.restore();}}
      fx.setTransform(1,0,0,1,0,0);fx.globalCompositeOperation='destination-in';fx.drawImage(base,0,0,fxc.width,fxc.height);fx.globalCompositeOperation='source-over';
      g.setTransform(1,0,0,1,0,0);g.drawImage(fxc,0,0,cv.width,cv.height);g.setTransform(R_,0,0,R_,0,0);g.globalAlpha=1;
      // 날개 5개 : 9초에 발밑 → 지평선(1.8초 간격). 웹앱처럼 화면에 납작하게, 앞쪽 18%에서 나타나 멀어지며 옅어짐
      g.fillStyle='#fff';const N=samp.length-1;
      for(let i=0;i<5;i++){const k=((T/9)+i/5)%1,t=.05+k*.85,j=Math.min(N-1,Math.floor(t*N)),fr=t*N-j,x=samp[j][0]+(samp[j+1][0]-samp[j][0])*fr,y=samp[j][1]+(samp[j+1][1]-samp[j][1])*fr;
        const bw=bandW[j]+(bandW[j+1]-bandW[j])*fr,dx=samp[j+1][0]-samp[j][0],dy=samp[j+1][1]-samp[j][1],ang=Math.atan2(dx,-dy),sc=bw*.62/WW,fl=dx>0?-1:1;
        const op=k<.18?k/.18*.95:.95*(1-Math.pow((k-.18)/.82,1.4));if(op<.01||sc<.02)continue;
        g.save();g.translate(x,y);g.rotate(Math.max(-.5,Math.min(.5,ang*.4)));g.scale(sc*fl,sc);g.translate(-WC[0],-WC[1]);g.globalAlpha=op*RA;g.fill(wing);g.restore();}
      g.globalAlpha=1;S.raf=requestAnimationFrame(frame);}
    // set : 멈춘 상태에서 새로 하면(시뮬레이터가 새 장소로 열 때) 이전 길을 지우고 처음부터, 도는 중이면(폰에서 방향이 바뀔 때) 새 길이 될 때까지 이전 길 유지
    return {set(o_){if(!S.on){S.ready=0;bg_.setTransform(1,0,0,1,0,0);bg_.clearRect(0,0,base.width,base.height);}Object.assign(S,o_);build();return S;},start(){if(S.on)return;S.on=true;S.t0=performance.now();S.raf=requestAnimationFrame(frame);},stop(){S.on=false;cancelAnimationFrame(S.raf);},
      end:()=>S.end,behind:()=>S.behind,state:S};}
  window.ARNAV={mount};
})();
