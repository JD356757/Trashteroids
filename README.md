# Trashteroid

A fast-paced 3D arcade shooter built with Three.js — vaporize space debris and save Earth!

## Quick Start

```bash
npm install
npm run dev
```

## Controls

| Key | Action |
|-----|--------|
| ← → | Move ship left / right |
| Space | Fire vaporizer beam |
| V | Recycle beam *(coming soon)* |
| 9 | Skip cutscene |

## Project Structure

```
src/
  main.js            — Entry point, overlay/start logic
  Game.js            — Core game loop, scene setup, collision detection
  Player.js          — Player ship mesh & movement
  DebrisManager.js   — Spawns and manages space debris
  ProjectileManager.js — Vaporizer beam projectiles
  LevelManager.js    — Level progression & boss state
  InputHandler.js    — Keyboard input tracking
  HUD.js             — Score, lives, level display
  Starfield.js       — Animated background stars
  styles.css         — UI styling (retro arcade theme)
```
