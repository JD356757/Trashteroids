export class InputHandler {
  constructor() {
    this._held = {};     // keys currently held down
    this._pressed = {};  // keys pressed this frame (single-fire)

    // Mouse delta accumulated since last frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pointerLocked = false;
    this._pointerLockCanvas = null;
    this._onKeyDown = (e) => {
      const key = this._normalizeKey(e.key);
      if (!this._held[key]) {
        this._pressed[key] = true;
      }
      this._held[key] = true;
    };
    this._onKeyUp = (e) => {
      const key = this._normalizeKey(e.key);
      this._held[key] = false;
    };
    this._onPointerLockChange = () => {
      this.pointerLocked = !!document.pointerLockElement;
    };
    this._onMouseMove = (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    };
    this._onMouseDown = (e) => {
      if (e.button === 0) this._held.mouseleft = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this._held.mouseleft = false;
    };
    this._onCanvasClick = () => {
      if (!this.pointerLocked && this._pointerLockCanvas) {
        this._pointerLockCanvas.requestPointerLock();
      }
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
  }

  /** Request pointer lock on a canvas element */
  requestPointerLock(canvas) {
    if (this._pointerLockCanvas === canvas) return;
    if (this._pointerLockCanvas) {
      this._pointerLockCanvas.removeEventListener('click', this._onCanvasClick);
    }
    this._pointerLockCanvas = canvas;
    canvas.addEventListener('click', this._onCanvasClick);
  }

  /** True while key is held */
  isDown(key) {
    return !!this._held[this._normalizeKey(key)];
  }

  /** True only on the frame the key was first pressed */
  wasPressed(key) {
    return !!this._pressed[this._normalizeKey(key)];
  }

  _normalizeKey(key) {
    return typeof key === 'string' ? key.toLowerCase() : key;
  }

  /** Get mouse delta since last reset and clear it */
  consumeMouseDelta() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  releaseAll() {
    this._held = {};
    this._pressed = {};
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  /** Call once per frame after processing input */
  resetPressed() {
    this._pressed = {};
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    if (this._pointerLockCanvas) {
      this._pointerLockCanvas.removeEventListener('click', this._onCanvasClick);
      this._pointerLockCanvas = null;
    }
  }
}
