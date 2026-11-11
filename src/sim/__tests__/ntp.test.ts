import { describe, it, expect } from 'vitest';
import { calculateNtpSync, SYNC_PRESETS } from '../ntp';
import {
  buildTrama107Request,
  buildTrama108Response,
  buildNtsProtectedFrame,
  buildMonlistMode7Frame,
  MONLIST_MODE7_HEADER_HEX,
} from '../packets';

describe('Escena 1: Sincronización NTP (RFC 5905) y Tramas', () => {
  it('S1.2 / S1.5: En un enlace simétrico el error residual tras corregir el reloj es 0 ms', () => {
    const res = calculateNtpSync(SYNC_PRESETS.symmetric.params);
    expect(res.deltaMs).toBe(50); // 25 ms ida + 25 ms vuelta
    expect(res.thetaMs).toBe(120); // Detecta exactamente los 120 ms de desfase inicial
    expect(res.residualMagnitudeMs).toBe(0);
  });

  it('S1.5: En el preset asimétrico (ida 40 ms, vuelta 200 ms) el error residual es de 80 ms (-80 ms)', () => {
    const res = calculateNtpSync(SYNC_PRESETS.asymmetric.params);
    expect(res.deltaMs).toBe(240);
    expect(res.residualErrorMs).toBe(-80);
    expect(res.residualMagnitudeMs).toBe(80);
  });

  it('S1.6 / S3.7: Construye las Tramas 107 y 108 de 90 bytes y los 4 campos de extensión NTS', () => {
    const req = buildTrama107Request();
    const resp = buildTrama108Response();
    const nts = buildNtsProtectedFrame(false);

    expect(req.totalBytes).toBe(90);
    expect(req.hexBytes[42]).toBe('23'); // 0x23 Modo 3 Cliente
    expect(resp.totalBytes).toBe(90);
    expect(resp.hexBytes[42]).toBe('24'); // 0x24 Modo 4 Servidor
    expect(nts.fields.filter((f) => f.layer === 'NTS')).toHaveLength(4);
  });

  it('Mejora #5: Construye el PacketFrame Modo 7 monlist con cabecera real d7 00 03 2a 00 06 00 48', () => {
    const mode7 = buildMonlistMode7Frame();
    expect(mode7.id).toBe('monlist-mode7');
    expect(mode7.hexBytes.slice(42, 50).join(' ')).toBe(MONLIST_MODE7_HEADER_HEX);
    expect(mode7.fields.some((f) => f.layer === 'Modo7')).toBe(true);
  });
});

