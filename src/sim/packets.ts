import { PacketFrame, PacketFieldHighlight } from '../types/lab';

function buildBaseHeaders(
  srcIp: number[],
  dstIp: number[],
  srcPort: number,
  dstPort: number,
  udpLength: number
): number[] {
  // Ethernet (14 bytes): Dst MAC (6), Src MAC (6), EtherType 0x0800 IPv4 (2)
  const eth = [
    0x00, 0x1a, 0x2b, 0x3c, 0x4d, 0x5e,
    0x00, 0x0c, 0x29, 0x8f, 0x11, 0x22,
    0x08, 0x00,
  ];
  const totalIpLen = 20 + udpLength;
  // IPv4 (20 bytes): Version/IHL 0x45, TOS 0x00, Total Length, ID, Flags, TTL 64, Proto 17 (UDP), Checksum, Src IP, Dst IP
  const ip = [
    0x45, 0x00, (totalIpLen >> 8) & 0xff, totalIpLen & 0xff,
    0x1c, 0x46, 0x40, 0x00,
    0x40, 0x11, 0xb2, 0x8a,
    ...srcIp,
    ...dstIp,
  ];
  // UDP (8 bytes): Src Port, Dst Port (123 = 0x007b), Length, Checksum
  const udp = [
    (srcPort >> 8) & 0xff, srcPort & 0xff,
    (dstPort >> 8) & 0xff, dstPort & 0xff,
    (udpLength >> 8) & 0xff, udpLength & 0xff,
    0x8f, 0x4c,
  ];
  return [...eth, ...ip, ...udp];
}

function toHexArray(bytes: number[]): string[] {
  return bytes.map((b) => b.toString(16).padStart(2, '0'));
}

function baseLayerFields(srcIpStr: string, dstIpStr: string, udpLen: number): PacketFieldHighlight[] {
  return [
    {
      id: 'eth-header',
      layer: 'Ethernet',
      name: 'Cabecera Ethernet II',
      value: '14 bytes (EtherType 0x0800 IPv4)',
      description: 'Encapsulación de enlace de datos entre interfaz local y gateway.',
      offsetByte: 0,
      lengthByte: 14,
    },
    {
      id: 'ip-header',
      layer: 'IPv4',
      name: 'Cabecera IPv4',
      value: `${srcIpStr} → ${dstIpStr} (20 bytes, Proto 17 UDP)`,
      description: 'Enrutamiento de datagramas IP sin estado de conexión.',
      offsetByte: 14,
      lengthByte: 20,
    },
    {
      id: 'udp-header',
      layer: 'UDP',
      name: 'Cabecera UDP (RFC 768)',
      value: `Puerto destino 123 (NTP) · Longitud ${udpLen} B (8 bytes fijos)`,
      description: 'Transporte sin handshakes ni retransmisiones que distorsionen T1..T4.',
      offsetByte: 34,
      lengthByte: 8,
    },
  ];
}

/**
 * Trama 107 de la monografía (Sección 6.4): Petición Cliente NTPv4 (90 bytes totales)
 */
