import { describe, it, expect } from 'vitest';
import { evaluateForensicTimeline, FORENSIC_PRESETS, formatUtcFrom22h } from '../forense';
import { evaluateSpoofServices } from '../spoof';
import { calculateDdosMetrics } from '../ddos';

describe('Escena 2: Peritaje Forense y SIEM', () => {
  it('S2.4: Con el preset "Orden invertido", el veredicto es invertido y la puerta aparece al final', () => {
    const res = evaluateForensicTimeline(FORENSIC_PRESETS.ordenInvertido.drifts);
    expect(res.verdictType).toBe('inverted');
    expect(res.entries[res.entries.length - 1].id).toBe('door');
  });

  it('S2.4: Con el preset "Caso 22:15", el orden se conserva pero advierte que las horas no son confiables', () => {
    const res = evaluateForensicTimeline(FORENSIC_PRESETS.caso2215.drifts);
    expect(res.verdictType).toBe('coherent-unreliable');
    expect(res.entries.map((e) => e.id)).toEqual(['camera', 'door', 'tv', 'router']);
  });

  it('S2.5: Tras sincronizar con NTP (derivas en 0), el veredicto es coherente y la brecha cámara-puerta es 43.225 s', () => {
    const res = evaluateForensicTimeline(FORENSIC_PRESETS.sincronizado.drifts);
    expect(res.verdictType).toBe('coherent');
    expect(res.entries[1].realGapFromPrevSec).toBe(43.225);
  });

  it('Bug #7: formatUtcFrom22h redondea fracciones .9996 s al segundo siguiente sin generar .1000 UTC', () => {
    const formatted = formatUtcFrom22h(14 * 60 + 2.9996);
    expect(formatted).toBe('22:14:03.000 UTC');
    expect(formatted).not.toContain('.1000');
  });
});

describe('Escena 3: Time Spoofing y NTS (RFC 8915)', () => {
  it('Criterio +45 s sin NTS: falla únicamente TOTP', () => {
    const res = evaluateSpoofServices('plus45s', false);
    expect(res.failedCount).toBe(1);
    expect(res.services.find((s) => s.id === 'totp')?.failed).toBe(true);
  });

  it('Criterio +10 min sin NTS: fallan TOTP, Kerberos y ARCA WSAA/CAE; TLS y DNSSEC siguen en verde', () => {
    const res = evaluateSpoofServices('plus10m', false);
    expect(res.failedCount).toBe(3);
    expect(res.services.find((s) => s.id === 'tls')?.failed).toBe(false);
    expect(res.services.find((s) => s.id === 'dnssec')?.failed).toBe(false);
  });

  it('S3.4: Con NTS activado, cualquier vector alterado se descarta y los 5 servicios quedan en verde', () => {
    const res = evaluateSpoofServices('minus5y', true);
    expect(res.packetDropped).toBe(true);
    expect(res.failedCount).toBe(0);
  });
});

describe('Escena 4: Amplificación DDoS monlist', () => {
  const noMitigation = {
    disableMonitor: false,
    restrictNoqueryIPv4: false,
    restrictNoqueryIPv6: false,
  };

  it('S4.1: 55 IPs generan 4.460 B en 10 paquetes y 600 IPs generan 48.000 B en 100 paquetes (~205.1:1)', () => {
    const r55 = calculateDdosMetrics({
      mruIpCount: 55,
      reflectorCount: 1,
      usCertCase: false,
      mitigation: noMitigation,
    });
    expect(r55.responseBytesPerReflector).toBe(4460);
    expect(r55.responsePacketsPerReflector).toBe(10);

    const r600 = calculateDdosMetrics({
      mruIpCount: 600,
      reflectorCount: 20,
      usCertCase: false,
      mitigation: noMitigation,
    });
    expect(r600.responseBytesPerReflector).toBe(48000);
    expect(r600.responsePacketsPerReflector).toBe(100);
    expect(r600.baf).toBe(205.1);
    expect(r600.isSaturated).toBe(true);
  });

  it('S4.2: El Caso US-CERT usa petición de 90 B y da un factor de 556.9:1 con 600 IPs', () => {
    const res = calculateDdosMetrics({
      mruIpCount: 600,
      reflectorCount: 10,
      usCertCase: true,
      mitigation: noMitigation,
    });
    expect(res.requestBytes).toBe(90);
    expect(res.baf).toBe(556.9);
  });

  it('S4.3: Al activar cualquier línea de ntp.conf, la respuesta cae a 0 B y el factor a 0:1', () => {
    const res = calculateDdosMetrics({
      mruIpCount: 600,
      reflectorCount: 50,
      usCertCase: true,
      mitigation: { ...noMitigation, restrictNoqueryIPv4: true },
    });
    expect(res.isMitigated).toBe(true);
    expect(res.totalResponseBytes).toBe(0);
    expect(res.baf).toBe(0);
  });
});

