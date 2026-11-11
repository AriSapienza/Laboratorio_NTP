import { SimEvent } from '../types/lab';

export interface SyncParams {
  delayIdaMs: number;
  delayVueltaMs: number;
  serverProcMs: number;
  clientInitialOffsetMs: number; // Diferencia del reloj cliente respecto al servidor: T_client = T_real - offset
}

export interface SyncMetrics {
  t1Ms: number;
  t2Ms: number;
  t3Ms: number;
  t4Ms: number;
  thetaMs: number; // Desfase calculado por RFC 5905
  deltaMs: number; // Round-trip delay calculado por RFC 5905
  residualErrorMs: number; // (ida - vuelta) / 2
  residualMagnitudeMs: number; // |ida - vuelta| / 2
}

export type SyncPresetKey = 'symmetric' | 'asymmetric' | 'trama107';

export const SYNC_PRESETS: Record<SyncPresetKey, { label: string; params: SyncParams }> = {
  symmetric: {
    label: 'Enlace simétrico',
    params: {
      delayIdaMs: 25,
      delayVueltaMs: 25,
      serverProcMs: 5,
      clientInitialOffsetMs: 120,
    },
  },
  asymmetric: {
    label: 'Enlace asimétrico',
    params: {
      delayIdaMs: 40,
      delayVueltaMs: 200,
      serverProcMs: 5,
      clientInitialOffsetMs: 120,
    },
  },
  trama107: {
    label: 'Trama 107',
    params: {
      delayIdaMs: 21.544,
      delayVueltaMs: 21.544,
      serverProcMs: 0.05,
      clientInitialOffsetMs: 0,
    },
  },
};

/**
 * Calcula T1..T4, θ (offset), δ (delay) y el error residual según RFC 5905.
 * Si el reloj del servidor es la referencia T_srv = T_real y el reloj del cliente tiene un desfase real θ_real
 * (tal que T1 = T_envio - θ_real), entonces:
 * T2 = T1 + θ_real + delayIda
 * T3 = T2 + serverProc
 * T4 = T3 - θ_real + delayVuelta
 */
export function calculateNtpSync(params: SyncParams): SyncMetrics {
  const baseSendMs = 1000;
  const t1Ms = baseSendMs - params.clientInitialOffsetMs;
  const t2Ms = baseSendMs + params.delayIdaMs;
  const t3Ms = t2Ms + params.serverProcMs;
  const t4Ms = t3Ms + params.delayVueltaMs - params.clientInitialOffsetMs;
  const thetaMs = ((t2Ms - t1Ms) + (t3Ms - t4Ms)) / 2;
  const deltaMs = (t4Ms - t1Ms) - (t3Ms - t2Ms);
  const residualErrorMs = (params.delayIdaMs - params.delayVueltaMs) / 2;
  return {
    t1Ms: Number(t1Ms.toFixed(3)),
    t2Ms: Number(t2Ms.toFixed(3)),
    t3Ms: Number(t3Ms.toFixed(3)),
    t4Ms: Number(t4Ms.toFixed(3)),
    thetaMs: Number(thetaMs.toFixed(3)),
    deltaMs: Number(deltaMs.toFixed(3)),
    residualErrorMs: Number(residualErrorMs.toFixed(3)),
    residualMagnitudeMs: Number(Math.abs(residualErrorMs).toFixed(3)),
  };
}

export function buildSyncEvents(params: SyncParams): SimEvent[] {
  const isAsym = Math.abs(params.delayIdaMs - params.delayVueltaMs) > 0.01;
  const residual = Math.abs((params.delayIdaMs - params.delayVueltaMs) / 2);
  return [
    {
      id: 't1-send',
      at: 0.2,
      label: 'T1 · Cliente envía solicitud UDP 123',
      narration: 'El cliente estampa T1 y envía la solicitud NTP.',
      packetId: 'trama-107',
    },
    {
      id: 't2-recv',
      at: 1.0,
      label: 'T2 · Servidor Estrato 1 recibe petición',
      narration: 'El servidor registra T2 al recibir el paquete UDP.',
      packetId: 'trama-107',
    },
    {
      id: 't3-send',
      at: 1.3,
      label: 'T3 · Servidor transmite respuesta con T1..T3',
      narration: 'El servidor agrega T3 y despacha la respuesta.',
      packetId: 'trama-108',
    },
    {
      id: 't4-recv',
      at: 2.1,
      label: 'T4 · Cliente recibe respuesta y calcula θ y δ',
      narration: 'Con T4 el cliente calcula el desfase y demora.',
      packetId: 'trama-108',
    },
    {
      id: 'clock-adjust',
      at: 2.5,
      label: isAsym ? `Reloj corregido (Error residual: ${residual} ms)` : 'Reloj sincronizado (Error: 0 ms)',
      narration: isAsym
        ? `La asimetría deja un error irreducible de ${residual} ms.`
        : 'Enlace simétrico: el error final del reloj es cero.',
    },
  ];
}

