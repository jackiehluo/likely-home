import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const steps: string[][] = [
  ["bun", "run", "typecheck"],
  ["bun", "test"],
  ["bun", "run", "build"],
  ["bun", "run", "test:browser"],
  ["bun", "run", "store:assets"],
  ["bun", "run", "zip"],
];

for (const command of steps) {
  const child = Bun.spawn(command, { cwd: resolve("."), stdout: "inherit", stderr: "inherit" });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${command.join(" ")} failed with exit code ${exitCode}`);
}

const { version } = await Bun.file("package.json").json() as { version: string };
const archiveName = `likely-home-${version}-chrome.zip`;
await mkdir("outputs", { recursive: true });
await Bun.write(`outputs/${archiveName}`, Bun.file(`.output/${archiveName}`));
console.log(`release verified and copied to outputs/${archiveName}`);
