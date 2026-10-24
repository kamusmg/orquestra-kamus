import { describe, expect, it } from 'vitest';
import {
  buildCorvoOrquestraSkill,
  buildOrquestraStreamdeckButtons,
  checkCyberdeckOnline,
  DEFAULT_CYBERDECK_CONFIG,
} from '../src/cyberdeck.js';

describe('Cyberdeck Module', () => {
  it('provides correct default config', () => {
    expect(DEFAULT_CYBERDECK_CONFIG.tailscaleIp).toBe('100.109.72.118');
    expect(DEFAULT_CYBERDECK_CONFIG.sshPort).toBe(8022);
    expect(DEFAULT_CYBERDECK_CONFIG.deviceModel).toContain('Redmi Note 7');
  });

  it('generates streamdeck button definitions', () => {
    const buttons = buildOrquestraStreamdeckButtons();
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    const ids = buttons.map((b) => b.id);
    expect(ids).toContain('orq_status');
    expect(ids).toContain('orq_approve');
    expect(ids).toContain('orq_floor_new');
    expect(ids).toContain('orq_pause');
  });

  it('generates Corvo Hermes skill definition with valid frontmatter', () => {
    const skill = buildCorvoOrquestraSkill();
    expect(skill).toContain('name: orquestra');
    expect(skill).toContain('description:');
    expect(skill).toContain('ssh pc "orq status"');
    expect(skill).toContain('orq floor list');
  });

  it('handles offline port gracefully with timeout', async () => {
    // Port 59999 is typically unused and closed locally
    const isOnline = await checkCyberdeckOnline('127.0.0.1', 59999, 100);
    expect(isOnline).toBe(false);
  });
});
