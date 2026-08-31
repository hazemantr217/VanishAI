import assert from 'node:assert/strict';
import test from 'node:test';
import { isGoogleAIStudioPreviewOrigin, isGoogleAIStudioRequest } from './security';

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
    isGoogleAIStudioPreviewOrigin('https://ais-dev-eve4jfbsmnjwvhnnyfudxb-20643648940.europe-west2.run.app'),
    true,
  );
  assert.equal(
    isGoogleAIStudioPreviewOrigin('https://ais-pre-qcdoh36buzuzq3gxbgta5j-150397808623.us-east5.run.app'),
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
  assert.equal(isGoogleAIStudioPreviewOrigin('https://ais-dev-preview.europe-west2.run.app'), false);
  assert.equal(isGoogleAIStudioPreviewOrigin('https://ais-dev-preview-123.europe-west2.run.app.attacker.example'), false);
  assert.equal(isGoogleAIStudioPreviewOrigin(undefined), false);
  assert.equal(isGoogleAIStudioPreviewOrigin('https://scf.usercontent.goog.attacker.example'), false);
  assert.equal(isGoogleAIStudioPreviewOrigin('https://attacker.example'), false);
});

test('detects AI Studio from the forwarded application host', () => {
  const request = {
    header(name: string) {
      if (name === 'x-forwarded-host') {
        return 'ais-pre-qcdoh36buzuzq3gxbgta5j-150397808623.us-east5.run.app';
      }
      return undefined;
    },
  } as unknown as import('express').Request;
  assert.equal(isGoogleAIStudioRequest(request), true);
});
