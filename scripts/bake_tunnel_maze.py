"""
Bake the interior surface of a tunnel maze from a level JSON into a single
GLB mesh suitable for the Trashteroids in-trashteroid level.

Run with:
    blender --background --python scripts/bake_tunnel_maze.py -- \
        src/levels/level2Tunnels.json public/models/level2_interior.glb

The script:
  1. Reads the JSON tunnel network.
  2. Builds a variable-radius tube mesh along a Catmull-Rom curve through
     each tunnel's (from -> midpoints -> to) control points, with closed
     end-caps so each tube is a manifold solid. Parallel-transport frames
     are used so rings stay aligned through curves and inflection points.
  3. Builds a UV sphere for each node.
  4. Boolean-unions all of those solids into a single closed manifold using
     the EXACT solver (in batches, with a tube-batch and a sphere-batch
     fallback if a single huge union fails).
  5. Optionally applies a light Subdivision Surface + Displace pass for
     organic wall variation.
  6. Smooth-shades and exports as GLB.

Collision is handled analytically against the JSON elsewhere in the game,
so the baked mesh is purely visual.
"""

import bpy
import bmesh
import json
import math
import os
import sys
import time
from mathutils import Vector, Quaternion

# -----------------------------------------------------------------------------
# Tuning
# -----------------------------------------------------------------------------

SAMPLES_PER_SEGMENT = 16        # Catmull-Rom samples between consecutive control points
RADIAL_SEGMENTS = 24            # ring resolution for tube cross-sections
SPHERE_SEGMENTS = 48            # UV sphere "u" segments
SPHERE_RINGS = 32               # UV sphere "v" rings
CATMULL_TENSION = 0.5           # match three.js CatmullRomCurve3 tension 0.5

# Subdivision/Displace for organic walls. Strength is fraction of average node radius.
APPLY_DISPLACEMENT = True
SUBSURF_LEVELS = 2
# Big lumpy displacement for chamber-scale variation. 0.18 of avg radius
# pushes walls in/out by ~100 units on a 586-unit average, which reads as
# clearly visible bumps rather than mere noise.
DISPLACE_STRENGTH_FRAC = 0.18
DISPLACE_NOISE_SCALE_FRAC = 0.35
DISPLACE_NOISE_DEPTH = 3
# Second, finer pass for surface-scale roughness so flying past walls reads as motion.
APPLY_FINE_DISPLACEMENT = True
FINE_DISPLACE_STRENGTH_FRAC = 0.05
FINE_DISPLACE_NOISE_SCALE_FRAC = 0.10
FINE_DISPLACE_NOISE_DEPTH = 2


# -----------------------------------------------------------------------------
# Scene reset helpers
# -----------------------------------------------------------------------------

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Make sure we're on a clean default collection.
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def select_only(obj):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


# -----------------------------------------------------------------------------
# Coordinate system
# -----------------------------------------------------------------------------
# The JSON is authored in three.js's right-handed Y-up frame. Blender is Z-up,
# and `bpy.ops.export_scene.gltf` rotates Blender's axes so its +Z becomes
# glTF +Y. To make the round-trip identity, we pre-transform every input
# position from three.js space into Blender space with (x, y, z) -> (x, -z, y).

def to_blender(p):
    return Vector((p[0], -p[2], p[1]))


# -----------------------------------------------------------------------------
# Math helpers
# -----------------------------------------------------------------------------

def catmull_rom_eval(p0, p1, p2, p3, s, tension=0.5):
    """Uniform Catmull-Rom with a tension factor matching three.js default."""
    # Three.js CatmullRomCurve3 with type='catmullrom' uses the standard
    # uniform Catmull-Rom basis with `tension` as the smoothing weight.
    t = tension
    s2 = s * s
    s3 = s2 * s
    # Standard catmull-rom basis with tension t (t=0.5 is the canonical form).
    c0 = -t * s + 2 * t * s2 - t * s3
    c1 = 1 + (t - 3) * s2 + (2 - t) * s3
    c2 = t * s + (3 - 2 * t) * s2 + (t - 2) * s3
    c3 = -t * s2 + t * s3
    return p0 * c0 + p1 * c1 + p2 * c2 + p3 * c3


