import {consumeHandoff} from '/handoff.js';
import {CANDIDATE_PROFILE, COMMAND_TIP_TOLERANCE_CM, USER_REPORTED_SERVO_CALIBRATION, USER_REPORTED_REACHABILITY, REPORTED_STRAIGHT_UP_REFERENCE, imagePixelToGrid, solveGridPoint, servoCommandsToPose, interpolateServoCommands} from './arm-candidate-kinematics.js?v=constrained-ik-v5';
import * as THREE from './three.module.js';
import {OrbitControls} from './OrbitControls.js';
import {RoomEnvironment} from './RoomEnvironment.js';
const $=id=>document.getElementById(id), canvas=$('view');
$('straightUpReference').textContent=`Reported straight-up geometry: ${REPORTED_STRAIGHT_UP_REFERENCE.baseShaftToTipCm.toFixed(1)} cm from base shaft to tip (${REPORTED_STRAIGHT_UP_REFERENCE.shoulderToTipCm.toFixed(1)} cm above shoulder). `;
$('calibrationReport').textContent=`Reported roles: B${USER_REPORTED_SERVO_CALIBRATION.referenceCommands.base}/S${USER_REPORTED_SERVO_CALIBRATION.referenceCommands.shoulder} home references, E${USER_REPORTED_SERVO_CALIBRATION.referenceCommands.elbow} park reference; together they align straight up. 85→95 directions: B left→right, S front→back, E back→front. Expert reports a 0–180° command range and says E${USER_REPORTED_REACHABILITY.centerPoseElbowValueDeg} is physically reachable, but the direct model-to-servo mapping remains unverified. If an exact IK branch exceeds the reported range, the simulator searches legal 0–180° joint combinations and reports whether one reaches within ${COMMAND_TIP_TOLERANCE_CM.toFixed(1)} cm; otherwise it shows the closest legal virtual pose and its miss. No value is sent to Arduino. This is not proof of safe travel, load, clearance, or hardware mapping. `;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0x07101a);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x07101a,25,65);
const studio=new RoomEnvironment(renderer);const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(studio,.05).texture;studio.dispose();pmrem.dispose();
const camera=new THREE.PerspectiveCamera(40,1,.1,100);camera.position.set(9.3,13.6,10.2);
const controls=new OrbitControls(camera,canvas);controls.target.set(3.15,2.3,.65);controls.enableDamping=true;controls.minDistance=6;controls.maxDistance=25;controls.maxPolarAngle=Math.PI/2-.03;
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
// Stylized operating-room bay: tiled floor, clinical walls, a bed-rail-mounted demo arm, and patient stretcher.
// Candidate dimensions are centimetres in the kinematics module. The room model
// renders those dimensions at 0.1 scene units per centimetre.
const BED_X=3.25,BED_Z=-.84;
const CM_TO_SCENE=.1;
// Keep the board centred over the thorax while moving the yaw housing outboard
// of the patient arm and scan surface. The compact bracket clamps to the left rail.
const BASE_X=BED_X-1.60,BASE_Z=BED_Z+1.55;
const BED_SIDE_X=BED_X-1.92;
const BOARD_X0=BASE_X+CANDIDATE_PROFILE.xMinCm*CM_TO_SCENE;
const BOARD_X1=BASE_X+CANDIDATE_PROFILE.xMaxCm*CM_TO_SCENE;
const BOARD_Z0=BASE_Z+CANDIDATE_PROFILE.yMinCm*CM_TO_SCENE;
const BOARD_Z1=BASE_Z+CANDIDATE_PROFILE.yMaxCm*CM_TO_SCENE;
const BOARD_W=BOARD_X1-BOARD_X0,BOARD_D=BOARD_Z1-BOARD_Z0,BOARD_CX=(BOARD_X0+BOARD_X1)/2,BOARD_CZ=(BOARD_Z0+BOARD_Z1)/2;
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
// The candidate yaw base is cantilevered from the left bed rail, not placed on
// a separate cart. This is a visual mounting bracket, not a build instruction.
box(.22,.22,.24,dark,scene,BED_SIDE_X,.59,BASE_Z);
const MOUNT_SPAN=BASE_X-BED_SIDE_X;
box(MOUNT_SPAN+.14,.12,.18,steel,scene,(BED_SIDE_X+BASE_X)/2,.61,BASE_Z);
box(.70,.12,.70,dark,scene,BASE_X,.61,BASE_Z);
cylinder(.34,.36,.12,white,scene,BASE_X,.61,BASE_Z);
cylinder(.32,.32,.025,cyan,scene,BASE_X,.681,BASE_Z);
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
// Candidate arm: base yaw, shoulder pitch, and elbow/distal-link pitch.
// Joint-reference and local direction signs follow the new user/expert report.
// The scene is drawn at 0.1 units per centimetre; the candidate solver stays in cm.
const BOARD_TOP=1.18;
const MODEL_THICKNESS_SCENE=CANDIDATE_PROFILE.modelThicknessCm*CM_TO_SCENE;
const ELBOW_X=CANDIDATE_PROFILE.upperLinkCm*CM_TO_SCENE;
const FOREARM_LENGTH=CANDIDATE_PROFILE.distalTipLengthCm*CM_TO_SCENE;
const NEEDLE_LENGTH=.16;
const TOOL_PRESETS={short:{length:.55,label:'Short'},standard:{length:.8,label:'Standard'},extended:{length:1.1,label:'Extended'}};
let selectedTool=TOOL_PRESETS[$('toolType').value] ? $('toolType').value : 'standard';
let selectedToolLength=TOOL_PRESETS[selectedTool].length;
$('toolLabel').textContent=`${TOOL_PRESETS[selectedTool].label} tip selected. Illustrative shape only; candidate reach stays fixed.`;
// The base-servo shaft is below the target top by the 4 cm block thickness.
// The shoulder is 9 cm above the top, giving about 13 cm shaft-to-shaft vertically.
const BASE_TO_SHOULDER_CM=CANDIDATE_PROFILE.modelThicknessCm+CANDIDATE_PROFILE.targetDropCm;
const BASE_AXIS_Y=BOARD_TOP-MODEL_THICKNESS_SCENE;
const FIXED_SHOULDER_HEIGHT=BASE_AXIS_Y+BASE_TO_SHOULDER_CM*CM_TO_SCENE;
const INITIAL_COLUMN_HEIGHT=FIXED_SHOULDER_HEIGHT-BASE_AXIS_Y;
const base=new THREE.Group();base.position.set(BASE_X,BASE_AXIS_Y,BASE_Z);scene.add(base);
rod([0,0,0],[0,INITIAL_COLUMN_HEIGHT,0],.22,.18,white,base);sphere(.36,white,base,0,.25,0,1,1.15,1);
const shoulder=new THREE.Group();shoulder.position.set(0,INITIAL_COLUMN_HEIGHT,0);base.add(shoulder);
sphere(.27,white,shoulder,0,0,0,1.08,1.05,.9);
const cap=cylinder(.16,.16,.10,joint,shoulder,0,0,.24);cap.rotation.x=Math.PI/2;
const shoulderGlow=new THREE.MeshStandardMaterial({color:0x69b3a6,emissive:0x357c75,emissiveIntensity:.34});
const ring=new THREE.Mesh(new THREE.TorusGeometry(.18,.022,10,40),shoulderGlow);ring.position.set(0,0,.30);shoulder.add(ring);
rod([.16,0,0],[ELBOW_X,0,0],.19,.14,white,shoulder);
sphere(.24,white,shoulder,ELBOW_X,0,0,1.12,1.05,1.12);
const elbow=new THREE.Group();elbow.position.set(ELBOW_X,0,0);shoulder.add(elbow);
const motorBody=cylinder(.19,.19,.14,dark,shoulder,ELBOW_X,0,.25);motorBody.rotation.x=Math.PI/2;
const motorCap=cylinder(.17,.17,.08,joint,elbow,0,0,.29);motorCap.rotation.x=Math.PI/2;
const elbowGlow=new THREE.MeshStandardMaterial({color:0x69b3a6,emissive:0x357c75,emissiveIntensity:.35});
const motorRing=new THREE.Mesh(new THREE.TorusGeometry(.16,.024,10,40),elbowGlow);motorRing.position.set(0,0,.34);elbow.add(motorRing);
box(.13,.035,.025,cyan,elbow,.08,0,.36);
let distalBody=null,instrumentShaft=null,instrumentTip=null;
const needleMaterial=new THREE.MeshPhysicalMaterial({color:0xd3dee3,metalness:.92,roughness:.14,clearcoat:1,clearcoatRoughness:.08});
function disposeArmPart(part){if(!part)return;elbow.remove(part);part.geometry?.dispose()}
function setInstrumentLength(length){
 disposeArmPart(distalBody);disposeArmPart(instrumentShaft);disposeArmPart(instrumentTip);
 const shaftStart=FOREARM_LENGTH-length;
 distalBody=rod([.14,0,0],[shaftStart,0,0],.15,.12,white,elbow);
 instrumentShaft=rod([shaftStart,0,0],[FOREARM_LENGTH-NEEDLE_LENGTH,0,0],.047,.032,needleMaterial,elbow);
 instrumentTip=new THREE.Mesh(new THREE.ConeGeometry(.032,NEEDLE_LENGTH,24),needleMaterial);
 instrumentTip.rotation.z=-Math.PI/2;
 instrumentTip.position.set(FOREARM_LENGTH-NEEDLE_LENGTH/2,0,0);
 instrumentTip.castShadow=true;instrumentTip.receiveShadow=true;elbow.add(instrumentTip);
}
setInstrumentLength(selectedToolLength);
// Fixed decorative wrist details; there is no fourth animated axis.
cylinder(.11,.10,.07,dark,elbow,FOREARM_LENGTH-.20,0,0);
cylinder(.09,.08,.06,joint,elbow,FOREARM_LENGTH-.10,0,0);


