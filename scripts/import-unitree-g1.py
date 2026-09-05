"""공개 G1의 visual 메시와 기본 재질을 관절 계층을 보존한 GLB로 가져온다.

실행: python scripts/import-unitree-g1.py (numpy 필요)
생성 후 optimize-unitree-g1.mjs로 단순화·양자화한다. 별도 출력 파일로 변환 후
GLB를 교체하며 런타임 압축 디코더는 필요 없다.
"""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import struct
import urllib.request
import xml.etree.ElementTree as ET

import numpy as np


REVISION = "e4049d0a3bfd58d2a3081614e6777d4007e3f86a"
SOURCE = f"https://raw.githubusercontent.com/google-deepmind/mujoco_menagerie/{REVISION}/unitree_g1"
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/assets/unitree-g1.glb"


def fetch(relative):
    with urllib.request.urlopen(f"{SOURCE}/{relative}", timeout=60) as response:
        return response.read()


def main():
    xml = ET.fromstring(fetch("g1.xml"))
    asset = xml.find("asset")
    mesh_files = {element.get("name", Path(element.attrib["file"]).stem): element.attrib["file"]
                  for element in asset.findall("mesh")}
    with ThreadPoolExecutor(max_workers=4) as pool:
        mesh_data = dict(zip(mesh_files, pool.map(lambda file: fetch(f"assets/{file}"), mesh_files.values())))

    gltf = {"asset": {"version": "2.0", "generator": "import-unitree-g1.py",
                      "copyright": 'Copyright (c) 2016-2023 HangZhou YuShu TECHNOLOGY CO.,LTD. ("Unitree Robotics"). BSD-3-Clause.'},
            "scene": 0, "scenes": [{"nodes": [0]}],
            "nodes": [{"name": "Unitree G1", "rotation": [-0.5, -0.5, -0.5, 0.5], "children": []}],
            "meshes": [], "materials": [], "accessors": [], "bufferViews": [], "buffers": []}
    binary = bytearray()

    def accessor(array, kind, component_type):
        while len(binary) % 4:
            binary.append(0)
        raw = array.tobytes()
        view = len(gltf["bufferViews"])
        gltf["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(raw)})
        binary.extend(raw)
        item = {"bufferView": view, "componentType": component_type, "count": len(array), "type": kind}
        if kind == "VEC3":
            item.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        index = len(gltf["accessors"])
        gltf["accessors"].append(item)
        return index

    materials = {}
    for element in asset.findall("material"):
        materials[element.attrib["name"]] = len(gltf["materials"])
        gltf["materials"].append({"name": element.attrib["name"], "pbrMetallicRoughness": {
            "baseColorFactor": list(map(float, element.attrib["rgba"].split())),
            "metallicFactor": 0, "roughnessFactor": 1}})

    # 원본 STL의 면 법선을 보존하며 동일한 정점·법선을 공유한다.
    geometries = {}
    for name, raw in mesh_data.items():
        count = struct.unpack_from("<I", raw, 80)[0]
        if len(raw) != 84 + count * 50:
            raise ValueError(f"Unsupported binary STL: {name}")
        triangles = np.frombuffer(raw, dtype=np.dtype([
            ("normal", "<f4", (3,)), ("vertices", "<f4", (3, 3)), ("attribute", "<u2")]), offset=84, count=count)
        positions = triangles["vertices"].reshape(-1, 3)
        normals = np.repeat(triangles["normal"], 3, axis=0)
        vertices, indices = np.unique(np.concatenate([positions, normals], axis=1), axis=0, return_inverse=True)
        geometries[name] = {"attributes": {
            "POSITION": accessor(vertices[:, :3].astype("<f4"), "VEC3", 5126),
            "NORMAL": accessor(vertices[:, 3:].astype("<f4"), "VEC3", 5126)},
            "indices": accessor(indices.astype("<u4"), "SCALAR", 5125)}

    def transform(element):
        node = {}
        if "pos" in element.attrib:
            node["translation"] = list(map(float, element.attrib["pos"].split()))
        if "quat" in element.attrib:
            w, x, y, z = map(float, element.attrib["quat"].split())
            length = (w*w + x*x + y*y + z*z)**0.5
            node["rotation"] = [x/length, y/length, z/length, w/length]
        if any(key in element.attrib for key in ["euler", "axisangle", "xyaxes", "zaxis"]):
            raise ValueError("Unhandled orientation in source model")
        return node

    def add_body(body, parent):
        index = len(gltf["nodes"])
        gltf["nodes"].append({"name": body.attrib["name"], **transform(body), "children": []})
        gltf["nodes"][parent]["children"].append(index)
        for geom in body.findall("geom"):
            if geom.get("class") != "visual":
                continue
            name = geom.attrib["mesh"]
            mesh_index = len(gltf["meshes"])
            gltf["meshes"].append({"name": name, "primitives": [{
                **geometries[name], "material": materials[geom.get("material", "metal")]}]})
            gltf["nodes"][index]["children"].append(len(gltf["nodes"]))
            gltf["nodes"].append({"name": f"{name}_visual", "mesh": mesh_index, **transform(geom)})
        for child in body.findall("body"):
            add_body(child, index)

    for body in xml.find("worldbody").findall("body"):
        add_body(body, 0)
    gltf["buffers"] = [{"byteLength": len(binary)}]
    encoded = json.dumps(gltf, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    binary += b"\0" * (-len(binary) % 4)
    output = (struct.pack("<III", 0x46546C67, 2, 28 + len(encoded) + len(binary))
              + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
              + struct.pack("<II", len(binary), 0x004E4942) + binary)
    OUTPUT.write_bytes(output)
    OUTPUT.with_suffix(".LICENSE.txt").write_bytes(fetch("LICENSE"))
    OUTPUT.with_suffix(".NOTICE.txt").write_text(
        f"Unitree G1 visual model\nSource: {SOURCE}/g1.xml\nRevision: {REVISION}\n"
        "License: BSD-3-Clause (see unitree-g1.LICENSE.txt)\n"
        "Changes: visual geometry exported to glTF 2.0; collision geometry, physics and actuators omitted; "
        "duplicate vertices indexed; Z-up converted to Y-up; source neutral material colors retained.\n"
        "Reference configuration only. This asset does not represent received body-pose telemetry.\n",
        encoding="utf-8")
    print(f"{OUTPUT}: {len(output):,} bytes, {len(gltf['meshes'])} visual meshes")


if __name__ == "__main__":
    main()