def lerp(a, b, t):
    return a + (b - a) * t


def sample_curve(control_points, radii, samples_per_segment, tension):
    """Sample Catmull-Rom through `control_points` (>=2). Returns lists of
    (position, radius) tuples. Endpoints handled by mirroring."""
    n = len(control_points)
    if n < 2:
        raise ValueError("Need at least 2 control points.")

    # Build extended control point list with mirrored endpoints (matches the
    # behavior three.js uses for non-closed catmull-rom curves).
    ext_pts = [None] * (n + 2)
    ext_rads = [None] * (n + 2)
    ext_pts[1:n + 1] = control_points
    ext_rads[1:n + 1] = radii
    ext_pts[0] = control_points[0] * 2 - control_points[1]
    ext_pts[-1] = control_points[-1] * 2 - control_points[-2]
    ext_rads[0] = radii[0]
    ext_rads[-1] = radii[-1]

    out_pos = []
    out_rad = []
    for i in range(n - 1):
        p0, p1, p2, p3 = ext_pts[i], ext_pts[i + 1], ext_pts[i + 2], ext_pts[i + 3]
        r1, r2 = ext_rads[i + 1], ext_rads[i + 2]
        # First segment includes the start sample, later segments skip it to avoid dupes.
        first = 0 if i == 0 else 1
        for k in range(first, samples_per_segment + 1):
            s = k / samples_per_segment
            pos = catmull_rom_eval(p0, p1, p2, p3, s, tension)
            rad = lerp(r1, r2, s)
            out_pos.append(pos)
            out_rad.append(rad)
    return out_pos, out_rad


def parallel_transport_frames(positions):
    """For a polyline of positions, compute tangent / normal / binormal frames
    using parallel transport. Returns lists tangents, normals, binormals."""
    n = len(positions)
    tangents = [Vector((0, 0, 1)) for _ in range(n)]
    for i in range(n - 1):
        t = positions[i + 1] - positions[i]
        if t.length > 1e-9:
            t.normalize()
            tangents[i] = t
    tangents[-1] = tangents[-2]

    # Pick an initial normal not parallel to tangents[0].
    t0 = tangents[0]
    helper = Vector((0, 1, 0)) if abs(t0.y) < 0.9 else Vector((1, 0, 0))
    n0 = (helper - t0 * t0.dot(helper))
    if n0.length < 1e-9:
        helper = Vector((0, 0, 1))
        n0 = (helper - t0 * t0.dot(helper))
    n0.normalize()

    normals = [n0]
    binormals = [t0.cross(n0).normalized()]

    for i in range(1, n):
        prev_t = tangents[i - 1]
        curr_t = tangents[i]
        prev_n = normals[i - 1]
        axis = prev_t.cross(curr_t)
        axis_len = axis.length
        if axis_len < 1e-9:
            n_i = prev_n.copy()
        else:
            axis.normalize()
            cos_a = max(-1.0, min(1.0, prev_t.dot(curr_t)))
            angle = math.acos(cos_a)
            q = Quaternion(axis, angle)
            n_i = prev_n.copy()
            n_i.rotate(q)
            # Re-orthogonalize against current tangent.
            n_i = (n_i - curr_t * curr_t.dot(n_i)).normalized()
        normals.append(n_i)
        binormals.append(curr_t.cross(n_i).normalized())

    return tangents, normals, binormals


# -----------------------------------------------------------------------------
# Mesh builders
# -----------------------------------------------------------------------------

def build_tube_mesh(name, positions, radii, radial_segments):
    """Build a capped tube mesh through positions[i] with radii[i].
    Returns the created Object in the active collection."""
    tangents, normals, binormals = parallel_transport_frames(positions)

    bm = bmesh.new()
    rings = []  # list of lists of BMVert per ring
    for i, p in enumerate(positions):
        ring = []
        n_axis = normals[i]
        b_axis = binormals[i]
        r = radii[i]
        for j in range(radial_segments):
            theta = (j / radial_segments) * 2.0 * math.pi
            offset = n_axis * (r * math.cos(theta)) + b_axis * (r * math.sin(theta))
            v = bm.verts.new(p + offset)
            ring.append(v)
        rings.append(ring)

    bm.verts.ensure_lookup_table()

    # Side quads
    for i in range(len(rings) - 1):
        r0 = rings[i]
        r1 = rings[i + 1]
        for j in range(radial_segments):
            j2 = (j + 1) % radial_segments
            bm.faces.new((r0[j], r0[j2], r1[j2], r1[j]))

    # Caps (single n-gons), wound so normals point outward.
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])

    bm.normal_update()

    mesh = bpy.data.meshes.new(name + "_mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build_sphere(name, center, radius, segments, rings):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, radius=radius, location=center
    )
    obj = bpy.context.active_object
    obj.name = name
    return obj


