import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const paths = execFileSync(
  "npm",
  ["ls", "--omit=dev", "--all", "--parseable"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .slice(1);
let out =
  "USOTUKI — third-party runtime licenses\nGenerated from installed production dependencies.\n";
for (const dir of [...new Set(paths)].sort()) {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  out += `\n========== ${pkg.name} ${pkg.version} (${pkg.license ?? "see below"}) ==========\n`;
  const files = readdirSync(dir).filter((n) =>
    /^(license|copying|notice)(\.|$)/i.test(n),
  );
  for (const file of files) {
    try {
      out += readFileSync(join(dir, file), "utf8") + "\n";
    } catch {
      /* ディレクトリは対象外 */
    }
  }
  if (!files.length)
    out += `Package: ${pkg.repository?.url ?? pkg.homepage ?? pkg.name}\n`;
}
out += "\n========== Bundled time announcement audio ==========\n";
out += readFileSync("public/audio-attribution.txt", "utf8");
writeFileSync("public/licenses.txt", out);
console.log(`Runtime license notices: ${paths.length} packages`);
