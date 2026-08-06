const fs = require('fs');
const path = require('path');

const workflowsDirectory = path.join(__dirname, '..', '.github', 'workflows');

const workflowText = (name) =>
  fs.readFileSync(path.join(workflowsDirectory, name), 'utf8');

const everyWorkflowText = fs
  .readdirSync(workflowsDirectory)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .map((name) => workflowText(name))
  .join('\n');

describe('notify-deployment-project workflow', () => {
  it('keeps every client credential, client script id, and client key list out of this public repository', () => {
    expect(everyWorkflowText).not.toContain('CLIENT_AUTH');
    expect(everyWorkflowText).not.toContain('SCRIPT_ID');
    expect(everyWorkflowText).not.toContain('CLIENT_KEYS');
    expect(everyWorkflowText).not.toContain('SETUP_HUB_CALENDAR_ID');
  });

  it('asks the deployment project to distribute whenever main changes', () => {
    const workflow = workflowText('notify-deployment-project.yml');
    expect(workflow).toContain('branches:\n      - main');
    expect(workflow).toContain('/dispatches');
    expect(workflow).toContain('event_type=source-updated');
  });

  it('names the deployment project in full so the dependency is readable in the source', () => {
    const workflow = workflowText('notify-deployment-project.yml');
    expect(workflow).toContain(
      'repos/HiromiShikata/gaccount-control-gas-client-project-deployment/dispatches',
    );
  });
});
