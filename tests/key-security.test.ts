import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiDecayService, DEFAULT_MODEL_ID } from '../services/geminiService';
import { redactApiError } from '../utils/keyUtils';

const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  };
};
const fakeKey = 'test-only-not-a-real-credential';
let replacedUrl: string;
beforeEach(() => {
  replacedUrl = '';
  Object.assign(globalThis, {
    sessionStorage: storage(), localStorage: storage(), document: { title: 'Test' },
    window: {
      location: { search: '', pathname: '/digital-decay/', hash: '#example', hostname: 'example.github.io', protocol: 'https:' },
      history: { replaceState: (_state: unknown, _title: string, url: string) => { replacedUrl = url; } }
    }
  });
});

test('legacy URL key is removed but never accepted or stored', () => {
  window.location.search = `?gemini_api_key=${fakeKey}&view=compare`;
  const service = new GeminiDecayService();
  assert.equal(service.getVisitorApiKey(), null);
  assert.equal(localStorage.getItem('decay_visitor_key'), null);
  assert.equal(sessionStorage.getItem('decay_visitor_key'), null);
  assert.equal(replacedUrl, '/digital-decay/?view=compare#example');
});

test('default is session only; remembering is opt-in; disconnect clears both', () => {
  const service = new GeminiDecayService();
  service.setVisitorApiKey(fakeKey);
  assert.equal(sessionStorage.getItem('decay_visitor_key'), fakeKey);
  assert.equal(localStorage.getItem('decay_visitor_key'), null);
  service.setVisitorApiKey(fakeKey, true);
  assert.equal(localStorage.getItem('decay_visitor_key'), fakeKey);
  service.setVisitorApiKey(fakeKey, false);
  assert.equal(localStorage.getItem('decay_visitor_key'), null);
  service.setVisitorApiKey(fakeKey, true);
  service.setVisitorApiKey(null);
  assert.equal(service.getVisitorApiKey(), null);
  assert.equal(localStorage.getItem('decay_visitor_key'), null);
  assert.equal(sessionStorage.getItem('decay_visitor_key'), null);
});

test('legacy saved model migrates to the current default', () => {
  localStorage.setItem('decay_selected_model', 'gemini-2.5-flash-image');
  assert.equal(new GeminiDecayService().getSelectedModel().id, DEFAULT_MODEL_ID);
});

test('error redaction removes raw, URL-encoded and Google-shaped keys', () => {
  const key = 'test-only/+credential';
  const googleShape = 'AIza' + 'x'.repeat(35);
  const safe = redactApiError(`Failed ${key} ${encodeURIComponent(key)} ${googleShape}`, key);
  assert.equal(safe, 'Failed [REDACTED] [REDACTED] [REDACTED]');
});

test('static generation without a visitor key stops before network access', async () => {
  const service = new GeminiDecayService();
  await assert.rejects(service.processFrame('data:image/png;base64,AA==', false, {
    injections: [], decayRate: 1
  }), /AUTH_REQUIRED/);
});

test('proxy errors cannot return the visitor key to the UI', async () => {
  window.location.hostname = 'localhost';
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: `Failure for ${fakeKey}` }), { status: 500 });
  try {
    const service = new GeminiDecayService();
    service.setVisitorApiKey(fakeKey);
    await assert.rejects(service.processFrame('data:image/png;base64,AA==', false, {
      injections: [], decayRate: 1
    }), { message: 'Failure for [REDACTED]' });
  } finally { globalThis.fetch = previousFetch; }
});
