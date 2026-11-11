import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Lock,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  KeyRound,
  SearchCode,
  Play,
} from 'lucide-react';
import { SimEvent, ThemeMode } from '../types/lab';
import { Sim } from '../sim/engine';
import { useSim } from '../hooks/useSim';
import { broadcastPresenterState } from '../sim/broadcast';
import {
  evaluateSpoofServices,
  SPOOF_VECTORS,
  SpoofVectorKey,
} from '../sim/spoof';
import { buildNtsProtectedFrame, buildTrama108Response } from '../sim/packets';
import { NarratorBar } from '../components/NarratorBar';
import { TransportBar } from '../components/TransportBar';
import { EventList } from '../components/EventList';
import { PacketInspector } from '../components/PacketInspector';
import { NetworkNode } from '../components/NetworkNode';

interface SpoofSceneProps {
  theme: ThemeMode;
  presentationMode: boolean;
}

function buildSpoofEvents(vectorKey: SpoofVectorKey, ntsEnabled: boolean): SimEvent[] {
  const vec = SPOOF_VECTORS[vectorKey];
  const isAttack = vectorKey !== 'legit';

  if (ntsEnabled) {
    return [
      {
        id: 'nts-ke',
        at: 0.3,
        label: 'Fase 1 · Handshake NTS-KE (TCP 4460 con TLS 1.3)',
        narration: 'NTS-KE negocia claves AEAD y cookies sobre TCP 4460.',
      },
      {
        id: 'srv-send-nts',
        at: 1.0,
        label: 'Fase 2 · Servidor envía respuesta NTP + Cookie + MAC AEAD',
        narration: 'El servidor envía la hora sellada con autenticación AEAD.',
        packetId: 'nts-valid',
      },
      {
        id: 'mitm-tamper-nts',
        at: 1.7,
        label: isAttack
          ? `Atacante MitM altera fecha a ${vec.label} → Sello AEAD se rompe`
          : 'Paquete autenticado cruza la red sin alteraciones',
        narration: isAttack
          ? 'El atacante reescribe la fecha, rompiendo el sello criptográfico.'
          : 'El paquete autenticado viaja íntegro hacia el cliente.',
        packetId: isAttack ? 'nts-tampered' : 'nts-valid',
      },
      {
        id: 'client-verify-nts',
        at: 2.5,
        label: isAttack
          ? 'Cliente descarta paquete alterado (DROP) · 5 servicios en verde'
          : 'Cliente valida MAC AEAD · 5 servicios en verde',
        narration: isAttack
          ? 'El cliente descarta el paquete adulterado; ningún servicio falla.'
          : 'NTS valida la firma: todos los servicios siguen operativos.',
        packetId: isAttack ? 'nts-tampered' : 'nts-valid',
      },
    ];
  }

  return [
    {
      id: 'udp-plain-send',
      at: 0.4,
      label: 'Servidor NTP envía respuesta UDP 123 sin autenticar (07:30 UTC)',
      narration: 'El servidor envía un paquete UDP 123 en texto plano.',
      packetId: 'trama-108',
    },
    {
      id: 'mitm-rewrite',
      at: 1.4,
      label: isAttack
        ? `Atacante MitM reescribe el timestamp en vuelo (${vec.label})`
        : 'Tráfico legítimo sin modificación en el nodo intermedio',
      narration: isAttack
        ? `El atacante intercepta y desplaza el reloj (${vec.label}).`
        : 'El paquete no sufre modificaciones en el enlace.',
      packetId: 'trama-108',
    },
    {
      id: 'client-accept',
      at: 2.5,
      label: `Cliente acepta ${vec.displayAcceptedDate} · Impacto en servicios`,
      narration: vec.narrationNoNts,
      packetId: 'trama-108',
    },
  ];
}

