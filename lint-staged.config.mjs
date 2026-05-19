import path from "node:path";

const quote = (value) => JSON.stringify(value);
const webRoot = path.join(process.cwd(), "apps/web");

function splitWebFiles(files) {
  const webFiles = [];
  const otherFiles = [];

  for (const file of files) {
    const absolute = path.resolve(file);
    if (absolute === webRoot || absolute.startsWith(`${webRoot}${path.sep}`)) {
      webFiles.push(path.relative(webRoot, absolute));
    } else {
      otherFiles.push(file);
    }
  }

  return { webFiles, otherFiles };
}

export default {
  "*.{js,jsx,ts,tsx,mjs,cjs}": (files) => {
    const { webFiles, otherFiles } = splitWebFiles(files);
    const commands = [];

    if (webFiles.length > 0) {
      commands.push(`pnpm -C apps/web exec eslint --fix ${webFiles.map(quote).join(" ")}`);
    }

    if (otherFiles.length > 0) {
      commands.push(`prettier --write ${otherFiles.map(quote).join(" ")}`);
    }

    return commands;
  },
  "*.{json,md,yml,yaml,css}": (files) => `prettier --write ${files.map(quote).join(" ")}`,
};
