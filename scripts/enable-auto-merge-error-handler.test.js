const { spawnSync } = require('child_process');
const path = require('path');

const scriptPath = path.join(__dirname, 'enable-auto-merge-error-handler.sh');

const run = (input) =>
  spawnSync('bash', [scriptPath], { input, encoding: 'utf8' });

describe('enable-auto-merge-error-handler.sh', () => {
  it('exits 0 and confirms success when the response has no errors key', () => {
    const result = run(
      JSON.stringify({
        data: { enablePullRequestAutoMerge: { clientMutationId: null } },
      }),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Auto merge enabled successfully');
  });

  it('exits 0 and warns when the error type is RATE_LIMIT', () => {
    const result = run(
      JSON.stringify({
        errors: [{ type: 'RATE_LIMIT', message: 'API rate limit exceeded' }],
      }),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Warning: could not enable auto merge');
  });

  it('exits 0 and warns when the error message contains "unstable"', () => {
    const result = run(
      JSON.stringify({
        errors: [{ type: 'UNPROCESSABLE', message: 'This PR is unstable' }],
      }),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Warning: could not enable auto merge');
  });

  it('exits 0 and warns when the error message matches "already.*auto.merge"', () => {
    const result = run(
      JSON.stringify({
        errors: [
          { type: 'UNPROCESSABLE', message: 'already has auto merge enabled' },
        ],
      }),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Warning: could not enable auto merge');
  });

  it('exits 0 and warns when the error message contains "rate.limit"', () => {
    const result = run(
      JSON.stringify({
        errors: [{ type: 'UNPROCESSABLE', message: 'rate.limit exceeded' }],
      }),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Warning: could not enable auto merge');
  });

  it('exits 0 and warns when the error message contains "rate_limit"', () => {
    const result = run(
      JSON.stringify({
        errors: [{ type: 'UNPROCESSABLE', message: 'rate_limit exceeded' }],
      }),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Warning: could not enable auto merge');
  });

  it('exits 1 and reports failure for an unrecognized error type and message', () => {
    const result = run(
      JSON.stringify({
        errors: [{ type: 'FORBIDDEN', message: 'Insufficient permissions' }],
      }),
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      'Failed to enable auto merge: Insufficient permissions',
    );
  });
});
