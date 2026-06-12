import path from "node:path";

const projectRoot = process.cwd();
const normalizeTailwindImportSourcePlugin = path.join(
  projectRoot,
  "postcss-normalize-tailwind-import-source.cjs",
);

const config = {
  plugins: {
    [normalizeTailwindImportSourcePlugin]: {},
    "@tailwindcss/postcss": {
      base: projectRoot,
    },
  },
};

export default config;
