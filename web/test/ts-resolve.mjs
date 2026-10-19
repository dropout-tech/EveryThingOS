/** Let Node's type stripper import the shell's extensionless TypeScript. */

export async function resolve(specifier, context, nextResolve) {
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
