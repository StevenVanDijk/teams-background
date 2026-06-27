const $=id=>document.getElementById(id);
const imgC=$('img'), ovl=$('ovl');
const ictx=imgC.getContext('2d',{willReadFrequently:true});
const octx=ovl.getContext('2d');

let W=0,H=0,px=null;
let mode='';
let cal=null;
let calClicks=[];
let hexes=[];
let ncal=null;
let ncalClicks=[];
let edgeColor=null;
let nodes=[];
let edges=[];
let edgeSel=-1;
let showFill=false;
let showNetwork=true;
let sampleOx=0, sampleOy=0;

// sliders
$('thr').addEventListener('input',()=>{ $('thrVal').textContent=$('thr').value; });
$('spc').addEventListener('input',()=>{ $('spcVal').textContent=$('spc').value; redraw(); });
$('tol').addEventListener('input',()=>{ $('tolVal').textContent=$('tol').value; });
$('sox').addEventListener('input',()=>{ sampleOx=+$('sox').value; $('soxVal').textContent=sampleOx; redraw(); });
$('soy').addEventListener('input',()=>{ sampleOy=+$('soy').value; $('soyVal').textContent=sampleOy; redraw(); });

// image load
function loadImg(file){
  say('Reading file...');
  const reader=new FileReader();
  reader.onerror=()=>say('Error reading file.');
  reader.onload=function(e){
    const img=new Image();
    img.onerror=()=>say('Error decoding image.');
    img.onload=function(){
      W=img.width; H=img.height;
      imgC.width=ovl.width=W;
      imgC.height=ovl.height=H;
      ictx.drawImage(img,0,0);
      try{ px=ictx.getImageData(0,0,W,H).data; }
      catch(e){ say('Canvas security error.'); return; }
      setZoom();
      redraw();
      if(cal) $('bScan').disabled=false;
      $('bCompare').disabled=false;
      $('bSolve').disabled=false;
      say('Image '+W+'x'+H+' loaded.'+(cal?' Grid ready.':' Click "Calibrate tiles".'));
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}
$('fi').addEventListener('change',function(e){ if(e.target.files[0]) loadImg(e.target.files[0]); });
document.addEventListener('paste',function(e){
  var items=e.clipboardData?e.clipboardData.items:[];
  for(var i=0;i<items.length;i++){
    if(items[i].type.startsWith('image/')){ loadImg(items[i].getAsFile()); break; }
  }
});
document.addEventListener('dragover',function(e){ e.preventDefault(); });
document.addEventListener('drop',function(e){
  e.preventDefault();
  if(e.dataTransfer.files[0]) loadImg(e.dataTransfer.files[0]);
});

// zoom
var currentZ=0.4; // matches zoom slider default value="40"
function setZoom(){
  var view=$('view');
  var z=$('zoom').value/100;
  var oldZ=currentZ;
  var cx=(view.scrollLeft+view.clientWidth/2)/oldZ;
  var cy=(view.scrollTop+view.clientHeight/2)/oldZ;
  currentZ=z;
  var dw=Math.round(W*z), dh=Math.round(H*z);
  imgC.style.width=dw+'px'; imgC.style.height=dh+'px';
  ovl.style.width=dw+'px'; ovl.style.height=dh+'px';
  $('stack').style.width=dw+'px'; $('stack').style.height=dh+'px';
  view.scrollLeft=cx*z-view.clientWidth/2;
  view.scrollTop=cy*z-view.clientHeight/2;
}
$('zoom').addEventListener('input',setZoom);

function say(s){ $('status').textContent=s; }
function spacing(){ return +$('spc').value/100; }

// pixel helpers
function samplePx(x,y,rad){
  rad=rad||3;
  var r=0,g=0,b=0,n=0;
  for(var dy=-rad;dy<=rad;dy++){
    for(var dx=-rad;dx<=rad;dx++){
      var X=Math.round(x+dx), Y=Math.round(y+dy);
      if(X<0||Y<0||X>=W||Y>=H) continue;
      var i=(Y*W+X)*4;
      r+=px[i]; g+=px[i+1]; b+=px[i+2]; n++;
    }
  }
  return n?[r/n,g/n,b/n]:[0,0,0];
}
function getPx(x,y){
  var X=Math.round(x), Y=Math.round(y);
  if(X<0||Y<0||X>=W||Y>=H) return [0,0,0];
  var i=(Y*W+X)*4;
  return [px[i],px[i+1],px[i+2]];
}
function devFromWhite(c){ return Math.max(255-c[0],255-c[1],255-c[2]); }
function colorDist(a,b){ return Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[2]-b[2])); }

