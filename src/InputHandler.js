export class InputHandler {
  constructor() {
    this._held = {};     // keys currently held down
    this._pressed = {};  // keys pressed this frame (single-fire)

    // Mouse delta accumulated since last frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pointerLocked = false;

    window.addEventListener('keydown', (e) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this._held[key]) {
        this._pressed[key] = true;
      }
      this._held[key] = true;
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this._held[key] = false;
    });

    // Pointer lock state tracking
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = !!document.pointerLockElement;
    });

    // Accumulate mouse movement while locked
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    // Track left mouse button
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) this._held['mouseleft'] = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._held['mouseleft'] = false;
    });
  }

  /** Request pointer lock on a canvas element */
  requestPointerLock(canvas) {
    canvas.addEventListener('click', () => {
      if (!this.pointerLocked) {
        canvas.requestPointerLock();
      }
    });
  }

  /** True while key is held */
  isDown(key) {
    return !!this._held[key];
  }

  /** True only on the frame the key was first pressed */
  wasPressed(key) {
    return !!this._pressed[key];
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
}
