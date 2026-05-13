"""Generate the full worklog (all 11 pages) using the rotated TSA template."""
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT

PAGE_W, PAGE_H = 792, 612
TEMPLATE_PNG = r"C:\Users\Siddhant\Trashteroids\template_rot_hires.png"

COL_X = {
    "rownum_l": 33, "rownum_r": 71, "date_r": 180, "task_r": 287,
    "time_r": 395, "member_r": 504, "comment_r": 729,
}
ROWS = [
    (502.8, 426.2), (426.2, 349.5), (349.5, 273.0),
    (273.0, 196.5), (196.5, 119.8), (119.8, 43.2),
]

TEXT_DARK = HexColor("#222222")
DATE_STYLE = ParagraphStyle("date", fontName="Helvetica", fontSize=9, leading=11, textColor=TEXT_DARK, alignment=TA_LEFT)
TASK_STYLE = ParagraphStyle("task", fontName="Helvetica", fontSize=8.5, leading=10.5, textColor=TEXT_DARK, alignment=TA_LEFT)
TIME_STYLE = ParagraphStyle("time", fontName="Helvetica", fontSize=9, leading=11, textColor=TEXT_DARK, alignment=TA_LEFT)
MEMBER_STYLE = ParagraphStyle("member", fontName="Helvetica", fontSize=8.5, leading=11, textColor=TEXT_DARK, alignment=TA_LEFT)
COMMENT_STYLE = ParagraphStyle("comment", fontName="Helvetica", fontSize=7.2, leading=9, textColor=TEXT_DARK, alignment=TA_LEFT)