# -----------------------------------------------------------------------------
# Boolean union
# -----------------------------------------------------------------------------

def boolean_union_into(base, others):
    """Successively union `others` into `base` using the Exact solver.
    Each `other` is deleted after successful application. Raises on failure."""
    for i, other in enumerate(list(others)):
        t0 = time.time()
        mod = base.modifiers.new(name=f"union_{i}", type='BOOLEAN')
        mod.operation = 'UNION'
        mod.solver = 'EXACT'
        mod.object = other
        select_only(base)
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception as e:
            print(f"  [WARN] Union of '{other.name}' into '{base.name}' failed: {e}")
            base.modifiers.remove(mod)
            raise
        # Delete consumed object.
        bpy.data.objects.remove(other, do_unlink=True)
        print(f"  union {i+1}/{len(others)}: merged into '{base.name}' in {time.time()-t0:.1f}s "
              f"-> verts={len(base.data.vertices)}")


# -----------------------------------------------------------------------------
# Main bake
# -----------------------------------------------------------------------------

def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    if len(argv) < 2:
        print("Usage: blender --background --python bake_tunnel_maze.py -- <input.json> <output.glb>")
        sys.exit(2)
    return argv[0], argv[1]


def main():
    in_path, out_path = parse_args()
    in_path = os.path.abspath(in_path)
    out_path = os.path.abspath(out_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    print(f"[bake] reading {in_path}")
    with open(in_path, "r") as f:
        data = json.load(f)

    nodes = data["nodes"]
    tunnels = data["tunnels"]

    reset_scene()

    avg_radius = sum(n["radius"] for n in nodes.values()) / max(1, len(nodes))
    print(f"[bake] nodes={len(nodes)} tunnels={len(tunnels)} avg_radius={avg_radius:.1f}")

    sphere_objs = []
    tube_objs = []

    # Build spheres.
    print("[bake] building node spheres...")
    for name, node in nodes.items():
        center = to_blender(node["pos"])
        sph = build_sphere(f"node_{name}", center, float(node["radius"]),
                           SPHERE_SEGMENTS, SPHERE_RINGS)
        sphere_objs.append(sph)
    print(f"[bake]   {len(sphere_objs)} spheres built")

    # Build tubes.
    print("[bake] building tunnel tubes...")
    for idx, tunnel in enumerate(tunnels):
        a = nodes[tunnel["from"]]
        b = nodes[tunnel["to"]]
        ctrl_pts = [to_blender(a["pos"])]
        ctrl_rads = [float(a["radius"])]
        for mp in tunnel.get("midpoints", []):
            ctrl_pts.append(to_blender(mp["pos"]))
            ctrl_rads.append(float(mp["radius"]))
        ctrl_pts.append(to_blender(b["pos"]))
        ctrl_rads.append(float(b["radius"]))

        positions, radii = sample_curve(ctrl_pts, ctrl_rads, SAMPLES_PER_SEGMENT, CATMULL_TENSION)
        obj = build_tube_mesh(
            f"tube_{idx}_{tunnel['from']}_to_{tunnel['to']}",
            positions, radii, RADIAL_SEGMENTS,
        )
        tube_objs.append(obj)
    print(f"[bake]   {len(tube_objs)} tubes built")

    # Union strategy: try one big chain first; if that fails, batch tubes and
    # spheres separately and union the two intermediates.
    all_objs = sphere_objs + tube_objs
    base = all_objs[0]
    others = all_objs[1:]
    print(f"[bake] union pass: base='{base.name}', remaining={len(others)}")

    try:
        boolean_union_into(base, others)
        merged = base
    except Exception as e:
        print(f"[bake] full chain union failed ({e}); retrying with batched approach")
        # Recover any orphaned objects: rebuild from scratch since some were deleted.
        reset_scene()
        sphere_objs = [
            build_sphere(f"node_{name}", to_blender(n["pos"]), float(n["radius"]),
                         SPHERE_SEGMENTS, SPHERE_RINGS)
            for name, n in nodes.items()
        ]
        tube_objs = []
        for idx, tunnel in enumerate(tunnels):
            a = nodes[tunnel["from"]]
            b = nodes[tunnel["to"]]
            ctrl_pts = [to_blender(a["pos"])]
            ctrl_rads = [float(a["radius"])]
            for mp in tunnel.get("midpoints", []):
                ctrl_pts.append(to_blender(mp["pos"]))
                ctrl_rads.append(float(mp["radius"]))
            ctrl_pts.append(to_blender(b["pos"]))
            ctrl_rads.append(float(b["radius"]))
            positions, radii = sample_curve(ctrl_pts, ctrl_rads, SAMPLES_PER_SEGMENT, CATMULL_TENSION)
            tube_objs.append(build_tube_mesh(
                f"tube_{idx}_{tunnel['from']}_to_{tunnel['to']}",
                positions, radii, RADIAL_SEGMENTS,
            ))

        print("[bake] unioning sphere batch...")
        sphere_base = sphere_objs[0]
        boolean_union_into(sphere_base, sphere_objs[1:])
        print("[bake] unioning tube batch...")
        tube_base = tube_objs[0]
        boolean_union_into(tube_base, tube_objs[1:])
        print("[bake] unioning the two batches...")
        boolean_union_into(sphere_base, [tube_base])
        merged = sphere_base

    print(f"[bake] merged solid: verts={len(merged.data.vertices)} faces={len(merged.data.polygons)}")

    select_only(merged)

    # Optional displacement for organic wall variation.
    if APPLY_DISPLACEMENT:
        print("[bake] applying subsurf + displace...")
        subsurf = merged.modifiers.new(name="subsurf", type='SUBSURF')
        subsurf.levels = SUBSURF_LEVELS
        subsurf.render_levels = SUBSURF_LEVELS
        bpy.ops.object.modifier_apply(modifier=subsurf.name)

        tex = bpy.data.textures.new("wall_noise", type='CLOUDS')
        tex.noise_scale = max(1.0, avg_radius * DISPLACE_NOISE_SCALE_FRAC)
        tex.noise_depth = DISPLACE_NOISE_DEPTH
        displace = merged.modifiers.new(name="displace", type='DISPLACE')
        displace.texture = tex
        displace.strength = avg_radius * DISPLACE_STRENGTH_FRAC
        displace.mid_level = 0.5
        bpy.ops.object.modifier_apply(modifier=displace.name)
        print(f"[bake] after coarse displace: verts={len(merged.data.vertices)} faces={len(merged.data.polygons)}")

        if APPLY_FINE_DISPLACEMENT:
            fine_tex = bpy.data.textures.new("wall_noise_fine", type='CLOUDS')
            fine_tex.noise_scale = max(0.5, avg_radius * FINE_DISPLACE_NOISE_SCALE_FRAC)
            fine_tex.noise_depth = FINE_DISPLACE_NOISE_DEPTH
            fine_displace = merged.modifiers.new(name="displace_fine", type='DISPLACE')
            fine_displace.texture = fine_tex
            fine_displace.strength = avg_radius * FINE_DISPLACE_STRENGTH_FRAC
            fine_displace.mid_level = 0.5
            bpy.ops.object.modifier_apply(modifier=fine_displace.name)
            print(f"[bake] after fine displace: verts={len(merged.data.vertices)} faces={len(merged.data.polygons)}")

    # Smooth shading.
    bpy.ops.object.shade_smooth()

    # Export.
    print(f"[bake] exporting GLB to {out_path}")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        export_apply=True,
        use_selection=False,
    )
    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"[bake] DONE. file size: {size_mb:.2f} MB")


if __name__ == "__main__":
    main()
