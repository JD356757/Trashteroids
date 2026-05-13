# Trashteroid Optimization & Visual Enhancement Plan

## Overview
This document outlines performance optimizations, transition polish, and visual enhancements for Trashteroid while maintaining core gameplay concepts.

---

## PHASE 1: PERFORMANCE OPTIMIZATIONS

### 1.1 Object Pooling & Vector Reuse
**Priority:** HIGH | **Impact:** 10-15% frame time reduction

**Current Issues:**
- Multiple `new THREE.Vector3()` allocations throughout collision loops
- Sound pools work well, but visual effect pooling could be expanded
- Tutorial/popup system allocates new DOM elements unnecessarily

**Optimizations:**
- [ ] Create persistent Vector3/Quaternion pool in Game.js
- [ ] Reuse vectors in collision detection (already done partially, expand coverage)
- [ ] Pool sparks, explosions, and popups more aggressively
- [ ] Implement object reuse pattern for popup text elements

**Files to modify:**
- `src/Game.js` - Add vector pool manager
- `src/DebrisManager.js` - Reduce allocation in spawn/collision loops
- `src/HUD.js` - Pool popup DOM elements

### 1.2 Collision Detection Optimization
**Priority:** HIGH | **Impact:** 8-12% frame time reduction

**Current Issues:**
- Nested loops in `_resolveTrashCollisions` (projectile × trash × debris types)
- Multiple collision passes in AsteroidField
- Sphere intersection tests not early-exiting efficiently

**Optimizations:**
- [ ] Implement spatial partitioning (grid or octree) for trash collection
- [ ] Skip collision checks for far-away debris (distance culling)
- [ ] Cache collision results between frames where valid
- [ ] Combine trash/special/recycle collision checks into single pass

**Files to modify:**
- `src/Game.js` - Collision system refactor
- `src/DebrisManager.js` - Add spatial grid
- `src/AsteroidField.js` - Reduce collision passes

### 1.3 Rendering Pipeline Optimization
**Priority:** MEDIUM | **Impact:** 5-8% frame time reduction

**Current Issues:**
- Shadow maps always enabled (expensive)
- Pixel ratio fixed at 2x (may be overkill for lower-end devices)
- All asteroids have complex fade materials
- No frustum culling hints for static objects

**Optimizations:**
- [ ] Dynamic shadow map resolution based on viewport size
- [ ] Adaptive pixel ratio based on frame time
- [ ] Reduce shadow map quality for far-away asteroids
- [ ] Use simpler materials for off-screen asteroids
- [ ] Enable WebGL extensions (EXT_disjoint_timer_query for profiling)

**Files to modify:**
- `src/Game.js` - Renderer initialization
- `src/AsteroidField.js` - Material optimization

### 1.4 Animation & Update Loop Efficiency
**Priority:** MEDIUM | **Impact:** 3-5% frame time reduction

**Current Issues:**
- Sparks updated every frame with position recalculation
- Multiple array iterations for cleanup (sparks, popups, muzzles)
- Particle updates in Player.js could batch allocations

**Optimizations:**
- [ ] Batch sparks update into single loop
- [ ] Use `for` loops instead of `forEach` where appropriate
- [ ] Defer array cleanup to end of frame
- [ ] Cache frequently accessed properties (player position, camera forward)

**Files to modify:**
- `src/Game.js` - Game loop optimization
- `src/Player.js` - Particle system batch updates
- `src/HUD.js` - Batch DOM updates

### 1.5 Asset Loading Optimization
**Priority:** LOW | **Impact:** Startup time improvement

**Optimizations:**
- [ ] Lazy-load models (load on level entry, not startup)
- [ ] Compress GLTF models (use draco compression if available)
- [ ] Preload critical models during level briefing screen

**Files to modify:**
- `src/Game.js` - Model loading strategy

---

## PHASE 2: TRANSITION POLISH