// tile lattice
function latToPix(q,r){
  var sp=spacing(), R=cal.R;
  var lx=q*R*1.5*sp;
  var ly=q*R*Math.sqrt(3)/2*sp + r*R*Math.sqrt(3)*sp;
  return [cal.ox+lx, cal.oy+ly];
}
function pixToLat(x,y){
  var sp=spacing(), R=cal.R;
  var dx=x-cal.ox, dy=y-cal.oy;
  var q=dx/(R*1.5*sp);
  var r=(dy - q*R*Math.sqrt(3)/2*sp)/(R*Math.sqrt(3)*sp);
  return [Math.round(q), Math.round(r)];
}

// network vertex grid
function netVertices(){
  if(!ncal) return [];
  var ox=ncal.ox, oy=ncal.oy, R=ncal.R;
  var S3=Math.sqrt(3);
  var span=Math.ceil(Math.max(W,H)/R)+2;
  var vmap={};
  for(var Q=-span;Q<=span;Q++){
    for(var Rv=-span;Rv<=span;Rv++){
      var cx=ox+Q*R*1.5;
      var cy=oy+Q*R*S3/2+Rv*R*S3;
      for(var k=0;k<6;k++){
        var a=Math.PI/3*k;
        var vx=cx+R*Math.cos(a);
        var vy=cy+R*Math.sin(a);
        if(vx<-R||vy<-R||vx>W+R||vy>H+R) continue;
        var key=Math.round(vx)+','+Math.round(vy);
        if(!vmap[key]) vmap[key]=[vx,vy];
      }
    }
  }
  return Object.values(vmap);
}

function snapToNet(x,y){
  if(!ncal) return [x,y];
  var ox=ncal.ox, oy=ncal.oy, R=ncal.R;
  var S3=Math.sqrt(3);
  var dx=x-ox, dy=y-oy;
  var q=dx/(R*1.5);
  var r=(dy-q*R*S3/2)/(R*S3);
  var best=null, bd=1e9;
  for(var dq=-1;dq<=1;dq++){
    for(var dr=-1;dr<=1;dr++){
      var Q=Math.round(q)+dq, R2=Math.round(r)+dr;
      var cx=ox+Q*R*1.5;
      var cy=oy+Q*R*S3/2+R2*R*S3;
      for(var k=0;k<6;k++){
        var a=Math.PI/3*k;
        var vx=cx+R*Math.cos(a);
        var vy=cy+R*Math.sin(a);
        var d=Math.hypot(vx-x,vy-y);
        if(d<bd){ bd=d; best=[vx,vy]; }
      }
    }
  }
  return best||[x,y];
}

// overlay
function hexPath(x,y,R,rot){
  octx.beginPath();
  for(var i=0;i<6;i++){
    var a=Math.PI/3*i+rot;
    if(i===0) octx.moveTo(x+R*Math.cos(a),y+R*Math.sin(a));
    else octx.lineTo(x+R*Math.cos(a),y+R*Math.sin(a));
  }
  octx.closePath();
}

