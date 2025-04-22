import { type Options } from "tsup";

declare function createBanner(packageName: string, version: string): string;

type BuildConfigParams = {
  packageName: string;
  packageVersion: string;
  target: "browser" | "neutral";
  options: Options;
};

declare function getBuildConfig(params: BuildConfigParams): Options[];