export function buildTrama107Request(): PacketFrame {
  const base = buildBaseHeaders([192, 168, 1, 105], [200, 16, 28, 10], 54123, 123, 56);
  // 48 bytes NTP: Flags 0x23 (LI=0, VN=4, Mode=3 Cliente), Stratum=0, Poll=6 (64s), Precision=0x00 (1.0s)
  const ntp = [
    0x23, 0x00, 0x06, 0x00,
    0x00, 0x00, 0x00, 0x00, // Root Delay: 0.0000 s
    0x00, 0x00, 0x00, 0x00, // Root Dispersion: 0.0000 s
    0x00, 0x00, 0x00, 0x00, // Ref ID: NULL
    // Reference Timestamp (8B): 0 (1 ene 1970)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    // Origin Timestamp (8B): 0
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    // Receive Timestamp (8B): 0
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    // Transmit Timestamp T1 (8B): 3 nov 2026 23:45:10.123456000 UTC
    0xeeb8, 0x8f86, 0x1f9a, 0xdd3c,
  ].flatMap((v) => (v > 0xff ? [(v >> 8) & 0xff, v & 0xff] : [v]));
  const allBytes = [...base, ...ntp];
  return {
    id: 'trama-107',
    title: 'Trama 107 · Solicitud NTP (Modo 3 Cliente)',
    subtitle: '90 bytes totales: Ethernet 14 B + IPv4 20 B + UDP 8 B + NTP 48 B',
    totalBytes: 90,
    hexBytes: toHexArray(allBytes),
    fields: [
      ...baseLayerFields('192.168.1.105', '200.16.28.10', 56),
      {
        id: 'ntp-flags',
        layer: 'NTP',
        name: 'Banderas (LI / VN / Modo)',
        value: '0x23 (LI=0 sin advertencia, VN=4 NTPv4, Modo=3 Cliente)',
        description: 'Primer byte que define versión 4 y solicitud de cliente.',
        offsetByte: 42,
        lengthByte: 1,
      },
      {
        id: 'ntp-stratum-poll',
        layer: 'NTP',
        name: 'Estrato, Sondeo y Precisión',
        value: 'Estrato 0 (no especificado) · Poll 6 (64 seg) · Precisión 1,000000 seg',
        description: 'El cliente inicia su consulta con contadores de estrato y referencia vacíos.',
        offsetByte: 43,
        lengthByte: 3,
      },
      {
        id: 'ntp-refid',
        layer: 'NTP',
        name: 'ID de Referencia y Raíz',
        value: 'Ref ID: NULL · Retardo 0,0000 s · Dispersión 0,0000 s',
        description: 'Sin fuente sincronizada todavía en el paquete de salida.',
        offsetByte: 46,
        lengthByte: 12,
      },
      {
        id: 'ntp-zero-ts',
        layer: 'NTP',
        name: 'Marcas de Referencia, Origen y Recepción',
        value: '1 de enero de 1970 00:00:00.000000000 UTC (en cero)',
        description: '24 bytes en cero hasta que el servidor complete T2 y T3.',
        offsetByte: 58,
        lengthByte: 24,
      },
      {
        id: 'ntp-t1',
        layer: 'NTP',
        name: 'Marca de Tiempo de Transmisión (T1)',
        value: '3 nov 2026 23:45:10.123456000 UTC (64 bits: 32s + 32 frac)',
        description: 'Hora local exacta en la que el cliente despacha la solicitud.',
        offsetByte: 82,
        lengthByte: 8,
      },
    ],
  };
}

/**
 * Trama 108 (impresa como 100 en la monografía, Sección 6.4): Respuesta Servidor NTPv4 (90 bytes totales)
 */
export function buildTrama108Response(): PacketFrame {
  const base = buildBaseHeaders([200, 16, 28, 10], [192, 168, 1, 105], 123, 54123, 56);
  // Flags 0x24 (LI=0, VN=4, Mode=4 Servidor), Stratum=1, Poll=6 (64s), Precision=-20 (0.000001s = 0xec)
  const ntp = [
    0x24, 0x01, 0x06, 0xec,
    0x00, 0x00, 0x00, 0x00, // Root Delay: 0.0000 s
    0x00, 0x00, 0x00, 0x21, // Root Dispersion: 0.0005 s
    0x47, 0x50, 0x53, 0x00, // Ref ID: "GPS\0"
    // Reference Timestamp (8B): 3 nov 2026 23:30:00.000000000 UTC
    0xee, 0xb8, 0x8b, 0xf8, 0x00, 0x00, 0x00, 0x00,
    // Origin Timestamp T1 (8B): 3 nov 2026 23:45:10.123456000 UTC
    0xee, 0xb8, 0x8f, 0x86, 0x1f, 0x9a, 0xdd, 0x3c,
    // Receive Timestamp T2 (8B): 3 nov 2026 23:45:10.145000000 UTC
    0xee, 0xb8, 0x8f, 0x86, 0x25, 0x1e, 0xb8, 0x52,
    // Transmit Timestamp T3 (8B): 3 nov 2026 23:45:10.145050000 UTC
    0xee, 0xb8, 0x8f, 0x86, 0x25, 0x22, 0x0c, 0x4a,
  ];
  const allBytes = [...base, ...ntp];
  return {
    id: 'trama-108',
    title: 'Trama 108 (100) · Respuesta NTP (Modo 4 Servidor)',
    subtitle: '90 bytes totales: Ethernet 14 B + IPv4 20 B + UDP 8 B + NTP 48 B',
    totalBytes: 90,
    hexBytes: toHexArray(allBytes),
    fields: [
      ...baseLayerFields('200.16.28.10', '192.168.1.105', 56),
      {
        id: 'ntp-flags-srv',
        layer: 'NTP',
        name: 'Banderas (LI / VN / Modo)',
        value: '0x24 (LI=0, VN=4 NTPv4, Modo=4 Servidor)',
        description: 'Indica respuesta oficial desde el servidor de tiempo.',
        offsetByte: 42,
        lengthByte: 1,
      },
      {
        id: 'ntp-stratum-srv',
        layer: 'NTP',
        name: 'Estrato y Precisión del Servidor',
        value: 'Estrato 1 (Referencia primaria) · Poll 6 (64 s) · Precisión 0,000001 s',
        description: 'Servidor sincronizado directamente con reloj receptor GPS.',
        offsetByte: 43,
        lengthByte: 3,
      },
      {
        id: 'ntp-refid-gps',
        layer: 'NTP',
        name: 'ID de Referencia y Dispersión',
        value: 'ID Referencia: "GPS" (0x47505300) · Dispersión de raíz: 0,0005 seg',
        description: 'Identificador ASCII de 4 bytes para relojes de Estrato 1.',
        offsetByte: 46,
        lengthByte: 12,
      },
      {
        id: 'ntp-ref-ts',
        layer: 'NTP',
        name: 'Marca de Tiempo de Referencia',
        value: '3 nov 2026 23:30:00.000000000 UTC',
        description: 'Último instante en que el servidor disciplinó su reloj contra el GPS.',
        offsetByte: 58,
        lengthByte: 8,
      },
      {
        id: 'ntp-t1-copy',
        layer: 'NTP',
        name: 'Marca de Tiempo de Origen (T1 copiada)',
        value: '3 nov 2026 23:45:10.123456000 UTC',
        description: 'El servidor devuelve intacta la marca T1 enviada por el cliente.',
        offsetByte: 66,
        lengthByte: 8,
      },
      {
        id: 'ntp-t2',
        layer: 'NTP',
        name: 'Marca de Tiempo de Recepción (T2)',
        value: '3 nov 2026 23:45:10.145000000 UTC',
        description: 'Hora exacta en que la petición ingresó a la interfaz del servidor.',
        offsetByte: 74,
        lengthByte: 8,
      },
      {
        id: 'ntp-t3',
        layer: 'NTP',
        name: 'Marca de Tiempo de Transmisión (T3)',
        value: '3 nov 2026 23:45:10.145050000 UTC (50 µs de proc.)',
        description: 'Hora exacta en que el servidor transmite la respuesta hacia el cliente.',
        offsetByte: 82,
        lengthByte: 8,
      },
    ],
  };
}