function redraw(){
  octx.clearRect(0,0,W,H);
  if(!cal) return;
  var lw=Math.max(1.5,W/700);

  for(var hi=0;hi<hexes.length;hi++){
    var h=hexes[hi];
    var pos=latToPix(h.q,h.r);
    var x=pos[0], y=pos[1];
    hexPath(x,y,cal.R,0);
    var sx=x+(h.sox!==undefined?h.sox:sampleOx);
    var sy=y+(h.soy!==undefined?h.soy:sampleOy);
    if(showFill){
      var sc=samplePx(sx,sy,3);
      octx.fillStyle='rgb('+Math.round(sc[0])+','+Math.round(sc[1])+','+Math.round(sc[2])+')';
      octx.fill();
    }
    octx.strokeStyle='rgba(0,220,100,.7)';
    octx.lineWidth=lw;
    octx.stroke();
    if(showFill){
      octx.beginPath();
      octx.arc(sx,sy,Math.max(2,cal.R*0.06),0,Math.PI*2);
      octx.fillStyle=h.sox!==undefined?'rgba(255,200,0,0.9)':'rgba(255,255,255,0.85)';
      octx.fill();
    }
  }

  if(showNetwork){
    if(ncal){
      var verts=netVertices();
      octx.fillStyle='rgba(100,180,255,.4)';
      for(var vi=0;vi<verts.length;vi++){
        octx.beginPath();
        octx.arc(verts[vi][0],verts[vi][1],2,0,Math.PI*2);
        octx.fill();
      }
    }

    octx.strokeStyle='rgba(255,215,0,.9)';
    octx.lineWidth=lw*2;
    for(var ei=0;ei<edges.length;ei++){
      var e=edges[ei];
      octx.beginPath();
      octx.moveTo(nodes[e[0]].x,nodes[e[0]].y);
      octx.lineTo(nodes[e[1]].x,nodes[e[1]].y);
      octx.stroke();
    }

    var nr=Math.max(4,(ncal?ncal.R:cal.R)*0.12);
    for(var ni=0;ni<nodes.length;ni++){
      var n=nodes[ni];
      octx.beginPath();
      octx.arc(n.x,n.y,nr,0,Math.PI*2);
      if(n.filled){
        octx.fillStyle=ni===edgeSel?'#fff':'rgba(255,215,0,.95)';
        octx.fill();
      } else {
        octx.fillStyle='#1a1a22';
        octx.fill();
        octx.strokeStyle=ni===edgeSel?'#fff':'rgba(255,215,0,.95)';
        octx.lineWidth=lw*1.5;
        octx.stroke();
      }
    }
  }
}

// mode
function setMode(m){
  mode=m;
  var modeButtons=['bCal','bEdit','bNcal','bEye','bNode','bEdge','bSample','bCompare','bSolve'];
  for(var i=0;i<modeButtons.length;i++){
    var el=$(modeButtons[i]);
    el.classList.toggle('on', el.dataset.m===m);
  }
}
$('bCal').dataset.m='cal';
$('bEdit').dataset.m='edit';
$('bNcal').dataset.m='ncal';
$('bEye').dataset.m='eye';
$('bNode').dataset.m='node';
$('bEdge').dataset.m='edge';
$('bSample').dataset.m='sample';
$('bCompare').dataset.m='compare';
$('bSolve').dataset.m='solve';

$('bCal').onclick=function(){ calClicks=[]; setMode('cal'); say('Click CENTER of a tile hexagon.'); };
$('bEdit').onclick=function(){ setMode('edit'); say('Click lattice site to toggle hex on/off.'); };
$('bNcal').onclick=function(){ ncalClicks=[]; setMode('ncal'); say('Click a known NETWORK VERTEX, then an adjacent network vertex.'); };
$('bEye').onclick=function(){ setMode('eye'); say('Click on an edge stripe in the image to sample its color.'); };
$('bNode').onclick=function(){ setMode('node'); say('Click to place/delete a node (snaps to network vertex).'); };
$('bEdge').onclick=function(){ setMode('edge'); edgeSel=-1; say('Click two nodes to connect/disconnect.'); };
$('bSample').onclick=function(){ setMode('sample'); say('Click inside a hex to set its sample point. Right-click to reset.'); };

var solvePts=[];
$('bSolve').onclick=function(){
  solvePts=[];
  $('swatch2').style.display='none';
  setMode('solve');
  say('(1/3) Click inside a region covered by ONLY hex A.');
};

var comparePts=[];
$('bCompare').onclick=function(){
  comparePts=[];
  $('swatch2').style.display='none';
  setMode('compare');
  say('Click the first point to sample.');
};

$('bFill').onclick=function(){
  showFill=!showFill;
  $('bFill').textContent='Fill: '+(showFill?'ON':'OFF');
  $('bFill').classList.toggle('on',showFill);
  redraw();
};
$('bNet').onclick=function(){
  showNetwork=!showNetwork;
  $('bNet').textContent='Network: '+(showNetwork?'ON':'OFF');
  $('bNet').classList.toggle('on',showNetwork);
  redraw();
};

