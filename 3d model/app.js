import {consumeHandoff} from '/handoff.js';
import {planContact} from './arm-kinematics.js';
import * as THREE from './three.module.js';
import {OrbitControls} from './OrbitControls.js';
import {RoomEnvironment} from './RoomEnvironment.js';
const $=id=>document.getElementById(id), canvas=$('view');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0x07101a);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x07101a,25,65);
const studio=new RoomEnvironment(renderer);const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(studio,.05).texture;studio.dispose();pmrem.dispose();
const camera=new THREE.PerspectiveCamera(40,1,.1,100);camera.position.set(9.3,13.6,10.2);
const controls=new OrbitControls(camera,canvas);controls.target.set(2.9,2.3,.1);controls.enableDamping=true;controls.minDistance=6;controls.maxDistance=25;controls.maxPolarAngle=Math.PI/2-.03;
scene.add(new THREE.HemisphereLight(0xffffff,0x9cabb8,1.15));const light=new THREE.DirectionalLight(0xfff4e8,2.6);light.position.set(2,14,7);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:.1,far:35});light.shadow.camera.updateProjectionMatrix();light.shadow.bias=-.0003;scene.add(light);light.shadow.normalBias=.025;light.shadow.radius=4;const fill=new THREE.DirectionalLight(0xc7e7ff,1.1);fill.position.set(-6,7,-8);scene.add(fill);
const mat=(color,metalness=0,roughness=.35)=>new THREE.MeshStandardMaterial({color,metalness,roughness});const white=new THREE.MeshPhysicalMaterial({color:0xe9eceb,metalness:.12,roughness:.27,clearcoat:.45,clearcoatRoughness:.28}), joint=mat(0xb1bac2,.8,.24), dark=mat(0x334452,.4), cyan=new THREE.MeshStandardMaterial({color:0x69b3a6,emissive:0x357c75,emissiveIntensity:.22}), orange=mat(0xc7814d);
function canvasTexture(canvas,rx=1,ry=1){const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rx,ry);t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t}
function makeFloorTexture(){
 const c=document.createElement('canvas');c.width=c.height=512;const q=c.getContext('2d'),tile=128;q.fillStyle='#111c27';q.fillRect(0,0,512,512);
 let seed=27;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 for(let y=0;y<4;y++)for(let x=0;x<4;x++){const n=Math.round((rand()-.5)*10);q.fillStyle=`rgb(${24+n},${37+n},${50+n})`;q.fillRect(x*tile+2,y*tile+2,tile-4,tile-4);q.strokeStyle='rgba(126,160,177,.17)';q.lineWidth=2;q.strokeRect(x*tile+1,y*tile+1,tile-2,tile-2);q.strokeStyle='rgba(255,255,255,.025)';q.beginPath();q.moveTo(x*tile+4,y*tile+5);q.lineTo((x+1)*tile-5,y*tile+5);q.stroke()}
 for(let i=0;i<2400;i++){const x=rand()*512,y=rand()*512,a=.012+rand()*.035;q.fillStyle=rand()>.5?`rgba(186,207,216,${a})`:`rgba(0,0,0,${a})`;q.fillRect(x,y,1+rand()*2,1+rand()*2)}
 return canvasTexture(c,10,8)
}
function makeWallTexture(){
 const c=document.createElement('canvas');c.width=c.height=512;const q=c.getContext('2d');q.fillStyle='#1b2d3b';q.fillRect(0,0,512,512);
 let seed=91;for(let i=0;i<11000;i++){seed=(seed*1664525+1013904223)>>>0;const x=(seed/4294967296)*512;seed=(seed*1664525+1013904223)>>>0;const y=(seed/4294967296)*512;const a=.008+(seed%18)/1000;q.fillStyle=i%2?`rgba(165,195,207,${a})`:`rgba(0,0,0,${a})`;q.fillRect(x,y,1+(seed%2),1)}
 return canvasTexture(c,4,2)
}
function makeLinenTexture(){
 const c=document.createElement('canvas');c.width=c.height=256;const q=c.getContext('2d');q.fillStyle='#6b8792';q.fillRect(0,0,256,256);
 for(let i=0;i<256;i+=4){q.strokeStyle='rgba(225,242,244,.055)';q.lineWidth=1;q.beginPath();q.moveTo(i,0);q.lineTo(i,256);q.stroke();q.strokeStyle='rgba(13,33,43,.055)';q.beginPath();q.moveTo(0,i);q.lineTo(256,i);q.stroke()}
 let seed=43;for(let i=0;i<2600;i++){seed=(seed*1664525+1013904223)>>>0;const x=(seed/4294967296)*256;seed=(seed*1664525+1013904223)>>>0;const y=(seed/4294967296)*256;q.fillStyle=i%2?'rgba(240,249,248,.045)':'rgba(4,22,30,.04)';q.fillRect(x,y,1,1)}
 return canvasTexture(c,6,14)
}
function box(w,h,d,m,parent,x=0,y=0,z=0){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o}
function sphere(r,m,parent,x=0,y=0,z=0,sx=1,sy=1,sz=1){const o=new THREE.Mesh(new THREE.SphereGeometry(r,32,24),m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=true;parent.add(o);return o}
function cylinder(r1,r2,len,m,parent,x=0,y=0,z=0){const o=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,len,48),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o}
function rod(a,b,r1,r2,m,parent){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),v=bv.clone().sub(av);let o;if(r1>.2){const len=v.length();const pts=[new THREE.Vector2(0,-len/2),new THREE.Vector2(r1*.68,-len/2),new THREE.Vector2(r1*.92,-len/2+.09),new THREE.Vector2(r1,-len/2+.22),new THREE.Vector2(r1*1.04,-len*.22),new THREE.Vector2((r1+r2)*.53,len*.1),new THREE.Vector2(r2,len/2-.18),new THREE.Vector2(r2*.9,len/2-.05),new THREE.Vector2(r2*.65,len/2),new THREE.Vector2(0,len/2)];o=new THREE.Mesh(new THREE.LatheGeometry(pts,64),m);o.castShadow=true;o.receiveShadow=true;parent.add(o);}else{o=cylinder(r2,r1,v.length(),m,parent);}o.position.copy(av.add(bv).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return o}
function tube(points,radius,material,parent=scene,segments=80){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,segments,radius,10,false),material);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh}
// Stylized operating-room bay: tiled floor, clinical walls, a robot cart and patient stretcher.
const BASE_X=0,BOARD_X0=2.22,BOARD_X1=4.20,BOARD_Z0=-1.05,BOARD_Z1=1.55;
const BOARD_W=BOARD_X1-BOARD_X0,BOARD_D=BOARD_Z1-BOARD_Z0,BOARD_CX=(BOARD_X0+BOARD_X1)/2,BOARD_CZ=(BOARD_Z0+BOARD_Z1)/2;
const BED_X=3.25,BED_Z=-.84;
const floorY=-.43;
const floorMaterial=new THREE.MeshStandardMaterial({map:makeFloorTexture(),metalness:.12,roughness:.62});
box(40,.1,34,floorMaterial,scene,2.5,floorY,0);
const wallMat=new THREE.MeshStandardMaterial({map:makeWallTexture(),metalness:.04,roughness:.86}),wallTrim=mat(0x203642,.08,.78),steel=mat(0x617786,.72,.3);
box(26,9.4,.2,wallMat,scene,3,4.15,-6.7);
box(.2,9.4,20,wallMat,scene,-6.6,4.15,0);
for(let y=.2;y<8.5;y+=1.15)box(25.7,.018,.035,wallTrim,scene,3,y,-6.585);
for(let x=-5;x<11;x+=2.7)box(.025,8.9,.025,wallTrim,scene,x,4.15,-6.56);
// Soft wall sconces are mounted flush to the back wall; avoid floating ceiling strips in the open camera view.
const wallGlow=new THREE.MeshStandardMaterial({color:0x9bdde3,emissive:0x397e89,emissiveIntensity:.34,roughness:.72});
for(const x of [-4.7,10.4]){box(.34,2.05,.08,mat(0x263c49,.22,.62),scene,x,5.55,-6.53);box(.18,1.72,.035,wallGlow,scene,x,5.55,-6.47)}
const roomChildCount=scene.children.length;
// Mobile robot table; the arm pedestal sits on its upper plate.
box(2.45,.16,2.9,mat(0x263c4c,.62,.3),scene,BASE_X,-.08,0);
box(1.95,.09,2.2,dark,scene,BASE_X,-.28,0);
for(const dx of [-1.05,1.05])for(const z of [-1.12,1.12]){
 const x=BASE_X+dx;box(.13,.20,.13,steel,scene,x,-.18,z);
 const w=cylinder(.12,.12,.09,dark,scene,x,-.27,z);w.rotation.z=Math.PI/2;
}
box(.34,.035,.55,cyan,scene,BASE_X+.98,-.005,-.8);
cylinder(.95,1.15,.3,dark,scene,BASE_X,.17,0);cylinder(.8,.95,.3,white,scene,BASE_X,.46,0);cylinder(.82,.82,.07,cyan,scene,BASE_X,.63,0);
// Supine patient stretcher, with mattress, rails, supports and casters.
box(3.9,.18,8.5,mat(0x344e5e,.62,.32),scene,BED_X,.06,BED_Z);
const mattressMaterial=new THREE.MeshStandardMaterial({map:makeLinenTexture(),metalness:.02,roughness:.91});
box(3.48,.22,8.12,mattressMaterial,scene,BED_X,.26,BED_Z);
for(const x of [BED_X-1.35,BED_X+1.35])for(const z of [BED_Z-3.35,BED_Z+3.35]){
 box(.15,.37,.15,steel,scene,x,-.065,z);
 const w=cylinder(.13,.13,.1,dark,scene,x,-.265,z);w.rotation.z=Math.PI/2;
}
for(const z of [BED_Z-2.4,BED_Z+2.4])box(3.0,.11,.12,steel,scene,BED_X,-.08,z);
for(const x of [BED_X-1.92,BED_X+1.92]){
 box(.065,.08,7.45,wallTrim,scene,x,.51,BED_Z);
 for(const z of [BED_Z-3.35,BED_Z,BED_Z+3.35])box(.065,.44,.08,steel,scene,x,.29,z);
}
// Pillow and shallow body volumes support the covered, non-identifiable patient cutout.
const pillowMat=mat(0xaebbc0,.01,.92);sphere(.43,pillowMat,scene,BED_X,.44,2.18,1.22,.28,.84);
const patientGown=mat(0x8eafc2,.02,.86),patientDrape=mat(0x286475,.02,.92),patientSkin=mat(0xb98f7d,.02,.78);
sphere(.8,patientGown,scene,BED_X,.63,.98,1,.35,1.12);
sphere(.82,patientDrape,scene,BED_X,.58,-1.95,1,.36,2.55);
sphere(.30,patientSkin,scene,BED_X,.64,2.18,1,.85,1.15);
sphere(.20,patientGown,scene,BED_X,.62,1.83,.9,.9,1.15);
for(const side of [-1,1]){rod([BED_X+side*.55,.65,1.52],[BED_X+side*.88,.46,-.72],.22,.16,patientGown,scene);sphere(.14,patientSkin,scene,BED_X+side*.88,.78,-.82,.9,.9,1.1)}
const patientTexture=new THREE.TextureLoader().load('./assets/patient-transparent.png');patientTexture.colorSpace=THREE.SRGBColorSpace;
const patientMaterial=new THREE.MeshBasicMaterial({map:patientTexture,transparent:true,alphaTest:.035,side:THREE.DoubleSide,toneMapped:false,depthWrite:false});
const patientGeometry=new THREE.PlaneGeometry(3.3,7.35,48,108),patientPositions=patientGeometry.attributes.position;
for(let i=0;i<patientPositions.count;i++){
 const x=patientPositions.getX(i),y=patientPositions.getY(i),torso=Math.exp(-((x/.76)**2+((y+1.55)/1.42)**2)),drape=Math.exp(-((x/.68)**2+((y-.65)/1.72)**2)),head=Math.exp(-((x/.3)**2+((y+3.08)/.48)**2)),shoulderShape=Math.exp(-((x/.86)**2+((y+2.6)/.62)**2)),armShape=Math.exp(-(((Math.abs(x)-.72)/.2)**2+((y+.05)/1.05)**2));
 patientPositions.setZ(i,.012+.06*torso+.04*drape+.045*head+.028*shoulderShape+.018*armShape);
}
patientGeometry.computeVertexNormals();
const patientImage=new THREE.Mesh(patientGeometry,patientMaterial);patientImage.rotation.x=-Math.PI/2;patientImage.position.set(BED_X,.85,BED_Z);patientImage.renderOrder=1;scene.add(patientImage);
// Wall-mounted clinical display and IV stand establish the room as an OR-style bay.
function monitorTexture(){const c=document.createElement('canvas');c.width=640;c.height=400;const q=c.getContext('2d');q.fillStyle='#07131f';q.fillRect(0,0,640,400);q.fillStyle='#64e7ee';q.font='bold 25px sans-serif';q.fillText('CELLGUARD  /  THORAX CT',24,40);q.fillStyle='#8ba6b8';q.font='18px sans-serif';q.fillText('CLINICIAN REVIEW · SIMULATION',24,68);drawChestSlice(q,36,86,260,284);q.strokeStyle='#21495d';q.strokeRect(24,82,284,300);q.strokeStyle='#1d3e50';for(let i=0;i<5;i++){q.beginPath();q.moveTo(342,115+i*48);q.lineTo(612,115+i*48);q.stroke()}q.fillStyle='#42e7ee';q.font='20px monospace';q.fillText('TARGET  •  AWAITING HUMAN CONFIRM',338,105);q.fillStyle='#8ba6b8';q.font='16px monospace';q.fillText('IMAGE-BOARD DEMONSTRATION',338,365);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
const monitorCase=box(1.75,1.16,.14,dark,scene,7.35,2.45,-5.55);monitorCase.material=mat(0x172a38,.55,.26);
const monitorScreen=new THREE.Mesh(new THREE.PlaneGeometry(1.62,1.02),new THREE.MeshBasicMaterial({map:monitorTexture(),toneMapped:false}));monitorScreen.position.set(7.35,2.45,-5.47);scene.add(monitorScreen);
function vitalsTexture(){
 const c=document.createElement('canvas');c.width=512;c.height=320;const q=c.getContext('2d');q.fillStyle='#06111a';q.fillRect(0,0,512,320);
 q.fillStyle='#64e5e9';q.font='bold 21px monospace';q.fillText('SIMULATION · SAMPLE VITALS',18,29);
 q.strokeStyle='rgba(82,168,176,.17)';q.lineWidth=1;for(let x=18;x<500;x+=28){q.beginPath();q.moveTo(x,45);q.lineTo(x,296);q.stroke()}for(let y=52;y<300;y+=24){q.beginPath();q.moveTo(18,y);q.lineTo(495,y);q.stroke()}
 const rows=[{y:100,color:'#4de1aa',label:'ECG'},{y:176,color:'#54c9f2',label:'RESP'},{y:250,color:'#f4c45e',label:'PLETH'}];
 for(const row of rows){q.fillStyle=row.color;q.font='bold 15px monospace';q.fillText(row.label,24,row.y-14);q.strokeStyle=row.color;q.lineWidth=2;q.beginPath();for(let x=84;x<495;x+=2){const u=(x-84)%76;let pulse=Math.sin(x*.06)*3;if(u>20&&u<26)pulse-=14;if(u>=26&&u<31)pulse+=28;if(u>=31&&u<36)pulse-=10;const yy=row.y+pulse;if(x===84)q.moveTo(x,yy);else q.lineTo(x,yy)}q.stroke()}
 q.fillStyle='#dcebf0';q.font='bold 29px monospace';q.fillText('72',420,91);q.fillText('98',420,168);q.fillStyle='#8faab6';q.font='13px monospace';q.fillText('BPM',421,109);q.fillText('SpO₂',420,185);q.fillStyle='#96adba';q.font='13px monospace';q.fillText('DEMO DISPLAY · NOT PATIENT DATA',18,311);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t
}
box(1.68,1.04,.14,mat(0x15242e,.55,.28),scene,5.2,3.7,-6.52);
const vitalsScreen=new THREE.Mesh(new THREE.PlaneGeometry(1.52,.88),new THREE.MeshBasicMaterial({map:vitalsTexture(),toneMapped:false}));vitalsScreen.position.set(5.2,3.7,-6.438);scene.add(vitalsScreen);
rod([7.35,.25,-5.55],[7.35,1.84,-5.55],.065,.065,steel,scene);box(1.1,.06,.55,dark,scene,7.35,.12,-5.55);
rod([7.05,.2,-3.8],[7.05,3.25,-3.8],.035,.035,steel,scene);
box(.48,.76,.22,new THREE.MeshPhysicalMaterial({color:0x9bdde0,transparent:true,opacity:.34,roughness:.18,metalness:.1}),scene,7.05,2.83,-3.8);
rod([7.05,3.15,-3.8],[7.35,3.28,-3.8],.035,.035,steel,scene);
// Soft-clear IV tubing runs down the stand and along the outside edge of the bed.
const clearTube=new THREE.MeshPhysicalMaterial({color:0x91c5cc,transparent:true,opacity:.62,roughness:.18,metalness:.03,clearcoat:.9,depthWrite:false});
tube([[7.05,2.48,-3.8],[6.93,2.1,-3.7],[6.72,1.55,-3.4],[6.05,1.05,-2.7],[5.34,.92,-2.0],[5.22,.78,-1.65]],.018,clearTube,scene,100);
// A neatly coiled sensor lead rests on the lower blanket, never across the CT target.
const linenLeadMat=new THREE.MeshPhysicalMaterial({color:0x4d7180,roughness:.3,metalness:.08,clearcoat:.8});
const coilPoints=[];for(let i=0;i<=180;i++){const t=i/180*Math.PI*5.2,r=.43-.1*i/180;coilPoints.push([BED_X+.38+r*Math.cos(t),.91,-2.55+r*Math.sin(t)])}
const patientLead=tube(coilPoints,.022,linenLeadMat,scene,180);patientLead.renderOrder=2;
const leadTail=tube([[BED_X+.38+.33,.91,-2.55],[4.28,.90,-2.1],[4.76,.74,-1.72],[5.04,.56,-1.45]],.02,linenLeadMat,scene,64);leadTail.renderOrder=2;
// Ceiling-mounted surgical lamp: an articulated boom is anchored to the wall, with a visible multi-LED head.
box(.48,.34,.16,mat(0x304758,.35,.34),scene,BED_X,8.24,-6.52);
rod([BED_X,8.22,-6.43],[BED_X,8.22,-4.35],.07,.07,steel,scene);
rod([BED_X,8.22,-4.35],[BED_X,7.8,-.9],.065,.055,steel,scene);
rod([BED_X,7.8,-.9],[BED_X,6.05,-.9],.055,.045,steel,scene);
cylinder(.57,.69,.15,dark,scene,BED_X,5.98,-.9);
const lampFace=new THREE.MeshStandardMaterial({color:0xd9f8f8,emissive:0x7cecf2,emissiveIntensity:.9,roughness:.28});
cylinder(.48,.51,.04,lampFace,scene,BED_X,6.08,-.9);
const lampRing=new THREE.Mesh(new THREE.TorusGeometry(.54,.026,10,64),cyan);lampRing.rotation.x=Math.PI/2;lampRing.position.set(BED_X,6.105,-.9);scene.add(lampRing);
const lampInnerRing=new THREE.Mesh(new THREE.TorusGeometry(.34,.012,8,48),lampFace);lampInnerRing.rotation.x=Math.PI/2;lampInnerRing.position.set(BED_X,6.108,-.9);scene.add(lampInnerRing);
for(let i=0;i<8;i++){const a=i*Math.PI/4;sphere(.047,lampFace,scene,BED_X+.37*Math.cos(a),6.12,-.9+.37*Math.sin(a),1,.55,1)}
const surgeryLight=new THREE.PointLight(0xa8f4ff,14,9,2);surgeryLight.position.set(BED_X,5.55,-.9);scene.add(surgeryLight);
// Reflective instrument tables echo the stainless trays in a modern OR.
const traySteel=new THREE.MeshPhysicalMaterial({color:0xabb7bd,metalness:.88,roughness:.2,clearcoat:.8}),trayInset=mat(0x263640,.78,.28);
function instrumentTable(x,z,w,d){
 const top=1.08,floorTop=floorY+.05,legH=top-.032-floorTop,tableFrame=mat(0x62747e,.76,.26);
 box(w,.065,d,tableFrame,scene,x,top,z);box(w-.11,.018,d-.11,traySteel,scene,x,top+.041,z);
 for(const dx of [-w/2+.035,w/2-.035])for(const dz of [-d/2+.035,d/2-.035]){
  box(.055,legH,.055,steel,scene,x+dx,floorTop+legH/2,z+dz);
  const wheel=cylinder(.085,.085,.07,dark,scene,x+dx,floorTop+.085,z+dz);wheel.rotation.x=Math.PI/2;
 }
 for(const edge of [-1,1]){box(w,.045,.035,traySteel,scene,x,top+.055,z+edge*(d/2-.025));box(.035,.045,d,traySteel,scene,x+edge*(w/2-.025),top+.055,z)}
}
instrumentTable(-2.0,.15,1.25,1.35);instrumentTable(6.25,.25,1.35,1.2);
// A few neatly arranged, blunt demonstration instruments on the trays.
rod([-2.46,1.16,-.18],[-1.68,1.16,-.13],.035,.025,joint,scene);
rod([-2.43,1.16,.1],[-1.82,1.16,.15],.025,.02,steel,scene);
rod([-2.35,1.16,.38],[-1.78,1.16,.33],.028,.018,steel,scene);
box(.42,.1,.26,dark,scene,6.25,1.17,.23);
for(let i=0;i<3;i++)rod([5.88+i*.2,1.17,.55],[6.45+i*.2,1.17,.57],.024,.018,joint,scene);
// Base yaw, shoulder pitch, and the new elbow motor drive the virtual arm.
const BOARD_TOP=1.18,ELBOW_X=2.0,ARM_X=4.55,WRIST_OFFSET=.47,NEEDLE_LENGTH=.24;
const FOREARM_LENGTH=ARM_X-ELBOW_X;
const TOOL_PRESETS={short:{length:.55,label:'Short'},standard:{length:.8,label:'Standard'},extended:{length:1.1,label:'Extended'}};
let selectedTool=TOOL_PRESETS[$('toolType').value] ? $('toolType').value : 'standard';
let selectedToolLength=TOOL_PRESETS[selectedTool].length;
$('toolLabel').textContent=`${TOOL_PRESETS[selectedTool].label} needle selected. Length changes the visible tool and its approach.`;
const toolDrop=()=>WRIST_OFFSET+selectedToolLength+NEEDLE_LENGTH;
const defaultWX=BOARD_X0+.45*BOARD_W,defaultWZ=BOARD_Z0+.8*BOARD_D,DEFAULT_TARGET_RADIUS=Math.hypot(defaultWX-BASE_X,defaultWZ);
let shoulderHeight=planContact(DEFAULT_TARGET_RADIUS,BOARD_TOP,ELBOW_X,FOREARM_LENGTH,toolDrop(),0).shoulderHeight;
const INITIAL_COLUMN_HEIGHT=shoulderHeight-.67;
const base=new THREE.Group();base.position.set(BASE_X,.67,0);scene.add(base);
const columnPost=rod([0,0,0],[0,INITIAL_COLUMN_HEIGHT,0],.43,.33,white,base);sphere(.6,white,base,0,.25,0,1,1.25,1);
const shoulder=new THREE.Group();shoulder.position.set(0,INITIAL_COLUMN_HEIGHT,0);base.add(shoulder);
function setShoulderHeight(worldHeight){const length=Math.max(.62,worldHeight-.67);if(Math.abs(length-shoulder.position.y)>.0001){columnPost.scale.y=length/INITIAL_COLUMN_HEIGHT;columnPost.position.y=length/2;shoulder.position.y=length;shoulderHeight=length+.67}}
sphere(.65,white,shoulder,0,0,0,1.05,1.1,.85);
const cap=cylinder(.35,.35,.12,joint,shoulder,0,0,.55);cap.rotation.x=Math.PI/2;
const shoulderGlow=new THREE.MeshStandardMaterial({color:0x69b3a6,emissive:0x357c75,emissiveIntensity:.34});
const ring=new THREE.Mesh(new THREE.TorusGeometry(.27,.035,12,48),shoulderGlow);ring.position.set(0,0,.63);shoulder.add(ring);
// The new motor splits the arm into a fixed upper link and a rotating forearm.
rod([.3,0,0],[ELBOW_X,0,0],.52,.43,white,shoulder);
sphere(.45,white,shoulder,ELBOW_X,0,0,1.15,1.05,1.14);
const elbow=new THREE.Group();elbow.position.set(ELBOW_X,0,0);shoulder.add(elbow);
const motorBody=cylinder(.39,.39,.22,dark,shoulder,ELBOW_X,0,.53);motorBody.rotation.x=Math.PI/2;
const motorCap=cylinder(.31,.31,.09,joint,elbow,0,0,.67);motorCap.rotation.x=Math.PI/2;
const elbowGlow=new THREE.MeshStandardMaterial({color:0x69b3a6,emissive:0x357c75,emissiveIntensity:.35});
const motorRing=new THREE.Mesh(new THREE.TorusGeometry(.26,.045,12,48),elbowGlow);motorRing.position.set(0,0,.73);elbow.add(motorRing);
box(.23,.05,.035,cyan,elbow,.12,0,.75);
rod([.16,0,0],[FOREARM_LENGTH,0,0],.43,.31,white,elbow);
sphere(.36,white,elbow,FOREARM_LENGTH,0,0,1.1,1.35,1);
cylinder(.2,.2,.38,joint,elbow,FOREARM_LENGTH,-.25,0);cylinder(.21,.21,.08,cyan,elbow,FOREARM_LENGTH,-.47,0);
const instrument=new THREE.Group();instrument.position.set(FOREARM_LENGTH,-WRIST_OFFSET,0);elbow.add(instrument);
let instrumentShaft=null,instrumentTip=null;
const needleMaterial=new THREE.MeshPhysicalMaterial({color:0xd3dee3,metalness:.92,roughness:.14,clearcoat:1,clearcoatRoughness:.08});
function setInstrumentLength(length){
 if(instrumentShaft){instrument.remove(instrumentShaft);instrumentShaft.geometry.dispose()}
 if(instrumentTip){instrument.remove(instrumentTip);instrumentTip.geometry.dispose()}
 const shaftEndRadius=.027;
 instrumentShaft=rod([0,0,0],[0,-length,0],.036,shaftEndRadius,needleMaterial,instrument);
 instrumentTip=new THREE.Mesh(new THREE.ConeGeometry(shaftEndRadius,NEEDLE_LENGTH,32),needleMaterial);
 instrumentTip.rotation.z=Math.PI;instrumentTip.position.set(0,-length-NEEDLE_LENGTH/2,0);instrumentTip.castShadow=true;instrumentTip.receiveShadow=true;instrument.add(instrumentTip);
}
setInstrumentLength(selectedToolLength);
// Fixed wrist hardware: decorative only, no additional animated axis.
cylinder(.245,.22,.09,dark,elbow,FOREARM_LENGTH,-.35,0);cylinder(.16,.19,.12,joint,elbow,FOREARM_LENGTH,-.55,0);
for(let i=0;i<6;i++){const a=i*Math.PI/3;sphere(.022,cyan,elbow,FOREARM_LENGTH+.16*Math.cos(a),-.495,.16*Math.sin(a));}


// Mechanical details: recessed shoulder fasteners, housing seams, and mount bolts.
const seamMat=mat(0x7d8a91,.45,.48);
function circularSeam(radius,tube,parent,x,y,z,axis='z'){
 const o=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,10,64),seamMat);
 o.position.set(x,y,z);if(axis==='y')o.rotation.x=Math.PI/2;if(axis==='x')o.rotation.y=Math.PI/2;parent.add(o);return o;
}
circularSeam(.43,.014,shoulder,0,0,.43);
circularSeam(.43,.014,shoulder,0,0,-.43);
const armMarkCanvas=document.createElement('canvas');armMarkCanvas.width=512;armMarkCanvas.height=128;
const am=armMarkCanvas.getContext('2d');am.clearRect(0,0,512,128);am.fillStyle='#34434b';am.font='bold 51px sans-serif';am.textBaseline='middle';am.fillText('CELLGUARD',16,52);am.fillStyle='#159baa';am.font='bold 17px sans-serif';am.letterSpacing='3px';am.fillText('ROBOTIC ASSISTIVE SYSTEM',19,101);
const armMarkTexture=new THREE.CanvasTexture(armMarkCanvas);armMarkTexture.colorSpace=THREE.SRGBColorSpace;
const armMark=new THREE.Mesh(new THREE.PlaneGeometry(1.05,.22),new THREE.MeshBasicMaterial({map:armMarkTexture,transparent:true,toneMapped:false,side:THREE.DoubleSide}));armMark.position.set(1.16,.15,.505);shoulder.add(armMark);
for(const z of [.565,-.565])for(let i=0;i<4;i++){
 const a=Math.PI/4+i*Math.PI/2,x=.43*Math.cos(a),y=.43*Math.sin(a);
 const screw=cylinder(.037,.037,.025,joint,shoulder,x,y,z);screw.rotation.x=Math.PI/2;
 box(.04,.009,.009,dark,shoulder,x,y,z+Math.sign(z)*.016);
}
circularSeam(.79,.012,scene,BASE_X,.53,0,'y');
for(let i=0;i<4;i++){const a=Math.PI/4+i*Math.PI/2;cylinder(.065,.065,.045,joint,scene,BASE_X+.88*Math.cos(a),.335,.88*Math.sin(a));}
// Fine casing separation near the fixed wrist.
circularSeam(.31,.012,elbow,FOREARM_LENGTH-.22,.006,0,'x');
// Identification plaque on the front of the pedestal.
const plaqueCanvas=document.createElement('canvas');plaqueCanvas.width=512;plaqueCanvas.height=128;
const pc=plaqueCanvas.getContext('2d');pc.fillStyle='#263846';pc.fillRect(0,0,512,128);pc.fillStyle='#eaf7fa';pc.font='bold 48px sans-serif';pc.fillText('CELLGUARD',24,63);pc.fillStyle='#69d9e6';pc.font='22px sans-serif';pc.fillText('CG-02 / POSITIONING CONCEPT',24,104);
const plaqueTexture=new THREE.CanvasTexture(plaqueCanvas);plaqueTexture.colorSpace=THREE.SRGBColorSpace;
const plaque=new THREE.Mesh(new THREE.PlaneGeometry(.66,.165),new THREE.MeshStandardMaterial({map:plaqueTexture,roughness:.55}));plaque.position.set(0,.84,.55);base.add(plaque);

