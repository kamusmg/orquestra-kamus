import { describe, expect, it } from 'vitest';
import { parseBounds, parseUiDump } from '../src/android.js';

describe('Android Automation Tools', () => {
  it('parseBounds extrai coordenadas corretas', () => {
    expect(parseBounds('[100,200][500,800]')).toEqual([100, 200, 500, 800]);
    expect(parseBounds('invalido')).toEqual([0, 0, 0, 0]);
  });

  it('parseUiDump converte XML em elementos com refs e pontos centrais', () => {
    const xml = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.android.launcher3" bounds="[0,0][1080,2400]">
    <node index="0" text="Configurações" resource-id="com.android.launcher3:id/icon" class="android.widget.TextView" bounds="[100,200][300,400]" content-desc="Abrir Configurações" />
    <node index="1" text="Pesquisar" resource-id="com.google.android.apps.nexuslauncher:id/search_box" class="android.widget.EditText" bounds="[50,500][1030,620]" />
  </node>
</hierarchy>`;

    const elements = parseUiDump(xml);
    expect(elements).toHaveLength(2);

    expect(elements[0]!.ref).toBe('@e1');
    expect(elements[0]!.text).toBe('Configurações');
    expect(elements[0]!.contentDesc).toBe('Abrir Configurações');
    expect(elements[0]!.center).toEqual([200, 300]);

    expect(elements[1]!.ref).toBe('@e2');
    expect(elements[1]!.text).toBe('Pesquisar');
    expect(elements[1]!.center).toEqual([540, 560]);
  });
});