/**
 * Paquete NTPv4 protegido con los 4 campos de extensión NTS (RFC 8915, Sección 8.6 de la monografía)
 */
export function buildNtsProtectedFrame(tampered: boolean): PacketFrame {
  const baseResponse = buildTrama108Response();
  // Agregamos 32 bytes representativos de los 4 Extension Fields del RFC 8915
  const ntsExtBytes = [
    // 1. Unique Identifier (8B)
    0x01, 0x04, 0x00, 0x08, 0x9a, 0xbc, 0xde, 0xf0,
    // 2. NTS Cookie (8B)
    0x02, 0x04, 0x00, 0x08, 0x4b, 0x65, 0x79, 0x31,
    // 3. NTS Cookie Placeholder (8B)
    0x03, 0x04, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00,
    // 4. NTS Authenticator and Encrypted Extension Fields (8B AEAD Tag)
    0x04, 0x04, 0x00, 0x08,
    tampered ? 0xff : 0x7e,
    tampered ? 0x00 : 0xa4,
    0x55, 0xc3,
  ];
  const hexBytes = [...baseResponse.hexBytes, ...toHexArray(ntsExtBytes)];
  return {
    id: tampered ? 'nts-tampered' : 'nts-valid',
    title: tampered
      ? 'Paquete NTP + NTS Alterado en Tránsito (DESCARTADO)'
      : 'Paquete NTPv4 Autenticado con NTS (RFC 8915)',
    subtitle: 'Cabecera NTP (90 B) + 4 Campos de Extensión Criptográfica NTS',
    totalBytes: hexBytes.length,
    hexBytes,
    fields: [
      ...baseResponse.fields.slice(0, 4),
      {
        id: 'nts-uid',
        layer: 'NTS',
        name: '1. Unique Identifier (Extensión 0x0104)',
        value: 'Nonce aleatorio de 32+ bytes (Anti-Replay)',
        description: 'Permite detectar y descartar respuestas repetidas por un atacante.',
        offsetByte: 90,
        lengthByte: 8,
      },
      {
        id: 'nts-cookie',
        layer: 'NTS',
        name: '2. NTS Cookie (Extensión 0x0204)',
        value: 'Estado criptográfico cifrado (Autenticación Sin Estado)',
        description: 'Habilita la verificación asimétrica sin que el servidor guarde sesión por cliente.',
        offsetByte: 98,
        lengthByte: 8,
      },
      {
        id: 'nts-placeholder',
        layer: 'NTS',
        name: '3. NTS Cookie Placeholder (Extensión 0x0304)',
        value: 'Reserva de longitud para renovación de cookies (Tracking Protection)',
        description: 'Permite reponer cookies sin amplificar el tamaño del paquete UDP.',
        offsetByte: 106,
        lengthByte: 8,
      },
      {
        id: 'nts-auth',
        layer: 'NTS',
        name: '4. NTS Authenticator & Encrypted Fields (0x0404)',
        value: tampered
          ? 'MAC AEAD INVÁLIDO (Sello roto por modificación MitM → DROP)'
          : 'Tag AEAD verificado con éxito (Integridad garantizada)',
        description: 'Invalida el paquete si un router o atacante altera los sellos de tiempo en vuelo.',
        offsetByte: 114,
        lengthByte: 8,
      },
    ],
  };
}

