import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Terminal,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  X,
  Satellite,
} from 'lucide-react';
import { SimEvent, ThemeMode } from '../types/lab';
import { Sim } from '../sim/engine';
import { useSim } from '../hooks/useSim';
import { broadcastPresenterState } from '../sim/broadcast';
import {
  evaluateForensicTimeline,
  buildForensicTerminalOutput,
  FORENSIC_BASE_EVENTS,
  FORENSIC_PRESETS,
  ForensicDeviceId,
  ForensicPresetKey,
} from '../sim/forense';
import { buildTrama108Response } from '../sim/packets';
import { NarratorBar } from '../components/NarratorBar';
import { TransportBar } from '../components/TransportBar';
import { EventList } from '../components/EventList';
import { PacketInspector } from '../components/PacketInspector';
import { NetworkNode } from '../components/NetworkNode';

interface ForenseSceneProps {
  theme: ThemeMode;
  presentationMode: boolean;
}

const ROOM_POSITIONS: Record<ForensicDeviceId, { x: number; y: number; roomLabel: string }> = {
  camera: { x: 140, y: 95, roomLabel: '1. Hall de Entrada' },
  door: { x: 370, y: 95, roomLabel: '2. Puerta Principal' },
  tv: { x: 610, y: 95, roomLabel: '3. Sala Principal' },
  router: { x: 610, y: 215, roomLabel: '4. Escritorio / Router' },
};

function buildForenseSimEvents(verdictNarration: string): SimEvent[] {
  return [
    {
      id: 'ev-cam',
      at: 0.3,
      label: '22:14:02.105 UTC · Cámara IP detecta intruso en el hall',
      narration: '22:14:02 UTC: la cámara registra el ingreso al hall.',
    },
    {
      id: 'ev-door',
      at: 1.0,
      label: '22:14:45.330 UTC · Apertura forzada en Control de Acceso (+43,2 s)',
      narration: '43,2 segundos después se fuerza la puerta principal.',
    },
    {
      id: 'ev-tv',
      at: 1.7,
      label: '22:15:20.500 UTC · Smart TV registra actividad en la sala',
      narration: '22:15:20 UTC: actividad registrada en el Smart TV.',
    },
    {
      id: 'ev-router',
      at: 2.4,
      label: '22:16:10.012 UTC · Router Wi-Fi desconecta móvil de la víctima',
      narration: '22:16:10 UTC: el router registra la desconexión Wi-Fi.',
    },
    {
      id: 'ev-siem',
      at: 3.0,
      label: 'Correlación en SIEM y dictamen de validez probatoria',
      narration: verdictNarration,
      packetId: 'trama-108',
    },
  ];
}