# Full chronological list of entries (old portfolio + new content), shifted to
# remove the empty row 6 on the old page 7. A.B. and I.G. added where it fits.
ENTRIES = [
    # ===== OLD PAGE 1 =====
    ("11/19/2025", "Brainstorming", "2 hours",
     ["S.L.", "D.D.", "A.B.", "I.G."],
     "Created a brief list of potential game ideas that fit the theme of 8-bit/16-bit games with a modern twist."),

    ("11/22/2025", "Finalize idea and create development plan", "2 hours",
     ["S.L.", "D.D.", "A.B.", "I.G."],
     "Settled on the 3D space trash idea. Created an initial timeline for game prototyping."),

    ("12/13/2025", "Setup Prototype Environment", "1 hour",
     ["D.D."],
     "Set up basic 3D Unity project and Unity Version Control for collaboration (later migrated to THREE.js)"),

    ("12/15/2025", "Initial Prototyping - Create player and trash assets", "1 hour",
     ["S.L."],
     "Created rough player and trash models and textures in Blender. Used for prototyping, final models will be refined further."),

    ("12/16/2025", "Initial Prototyping - Write player movement/trash spawning code", "3 hours",
     ["D.D"],
     "Built the basic functionality of the game. At this point, player movement is only one dimensional, but we have plans to make it full 3D omnidirectional movement."),

    ("12/18/2025", "Initial Prototyping - Add assets to game, fix bugs", "1 hour",
     ["S.L."],
     "Fixed visual glitching when trash asset clips into player asset. Fixed bug where levels do not advance once the score threshold is reached."),

    # ===== OLD PAGE 2 =====
    ("1/11/2026", "Created final project environment (migrated to THREE.js)", "2 hours",
     ["S.L."],
     "We migrated to THREE.js for a few reasons, including ease of collaboration and performance. Unity ran very slow on both our computers, and Unity Version Control was causing trouble, so we made the decision to switch."),

    ("1/11/2025", "Created final player asset", "1.5 hours",
     ["D.D."],
     "Create an improved 3D model and texture for the player in Blender that fits the pastel style better."),

    ("1/13/2025", "Created trash and asteroid assets.", "1 hour",
     ["S.L.", "A.B."],
     "Created and textured trash bags, broken chair, broken oven, and rubber duck models for trash. Wrote a Python script for Blender to procedurally generate asteroid models by deforming an icosphere. Generated 20 unique asteroid models."),

    ("1/13/2025", "Created omnidirectional physics-based player movement system", "3 hours",
     ["S.L."],
     "Created Player.js, Game.js, and InputHandler.js. Used normalized mouse delta in to calculate player look acceleration, and implemented W key for thrusting (forwad acceleration)"),

    ("1/15/2025", "Added asteroids with physics collisions to game.", "1 hour",
     ["S.L."],
     "Created AsteroidField.js. Added asteroids that spawn in a field near the player spawn point, with configurable density, size, linear velocity, and angular velocity."),

    ("1/16/2025", "Added chunk-based procedural asteroid generation.", "2 hours",
     ["D.D."],
     "Added an array of chunks in AsteroidField.js that represent a 1000x1000x1000 3D space, each of which gets a randomly set number of asteroids. Created spawn/despawn logic for memory management: generation radius is 6 chunks, despawn radius is 7 chunks."),

    # ===== OLD PAGE 3 =====
    ("1/27/2026", "Improved omnidirectional player movement system", "0.5 hours",
     ["D.D."],
     "Old player movement system caused camera to spin at top and bottom instead of rotating. Researched quaternion/vector math to implement a system where everything is based on the player’s relative “up”, for much more immersive gameplay."),

    ("1/27/2026", "Replaced asteroid chunk generation system with simpler flat array.", "3 hours",
     ["S.L."],
     "The chunk generation system was causing a bug where asteroids would spawn much closer to you than they should. After debugging for hours, I decided to switch to a simpler system. Created a flat array of asteroids and their info, and a target asteroid count variable. Generated asteroids until target count was hit, and despawned ones that got too far."),

    ("1/28/2026", "Created trash generation system", "1 hour",
     ["D.D."],
     "Created DebrisManager.js, a procedular trash generation system using the same target count logic as the asteroid generation."),

    ("1/28/2026", "Created recycle bin asset", "0.5 hours",
     ["D.D.", "A.B."],
     "Created a 3D model and texture of a recycle bin."),

    ("1/31/2026", "Created special trash and recycle generation systems.", "1 hour",
     ["S.L."],
     "Created SpecialDebrisManager.js and RecycleManager.js, parallel the original trash generation system but for the other models. Recycle bins are 10x rarer than normal trash, and special trash is 50x rarer than normal trash."),

    ("2/5/2026", "Created vaporizer beam", "2 hours",
     ["D.D"],
     "Added vaporizer beam with left click in ProjectileManager.js. First version caused memory buildup and crashed browser. Fixed by implemented a projectile lifetime and a 64-slot object pool."),

    # ===== OLD PAGE 4 =====
    ("2/6/2026", "Fixed asteroid collisions", "1 hour",
     ["S.L."],
     "Fixed visual glitch with asteroid collisions by implementing 2 collision detection passes. If many asteroids were close to each other, one collision pass was not enough sent asteroids glitching into other asteroids."),

    ("2/8/2026", "Added recycle beam", "1 hour",
     ["D.D."],
     "Added recycle beam to ProjectileManager.js using same logic as vaporizer beam."),

    ("2/8/2026", "Added projectile-trash an projectile-recycle collisions", "2 hours",
     ["S.L."],
     "Created collision handlers in Game.js: recycle beam on recycle gives points, vaporizer beam on trash gives points, anything else gives penalties."),

    ("2/15/2026", "Created player HUD", "1 hour",
     ["D.D.", "S.L.", "A.B."],
     "Created player HUD showing score, current health, and boost."),

    ("2/15/2026", "Create custom toon shader for asteroids.", "2 hours",
     ["D.D.", "S.L."],
     "Wrote code to bake a lit color and a shadow color onto the asteroid at the start of the level based on the Sun’s position. Made the asteroid no longer react to light. Created asteroid outlines using polygon offsets. This created a cartoon, pastel look that fit our intended art style."),

    ("2/16/2026", "Implemented outlines for trash and recycle as well", "0.5 hours",
     ["S.L."],
     "The outlines of the asteroids looked very good, so we decided to implement the same style of outlines for the other scene objects, specifically that trash, special trash, and recycle."),

    # ===== OLD PAGE 5 =====
    ("2/21/2026", "Fixed player-trash and player-recycle collisions.", "1 hour",
     ["S.L."],
     "The player would previously clip through trash and recycle but still take damage. Used an impulse-based system to make trash bounce away when the player hits it."),

    ("2/22/2026", "Added level management system and UI screeens.", "4 hours",
     ["D.D.", "A.B.", "I.G."],
     "Created IntroScene.js, LevelManager.js, LevelSelect.js. Intro scene has game title and animated starfield in background, takes you to the storyline curscene and then level select. Level select has 3D level icons and a mini player-ship that moves between them on click."),

    ("2/24/2026", "Added settings", "0.5 hours",
     ["D.D.", "A.B."],
     "Created a saved storage for settings, and a settings menu accessible from the level select screen. Settings include mouse sensitivity, master/music/sfx volume, audio visualizer, reduced motion, reduced flashing, etc."),

    ("2/24/2026", "Added pause menu", "1 hour",
     ["D.D."],
     "Added a pause menu with options for mouse sensitivity and volume. Faced issues with Chrome not being able to set/un-set pointer lock, fixed with some debugging."),

    ("3/1/2026", "Created tutorial", "2 hours",
     ["S.L.", "I.G."],
     "Added a live in-game tutorial with several parts to level 1. It guides you through all the controls and the HUD, and then gives some extra tips."),

    ("3/4/2026", "Created level objectives system and level completion/failure UI", "3 hours",
     ["S.L."],
     "Created several objective types: X amount of trash, X amount of recycle, X amount of special trash, X amount of trash shot while flying at over Y m/s, and destroy boss objective. Created a UI for level completion with how many stars you got out of 3 based on objectives. Created a game over overlay."),

    # ===== OLD PAGE 6 =====
    ("3/4/2026", "Added damage/low-health red vignette", "0.5 hours",
     ["D.D."],
     "Added an HTML radial-gradient overlay with opacity and scale controlled by Player.js for a pulsing red vignette animation when on low health, and a quick red vignette flash when you take damage."),

    ("3/6/2026", "Debugging session", "4 hours",
     ["S.L.", "D.D.", "A.B.", "I.G."],
     "Fixed tons of minor bugs (visual clipping, jittery movement, inaccurate hitboxes, weird star sizes in starfield, and many more)"),

    ("3/7/2026", "Rewrote text custcene", "0.25 hours",
     ["S.L.", "I.G."],
     "The storyline was a little hard to follow, so I rewrote it to be more clear."),

    ("3/8/2026", "Created Trashteroid (boss) model.", "1 hour",
     ["D.D."],
     "Used a Python script for Blender to generate a Trashteroid model by deforming a sphere and placing trash bags and other shapes jutting out of it."),

    ("3/11/2026", "Created boss level", "2 hours",
     ["S.L."],
     "Imported Trashteroid model in level 3, gave it a boss health bar in the HUD, and created constant burst attacks where it fires trash. Had issues with hitboxes because of all the shapes jutting out. Had to compromise with just a sphere hitbox since it would be too computationally heavy otherwise"),

    ("3/15/2026", "Improved boss attacks", "1 hour",
     ["S.L."],
     "Old boss burst attacks were super distracting. Implemented two new attacks. A 1.8-second stream that fires ~18 trash at the player, and a ring burst attack that fires 2 burts of ~12 trash at the player in rings. Gave the boss vulnerability and invulnerability periods for a more interesting fight."),

    # ===== OLD PAGE 7 (first 5 entries, then shift starts) =====
    ("3/15/2026", "Added music", "2 hours",
     ["S.L.", "D.D.", "I.G."],
     "Used a copyright-free indie rock instrument pack in Cakewalk Sonar to create a short (45 seconds) music loop. Imported it into the game, created AudioManager.js, and had it start playing when Start Mission is pressed, and then become quieter in the actual level."),

    ("3/16/2026", "Added sound effects", "1 hour",
     ["S.L.", "A.B."],
     "Made and recorded sound effects for thrusting, boosting, explosions, and a “pop” for recycle collection and recorded them, and added logic for them in AudioManager.js."),

    ("3/17/2026", "Created final explosion cutscene", "1 hour",
     ["D.D.", "A.B."],
     "After Trashteroid boss is defeated, camera animates to a cinematic position looking at the Trashteroid. After several seconds of explosions all around its surface, it disappears in one massive explosion, and smaller trash flies everywhere and explodes."),

    ("3/17/2026", "Fixed LevelSelect bug", "3 hours",
     ["S.L."],
     "There was a bug where after hitting play again from the game over screen, or retry from the level completion screen, it would show the level for a split second and then go back to the level select screen. This took hours to debug, the root cause was that two HTML elements wrongly shared a class"),

    ("3/18/2026", "Playtesting for State submission", "2 hours",
     ["S.L.", "D.D.", "A.B.", "I.G."],
     "Playtested the game several times. Overall, we were satisfied that everything was working and bug-free. Improvements could still be made to player-asteroid collisions (the camera sometimes clips into an asteroid), but this is fairly rare and harmless."),

    # ===== NEW CONTENT (originally pages 8-11) =====
    ("3/22/2026", "Post-playtest polish", "1 hour",
     ["S.L.", "D.D."],
     "Cleaned up small issues that came out of the last playtest. Fixed a couple of typos in the level descriptions on the level select screen, and reset the boss vulnerability period back to its intended value after it got nudged during debugging."),

    ("3/26/2026", "Brainstormed Level 2 concept", "1.5 hours",
     ["S.L.", "D.D.", "A.B.", "I.G."],
     "Talked through ideas for a second level that would feel different from level 1 and the boss fight. Settled on flying through the INSIDE of a giant trashteroid, with branching tunnels and weak spots to shoot. Sketched out a rough map on paper and drawing for the storyboard."),

    ("4/2/2026", "Designed tunnel layout", "2 hours",
     ["S.L.", "I.G."],
     "Turned the paper sketch into a real layout: 14 named nodes (entry, hubs, chambers, dead ends, a spire, a loopback) and 17 tunnel connections between them. Picked positions so the player has multiple paths and can get a little lost without getting fully stuck."),

    ("4/6/2026", "Created tunnel JSON format", "1.5 hours",
     ["S.L."],
     "Wrote level2Tunnels.json to store the whole layout: node positions and radii, tunnel midpoints with embedded trash density per tunnel, weak spot positions and HP, and the player start point and facing. Also made tunnelRegistry.js so we can look up tunnel data by id from anywhere in the code."),

    ("4/10/2026", "Built tunnel debug viewer", "2 hours",
     ["S.L."],
     "Created TunnelMaze.js as a debug viewer first, before worrying about the real mesh. It reads the JSON and draws cyan centerlines for every tunnel, wireframe spheres at each node, and pulsing red orbs at each weak spot. Made it much easier to check the layout before committing to a baked model."),

    ("4/13/2026", "Hooked new Level 2 into game flow", "1.5 hours",
     ["S.L.", "D.D."],
     "Added _buildTunnelMaze and _teardownTunnelMaze in Game.js so the maze loads when you enter Level 2 and unloads when you leave. Made the player spawn at the playerStart point with the correct facing, and hid the asteroid field on interior levels so the outdoor debris field does not bleed in."),

    ("4/17/2026", "Wrote tunnel baking script", "3 hours",
     ["S.L."],
     "Wrote a Python script (bake_tunnel_maze.py) for Blender that reads the same level2Tunnels.json and generates the actual interior mesh: tubes along each tunnel curve, blended into chamber spheres at the nodes, with the interior facing inward so the player sees walls from the inside. Way faster than modeling all of this by hand."),

    ("4/19/2026", "Loaded baked tunnel mesh into game", "1.5 hours",
     ["S.L.", "A.B."],
     "Exported the baked tunnel as level2_interior.glb and hooked it into TunnelMaze so the level loads the real mesh on top of the JSON layout. Added a bakedMeshUrl field on the level config so the loader knows where to grab it from. First flythrough of the actual interior, no more debug wireframe."),

    ("4/22/2026", "Rewrote mission briefings into a story", "1.5 hours",
     ["D.D.", "I.G."],
     "The three levels did not feel connected before, so we rewrote all the level labels and briefings to tell one story: Level 1 is the approach (clear a corridor and reach the breach), Level 2 is inside the trashteroid (destroy the weak spots), Level 3 is the exterior final assault. Updated the success titles and subtitles to match."),

    ("4/24/2026", "Tunnel rendering performance pass", "2 hours",
     ["S.L.", "D.D."],
     "First time flying through the full baked tunnel the frame rate tanked. Profiled it and found two main problems: every embedded trash piece in every tunnel was being drawn even when miles away, and a bunch of materials were not being shared between meshes. Added a simple distance cull for trash and reused one shared material per material type. Frame rate went back up to smooth."),

    ("4/26/2026", "Tunnel wall collision system", "3 hours",
     ["S.L."],
     "Precomputed the tunnel walls as a set of curve segments and chamber spheres at load time. Wrote two queries against them: pushOutSphere for the player, and segmentVsWalls for projectiles. Way faster than checking against the actual mesh and gives clean results."),

    ("4/29/2026", "Bounce physics and scrape damage", "2 hours",
     ["D.D.", "S.L."],
     "Wrote _resolveTunnelPlayerCollision in Game.js. When the player hits a wall, it gets pushed out and bounced back at a reduced speed (feels nice and arcade-y, not sticky). Scraping along a wall does a small amount of damage on a short cooldown. Hooked into the existing damage and game over flow so the health bar and red vignette still work."),

    ("5/2/2026", "Fixed camera clipping in tunnels", "1 hour",
     ["S.L."],
     "The chase camera kept clipping out of the tunnel walls on tight turns, which let you see the empty space behind the mesh. Padded the collision wall radius so the camera always stays a little inside the tunnel instead of right up against the wall. Camera stays inside even when you barrel into a wall now."),

    ("5/3/2026", "Fixed audio and pointer lock on level swap", "1 hour",
     ["D.D.", "A.B."],
     "Found a couple of annoying bugs when going from one level to another: music would sometimes overlap itself for a second, and the pointer lock would not re-grab when you started the next level. Cleaned up AudioManager state on level teardown and forced a pointer lock request on the first user click of the new level."),

    ("5/4/2026", "Projectile wall hits", "1 hour",
     ["D.D."],
     "Vaporizer and recycle beams used to fly right through walls in the tunnel. Now they get consumed when they hit a wall using segmentVsWalls, with a small warm spark effect at the impact point. Also fixed a timer bug where timer:0 levels would instantly time out because the timeout check did not respect _levelTimerRunning."),

    ("5/6/2026", "Made weak spots breakable", "2 hours",
     ["S.L.", "I.G."],
     "Each weak spot now snaps to the nearest tunnel or chamber wall and embeds slightly into it so it looks like part of the trashteroid, not a floating orb. Added a small offset so spots inside the same chamber do not stack on top of each other. Tuned the HP so it takes about six clean hits to break one."),

    ("5/8/2026", "Weak spot feedback and destruction", "1.5 hours",
     ["S.L."],
     "As a weak spot takes damage, its pulse rate, scale, emissive color, and light intensity all ramp up so you can tell it is almost done. On destruction it plays a particle burst and the boom SFX, and awards points. One thing we had to fix was that hiding the light causes Three.js to recompile all materials, so we just turned its intensity to zero and left it unhidden."),

    ("5/9/2026", "Weak spot HUD indicators", "1 hour",
     ["S.L.", "A.B."],
     "Added on-screen indicators for the three nearest weak spots: a diamond marker when the spot is in front of you and a triangle that slides along the edge of the screen when it is off-screen. Both scale with proximity so far ones look small."),

    ("5/10/2026", "Pre-submission bug bash", "3 hours",
     ["S.L.", "D.D.", "A.B.", "I.G."],
     "Played through all three levels back to back and fixed everything we noticed. HUD elements from Level 1 were sticking around for a frame in Level 2, the pause menu would not close on the first click after un-pausing on Chrome, replaying a level had a slow memory creep because geometries and materials were not being disposed in _teardownTunnelMaze, and the boss health bar showed up briefly on Level 2. All fixed."),

    ("5/11/2026", "Level 2 mission config and tuning", "1.5 hours",
     ["D.D.", "S.L."],
     "Set up Level 2 in LevelManager.js: interior flag on, tunnelData pointing to 'level2', timer set to 0 (no time limit for this one), and weakSpotsRequired set to 5 for 1 star and 10 for full clear. Added a new weakSpots branch to the objective tracker so the existing star and completion logic just works."),

    ("5/13/2026", "Final Level 2 tuning and playtest", "2 hours",
     ["S.L.", "D.D.", "A.B.", "I.G."],
     "Played through Level 2 a bunch of times and tuned a few things. Toned down how big the weak spots grow as they take damage (they were getting huge and blocking the tunnel). Added a forward-cone filter on wall sample points so spark FX only spawn on walls you are actually facing. Overall the level feels good and is ready for submission."),

    ("5/13/2026", "Final playtesting", "2 hours",
     ["S.L.", "D.D.", "A.B.", "I.G."],
     "Played through the full game (Level 1, Level 2, and the boss) several times to make sure everything flows. The story arc between the three levels feels right, and the inside-the-trashteroid section gives the game a real middle act now. Found one small visual glitch where a weak spot indicator could stick around for a frame after the spot was destroyed, fixed it. Otherwise the game is in good shape and ready to ship."),
]