// scan
$('bScan').onclick=function(){
  var thr=+$('thr').value;
  hexes=[];
  var span=Math.ceil(Math.max(W,H)/cal.R)+2;
  for(var q=-span;q<=span;q++){
    for(var r=-span;r<=span;r++){
      var pos=latToPix(q,r);
      var x=pos[0], y=pos[1];
      if(x<-cal.R||y<-cal.R||x>W+cal.R||y>H+cal.R) continue;
      var c=samplePx(x,y,4);
      var d=devFromWhite(c);
      if(d>thr){
        var alpha=Math.min(1,d/255);
        var base=c.map(function(v){ return Math.round(Math.max(0,Math.min(255,(v-255*(1-alpha))/alpha))); });
        if(Math.max(base[0],base[1],base[2])<20) continue;
        hexes.push({q:q,r:r,color:base,alpha:+alpha.toFixed(3)});
      }
    }
  }
  redraw();
  $('bEdit').disabled=false;
  $('bFill').disabled=false;
  $('bNcal').disabled=false;
  $('bExp').disabled=false;
  $('bSample').disabled=false;
  say('Found '+hexes.length+' hex sites. Use Edit to fix, then calibrate network.');
};

// shared edge scan
function runEdgeScan(debugMode){
  if(!edgeColor){ say('Sample an edge color first (Eyedropper).'); return; }
  if(!ncal){ say('Calibrate the network grid first.'); return; }
  var tol=+$('tol').value;
  var R=ncal.R;
  var S3=Math.sqrt(3);
  var dirs=[[1,0],[0.5,S3/2],[-0.5,S3/2]];
  var steps=Math.max(8,Math.round(R/2));
  var verts=netVertices();

  if(debugMode) redraw();

  var checked=0,hitCount=0,flankFail=0,snapFail=0,newEdges=0,newNodes=0;

  function matchesEdge(c){ return colorDist(c,edgeColor)<=tol; }

  function getOrAddNode(x,y){
    var EPS=R*0.15;
    for(var i=0;i<nodes.length;i++){
      if(Math.hypot(nodes[i].x-x,nodes[i].y-y)<EPS) return i;
    }
    var c=samplePx(x,y,2);
    nodes.push({x:+x.toFixed(1),y:+y.toFixed(1),filled:devFromWhite(c)>60,color:c.map(Math.round)});
    newNodes++;
    return nodes.length-1;
  }

  function edgeExists(a,b){
    for(var i=0;i<edges.length;i++){
      if((edges[i][0]===a&&edges[i][1]===b)||(edges[i][0]===b&&edges[i][1]===a)) return true;
    }
    return false;
  }

  for(var vi=0;vi<verts.length;vi++){
    var vx=verts[vi][0], vy=verts[vi][1];
    for(var di=0;di<dirs.length;di++){
      var dx=dirs[di][0], dy=dirs[di][1];
      var ex=vx+dx*R, ey=vy+dy*R;
      var snap=snapToNet(ex,ey);
      var sx=snap[0], sy=snap[1];
      if(Math.hypot(sx-ex,sy-ey)>R*0.15){ snapFail++; continue; }
      checked++;

      var hits=0;
      var samples=[];
      for(var t=1;t<steps;t++){
        var f=t/steps;
        var c=getPx(vx+dx*R*f, vy+dy*R*f);
        samples.push(c);
        if(matchesEdge(c)) hits++;
      }
      var ratio=hits/(steps-1);

      var perpX=-dy, perpY=dx;
      var midX=vx+dx*R*0.5, midY=vy+dy*R*0.5;
      var flankDist=Math.max(3,R*0.08);
      var f1=getPx(midX+perpX*flankDist, midY+perpY*flankDist);
      var f2=getPx(midX-perpX*flankDist, midY-perpY*flankDist);
      var bothFlankMatch=matchesEdge(f1)&&matchesEdge(f2);
      var passes=ratio>=0.4&&!bothFlankMatch;

      if(debugMode){
        var color;
        if(passes){ color='rgba(0,255,80,0.9)'; hitCount++; }
        else if(ratio>=0.4&&bothFlankMatch){ color='rgba(255,220,0,0.9)'; flankFail++; }
        else if(ratio>=0.1){ color='rgba(255,60,60,0.7)'; }
        else{ color='rgba(120,120,120,0.3)'; }
        octx.strokeStyle=color;
        octx.lineWidth=Math.max(2,R*0.08);
        octx.beginPath();
        octx.moveTo(vx,vy);
        octx.lineTo(sx,sy);
        octx.stroke();
        var avg=[0,0,0];
        for(var si=0;si<samples.length;si++){
          avg[0]+=samples[si][0]; avg[1]+=samples[si][1]; avg[2]+=samples[si][2];
        }
        avg=avg.map(function(v){ return Math.round(v/samples.length); });
        octx.beginPath();
        octx.arc(midX,midY,Math.max(2,R*0.06),0,Math.PI*2);
        octx.fillStyle='rgb('+avg[0]+','+avg[1]+','+avg[2]+')';
        octx.fill();
        octx.strokeStyle='rgba(255,255,255,0.5)';
        octx.lineWidth=1;
        octx.stroke();
      } else if(passes){
        hitCount++;
        var a=getOrAddNode(vx,vy);
        var b=getOrAddNode(sx,sy);
        if(!edgeExists(a,b)){ edges.push([a,b]); newEdges++; }
      }
    }
  }

  if(debugMode){
    say('Debug: '+checked+' segments. Green='+hitCount+' (pass), Yellow='+flankFail+' (flank blocked), Red=ratio low, Gray=no match. SnapFail='+snapFail+'. EdgeColor=rgb('+edgeColor+'), tol='+tol);
  } else {
    redraw();
    say('Detected '+newEdges+' edges, added '+newNodes+' nodes.');
  }
}

