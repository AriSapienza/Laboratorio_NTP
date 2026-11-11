export type ForensicDeviceId = 'camera' | 'door' | 'tv' | 'router';

export interface ForensicEventItem {
  id: ForensicDeviceId;
  realOrder: number;
  device: string;
  location: string;
  description: string;
  realSecondsFrom22h: number; // Segundos desde las 22:00:00.000 UTC
  realTimestampStr: string;
}

export interface SiemLogEntry extends ForensicEventItem {
  driftSeconds: number;
  reportedSecondsFrom22h: number;
  reportedTimestampStr: string;
  siemOrder: number;
  realGapFromPrevSec: number | null;
  reportedGapFromPrevSec: number | null;
}

export type ForensicVerdictType = 'coherent' | 'coherent-unreliable' | 'inverted';

export interface ForensicEvaluation {
  entries: SiemLogEntry[];
  verdictType: ForensicVerdictType;
  verdictTitle: string;
  verdictNarration: string; // <= 12 palabras
}

export const FORENSIC_BASE_EVENTS: ForensicEventItem[] = [
  {
    id: 'camera',
    realOrder: 1,
    device: 'Cámara IP',
    location: 'Hall de entrada',
    description: 'Fotograma del sospechoso ingresando al hall',
    realSecondsFrom22h: 14 * 60 + 2.105, // 22:14:02.105
    realTimestampStr: '22:14:02.105 UTC',
  },
  {
    id: 'door',
    realOrder: 2,
    device: 'Control de Acceso',
    location: 'Puerta principal',
    description: 'Apertura forzada de la puerta principal',
    realSecondsFrom22h: 14 * 60 + 45.33, // 22:14:45.330
    realTimestampStr: '22:14:45.330 UTC',
  },
  {
    id: 'tv',
    realOrder: 3,
    device: 'Smart TV',
    location: 'Sala principal',
    description: 'Inicio de sesión en aplicación de streaming',
    realSecondsFrom22h: 15 * 60 + 20.5, // 22:15:20.500
    realTimestampStr: '22:15:20.500 UTC',
  },
  {
    id: 'router',
    realOrder: 4,
    device: 'Router Wi-Fi',
    location: 'Escritorio',
    description: 'Desconexión del teléfono móvil de la víctima',
    realSecondsFrom22h: 16 * 60 + 10.012, // 22:16:10.012
    realTimestampStr: '22:16:10.012 UTC',
  },
];

export type ForensicPresetKey = 'caso2215' | 'ordenInvertido' | 'sincronizado';

export const FORENSIC_PRESETS: Record<ForensicPresetKey, { label: string; drifts: Record<ForensicDeviceId, number> }> = {
  caso2215: {
    label: 'Caso 22:15',
    // Reproduce las horas de la sección 10.3 (22:14, 22:18, 22:20, 22:22) conservando el orden
    drifts: {
      camera: 0,
      door: 195,
      tv: 280,
      router: 350,
    },
  },
  ordenInvertido: {
    label: 'Orden invertido',
    // Reproduce la sección 10.4: Cámara atrasa 8m (-480s -> 22:06) y Puerta adelanta 3m (+180s -> 22:17:45, al final)
    drifts: {
      camera: -480,
      door: 180,
      tv: 0,
      router: 0,
    },
  },
  sincronizado: {
    label: 'Sincronizado con NTP',
    drifts: {
      camera: 0,
      door: 0,
      tv: 0,
      router: 0,
    },
  },
};

export function formatUtcFrom22h(secondsFrom22h: number): string {
  const dayMs = 24 * 3600 * 1000;
  const rawMs = Math.round((22 * 3600 + secondsFrom22h) * 1000);
  const totalMs = ((rawMs % dayMs) + dayMs) % dayMs;
  const hh = Math.floor(totalMs / 3600000);
  const mm = Math.floor((totalMs % 3600000) / 60000);
  const ss = Math.floor((totalMs % 60000) / 1000);
  const msInt = totalMs % 1000;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(msInt).padStart(3, '0')} UTC`;
}

export function evaluateForensicTimeline(drifts: Record<ForensicDeviceId, number>): ForensicEvaluation {
  const raw = FORENSIC_BASE_EVENTS.map((ev, idx) => {
    const drift = drifts[ev.id] ?? 0;
    const reportedSec = ev.realSecondsFrom22h + drift;
    const prevReal = idx > 0 ? FORENSIC_BASE_EVENTS[idx - 1].realSecondsFrom22h : null;
    return {
      ...ev,
      driftSeconds: drift,
      reportedSecondsFrom22h: reportedSec,
      reportedTimestampStr: formatUtcFrom22h(reportedSec),
      siemOrder: 0,
      realGapFromPrevSec: prevReal !== null ? Number((ev.realSecondsFrom22h - prevReal).toFixed(3)) : null,
      reportedGapFromPrevSec: null as number | null,
    };
  });

  const sorted = [...raw].sort((a, b) => a.reportedSecondsFrom22h - b.reportedSecondsFrom22h);
  sorted.forEach((item, index) => {
    item.siemOrder = index + 1;
    if (index > 0) {
      item.reportedGapFromPrevSec = Number(
        (item.reportedSecondsFrom22h - sorted[index - 1].reportedSecondsFrom22h).toFixed(3)
      );
    }
  });

  const isOrderInverted = sorted.some((item, index) => item.realOrder !== index + 1);
  const hasAnyDrift = Object.values(drifts).some((d) => Math.abs(d) >= 0.5);

  if (isOrderInverted) {
    return {
      entries: sorted,
      verdictType: 'inverted',
      verdictTitle: 'Secuencia invertida — Prueba digital invalidada',
      verdictNarration: 'El desfase invierte los hechos; la puerta figura al final.',
    };
  }

  if (hasAnyDrift) {
    return {
      entries: sorted,
      verdictType: 'coherent-unreliable',
      verdictTitle: 'Secuencia coherente — Horas no confiables',
      verdictNarration: 'El orden se mantiene, pero las horas no son confiables.',
    };
  }

  return {
    entries: sorted,
    verdictType: 'coherent',
    verdictTitle: 'Secuencia coherente — Trazabilidad NTP verificada',
    verdictNarration: 'Relojes sincronizados: la secuencia cronológica es exacta y auditable.',
  };
}

export function buildForensicTerminalOutput(evalResult: ForensicEvaluation): string {
  const isSynced = evalResult.verdictType === 'coherent';
  const header = isSynced
    ? `$ chronyc tracking
Reference ID    : 47505300 (GPS)
Stratum         : 1
Ref time (UTC)  : Tue Nov 03 22:14:00 2026
System time     : 0.000000142 seconds fast of NTP time
Root delay      : 0.000000000 seconds
Root dispersion : 0.000500000 seconds
Leap status     : Normal\n`
    : `$ ntpq -p
     remote           refid      st t when poll reach   delay   offset  jitter
==============================================================================
 0.pool.ntp.org  .INIT.          16 u    -   64    0    0.000   +0.000   0.000
# ADVERTENCIA PERICIAL: Dispositivos operando con oscilador local sin sincronizar (Stratum 16)\n`;

  const logs = evalResult.entries
    .map(
      (e) =>
        `[${e.reportedTimestampStr}] SIEM_SEQ=${e.siemOrder} (REAL_SEQ=${e.realOrder} | DRIFT=${e.driftSeconds >= 0 ? '+' : ''}${e.driftSeconds}s) src="${e.device}" msg="${e.description}"`
    )
    .join('\n');

  return `${header}\n--- SIEM CORRELATION LOG ---\n${logs}`;
}

