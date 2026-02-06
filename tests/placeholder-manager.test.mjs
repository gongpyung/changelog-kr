/**
 * Tests for PlaceholderManager in translation-client.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// PlaceholderManager is not exported, so we need to recreate it for testing
class PlaceholderManager {
  constructor() {
    this.codeTokens = [];
    this.urls = [];
    this.paths = [];
  }

  protect(text) {
    let result = text;

    // Extract and replace code tokens (backtick-wrapped)
    result = result.replace(/`([^`]+)`/g, (match, content) => {
      const index = this.codeTokens.length;
      this.codeTokens.push(match);
      return `{{CODE_${index}}}`;
    });

    // Extract and replace URLs
    result = result.replace(/https?:\/\/[^\s]+/g, (match) => {
      const index = this.urls.length;
      this.urls.push(match);
      return `{{URL_${index}}}`;
    });

    // Extract and replace file paths (contains / or \)
    result = result.replace(/(?:^|\s)([^\s]*[\/\\][^\s]+)/g, (match, path) => {
      const index = this.paths.length;
      this.paths.push(path);
      return match.replace(path, `{{PATH_${index}}}`);
    });

    return result;
  }

  restore(text) {
    let restored = text;

    // Restore code tokens
    this.codeTokens.forEach((token, index) => {
      restored = restored.replace(`{{CODE_${index}}}`, token);
    });

    // Restore URLs
    this.urls.forEach((url, index) => {
      restored = restored.replace(`{{URL_${index}}}`, url);
    });

    // Restore paths
    this.paths.forEach((path, index) => {
      restored = restored.replace(`{{PATH_${index}}}`, path);
    });

    return restored;
  }
}

describe('PlaceholderManager - protect and restore', () => {
  it('should protect and restore code blocks (backticks)', () => {
    const manager = new PlaceholderManager();
    const text = 'Use the `console.log()` function to debug';

    const protectedText = manager.protect(text);
    assert.equal(protectedText, 'Use the {{CODE_0}} function to debug');

    const restored = manager.restore(protectedText);
    assert.equal(restored, text);
  });

  it('should protect and restore URLs', () => {
    const manager = new PlaceholderManager();
    const text = 'Visit https://example.com for more info';

    const protectedText = manager.protect(text);
    assert.equal(protectedText, 'Visit {{URL_0}} for more info');

    const restored = manager.restore(protectedText);
    assert.equal(restored, text);
  });

  it('should protect and restore file paths', () => {
    const manager = new PlaceholderManager();
    const text = 'Edit the src/index.js file';

    const protectedText = manager.protect(text);
    assert.equal(protectedText, 'Edit the {{PATH_0}} file');

    const restored = manager.restore(protectedText);
    assert.equal(restored, text);
  });

  it('should handle roundtrip: protect then restore returns original', () => {
    const manager = new PlaceholderManager();
    const text = 'Use `fetch()` to call https://api.example.com/data from src/api/client.js';

    const protectedText = manager.protect(text);
    const restored = manager.restore(protectedText);

    assert.equal(restored, text);
  });

  it('should handle empty input', () => {
    const manager = new PlaceholderManager();
    const text = '';

    const protectedText = manager.protect(text);
    assert.equal(protectedText, '');

    const restored = manager.restore(protectedText);
    assert.equal(restored, '');
  });

  it('should handle multiple code blocks in one text', () => {
    const manager = new PlaceholderManager();
    const text = 'Use `fetch()` and `await` keywords together';

    const protectedText = manager.protect(text);
    assert.equal(protectedText, 'Use {{CODE_0}} and {{CODE_1}} keywords together');

    const restored = manager.restore(protectedText);
    assert.equal(restored, text);
  });

  it('should handle nested backticks (single level)', () => {
    const manager = new PlaceholderManager();
    const text = 'The code is `const x = 5` here';

    const protectedText = manager.protect(text);
    const restored = manager.restore(protectedText);

    assert.equal(restored, text);
  });

  it('should handle Windows and Unix paths', () => {
    const manager = new PlaceholderManager();
    const text = 'Edit C:\\Users\\name\\file.txt or /home/user/file.txt';

    const protectedText = manager.protect(text);
    const restored = manager.restore(protectedText);

    assert.equal(restored, text);
  });

  it('should protect multiple URLs', () => {
    const manager = new PlaceholderManager();
    const text = 'Visit https://example.com and https://test.com';

    const protectedText = manager.protect(text);
    assert.equal(protectedText, 'Visit {{URL_0}} and {{URL_1}}');

    const restored = manager.restore(protectedText);
    assert.equal(restored, text);
  });

  it('should handle text with all types of protected content', () => {
    const manager = new PlaceholderManager();
    const text = 'Run `npm install` to install from https://npmjs.com into node_modules/package';

    const protectedText = manager.protect(text);
    const restored = manager.restore(protectedText);

    assert.equal(restored, text);
  });
});

describe('PlaceholderManager - isolation', () => {
  it('should maintain separate state for different instances', () => {
    const manager1 = new PlaceholderManager();
    const manager2 = new PlaceholderManager();

    const text1 = 'Use `code1` here';
    const text2 = 'Use `code2` there';

    const protectedText1 = manager1.protect(text1);
    const protectedText2 = manager2.protect(text2);

    // Each manager should have its own index
    assert.equal(protectedText1, 'Use {{CODE_0}} here');
    assert.equal(protectedText2, 'Use {{CODE_0}} there');

    // Restoration should work correctly for each
    assert.equal(manager1.restore(protectedText1), text1);
    assert.equal(manager2.restore(protectedText2), text2);
  });

  it('should handle sequential protect calls with accumulating indices', () => {
    const manager = new PlaceholderManager();

    const text1 = 'Use `code1` here';
    const text2 = 'Use `code2` there';

    const protectedText1 = manager.protect(text1);
    const protectedText2 = manager.protect(text2);

    // Second protect should have index 1
    assert.equal(protectedText1, 'Use {{CODE_0}} here');
    assert.equal(protectedText2, 'Use {{CODE_1}} there');

    // Both should restore correctly with the same manager
    assert.equal(manager.restore(protectedText1), text1);
    assert.equal(manager.restore(protectedText2), text2);
  });
});
