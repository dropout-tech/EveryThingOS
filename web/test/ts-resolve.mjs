/** Let Node's type stripper import the shell's extensionless TypeScript. */

import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith(".json") && (specifier.startsWith("./") || specifier.startsWith("../"))) {
    const parent = context.parentURL ? new URL(context.parentURL) : pathToFileURL(`${process.cwd()}/`);
    return {
      format: "json",
      shortCircuit: true,
      url: new URL(specifier, parent).href,
      importAttributes: { ...context.importAttributes, type: "json" },
    };
  }
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return nextResolve(specifier, context);
  }
  const candidates = [specifier, `${specifier}.ts`, `${specifier}/index.ts`];
  let lastError;
  for (const candidate of candidates) {
    try {
      return await nextResolve(candidate, context);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
