/**
 * Scene graph for desktop v4 `objects` — matches Rust `voxelle::scene::object_world_matrix`.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { SceneObjectFile } from './voxelleFormatCore';

export function objectWorldMatrix(objects: SceneObjectFile[], id: number): Matrix4 {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const chain: SceneObjectFile[] = [];
  const visited = new Set<number>();
  let cur: number | null = id;
  while (cur != null) {
    if (visited.has(cur)) {
      console.error(`Circular parent chain detected in scene object ${cur}`);
      break;
    }
    visited.add(cur);
    const obj = byId.get(cur);
    if (!obj) break;
    chain.push(obj);
    cur = obj.parentId;
  }
  chain.reverse();
  const m = new Matrix4().identity();
  const q = new Quaternion();
  const v = new Vector3();
  const s = new Vector3();
  const local = new Matrix4();
  for (const o of chain) {
    q.set(o.rotation[0], o.rotation[1], o.rotation[2], o.rotation[3]).normalize();
    v.set(o.translation[0], o.translation[1], o.translation[2]);
    s.set(o.scale[0], o.scale[1], o.scale[2]);
    local.compose(v, q, s);
    m.multiply(local);
  }
  return m;
}

export function isObjectVisibleInFile(objects: SceneObjectFile[] | undefined, id: number): boolean {
  if (!objects || objects.length === 0) return true;
  const o = objects.find((x) => x.id === id);
  return o ? o.visible : true;
}

/** Integer world cell (rounded) after object transform. */
export function transformLocalVoxelToWorldCell(
  matrix: Matrix4,
  x: number,
  y: number,
  z: number
): [number, number, number] {
  const e = new Vector3(x, y, z).applyMatrix4(matrix);
  return [Math.round(e.x), Math.round(e.y), Math.round(e.z)];
}