$('bDetect').onclick=function(){ runEdgeScan(false); };
$('bDbg').onclick=function(){ runEdgeScan(true); };

// load defaults from hexagons_data.js on startup
(function(){
  var data=window.HEXAGON_DEFAULTS;
  if(!data) return;
  var tg=data.tileGrid;
  cal={ox:tg.origin[0], oy:tg.origin[1], R:tg.radius, rot:0};
  hexes=data.hexes.map(function(h){
    return {q:h.q, r:h.r, color:h.color, alpha:h.alpha};
  });
  if(data.networkGrid){
    var ng=data.networkGrid;
    ncal={ox:ng.origin[0], oy:ng.origin[1], R:ng.radius};
  }
  if(data.network){
    nodes=data.network.nodes||[];
    edges=data.network.edges||[];
  }
  $('spc').value=117; $('spcVal').textContent='117';
  $('bScan').disabled=false;
  $('bEdit').disabled=false;
  $('bFill').disabled=false;
  $('bNcal').disabled=false;
  $('bExp').disabled=false;
  $('bSample').disabled=false;
  if(ncal){
    $('bEye').disabled=false;
    $('bDetect').disabled=false;
    $('bDbg').disabled=false;
    $('bNet').disabled=false;
    $('bNode').disabled=false;
    $('bEdge').disabled=false;
  }
  say('Loaded '+hexes.length+' hexes'+(nodes.length?' and '+nodes.length+' nodes':'')+' from defaults. Load image to view.');
})();

