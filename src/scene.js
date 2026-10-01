import * as THREE from 'three';
import { getSeats, getObstacles, eyePosition, analyzeSightline } from './model.js';

const color = { seat: '#65544e', mint: '#c7ef7b', wood: '#55403a', dark: '#171820', rail: '#343b47' };

export class VenueViewer {
  constructor(container, onStatus) {
    this.container = container;
    this.onStatus = onStatus;
    this.view = { selected: 12, comparison: null, layout: 'theatre', mode: 'seat', eyeHeight: 1.2, overlay: false };
    this.yaw = 0; this.pitch = 0; this.renderCount = 0;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#151922');
    this.scene.fog = new THREE.Fog('#151922', 22, 44);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 60);
    this.cameraB = this.camera.clone();
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.25;
      this.canvas = this.renderer.domElement;
      this.canvas.tabIndex = 0;
      this.canvas.setAttribute('role', 'img');
      this.canvas.setAttribute('aria-label', '선택 좌석의 3D 시야. 드래그하거나 방향키로 둘러보세요.');
      container.append(this.canvas);
      this.canvas.addEventListener('webglcontextlost', event => {event.preventDefault(); onStatus('그래픽 연결이 끊겼습니다. 페이지를 새로고침하세요.');});
      this.canvas.addEventListener('webglcontextrestored', () => this.schedule());
      this.bindInteraction();
      this.resizeObserver = new ResizeObserver(() => this.schedule());
      this.resizeObserver.observe(container);
    } catch (error) {
      this.unavailable = true;
      const fallback = document.createElement('div');
      fallback.className = 'webgl-fallback';
      fallback.textContent = '이 브라우저에서는 3D를 실행할 수 없습니다. 좌석도와 가림 계산은 계속 이용할 수 있습니다. 정적 시야 이미지는 아직 준비되지 않았습니다.';
      container.append(fallback);
      onStatus('3D 실행 불가 · 좌석도 사용 가능');
    }
  }

  bindInteraction() {
    let start;
    this.canvas.addEventListener('pointerdown', event => {
      if (this.view.mode !== 'seat') return;
      this.canvas.setPointerCapture(event.pointerId);
      start = {x: event.clientX, y: event.clientY, yaw: this.yaw, pitch: this.pitch};
    });
    this.canvas.addEventListener('pointermove', event => {
      if (!start) return;
      this.yaw = Math.max(-0.8, Math.min(0.8, start.yaw - (event.clientX - start.x) * 0.004));
      this.pitch = Math.max(-0.35, Math.min(0.35, start.pitch + (event.clientY - start.y) * 0.003));
      this.schedule();
    });
    this.canvas.addEventListener('pointerup', () => {start = null;});
    this.canvas.addEventListener('pointercancel', () => {start = null;});
    this.canvas.addEventListener('keydown', event => {
      const actions = { ArrowLeft: [-0.08, 0], ArrowRight: [0.08, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] };
      if (actions[event.key] && this.view.mode === 'seat') {
        event.preventDefault();
        this.yaw = THREE.MathUtils.clamp(this.yaw + actions[event.key][0], -0.8, 0.8);
        this.pitch = THREE.MathUtils.clamp(this.pitch + actions[event.key][1], -0.35, 0.35);
        this.schedule();
      }
    });
  }

  material(hex, options = {}) { return new THREE.MeshStandardMaterial({color: hex, roughness: 0.8, metalness: 0.05, ...options}); }
  box(parent, size, position, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position); parent.add(mesh); return mesh;
  }
  cylinder(parent, radius, height, position, material, segments = 20) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
    mesh.position.set(...position); parent.add(mesh); return mesh;
  }

  rebuild(model, layout) {
    this.model = model; this.view.layout = layout; this.seats = getSeats(model);
    if (this.unavailable) return;
    if (this.root) {
      this.scene.remove(this.root);
      const geometries = new Set(), materials = new Set(), textures = new Set();
      this.root.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        for (const mat of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
          materials.add(mat); if (mat.map) textures.add(mat.map);
        }
      });
      geometries.forEach(x => x.dispose()); materials.forEach(x => x.dispose()); textures.forEach(x => x.dispose());
    }
    const root = this.root = new THREE.Group(); this.scene.add(root);
    root.add(new THREE.HemisphereLight('#f5eee3', '#303347', 2.2));
    const frontLight = new THREE.DirectionalLight('#ffdfbe', 3.5); frontLight.position.set(-5, 7, 4); root.add(frontLight);
    const stageLight = new THREE.PointLight('#d1efa3', 65, 14, 2); stageLight.position.set(0, 4.8, 0.6); root.add(stageLight);
    const rim = new THREE.PointLight('#8c9fe8', 35, 18, 2); rim.position.set(5, 6, -3); root.add(rim);
    const floor = this.material('#24262e'), wood = this.material(color.wood), wall = this.material('#28242a');
    const glow = this.material('#e0fdb8', { emissive: '#bbec80', emissiveIntensity: 1.5 });
    const metal = this.material('#555a63', {roughness: 0.35, metalness: 0.5});
    const venueWidth = Math.max(model.stageWidth + 2.2, ...this.seats.map(s => Math.abs(s.x) * 2 + 2));
    const railZ = getObstacles(model, layout).find(o => o.id === 'rail')?.position[2] ?? Math.min(...this.seats.map(s => s.z));
    const endZ = Math.max(...this.seats.map(s => s.z)) + 1.2;
    const stageHeight = model.stageHeight ?? 0.6;
    const floorHeight = Math.max(8.5, ...this.seats.map(s => s.floor + 3));
    this.camera.far = this.cameraB.far = Math.max(60, endZ * 3);
    this.scene.fog = new THREE.Fog('#151922', Math.max(22,endZ+5), Math.max(44,endZ*3));
    this.box(root, [venueWidth, 0.24, endZ + 6], [0, -0.13, (endZ - 6) / 2], floor);
    if (model.schemaVersion === 2) {
      // Row platforms are a stylized visual envelope, not unmeasured architectural reconstruction.
      for (const seat of this.seats) this.box(root, [0.85, Math.max(0.08,seat.floor), 1.1], [seat.x,seat.floor/2-0.04,seat.z], floor);
    } else {
    this.box(root, [venueWidth, model.balconyHeight, endZ - railZ + 0.7], [0, model.balconyHeight / 2 - 0.05, (railZ + endZ) / 2], floor);
    for (const row of [1, 3]) {
      const seat = this.seats[row * 5];
      this.box(root, [venueWidth - 1, row === 1 ? 0.24 : model.rowRise, 1.3], [0, seat.floor - (row === 1 ? 0.12 : model.rowRise / 2), seat.z + 0.13], floor);
      this.box(root, [venueWidth - 1.1, 0.023, 0.025], [0, seat.floor + 0.008, seat.z - 0.5], glow);
    }
    }
    this.box(root, [0.25, floorHeight, endZ + 6], [-venueWidth / 2, floorHeight/2-0.1, (endZ - 6) / 2], wall);
    this.box(root, [0.25, floorHeight, endZ + 6], [venueWidth / 2, floorHeight/2-0.1, (endZ - 6) / 2], wall);
    this.box(root, [venueWidth, floorHeight, 0.2], [0, floorHeight/2-0.1, -model.stageDepth-1.8], this.material('#11141c'));
    for (const side of [-1, 1]) {
      for (let z = -4; z < endZ; z += 0.6) this.box(root, [0.08, 7.2, 0.16], [side * (venueWidth / 2 - 0.16), 3.6, z], wood);
      this.box(root, [0.08, 0.07, endZ + 4], [side * (venueWidth / 2 - 0.25), 5.5, (endZ - 4) / 2], glow);
      for (let i = 0; i < 5; i++) this.box(root, [0.15, 6, 0.26], [side * (model.stageWidth / 2 + 0.65), 3, -1 - i * 0.75], this.material('#654750'));
    }
    const stage = new THREE.Group(); stage.position.x = model.stageOffset; root.add(stage);
    this.box(stage, [model.stageWidth + 0.8, Math.max(0.03,stageHeight), model.stageDepth], [0, stageHeight/2, -model.stageDepth / 2 + 0.4], wood);
    this.box(stage, [model.stageWidth + 0.7, 0.03, 0.04], [0, stageHeight+0.01, 0.39], glow);
    this.box(stage, [model.stageWidth - 0.4, 0.03, model.stageDepth - 0.3], [0, stageHeight+0.01, -model.stageDepth / 2 + 0.3], this.material('#4f5353'));

    // A modest reusable scenic asset, authored as geometry rather than AI-generated seat images.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.065, 10, 64), glow);
    ring.position.set(0, 2.35, -Math.min(model.stageDepth - 0.3, 2.7)); stage.add(ring);
    this.box(stage, [model.stageWidth - 1.1, 3.8, 0.18], [0, 2.6, -model.stageDepth + 0.5], this.material('#25382e'));
    // Put the ring just in front of the backdrop for every stage depth.
    ring.position.z = -model.stageDepth + 0.66;
    const labelCanvas = document.createElement('canvas'); labelCanvas.width = 1024; labelCanvas.height = 256;
    const context = labelCanvas.getContext('2d');
    context.fillStyle = '#25382e'; context.fillRect(0, 0, 1024, 256);
    context.textAlign = 'center'; context.fillStyle = '#e0ecd8'; context.font = '500 64px Georgia';
    context.fillText(layout === 'theatre' ? 'THE OTHER SIDE' : 'AFTER HOURS', 512, 100);
    context.fillStyle = '#9cae9c'; context.font = '24px Arial'; context.fillText('OREUM  ·  LIVE SESSION', 512, 158);
    const texture = new THREE.CanvasTexture(labelCanvas); texture.colorSpace = THREE.SRGBColorSpace;
    const title = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshBasicMaterial({map: texture}));
    title.position.set(0, 4, -model.stageDepth + 0.61); stage.add(title);
    this.mannequin(stage, [-1.3, stageHeight+0.02, -1], this.material('#d2c0a7'));
    this.mannequin(stage, [1.2, stageHeight+0.02, -1.45], this.material('#9ca5b4'));
    for (const obstacle of getObstacles(model, layout)) {
      this.box(root, obstacle.size, obstacle.position, this.material(obstacle.id === 'rail' ? color.rail : '#363d45', {metalness: 0.35, roughness: 0.4}));
      if (obstacle.id === 'tower') {
        this.box(root, [0.95, 0.15, 0.85], [obstacle.position[0], 3.2, obstacle.position[2]], metal);
      }
    }
    this.createSeats(root);
    this.overlay = new THREE.Group(); root.add(this.overlay);
    this.schedule();
  }

  mannequin(parent, position, material) {
    const person = new THREE.Group(); person.position.set(...position); parent.add(person);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), material); head.position.y = 1.52; person.add(head);
    this.cylinder(person, 0.19, 0.55, [0, 1.12, 0], material);
    for (const side of [-1, 1]) {
      this.cylinder(person, 0.075, 0.65, [side * 0.1, 0.46, 0], material);
      const arm = this.cylinder(person, 0.055, 0.52, [side * 0.24, 1.06, 0], material); arm.rotation.z = side * 0.12;
    }
  }

  createSeats(root) {
    const seatMat = this.material(color.seat);
    const parts = [
      {size:[0.58, 0.14, 0.5], offset:[0, 0.47, 0]},
      {size:[0.6, 0.68, 0.11], offset:[0, 0.78, 0.24]},
      {size:[0.07, 0.12, 0.48], offset:[-0.35, 0.69, 0]},
      {size:[0.07, 0.12, 0.48], offset:[0.35, 0.69, 0]},
    ];
    this.seatInstances = [];
    const matrix = new THREE.Matrix4();
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(...part.size), seatMat, this.seats.length);
      for (const seat of this.seats) {
        matrix.makeTranslation(seat.x + part.offset[0], seat.floor + part.offset[1], seat.z + part.offset[2]);
        mesh.setMatrixAt(seat.id, matrix); mesh.setColorAt(seat.id, new THREE.Color(color.seat));
      }
      root.add(mesh); this.seatInstances.push(mesh);
    }
    const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.4, 0.3), this.material('#252932'), this.seats.length);
    for (const seat of this.seats) {matrix.makeTranslation(seat.x, seat.floor + 0.2, seat.z); frame.setMatrixAt(seat.id, matrix);}
    root.add(frame);
  }

  setView(view) {
    const changed = view.selected !== this.view.selected || view.mode !== this.view.mode || view.comparison !== this.view.comparison;
    this.view = {...this.view, ...view};
    if (changed) {this.yaw = 0; this.pitch = 0;}
    if (!this.unavailable && this.seatInstances) for (const mesh of this.seatInstances) {
      for (const seat of this.seats) mesh.setColorAt(seat.id, new THREE.Color(seat.id === view.selected ? color.mint : seat.id === view.comparison ? '#b5a0ef' : color.seat));
      mesh.instanceColor.needsUpdate = true;
    }
    this.updateOverlay(); this.schedule();
  }

  resetDirection() {this.yaw = 0; this.pitch = 0; this.schedule();}
  updateOverlay() {
    if (!this.overlay) return;
    for (const object of [...this.overlay.children]) { object.geometry.dispose(); object.material.dispose(); this.overlay.remove(object); }
    if (!this.view.overlay) return;
    const result = analyzeSightline(this.model, this.seats[this.view.selected], this.view.layout, this.view.eyeHeight);
    const positions = [];
    for (const sample of result.samples.filter(x => x.blocked)) positions.push(sample.x, sample.y, sample.z + 0.01);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({color:'#ffae79', size:0.1, depthTest:false, transparent:true, opacity:0.85}));
    points.renderOrder = 10; this.overlay.add(points);
  }
  positionCamera(camera, seat, aspect) {
    camera.aspect = aspect; camera.fov = 60;
    if (this.view.mode === 'overview') {
      const end = Math.max(...this.seats.map(s => s.z));
      camera.position.set(Math.max(13,this.model.stageWidth), Math.max(12,end), Math.max(18,end*1.6)); camera.lookAt(0, 1.8, end/3);
    } else {
      camera.position.copy(eyePosition(seat, this.view.eyeHeight));
      const target = new THREE.Vector3(this.model.stageOffset, (this.model.stageHeight ?? 0.6) + 0.08 + (this.model.targetHeight ?? 2.4) / 2, -0.25);
      const direction = target.sub(camera.position).normalize();
      direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      direction.y += this.pitch;
      camera.lookAt(camera.position.clone().add(direction));
    }
    camera.updateProjectionMatrix();
  }
  schedule() {
    if (this.unavailable || this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {this.scheduled = false; this.render();});
  }
  render() {
    if (!this.model || !this.container.clientWidth || !this.container.clientHeight) return;
    const started = performance.now();
    const width = Math.floor(this.container.clientWidth), height = Math.floor(this.container.clientHeight);
    // CSS size can already match while the GPU drawing buffer is still 300×150.
    if (this.renderWidth !== width || this.renderHeight !== height) {
      this.renderer.setSize(width, height); this.renderWidth = width; this.renderHeight = height;
    }
    const compare = this.view.comparison != null && this.view.mode !== 'overview';
    this.renderer.setScissorTest(compare);
    this.overlay.visible = this.view.overlay;
    if (compare) {
      const half = Math.floor(width / 2);
      this.positionCamera(this.camera, this.seats[this.view.selected], half / height);
      this.renderer.setViewport(0, 0, half, height); this.renderer.setScissor(0, 0, half, height);
      this.renderer.render(this.scene, this.camera);
      this.overlay.visible = false;
      this.positionCamera(this.cameraB, this.seats[this.view.comparison], (width - half) / height);
      this.renderer.setViewport(half, 0, width - half, height); this.renderer.setScissor(half, 0, width - half, height);
      this.renderer.render(this.scene, this.cameraB);
    } else {
      this.renderer.setViewport(0, 0, width, height);
      this.positionCamera(this.camera, this.seats[this.view.selected], width / height);
      this.renderer.render(this.scene, this.camera);
    }
    this.renderCount++;
    this.lastRenderMs = performance.now() - started;
    this.canvas.dataset.renderCount = String(this.renderCount);
    this.canvas.dataset.renderMs = this.lastRenderMs.toFixed(1);
    this.onStatus(`3D 준비됨 · 모델 v${this.model.version}`);
  }
  downloadImage() {
    if (this.unavailable) return;
    this.render();
    const source = this.canvas;
    const out = document.createElement('canvas'); out.width = source.width; out.height = source.height;
    const ctx = out.getContext('2d'); ctx.drawImage(source, 0, 0);
    ctx.fillStyle = 'rgba(14,18,26,0.88)'; ctx.fillRect(0, out.height - 70, out.width, 70);
    ctx.fillStyle = '#e5efdb'; ctx.font = `${Math.max(14, out.width / 55)}px sans-serif`;
    const seats = [this.seats[this.view.selected].label, this.view.comparison != null ? this.seats[this.view.comparison].label : null].filter(Boolean).join(' / ');
    ctx.fillText(`시야체크 · ${this.model.schemaVersion === 2 ? '도면 변환 · 현장 검수 전' : '가상 모델 추정'} | 좌석 ${seats} | 눈높이 ${this.view.eyeHeight.toFixed(2)}m | v${this.model.version}`, 20, out.height - 37);
    ctx.fillText('실제 좌석 시야·예매 가능 여부를 보증하지 않습니다.', 20, out.height - 14);
    // Keep the export within the user's click and avoid expiring a blob URL mid-download.
    const link = document.createElement('a');
    link.href = out.toDataURL('image/png'); link.download = `sightcheck-${seats.replace(/\W/g, '-')}.png`;
    document.body.append(link); link.click(); link.remove();
  }
}
