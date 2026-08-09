/**
 * The 3D companion scene: the baked Blender cat, rendered with three.js.
 *
 * It implements the same `CompanionScene` contract the 2D scene did, so the
 * app, the state protocol and the pose-machine-shaped flow above it are
 * untouched: state events arrive through `setState`, the animation controller
 * turns them into crossfaded clips, and the face/gaze layers run on top.
 *
 * WebGL cannot share the 2D canvas, so this scene owns a sibling canvas layered
 * over #stage with pointer-events disabled — the original canvas keeps
 * receiving input and the hit-tester keeps working unmodified.
 */

import {
  ACESFilmicToneMapping,
  AmbientLight,
  Bone,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  AnimationMixer,
  Color,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { StateEvent } from '@shared/protocol.js';
import { descriptorFor } from '@shared/states.js';
import type { Frame } from '../engine/loop.js';
import type { CompanionScene as CompanionSceneContract } from '../engine/scene.js';
import type { Viewport } from '../engine/surface.js';
import { AnimationController } from '../rig3d/animationController.js';
import { Face } from '../rig3d/face.js';
import { Gaze } from '../rig3d/gaze.js';

/** Resolved against the bundle, not the page, so any host page works. */
const MODEL_URL = new URL('assets/garfield-cat.glb', import.meta.url).href;

/** Token rate that counts as "normal" pace when scaling the typing clip. */
const REFERENCE_RATE = 24;

/** Above 2x the extra pixels cost real GPU time and buy nothing visible. */
const MAX_DPR = 2;

/** World-space box the character occupies (metres), for hit bounds. */
const CHARACTER_BOX = {
  min: new Vector3(-0.36, 0.0, -0.55),
  max: new Vector3(0.36, 1.06, 0.34),
};

export class CompanionScene3D implements CompanionSceneContract {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 10);
  private readonly rim: DirectionalLight;

  private readonly face = new Face();
  private readonly gaze = new Gaze();
  private controller: AnimationController | null = null;

  private state: StateEvent['state'] = 'idle';
  private motion = 1;
  private viewport: Viewport = { width: 0, height: 0, dpr: 1 };
  private pointerInside = false;
  private disposed = false;

  constructor(host?: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'stage3d';
    Object.assign(this.canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    const parent = host ?? document.getElementById('stage')?.parentElement ?? document.body;
    parent.appendChild(this.canvas);

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setClearColor(0x000000, 0);

    this.camera.position.set(0, 0.62, 2.3);
    this.camera.lookAt(0, 0.48, 0);

    const hemi = new HemisphereLight(0xfff4e0, 0x8a7a6a, 1.15);
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(1.4, 2.2, 2.6);
    const fill = new DirectionalLight(0xbcd0ff, 0.5);
    fill.position.set(-1.8, 0.8, 1.2);
    this.rim = new DirectionalLight(new Color(descriptorFor('idle').accent), 0.7);
    this.rim.position.set(0, 1.4, -2.4);
    this.scene.add(hemi, key, fill, this.rim, new AmbientLight(0xffffff, 0.12));

    void this.load();

    // Diagnostics hook (settings window perf readout, smoke harness).
    (window as unknown as Record<string, unknown>).__saber3d = this;
  }

  private async load(): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    if (this.disposed) return;

    const root = gltf.scene;
    // Blender's +Y-forward character lands facing -Z in glTF; spin it to camera.
    root.rotation.y = Math.PI;
    root.traverse((obj) => {
      obj.frustumCulled = true;
      if (obj instanceof Mesh) {
        const material = obj.material as { toneMapped?: boolean };
        material.toneMapped = true;
      }
    });
    this.scene.add(root);

    const mixer = new AnimationMixer(root);
    this.controller = new AnimationController(mixer, gltf.animations);
    this.controller.setState(this.state, 1);

    let head: Bone | null = null;
    let eyeL: Bone | null = null;
    let eyeR: Bone | null = null;
    root.traverse((obj) => {
      if (!(obj instanceof Bone)) return;
      if (obj.name === 'head') head = obj;
      else if (obj.name === 'eye.L') eyeL = obj;
      else if (obj.name === 'eye.R') eyeR = obj;
    });
    this.gaze.bind({ head, eyeL, eyeR });

    root.traverse((obj) => {
      if (obj instanceof Mesh && obj.morphTargetDictionary) this.face.bind(obj);
    });
    this.face.setState(this.state);
  }

  setAccent(hex: string): void {
    this.rim.color.set(hex);
  }

  setMotion(motion: number): void {
    this.motion = motion;
  }

  setState(event: StateEvent): void {
    this.state = event.state;
    const rate = event.rate === undefined ? 1 : normaliseRate(event.rate / REFERENCE_RATE);
    this.controller?.setState(event.state, rate);
    this.face.setState(event.state);
    this.gaze.setEnabled(event.state !== 'sleeping');
  }

  setPointer(point: { x: number; y: number } | null): void {
    if (point && this.viewport.width > 0) {
      if (!this.pointerInside) {
        this.pointerInside = true;
        this.controller?.hover();
      }
      // Canvas space → normalised look target, x right, y up.
      const nx = (point.x / this.viewport.width) * 2 - 1;
      const ny = 1 - (point.y / this.viewport.height) * 2;
      this.gaze.setTarget({ x: clamp(nx, -1, 1), y: clamp(ny, -1, 1) });
    } else {
      this.pointerInside = false;
      this.gaze.setTarget(null);
    }
  }

  poke(): void {
    this.controller?.poke();
    this.face.startle();
  }

  update(frame: Frame): void {
    this.controller?.update(frame.dt * this.timeScale());
    this.gaze.apply(frame.dt, this.motion);
    this.face.update(frame.dt);
  }

  draw(_ctx: CanvasRenderingContext2D, view: Viewport, _frame: Frame): void {
    this.syncSize(view);
    this.renderer.render(this.scene, this.camera);
  }

  silhouetteBounds(view: Viewport): { x: number; y: number; width: number; height: number } {
    // Project the character's world box; the camera is static so this is a
    // handful of vector transforms, no readback.
    const { min, max } = CHARACTER_BOX;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const v = new Vector3();
    for (let i = 0; i < 8; i += 1) {
      v.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z);
      v.project(this.camera);
      const sx = ((v.x + 1) / 2) * view.width;
      const sy = ((1 - v.y) / 2) * view.height;
      minX = Math.min(minX, sx);
      minY = Math.min(minY, sy);
      maxX = Math.max(maxX, sx);
      maxY = Math.max(maxY, sy);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  destroy(): void {
    this.disposed = true;
    this.renderer.dispose();
    this.canvas.remove();
  }

  private syncSize(view: Viewport): void {
    if (view.width === this.viewport.width && view.height === this.viewport.height && view.dpr === this.viewport.dpr) {
      return;
    }
    this.viewport = view;
    if (view.width === 0 || view.height === 0) return;
    this.renderer.setPixelRatio(Math.min(view.dpr, MAX_DPR));
    this.renderer.setSize(view.width, view.height, false);
    this.camera.aspect = view.width / view.height;
    this.camera.updateProjectionMatrix();
  }

  /** Reduced motion slows the mixer instead of freezing it. */
  private timeScale(): number {
    return 0.4 + 0.6 * clamp(this.motion, 0, 1.5);
  }
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const normaliseRate = (rate: number): number =>
  !Number.isFinite(rate) || rate <= 0 ? 1 : Math.min(2.5, Math.max(0.3, rate));
