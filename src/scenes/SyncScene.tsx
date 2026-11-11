import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Layers,
  SearchCode,
  Sparkles,
  X,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { ThemeMode } from '../types/lab';
import { Sim } from '../sim/engine';
import { useSim } from '../hooks/useSim';
import { broadcastPresenterState } from '../sim/broadcast';
import {
  calculateNtpSync,
  buildSyncEvents,
  SYNC_PRESETS,
  SyncParams,
  SyncPresetKey,
} from '../sim/ntp';
import { buildTrama107Request, buildTrama108Response } from '../sim/packets';
import { NarratorBar } from '../components/NarratorBar';
import { TransportBar } from '../components/TransportBar';
import { EventList } from '../components/EventList';
import { PacketInspector } from '../components/PacketInspector';
import { NetworkNode } from '../components/NetworkNode';

interface SyncSceneProps {
  theme: ThemeMode;
  presentationMode: boolean;
}

const STRATUM_LADDER = [
  {
    level: 'Estrato 0',
    title: 'Relojes de Referencia Primaria (Hardware)',
    desc: 'Relojes atómicos de cesio/rubidio y receptores satelitales GPS. No atienden red IP; se conectan por pulso PPS a servidores Estrato 1.',
    badge: 'Precisión sub-microsegundo',
  },
  {
    level: 'Estrato 1',
    title: 'Servidores Primarios de Tiempo',
    desc: 'Servidores de red directamente acoplados a un dispositivo Estrato 0 (Ref ID: GPS, PPS, ATOM). Máxima autoridad en red IP.',
    badge: 'Ref ID ASCII (4 bytes)',
  },
  {
    level: 'Estrato 2',
    title: 'Servidores Secundarios (Pool / Datacenters)',
    desc: 'Consultan a múltiples servidores Estrato 1 y aplican el algoritmo de intersección de Marzullo para descartar falsetickers.',
    badge: 'Redundancia y filtrado',
  },
  {
    level: 'Estrato 3 al 15',
    title: 'Jerarquía Corporativa y Clientes Finales',
    desc: 'Controladores de dominio, routers de borde, estaciones de trabajo y nodos IoT. Cada salto incrementa el estrato en n + 1.',
    badge: 'Escala WAN / LAN',
  },
  {
    level: 'Estrato 16',
    title: 'Estado Desincronizado (Alarma LI = 11)',
    desc: 'Indica que el reloj local perdió referencia válida o superó los umbrales de dispersión; ningún cliente acepta su hora.',
    badge: 'Inaceptable para la red',
  },
];

