import { describe, expect, it } from 'vitest';
import {
  buildCorvoOrquestraSkill,
  buildOrquestraStreamdeckButtons,
  checkCyberdeckOnline,
  DEFAULT_CYBERDECK_CONFIG,
  resolveUserName,
} from '../src/cyberdeck.js';

describe('Cyberdeck Module', () => {
  it('provides correct default config', () => {
    expect(DEFAULT_CYBERDECK_CONFIG.tailscaleIp).toBe('100.109.72.118');
    expect(DEFAULT_CYBERDECK_CONFIG.sshPort).toBe(8022);
    expect(DEFAULT_CYBERDECK_CONFIG.deviceModel).toContain('Redmi Note 7');
    expect(DEFAULT_CYBERDECK_CONFIG.userName).toBeTruthy();
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

  it('configures user name and edition name via environment variables', () => {
    const prevUser = process.env.ORQ_USER_NAME;
    const prevEdition = process.env.ORQ_EDITION_NAME;
    try {
      process.env.ORQ_USER_NAME = 'alice';
      process.env.ORQ_EDITION_NAME = 'Custom Edition';

      expect(resolveUserName()).toBe('alice');
      const skillWithEdition = buildCorvoOrquestraSkill();
      expect(skillWithEdition).toContain('description: "Controlar e monitorar agentes do Orquestra Custom Edition no PC');
      expect(skillWithEdition).toContain('# Orquestra Custom Edition — Integração Corvo');
      expect(skillWithEdition).toContain('Sempre reporte para o alice no Telegram');

      // Sem edição definida: omitir trecho
      delete process.env.ORQ_EDITION_NAME;
      const skillWithoutEdition = buildCorvoOrquestraSkill();
      expect(skillWithoutEdition).toContain('description: "Controlar e monitorar agentes do Orquestra no PC');
      expect(skillWithoutEdition).toContain('# Orquestra — Integração Corvo');
    } finally {
      if (prevUser !== undefined) process.env.ORQ_USER_NAME = prevUser;
      else delete process.env.ORQ_USER_NAME;
      if (prevEdition !== undefined) process.env.ORQ_EDITION_NAME = prevEdition;
      else delete process.env.ORQ_EDITION_NAME;
    }
  });
});