### 2.1 Scene Transitions
**Priority:** HIGH | **Visual Impact:** HIGH

**Current State:**
- Screen fade transitions feel abrupt
- Interior/exterior lighting swap is instantaneous
- Boss arrival is sudden

**Improvements:**
- [ ] Add eased screen fade timing curves (ease-in-out instead of linear)
- [ ] Animate camera FOV changes during transitions
- [ ] Fade lighting over 0.5-1s when switching to interior
- [ ] Smooth asteroids visibility fade when entering interior tunnels
- [ ] Add subtle camera shake before boss encounter
- [ ] Fog density animate on environment changes

**Implementation:**
- Add easing functions: `easeInOutCubic`, `easeOutQuart`
- Track transition state in Game.js
- Interpolate lighting properties in `_setExteriorLightingForInterior`

### 2.2 UI & Menu Transitions
**Priority:** HIGH | **Visual Impact:** MEDIUM

**Current State:**
- Level briefing screen appears instantly
- Tutorial callouts pop in without easing
- Pause screen has no animation
- Win screen has abrupt appearance

**Improvements:**
- [ ] Briefing screen slides in from edges (left column left, right column right)
- [ ] Text content animates in with staggered delays (20-50ms between lines)
- [ ] Tutorial callout scales up + fades in (0.3s ease-out)
- [ ] Pause menu slides in from top with blur backdrop
- [ ] Objectives panel fades in on level start
- [ ] Win screen has dramatic entrance animation

**Implementation:**
- Add CSS keyframe animations for entrance effects
- Use `animation-delay` for staggered content
- Add transform properties to initial states

### 2.3 Player/Boss Animation Smoothing
**Priority:** MEDIUM | **Visual Impact:** MEDIUM

**Current State:**
- Boss movement can appear jerky
- Player death sequence timing is rigid
- Weapon effects appear instantly

**Improvements:**
- [ ] Smooth boss orbital movement with easing curves
- [ ] Death sequence has staged camera pull-back
- [ ] Weapon muzzle flashes have arc trajectory
- [ ] Boss projectiles trail-fade instead of vanishing instantly
- [ ] Debris explosion waves have easing

**Implementation:**
- Use cubic bezier curves for movement interpolation
- Add `scale` and `opacity` tweens for particle effects
- Implement simple easing library: `_tweenValue(start, end, t)`

---

## PHASE 3: VISUAL ENHANCEMENTS

### 3.1 Particle & Effect Improvements
**Priority:** MEDIUM | **Visual Impact:** HIGH

**Enhancements:**
- [ ] **Explosion effects:**
  - Bloom layer for bright core
  - Shock wave ring that expands (simpler than current)
  - Multi-stage smoke clouds with different colors
  - Debris spray follows physics (not instant)

- [ ] **Spark effects:**
  - Add glow/bloom to spark particles
  - Vary spark color per debris type (metal=blue, plastic=orange, etc.)
  - Add light flares to important sparks

- [ ] **Beam effects:**
  - Animated beam width pulsing
  - Trail-behind vaporizer beam
  - Bloom/glow on beam hit point
  - Subtle wobble to beam (not straight line)

- [ ] **Environmental effects:**
  - Asteroid field has subtle parallax on camera move
  - Starfield has near/far layers with different speeds
  - Sun has pulsing aura
  - Fog changes subtly on level transitions

**Files to modify:**
- `src/Game.js` - Explosion/effect spawning
- `src/Starfield.js` - Parallax layers
- `src/ProjectileManager.js` - Beam visuals

### 3.2 UI Visual Polish
**Priority:** MEDIUM | **Visual Impact:** MEDIUM

**Enhancements:**
- [ ] **HUD Improvements:**
  - Score popup has number scroll effect instead of instant
  - Health bar has pulse when low (if not already present)
  - Boost bar glows when charged
  - Boss health bar has animated segment loss
  - Level timer pulses when under 30 seconds

