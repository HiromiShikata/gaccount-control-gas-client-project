const fs = require('fs');
const path = require('path');

const workflowText = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'deploy-clients.yml'),
  'utf8',
);

const expressionsReferencing = (name) =>
  [...workflowText.matchAll(/\$\{\{([\s\S]*?)\}\}/g)]
    .map((match) => match[1].trim())
    .filter((expression) => expression.includes(name));

describe('deploy-clients workflow', () => {
  it('reads the client key list from a repository variable, because Actions drops a job output whose value contains a secret', () => {
    expect(expressionsReferencing('CLIENT_KEYS')).toEqual(['vars.CLIENT_KEYS']);
  });

  it('keeps every per-client credential in secrets', () => {
    expect(expressionsReferencing('CLIENT_AUTH_')).toEqual([
      "secrets[format('CLIENT_AUTH_{0}', matrix.key)]",
    ]);
    expect(expressionsReferencing('SCRIPT_ID_')).toEqual([
      "secrets[format('SCRIPT_ID_{0}', matrix.key)]",
    ]);
  });

  it('builds the deployment matrix from the resolved key list', () => {
    expect(workflowText).toContain(
      'fromJson(needs.resolve-client-keys.outputs.keys)',
    );
  });
});
