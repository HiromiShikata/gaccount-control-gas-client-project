import * as fs from 'fs';
import * as path from 'path';

const PACKAGE_JSON_PATH = path.join(__dirname, 'package.json');
const PACKAGE_LOCK_JSON_PATH = path.join(__dirname, 'package-lock.json');

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type PackageLockJson = {
  packages: Record<string, { version?: string }>;
};

const readPackageJson = (): PackageJson =>
  JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8')) as PackageJson;

const readPackageLockJson = (): PackageLockJson =>
  JSON.parse(
    fs.readFileSync(PACKAGE_LOCK_JSON_PATH, 'utf8'),
  ) as PackageLockJson;

const isVersionAtLeast = (actual: string, minimum: string): boolean => {
  const toParts = (version: string): number[] =>
    version
      .split('-')[0]
      .split('.')
      .map((part) => parseInt(part, 10));

  const actualParts = toParts(actual);
  const minimumParts = toParts(minimum);
  const length = Math.max(actualParts.length, minimumParts.length);

  for (let index = 0; index < length; index += 1) {
    const actualPart = actualParts[index] ?? 0;
    const minimumPart = minimumParts[index] ?? 0;
    if (actualPart > minimumPart) {
      return true;
    }
    if (actualPart < minimumPart) {
      return false;
    }
  }
  return true;
};

const findDependencyVersionField = (
  packageJson: PackageJson,
  packageName: string,
): string => {
  if (packageJson.dependencies && packageName in packageJson.dependencies) {
    return packageJson.dependencies[packageName];
  }
  if (
    packageJson.devDependencies &&
    packageName in packageJson.devDependencies
  ) {
    return packageJson.devDependencies[packageName];
  }
  throw new Error(
    `${packageName} was not found in dependencies or devDependencies`,
  );
};

const findLockedPackageEntries = (
  packageLockJson: PackageLockJson,
  packageName: string,
): { key: string; version: string }[] => {
  const suffix = `node_modules/${packageName}`;
  return Object.entries(packageLockJson.packages)
    .filter(([key]) => key === suffix || key.endsWith(`/${suffix}`))
    .map(([key, value]) => {
      if (value.version === undefined) {
        throw new Error(`${key} has no version field in package-lock.json`);
      }
      return { key, version: value.version };
    });
};

describe('dependency version pins', () => {
  const targetVersionsByPackageName: Record<string, string> = {
    '@swc/core': '1.16.18',
    '@types/google-apps-script': '2.0.13',
    jest: '30.5.2',
    prettier: '3.9.10',
  };

  it.each(Object.entries(targetVersionsByPackageName))(
    'pins %s to exactly %s in package.json',
    (packageName, targetVersion) => {
      const packageJson = readPackageJson();
      const actualVersion = findDependencyVersionField(
        packageJson,
        packageName,
      );
      expect(actualVersion).toBe(targetVersion);
    },
  );

  it.each(Object.entries(targetVersionsByPackageName))(
    'locks every installed entry of %s to at least %s in package-lock.json',
    (packageName, targetVersion) => {
      const packageLockJson = readPackageLockJson();
      const lockedEntries = findLockedPackageEntries(
        packageLockJson,
        packageName,
      );

      expect(lockedEntries.length).toBeGreaterThan(0);

      for (const entry of lockedEntries) {
        expect(isVersionAtLeast(entry.version, targetVersion)).toBe(true);
      }
    },
  );
});