// Mechanical details: recessed shoulder fasteners, housing seams, and mount bolts.
const seamMat=mat(0x7d8a91,.45,.48);
function circularSeam(radius,tube,parent,x,y,z,axis='z'){
 const o=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,10,64),seamMat);
 o.position.set(x,y,z);if(axis==='y')o.rotation.x=Math.PI/2;if(axis==='x')o.rotation.y=Math.PI/2;parent.add(o);return o;
}
circularSeam(.21,.012,shoulder,0,0,.23);
circularSeam(.21,.012,shoulder,0,0,-.23);
const armMarkCanvas=document.createElement('canvas');armMarkCanvas.width=512;armMarkCanvas.height=128;
const am=armMarkCanvas.getContext('2d');am.clearRect(0,0,512,128);am.fillStyle='#34434b';am.font='bold 51px sans-serif';am.textBaseline='middle';am.fillText('CG',16,72);
const armMarkTexture=new THREE.CanvasTexture(armMarkCanvas);armMarkTexture.colorSpace=THREE.SRGBColorSpace;
const armMark=new THREE.Mesh(new THREE.PlaneGeometry(.32,.08),new THREE.MeshBasicMaterial({map:armMarkTexture,transparent:true,toneMapped:false,side:THREE.DoubleSide}));armMark.position.set(.66,.08,.22);shoulder.add(armMark);
for(const z of [.27,-.27])for(let i=0;i<4;i++){
 const a=Math.PI/4+i*Math.PI/2,x=.20*Math.cos(a),y=.20*Math.sin(a);
 const screw=cylinder(.018,.018,.014,joint,shoulder,x,y,z);screw.rotation.x=Math.PI/2;
 box(.02,.005,.005,dark,shoulder,x,y,z+Math.sign(z)*.01);
}
circularSeam(.43,.012,scene,BASE_X,.67,BASE_Z,'y');
for(let i=0;i<4;i++){const a=Math.PI/4+i*Math.PI/2;cylinder(.035,.035,.025,joint,scene,BASE_X+.34*Math.cos(a),.67,BASE_Z+.34*Math.sin(a));}
// Fine casing separation near the candidate distal link end.
circularSeam(.14,.009,elbow,FOREARM_LENGTH-.22,0,0,'x');
// Identification plaque on the front of the pedestal.
const plaqueCanvas=document.createElement('canvas');plaqueCanvas.width=512;plaqueCanvas.height=128;
const pc=plaqueCanvas.getContext('2d');pc.fillStyle='#263846';pc.fillRect(0,0,512,128);pc.fillStyle='#eaf7fa';pc.font='bold 48px sans-serif';pc.fillText('CELLGUARD',24,63);pc.fillStyle='#69d9e6';pc.font='22px sans-serif';pc.fillText('CG-02 / POSITIONING CONCEPT',24,104);
const plaqueTexture=new THREE.CanvasTexture(plaqueCanvas);plaqueTexture.colorSpace=THREE.SRGBColorSpace;
const plaque=new THREE.Mesh(new THREE.PlaneGeometry(.66,.165),new THREE.MeshStandardMaterial({map:plaqueTexture,roughness:.55}));plaque.position.set(0,.84,.55);base.add(plaque);

