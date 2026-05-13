"""Fill the rotated TSA template with worklog content (pages 8-11)."""
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER

# Landscape: rotated template is 792 W x 612 H
PAGE_W, PAGE_H = 792, 612

TEMPLATE_PNG = r"C:\Users\Siddhant\Trashteroids\template_rot_hires.png"

# Cell layout (measured from rotated template, in PDF coords)
# Column x boundaries
COL_X = {
    "rownum_l": 33,
    "rownum_r": 71,
    "date_r":   180,
    "task_r":   287,
    "time_r":   395,
    "member_r": 504,
    "comment_r": 729,
}

# Row y boundaries (top y, bottom y) for each row 1..6
ROWS = [
    (502.8, 426.2),  # row 1
    (426.2, 349.5),
    (349.5, 273.0),
    (273.0, 196.5),
    (196.5, 119.8),
    (119.8, 43.2),   # row 6
]

TEXT_DARK = HexColor("#222222")

# Paragraph styles - tuned to fit the cell heights
DATE_STYLE = ParagraphStyle(
    "date", fontName="Helvetica", fontSize=9, leading=11,
    textColor=TEXT_DARK, alignment=TA_LEFT,
)
TASK_STYLE = ParagraphStyle(
    "task", fontName="Helvetica", fontSize=8.5, leading=10.5,
    textColor=TEXT_DARK, alignment=TA_LEFT,
)
TIME_STYLE = ParagraphStyle(
    "time", fontName="Helvetica", fontSize=9, leading=11,
    textColor=TEXT_DARK, alignment=TA_LEFT,
)
MEMBER_STYLE = ParagraphStyle(
    "member", fontName="Helvetica", fontSize=8.5, leading=11,
    textColor=TEXT_DARK, alignment=TA_LEFT,
)
COMMENT_STYLE = ParagraphStyle(
    "comment", fontName="Helvetica", fontSize=7.2, leading=9,
    textColor=TEXT_DARK, alignment=TA_LEFT,
)

ENTRIES = [
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
    # Top-aligned text
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
    out_path = r"C:\Users\Siddhant\Trashteroids\worklog_pages_8-11.pdf"
    c = canvas.Canvas(out_path, pagesize=(PAGE_W, PAGE_H))

    pages = [ENTRIES[i:i + 6] for i in range(0, len(ENTRIES), 6)]
    for page_entries in pages:
        # Background = rotated template
        c.drawImage(TEMPLATE_PNG, 0, 0, width=PAGE_W, height=PAGE_H)
        for row_idx, entry in enumerate(page_entries):
            draw_row(c, row_idx, entry)
        c.showPage()

    c.save()
    print(f"Wrote {out_path}, {len(pages)} pages.")


if __name__ == "__main__":
    build()
