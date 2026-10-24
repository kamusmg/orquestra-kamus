import { execFile } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { OrqError } from '@orquestra/shared';

export type AndroidDevice = {
  serial: string;
  state: 'device' | 'offline' | 'unauthorized';
  model?: string;
  product?: string;
};

export type AccessibilityElement = {
  ref: string;
  text: string;
  contentDesc: string;
  className: string;
  resourceId: string;
  bounds: [number, number, number, number]; // [left, top, right, bottom]
  center: [number, number]; // [x, y]
};

export type AndroidSnapshot = {
  serial: string;
  elements: AccessibilityElement[];
};

export function resolveAdb(): string {
  if (process.env.ADB_PATH && existsSync(process.env.ADB_PATH)) {
    return process.env.ADB_PATH;
  }
  const candidates = [
    join('D:', 'projetos D', 'cyberdeck', 'ferramentas', 'scrcpy-win64-v5.0.1', 'adb.exe'),
    join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
    join(process.env.ProgramFiles ?? 'C:/Program Files', 'Android', 'platform-tools', 'adb.exe'),
    'C:/Program Files/Nox/bin/nox_adb.exe',
    'C:/Program Files/BlueStacks_nxt/HD-Adb.exe',
  ];
  for (const cand of candidates) {
    if (existsSync(cand)) return cand;
  }
  return 'adb';
}

export function runAdb(args: string[], serial?: string): Promise<string> {
  const adb = resolveAdb();
  const finalArgs = serial ? ['-s', serial, ...args] : args;
  return new Promise((resolveResult, reject) => {
    execFile(
      adb,
      finalArgs,
      { encoding: 'utf8', windowsHide: true, timeout: 20000 },
      (error, stdout, stderr) => {
        if (error) {
          const msg = stderr.trim() || stdout.trim() || error.message;
          reject(new OrqError('USAGE', `ADB: ${msg}`));
        } else {
          resolveResult(stdout);
        }
      },
    );
  });
}

export async function listAndroidDevices(): Promise<AndroidDevice[]> {
  try {
    const raw = await runAdb(['devices', '-l']);
    const lines = raw.split(/\r?\n/).slice(1);
    const devices: AndroidDevice[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(/\s+/);
      const serial = parts[0]!;
      const state = (parts[1] ?? 'offline') as AndroidDevice['state'];
      let model: string | undefined;
      let product: string | undefined;
      for (const part of parts.slice(2)) {
        if (part.startsWith('model:')) model = part.replace('model:', '');
        if (part.startsWith('product:')) product = part.replace('product:', '');
      }
      devices.push({ serial, state, model, product });
    }
    return devices;
  } catch (error) {
    if (error instanceof Error && error.message.includes('spawn adb ENOENT')) {
      return [];
    }
    throw error;
  }
}

export function parseBounds(boundsStr: string): [number, number, number, number] {
  const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) return [0, 0, 0, 0];
  const left = parseInt(match[1]!, 10);
  const top = parseInt(match[2]!, 10);
  const right = parseInt(match[3]!, 10);
  const bottom = parseInt(match[4]!, 10);
  return [left, top, right, bottom];
}

export function parseUiDump(xml: string): AccessibilityElement[] {
  const elements: AccessibilityElement[] = [];
  const regex = /<node\s+([^>]+)\/?>/g;
  let match: RegExpExecArray | null;
  let count = 1;

  while ((match = regex.exec(xml)) !== null) {
    const attrs = match[1]!;
    const getAttr = (name: string) => {
      const m = new RegExp(`${name}="([^"]*)"`).exec(attrs);
      return m ? m[1]! : '';
    };

    const text = getAttr('text');
    const contentDesc = getAttr('content-desc');
    const resourceId = getAttr('resource-id');
    const className = getAttr('class');
    const boundsStr = getAttr('bounds');
    const bounds = parseBounds(boundsStr);

    if (text || contentDesc || resourceId) {
      const center: [number, number] = [
        Math.round((bounds[0] + bounds[2]) / 2),
        Math.round((bounds[1] + bounds[3]) / 2),
      ];
      elements.push({
        ref: `@e${count++}`,
        text,
        contentDesc,
        className,
        resourceId,
        bounds,
        center,
      });
    }
  }

  return elements;
}

export async function snapshotAndroid(serial?: string): Promise<AndroidSnapshot> {
  const dumpPath = '/sdcard/window_dump.xml';
  await runAdb(['shell', 'uiautomator', 'dump', dumpPath], serial);
  const xml = await runAdb(['exec-out', 'cat', dumpPath], serial);
  const elements = parseUiDump(xml);
  return { serial: serial ?? 'default', elements };
}

export async function tapAndroid(x: number, y: number, serial?: string): Promise<void> {
  await runAdb(['shell', 'input', 'tap', String(x), String(y)], serial);
}

export async function typeAndroid(text: string, serial?: string): Promise<void> {
  // O input text do ADB precisa de escape de espaços e aspas
  const safe = text.replaceAll(' ', '%s').replaceAll('"', '\\"');
  await runAdb(['shell', 'input', 'text', safe], serial);
}

const KEYCODES: Record<string, number> = {
  home: 3,
  back: 4,
  enter: 66,
  tab: 61,
  escape: 111,
  power: 26,
  menu: 82,
  volumeup: 24,
  volumedown: 25,
};

export async function keyAndroid(key: string, serial?: string): Promise<void> {
  const lower = key.toLowerCase();
  const code = KEYCODES[lower] ?? parseInt(key, 10);
  if (isNaN(code)) throw new OrqError('USAGE', `Tecla Android desconhecida: ${key}. Suportadas: home, back, enter, tab, escape, power, menu, volumeup, volumedown.`);
  await runAdb(['shell', 'input', 'keyevent', String(code)], serial);
}

export async function screenshotAndroid(serial?: string): Promise<string> {
  const target = join(tmpdir(), `android-shot-${Date.now()}.png`);
  const adb = resolveAdb();
  const args = serial ? ['-s', serial, 'exec-out', 'screencap', '-p'] : ['exec-out', 'screencap', '-p'];
  return new Promise((resolveResult, reject) => {
    execFile(adb, args, { encoding: 'buffer', windowsHide: true, timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new OrqError('USAGE', `ADB screencap: ${stderr.toString() || error.message}`));
      } else {
        writeFileSync(target, stdout);
        resolveResult(target);
      }
    });
  });
}