export const SpoofScene: React.FC<SpoofSceneProps> = ({ theme }) => {
  const [vectorKey, setVectorKey] = useState<SpoofVectorKey>('minus5y');
  const [ntsEnabled, setNtsEnabled] = useState(false);
  const [inspectedPacketId, setInspectedPacketId] = useState<string | null>(null);

  const simRef = useRef<Sim>(new Sim(2.8, buildSpoofEvents('minus5y', false)));
  const sim = simRef.current;
  const { t, duration, playing, speed, events, currentEventIndex, currentEvent } = useSim(sim);

  const evalResult = useMemo(() => evaluateSpoofServices(vectorKey, ntsEnabled), [vectorKey, ntsEnabled]);
  const currentVector = SPOOF_VECTORS[vectorKey];
  const isAttack = vectorKey !== 'legit';
  const isDark = theme === 'dark';

  useEffect(() => {
    sim.setConfig(2.8, buildSpoofEvents(vectorKey, ntsEnabled));
    sim.seek(2.6);
  }, [vectorKey, ntsEnabled, sim]);

  // Atajos locales de transporte
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        sim.togglePlay();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        sim.nextStep();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        sim.prevStep();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sim]);

  // Sincronización con Ventana de Presentador (Requisito G14)
  useEffect(() => {
    broadcastPresenterState({
      scene: 'spoof',
      t,
      duration,
      playing,
      speed,
      stepIndex: currentEventIndex,
      totalSteps: events.length,
      narration: currentEvent?.narration || '',
      activePreset: `${vectorKey}-${ntsEnabled ? 'nts' : 'plain'}`,
    });
  }, [t, duration, playing, speed, currentEventIndex, events.length, currentEvent, vectorKey, ntsEnabled]);

  const inspectedPacket = useMemo(() => {
    if (!inspectedPacketId) return null;
    if (inspectedPacketId === 'nts-tampered') return buildNtsProtectedFrame(true);
    if (inspectedPacketId === 'nts-valid') return buildNtsProtectedFrame(false);
    return buildTrama108Response();
  }, [inspectedPacketId]);

  // Posición animada del paquete a través del MitM (0 -> 100%)
  const packetProgress = Math.min(1, Math.max(0, (t - 0.4) / 2.0));
  const passedMitm = packetProgress >= 0.5;
  const sealBroken = ntsEnabled && isAttack && passedMitm;

  // Posición del cursor en la regla logarítmica de desfase (Requisito S3.6)
  const rulerCursorPercent: Record<SpoofVectorKey, number> = {
    minus5y: 8,
    legit: 50,
    plus45s: 63,
    plus10m: 76,
    plus6m: 92,
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 scene-transition">
      {/* Narrador Superior (Principio 1 y Requisito G6) */}
      <NarratorBar
        sceneTitle="Escena 3 · Time Spoofing y NTS"
        keyMessage="Un solo paquete UDP 123 sin autenticar rompe 2FA, facturación y TLS; NTS lo vuelve inútil."
        stepIndex={currentEventIndex}
        totalSteps={events.length}
        narration={currentEvent?.narration || currentVector.narrationNoNts}
        detailTitle="Marco Regulatorio Argentino, Ataques Lógicos NDSS 2016 y RFC 8915 (NTS)"
        theme={theme}
        detailContent={
          <div className="space-y-4 text-base">
            <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/30">
              <h4 className="font-bold text-lg text-sky-400">
                1. Marco Regulatorio en Argentina (BCRA, ARCA e IFDRA)
              </h4>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>
                  <strong>BCRA Comunicación &quot;A&quot; 7783:</strong> Exige a las entidades financieras sincronizar
                  sus relojes para auditar cada transacción y evento de seguridad.
                </li>
                <li>
                  <strong>ARCA RG 4291/2018 (WSAA / CAE):</strong> Los Web Services rechazan la emisión de comprobantes
                  electrónicos si el <code>GenerationTime</code> del contribuyente difiere de la hora oficial.
                </li>
                <li>
                  <strong>Ley N.º 25.506 y Decreto 182/2019:</strong> Regulan la Firma Digital y el Sellado de Tiempo (
                  <em>Timestamping</em>) en la República Argentina.
                </li>
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
              <h4 className="font-bold text-lg text-rose-400">
                2. Ataques Lógicos Remotos (Simposio NDSS 2016)
              </h4>
              <p className="mt-1">
                Además de un ataque Man-in-the-Middle local, investigaciones de NDSS 2016 demostraron ataques{' '}
                <em>off-path</em> como la falsificación de paquetes <strong>Kiss-o&apos;-Death (CVE-2015-7704)</strong>{' '}
                para silenciar al cliente, y <strong>Small-Step-Big-Step (CVE-2015-5300)</strong> para inyectar saltos
                temporales masivos durante el reinicio.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <h4 className="font-bold text-lg text-emerald-400">
                3. Arquitectura de Dos Fases en Network Time Security (RFC 8915)
              </h4>
              <p className="mt-1">
                NTS separa el acuerdo de claves (<strong>NTS-KE sobre TCP 4460 con TLS</strong>) del intercambio de
                tiempo sobre <strong>UDP 123</strong> mediante 4 campos de extensión (Unique Identifier, NTS Cookie,
                Cookie Placeholder y Authenticator AEAD), garantizando autenticidad sin que el servidor almacene estado
                por cliente.
              </p>
            </div>
          </div>
        }
      />

      {/* Cuerpo Principal 70% Lienzo / 30% Grilla de Semáforos + Eventos */}
      <div className="flex-1 grid grid-cols-12 gap-4 p-4 min-h-0 overflow-hidden">
        {/* LIENZO INTERACTIVO (70% -> 8 columnas) */}
        <div
          className={`col-span-12 lg:col-span-8 rounded-2xl border p-5 flex flex-col justify-between relative min-h-0 ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-300 shadow-sm'
          }`}
        >
          {/* Controles Superiores: Vectores de Desfase + Interruptor NTS + Inspector */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-700/50">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNtsEnabled((v) => !v)}
                className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 border transition-all shadow ${
                  ntsEnabled
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : isDark
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 hover:bg-rose-500/30'
                    : 'bg-rose-500/15 text-rose-900 border-rose-600/60 hover:bg-rose-500/25'
                }`}
              >
                {ntsEnabled ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                <span>{ntsEnabled ? 'NTS Activado (RFC 8915)' : 'Sin Autenticación (UDP Plano)'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sim.reset();
                  sim.play();
                }}
                className="px-3.5 py-2 rounded-xl bg-sky-500 text-slate-950 font-bold text-sm flex items-center gap-1.5"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Simular intercambio</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                setInspectedPacketId(ntsEnabled ? (isAttack ? 'nts-tampered' : 'nts-valid') : 'trama-108')
              }
              className={`px-3.5 py-2 rounded-xl border text-sm font-semibold flex items-center gap-2 ${
                isDark
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                  : 'bg-amber-500/15 border-amber-600/60 text-amber-900 hover:bg-amber-500/25'
              }`}
            >
              <SearchCode className="w-4 h-4" />
              <span>Inspeccionar Extensiones NTS (S3.7)</span>
            </button>
          </div>

          {/* MITAD SUPERIOR: Topología Servidor -> Atacante MitM -> Cliente y Handshake NTS-KE */}
          <div className="my-2 space-y-3">
            {/* Canal superior: Handshake NTS-KE sobre TCP 4460 con TLS (Requisito S3.3) */}
            <div
              className={`px-4 py-2 rounded-xl border flex items-center justify-between transition-all ${
                ntsEnabled
                  ? isDark
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                    : 'bg-emerald-500/15 border-emerald-600/60 text-emerald-950'
                  : isDark
                  ? 'opacity-40 border-slate-800 bg-slate-900/40'
                  : 'opacity-65 border-slate-300 bg-slate-100 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-mono font-bold">
                <KeyRound className={`w-4 h-4 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} />
                <span>
                  {ntsEnabled
                    ? 'Fase 1 Activa · Handshake NTS-KE (TLS 1.3 sobre TCP Puerto 4460 → Claves AEAD + Cookies entregadas)'
                    : 'Fase 1 Inactiva · Sin negociación NTS-KE (Tráfico vulnerable a alteración MitM)'}
                </span>
              </div>
              <span
                className={`font-mono text-sm px-2.5 py-0.5 rounded ${
                  isDark ? 'bg-black/30 text-slate-200' : 'bg-slate-900/10 text-slate-900 font-semibold'
                }`}
              >
                {ntsEnabled ? 'TLS 4460 OK' : 'DESACTIVADO'}
              </span>
            </div>

            {/* Tres Nodos en Red Local */}
            <div className="grid grid-cols-12 items-center gap-2 pt-2">
              <div className="col-span-3">
                <NetworkNode
                  kind="server"
                  badgeText="Servidor Legítimo"
                  title="Servidor NTP"
                  subtitle="UDP 123 / TCP 4460"
                  clockText="3 nov 2026 07:30"
                  statusColor="sky"
                />
              </div>

              {/* Cable Izquierdo: Servidor -> Atacante */}
              <div className="col-span-2 flex flex-col items-center">
                <span className="font-mono text-sm text-sky-400 mb-1">07:30:00 UTC</span>
                <div className="w-full h-2 bg-sky-500/50 rounded-full" />
              </div>

              {/* Nodo Central: Atacante Man-in-the-Middle */}
              <div className="col-span-2">
                <NetworkNode
                  kind="attacker"
                  badgeText="Nodo MitM"
                  title="Atacante en Red"
                  subtitle={isAttack ? `Inyecta ${currentVector.label}` : 'Pasivo (0 s)'}
                  statusColor={isAttack ? 'rose' : 'amber'}
                />
              </div>

              {/* Cable Derecho: Atacante -> Cliente Víctima */}
              <div className="col-span-2 flex flex-col items-center">
                <span
                  className={`font-mono text-sm font-bold mb-1 ${
                    isAttack ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {isAttack ? currentVector.label : 'Intacto'}
                </span>
                <div
                  className={`w-full h-2 rounded-full ${
                    sealBroken ? 'bg-rose-500/60' : isAttack ? 'bg-amber-500/60' : 'bg-emerald-500/60'
                  }`}
                />
              </div>

              {/* Cliente Víctima */}
              <div className="col-span-3">
                <NetworkNode
                  kind="client"
                  badgeText={
                    evalResult.packetDropped
                      ? 'Paquete Descartado (DROP)'
                      : evalResult.failedCount > 0
                      ? 'Reloj Contaminado'
                      : 'Reloj Confiable'
                  }
                  title="Cliente Víctima"
                  subtitle={
                    evalResult.packetDropped
                      ? 'MAC AEAD inválido → Rechazado'
                      : `Aceptó: ${evalResult.acceptedDateStr}`
                  }
                  clockText={evalResult.acceptedDateStr.replace(' UTC', '')}
                  statusColor={evalResult.failedCount > 0 ? 'rose' : 'emerald'}
                />
              </div>
            </div>

            {/* Riel de Animación del Paquete con Candado y Sello Roto como Elementos Gráficos (Requisito S3.8) */}
            <div className="relative h-14 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center px-6">
              <div
                style={{ left: `${10 + packetProgress * 78}%` }}
                onClick={() =>
                  setInspectedPacketId(ntsEnabled ? (isAttack ? 'nts-tampered' : 'nts-valid') : 'trama-108')
                }
                className={`absolute -translate-x-1/2 px-3.5 py-1.5 rounded-xl border-2 font-mono text-sm font-bold flex items-center gap-2 cursor-pointer shadow-xl transition-colors ${
                  sealBroken
                    ? 'bg-rose-950 border-rose-500 text-rose-200'
                    : ntsEnabled
                    ? 'bg-emerald-950 border-emerald-400 text-emerald-200'
                    : isAttack && passedMitm
                    ? 'bg-amber-950 border-amber-400 text-amber-200'
                    : 'bg-sky-950 border-sky-400 text-sky-200'
                }`}
              >
                {/* Candado cerrado o Sello Roto SVG gráfico (Requisito S3.8) */}
                {ntsEnabled && !sealBroken && <Lock className="w-4 h-4 text-emerald-400 shrink-0" />}
                {sealBroken && (
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-rose-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                    <rect x="3" y="11" width="18" height="10" rx="2" />
                    <path d="M12 11l-2 4 4 2-2 4" stroke="#f43f5e" strokeWidth="2.5" />
                  </svg>
                )}

                <span>
                  {sealBroken
                    ? 'SELLO AEAD ROTO → DROP'
                    : passedMitm
                    ? currentVector.displayAcceptedDate
                    : '3 nov 2026 07:30:00 UTC'}
                </span>
              </div>
            </div>
          </div>

          {/* MITAD INFERIOR: Regla de Desfase en Escala Logarítmica y Selector de 5 Vectores (Requisitos S3.1 y S3.6) */}
          <div
            className={`p-4 rounded-xl border space-y-3 ${
              isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-50 border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono font-bold uppercase text-sky-400">
                Regla de Desfase Temporal (Escala Logarítmica de Umbrales Críticos)
              </span>
              <span className="text-sm font-mono opacity-80">
                Seleccione un vector para inyectar en el canal UDP 123
              </span>
            </div>

            {/* Barra de umbrales logarítmica con cursor */}
            <div className="relative pt-6 pb-2 px-4">
              <div className="h-3 w-full rounded-full bg-gradient-to-r from-rose-500 via-emerald-500 to-rose-500 opacity-80" />

              {/* Marcas de umbral */}
              <div className="flex justify-between text-sm font-mono mt-2 opacity-90">
                <span>-5 años (TLS X.509)</span>
                <span>0 s (Hora Real)</span>
                <span>±30 s (TOTP)</span>
                <span>±5 min (Kerberos/CAE)</span>
                <span>+6 meses (DNSSEC)</span>
              </div>

              {/* Cursor activo */}
              <div
                style={{ left: `${rulerCursorPercent[vectorKey]}%` }}
                className="absolute top-0 -translate-x-1/2 px-2.5 py-0.5 rounded bg-white text-slate-950 font-mono font-extrabold text-sm shadow-lg border border-sky-500 transition-all"
              >
                ▼ {currentVector.label}
              </div>
            </div>

            {/* Botonera de los 5 vectores obligatorios (Requisito S3.1) */}
            <div className="grid grid-cols-5 gap-2">
              {(Object.keys(SPOOF_VECTORS) as SpoofVectorKey[]).map((k) => {
                const v = SPOOF_VECTORS[k];
                const selected = vectorKey === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setVectorKey(k)}
                    className={`py-2 px-2.5 rounded-xl font-mono text-sm font-semibold border transition-all ${
                      selected
                        ? 'bg-sky-500 text-slate-950 font-bold border-sky-400 shadow'
                        : isDark
                        ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA (30% -> 4 columnas): Cinco Semáforos de Servicios + Lista de Eventos */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-3 min-h-0">
          {/* Cinco Semáforos con ✓ o ✗ y motivo en una línea solo cuando fallan (Requisito S3.5) */}
          <div
            className={`p-4 rounded-2xl border space-y-2.5 shrink-0 ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-700/50 pb-2">
              <h3 className="font-bold text-base">Estado de Servicios Dependientes</h3>
              <span
                className={`px-2.5 py-0.5 rounded-full font-mono text-sm font-bold border ${
                  evalResult.failedCount === 0
                    ? isDark
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-emerald-500/15 text-emerald-900 border-emerald-600/50'
                    : isDark
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : 'bg-rose-500/15 text-rose-900 border-rose-600/50'
                }`}
              >
                {evalResult.failedCount === 0
                  ? '5 / 5 Operativos'
                  : `${evalResult.failedCount} de 5 Colapsados`}
              </span>
            </div>

            <div className="space-y-2">
              {evalResult.services.map((srv) => (
                <div
                  key={srv.id}
                  className={`p-2.5 rounded-xl border transition-all ${
                    srv.failed
                      ? isDark
                        ? 'bg-rose-500/15 border-rose-500/50 text-rose-200'
                        : 'bg-rose-500/15 border-rose-600/60 text-rose-950'
                      : isDark
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                      : 'bg-emerald-50 border-emerald-400 text-emerald-950'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {srv.failed ? (
                        <XCircle className={`w-5 h-5 shrink-0 ${isDark ? 'text-rose-400' : 'text-rose-700'}`} />
                      ) : (
                        <CheckCircle2 className={`w-5 h-5 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} />
                      )}
                      <span className="font-bold text-sm truncate">{srv.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {srv.failed && srv.isPrimaryTarget && (
                        <span className="px-2 py-0.5 rounded bg-rose-500 text-slate-950 font-mono font-bold text-sm">
                          Impacto Primario
                        </span>
                      )}
                      <span
                        className={`font-mono text-sm px-2 py-0.5 rounded ${
                          isDark ? 'bg-black/25 text-slate-200' : 'bg-slate-900/10 text-slate-900 font-semibold'
                        }`}
                      >
                        {srv.thresholdLabel}
                      </span>
                    </div>
                  </div>

                  {/* Requisito S3.5: mostrar el motivo en una línea solo cuando fallan */}
                  {srv.failed && (
                    <div
                      className={`text-sm font-medium mt-1 pl-7 ${
                        isDark ? 'text-rose-300' : 'text-rose-900 font-semibold'
                      }`}
                    >
                      {srv.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Lista de Eventos Siempre Visible (Requisito G4) */}
          <div className="flex-1 min-h-0">
            <EventList
              events={events}
              currentEventIndex={currentEventIndex}
              onSelectEvent={(id) => sim.seekToEvent(id)}
              onInspectPacket={(pktId) => setInspectedPacketId(pktId)}
              theme={theme}
            />
          </div>
        </div>
      </div>

      {/* Barra de Transporte Común (Requisitos G3 y G8) */}
      <TransportBar
        t={t}
        duration={duration}
        playing={playing}
        speed={speed}
        onTogglePlay={() => sim.togglePlay()}
        onPrevStep={() => sim.prevStep()}
        onNextStep={() => sim.nextStep()}
        onReset={() => {
          setNtsEnabled(false);
          setVectorKey('minus5y');
          sim.reset();
        }}
        onSeek={(newT) => sim.seek(newT)}
        onChangeSpeed={(s) => sim.setSpeed(s)}
        presets={[
          { id: 'plus45s-plain', label: '+45 s sin NTS (Falla TOTP)' },
          { id: 'plus10m-plain', label: '+10 min sin NTS (3 caídos)' },
          { id: 'minus5y-plain', label: '-5 años sin NTS (Caída total)' },
          { id: 'minus5y-nts', label: 'Activar NTS (5 en verde)' },
        ]}
        activePreset={`${vectorKey}-${ntsEnabled ? 'nts' : 'plain'}`}
        onSelectPreset={(presetId) => {
          if (presetId === 'plus45s-plain') {
            setVectorKey('plus45s');
            setNtsEnabled(false);
          } else if (presetId === 'plus10m-plain') {
            setVectorKey('plus10m');
            setNtsEnabled(false);
          } else if (presetId === 'minus5y-plain') {
            setVectorKey('minus5y');
            setNtsEnabled(false);
          } else if (presetId === 'minus5y-nts') {
            setVectorKey('minus5y');
            setNtsEnabled(true);
          }
        }}
        theme={theme}
      />

      {/* Inspector de Paquetes con los 4 Campos de Extensión NTS (Requisito S3.7) */}
      <PacketInspector
        packet={inspectedPacket}
        onClose={() => setInspectedPacketId(null)}
        onSwitchPacket={(id) => setInspectedPacketId(id)}
        availablePackets={[
          { id: 'trama-108', label: 'UDP 123 Sin Autenticar' },
          { id: 'nts-valid', label: 'NTP + 4 Extensiones NTS (Válido)' },
          { id: 'nts-tampered', label: 'NTP + NTS Alterado (MAC Roto)' },
        ]}
        theme={theme}
      />
    </div>
  );
};