- [ ] **Objective tracking:**
  - Completed objectives have checkmark animation
  - Progress bars smooth out instead of jumping
  - Bonus objectives glow when partially complete

- [ ] **Status indicators:**
  - Damage vignette has smoother fade curves
  - Low health warning has pulse effect (controllable for accessibility)
  - Out-of-range alert has shake animation

**Files to modify:**
- `src/HUD.js` - UI animations
- `src/styles.css` - Animation keyframes

### 3.3 Camera & Movement Polish
**Priority:** LOW | **Visual Impact:** MEDIUM

**Enhancements:**
- [ ] **Viewport improvements:**
  - Camera lead (look ahead of movement direction slightly)
  - Subtle depth-of-field on distant objects
  - Lens distortion at screen edges (very subtle)
  - Film grain that responds to damage vignette

- [ ] **Movement feedback:**
  - Boost charge has visual feedback (glow, ring expansion)
  - Roll banking is more pronounced visually
  - Thruster particles respond to boost state
  - Screen edges bloom slightly on high speed

**Implementation:**
- Use post-processing shaders for DOF/distortion
- Animate particle properties based on player state

### 3.4 Audio-Visual Sync
**Priority:** LOW | **Visual Impact:** MEDIUM

**Enhancements:**
- [ ] **Music visualizer:**
  - Existing music visualizer in HUD could respond to gameplay events
  - Explosions sync bar heights
  - Boss arrival increases visualizer size
  - Victory uses special animation

- [ ] **Sound design feedback:**
  - Directional audio cues get visual indicators
  - Beat sync for cutscene timing
  - Boss audio roar triggers screen effect

**Implementation:**
- Expand AudioManager integration
- Synchronize effect timing to audio cues

---

## PHASE 4: LEVEL DESIGN POLISH

### 4.1 Environmental Storytelling
**Priority:** LOW | **Visual Impact:** MEDIUM

**Enhancements:**
- [ ] Add more environmental detail to exterior scenes
- [ ] Interior tunnel maze has themed sections (ice, metal, organic debris)
- [ ] Boss arena has dramatic lighting changes during fight phases
- [ ] Cutscene destruction has camera angles that show scale

### 4.2 Gameplay Pacing
**Priority:** LOW | **Gameplay Impact:** MEDIUM

**Enhancements:**
- [ ] Difficulty curve is more gradual
- [ ] Bonus objectives get briefed earlier for clarity
- [ ] Boss phases have clear transition moments

---

## IMPLEMENTATION ROADMAP

### Week 1: Core Performance
1. Vector pooling system (all files)
2. Collision detection optimization
3. Rendering pipeline tuning
4. **Expected:** 20-25% performance gain

### Week 2: Transitions & Polish
5. Scene transition animations
6. UI entrance animations
7. Smoothing functions implementation
8. **Expected:** Noticeable visual quality jump

### Week 3: Visual Effects
9. Particle effect enhancements
10. HUD visual polish
11. Camera movement improvements
12. **Expected:** Game feels premium & responsive

### Week 4: Audio & Final Polish
13. Audio-visual sync
14. Environment detail
15. Testing & optimization pass
16. **Expected:** Release-ready quality

---

## Key Metrics to Track

### Performance
- Frame time per update (target: 16.67ms @ 60fps)
- Memory usage (target: <100MB)
- GC pause frequency (target: <5 per second)

### Visual Quality
- Particle count on-screen
- Shader overhead
- Load times

### Gameplay Feel
- Input-to-output latency
- Visual feedback clarity
- Animation smoothness (60fps locked)

---

## Notes

**Preserve:**
- Core gameplay mechanics (aiming, dodging, collecting)
- Level design and difficulty curves
- Audio tracks and sound effects
- Win/lose conditions

**Don't Break:**
- Tutorial progression
- Save system
- Mobile/responsive design
- Accessibility features

