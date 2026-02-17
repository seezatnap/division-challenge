import * as fs from "fs";
import * as path from "path";

const FEATURES_DIR = path.join(__dirname, "..", "features");

const EXPECTED_FEATURES = [
  "division-engine",
  "workspace-ui",
  "rewards",
  "gallery",
  "persistence",
];

describe("Feature folder structure", () => {
  it.each(EXPECTED_FEATURES)(
    "has a %s feature directory with index.ts",
    (feature) => {
      const featurePath = path.join(FEATURES_DIR, feature);
      expect(fs.existsSync(featurePath)).toBe(true);
      expect(fs.statSync(featurePath).isDirectory()).toBe(true);

      const indexPath = path.join(featurePath, "index.ts");
      expect(fs.existsSync(indexPath)).toBe(true);
    }
  );
});