/**
 * Cabecera real Modo 7 monlist documentada en la Sección 8.2 de la monografía: d7 00 03 2a 00 06 00 48
 */
export const MONLIST_MODE7_HEADER_HEX = 'd7 00 03 2a 00 06 00 48';

/**
 * Paquete de Respuesta NTP Modo 7 Privado (REQ_MON_GETLIST_1 / monlist) con cabecera real d7 00 03 2a 00 06 00 48
 */
export function buildMonlistMode7Frame(): PacketFrame {
  // Ethernet (14 B) + IPv4 (20 B) + UDP (8 B) + Cabecera Modo 7 (8 B) + Primera estructura MRU de ejemplo (72 B) = 122 B representativos
  const udpLen = 8 + 8 + 72; // 88 B UDP (truncado a 1 entrada MRU de 72 B para inspección)
  const base = buildBaseHeaders([198, 51, 100, 50], [203, 0, 113, 10], 123, 49812, udpLen);
  const mode7Header = [0xd7, 0x00, 0x03, 0x2a, 0x00, 0x06, 0x00, 0x48];
  // 72 bytes representativos de una entrada monlist (avg_int, last_int, restr, count, addr IPv4, port, mode, version...)
  const sampleMruItem = [
    0x00, 0x00, 0x00, 0x40, // avg interval: 64 s
    0x00, 0x00, 0x00, 0x02, // last interval: 2 s
    0x00, 0x00, 0x00, 0x00, // restriction flags
    0x00, 0x00, 0x01, 0xf4, // count: 500 paquetes
    192, 0, 2, 44,          // Dirección IP cliente registrada en tabla MRU (192.0.2.44)
    200, 16, 28, 10,        // Dirección IP interfaz local del reflector
    0x00, 0x00, 0x00, 0x00, // flags
    0x00, 0x7b,             // port: 123
    0x03,                   // mode: 3 (Cliente)
    0x04,                   // version: 4 (NTPv4)
    ...new Array(40).fill(0x00), // Padding estructura v6/extensiones hasta completar 72 B (0x48)
  ];
  const allBytes = [...base, ...mode7Header, ...sampleMruItem];

  return {
    id: 'monlist-mode7',
    title: 'Respuesta NTP Modo 7 · REQ_MON_GETLIST_1 (monlist)',
    subtitle: 'Cabecera Modo 7 (d7 00 03 2a 00 06 00 48) + Registros MRU de 72 B c/u',
    totalBytes: allBytes.length,
    hexBytes: toHexArray(allBytes),
    fields: [
      ...baseLayerFields('198.51.100.50 (Reflector)', '203.0.113.10 (IP Víctima Falsificada)', 448),
      {
        id: 'mode7-flags',
        layer: 'Modo7',
        name: 'Byte 0 Modo 7 (R / M / VN / Mode) y Auth',
        value: '0xd7 0x00 (R=1 Respuesta, M=1 Más fragmentos, VN=2, Modo=7 Privado, Auth=0)',
        description: 'Identifica un datagrama privado de diagnóstico de ntpd con fragmentación activa.',
        offsetByte: 42,
        lengthByte: 2,
      },
      {
        id: 'mode7-impl-req',
        layer: 'Modo7',
        name: 'Implementación y Código de Solicitud',
        value: '0x03 (XNTPD) · 0x2a (Código 42 = REQ_MON_GETLIST_1)',
        description: 'Instrucción interna que vuelca la lista de los últimos 600 clientes (monlist).',
        offsetByte: 44,
        lengthByte: 2,
      },
      {
        id: 'mode7-count-size',
        layer: 'Modo7',
        name: 'Cantidad de Ítems y Tamaño de Estructura',
        value: '0x0006 (6 IPs por paquete) · 0x0048 (72 bytes por cada estructura IP)',
        description: 'Explica la amplificación masiva: hasta 100 paquetes UDP para devolver 600 IPs (~48 KB).',
        offsetByte: 46,
        lengthByte: 4,
      },
      {
        id: 'mode7-mru-entry',
        layer: 'Modo7',
        name: 'Entrada de Tabla MRU #1 (72 bytes)',
        value: 'Cliente: 192.0.2.44 · Conteo: 500 consultas · Modo 3 NTPv4',
        description: 'Registro de actividad de terceros almacenado en memoria del reflector y enviado hacia la víctima.',
        offsetByte: 50,
        lengthByte: 72,
      },
    ],
  };
}


