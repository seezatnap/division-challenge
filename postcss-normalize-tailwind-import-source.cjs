const path = require("node:path");

const projectRoot = __dirname;
const globalsCssPath = path.join(projectRoot, "src", "app", "globals.css");
const appCssDirectory = path.dirname(globalsCssPath);

module.exports = function normalizeTailwindImportSource() {
  return {
    postcssPlugin: "normalize-tailwind-import-source",
    Once(root, { result }) {
      const importsTailwind = root.nodes?.some(
        (node) =>
          node.type === "atrule" &&
          node.name === "import" &&
          /^["']tailwindcss["']/.test(node.params.trim()),
      );

      if (!importsTailwind) {
        return;
      }

      const from = result.opts.from;
      const needsSourceFile =
        !from || from === projectRoot || from === appCssDirectory || from.endsWith(path.sep);

      if (!needsSourceFile) {
        return;
      }

      result.opts.from = globalsCssPath;

      if (root.source?.input) {
        root.source.input.file = globalsCssPath;
      }
    },
  };
};

module.exports.postcss = true;
