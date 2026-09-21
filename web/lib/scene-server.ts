import { cookies } from "next/headers";
import { parseScene, SCENE_COOKIE, type UiScene } from "./scene";

export async function currentScene(): Promise<UiScene> {
  const jar = await cookies();
  return parseScene(jar.get(SCENE_COOKIE)?.value);
}
