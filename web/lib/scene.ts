export const SCENE_COOKIE = "dropout_scene";

export const SCENES = [{ id: "ocean", label: "海", file: "/scenes/ocean-column.jpg" }] as const;

export type UiScene = (typeof SCENES)[number]["id"];

export const DEFAULT_SCENE: UiScene = "ocean";

export function parseScene(value: string | undefined | null): UiScene {
  return SCENES.some((scene) => scene.id === value) ? (value as UiScene) : DEFAULT_SCENE;
}
