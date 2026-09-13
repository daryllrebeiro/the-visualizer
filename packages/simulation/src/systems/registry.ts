import type { SystemDefinition } from '@the-visualizer/contracts';

const systems = new Map<string, SystemDefinition>();

export function registerSystem(def: SystemDefinition): void {
  systems.set(def.id, def);
}

export function getSystem(id: string): SystemDefinition | undefined {
  return systems.get(id);
}

export function listSystems(): Array<Pick<SystemDefinition, 'id' | 'name' | 'description'>> {
  return [...systems.values()]
    .map((d) => ({ id: d.id, name: d.name, description: d.description }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function clearSystems(): void {
  systems.clear();
}