export const ForenseScene: React.FC<ForenseSceneProps> = ({ theme }) => {
  const [activePreset, setActivePreset] = useState<ForensicPresetKey | 'custom'>('caso2215');
  const [drifts, setDrifts] = useState<Record<ForensicDeviceId, number>>({
    ...FORENSIC_PRESETS.caso2215.drifts,
  });
  const [selectedDevice, setSelectedDevice] = useState<ForensicDeviceId | null>(null);
  const [syncingAnimation, setSyncingAnimation] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inspectedPacketId, setInspectedPacketId] = useState<string | null>(null);

  const syncRafRef = useRef<number | null>(null);
  const evaluation = useMemo(() => evaluateForensicTimeline(drifts), [drifts]);

  const simRef = useRef<Sim>(new Sim(3.2, buildForenseSimEvents(evaluation.verdictNarration)));
  const sim = simRef.current;
  const { t, duration, playing, speed, events, currentEventIndex, currentEvent } = useSim(sim);

  const isDark = theme === 'dark';

  // Limpieza de requestAnimationFrame en handleSyncWithNtp al desmontar (Bug #3)
  useEffect(() => {
    return () => {
      if (syncRafRef.current !== null) {
        cancelAnimationFrame(syncRafRef.current);
      }
    };
  }, []);

  // Cierre de modal terminal y popover de dispositivo con Escape (Mejora #4)
  useEffect(() => {
    if (!terminalOpen && !selectedDevice) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (terminalOpen) setTerminalOpen(false);
        else if (selectedDevice) setSelectedDevice(null);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [terminalOpen, selectedDevice]);


  useEffect(() => {
    sim.setConfig(3.2, buildForenseSimEvents(evaluation.verdictNarration));
  }, [evaluation.verdictNarration, sim]);

  // Atajos de teclado locales: Espacio, Flecha Izquierda y Derecha
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
      scene: 'forense',
      t,
      duration,
      playing,
      speed,
      stepIndex: currentEventIndex,
      totalSteps: events.length,
      narration: currentEvent?.narration || evaluation.verdictNarration,
      activePreset,
    });
  }, [t, duration, playing, speed, currentEventIndex, events.length, currentEvent, evaluation.verdictNarration, activePreset]);

  const handleSelectPreset = (presetId: string) => {
    const key = presetId as ForensicPresetKey;
    if (FORENSIC_PRESETS[key]) {
      setActivePreset(key);
      setDrifts({ ...FORENSIC_PRESETS[key].drifts });
      setSelectedDevice(null);
      sim.seek(3.0);
    }
  };

  // Requisito S2.5: "Sincronizar con NTP" lanza paquetes desde el GPS y decae todas las derivas a cero
  const handleSyncWithNtp = () => {
    if (syncRafRef.current !== null) {
      cancelAnimationFrame(syncRafRef.current);
      syncRafRef.current = null;
    }
    setSyncingAnimation(true);
    setSelectedDevice(null);
    const startDrifts = { ...drifts };
    const startTime = performance.now();
    const animDuration = 950;

    const animateDecay = (now: number) => {
      const progress = Math.min(1, (now - startTime) / animDuration);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDrifts({
        camera: Math.round(startDrifts.camera * (1 - ease)),
        door: Math.round(startDrifts.door * (1 - ease)),
        tv: Math.round(startDrifts.tv * (1 - ease)),
        router: Math.round(startDrifts.router * (1 - ease)),
      });
      if (progress < 1) {
        syncRafRef.current = requestAnimationFrame(animateDecay);
      } else {
        setDrifts({ camera: 0, door: 0, tv: 0, router: 0 });
        setActivePreset('sincronizado');
        setSyncingAnimation(false);
        syncRafRef.current = null;
        sim.seek(3.0);
      }
    };
    syncRafRef.current = requestAnimationFrame(animateDecay);
  };

  // Posición interpolada del marcador del intruso en el plano CAD según sim.t (Requisito S2.7)
  const markerPos = useMemo(() => {
    if (t <= 0.3) return ROOM_POSITIONS.camera;
    if (t <= 1.0) {
      const p = (t - 0.3) / 0.7;
      return {
        x: ROOM_POSITIONS.camera.x + (ROOM_POSITIONS.door.x - ROOM_POSITIONS.camera.x) * p,
        y: ROOM_POSITIONS.camera.y + (ROOM_POSITIONS.door.y - ROOM_POSITIONS.camera.y) * p,
      };
    }
    if (t <= 1.7) {
      const p = (t - 1.0) / 0.7;
      return {
        x: ROOM_POSITIONS.door.x + (ROOM_POSITIONS.tv.x - ROOM_POSITIONS.door.x) * p,
        y: ROOM_POSITIONS.door.y + (ROOM_POSITIONS.tv.y - ROOM_POSITIONS.door.y) * p,
      };
    }
    const p = Math.min(1, (t - 1.7) / 0.7);
    return {
      x: ROOM_POSITIONS.tv.x + (ROOM_POSITIONS.router.x - ROOM_POSITIONS.tv.x) * p,
      y: ROOM_POSITIONS.tv.y + (ROOM_POSITIONS.router.y - ROOM_POSITIONS.tv.y) * p,
    };
  }, [t]);

  const terminalText = useMemo(() => buildForensicTerminalOutput(evaluation), [evaluation]);

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(terminalText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Escalado para las dos líneas de tiempo paralelas (Real vs SIEM)
  const minTimeSec = Math.min(
    ...evaluation.entries.map((e) => Math.min(e.realSecondsFrom22h, e.reportedSecondsFrom22h)),
    13 * 60
  );
  const maxTimeSec = Math.max(
    ...evaluation.entries.map((e) => Math.max(e.realSecondsFrom22h, e.reportedSecondsFrom22h)),
    18 * 60
  );
  const timeSpan = Math.max(60, maxTimeSec - minTimeSec);
  const toPercent = (sec: number) => 8 + ((sec - minTimeSec) / timeSpan) * 84;

  return (
    <div className="flex-1 flex flex-col min-h-0 scene-transition">
      {/* Narrador Superior (Principio 1 y Requisito G6) */}
      <NarratorBar
        sceneTitle="Escena 2 · Peritaje Forense"
        keyMessage="Si los relojes no están sincronizados, un registro puede contar los hechos en otro orden y la prueba pierde valor."
        stepIndex={currentEventIndex}
        totalSteps={events.length}
        narration={currentEvent?.narration || evaluation.verdictNarration}
        detailTitle="Validez Probatoria, Correlación SIEM y Cadena de Custodia"
        theme={theme}
        detailContent={
          <div className="space-y-4 text-base">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <h4 className="font-bold text-lg text-emerald-400">1. El Fenómeno de Clock Drift en Dispositivos IoT</h4>
              <p className="mt-1">
                Cuando las cámaras IP, controles de acceso y routers operan con sus propios osciladores de cuarzo sin
                sincronización NTP, acumulan derivas de minutos. En el caso de las <strong>22:15 hs</strong>, si la
                cámara atrasa 8 minutos (<strong>22:06 hs</strong>) y el control de acceso adelanta 3 minutos (
                <strong>22:17 hs</strong>), la defensa puede impugnar la pericia por contradicción cronológica.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/30">
              <h4 className="font-bold text-lg text-sky-400">
                2. Acreditación Técnica en el Informe Forense (chronyc / ntpq)
              </h4>
              <p className="mt-1">
                Para sustentar la trazabilidad temporal ante un tribunal, el perito informático adjunta el estado del
                demonio de tiempo (<code>chronyc tracking</code> o <code>ntpq -p</code>), demostrando el estrato de la
                fuente y acotando matemáticamente la dispersión de raíz en el instante del incidente.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <h4 className="font-bold text-lg text-amber-400">3. Alcance y Límites de NTP en la Prueba Digital</h4>
              <p className="mt-1">
                Tal como concluye la monografía, NTP garantiza una base temporal coherente para correlacionar eventos en
                el SIEM, pero <strong>no reemplaza la integridad criptográfica de los logs (hashes SHA-256)</strong> ni
                los procedimientos formales de preservación y cadena de custodia.
              </p>
            </div>
          </div>
        }
      />

      {/* Cuerpo Principal 70% Lienzo (Plano CAD + Líneas Paralelas) / 30% SIEM + Eventos */}
      <div className="flex-1 grid grid-cols-12 gap-4 p-4 min-h-0 overflow-hidden">
        {/* LIENZO INTERACTIVO (70% -> 8 columnas) */}
        <div
          className={`col-span-12 lg:col-span-8 rounded-2xl border p-5 flex flex-col justify-between relative min-h-0 ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-300 shadow-sm'
          }`}
        >
          {/* Barra superior de acciones sobre el plano */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-700/50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium opacity-85">
                Clic en cualquier dispositivo del plano para ajustar su deriva (±600 s):
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSyncWithNtp}
                className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center gap-2 shadow-md transition-transform active:scale-95"
              >
                <RefreshCw className={`w-4 h-4 ${syncingAnimation ? 'animate-spin' : ''}`} />
                <span>Sincronizar con NTP (Derivas → 0 s)</span>
              </button>

              <button
                type="button"
                onClick={() => setTerminalOpen(true)}
                className={`px-3.5 py-1.5 rounded-xl border text-sm font-mono font-semibold flex items-center gap-2 ${
                  isDark
                    ? 'bg-slate-800 border-slate-700 text-sky-300 hover:bg-slate-700'
                    : 'bg-slate-100 border-slate-300 text-sky-800 hover:bg-slate-200'
                }`}
              >
                <Terminal className="w-4 h-4" />
                <span>Ver registro (SIEM / chronyc)</span>
              </button>
            </div>
          </div>

          {/* Popover de Deriva Individual por Dispositivo en el Lienzo (Requisito S2.2) */}
          {selectedDevice && (
            <div
              className={`absolute top-16 left-5 z-30 w-96 p-4 rounded-2xl border shadow-2xl space-y-3 ${
                isDark ? 'bg-slate-950 border-sky-500/60 text-slate-100' : 'bg-white border-sky-600 text-slate-900'
              }`}
            >
              {(() => {
                const devInfo = FORENSIC_BASE_EVENTS.find((e) => e.id === selectedDevice)!;
                const currentDrift = drifts[selectedDevice];
                return (
                  <>
                    <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                      <span className={`font-bold text-base flex items-center gap-2 ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                        <Sliders className="w-4 h-4" />
                        <span>Deriva: {devInfo.device}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedDevice(null)}
                        className={`p-1 rounded ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-800'}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between font-mono">
                        <span>Hora real UTC:</span>
                        <span className={`font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                          {devInfo.realTimestampStr}
                        </span>
                      </div>
                      <div className="flex justify-between font-mono">
                        <span>Desfase del oscilador:</span>
                        <span className={`font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                          {currentDrift >= 0 ? `+${currentDrift}` : currentDrift} s (
                          {(currentDrift / 60).toFixed(1)} min)
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-600}
                        max={600}
                        step={5}
                        value={currentDrift}
                        onChange={(e) => {
                          setActivePreset('custom');
                          setDrifts((prev) => ({ ...prev, [selectedDevice]: Number(e.target.value) }));
                        }}
                        className="w-full accent-sky-500"
                      />
                      <div className="flex justify-between text-sm font-mono opacity-75">
                        <span>-600 s (-10 min)</span>
                        <button
                          type="button"
                          onClick={() => {
                            setActivePreset('custom');
                            setDrifts((prev) => ({ ...prev, [selectedDevice]: 0 }));
                          }}
                          className={`underline font-semibold ${isDark ? 'text-sky-400' : 'text-sky-700'}`}
                        >
                          Poner en 0 s
                        </button>
                        <span>+600 s (+10 min)</span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* MITAD SUPERIOR: Plano Arquitectónico CAD 2D con Marcador Animado (Requisito S2.7) */}
          <div className="grid grid-cols-12 gap-3 items-center my-1">
            {/* Tarjetas de los 4 dispositivos clicables */}
            <div className="col-span-12 grid grid-cols-4 gap-3">
              {FORENSIC_BASE_EVENTS.map((ev) => {
                const entry = evaluation.entries.find((x) => x.id === ev.id)!;
                const hasDrift = Math.abs(entry.driftSeconds) >= 0.5;
                return (
                  <NetworkNode
                    key={ev.id}
                    kind={ev.id}
                    badgeText={`Real #${ev.realOrder} · ${ev.realTimestampStr.slice(0, 8)}`}
                    title={ev.device}
                    subtitle={`Deriva: ${entry.driftSeconds >= 0 ? `+${entry.driftSeconds}` : entry.driftSeconds} s`}
                    clockText={entry.reportedTimestampStr.replace(' UTC', '')}
                    statusColor={
                      evaluation.verdictType === 'inverted' && hasDrift
                        ? 'rose'
                        : hasDrift
                        ? 'amber'
                        : 'emerald'
                    }
                    onClick={() => setSelectedDevice(ev.id)}
                  />
                );
              })}
            </div>

            {/* Plano SVG del Recinto con Recorrido del Intruso y Paquetes NTP de Sincronización */}
            <div className="col-span-12">
              <svg
                viewBox="0 0 760 255"
                className={`w-full h-44 rounded-xl border select-none ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-900 border-slate-700'
                }`}
              >
                {/* Cuadrícula de plano CAD */}
                <rect x="20" y="20" width="220" height="145" rx="10" fill="none" stroke="#334155" strokeWidth="2" />
                <text x="35" y="45" fill="#94a3b8" fontSize="14" fontFamily="IBM Plex Mono" fontWeight="bold">
                  1. HALL (22:14:02.105)
                </text>

                <rect x="255" y="20" width="220" height="145" rx="10" fill="none" stroke="#334155" strokeWidth="2" />
                <text x="270" y="45" fill="#94a3b8" fontSize="14" fontFamily="IBM Plex Mono" fontWeight="bold">
                  2. PUERTA (22:14:45.330)
                </text>

                <rect x="490" y="20" width="250" height="110" rx="10" fill="none" stroke="#334155" strokeWidth="2" />
                <text x="505" y="45" fill="#94a3b8" fontSize="14" fontFamily="IBM Plex Mono" fontWeight="bold">
                  3. SALA TV (22:15:20.500)
                </text>

                <rect x="490" y="140" width="250" height="100" rx="10" fill="none" stroke="#334155" strokeWidth="2" />
                <text x="505" y="165" fill="#94a3b8" fontSize="14" fontFamily="IBM Plex Mono" fontWeight="bold">
                  4. ROUTER (22:16:10.012)
                </text>

                {/* Ruta real de intrusión */}
                <polyline
                  points="140,95 370,95 610,95 610,215"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="3"
                  strokeDasharray="6 6"
                />

                {/* Brecha real destacada entre Cámara y Puerta (43,2 s, Requisito S2.6) */}
                <text x="205" y="122" fill="#38bdf8" fontSize="14" fontFamily="IBM Plex Mono" fontWeight="bold">
                  Δ Real = 43,2 s
                </text>

                {/* Nodos fijos en el plano */}
                {(Object.keys(ROOM_POSITIONS) as ForensicDeviceId[]).map((devId) => {
                  const pos = ROOM_POSITIONS[devId];
                  return (
                    <g
                      key={devId}
                      className="cursor-pointer"
                      onClick={() => setSelectedDevice(devId)}
                    >
                      <circle cx={pos.x} cy={pos.y} r="12" fill="#0f172a" stroke="#38bdf8" strokeWidth="2.5" />
                    </g>
                  );
                })}

                {/* Animación de paquetes NTP desde el GPS al pulsar "Sincronizar con NTP" (Requisito S2.5) */}
                {syncingAnimation && (
                  <g>
                    <rect x="20" y="185" width="175" height="50" rx="8" fill="#065f46" stroke="#10b981" strokeWidth="2" />
                    <text x="32" y="215" fill="#ecfdf5" fontSize="14" fontFamily="IBM Plex Mono" fontWeight="bold">
                      GPS NTP Stratum 1
                    </text>
                    {(Object.keys(ROOM_POSITIONS) as ForensicDeviceId[]).map((devId) => {
                      const pos = ROOM_POSITIONS[devId];
                      return (
                        <line
                          key={devId}
                          x1="105"
                          y1="185"
                          x2={pos.x}
                          y2={pos.y}
                          stroke="#10b981"
                          strokeWidth="3"
                          strokeDasharray="4 4"
                        />
                      );
                    })}
                  </g>
                )}

                {/* Marcador animado del intruso recorriendo el plano según sim.t */}
                <g transform={`translate(${markerPos.x}, ${markerPos.y})`}>
                  <circle r="16" fill="#f43f5e" fillOpacity="0.3" />
                  <circle r="8" fill="#f43f5e" stroke="#ffffff" strokeWidth="2" />
                  <text x="-38" y="-20" fill="#fda4af" fontSize="14" fontFamily="IBM Plex Mono" fontWeight="bold">
                    Intruso
                  </text>
                </g>
              </svg>
            </div>
          </div>

          {/* MITAD INFERIOR: Dos Líneas de Tiempo Paralelas (Real vs Reportada al SIEM) con Cruces */}
          <div
            className={`p-3.5 rounded-xl border ${
              isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-50 border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-mono font-bold uppercase text-sky-400">
                Comparativa de Líneas de Tiempo: Hora Real UTC (Arriba) vs Hora Reportada al SIEM (Abajo)
              </span>
              <span className="text-sm font-mono opacity-80">
                Las líneas rojas cruzadas indican inversión de orden causal
              </span>
            </div>

            <svg viewBox="0 0 800 120" className="w-full h-28 select-none">
              {/* Eje Real UTC */}
              <line x1="60" y1="30" x2="740" y2="30" stroke="#10b981" strokeWidth="3" />
              <text x="8" y="34" fill="#10b981" fontSize="14" fontFamily="IBM Plex Mono" fontWeight="bold">
                Real
              </text>

              {/* Eje Reportado al SIEM */}
              <line x1="60" y1="95" x2="740" y2="95" stroke="#f59e0b" strokeWidth="3" />
              <text x="8" y="99" fill="#f59e0b" fontSize="14" fontFamily="IBM Plex Mono" fontWeight="bold">
                SIEM
              </text>

              {evaluation.entries.map((entry) => {
                const xReal = (toPercent(entry.realSecondsFrom22h) / 100) * 800;
                const xRep = (toPercent(entry.reportedSecondsFrom22h) / 100) * 800;
                const isInvertedItem = entry.realOrder !== entry.siemOrder;

                return (
                  <g key={entry.id}>
                    <line
                      x1={xReal}
                      y1="30"
                      x2={xRep}
                      y2="95"
                      stroke={isInvertedItem ? '#f43f5e' : '#38bdf8'}
                      strokeWidth={isInvertedItem ? '3.5' : '2'}
                    />
                    <circle cx={xReal} cy="30" r="6" fill="#10b981" />
                    <text
                      x={xReal - 28}
                      y="18"
                      fill="#10b981"
                      fontSize="14"
                      fontFamily="IBM Plex Mono"
                      fontWeight="bold"
                    >
                      #{entry.realOrder} {entry.device.split(' ')[0]}
                    </text>

                    <circle cx={xRep} cy="95" r="6" fill={isInvertedItem ? '#f43f5e' : '#f59e0b'} />
                    <text
                      x={xRep - 32}
                      y="115"
                      fill={isInvertedItem ? '#fda4af' : '#fcd34d'}
                      fontSize="14"
                      fontFamily="IBM Plex Mono"
                      fontWeight="bold"
                    >
                      {entry.reportedTimestampStr.slice(0, 8)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* COLUMNA DERECHA (30% -> 4 columnas): Veredicto + Consola SIEM Reordenable + Lista de Eventos */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-3 min-h-0">
          {/* Veredicto de Una Línea (Requisito S2.4) */}
          <div
            className={`p-3.5 rounded-2xl border flex items-center gap-3 shrink-0 ${
              evaluation.verdictType === 'coherent'
                ? isDark
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  : 'bg-emerald-500/15 border-emerald-600/60 text-emerald-950'
                : evaluation.verdictType === 'coherent-unreliable'
                ? isDark
                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                  : 'bg-amber-500/15 border-amber-600/60 text-amber-950'
                : isDark
                ? 'bg-rose-500/15 border-rose-500/60 text-rose-300'
                : 'bg-rose-500/15 border-rose-600/60 text-rose-950'
            }`}
          >
            {evaluation.verdictType === 'coherent' && (
              <CheckCircle2 className={`w-7 h-7 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} />
            )}
            {evaluation.verdictType === 'coherent-unreliable' && (
              <AlertTriangle className={`w-7 h-7 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-700'}`} />
            )}
            {evaluation.verdictType === 'inverted' && (
              <XCircle className={`w-7 h-7 shrink-0 ${isDark ? 'text-rose-500' : 'text-rose-700'}`} />
            )}
            <div>
              <div className="text-sm font-mono uppercase opacity-80">Veredicto Pericial Automático</div>
              <div className="text-lg font-extrabold leading-snug">{evaluation.verdictTitle}</div>
            </div>
          </div>

          {/* Consola del SIEM Ordenada por Hora Reportada (Requisitos S2.2, S2.3 y S2.6) */}
          <div
            className={`p-4 rounded-2xl border space-y-2 shrink-0 ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-700/50 pb-2">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Satellite className={`w-4 h-4 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />
                <span>Consola SIEM (Orden Reportado)</span>
              </h3>
              <span className={`font-mono text-sm font-semibold ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                Brecha real Cam→Puerta: 43,2 s
              </span>
            </div>

            <div className="space-y-2">
              {evaluation.entries.map((item) => {
                const isOutOfOrder = item.realOrder !== item.siemOrder;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedDevice(item.id)}
                    className={`p-2.5 rounded-xl border transition-all duration-300 cursor-pointer flex items-center justify-between gap-2 ${
                      isOutOfOrder
                        ? isDark
                          ? 'bg-rose-500/15 border-rose-500/50 text-rose-200'
                          : 'bg-rose-500/15 border-rose-600/60 text-rose-950'
                        : isDark
                        ? 'bg-slate-800/70 border-slate-700 text-slate-200 hover:bg-slate-800'
                        : 'bg-slate-100 border-slate-300 text-slate-900 hover:bg-slate-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-slate-900 font-mono text-sm font-bold text-sky-400">
                          SIEM #{item.siemOrder}
                        </span>
                        <span className="font-bold text-sm truncate">{item.device}</span>
                        <span className="font-mono text-sm opacity-75">(Real #{item.realOrder})</span>
                      </div>
                      <div className="text-sm opacity-90 truncate mt-0.5">{item.description}</div>
                    </div>

                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="text-base font-bold">{item.reportedTimestampStr.slice(0, 12)}</div>
                      <div className="text-sm opacity-80">
                        Deriva: {item.driftSeconds >= 0 ? `+${item.driftSeconds}s` : `${item.driftSeconds}s`}
                      </div>
                    </div>
                  </div>
                );
              })}
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

      {/* Barra de Transporte Común y Presets Forenses (Requisitos G3 y G8) */}
      <TransportBar
        t={t}
        duration={duration}
        playing={playing}
        speed={speed}
        onTogglePlay={() => sim.togglePlay()}
        onPrevStep={() => sim.prevStep()}
        onNextStep={() => sim.nextStep()}
        onReset={() => {
          const presetKey = activePreset === 'custom' ? 'caso2215' : activePreset;
          setDrifts({ ...FORENSIC_PRESETS[presetKey].drifts });
          setActivePreset(presetKey);
          sim.reset();
        }}
        onSeek={(newT) => sim.seek(newT)}
        onChangeSpeed={(s) => sim.setSpeed(s)}
        presets={[
          { id: 'caso2215', label: 'Caso 22:15 (Horas erróneas)' },
          { id: 'ordenInvertido', label: 'Orden invertido (Puerta al final)' },
          { id: 'sincronizado', label: 'Sincronizado con NTP (0 s)' },
        ]}
        activePreset={activePreset}
        onSelectPreset={handleSelectPreset}
        theme={theme}
      />

      {/* Inspector de Paquetes (Trama 108 GPS) */}
      <PacketInspector
        packet={inspectedPacketId ? buildTrama108Response() : null}
        onClose={() => setInspectedPacketId(null)}
        theme={theme}
      />

      {/* Modal / Drawer de Vista Terminal y Copia del Registro (Requisito S2.8) */}
      {terminalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6"
          onClick={() => setTerminalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-4xl rounded-2xl border p-6 shadow-2xl space-y-4 ${
              isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className={`w-6 h-6 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                <div>
                  <h3 className="text-xl font-bold">Evidencia Digital: Estado del Demonio NTP y Logs del SIEM</h3>
                  <p className="text-sm opacity-75">
                    Incluye verificación pericial chronyc tracking / ntpq -p (Sección 10.5 de la Monografía)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-sm flex items-center gap-1.5"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Copiado' : 'Copiar registro'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTerminalOpen(false)}
                  className={`p-2 rounded-lg ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-800'}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <pre className="p-4 rounded-xl bg-slate-950 text-emerald-300 font-mono text-sm overflow-x-auto leading-relaxed border border-slate-800">
              {terminalText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

