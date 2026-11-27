import * as THREE from 'three';

const appearance = {
  idle: [0.27,0.08,1,0], activating:[1.48,0.48,0.9,1],
  listening:[0.65,0.42,1.02,0], thinking:[1.12,0.55,1.01,0],
  speaking:[0.8,0.45,1.04,0], executing:[1.38,0.54,0.97,0.5],
  error:[0.66,0.82,1.01,1], sleep:[0.04,0,0.88,0]
};

const vert = `
  attribute float seed;
  attribute float layer;
  uniform float t, energy, audio, pix, pulse;
  varying float vSeed, vLayer, facing, stripe;
  void main(){
    vec3 n = normalize(position);
    float wave = sin(n.y * 12. + n.z * 7. - t * 2.7 + layer * 1.2);
    float mesh = cos(n.x * 14. + n.y * 8. + t * 1.25);
    float sweep = sin(n.y * 6.4 - t * 2.0 - layer);
    float drift = 0.009 + 0.037 * energy + audio * .105;
    vec3 p = position + n * (wave * drift + mesh * drift * .45 + pulse * .035 * sin(length(position)*10. - t*10.));
    if(layer > 3.5) p += n * sin(t*.7 + seed * 37.) * .048;
    vec4 mv = modelViewMatrix * vec4(p,1.);
    vec3 sn = normalize(normalMatrix * n);
    facing = dot(sn,normalize(-mv.xyz));
    stripe = pow(max(0.,sweep),9.);
    vSeed = seed;
    vLayer = layer;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp((1.65 + seed * seed * 3.8 + stripe * .48 + audio * .55) * pix * (3.8 / -mv.z),1.,11.);
  }`;
const frag = `
  uniform float fade, energy, pulse;
  varying float vSeed, vLayer, facing, stripe;
  void main(){
    float r = length(gl_PointCoord - .5);
    if(r > .49) discard;
    vec3 crimson = vec3(.96,.045,.191);
    vec3 white = vec3(1.,.92,.95);
    float whiteMix = smoothstep(.75,.99,vSeed) * .7 + stripe*.25 + max(0.,facing)*.10;
    vec3 c = mix(crimson,white,whiteMix);
    float core = smoothstep(.31,.025,r);
    float halo = smoothstep(.49,.12,r);
    float a = (core + .36*halo) * (.34 + .45*vSeed + stripe*.26 + pulse*.12);
    if(vLayer > 3.5) a *= .38;
    else a *= .39 + .61*smoothstep(-.65,.63,facing);
    if(vLayer < 1.8) a *= .56;
    gl_FragColor = vec4(c, a * fade * (.87 + .13 * energy));
  }`;

function makeParticles() {
  const rings = [0.5,0.71,0.88,1.0];
  const counts = [1700,2300,3200,5200];
  const total = counts.reduce((a,b) => a+b,0) + 650;
  const positions = new Float32Array(total*3), seeds = new Float32Array(total), layers = new Float32Array(total);
  let randomState = 12851;
  function random() {
    randomState = (Math.imul(1664525,randomState) + 1013904223) >>> 0;
    return randomState / 4294967296;
  }
  for (let i = 0; i < total; i++) {
    const pick = random();
    let layer = pick < .41 ? 3 : pick < .65 ? 2 : pick < .82 ? 1 : pick < .95 ? 0 : 4;
    const z = 2 * random() - 1;
    const a = 2 * Math.PI * random();
    const radial = Math.sqrt(1 - z*z);
    const radius = layer === 4 ? 1.13 + Math.pow(random(),1.65) * 0.77 : rings[layer] + (random() - .5)*.075;
    positions.set([radius*radial*Math.cos(a),radius*z,radius*radial*Math.sin(a)],i*3);
    seeds[i] = random();
    layers[i] = layer;
  }
  return new THREE.BufferGeometry()
    .setAttribute('position',new THREE.BufferAttribute(positions,3))
    .setAttribute('seed',new THREE.BufferAttribute(seeds,1))
    .setAttribute('layer',new THREE.BufferAttribute(layers,1));
}

