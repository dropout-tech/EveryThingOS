import { buildScript, serviceScript } from "./service-build";
import { careScript, eduScript } from "./edu-care";
import { farmScript, makeScript, moveScript } from "./make-move-farm";
import { foodScript } from "./food";
import { retailScript } from "./retail";
import { otherScript, stayScript } from "./stay-other";
import type { SceneBeat, SceneScript } from "./types";

export type { BeatHref, SceneBeat, SceneScript } from "./types";
export { BEAT_HREFS } from "./types";
export {
  retailScript,
  foodScript,
  eduScript,
  careScript,
  serviceScript,
  makeScript,
  buildScript,
  moveScript,
  stayScript,
  farmScript,
  otherScript,
};

/** Eleven Taiwan shops. Each script is exactly ten beats the owner would actually do. */
export const SCENE_SCRIPTS: readonly SceneScript[] = [
  retailScript,
  foodScript,
  eduScript,
  careScript,
  serviceScript,
  makeScript,
  buildScript,
  moveScript,
  stayScript,
  farmScript,
  otherScript,
];

const byId = new Map(SCENE_SCRIPTS.map((script) => [script.id, script]));

export function scriptById(id: string | undefined): SceneScript | undefined {
  return id ? byId.get(id) : undefined;
}

export function beatByStep(sceneId: string | undefined, step: string): SceneBeat | undefined {
  return scriptById(sceneId)?.beats.find((beat) => beat.step === step);
}
