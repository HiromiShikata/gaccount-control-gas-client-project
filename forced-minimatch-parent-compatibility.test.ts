import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type GlobSyncOptions = {
  cwd: string;
  nodir: boolean;
  dot: boolean;
  ignore: string[];
};

type GlobSync = (pattern: string, options: GlobSyncOptions) => string[];

type TestExcludeOptions = {
  include: string[];
  exclude: string[];
  extension: string[];
};

type TestExcludeInstance = {
  globSync: (cwd: string) => string[];
  shouldInstrument: (filename: string) => boolean;
};

type TestExcludeConstructor = new (
  options: TestExcludeOptions & { cwd: string },
) => TestExcludeInstance;

const FIXTURE_FILES = [
  'src/index.ts',
  'src/util/helper.ts',
  'src/util/helper.test.ts',
  'src/util/data.json',
  'lib/legacy.js',
  'lib/node_modules/pkg/index.js',
  '.hidden/secret.ts',
  'README.md',
];

const rootDir = __dirname;
const babelPluginIstanbulDir = path.dirname(
  require.resolve('babel-plugin-istanbul/package.json', { paths: [rootDir] }),
);
const testExcludePath = require.resolve('test-exclude', {
  paths: [babelPluginIstanbulDir],
});
const testExcludeDir = path.dirname(testExcludePath);
const globFromTestExcludePath = require.resolve('glob', {
  paths: [testExcludeDir],
});
const globFromRootPath = require.resolve('glob', { paths: [rootDir] });

const readPackageVersion = (packageJsonPath: string): string =>
  (JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version: string })
    .version;

const loadGlobSync = (modulePath: string): GlobSync =>
  (require(modulePath) as { globSync: GlobSync }).globSync;

const loadTestExclude = (): TestExcludeConstructor =>
  require(testExcludePath) as TestExcludeConstructor;

const globCases: { pattern: string; expected: string[] }[] = [
  {
    pattern: '**/*.{ts,js}',
    expected: [
      '.hidden/secret.ts',
      'lib/legacy.js',
      'src/index.ts',
      'src/util/helper.test.ts',
      'src/util/helper.ts',
    ],
  },
  {
    pattern: 'src/util/!(*.test).ts',
    expected: ['src/util/helper.ts'],
  },
];

const globImplementations: { name: string; modulePath: string }[] = [
  {
    name: 'glob resolved from test-exclude',
    modulePath: globFromTestExcludePath,
  },
  { name: 'glob resolved from repository root', modulePath: globFromRootPath },
];

const testExcludeCases: {
  name: string;
  options: TestExcludeOptions;
  expected: string[];
}[] = [
  {
    name: 'include src and exclude tests',
    options: {
      include: ['src/**'],
      exclude: ['**/*.test.ts'],
      extension: ['.ts'],
    },
    expected: ['src/index.ts', 'src/util/helper.ts'],
  },
  {
    name: 'exclude tests across typescript and javascript',
    options: {
      include: [],
      exclude: ['**/*.test.ts'],
      extension: ['.ts', '.js'],
    },
    expected: [
      '.hidden/secret.ts',
      'lib/legacy.js',
      'src/index.ts',
      'src/util/helper.ts',
    ],
  },
];

const shouldInstrumentCases: { relativePath: string; expected: boolean }[] = [
  { relativePath: 'src/index.ts', expected: true },
  { relativePath: 'src/util/helper.ts', expected: true },
  { relativePath: 'src/util/helper.test.ts', expected: false },
  { relativePath: 'src/util/data.json', expected: false },
  { relativePath: 'lib/legacy.js', expected: false },
  { relativePath: '.hidden/secret.ts', expected: false },
];

describe('forced minimatch 11.0.1 as seen by parent packages', () => {
  let fixtureDir = '';

  beforeAll(() => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forced-minimatch-'));
    for (const relativePath of FIXTURE_FILES) {
      const absolutePath = path.join(fixtureDir, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, '');
    }
  });

  afterAll(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('resolves minimatch under test-exclude to 11.0.1', () => {
    const minimatchVersion = readPackageVersion(
      require.resolve('minimatch/package.json', { paths: [testExcludeDir] }),
    );
    expect(minimatchVersion).toBe('11.0.1');
  });

  describe.each(globImplementations)('$name', ({ modulePath }) => {
    it.each(globCases)('globSync matches $pattern', ({ pattern, expected }) => {
      const globSync = loadGlobSync(modulePath);
      const actual = globSync(pattern, {
        cwd: fixtureDir,
        nodir: true,
        dot: true,
        ignore: ['**/node_modules/**'],
      });
      expect([...actual].sort()).toEqual(expected);
    });
  });

  describe('test-exclude', () => {
    it.each(testExcludeCases)('globSync: $name', ({ options, expected }) => {
      const TestExclude = loadTestExclude();
      const testExclude = new TestExclude({ cwd: fixtureDir, ...options });
      expect([...testExclude.globSync(fixtureDir)].sort()).toEqual(expected);
    });

    it.each(shouldInstrumentCases)(
      'shouldInstrument $relativePath',
      ({ relativePath, expected }) => {
        const TestExclude = loadTestExclude();
        const testExclude = new TestExclude({
          cwd: fixtureDir,
          include: ['src/**'],
          exclude: ['**/*.test.ts'],
          extension: ['.ts'],
        });
        expect(
          testExclude.shouldInstrument(path.join(fixtureDir, relativePath)),
        ).toBe(expected);
      },
    );
  });
});
