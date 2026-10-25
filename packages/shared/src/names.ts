import { z } from 'zod';

/** Nome usado no orq (orq prompt <nome>): sem espaço, para não exigir aspas no terminal. */
export const terminalNameSchema = z
  .string()
  .min(1, 'o nome não pode ficar vazio')
  .max(40, 'use no máximo 40 caracteres')
  .regex(/^[\p{L}\p{N}_.-]+$/u, 'use só letras, números, "_", "." ou "-", sem espaço');

/** Nome de nota no canvas: permite espaços, letras com acento, números, ponto, hífen e sublinhado. */
export const noteNameSchema = z
  .string()
  .min(1, 'o nome não pode ficar vazio')
  .max(80, 'use no máximo 80 caracteres')
  .regex(/^[\p{L}\p{N}_.\-\s]+$/u, 'use só letras, números, "_", ".", "-" ou espaços');