function orbit(radius, divisions, visible, color, opacity) {
  const positions = [];
  for (let i = 0; i < divisions; i++) {
    if (!visible(i)) continue;
    for (const tick of [i,i+0.89]) {
      const a = tick / divisions * 2 * Math.PI;
      positions.push(Math.cos(a)*radius,Math.sin(a)*radius,0);
    }
  }
  const geometry = new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const material = new THREE.LineBasicMaterial({color,opacity,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  return new THREE.LineSegments(geometry,material);
}

export function hologram(container,wave) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
  } catch {
    const label = document.createElement('p');
    label.textContent = 'WebGL is unavailable. Conversation controls are still available.';
    label.className = 'gpu-error';
    container.append(label);
    return {phase() {}, mic() {}, attach() {}, detach() {}};
  }
  renderer.setClearColor(0x000000,0);
  renderer.setPixelRatio(Math.min(1.75,window.devicePixelRatio || 1));
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37,1,.1,50);
  const group = new THREE.Group();
  scene.add(group);
  const uniforms = {t:{value:0},pix:{value:renderer.getPixelRatio()},energy:{value:.1},audio:{value:0},fade:{value:1},pulse:{value:0}};
  const geometry = makeParticles();
  const count = geometry.attributes.position.count;
  const cloud = new THREE.Points(geometry,new THREE.ShaderMaterial({
    uniforms,vertexShader:vert,fragmentShader:frag,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending
  }));
  group.add(cloud);

  const orbits = new THREE.Group();
  const outer = orbit(1.55,260,i => i%19 < 16,0xef85a2,.55);
  const inner = orbit(1.19,220,i => i%32 < 24,0xff3670,.57);
  const mid = orbit(1.33,220,i => i%40 < 35,0xf5d9e4,.65);
  const dial = orbit(1.79,260,i => i%6 === 0,0xff9cbc,.46);
  const meridian = orbit(1.68,240,i => i%59 < 22,0x9d2a49,.53);
  const orbitsList = [mid,outer,inner,dial,meridian];
  orbits.add(...orbitsList);
  group.add(orbits);
  const pulseRing = orbit(1.1,180,i => i%8 !== 7,0xff436b,0);
  pulseRing.rotation.x = 0.85;
  group.add(pulseRing);

  const pointer = new THREE.Vector2();
  const size = new THREE.Vector3();
  container.parentElement.addEventListener('pointermove',event => {
    const rect = container.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width-.5,(event.clientY-rect.top)/rect.height-.5);
  });
  container.parentElement.addEventListener('pointerleave',() => pointer.set(0,0));

  let phase = 'idle', entered = performance.now(), last = 0, spin = 0, speed = .27, quality = count;
  let totalTime = 0, frames = 0, mic = 0, frame = 0, audioCtx, analyser, source, pcm, spectrum;
  const g = wave.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  function resize() {
    const {width,height} = container.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.position.z = Math.max(5.5,6.2/camera.aspect);
    camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
    const ratio = renderer.getPixelRatio();
    wave.width = Math.round(wave.clientWidth*ratio);
    wave.height = Math.round(wave.clientHeight*ratio);
  }
  new ResizeObserver(resize).observe(container);

  function drawWave(t,level) {
    const {width:w,height:h} = wave;
    if (!w || !h) return;
    g.clearRect(0,0,w,h);
    g.strokeStyle = level > .07 ? '#ef5a7b' : '#aa7385';
    g.lineWidth = 1.1*renderer.getPixelRatio();
    g.beginPath();
    for (let i=0; i<80; i++) {
      const x = i/79;
      const envelope = Math.pow(Math.sin(Math.PI*x),1.5);
      const sample = pcm && source ? (pcm[Math.floor(x*(pcm.length-1))]-128)/128 :
        Math.sin(x*45-t*9) * (.10 + level*.9) + Math.sin(x*81+t*12)*level*.5;
      const y = h/2 + sample*envelope*h*.44;
      if (i === 0) g.moveTo(0,y);
      else g.lineTo(x*w,y);
    }
    g.stroke();
  }
  function loop(now) {
    frame = requestAnimationFrame(loop);
    if (document.hidden) return;
    const elapsed = now-last;
    if (reduced.matches && elapsed < 55) return;
    if (last && elapsed < 12) return;
    const dt = Math.min(elapsed || 16,70)/1000;
    last = now;
    if (!reduced.matches && elapsed > 10 && elapsed < 100) {
      totalTime += elapsed;
      if (++frames === 95) {
        const avg = totalTime/frames;
        quality = avg > 24 ? Math.max(3400,Math.floor(quality*.78)) : avg < 19 ? Math.min(count,quality+850) : quality;
        geometry.setDrawRange(0,quality);
        frames = totalTime = 0;
      }
    }

    let level = 0;
    if (phase === 'listening') level = mic;
    if (phase === 'speaking' && analyser && source) {
      analyser.getByteTimeDomainData(pcm);
      analyser.getByteFrequencyData(spectrum);
      let square = 0, high = 0;
      for (const sample of pcm) square += ((sample-128)/128)**2;
      for (let i=32; i<100; i++) high += spectrum[i];
      level = Math.min(1,Math.sqrt(square/pcm.length)*2.55 + high/19000);
    }
    if (phase === 'listening') mic *= Math.pow(.22,dt);
    const [targetSpeed,energy,scale,flash] = appearance[phase] || appearance.idle;
    const ease = Math.min(1,dt*4);
    const since = (now-entered)/1000;
    const pulse = flash * Math.max(0,1 - since/1.1);
    speed += (targetSpeed-speed)*ease;
    spin += speed*dt*(reduced.matches ? .22 : 1);
    uniforms.t.value += dt*(.59+speed);
    uniforms.energy.value += (energy-uniforms.energy.value)*ease;
    uniforms.audio.value += (level-uniforms.audio.value)*Math.min(1,dt*12);
    uniforms.fade.value += ((phase === 'sleep' ? 0 : 1)-uniforms.fade.value)*ease;
    uniforms.pulse.value = pulse;

    const targetScale = scale + level*.085 + (phase === 'activating' ? .3 * Math.exp(-since*6) : 0);
    group.scale.lerp(size.setScalar(targetScale),ease);
    group.rotation.x += ((pointer.y*.26)-group.rotation.x)*ease;
    group.rotation.y += ((pointer.x*.36)-group.rotation.y)*ease;
    cloud.rotation.y = spin*.41;
    cloud.rotation.z = Math.sin(spin*.25)*.19;
    mid.rotation.set(1.05,spin*.19,-.45+spin*.12);
    outer.rotation.set(.78,-spin*.23,1.02-spin*.08);
    inner.rotation.set(1.42,spin*.24,-1.0);
    dial.rotation.set(.03,.06,-spin*.07);
    meridian.rotation.set(.46,.3,-.3+spin*.12);
    orbitsList.forEach((orbit,index) => { orbit.material.opacity = uniforms.fade.value * ([.58,.43,.54,.32,.40][index] + level*.12 + pulse*.13); });
    pulseRing.material.opacity = pulse*.52;
    pulseRing.scale.setScalar(1+since*.62);
    drawWave(uniforms.t.value,uniforms.audio.value);
    renderer.render(scene,camera);
  }
  frame = requestAnimationFrame(loop);
  function resume() { last = performance.now(); }
  document.addEventListener('visibilitychange',resume);
  renderer.domElement.addEventListener('webglcontextlost',event => {
    event.preventDefault();
    cancelAnimationFrame(frame);
  });
  renderer.domElement.addEventListener('webglcontextrestored',() => { frame = requestAnimationFrame(loop); });

  return {
    phase(next) { if (next !== phase) { phase = next; entered = performance.now(); } },
    mic(level) { mic = Math.max(0,Math.min(1,level)); },
    async attach(element) {
      audioCtx ||= new AudioContext();
      analyser ||= audioCtx.createAnalyser();
      analyser.fftSize = 512;
      pcm = new Uint8Array(analyser.fftSize);
      spectrum = new Uint8Array(analyser.frequencyBinCount);
      source = audioCtx.createMediaElementSource(element);
      source.connect(analyser);
      analyser.disconnect();
      analyser.connect(audioCtx.destination);
      await audioCtx.resume();
    },
    detach() {
      source?.disconnect();
      source = undefined;
    }
  };
}
