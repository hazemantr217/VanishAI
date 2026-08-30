import assert from 'node:assert/strict';
import test from 'node:test';
import { isGoogleAIStudioPreviewOrigin } from './security';

test('accepts Google AI Studio and Cloud Run preview origins', () => {
  assert.equal(
    isGoogleAIStudioPreviewOrigin('https://session-id.scf.usercontent.goog'),
    true,
  );
  assert.equal(
    isGoogleAIStudioPreviewOrigin('https://nested.session-id.scf.usercontent.goog'),
    true,
  );
  assert.equal(
    isGoogleAIStudioPreviewOrigin('https://ais-dev-eve4jfbsmnjwvhnnyfudxb-20643648940.europe-west2.run.app'),
    true,
  );
  assert.equal(
    isGoogleAIStudioPreviewOrigin('https://aistudio.google.com'),
    true,
  );
  assert.equal(
    isGoogleAIStudioPreviewOrigin('https://ai.studio'),
    true,
  );
  assert.equal(isGoogleAIStudioPreviewOrigin('http://localhost:3000'), true);
  assert.equal(isGoogleAIStudioPreviewOrigin(undefined), true);
  assert.equal(isGoogleAIStudioPreviewOrigin('https://scf.usercontent.goog.attacker.example'), false);
  assert.equal(isGoogleAIStudioPreviewOrigin('https://attacker.example'), false);
});