// canvas clicks
ovl.addEventListener('contextmenu',function(e){
  e.preventDefault();
  if(mode!=='sample'||!px) return;
  var rect=ovl.getBoundingClientRect();
  var x=(e.clientX-rect.left)/rect.width*W;
  var y=(e.clientY-rect.top)/rect.height*H;
  var lq=pixToLat(x,y);
  for(var i=0;i<hexes.length;i++){
    if(hexes[i].q===lq[0]&&hexes[i].r===lq[1]){
      delete hexes[i].sox; delete hexes[i].soy;
      say('Sample point reset for hex ('+lq[0]+','+lq[1]+').');
      redraw(); break;
    }
  }
});
ovl.addEventListener('pointerdown',function(e){
  if(!px) return;
  var rect=ovl.getBoundingClientRect();
  var x=(e.clientX-rect.left)/rect.width*W;
  var y=(e.clientY-rect.top)/rect.height*H;

  if(mode==='cal'){
    calClicks.push([x,y]);
    if(calClicks.length===1){ say('Now click one VERTEX of that hexagon.'); return; }
    var c=calClicks[0], v=calClicks[1];
    var R=Math.hypot(v[0]-c[0],v[1]-c[1]);
    var a=Math.atan2(v[1]-c[1],v[0]-c[0]);
    a=((a%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
    var rot0=a%(Math.PI/3);
    var rot=rot0>Math.PI/6?rot0-Math.PI/3:rot0;
    cal={ox:c[0],oy:c[1],R:R,rot:rot};
    setMode('');
    $('bScan').disabled=false;
    say('Tile grid calibrated: R='+R.toFixed(1)+'px. Click "Scan hexes".');
    redraw();
    var lw=Math.max(1.5,W/700);
    octx.strokeStyle='lime'; octx.lineWidth=lw*2;
    hexPath(cal.ox,cal.oy,cal.R,0); octx.stroke();
    octx.beginPath(); octx.arc(cal.ox,cal.oy,5,0,Math.PI*2); octx.fillStyle='red'; octx.fill();
    octx.beginPath(); octx.arc(v[0],v[1],5,0,Math.PI*2); octx.fillStyle='blue'; octx.fill();
    return;
  }
  if(!cal) return;

  if(mode==='ncal'){
    ncalClicks.push([x,y]);
    if(ncalClicks.length===1){
      octx.beginPath(); octx.arc(x,y,5,0,Math.PI*2); octx.fillStyle='cyan'; octx.fill();
      say('Now click an ADJACENT network vertex.');
      return;
    }
    var a=ncalClicks[0], b=ncalClicks[1];
    var R=Math.hypot(b[0]-a[0],b[1]-a[1]);
    ncal={ox:a[0]+R,oy:a[1],R:R};
    setMode('');
    $('bEye').disabled=false;
    $('bDetect').disabled=false;
    $('bDbg').disabled=false;
    $('bNet').disabled=false;
    $('bNode').disabled=false;
    $('bEdge').disabled=false;
    $('bExp').disabled=false;
    redraw();
    say('Network calibrated: R='+R.toFixed(1)+'px. Use Eyedropper to sample edge color, then Detect edges.');
    return;
  }

  if(mode==='eye'){
    edgeColor=getPx(x,y).map(Math.round);
    $('swatch').style.background='rgb('+edgeColor+')';
    say('Edge color sampled: rgb('+edgeColor+'). Adjust tolerance, then click "Detect edges".');
    setMode('');
    return;
  }

  if(mode==='solve'){
    var c=samplePx(x,y,10);  // wide radius to average out noise at low opacity
    solvePts.push(c);
    var cr=Math.max(4,W/300);
    var cols=['#0f0','#f80','#f44'];
    var col=cols[Math.min(solvePts.length-1,2)];
    octx.strokeStyle=col; octx.lineWidth=1.5;
    octx.beginPath(); octx.moveTo(x-cr*2,y); octx.lineTo(x+cr*2,y); octx.stroke();
    octx.beginPath(); octx.moveTo(x,y-cr*2); octx.lineTo(x,y+cr*2); octx.stroke();
    octx.beginPath(); octx.arc(x,y,cr,0,Math.PI*2);
    var cr8=c.map(Math.round); octx.fillStyle='rgb('+cr8+')'; octx.fill();
    octx.strokeStyle=col; octx.stroke();
    if(solvePts.length===1){
      say('(2/3) Click inside a region covered by ONLY hex B (different from A).');
    } else if(solvePts.length===2){
      say('(3/3) Click inside the region where hex A and hex B OVERLAP.');
    } else {
      var p1=solvePts[0], p2=solvePts[1], p12=c;
      // try both orderings: B-on-A and A-on-B; pick the one with more consistent α
      var MIN_SIGNAL=5; // ignore channels with deviations smaller than this
      function solveOrder(pa, pb){
        var alphas=[], ca=[], cb=[], skipped=[];
        for(var ch=0;ch<3;ch++){
          var da=pa[ch]-255, db=pb[ch]-255, d12=p12[ch]-255;
          if(Math.min(Math.abs(da),Math.abs(db))<MIN_SIGNAL){ skipped.push(ch); continue; }
          var a=1-(d12-da)/db;
          if(a<-0.1||a>1.1){ return null; }
          a=Math.max(0.001,Math.min(1,a));
          alphas.push(a);
          ca.push(Math.max(0,Math.min(255,Math.round(255+da/a))));
          cb.push(Math.max(0,Math.min(255,Math.round(255+db/a))));
        }
        if(alphas.length===0) return null;
        // fill skipped channels using average alpha
        var avg=alphas.reduce(function(s,v){return s+v;},0)/alphas.length;
        for(var si=0;si<skipped.length;si++){
          var ch=skipped[si];
          ca.splice(ch,0,Math.max(0,Math.min(255,Math.round(255+(pa[ch]-255)/avg))));
          cb.splice(ch,0,Math.max(0,Math.min(255,Math.round(255+(pb[ch]-255)/avg))));
          alphas.splice(ch,0,avg);
        }
        var variance=alphas.reduce(function(s,v){return s+(v-avg)*(v-avg);},0)/alphas.length;
        return {alphas:alphas,avg:avg,variance:variance,ca:ca,cb:cb,skipped:skipped};
      }
      var r1=solveOrder(p1,p2); // B on top of A
      var r2=solveOrder(p2,p1); // A on top of B
      var best=null;
      if(r1&&r2) best=r1.variance<=r2.variance?r1:{alphas:r2.alphas,avg:r2.avg,variance:r2.variance,ca:r2.cb,cb:r2.ca};
      else best=r1||r2;
      if(!best){
        var fmt=function(p){ return 'rgb('+p.map(Math.round)+')'; };
        say('Cannot solve — A:'+fmt(p1)+' B:'+fmt(p2)+' overlap:'+fmt(p12)
          +'. Try clicking more central areas, or the model may not fit here.');
      } else {
        var a=best.alphas, avg=best.avg;
        var chNames=['R','G','B'];
        var skip=best.skipped&&best.skipped.length?'  | Estimated (low signal): '+best.skipped.map(function(i){return chNames[i];}).join(','):'';
        $('swatch').style.background='rgb('+best.ca+')';
        $('swatch2').style.background='rgb('+best.cb+')'; $('swatch2').style.display='inline-block';
        say('Hex A: rgb('+best.ca+')  Hex B: rgb('+best.cb+')'
          +' | α='+avg.toFixed(3)+' ('+Math.round(avg*100)+'%)'
          +' | Per-channel α: R='+a[0].toFixed(3)+' G='+a[1].toFixed(3)+' B='+a[2].toFixed(3)
          +' | σ²='+best.variance.toFixed(5)+skip);
      }
      solvePts=[];
      setMode('');
    }
    return;
  }

  if(mode==='compare'){
    var c=samplePx(x,y,3).map(Math.round);
    comparePts.push({x:x,y:y,c:c});
    var r=Math.max(4,W/300);
    octx.strokeStyle='#fff'; octx.lineWidth=1.5;
    octx.beginPath(); octx.moveTo(x-r*2,y); octx.lineTo(x+r*2,y); octx.stroke();
    octx.beginPath(); octx.moveTo(x,y-r*2); octx.lineTo(x,y+r*2); octx.stroke();
    octx.beginPath(); octx.arc(x,y,r,0,Math.PI*2);
    octx.fillStyle='rgb('+c+')'; octx.fill(); octx.stroke();
    if(comparePts.length===1){
      $('swatch').style.background='rgb('+c+')';
      $('swatch2').style.display='none';
      say('Point 1: rgb('+c+'). Click the second point.');
    } else {
      var c1=comparePts[0].c, c2=c;
      $('swatch').style.background='rgb('+c1+')';
      $('swatch2').style.background='rgb('+c2+')'; $('swatch2').style.display='inline-block';
      var dr=c2[0]-c1[0], dg=c2[1]-c1[1], db=c2[2]-c1[2];
      var lum=function(c){ return 0.299*c[0]+0.587*c[1]+0.114*c[2]; };
      var l1=lum(c1), l2=lum(c2), dl=l2-l1;
      var pct=l1>0?(dl/l1*100).toFixed(1)+'%':'—';
      say('rgb('+c1+') → rgb('+c2+')  |  Δ('+dr+', '+dg+', '+db+')'
        +'  |  Brightness: '+l1.toFixed(1)+' → '+l2.toFixed(1)
        +' (Δ'+(dl>=0?'+':'')+dl.toFixed(1)+', '+(dl>=0?'+':'')+pct+')');
      comparePts=[];
      setMode('');
    }
    return;
  }

  if(mode==='sample'){
    var lq=pixToLat(x,y);
    for(var i=0;i<hexes.length;i++){
      if(hexes[i].q===lq[0]&&hexes[i].r===lq[1]){
        var hp=latToPix(lq[0],lq[1]);
        hexes[i].sox=+(x-hp[0]).toFixed(1);
        hexes[i].soy=+(y-hp[1]).toFixed(1);
        say('Sample point set for hex ('+lq[0]+','+lq[1]+') at offset ('+hexes[i].sox+', '+hexes[i].soy+').');
        redraw(); break;
      }
    }
    return;
  }

  if(mode==='edit'){
    var lq=pixToLat(x,y);
    var q=lq[0], r=lq[1];
    var idx=-1;
    for(var i=0;i<hexes.length;i++){
      if(hexes[i].q===q&&hexes[i].r===r){ idx=i; break; }
    }
    if(idx>=0){
      hexes.splice(idx,1);
      say('Removed hex ('+q+','+r+').');
    } else {
      var hp=latToPix(q,r);
      var c=samplePx(hp[0],hp[1],4);
      var d=devFromWhite(c);
      var alpha=Math.max(0.05,Math.min(1,d/255));
      var base=c.map(function(v){ return Math.round(Math.max(0,Math.min(255,(v-255*(1-alpha))/alpha))); });
      if(Math.max(base[0],base[1],base[2])<20){ say('Skipped ('+q+','+r+'): de-mixed color is black.'); redraw(); return; }
      hexes.push({q:q,r:r,color:base,alpha:+alpha.toFixed(3)});
      say('Added hex ('+q+','+r+').');
    }
    redraw(); return;
  }

  if(mode==='node'){
    var sn=snapToNet(x,y);
    var sx=sn[0], sy=sn[1];
    var EPS=(ncal?ncal.R:cal.R)*0.25;
    var hit=-1;
    for(var i=0;i<nodes.length;i++){
      if(Math.hypot(nodes[i].x-sx,nodes[i].y-sy)<EPS){ hit=i; break; }
    }
    if(hit>=0){
      nodes.splice(hit,1);
      edges=edges.filter(function(e){ return e[0]!==hit&&e[1]!==hit; })
                 .map(function(e){ return e.map(function(i){ return i>hit?i-1:i; }); });
      say('Node deleted.');
    } else {
      var c=samplePx(sx,sy,2);
      nodes.push({x:+sx.toFixed(1),y:+sy.toFixed(1),filled:devFromWhite(c)>60,color:c.map(Math.round)});
      say('Node '+(nodes.length-1)+' placed.');
    }
    redraw(); return;
  }

  if(mode==='edge'){
    var EPS=(ncal?ncal.R:cal.R)*0.3;
    var hit=-1;
    for(var i=0;i<nodes.length;i++){
      if(Math.hypot(nodes[i].x-x,nodes[i].y-y)<EPS){ hit=i; break; }
    }
    if(hit<0){ say('No node near click.'); return; }
    if(edgeSel<0){
      edgeSel=hit;
      say('Node '+hit+' selected.');
    } else if(edgeSel!==hit){
      var found=-1;
      for(var i=0;i<edges.length;i++){
        if((edges[i][0]===edgeSel&&edges[i][1]===hit)||(edges[i][0]===hit&&edges[i][1]===edgeSel)){ found=i; break; }
      }
      if(found>=0){ edges.splice(found,1); say('Edge removed.'); }
      else { edges.push([edgeSel,hit]); say('Edge added.'); }
      edgeSel=-1;
    } else {
      edgeSel=-1;
    }
    redraw(); return;
  }
});

// export
$('bExp').onclick=function(){
  var R=cal.R;
  var hexesOut=hexes.map(function(h){
    var pos=latToPix(h.q,h.r);
    var cx=pos[0], cy=pos[1];
    var sx=cx+(h.sox!==undefined?h.sox:sampleOx);
    var sy=cy+(h.soy!==undefined?h.soy:sampleOy);
    var color=px?samplePx(sx,sy,3).map(Math.round):h.color;
    return {q:h.q,r:h.r,x:+cx.toFixed(1),y:+cy.toFixed(1),radius:+R.toFixed(2),color:color,alpha:h.alpha};
  });
  var out={
    tileGrid:{radius:+R.toFixed(2),origin:[+cal.ox.toFixed(1),+cal.oy.toFixed(1)],imageDimensions:[W,H]},
    networkGrid:ncal?{radius:+ncal.R.toFixed(2),origin:[+ncal.ox.toFixed(1),+ncal.oy.toFixed(1)]}:null,
    hexes:hexesOut,
    network:{nodes:nodes,edges:edges}
  };
  $('json').value=JSON.stringify(out,null,2);
  $('exportPanel').style.display='flex';
};
$('bClose').onclick=function(){ $('exportPanel').style.display='none'; };
$('bCopy').onclick=function(){ $('json').focus(); $('json').select(); };
$('bSave').onclick=function(){
  var blob=new Blob([$('json').value],{type:'application/json'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='hexagons.json';
  a.click();
};