// CT image-board overlay sits over the patient's thorax; X/Y map across the panel.
// Show the built 4 cm target-block thickness; its rendered top is the contact plane.
box(BOARD_W+.16,.08,BOARD_D+.16,mat(0x637989,.72,.3),scene,BOARD_CX,BOARD_TOP-MODEL_THICKNESS_SCENE+.04,BOARD_CZ);
box(BOARD_W+.12,MODEL_THICKNESS_SCENE,BOARD_D+.12,mat(0x172a38,.62,.29),scene,BOARD_CX,BOARD_TOP-MODEL_THICKNESS_SCENE/2,BOARD_CZ);
for(const x of [BOARD_X0-.035,BOARD_X1+.035])for(const z of [BOARD_Z0-.035,BOARD_Z1+.035])cylinder(.028,.028,.012,joint,scene,x,BOARD_TOP-.002,z);
let uploaded=null,confirmedHandoff=false,candidatePointValid=false;
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
 const c=document.createElement('canvas');c.width=1000;c.height=1000;const ctx=c.getContext('2d');
 ctx.fillStyle='#07111b';ctx.fillRect(0,0,c.width,c.height);
 // Rotate the scan or illustrative placeholder 180 degrees for the bed-facing
 // view. The candidate grid-to-board mapping applies the same reversal, keeping
 // a selected point and its marker aligned in either display state.
 ctx.save();ctx.translate(c.width,c.height);ctx.scale(-1,-1);
 if(uploaded){ctx.filter='brightness(.72) contrast(.92)';ctx.drawImage(uploaded,0,0,c.width,c.height)}
 else drawChestSlice(ctx,55,55,890,890);
 ctx.restore();
 if(uploaded){ctx.fillStyle='rgba(0,0,0,.20)';ctx.fillRect(0,0,c.width,c.height)}
 ctx.strokeStyle='rgba(68,111,132,.18)';ctx.lineWidth=1;
 for(let i=1;i<10;i++){
  ctx.beginPath();ctx.moveTo(i*100,0);ctx.lineTo(i*100,1000);ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,i*100);ctx.lineTo(1000,i*100);ctx.stroke();
 }
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t
}
const surface=new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W,BOARD_D),new THREE.MeshBasicMaterial({map:boardTexture(),toneMapped:false}));surface.rotation.x=-Math.PI/2;surface.position.set(BOARD_CX,BOARD_TOP,BOARD_CZ);scene.add(surface);
// Contact reach is checked with the candidate inverse kinematics; no path is
// drawn over the display image and no browser command is sent to Arduino.
const target=new THREE.Group();scene.add(target);const torus=new THREE.Mesh(new THREE.TorusGeometry(.12,.018,10,32),orange);torus.rotation.x=Math.PI/2;target.add(torus);box(.32,.012,.018,orange,target);box(.018,.012,.32,orange,target);
const REFERENCE_COMMANDS=Object.freeze({base:CANDIDATE_PROFILE.baseReferenceDeg,shoulder:CANDIDATE_PROFILE.shoulderReferenceDeg,elbow:CANDIDATE_PROFILE.elbowReferenceDeg});
let commands={...REFERENCE_COMMANDS},pose=servoCommandsToPose(commands,CANDIDATE_PROFILE),animation=null,arrived=false;
function apply(){
 pose=servoCommandsToPose(commands,CANDIDATE_PROFILE);
 base.rotation.y=-pose.yawRad;shoulder.rotation.z=pose.shoulderRad;elbow.rotation.z=pose.elbowRelativeRad;
 $('yaw').textContent=`${commands.base}°`;$('pitch').textContent=`${commands.shoulder}°`;$('elbow').textContent=`${commands.elbow}°`;
}
apply();
function getTargetInfo(){
 const rawX=$('x').value,rawY=$('y').value,gridX=Number(rawX),gridY=Number(rawY);
 if(rawX===''||rawY===''||!Number.isInteger(gridX)||!Number.isInteger(gridY)||gridX<0||gridX>99||gridY<0||gridY>99){
  target.visible=false;$('displayX').textContent='—';$('displayY').textContent='—';return {kind:'invalid'};
 }
 const solution=solveGridPoint(gridX,gridY,CANDIDATE_PROFILE);
 if(!Number.isFinite(solution.xCm)||!Number.isFinite(solution.yCm)){target.visible=false;return {kind:'invalid'}}
 const wx=BASE_X+solution.xCm*CM_TO_SCENE,wz=BASE_Z+solution.yCm*CM_TO_SCENE;
 target.visible=true;target.position.set(wx,BOARD_TOP+.014,wz);
 $('displayX').textContent=`${solution.xCm.toFixed(2)} cm`;$('displayY').textContent=`${solution.yCm.toFixed(2)} cm`;
 if(!solution.reachable)return {kind:'out',gridX,gridY,wx,wz,...solution};
 const kind=solution.withinCommandDomain?'contact'
  :solution.constrainedReachable?'constrained-tolerance':'limited-preview';
 return {kind,gridX,gridY,wx,wz,...solution};
}
function destination(q=getTargetInfo()){
 if(!['contact','constrained-tolerance','limited-preview'].includes(q.kind))return null;
 const c=q.previewCommands;
 if(!c)return null;
 return {base:c.base,shoulder:c.shoulder,elbow:c.elbow,kind:q.kind,previewMissCm:q.previewMissCm};
}
function updateTargetUi(){
 const q=getTargetInfo(),el=$('reachability');
 let text='';
 if(q.kind==='invalid')text='Enter integer grid values from 0 to 99, or confirm a scan point.';
 else if(q.kind==='contact')text='An exact IK branch fits the reported 0–180° command domain. Simulation only; this is not hardware approval.';
 else if(q.kind==='constrained-tolerance'){
  const raw=`B${q.baseCommand}/S${q.shoulderCommand}/E${q.elbowCommand}`;
  const adjusted=`B${q.previewCommands.base}/S${q.previewCommands.shoulder}/E${q.previewCommands.elbow}`;
  text=`Raw IK ${raw} exceeds 0–180°. Constrained IK adjusted the legal pose to ${adjusted}; model tip error is ${q.previewMissCm.toFixed(2)} cm (≤${COMMAND_TIP_TOLERANCE_CM.toFixed(1)} cm user-reported model tolerance). Simulation only; no hardware command.`;
 }else if(q.kind==='out')text='This point is outside the candidate link geometry.';
 else{
  const raw=`B${q.baseCommand}/S${q.shoulderCommand}/E${q.elbowCommand}`;
  const closest=`B${q.previewCommands.base}/S${q.previewCommands.shoulder}/E${q.previewCommands.elbow}`;
  text=`Raw IK ${raw} exceeds 0–180°. The constrained search tried legal B/S/E combinations; its closest virtual pose is ${closest}, but the tip still misses by ${q.previewMissCm.toFixed(2)} cm. The selected point is not reached. Simulation only; no hardware command.`;
 }
 el.textContent=text;el.className='reachability '+(q.kind==='contact'||q.kind==='constrained-tolerance'?'good':q.kind==='invalid'||q.kind==='out'?'bad':'warn');
 $('run').textContent=q.kind==='limited-preview'?'Preview closest legal pose':'Replay simulation';
 candidatePointValid=q.kind==='contact'||q.kind==='constrained-tolerance'||q.kind==='limited-preview';
 return q;
}
function syncControls(){
 const busy=Boolean(animation);
 $('toolType').disabled=busy;$('previewSpeed').disabled=busy;$('run').disabled=busy||!confirmedHandoff||!candidatePointValid;
 $('reset').disabled=busy||!confirmedHandoff;$('stopPreview').disabled=!busy;
}
function move(to,returning=false){
 const from={...commands},totalTicks=Math.max(Math.abs(to.base-from.base),Math.abs(to.shoulder-from.shoulder),Math.abs(to.elbow-from.elbow));
 const limited=!returning&&to.kind==='limited-preview';
 const constrained=!returning&&to.kind==='constrained-tolerance';
 const miss=Number.isFinite(to.previewMissCm)?to.previewMissCm:null;
 const limitedText=miss===null?'Closest legal virtual pose shown; target contact is not achieved.':`Closest legal virtual pose shown; predicted tip miss ${miss.toFixed(2)} cm. Target contact is not achieved.`;
 const constrainedText=miss===null?'Adjusted legal IK pose shown in the simulation only.':`Adjusted legal IK pose shown; model tip error ${miss.toFixed(2)} cm (within ${COMMAND_TIP_TOLERANCE_CM.toFixed(1)} cm user-reported model tolerance). No hardware command was sent.`;
 if(totalTicks===0){commands={base:to.base,shoulder:to.shoulder,elbow:to.elbow};apply();arrived=!returning;$('status').textContent=returning?'Reported straight-up reference restored in the 3D preview; no hardware HOME action.':limited?limitedText:constrained?constrainedText:'Candidate pose already reached in simulation only.';$('state').textContent=returning?'Reference':limited?'Limited preview':constrained?'Adjusted IK':'At target';syncControls();return}
 const speedMultiplier=Math.max(1,Number($('previewSpeed').value)||1);
 animation={from,to:{base:to.base,shoulder:to.shoulder,elbow:to.elbow},totalTicks,start:performance.now(),stepMs:CANDIDATE_PROFILE.stepMsPerDegree/speedMultiplier,returning,kind:to.kind,previewMissCm:miss};
 arrived=false;syncControls();$('status').textContent=returning?'Returning to the reported straight-up reference in the 3D preview…':limited?limitedText:constrained?'Moving to the constrained legal pose in the 3D preview…':'Moving to the candidate point in the 3D preview only…';$('state').textContent=limited?'Limited preview':constrained?'Adjusted IK':'Moving';
}
function applySelectedTool(){
 selectedTool=$('toolType').value;selectedToolLength=TOOL_PRESETS[selectedTool].length;
 setInstrumentLength(selectedToolLength);
 $('toolLabel').textContent=`${TOOL_PRESETS[selectedTool].label} visual preset. It does not change the fixed 17 cm candidate reach or joint commands.`;
}
function startApproach(){const d=destination();if(d)move(d);else{$('status').textContent='Candidate target is not reachable.';syncControls()}}
let queuedApproach=false;
function stopThreeAnimation(){
 if(animation){animation=null;queuedApproach=false;$('progress').style.width='0%';$('state').textContent='Stopped';$('status').textContent='3D preview stopped; current displayed pose retained.';syncControls()}
}
$('reset').onclick=()=>{if(!animation){queuedApproach=false;move(REFERENCE_COMMANDS,true)}};
$('stopPreview').onclick=stopThreeAnimation;
$('run').onclick=()=>{if(!confirmedHandoff||animation||!candidatePointValid)return;if(arrived){queuedApproach=true;move(REFERENCE_COMMANDS,true)}else startApproach()};
$('toolType').onchange=()=>{
 if(animation)return;
 applySelectedTool();
 if(confirmedHandoff){updateTargetUi();$('status').textContent='Illustrative tip appearance updated; candidate reach is unchanged.'}
};
function handleGridEdit(){
 const hasGrid=$('x').value!==''&&$('y').value!=='';
 const gx=Number($('x').value),gy=Number($('y').value);
 const validPair=hasGrid&&Number.isInteger(gx)&&Number.isInteger(gy)&&gx>=0&&gx<=99&&gy>=0&&gy<=99;
 if(validPair){
  confirmedHandoff=true;
  $('sceneBadge').textContent=uploaded?'Grid point adjusted in preview':'Manual demo-board point';
  $('sceneBadge').classList.add('active');
  $('targetDetails').textContent=uploaded
   ? 'Grid point adjusted manually in the 3D preview. Board coordinates only; no depth or patient coordinates.'
   : 'Manually entered 0–99 demo-board point. Not a CT target or patient coordinate.';
 }
 updateTargetUi();syncControls();
}
$('x').addEventListener('input',handleGridEdit);
$('y').addEventListener('input',handleGridEdit);
function redrawUploadedImage(){if(!uploaded)return;const old=surface.material.map;surface.material.map=boardTexture();surface.material.needsUpdate=true;if(old)old.dispose()}
syncControls();
$('overview').onclick=()=>{camera.position.set(9.3,13.6,10.8);controls.target.set(3.15,2.3,.65)};$('top').onclick=()=>{camera.position.set(3.15,15,.66);controls.target.set(3.15,0,.66)};
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
  $('status').textContent='User-reported straight-up reference shown in the 3D preview; hardware HOME remains locked.';
  $('state').textContent='No target';
  $('reachability').textContent='Enter integer grid values from 0 to 99, or confirm a point on the scan page.';
  syncControls();
  return;
 }
 history.replaceState(null,'','/3d/');
 try{
  const handoff=await consumeHandoff(id);
  if(!handoff||!(handoff.file instanceof Blob)||!['image/png','image/jpeg'].includes(handoff.file.type)||
     !['benign','malignant'].includes(handoff.scanClass)||!['ai','manual'].includes(handoff.source)||
     !Number.isInteger(handoff.width)||!Number.isInteger(handoff.height)||handoff.width<2||handoff.width>10000||handoff.height<2||handoff.height>10000||
     !Number.isFinite(handoff.x)||!Number.isFinite(handoff.y)||handoff.x<0||handoff.y<0||
     handoff.x>=handoff.width||handoff.y>=handoff.height)throw new Error('Invalid handoff');
  const url=URL.createObjectURL(handoff.file),img=new Image();
  try{img.src=url;await img.decode()}finally{URL.revokeObjectURL(url)}
  if(img.naturalWidth!==handoff.width||img.naturalHeight!==handoff.height)throw new Error('Image size changed');
  const gridX=imagePixelToGrid(handoff.x,handoff.width),gridY=imagePixelToGrid(handoff.y,handoff.height);
  if(gridX===null||gridY===null)throw new Error('Image point cannot be mapped to the demo grid');
  uploaded=img;confirmedHandoff=true;
  redrawUploadedImage();
  $('x').value=String(gridX);$('y').value=String(gridY);
  $('targetDetails').textContent=`${handoff.scanClass[0].toUpperCase()+handoff.scanClass.slice(1)} demo label · ${handoff.source==='ai'?'AI-suggested point':'manually marked point'} · human-confirmed 2D point · ${handoff.width} × ${handoff.height} image`;
  $('motionHelp').textContent='The scan is a dimmed display only. If raw IK exceeds 0–180°, the simulator searches legal B/S/E angles; if no pose reaches the point, it shows the closest legal pose and the remaining miss. No hardware command is sent.';
  $('hardwareStatus').textContent='Simulation-only candidate. The Arduino diagnostic sketch has servo output locked (disabled); no servo commands are sent.';
  $('sceneBadge').textContent='Human-reviewed point loaded';$('sceneBadge').classList.add('active');
  const monitorCanvas=monitorScreen.material.map.image,monitorCtx=monitorCanvas.getContext('2d');
  monitorCtx.fillStyle='#07131f';monitorCtx.fillRect(332,76,304,48);
  monitorCtx.fillStyle='#42e7ee';monitorCtx.font='20px monospace';monitorCtx.fillText('2D POINT  •  REVIEWED',338,105);
  monitorScreen.material.map.needsUpdate=true;
  const q=updateTargetUi(),d=destination(q);
  if(d&&(q.kind==='contact'||q.kind==='constrained-tolerance'))move(d);
  else if(d){
   $('state').textContent='Closest legal pose';
   $('status').textContent=`No legal 0–180° pose reaches this point under the current candidate geometry. The closest legal pose is ${q.previewMissCm.toFixed(2)} cm away; press Preview closest legal pose to inspect it. No Arduino command is sent.`;
  }else{
   $('state').textContent='Candidate target rejected';
   $('status').textContent='The candidate model cannot reach this point geometrically.';
  }
  syncControls();
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
  const step=Math.min(animation.totalTicks,Math.floor((now-animation.start)/animation.stepMs));
  commands=interpolateServoCommands(animation.from,animation.to,step,animation.totalTicks);
  apply();$('progress').style.width=(step/animation.totalTicks*100)+'%';
  if(step>=animation.totalTicks){
   const {returning,kind,previewMissCm}=animation;animation=null;arrived=!returning;
   const limited=kind==='limited-preview',constrained=kind==='constrained-tolerance';
   $('state').textContent=returning?'Reference':limited?'Closest legal pose':constrained?'Adjusted IK':'At target';
   $('status').textContent=returning?'Reported straight-up reference restored in the 3D preview; no hardware HOME action.':limited?`Closest legal 0–180° pose shown; predicted tip miss ${(previewMissCm??0).toFixed(2)} cm, so the selected point was not reached. No hardware command was sent.`:constrained?`Constrained legal pose shown; model tip error ${(previewMissCm??0).toFixed(2)} cm, within ${COMMAND_TIP_TOLERANCE_CM.toFixed(1)} cm user-reported model tolerance. No hardware command was sent.`:'Pointer tip reached the candidate point in the simulation only; no hardware command was sent.';
   if(returning)$('progress').style.width='0%';
   if(returning&&queuedApproach){queuedApproach=false;startApproach()}
   else syncControls();
  }
 }
 shoulderGlow.emissiveIntensity=animation ? .55+.55*(.5+.5*Math.sin(now*.012)) : .34;
 elbowGlow.emissiveIntensity=animation ? .65+.55*(.5+.5*Math.sin(now*.016)) : .35;
 torus.scale.setScalar(animation?1+.12*Math.sin(now*.012):1+.035*Math.sin(now*.0028));
 scene.updateMatrixWorld();controls.update();renderer.render(scene,camera)
}
requestAnimationFrame(tick);