function formatLiveClock(baseHour: number, baseMin: number, baseSec: number, msOffset: number): string {
  const totalMs = (baseHour * 3600 + baseMin * 60 + baseSec) * 1000 + msOffset;
  const hh = Math.floor(totalMs / 3600000) % 24;
  const mm = Math.floor((totalMs % 3600000) / 60000);
  const ss = Math.floor((totalMs % 60000) / 1000);
  const mmm = Math.floor(((totalMs % 1000) + 1000) % 1000);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(mmm).padStart(3, '0')}`;
}

export const SyncScene: React.FC<SyncSceneProps> = ({ theme, presentationMode: _presentationMode }) => {
  const [activePreset, setActivePreset] = useState<SyncPresetKey | 'custom'>('symmetric');
  const [params, setParams] = useState<SyncParams>(SYNC_PRESETS.symmetric.params);
  const [clockCorrected, setClockCorrected] = useState(false);
  const [disciplineMode, setDisciplineMode] = useState<'step' | 'slew'>('slew');
  const [slewProgress, setSlewProgress] = useState(1);
  const [slewAnimating, setSlewAnimating] = useState(false);
  const [cablePopoverOpen, setCablePopoverOpen] = useState(false);
  const [stratumModalOpen, setStratumModalOpen] = useState(false);
  const [inspectedPacketId, setInspectedPacketId] = useState<string | null>(null);

  const slewRafRef = useRef<number | null>(null);
  const simRef = useRef<Sim>(new Sim(2.5, buildSyncEvents(SYNC_PRESETS.symmetric.params)));
  const sim = simRef.current;
  const { t, duration, playing, speed, events, currentEventIndex, currentEvent } = useSim(sim);

  const metrics = useMemo(() => calculateNtpSync(params), [params]);
  const isAsymmetric = Math.abs(params.delayIdaMs - params.delayVueltaMs) > 0.01;
  const isDark = theme === 'dark';

  // Limpieza de animación PLL al desmontar
  useEffect(() => {
    return () => {
      if (slewRafRef.current !== null) {
        cancelAnimationFrame(slewRafRef.current);
      }
    };
  }, []);

  // Cierre de modal de estratos y popover de cable con Escape (Mejora #4)
  useEffect(() => {
    if (!stratumModalOpen && !cablePopoverOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (stratumModalOpen) setStratumModalOpen(false);
        else if (cablePopoverOpen) setCablePopoverOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [stratumModalOpen, cablePopoverOpen]);

  // Recalcular eventos cuando cambian parámetros del cable
  useEffect(() => {
    sim.setConfig(2.5, buildSyncEvents(params));
    setClockCorrected(false);
    setSlewAnimating(false);
    setSlewProgress(1);
  }, [params, sim]);


  // Atajos de teclado locales de transporte: Espacio, Flecha Izquierda y Derecha
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

  // Emisión hacia la Ventana de Presentador (Requisito G14)
  useEffect(() => {
    broadcastPresenterState({
      scene: 'sync',
      t,
      duration,
      playing,
      speed,
      stepIndex: currentEventIndex,
      totalSteps: events.length,
      narration: currentEvent?.narration || '',
      activePreset,
    });
  }, [t, duration, playing, speed, currentEventIndex, events.length, currentEvent, activePreset]);

  const handleSelectPreset = (presetId: string) => {
    const key = presetId as SyncPresetKey;
    if (SYNC_PRESETS[key]) {
      setActivePreset(key);
      setParams({ ...SYNC_PRESETS[key].params });
      setCablePopoverOpen(false);
    }
  };

  // Ajuste real del reloj según disciplina Slew (PLL progresivo ~800 ms) vs Step (salto instantáneo) (Bug #4)
  const handleApplyClockCorrection = () => {
    if (slewRafRef.current !== null) {
      cancelAnimationFrame(slewRafRef.current);
      slewRafRef.current = null;
    }
    sim.seek(2.5);
    setClockCorrected(true);

    if (disciplineMode === 'step') {
      setSlewAnimating(false);
      setSlewProgress(1);
      return;
    }

    setSlewAnimating(true);
    setSlewProgress(0);
    const startTime = performance.now();
    const durationMs = 800;

    const tickSlew = (now: number) => {
      const p = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setSlewProgress(eased);
      if (p < 1) {
        slewRafRef.current = requestAnimationFrame(tickSlew);
      } else {
        setSlewProgress(1);
        setSlewAnimating(false);
        slewRafRef.current = null;
      }
    };
    slewRafRef.current = requestAnimationFrame(tickSlew);
  };

  // Estado temporal de fases en función de sim.t (0.0 a 2.5 s)
  const hasT1 = t >= 0.2;
  const hasT2 = t >= 1.0;
  const hasT3 = t >= 1.3;
  const hasT4 = t >= 2.1;

  // Progreso del paquete de ida (0.2s a 1.0s) y de vuelta (1.3s a 2.1s)
  const requestProgress = t >= 0.2 && t <= 1.0 ? (t - 0.2) / 0.8 : t > 1.0 ? 1 : 0;
  const responseProgress = t >= 1.3 && t <= 2.1 ? (t - 1.3) / 0.8 : t > 2.1 ? 1 : 0;
  const packetInFlight = (t >= 0.2 && t <= 1.0) || (t >= 1.3 && t <= 2.1);
  const isReturning = t >= 1.3;

  // Relojes digitales en vivo (Requisito S1.1): avanzan con sim.t y muestran hh:mm:ss.mmm
  const elapsedVirtualMs = t * 100;
  const serverClockStr = formatLiveClock(23, 45, 10, elapsedVirtualMs);

  // Si el usuario aplicó "Corregir reloj" (o llegó al paso final t >= 2.45s), se compensa thetaMs
  const isCorrectedNow = clockCorrected || t >= 2.45;
  const effectiveFactor = clockCorrected ? slewProgress : 1;
  const appliedCorrectionMs = isCorrectedNow ? metrics.thetaMs * effectiveFactor : 0;
  const clientOffsetNowMs = -params.clientInitialOffsetMs + appliedCorrectionMs;
  const clientClockStr = formatLiveClock(23, 45, 10, elapsedVirtualMs + clientOffsetNowMs);


  // Paquete activo para el Inspector Hexadecimal (Requisito G5 / S1.6)
  const inspectedPacket = useMemo(() => {
    if (inspectedPacketId === 'trama-107') return buildTrama107Request();
    if (inspectedPacketId === 'trama-108') return buildTrama108Response();
    return null;
  }, [inspectedPacketId]);

  const narrationText =
    isCorrectedNow && isAsymmetric
      ? `Reloj corregido: la asimetría deja un error residual de ${metrics.residualMagnitudeMs} ms.`
      : isCorrectedNow && !isAsymmetric
      ? 'Reloj corregido en enlace simétrico: el error residual es 0 ms.'
      : currentEvent?.narration || 'Inicie el intercambio para medir las cuatro marcas temporales.';

  return (
    <div className="flex-1 flex flex-col min-h-0 scene-transition">
      {/* Narrador Superior (Principio 1 y Requisito G6) */}
      <NarratorBar
        sceneTitle="Escena 1 · Sincronización"
        keyMessage="Cuatro marcas bastan para estimar desfase y demora, pero la asimetría deja un error irreducible."
        stepIndex={currentEventIndex}
        totalSteps={events.length}
        narration={narrationText}
        detailTitle="Fundamentos Matemáticos RFC 5905, Era 2036 y Disciplina del Reloj"
        theme={theme}
        detailContent={
          <div className="space-y-4 text-base">
            <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/30">
              <h4 className="font-bold text-lg text-sky-400">1. Marca de Tiempo de 64 bits y Umbral 2036</h4>
              <p className="mt-1">
                A diferencia de UNIX, NTP utiliza un formato de <strong>64 bits</strong> compuesto por 32 bits de
                segundos enteros desde el 1 de enero de 1900 y 32 bits de fracción de segundo (resolución teórica de
                picosegundos). El contador de 32 bits se desbordará el <strong>7 de febrero de 2036</strong> (Era 1), lo
                cual se resuelve mediante aritmética modular asumiendo una ventana móvil de <strong>±68 años</strong>.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <h4 className="font-bold text-lg text-emerald-400">
                2. Algoritmo de Marzullo y Disciplina PLL (Slew vs Step)
              </h4>
              <p className="mt-1">
                NTPv4 descarta servidores engañosos (<em>falsetickers</em>) cruzando intervalos de confianza para aislar
                a los <em>truechimers</em>. Una vez calculado el desfase <strong>θ</strong>, el demonio evita saltos
                abruptos (<em>step</em>) y ajusta gradualmente la frecuencia del reloj del kernel mediante un Bucle de
                Fase Bloqueada (<strong>PLL / slew</strong>) para no corromper bases de datos ni transacciones.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <h4 className="font-bold text-lg text-amber-400">3. Invarianza del Sesgo por Ruta Asimétrica</h4>
              <p className="mt-1">
                La ecuación de desfase asume que el retardo de ida y el de vuelta son iguales a <strong>δ / 2</strong>.
                Si las rutas físicas difieren, queda un sesgo sistemático igual a{' '}
                <strong>(ida − vuelta) / 2</strong> imposible de detectar sin referencias externas como GPS/PTP.
              </p>
            </div>
          </div>
        }
      />

      {/* Cuerpo Principal 70% Lienzo Combinado / 30% Métricas + Eventos */}
      <div className="flex-1 grid grid-cols-12 gap-4 p-4 min-h-0 overflow-hidden">
        {/* LIENZO INTERACTIVO (70% -> 8 columnas): Topología + Diagrama de Secuencia en Simultáneo (S1.4) */}
        <div
          className={`col-span-12 lg:col-span-8 rounded-2xl border p-5 flex flex-col justify-between relative min-h-0 ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-300 shadow-sm'
          }`}
        >
          {/* Barra superior de acciones rápidas sobre el lienzo */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-700/50">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCablePopoverOpen((o) => !o)}
                className={`px-3.5 py-1.5 rounded-lg border text-sm font-semibold flex items-center gap-2 ${
                  isDark
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-300 hover:bg-sky-500/30'
                    : 'bg-sky-500/15 border-sky-600/60 text-sky-900 hover:bg-sky-500/25'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>
                  Cable: Ida {params.delayIdaMs} ms · Vuelta {params.delayVueltaMs} ms · Proc {params.serverProcMs} ms
                </span>
              </button>

              <button
                type="button"
                onClick={() => setInspectedPacketId(isReturning ? 'trama-108' : 'trama-107')}
                className={`px-3.5 py-1.5 rounded-lg border text-sm font-semibold flex items-center gap-2 ${
                  isDark
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                    : 'bg-amber-500/15 border-amber-600/60 text-amber-900 hover:bg-amber-500/25'
                }`}
              >
                <SearchCode className="w-4 h-4" />
                <span>Inspeccionar Trama 107 / 108 (90 B)</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setStratumModalOpen(true)}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium flex items-center gap-1.5 ${
                isDark
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
              }`}
            >
              <Layers className="w-4 h-4 text-sky-500" />
              <span>Escalera de Estratos (0–16)</span>
            </button>
          </div>

          {/* Popover de Edición del Cable en el Lienzo (Sección 4 y 9 del PDF) */}
          {cablePopoverOpen && (
            <div
              className={`absolute top-16 left-5 z-30 w-96 p-4 rounded-2xl border shadow-2xl space-y-3 ${
                isDark ? 'bg-slate-950 border-sky-500/60 text-slate-100' : 'bg-white border-sky-600 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                <span className={`font-bold text-base ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                  Propiedades del Enlace y Reloj
                </span>
                <button
                  type="button"
                  onClick={() => setCablePopoverOpen(false)}
                  className={`p-1 rounded ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-800'}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-sm">
                <label className="block">
                  <div className="flex justify-between font-mono">
                    <span>Demora de ida (ms):</span>
                    <span className={`font-bold ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>{params.delayIdaMs} ms</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={250}
                    step={5}
                    value={params.delayIdaMs}
                    onChange={(e) => {
                      setActivePreset('custom');
                      setParams({ ...params, delayIdaMs: Number(e.target.value) });
                    }}
                    className="w-full accent-sky-500"
                  />
                </label>

                <label className="block">
                  <div className="flex justify-between font-mono">
                    <span>Demora de vuelta (ms):</span>
                    <span className={`font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                      {params.delayVueltaMs} ms
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={250}
                    step={5}
                    value={params.delayVueltaMs}
                    onChange={(e) => {
                      setActivePreset('custom');
                      setParams({ ...params, delayVueltaMs: Number(e.target.value) });
                    }}
                    className="w-full accent-amber-500"
                  />
                </label>

                <label className="block">
                  <div className="flex justify-between font-mono">
                    <span>Procesamiento del servidor (ms):</span>
                    <span className={`font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                      {params.serverProcMs} ms
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    step={1}
                    value={params.serverProcMs}
                    onChange={(e) => {
                      setActivePreset('custom');
                      setParams({ ...params, serverProcMs: Number(e.target.value) });
                    }}
                    className="w-full accent-emerald-500"
                  />
                </label>

                <label className="block">
                  <div className="flex justify-between font-mono">
                    <span>Atraso inicial del cliente (ms):</span>
                    <span className={`font-bold ${isDark ? 'text-rose-400' : 'text-rose-700'}`}>
                      {params.clientInitialOffsetMs} ms
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-200}
                    max={200}
                    step={10}
                    value={params.clientInitialOffsetMs}
                    onChange={(e) => {
                      setActivePreset('custom');
                      setParams({ ...params, clientInitialOffsetMs: Number(e.target.value) });
                    }}
                    className="w-full accent-rose-500"
                  />
                </label>
              </div>
            </div>
          )}

          {/* MITAD SUPERIOR: Topología Física con Relojes en Vivo y Banderas T1..T4 (Requisitos S1.1 y S1.3) */}
          <div className="my-2">
            <div className="grid grid-cols-12 items-center gap-2">
              {/* GPS Estrato 0 */}
              <div className="col-span-3">
                <NetworkNode
                  kind="gps"
                  badgeText="Estrato 0 · Referencia"
                  title="Satélite GPS / Atómico"
                  subtitle="Pulso PPS (1 µs)"
                  clockText={serverClockStr}
                  statusColor="amber"
                />
              </div>

              {/* Enlace PPS corto entre GPS y Servidor */}
              <div className="col-span-1 flex flex-col items-center">
                <span className="font-mono text-sm text-amber-400 font-semibold">PPS</span>
                <div className="w-full h-1 bg-amber-500/50 rounded my-1" />
                <span className="font-mono text-sm opacity-75">0 ms</span>
              </div>

              {/* Servidor Estrato 1 */}
              <div className="col-span-3">
                <NetworkNode
                  kind="server"
                  badgeText="Estrato 1 · Primario"
                  title="Servidor NTP (UDP 123)"
                  subtitle="Ref ID: GPS"
                  clockText={serverClockStr}
                  statusColor="sky"
                />
              </div>

              {/* Cable Interactivo entre Servidor y Cliente con Paquete de 48 B en vuelo */}
              <div className="col-span-2 flex flex-col items-center relative py-4">
                <button
                  type="button"
                  onClick={() => setCablePopoverOpen((o) => !o)}
                  className="text-sm font-mono px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-sky-300 hover:border-sky-400 mb-2"
                >
                  Ida {params.delayIdaMs}ms / Vuelta {params.delayVueltaMs}ms
                </button>

                <div
                  onClick={() => setCablePopoverOpen((o) => !o)}
                  className="w-full h-2.5 bg-slate-700 rounded-full relative cursor-pointer"
                >
                  {packetInFlight && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInspectedPacketId(isReturning ? 'trama-108' : 'trama-107');
                      }}
                      style={{
                        left: `${
                          isReturning
                            ? requestProgress * 0 + responseProgress * 100
                            : (1 - requestProgress) * 100
                        }%`,
                      }}
                      className="absolute -top-4 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-mono font-bold text-sm shadow-lg flex items-center gap-1 hover:scale-110 transition-transform"
                      title="Clic para abrir el Inspector de Paquete (90 B)"
                    >
                      {isReturning ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                      <span>48B</span>
                    </button>
                  )}
                </div>

                {/* Banderas T1, T2, T3, T4 en el instante exacto (Requisito S1.3) */}
                <div className="grid grid-cols-2 gap-1.5 w-full mt-3 font-mono text-sm">
                  <div
                    className={`px-2 py-1 rounded border text-center ${
                      hasT2
                        ? isDark
                          ? 'bg-sky-500/20 border-sky-400 text-sky-300 font-bold'
                          : 'bg-sky-500/15 border-sky-600 text-sky-900 font-bold'
                        : 'opacity-30 border-slate-700'
                    }`}
                  >
                    T2: {metrics.t2Ms}ms
                  </div>
                  <div
                    className={`px-2 py-1 rounded border text-center ${
                      hasT1
                        ? isDark
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                          : 'bg-emerald-500/15 border-emerald-600 text-emerald-900 font-bold'
                        : 'opacity-30 border-slate-700'
                    }`}
                  >
                    T1: {metrics.t1Ms}ms
                  </div>
                  <div
                    className={`px-2 py-1 rounded border text-center ${
                      hasT3
                        ? isDark
                          ? 'bg-sky-500/20 border-sky-400 text-sky-300 font-bold'
                          : 'bg-sky-500/15 border-sky-600 text-sky-900 font-bold'
                        : 'opacity-30 border-slate-700'
                    }`}
                  >
                    T3: {metrics.t3Ms}ms
                  </div>
                  <div
                    className={`px-2 py-1 rounded border text-center ${
                      hasT4
                        ? isDark
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                          : 'bg-emerald-500/15 border-emerald-600 text-emerald-900 font-bold'
                        : 'opacity-30 border-slate-700'
                    }`}
                  >
                    T4: {metrics.t4Ms}ms
                  </div>
                </div>
              </div>

              {/* Cliente NTP Estrato 2 */}
              <div className="col-span-3">
                <NetworkNode
                  kind="client"
                  badgeText={isCorrectedNow ? 'Estrato 2 · Sincronizado' : 'Estrato 2 · Cliente'}
                  title="Cliente NTP"
                  subtitle={
                    isCorrectedNow
                      ? `Error residual: ${metrics.residualMagnitudeMs} ms`
                      : `Desfase inicial: -${params.clientInitialOffsetMs} ms`
                  }
                  clockText={clientClockStr}
                  statusColor={isCorrectedNow ? (isAsymmetric ? 'amber' : 'emerald') : 'rose'}
                />
              </div>
            </div>
          </div>

          {/* MITAD INFERIOR: Diagrama de Secuencia Sincronizado (Requisito Obligatorio S1.4) */}
          <div
            className={`p-4 rounded-xl border ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-mono font-bold uppercase text-sky-400">
                Diagrama de Secuencia Temporal (T1 → T2 → T3 → T4)
              </span>
              <span className="text-sm font-mono opacity-80">
                Clic en la flecha de petición o respuesta para abrir el Inspector (90 B)
              </span>
            </div>

            <svg viewBox="0 0 800 175" className="w-full h-40 select-none">
              {/* Línea horizontal de tiempo del Cliente (Arriba) y del Servidor (Abajo) */}
              <line x1="90" y1="38" x2="750" y2="38" stroke="#10b981" strokeWidth="2.5" strokeDasharray="5 5" />
              <text x="15" y="43" fill="#10b981" fontSize="14" fontWeight="bold" fontFamily="IBM Plex Mono">
                Cliente
              </text>

              <line x1="90" y1="142" x2="750" y2="142" stroke="#38bdf8" strokeWidth="2.5" strokeDasharray="5 5" />
              <text x="15" y="147" fill="#38bdf8" fontSize="14" fontWeight="bold" fontFamily="IBM Plex Mono">
                Servidor
              </text>

              {/* Flecha 1: Petición Cliente -> Servidor (T1 a T2) */}
              {hasT1 && (
                <g
                  className="cursor-pointer"
                  onClick={() => setInspectedPacketId('trama-107')}
                >
                  <line
                    x1="150"
                    y1="38"
                    x2={150 + 190 * requestProgress}
                    y2={38 + 104 * requestProgress}
                    stroke="#f59e0b"
                    strokeWidth="3.5"
                  />
                  <circle cx="150" cy="38" r="6" fill="#10b981" />
                  <text x="115" y="25" fill="#10b981" fontSize="14" fontWeight="bold" fontFamily="IBM Plex Mono">
                    T1 = {metrics.t1Ms} ms
                  </text>
                  <text x="235" y="82" fill="#f59e0b" fontSize="14" fontWeight="bold" fontFamily="IBM Plex Mono">
                    Trama 107 ({params.delayIdaMs} ms)
                  </text>
                </g>
              )}

              {/* Marca T2 y Procesamiento del Servidor (T2 a T3) */}
              {hasT2 && (
                <g>
                  <circle cx="340" cy="142" r="6" fill="#38bdf8" />
                  <text x="275" y="166" fill="#38bdf8" fontSize="14" fontWeight="bold" fontFamily="IBM Plex Mono">
                    T2 = {metrics.t2Ms} ms
                  </text>
                  <line
                    x1="340"
                    y1="142"
                    x2={t >= 1.3 ? 440 : 340 + 100 * Math.max(0, (t - 1.0) / 0.3)}
                    y2="142"
                    stroke="#38bdf8"
                    strokeWidth="5"
                  />
                </g>
              )}

              {/* Flecha 2: Respuesta Servidor -> Cliente (T3 a T4) */}
              {hasT3 && (
                <g
                  className="cursor-pointer"
                  onClick={() => setInspectedPacketId('trama-108')}
                >
                  <circle cx="440" cy="142" r="6" fill="#38bdf8" />
                  <text x="425" y="166" fill="#38bdf8" fontSize="14" fontWeight="bold" fontFamily="IBM Plex Mono">
                    T3 = {metrics.t3Ms} ms
                  </text>
                  <line
                    x1="440"
                    y1="142"
                    x2={440 + 210 * responseProgress}
                    y2={142 - 104 * responseProgress}
                    stroke="#38bdf8"
                    strokeWidth="3.5"
                  />
                  <text x="545" y="96" fill="#38bdf8" fontSize="14" fontWeight="bold" fontFamily="IBM Plex Mono">
                    Trama 108 ({params.delayVueltaMs} ms)
                  </text>
                </g>
              )}

              {/* Marca T4 final en el Cliente */}
              {hasT4 && (
                <g>
                  <circle cx="650" cy="38" r="6" fill="#10b981" />
                  <text x="580" y="25" fill="#10b981" fontSize="14" fontWeight="bold" fontFamily="IBM Plex Mono">
                    T4 = {metrics.t4Ms} ms
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>

        {/* COLUMNA DERECHA (30% -> 4 columnas): Dos Medidores (θ y δ), Botón Corregir Reloj y Lista de Eventos */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-3 min-h-0">
          {/* Tarjetas de Medidores θ y δ con la fórmula escrita una sola vez (Requisito S1.2) */}
          <div
            className={`p-4 rounded-2xl border space-y-3 shrink-0 ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-300 shadow-sm'
            }`}
          >
            <div className="grid grid-cols-2 gap-3">
              {/* Medidor 1: Desfase θ */}
              <div
                className={`p-3 rounded-xl border ${
                  isDark ? 'bg-sky-500/10 border-sky-500/40' : 'bg-sky-500/15 border-sky-600/50'
                }`}
              >
                <span className={`text-sm font-semibold ${isDark ? 'text-sky-400' : 'text-sky-800'}`}>
                  Desfase estimado (θ)
                </span>
                <div className="text-2xl font-bold font-mono tabular-nums mt-1">
                  {metrics.thetaMs >= 0 ? `+${metrics.thetaMs}` : metrics.thetaMs} ms
                </div>
                <div className="text-sm font-mono opacity-80 mt-1">
                  θ = [(T2−T1)+(T3−T4)]/2
                </div>
              </div>

              {/* Medidor 2: Demora δ */}
              <div
                className={`p-3 rounded-xl border ${
                  isDark ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-emerald-500/15 border-emerald-600/50'
                }`}
              >
                <span className={`text-sm font-semibold ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
                  Demora de red (δ)
                </span>
                <div className="text-2xl font-bold font-mono tabular-nums mt-1">
                  {metrics.deltaMs} ms
                </div>
                <div className="text-sm font-mono opacity-80 mt-1">
                  δ = (T4−T1) − (T3−T2)
                </div>
              </div>
            </div>

            {/* Selector de Disciplina (Step vs Slew PLL) y Botón "Corregir reloj" (Requisito S1.5 / Bug #4) */}
            <div className="pt-2 border-t border-slate-700/50 space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">Disciplina de ajuste:</span>
                <div className="flex rounded-lg overflow-hidden border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setDisciplineMode('slew')}
                    className={`px-2.5 py-1 text-sm font-mono ${
                      disciplineMode === 'slew'
                        ? 'bg-sky-500 text-slate-950 font-bold'
                        : isDark
                        ? 'bg-slate-800 text-slate-300'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    PLL (Slew)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisciplineMode('step')}
                    className={`px-2.5 py-1 text-sm font-mono ${
                      disciplineMode === 'step'
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : isDark
                        ? 'bg-slate-800 text-slate-300'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    Salto (Step)
                  </button>
                </div>
              </div>

              {/* Indicador dinámico del modo de disciplina (Bug #4) */}
              <div
                className={`px-3 py-1.5 rounded-lg border font-mono text-xs flex items-center justify-between ${
                  disciplineMode === 'step'
                    ? isDark
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : 'bg-amber-500/15 border-amber-600/50 text-amber-900 font-semibold'
                    : isDark
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                    : 'bg-sky-500/15 border-sky-600/50 text-sky-900 font-semibold'
                }`}
              >
                <span>
                  {disciplineMode === 'step'
                    ? 'Salto abrupto: riesgo en transacciones/logs'
                    : slewAnimating
                    ? `Bucle PLL activo: convergiendo sin saltos (${Math.round(slewProgress * 100)}%)`
                    : 'Bucle PLL activo: convergiendo sin saltos'}
                </span>
                <span className="font-bold">
                  {disciplineMode === 'step' ? 'STEP' : 'SLEW (~500 ppm)'}
                </span>
              </div>

              <button
                type="button"
                onClick={handleApplyClockCorrection}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-98"
              >
                <Sparkles className="w-5 h-5" />
                <span>Corregir reloj del cliente (Aplicar θ)</span>
              </button>

              {/* Veredicto de Error Residual tras corregir el reloj: (ida - vuelta) / 2 */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  !isAsymmetric
                    ? isDark
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                      : 'bg-emerald-500/15 border-emerald-600/60 text-emerald-950'
                    : isDark
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                    : 'bg-amber-500/15 border-amber-600/60 text-amber-950'
                }`}
              >
                <div className="flex items-center gap-2">
                  {!isAsymmetric ? (
                    <CheckCircle2 className={`w-5 h-5 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} />
                  ) : (
                    <AlertTriangle className={`w-5 h-5 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-700'}`} />
                  )}
                  <div>
                    <div className="text-sm font-bold">
                      Error residual: (ida − vuelta) / 2
                    </div>
                    <div className="text-sm opacity-90">
                      {!isAsymmetric
                        ? 'Ruta simétrica: sincronización exacta.'
                        : 'Sesgo de ruta asimétrica indetectable.'}
                    </div>
                  </div>
                </div>
                <span className="font-mono tabular-nums text-xl font-extrabold">
                  {metrics.residualMagnitudeMs} ms
                </span>
              </div>
            </div>
          </div>

          {/* Lista de Eventos Estilo Packet Tracer Siempre Visible (Requisito G4) */}
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

      {/* Barra de Transporte Común y Presets (Requisitos G3 y G8) */}
      <TransportBar
        t={t}
        duration={duration}
        playing={playing}
        speed={speed}
        onTogglePlay={() => sim.togglePlay()}
        onPrevStep={() => sim.prevStep()}
        onNextStep={() => sim.nextStep()}
        onReset={() => {
          setClockCorrected(false);
          sim.reset();
        }}
        onSeek={(newT) => sim.seek(newT)}
        onChangeSpeed={(s) => sim.setSpeed(s)}
        presets={[
          { id: 'symmetric', label: 'Enlace simétrico (0 ms)' },
          { id: 'asymmetric', label: 'Enlace asimétrico (80 ms)' },
          { id: 'trama107', label: 'Trama 107 (Monografía)' },
        ]}
        activePreset={activePreset}
        onSelectPreset={handleSelectPreset}
        theme={theme}
      />

      {/* Inspector de Paquetes (Trama 107 Petición y Trama 108/100 Respuesta, Requisito S1.6) */}
      <PacketInspector
        packet={inspectedPacket}
        onClose={() => setInspectedPacketId(null)}
        onSwitchPacket={(pktId) => setInspectedPacketId(pktId)}
        availablePackets={[
          { id: 'trama-107', label: 'Trama 107 (Petición Cliente)' },
          { id: 'trama-108', label: 'Trama 108/100 (Respuesta Servidor)' },
        ]}
        theme={theme}
      />

      {/* Modal de Escalera de Estratos 0 a 16 (Requisito S1.7) */}
      {stratumModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setStratumModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-3xl rounded-2xl border p-6 shadow-2xl space-y-4 ${
              isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
              <div>
                <span className={`text-sm font-mono uppercase font-semibold ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                  Arquitectura Topológica NTP
                </span>
                <h3 className="text-2xl font-bold">Escalera Jerárquica de Estratos (0 a 16)</h3>
              </div>
              <button
                type="button"
                onClick={() => setStratumModalOpen(false)}
                className={`p-2 rounded-lg ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-800'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {STRATUM_LADDER.map((item) => (
                <div
                  key={item.level}
                  className={`p-3.5 rounded-xl border flex items-start justify-between gap-4 ${
                    item.level === 'Estrato 16'
                      ? isDark
                        ? 'bg-rose-500/10 border-rose-500/40'
                        : 'bg-rose-500/15 border-rose-600/50'
                      : isDark
                      ? 'bg-slate-800/50 border-slate-700/70'
                      : 'bg-slate-100 border-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded font-mono font-bold text-sm ${
                          isDark ? 'bg-sky-500/20 text-sky-400' : 'bg-sky-500/15 text-sky-800'
                        }`}
                      >
                        {item.level}
                      </span>
                      <span className="font-bold text-base">{item.title}</span>
                    </div>
                    <p className="text-sm opacity-90 mt-1">{item.desc}</p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded font-mono text-sm shrink-0 ${
                      isDark ? 'bg-black/30 text-slate-200' : 'bg-slate-900/10 text-slate-900 font-semibold'
                    }`}
                  >
                    {item.badge}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

