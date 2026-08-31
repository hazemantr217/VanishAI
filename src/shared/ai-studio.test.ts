import assert from 'node:assert/strict';
import test from 'node:test';
import { isGoogleAIStudioHostname, isGoogleAIStudioUrl } from './ai-studio';

test('recognizes Google AI Studio preview and Cloud Run hosts', () => {
  assert.equal(isGoogleAIStudioHostname('preview-123.scf.usercontent.goog'), true);
  assert.equal(
    isGoogleAIStudioHostname('ais-dev-eve4jfbsmnjwvhnnyfudxb-20643648940.europe-west2.run.app'),
    true,
  );
  assert.equal(
    isGoogleAIStudioHostname('ais-pre-qcdoh36buzuzq3gxbgta5j-150397808623.us-east5.run.app'),
    true,
  );
  assert.equal(isGoogleAIStudioHostname('aistudio.google.com'), true);
});

test('does not accept lookalike or insecure AI Studio URLs', () => {
  assert.equal(isGoogleAIStudioUrl('http://aistudio.google.com'), false);
  assert.equal(isGoogleAIStudioUrl('https://aistudio.google.com.attacker.example'), false);
  assert.equal(isGoogleAIStudioUrl('https://ais-dev-preview.europe-west2.run.app'), false);
  assert.equal(isGoogleAIStudioUrl('https://preview-123.scf.usercontent.goog:444'), false);
});
