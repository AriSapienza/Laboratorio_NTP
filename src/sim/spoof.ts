export type SpoofVectorKey = 'legit' | 'plus45s' | 'plus10m' | 'minus5y' | 'plus6m';

export type CriticalServiceId = 'totp' | 'kerberos' | 'arca' | 'tls' | 'dnssec';

export interface SpoofVectorConfig {
  key: SpoofVectorKey;
  label: string;
  offsetSeconds: number;
  displayAcceptedDate: string;
  primaryTarget?: CriticalServiceId;
  narrationNoNts: string; // <= 12 palabras
}

export interface ServiceStatusResult {
  id: CriticalServiceId;
  name: string;
  thresholdLabel: string;
  failed: boolean;
  isPrimaryTarget: boolean;
  reason: string; // Una línea concisa cuando falla (S3.5)
}

export const SPOOF_VECTORS: Record<SpoofVectorKey, SpoofVectorConfig> = {
  legit: {
    key: 'legit',
    label: 'Tráfico legítimo (0 s)',
    offsetSeconds: 0,
    displayAcceptedDate: '3 nov 2026 07:30:00 UTC',
    narrationNoNts: 'Hora legítima recibida: los cinco servicios operan con normalidad.',
  },
  plus45s: {
    key: 'plus45s',
    label: '+45 segundos',
    offsetSeconds: 45,
    displayAcceptedDate: '3 nov 2026 07:30:45 UTC',
    primaryTarget: 'totp',
    narrationNoNts: 'Con +45 segundos sin NTS falla únicamente el segundo factor.',
  },
  plus10m: {
    key: 'plus10m',
    label: '+10 minutos',
    offsetSeconds: 600,
    displayAcceptedDate: '3 nov 2026 07:40:00 UTC',
    primaryTarget: 'kerberos',
    narrationNoNts: 'Con +10 minutos colapsan TOTP, Kerberos y facturación ARCA.',
  },
  minus5y: {
    key: 'minus5y',
    label: '-5 años (12 oct 2021)',
    offsetSeconds: -5 * 365 * 86400,
    displayAcceptedDate: '12 oct 2021 07:30:00 UTC',
    primaryTarget: 'tls',
    narrationNoNts: 'Atrasar cinco años rompe TLS y permite certificados revocados.',
  },
  plus6m: {
    key: 'plus6m',
    label: '+6 meses',
    offsetSeconds: 180 * 86400,
    displayAcceptedDate: '3 may 2027 07:30:00 UTC',
    primaryTarget: 'dnssec',
    narrationNoNts: 'Adelantar seis meses caduca firmas DNSSEC, RPKI y certificados.',
  },
};

export function evaluateSpoofServices(vectorKey: SpoofVectorKey, ntsEnabled: boolean): {
  services: ServiceStatusResult[];
  packetDropped: boolean;
  acceptedDateStr: string;
  failedCount: number;
} {
  const vector = SPOOF_VECTORS[vectorKey];
  const effectiveOffsetSec = ntsEnabled ? 0 : vector.offsetSeconds;
  const absSec = Math.abs(effectiveOffsetSec);
  const packetDropped = ntsEnabled && vector.offsetSeconds !== 0;

  const totpFailed = absSec > 30;
  const kerberosFailed = absSec > 300;
  const arcaFailed = absSec > 300;
  const tlsFailed = absSec > 86400 * 30;
  const dnssecFailed = absSec > 86400 * 30;

  const services: ServiceStatusResult[] = [
    {
      id: 'totp',
      name: 'Segundo Factor TOTP (RFC 6238)',
      thresholdLabel: '±30 seg',
      failed: totpFailed,
      isPrimaryTarget: vector.primaryTarget === 'totp',
      reason: totpFailed ? 'Token 2FA rechazado: supera ventana de 30 s.' : 'Dentro de ventana temporal.',
    },
    {
      id: 'kerberos',
      name: 'Autenticación Kerberos (RFC 4120)',
      thresholdLabel: '±5 min',
      failed: kerberosFailed,
      isPrimaryTarget: vector.primaryTarget === 'kerberos',
      reason: kerberosFailed ? 'Error KRB_AP_ERR_SKEW: desfase mayor a 5 min.' : 'Tickets TGT válidos.',
    },
    {
      id: 'arca',
      name: 'Facturación ARCA WSAA / CAE',
      thresholdLabel: '±5 min',
      failed: arcaFailed,
      isPrimaryTarget: vector.primaryTarget === 'arca',
      reason: arcaFailed ? 'Rechazo de CAE: GenerationTime fuera de tolerancia.' : 'Firma WSAA autorizada.',
    },
    {
      id: 'tls',
      name: 'Certificados TLS X.509 (RFC 5280)',
      thresholdLabel: 'Vigencia',
      failed: tlsFailed,
      isPrimaryTarget: vector.primaryTarget === 'tls',
      reason: tlsFailed
        ? effectiveOffsetSec < 0
          ? 'Certificado actual aún no válido (notBefore) o revocado aceptado.'
          : 'Certificados HTTPS expirados (notAfter superado).'
        : 'Cadena X.509 válida.',
    },
    {
      id: 'dnssec',
      name: 'Firmas DNSSEC y RPKI / BGP',
      thresholdLabel: 'Vigencia',
      failed: dnssecFailed,
      isPrimaryTarget: vector.primaryTarget === 'dnssec',
      reason: dnssecFailed
        ? 'Firmas RRSIG caducadas y manifiestos BGP/ROA invalidados.'
        : 'Validación criptográfica activa.',
    },
  ];

  return {
    services,
    packetDropped,
    acceptedDateStr: ntsEnabled ? SPOOF_VECTORS.legit.displayAcceptedDate : vector.displayAcceptedDate,
    failedCount: services.filter((s) => s.failed).length,
  };
}

