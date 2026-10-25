import { loadHostEnv } from './env-loader.js';

// Inicializa variáveis no startup do Host
loadHostEnv();

export { loadHostEnv } from './env-loader.js';
export * from './bridge.js';
export * from './control-pipe.js';
export * from './workspace-manager.js';
export * from './run.js';
export * from './instructions.js';
