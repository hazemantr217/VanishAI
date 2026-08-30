import assert from 'node:assert/strict';
import test from 'node:test';
import { isGoogleAIStudioPreviewOrigin } from './security';

test('accepts only HTTPS Google AI Studio preview origins', () => {
  assert.equal(
    isGoogleAIStudioPreviewOrigin('https://session-id.scf.usercontent.goog'),
    true,
  );
  assert.equal(
    isGoogleAIStudioPreviewOrigin('https://nested.session-id.scf.usercontent.goog'),
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
  assert.equal(isGoogleAIStudioPreviewOrigin('http://session-id.scf.usercontent.goog'), false);
  assert.equal(isGoogleAIStudioPreviewOrigin('https://scf.usercontent.goog'), false);
  assert.equal(isGoogleAIStudioPreviewOrigin('https://session-id.scf.usercontent.goog:444'), false);
  assert.equal(isGoogleAIStudioPreviewOrigin('https://preview.run.app'), false);
  assert.equal(isGoogleAIStudioPreviewOrigin(undefined), false);
  assert.equal(isGoogleAIStudioPreviewOrigin('https://scf.usercontent.goog.attacker.example'), false);
  assert.equal(isGoogleAIStudioPreviewOrigin('https://attacker.example'), false);
});