def draw_cell(c, text, x_l, x_r, y_top, y_bot, style, pad_x=4, pad_y=4):
    w = x_r - x_l - 2 * pad_x
    h = y_top - y_bot - 2 * pad_y
    p = Paragraph(text.replace("\n", "<br/>"), style)
    _, used_h = p.wrap(w, h)
    py = y_top - pad_y - used_h
    p.drawOn(c, x_l + pad_x, py)


def draw_row(c, row_idx, entry):
    date, task, time_str, members, comments = entry
    y_top, y_bot = ROWS[row_idx]
    draw_cell(c, date, COL_X["rownum_r"], COL_X["date_r"], y_top, y_bot, DATE_STYLE)
    draw_cell(c, task, COL_X["date_r"], COL_X["task_r"], y_top, y_bot, TASK_STYLE)
    draw_cell(c, time_str, COL_X["task_r"], COL_X["time_r"], y_top, y_bot, TIME_STYLE)
    member_text = "<br/>".join(members)
    draw_cell(c, member_text, COL_X["time_r"], COL_X["member_r"], y_top, y_bot, MEMBER_STYLE)
    draw_cell(c, comments, COL_X["member_r"], COL_X["comment_r"], y_top, y_bot, COMMENT_STYLE)


def build():
    out_path = r"C:\Users\Siddhant\Trashteroids\worklog_full.pdf"
    c = canvas.Canvas(out_path, pagesize=(PAGE_W, PAGE_H))

    pages = [ENTRIES[i:i + 6] for i in range(0, len(ENTRIES), 6)]
    for page_entries in pages:
        c.drawImage(TEMPLATE_PNG, 0, 0, width=PAGE_W, height=PAGE_H)
        for row_idx, entry in enumerate(page_entries):
            draw_row(c, row_idx, entry)
        c.showPage()

    c.save()
    print(f"Wrote {out_path}: {len(ENTRIES)} entries on {len(pages)} pages.")


if __name__ == "__main__":
    build()
