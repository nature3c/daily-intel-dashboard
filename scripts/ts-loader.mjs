import { access } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const projectRoot = process.cwd();
const emptyServerOnlyModule = "data:text/javascript,export default undefined;";

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      format: "module-typescript",
      shortCircuit: true,
      url: emptyServerOnlyModule,
    };
  }

  if (specifier.startsWith("@/")) {
    const filePath = path.join(projectRoot, "src", specifier.slice(2));
    const typedPath = `${filePath}.ts`;

    if (await fileExists(typedPath)) {
      return {
        format: "module-typescript",
        shortCircuit: true,
        url: pathToFileURL(typedPath).href,
      };
    }
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const parentPath = new URL(context.parentURL).pathname;
    const filePath = path.resolve(path.dirname(parentPath), specifier);
    const typedPath = `${filePath}.ts`;

    if (await fileExists(typedPath)) {
      return {
        format: "module-typescript",
        shortCircuit: true,
        url: pathToFileURL(typedPath).href,
      };
    }
  }

  return nextResolve(specifier, context);
}