// CT image-board overlay sits over the patient's thorax; X/Y map across the panel.
box(BOARD_W+.16,.08,BOARD_D+.16,mat(0x637989,.72,.3),scene,BOARD_CX,BOARD_TOP-.147,BOARD_CZ);
box(BOARD_W+.12,.16,BOARD_D+.12,mat(0x172a38,.62,.29),scene,BOARD_CX,BOARD_TOP-.087,BOARD_CZ);
for(const x of [BOARD_X0-.035,BOARD_X1+.035])for(const z of [BOARD_Z0-.035,BOARD_Z1+.035])cylinder(.028,.028,.012,joint,scene,x,BOARD_TOP-.002,z);
let uploaded=null,imageBounds=null,confirmedHandoff=false;
function drawChestSlice(ctx,x,y,w,h){
 const cx=x+w/2,cy=y+h/2,rx=w*.35,ry=h*.43;
 ctx.save();ctx.fillStyle='#7e8991';ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#dce5e8';ctx.lineWidth=Math.max(2,w*.012);ctx.stroke();
 for(let i=0;i<6;i++){ctx.beginPath();ctx.ellipse(cx,cy,rx*(.91-i*.065),ry*(.92-i*.064),0,.06*Math.PI,.94*Math.PI);ctx.strokeStyle=`rgba(207,221,226,${.12+i*.015})`;ctx.lineWidth=Math.max(1,w*.006);ctx.stroke()}
 ctx.fillStyle='#050b12';ctx.strokeStyle='#b6c4ca';ctx.lineWidth=Math.max(2,w*.009);
 ctx.beginPath();ctx.ellipse(cx-rx*.38,cy+ry*.04,rx*.28,ry*.86,-.08,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.beginPath();ctx.ellipse(cx+rx*.38,cy+ry*.04,rx*.28,ry*.86,.08,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.fillStyle='#9daab0';ctx.beginPath();ctx.ellipse(cx,cy+ry*.12,rx*.19,ry*.38,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#07101a';ctx.beginPath();ctx.arc(cx,cy-ry*.56,rx*.085,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#96a7ae';ctx.lineWidth=Math.max(2,w*.012);ctx.beginPath();ctx.moveTo(cx,cy-ry*.45);ctx.lineTo(cx,cy-ry*.2);ctx.lineTo(cx-rx*.16,cy-ry*.05);ctx.moveTo(cx,cy-ry*.2);ctx.lineTo(cx+rx*.17,cy-.01*ry);ctx.stroke();
 ctx.fillStyle='#bac7cb';ctx.beginPath();ctx.ellipse(cx,cy+ry*.72,rx*.12,ry*.11,0,0,Math.PI*2);ctx.fill();
 ctx.restore()
}
function boardTexture(){
 const c=document.createElement('canvas');c.width=750;c.height=1000;const ctx=c.getContext('2d');
 imageBounds=null;
 ctx.fillStyle='#07111b';ctx.fillRect(0,0,c.width,c.height);
 ctx.fillStyle='#a9c8c0';ctx.font='bold 22px monospace';ctx.fillText(uploaded?'CHEST CT':'CHEST CT · DEMO',24,42);
 if(uploaded){
  const maxW=720,maxH=855,scale=Math.min(maxW/uploaded.width,maxH/uploaded.height),w=uploaded.width*scale,h=uploaded.height*scale,ix=(750-w)/2,iy=88+(855-h)/2;
  imageBounds={x:ix,y:iy,w,h};
  // The panel faces the opposite direction from the scan review image.
  // Turn the display 180 degrees to align both axes with the patient.
  ctx.save();ctx.translate(ix+w/2,iy+h/2);ctx.scale(-1,-1);ctx.filter='brightness(.92) contrast(1.12)';ctx.drawImage(uploaded,-w/2,-h/2,w,h);ctx.restore();
  ctx.fillStyle='rgba(4,12,21,.03)';ctx.fillRect(ix,iy,w,h);
 }else drawChestSlice(ctx,55,92,640,800);
 ctx.strokeStyle=uploaded?'rgba(61,212,227,.11)':'rgba(68,111,132,.22)';ctx.lineWidth=1;
 if(!uploaded)for(let i=1;i<10;i++){ctx.beginPath();ctx.moveTo(i*75,80);ctx.lineTo(i*75,920);ctx.stroke();ctx.beginPath();ctx.moveTo(20,80+i*84);ctx.lineTo(730,80+i*84);ctx.stroke()}
 ctx.fillStyle='#98b2c0';ctx.font='17px monospace';ctx.fillText('REVIEWED IMAGE POINT',24,972);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t
}
const surface=new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W,BOARD_D),new THREE.MeshBasicMaterial({map:boardTexture(),toneMapped:false}));surface.rotation.x=-Math.PI/2;surface.position.set(BOARD_CX,BOARD_TOP,BOARD_CZ);scene.add(surface);
const screenGlass=new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W,BOARD_D),new THREE.MeshPhysicalMaterial({color:0xbddfe4,transparent:true,opacity:.035,roughness:.13,metalness:.12,clearcoat:1,clearcoatRoughness:.08,side:THREE.DoubleSide,depthWrite:false}));screenGlass.rotation.x=-Math.PI/2;screenGlass.position.set(BOARD_CX,BOARD_TOP+.001,BOARD_CZ);scene.add(screenGlass);
// Contact reach is checked mathematically; no curve is drawn over the CT image.
const target=new THREE.Group();scene.add(target);const torus=new THREE.Mesh(new THREE.TorusGeometry(.16,.026,12,40),orange);torus.rotation.x=Math.PI/2;target.add(torus);box(.5,.018,.024,orange,target);box(.024,.018,.5,orange,target);
// The hand stays parked until a confirmed target starts the three-motor approach.
const home={yaw:-1.25,pitch:-.18,elbow:.28};let pose={...home},animation=null,arrived=false;
function apply(){base.rotation.y=-pose.yaw;shoulder.rotation.z=pose.pitch;elbow.rotation.z=pose.elbow;$('yaw').textContent=(pose.yaw*180/Math.PI).toFixed(1)+'°';$('pitch').textContent=(pose.pitch*180/Math.PI).toFixed(1)+'°';$('elbow').textContent=(pose.elbow*180/Math.PI).toFixed(1)+'°'}apply();
const nearRadius=BOARD_X0,farRadius=Math.hypot(BOARD_X1,Math.max(Math.abs(BOARD_Z0),Math.abs(BOARD_Z1)));
function targetElbow(radius){const fraction=Math.max(0,Math.min(1,(radius-nearRadius)/(farRadius-nearRadius)));return -.40+.52*fraction}
function getTargetInfo(){
 const rawX=$('x').value,rawY=$('y').value,x=Number(rawX),y=Number(rawY);
 if(rawX===''||rawY===''||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>100||y<0||y>100){target.visible=false;return {kind:'invalid'}}
 // Mirror both coordinates with the CT display, keeping the marker on its pixel.
 const u=imageBounds?(imageBounds.x+(1-x/100)*imageBounds.w)/750:1-x/100;
 const v=imageBounds?(imageBounds.y+(1-y/100)*imageBounds.h)/1000:1-y/100;
 const wx=BOARD_X0+u*BOARD_W,wz=BOARD_Z0+v*BOARD_D,r=Math.hypot(wx-BASE_X,wz);
 const plan=planContact(r,BOARD_TOP,ELBOW_X,FOREARM_LENGTH,toolDrop(),targetElbow(r));
 target.visible=true;target.position.set(wx,BOARD_TOP+.014,wz);
 if(!plan)return {kind:'out',x,y,wx,wz,r};
 // Stationary setup sets the virtual mast before the three motors animate.
 setShoulderHeight(plan.shoulderHeight);
 return {kind:'contact',x,y,wx,wz,r,...plan};
}
function destination(){const q=getTargetInfo();if(q.kind!=='contact')return null;return {yaw:Math.atan2(q.wz,q.wx-BASE_X),pitch:q.pitch,elbow:q.elbow,kind:'contact'}}
function updateTargetUi(){
 const q=getTargetInfo(),el=$('reachability');
 const texts={invalid:'Confirm a point on the scan page to begin.',contact:'Confirmed point placed on the CT.',out:'The selected point is outside the arm reach.'};
 el.textContent=texts[q.kind];el.className='reachability '+(q.kind==='contact'?'good':q.kind==='invalid'?'bad':'warn');
 return q;
}
function syncControls(){const busy=Boolean(animation);$('toolType').disabled=busy;$('run').disabled=busy||!confirmedHandoff;$('reset').disabled=busy||!confirmedHandoff}
function move(to,returning=false){const angularTravel=Math.max(Math.abs(to.yaw-pose.yaw),Math.abs(to.pitch-pose.pitch),Math.abs(to.elbow-pose.elbow));animation={from:{...pose},to,start:performance.now(),duration:2800+Math.min(.9,angularTravel)*650,returning};arrived=false;syncControls();$('status').textContent=returning?'Parking arm…':'Moving to reviewed point…';$('state').textContent='Moving'}
let queuedApproach=false,pendingTool=null;
function applySelectedTool(){
 selectedTool=$('toolType').value;
 selectedToolLength=TOOL_PRESETS[selectedTool].length;
 setInstrumentLength(selectedToolLength);
 $('toolLabel').textContent=`${TOOL_PRESETS[selectedTool].label} needle selected. The arm path adjusts to its length.`;
}
function startApproach(){const d=destination();if(d)move(d);else{$('status').textContent='Target outside reach.';syncControls()}}
$('reset').onclick=()=>{if(!animation){queuedApproach=false;pendingTool=null;move(home,true)}};
$('run').onclick=()=>{if(!confirmedHandoff||animation)return;if(arrived){queuedApproach=true;move(home,true)}else startApproach()};
$('toolType').onchange=()=>{
 if(animation)return;
 if(confirmedHandoff&&arrived){pendingTool=$('toolType').value;queuedApproach=true;move(home,true);return}
 applySelectedTool();
 if(confirmedHandoff){updateTargetUi();$('status').textContent='Tool updated. Replay when ready.'}
};
function redrawUploadedImage(){if(!uploaded)return;const old=surface.material.map;surface.material.map=boardTexture();surface.material.needsUpdate=true;if(old)old.dispose()}
syncControls();
$('overview').onclick=()=>{camera.position.set(9.3,13.6,10.2);controls.target.set(2.9,2.3,.1)};$('top').onclick=()=>{camera.position.set(3,15,.01);controls.target.set(3,0,0)};
$('capture').onclick=()=>{renderer.render(scene,camera);const a=document.createElement('a');a.download='CellGuard-3D-visualization.png';a.href=canvas.toDataURL('image/png');a.click()};
const observer=new ResizeObserver(()=>{const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()});observer.observe(canvas);
// Enlarge the patient, stretcher, CT panel, and robot together inside the room.
const assemblyScale=1.16,assembly=new THREE.Group();
for(const object of scene.children.slice(roomChildCount))assembly.add(object);
assembly.scale.setScalar(assemblyScale);
assembly.position.set(BED_X*(1-assemblyScale),floorY*(1-assemblyScale),BED_Z*(1-assemblyScale));
scene.add(assembly);

