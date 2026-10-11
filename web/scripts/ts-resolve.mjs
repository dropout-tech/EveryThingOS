// Lets `node --test` load lib/*.ts files that import siblings without an extension, as Next does.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND" || !/^\\.{1,2}\\//.test(specifier) || /\\.[cm]?[jt]s$/.test(specifier)) throw error;
    return next(specifier + ".ts", context);
  }
}`),
  import.meta.url,
);
