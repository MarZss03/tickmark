# Tickmark mark in 3D: a cream slab and a gold slab with the tick cut between them.
# blender -b -P blender/mark3d.py -- still <out>   |   -- anim <out_prefix>
import bpy, bmesh, math, sys
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = argv[0] if argv else "still"
OUT = argv[1] if len(argv) > 1 else "//mark"

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# the mark in SVG units (y down), same geometry as assets/mark.svg
CREAM = [(0, 80), (191, 0), (191, 60), (48, 165), (0, 140)]
GOLD = [(0, 156), (48, 181), (191, 76), (191, 145), (0, 225)]

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

def mat(name, color, metal, rough, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    try: b.inputs["Coat Weight"].default_value = coat
    except Exception: pass
    return m

cream = mat("cream", srgb("#f4e4c8"), 0.0, 0.36, 0.4)
gold = mat("gold", srgb("#d2a965"), 1.0, 0.24)

root = bpy.data.objects.new("mark", None); bpy.context.collection.objects.link(root)

def slab(name, pts, m, depth=0.34):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new(((x - 95.5) / 100, 0, -(y - 112.5) / 100)) for x, y in pts]
    f = bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=[f])
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [v for v in r["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=(0, depth, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    ob.data.materials.append(m)
    bev = ob.modifiers.new("bevel", 'BEVEL'); bev.width = 0.018; bev.segments = 4; bev.limit_method = 'ANGLE'
    ob.location.y = -depth / 2
    ob.parent = root
    for p in ob.data.polygons: p.use_smooth = False
    return ob

slab("cream", CREAM, cream)
slab("gold", GOLD, gold)

# camera, front-on and slightly low
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); bpy.context.collection.objects.link(cam)
cam.location = (0.0, -9.2, -0.35); cam.data.lens = 85
cam.rotation_euler = (math.radians(92), 0, 0)
sc.camera = cam

def area(loc, rot, energy, size, color=(1, 1, 1)):
    l = bpy.data.objects.new("l", bpy.data.lights.new("l", 'AREA'))
    l.data.energy = energy; l.data.size = size; l.data.color = color
    l.location = loc; l.rotation_euler = rot; bpy.context.collection.objects.link(l)

area((-4, -5, 4), (math.radians(55), 0, math.radians(-38)), 900, 4)          # key, high left
area((5, 3, 1.5), (math.radians(80), 0, math.radians(125)), 1400, 2, (1, 0.86, 0.66))  # warm rim, behind right
area((0, -4, -4), (math.radians(140), 0, 0), 120, 6)                         # low fill
area((-5, 4, -1), (math.radians(95), 0, math.radians(-130)), 500, 1.5)       # cool edge, behind left

w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0, 0, 0, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.0

sc.render.engine = 'CYCLES'
sc.cycles.samples = 64 if MODE == "still" else 20
sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.view_settings.view_transform = 'AgX'
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'

def pose(t):
    # a slow figure-eight sway that loops exactly
    root.rotation_euler = (math.radians(6 * math.sin(4 * math.pi * t)), 0, math.radians(26 * math.sin(2 * math.pi * t)))

if MODE == "still":
    sc.render.resolution_x = sc.render.resolution_y = 1400
    pose(0.08)
    sc.render.filepath = OUT
    bpy.ops.render.render(write_still=True)
else:
    N = 144
    sc.render.resolution_x = sc.render.resolution_y = 900
    sc.frame_start, sc.frame_end = 1, N
    for f in range(1, N + 1):
        pose((f - 1) / N)
        root.keyframe_insert("rotation_euler", frame=f)
    sc.render.filepath = OUT
    bpy.ops.render.render(animation=True)
