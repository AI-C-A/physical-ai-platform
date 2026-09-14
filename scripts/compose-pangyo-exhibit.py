"""원본 지도와 자산을 유지하며 사진 기준의 정적 전시 배치를 구성한다.
Blender -b --factory-startup --python scripts/compose-pangyo-exhibit.py
좌표는 Blender Z-up이며 지도 자산의 센티미터 단위를 사용한다.
배치는 사진 두 장에서 추정한 것으로 실측·실시간 위치가 아니다.
"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.run/pangyo-layout'
WORK.mkdir(parents=True, exist_ok=True)
SITE = ROOT / 'public/assets/sites'
FLOOR = -4.7
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SITE / 'pangyo-cinematic.glb'))


def material(name, color, metallic=0, roughness=0.5):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


white = material('Exhibit warm white', (0.72, 0.73, 0.69))
steel = material('Exhibit steel', (0.16, 0.18, 0.17), 0.7)
black = material('Exhibit screen bezel', (0.012, 0.014, 0.015))
screen = material('Exhibit inactive screen', (0.019, 0.024, 0.03), 0.2, 0.18)
wood = material('Exhibit oak', (0.32, 0.16, 0.055))


def box(name, xyz, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(xyz[0], xyz[1], FLOOR + xyz[2]))
    obj = bpy.context.object
    obj.name = 'Exhibit_' + name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new('Soft furniture edges', 'BEVEL')
    bevel.width = 0.6
    bevel.segments = 2
    return obj


# 화면은 +X를 향하고 기준 시점의 오른쪽은 +Y다.
# 사무실 쪽 벽을 배경으로 두고 표지판·유리방 방향 통로를 확보한다.
for i, y in enumerate((-610, -405, -200), 1):
    box(f'monitor_{i}_bezel', (-650, y, 153), (5, 198, 112), black)
    box(f'monitor_{i}_screen', (-647.3, y, 153), (0.5, 193, 107), screen)
    box(f'monitor_{i}_stand', (-654, y, 60), (10, 14, 120), white)
    box(f'monitor_{i}_foot', (-647, y, 3), (62, 70, 6), white)

for i, y in enumerate((-655, -460), 1):
    box(f'table_{i}_top', (-565, y, 75), (65, 190, 4), white)
    box(f'table_{i}_apron', (-587, y, 58), (3, 172, 28), white)
    for dx in (-25, 25):
        for dy in (-85, 85):
            box(f'table_{i}_leg_{dx}_{dy}', (-565 + dx, y + dy, 36), (4, 4, 72), steel)
box('arm_workbench', (-450, -120, 74), (65, 120, 7), wood)
for y in (-165, -75):
    box(f'arm_workbench_leg_{y}', (-450, y, 35), (50, 9, 70), wood)
box('white_equipment_cabinet', (-360, -130, 36), (58, 58, 72), white)

placements = [
    dict(id='rbq10', file='rbq10_textured.glb', x=-280, y=-515, z=0, yaw=90, correct_x=-90),
    dict(id='openarm', file='openarm-bimanual-five-finger.glb', x=-450, y=-120, z=77.5, yaw=0),
    dict(id='four-wheel-rover', file='four-wheel-rover.glb', x=-330, y=0, z=0, yaw=0),
    dict(id='wheeled-robot', file='wheeled-robot.glb', x=-400, y=140, z=0, yaw=-10),
]
report = []
for spec in placements:
    previous = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / 'public/assets' / spec['file']))
    objects = set(bpy.data.objects) - previous
    pivot = bpy.data.objects.new('Exhibit_robot_' + spec['id'], None)
    bpy.context.collection.objects.link(pivot)
    for obj in objects:
        # 정적 전시 배치이므로 기존 기본 자세를 유지한다.
        obj.animation_data_clear()
        if obj.parent not in objects:
            obj.parent = pivot
    pivot.rotation_euler = (math.radians(spec.get('correct_x', 0)), 0, math.radians(spec['yaw']))
    pivot.scale = (100, 100, 100)
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(p) for obj in objects if obj.type == 'MESH' for p in obj.bound_box]
    low = Vector(tuple(min(p[a] for p in points) for a in range(3)))
    high = Vector(tuple(max(p[a] for p in points) for a in range(3)))
    pivot.location = (spec['x'] - (low.x + high.x) / 2,
                      spec['y'] - (low.y + high.y) / 2, FLOOR + spec['z'] - low.z)
    report.append({**spec, 'dimensions_cm': list(high - low)})

bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(WORK / 'Pangyo_exhibit.blend'))
bpy.ops.export_scene.gltf(filepath=str(SITE / 'pangyo-exhibit.glb'), export_format='GLB',
                           export_animations=False, export_cameras=False, export_lights=False)
(WORK / 'placement-report.json').write_text(json.dumps(report, indent=2))

# 로컬 미리보기 카메라는 웹 자산에서 제외한다.
s = bpy.context.scene
bpy.ops.object.camera_add(location=(300, -450, 650))
camera = bpy.context.object
camera.rotation_euler = (Vector((-470, -210, 65)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 1250
camera.data.clip_end = 10000
s.camera = camera
s.render.engine = 'CYCLES'
s.cycles.samples = 16
s.world.color = (0.6, 0.6, 0.6)
for loc, power, size in [((0,-400,750), 6000000, 1000), ((-400,300,650), 4000000, 800)]:
    bpy.ops.object.light_add(type='AREA', location=loc)
    bpy.context.object.data.energy = power
    bpy.context.object.data.shape = 'DISK'
    bpy.context.object.data.size = size
s.render.resolution_x = 1500
s.render.resolution_y = 1000
s.render.resolution_percentage = 100
s.render.filepath = str(WORK / 'exhibit-preview.png')
bpy.ops.render.render(write_still=True)