async function loadConfirmedTarget(){
 const id=new URLSearchParams(window.location.search).get('handoff');
 if(!id){
  $('status').textContent='Arm parked. Confirm a scan point to begin.';
  $('state').textContent='No target';
  $('reachability').textContent='Confirm a point on the scan page to begin.';
  syncControls();
  return;
 }
 history.replaceState(null,'','/3d/');
 try{
  const handoff=await consumeHandoff(id);
  if(!handoff||!(handoff.file instanceof Blob)||!['image/png','image/jpeg'].includes(handoff.file.type)||
     !['benign','malignant'].includes(handoff.scanClass)||!['ai','manual'].includes(handoff.source)||
     !Number.isInteger(handoff.width)||!Number.isInteger(handoff.height)||handoff.width<1||handoff.height<1||
     !Number.isFinite(handoff.x)||!Number.isFinite(handoff.y)||handoff.x<0||handoff.y<0||
     handoff.x>=handoff.width||handoff.y>=handoff.height)throw new Error('Invalid handoff');
  const url=URL.createObjectURL(handoff.file),img=new Image();
  try{img.src=url;await img.decode()}finally{URL.revokeObjectURL(url)}
  if(img.naturalWidth!==handoff.width||img.naturalHeight!==handoff.height)throw new Error('Image size changed');
  uploaded=img;confirmedHandoff=true;
  redrawUploadedImage();
  $('x').value=(handoff.x/Math.max(1,handoff.width-1)*100).toFixed(4);
  $('y').value=(handoff.y/Math.max(1,handoff.height-1)*100).toFixed(4);
  $('displayX').textContent=`${handoff.x.toFixed(1)} px`;
  $('displayY').textContent=`${handoff.y.toFixed(1)} px`;
  $('targetDetails').textContent=`${handoff.scanClass[0].toUpperCase()+handoff.scanClass.slice(1)} · ${handoff.source==='ai'?'AI point':'Marked point'} · ${handoff.width} × ${handoff.height} image`;
  $('motionHelp').textContent='Change needle length to rerun the approach with that tool.';
  $('sceneBadge').textContent='Reviewed target loaded';$('sceneBadge').classList.add('active');
  const monitorCanvas=monitorScreen.material.map.image,monitorCtx=monitorCanvas.getContext('2d');
  monitorCtx.fillStyle='#07131f';monitorCtx.fillRect(332,76,304,48);
  monitorCtx.fillStyle='#42e7ee';monitorCtx.font='20px monospace';monitorCtx.fillText('TARGET  •  CONFIRMED',338,105);
  monitorScreen.material.map.needsUpdate=true;
  const d=destination();
  if(!d)throw new Error('Target outside reach');
  updateTargetUi();
  move(d);
 }catch{
  confirmedHandoff=false;$('x').value='';$('y').value='';$('displayX').textContent='—';$('displayY').textContent='—';updateTargetUi();
  $('status').textContent='Target unavailable. Return to New scan and confirm again.';
  $('state').textContent='No target';
  $('reachability').textContent='Return to New scan to confirm a target.';
  $('sceneBadge').textContent='Awaiting confirmed target';$('sceneBadge').classList.remove('active');
  syncControls();
 }
}
updateTargetUi();
void loadConfirmedTarget();
function tick(now){
 requestAnimationFrame(tick);
 if(animation){
  const t=Math.min(1,(now-animation.start)/animation.duration);
  // Quintic easing starts and stops gently; the small pitch arc keeps one continuous, coordinated approach.
  const u=t*t*t*(t*(t*6-15)+10),lift=(animation.returning ? .025 : .045)*Math.sin(Math.PI*u);
  pose.yaw=animation.from.yaw+(animation.to.yaw-animation.from.yaw)*u;
  pose.pitch=animation.from.pitch+(animation.to.pitch-animation.from.pitch)*u+lift;
  const elbowPhase=Math.max(0,Math.min(1,(u-.10)/.90));
  const elbowEase=elbowPhase*elbowPhase*elbowPhase*(elbowPhase*(elbowPhase*6-15)+10);
  pose.elbow=animation.from.elbow+(animation.to.elbow-animation.from.elbow)*elbowEase;
  apply();$('progress').style.width=(t*100)+'%';
  if(t===1){
   const ret=animation.returning;animation=null;arrived=!ret;
   $('state').textContent=ret?'Parked':'At target';
   $('status').textContent=ret?'Arm parked. Choose a tool or replay.':'Needle tip at the reviewed CT point.';
   if(ret)$('progress').style.width='0%';
   if(ret&&pendingTool){applySelectedTool();pendingTool=null;updateTargetUi()}
   if(ret&&queuedApproach){queuedApproach=false;startApproach()}
   else syncControls();
  }
 }
 shoulderGlow.emissiveIntensity=animation ? .55+.55*(.5+.5*Math.sin(now*.012)) : .34;
 elbowGlow.emissiveIntensity=animation ? .65+.55*(.5+.5*Math.sin(now*.016)) : .35;
 torus.scale.setScalar(animation?1+.12*Math.sin(now*.012):1+.035*Math.sin(now*.0028));
 scene.updateMatrixWorld();controls.update();renderer.render(scene,camera)
}
requestAnimationFrame(tick);
