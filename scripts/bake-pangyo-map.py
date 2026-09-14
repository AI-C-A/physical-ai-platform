"""원본을 바꾸지 않고 제공된 장면을 관제 지도용으로 베이크한다.
Blender -b --disable-autoexec SOURCE.blend --python this_file -- --output PATH
기존 GLB의 객체 목록을 기준으로 추가 연출 소품을 제외한다.
"""
import argparse
import json
import math
import os
import struct
import sys
import time
from pathlib import Path

import bpy

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--baseline', required=True)
parser.add_argument('--work', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
source_path = bpy.data.filepath
work = Path(args.work).resolve()
work.mkdir(parents=True, exist_ok=True)
start = time.time()
def log(message):
    print(f'PANGYO {time.time()-start:.1f}s {message}', flush=True)

with open(args.baseline, 'rb') as f:
    f.read(12)
    size, _ = struct.unpack('<II', f.read(8))
    baseline = json.loads(f.read(size))
names = {n.get('name') for n in baseline['nodes']}
s = bpy.context.scene
s.render.engine = 'CYCLES'
s.cycles.samples = 16
s.cycles.use_denoising = False
s.cycles.device = 'CPU'
s.render.bake.margin = 12
s.render.bake.use_selected_to_active = False
s.render.bake.use_clear = True
s.render.image_settings.file_format = 'PNG'
s.view_settings.view_transform = 'Standard'

# 기존 단면 지도의 건축물과 가구 범위를 유지한다.
for obj in list(bpy.data.objects):
    if obj.name not in names or obj.type not in {'MESH', 'CURVE', 'EMPTY'}:
        bpy.data.objects.remove(obj, do_unlink=True)
for obj in s.objects:
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.hide_render = False
    obj.animation_data_clear()

missing = []
for image in list(bpy.data.images):
    if image.source == 'FILE' and not image.packed_file and not os.path.isfile(bpy.path.abspath(image.filepath)):
        missing.append(image.name)
        for mat in bpy.data.materials:
            if mat.node_tree:
                for node in list(mat.node_tree.nodes):
                    if node.type == 'TEX_IMAGE' and node.image == image:
                        mat.node_tree.nodes.remove(node)
        bpy.data.images.remove(image)
log(f'Excluded missing images: {missing}')

# 가구의 계산된 형상을 적용하고 고밀도 메시만 줄인다.
# 건축물 윤곽과 바닥 형상은 유지한다.
for obj in list(s.objects):
    if obj.type != 'MESH':
        continue
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if len(obj.data.polygons) > 20000:
        mod = obj.modifiers.new('Web furniture reduction', 'DECIMATE')
        if obj.name.startswith('Cube') and obj.dimensions.z > 200:
            mod.decimate_type = 'DISSOLVE'
            mod.angle_limit = math.radians(0.1)
        else:
            mod.ratio = 0.20
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if obj.name.startswith('Cube') and not any(obj.data.materials) and obj.dimensions.z > 200:
        obj.data.materials.clear()
        obj.data.materials.append(bpy.data.materials['WALL_PLASTER'])
        for poly in obj.data.polygons:
            poly.material_index = 0
log('Prepared map geometry')

walls = []
floors = []
for obj in list(s.objects):
    if obj.type != 'MESH':
        continue
    mats = [m.name for m in obj.data.materials if m]
    if mats and all(n in {'WALL_PLASTER', 'COL_CONCRETE_WHITE', 'SIGN_PANEL'} for n in mats):
        if obj.dimensions.z > 200 or 'SIGN_PANEL' not in mats:
            walls.append(obj)
    elif 'FLOOR_CARPET' in mats:
        floors.append(obj)

def join_group(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if name == 'Pangyo_Walls':
        # 베벨과 UV 베이크 전에 겹친 기둥·벽·표지판 면을 합집합으로 제거한다.
        # 단순 결합만 하면 깊이 버퍼 간섭이 남는다.
        import bmesh
        for part in objects:
            bm = bmesh.new()
            bm.from_mesh(part.data)
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.001)
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            bmesh.ops.dissolve_limit(bm, angle_limit=0.001, verts=list(bm.verts), edges=list(bm.edges), delimit={'MATERIAL'})
            bm.to_mesh(part.data)
            bm.free()
        obj = objects[0]
        operands = bpy.data.collections.new('Wall union operands')
        s.collection.children.link(operands)
        for part in objects[1:]:
            operands.objects.link(part)
        mod = obj.modifiers.new('Remove intersecting architectural faces', 'BOOLEAN')
        mod.operation = 'UNION'
        mod.solver = 'EXACT'
        mod.operand_type = 'COLLECTION'
        mod.collection = operands
        mod.use_self = True
        mod.use_hole_tolerant = True
        log(f'Unioning {len(objects)} architectural objects')
        bpy.ops.object.modifier_apply(modifier=mod.name)
        if not obj.data.polygons:
            raise RuntimeError('Architectural union produced an empty mesh')
        for part in objects[1:]:
            bpy.data.objects.remove(part, do_unlink=True)
        bpy.data.collections.remove(operands)
        # 컬렉션 불리언은 서로 다른 재질 슬롯 순서를 보존하지 못하므로
        # 합친 형상에는 하나의 플라스터 마감을 적용한다.
        obj.data.materials.clear()
        obj.data.materials.append(bpy.data.materials['WALL_PLASTER'])
        for poly in obj.data.polygons:
            poly.material_index = 0
        log(f'Unified architecture: {len(obj.data.polygons)} faces')
    else:
        if len(objects) > 1:
            bpy.ops.object.join()
        obj = bpy.context.object
    obj.name = name
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if name == 'Pangyo_Walls':
        mod = obj.modifiers.new('Architectural edge highlights', 'BEVEL')
        mod.width = 0.6
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        # 불리언·베벨 교차부에 남은 1mm 미만의 붕괴 면을 정리한다.
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.005)
        bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=0.005)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        seen_faces = set()
        duplicates = []
        for face in bm.faces:
            key = tuple(sorted(tuple(round(v, 4) for v in vert.co) for vert in face.verts))
            if key in seen_faces:
                duplicates.append(face)
            else:
                seen_faces.add(key)
        bmesh.ops.delete(bm, geom=duplicates, context='FACES_ONLY')
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
    # 위치 기반 원본 셰이더는 새 UV 아틀라스에 의존하지 않는다.
    while obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers[0])
    obj.data.uv_layers.new(name='WebBakeUV')
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.008)
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj

objects = [join_group(floors, 'Pangyo_Floor'), join_group(walls, 'Pangyo_Walls')]
log('Created floor and wall UV atlases')

# 원본 색과 노멀 세부를 유지하며 셰이더 입력을 glTF 호환 이미지로 베이크한다.
# AO 거리는 원본의 센티미터 단위로 90까지 제한한다.
def bake(obj, channel, size=2048):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    image = bpy.data.images.new(f'{obj.name}_{channel}', width=size, height=size, alpha=False)
    image.colorspace_settings.name = 'sRGB' if channel == 'Color' else 'Non-Color'
    restore = []
    for mat in obj.data.materials:
        tree = mat.node_tree
        output = next(n for n in tree.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
        original = output.inputs['Surface'].links[0].from_socket
        shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
        target = tree.nodes.new('ShaderNodeTexImage')
        target.image = image
        tree.nodes.active = target
        temporary = [target]
        if channel != 'Normal':
            emission = tree.nodes.new('ShaderNodeEmission')
            temporary.append(emission)
            if channel == 'AO':
                ao = tree.nodes.new('ShaderNodeAmbientOcclusion')
                ao.inputs['Distance'].default_value = 90
                temporary.append(ao)
                tree.links.new(ao.outputs['AO'], emission.inputs['Color'])
            else:
                socket = shader.inputs['Base Color' if channel == 'Color' else 'Roughness']
                if socket.is_linked:
                    tree.links.new(socket.links[0].from_socket, emission.inputs['Color'])
                else:
                    value = socket.default_value
                    emission.inputs['Color'].default_value = tuple(value) if channel == 'Color' else (value,value,value,1)
            tree.links.new(emission.outputs[0], output.inputs['Surface'])
        restore.append((tree, output, original, temporary))
    log(f'Baking {obj.name} {channel}')
    bpy.ops.object.bake(type='NORMAL' if channel == 'Normal' else 'EMIT')
    image.filepath_raw = str(work / f'{image.name}.png')
    image.save()
    image.pack()
    for tree, output, original, temporary in restore:
        tree.links.new(original, output.inputs['Surface'])
        for node in temporary:
            tree.nodes.remove(node)
    return image

for obj in objects:
    maps = {channel: bake(obj, channel) for channel in ['Color','Normal','Roughness','AO']}
    mat = bpy.data.materials.new(obj.name + '_Baked_PBR')
    mat.use_nodes = True
    tree = mat.node_tree
    shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Metallic'].default_value = 0
    for channel, socket_name in [('Color','Base Color'), ('Roughness','Roughness')]:
        node = tree.nodes.new('ShaderNodeTexImage')
        node.image = maps[channel]
        tree.links.new(node.outputs['Color'], shader.inputs[socket_name])
    node = tree.nodes.new('ShaderNodeTexImage')
    node.image = maps['Normal']
    normal = tree.nodes.new('ShaderNodeNormalMap')
    tree.links.new(node.outputs['Color'],normal.inputs['Color'])
    tree.links.new(normal.outputs[0],shader.inputs['Normal'])
    group = bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
    if not group.interface.items_tree:
        group.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    out = tree.nodes.new('ShaderNodeGroup')
    out.node_tree = group
    node = tree.nodes.new('ShaderNodeTexImage')
    node.image = maps['AO']
    tree.links.new(node.outputs['Color'],out.inputs['Occlusion'])
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.material_index = 0
    log(f'Completed {obj.name}')

# 별도 반복 UV로 바닥의 석재 세부를 유지한다.
# WebBakeUV에는 반복하지 않는 건축물 AO 아틀라스를 보존한다.
bpy.ops.mesh.primitive_plane_add(size=60, location=(100000, 100000, 100000))
tile = bpy.context.object
tile.name = 'Reference_Tile'
mat = bpy.data.materials.new('Reference_Greige_Tile')
mat.use_nodes = True
tile.data.materials.append(mat)
tree = mat.node_tree
shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
shader.inputs['Roughness'].default_value = 0.7
uv = tree.nodes.new('ShaderNodeTexCoord')
tex = tree.nodes.new('ShaderNodeTexImage')
tex.image = bpy.data.images.load(str(Path(args.baseline).resolve().parent / 'pangyo-tile-basecolor.png'))
tex.image.pack()
tree.links.new(uv.outputs['UV'], tex.inputs['Vector'])
sep = tree.nodes.new('ShaderNodeSeparateXYZ')
tree.links.new(uv.outputs['UV'], sep.inputs[0])
edges = []
for axis in ['X','Y']:
    for operation, value in [('LESS_THAN',0.0017),('GREATER_THAN',0.9983)]:
        node = tree.nodes.new('ShaderNodeMath')
        node.operation = operation
        node.inputs[1].default_value = value
        tree.links.new(sep.outputs[axis],node.inputs[0])
        edges.append(node.outputs[0])
edge = edges[0]
for socket in edges[1:]:
    node = tree.nodes.new('ShaderNodeMath')
    node.operation = 'MAXIMUM'
    tree.links.new(edge,node.inputs[0]); tree.links.new(socket,node.inputs[1])
    edge = node.outputs[0]
mix = tree.nodes.new('ShaderNodeMixRGB')
tree.links.new(edge,mix.inputs[0])
tree.links.new(tex.outputs['Color'],mix.inputs[1])
mix.inputs[2].default_value = (0.34,0.33,0.30,1)
tree.links.new(mix.outputs[0],shader.inputs['Base Color'])
# 석재가 거친 카펫처럼 보이지 않도록 줄눈 깊이를 작게 유지한다.
invert = tree.nodes.new('ShaderNodeMath'); invert.operation = 'SUBTRACT'; invert.inputs[0].default_value = 1
tree.links.new(edge,invert.inputs[1])
bump = tree.nodes.new('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.025; bump.inputs['Strength'].default_value = 0.25
tree.links.new(invert.outputs[0],bump.inputs['Height'])
tree.links.new(bump.outputs[0],shader.inputs['Normal'])
tile_maps = {channel:bake(tile,channel,size=1024) for channel in ['Color','Normal','Roughness']}
bpy.data.objects.remove(tile,do_unlink=True)
floor = objects[0]
tile_uv = floor.data.uv_layers.new(name='TileUV')
for poly in floor.data.polygons:
    for li in poly.loop_indices:
        point = floor.matrix_world @ floor.data.vertices[floor.data.loops[li].vertex_index].co
        tile_uv.data[li].uv = (point.x/60,point.y/60)
floor.data.uv_layers.active_index = 0
floor.data.uv_layers[0].active_render = True
tree = floor.data.materials[0].node_tree
uv = tree.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'TileUV'
for node in tree.nodes:
    if node.type == 'TEX_IMAGE':
        channel = next((c for c in tile_maps if node.image.name.endswith('_'+c)),None)
        if channel:
            node.image = tile_maps[channel]
            tree.links.new(uv.outputs[0],node.inputs['Vector'])
    elif node.type == 'NORMAL_MAP':
        node.uv_map = 'TileUV'
log('Applied photo-matched 60 cm tiles with 2 mm joints')

# 웹 뷰어에서도 겹친 유리 너머가 보이도록
# Cycles Glass BSDF 대신 알파 블렌딩을 사용한다.
for mat in bpy.data.materials:
    if 'glass' not in mat.name.lower():
        continue
    mat.use_nodes = True
    mat.node_tree.nodes.clear()
    tree = mat.node_tree
    shader = tree.nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Base Color'].default_value = (0.72,0.83,0.81,1)
    shader.inputs['Alpha'].default_value = 0.18
    shader.inputs['Metallic'].default_value = 0
    shader.inputs['Roughness'].default_value = 0.16
    shader.inputs['Transmission Weight'].default_value = 0
    shader.inputs['IOR'].default_value = 1.45
    mat.surface_render_method = 'DITHERED'
    out = tree.nodes.new('ShaderNodeOutputMaterial')
    tree.links.new(shader.outputs[0],out.inputs['Surface'])
log('Converted glass to transparent web materials')

# 편집 가능한 파생본을 따로 저장하고 텍스처를 포함해 내보낸다.
bpy.ops.wm.save_as_mainfile(filepath=str(work / 'Pangyo_web.blend'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=args.output, export_format='GLB', use_selection=True,
    export_apply=True, export_animations=False, export_cameras=False, export_lights=False,
    export_image_format='AUTO')
log(f'Exported {args.output}')
with open(work / 'bake-report.json','w') as f:
    json.dump({'source':source_path,'excluded_images':missing,'baked_objects':[o.name for o in objects],'seconds':time.time()-start},f,indent=2)
