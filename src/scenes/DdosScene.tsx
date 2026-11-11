import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Shield,
  ShieldAlert,
  Terminal,
  Sliders,
  Rocket,
  X,
  CheckSquare,
  Square,
  SearchCode,
} from 'lucide-react';
import { SimEvent, ThemeMode } from '../types/lab';
import { Sim } from '../sim/engine';
import { useSim } from '../hooks/useSim';
import { broadcastPresenterState } from '../sim/broadcast';
import { calculateDdosMetrics, NtpConfMitigation } from '../sim/ddos';
import { buildMonlistMode7Frame, MONLIST_MODE7_HEADER_HEX } from '../sim/packets';
import { NarratorBar } from '../components/NarratorBar';
import { TransportBar } from '../components/TransportBar';
import { EventList } from '../components/EventList';
import { PacketInspector } from '../components/PacketInspector';


interface DdosSceneProps {
  theme: ThemeMode;
  presentationMode: boolean;
}

function buildDdosEvents(isMitigated: boolean, baf: number, usCert: boolean): SimEvent[] {
  if (isMitigated) {
    return [
      {
        id: 'ddos-spoof',
        at: 0.3,
        label: 'Atacante envía consulta Modo 7 monlist con IP falsificada',
        narration: 'El atacante envía una petición chica con IP falsificada.',
        packetId: 'monlist-mode7',
      },
      {
        id: 'ddos-shield',
        at: 1.0,
        label: 'Reflectores bloquean Modo 7 por directiva en ntp.conf (Factor 0:1)',
        narration: 'El escudo ntp.conf bloquea la consulta; respuesta 0 bytes.',
      },
      {
        id: 'ddos-safe',
        at: 2.0,
        label: 'Víctima sin tráfico reflejado (0 B recibidos)',
        narration: 'Dos líneas de configuración impiden la amplificación DDoS.',
      },
    ];
  }

  return [
    {
      id: 'ddos-spoof',
      at: 0.3,
      label: `Atacante falsifica IP origen de la víctima (${usCert ? '90 B US-CERT' : '234 B'})`,
      narration: 'El atacante falsifica la IP de origen hacia los reflectores.',
      packetId: 'monlist-mode7',
    },
    {
      id: 'ddos-amplify',
      at: 1.1,
      label: `Reflectores multiplican tráfico por ${baf}:1 (Tabla MRU monlist)`,
      narration: `Cada reflector amplifica la respuesta con factor ${baf}:1.`,
      packetId: 'monlist-mode7',
    },
    {
      id: 'ddos-saturate',
      at: 2.3,
      label: 'Enlace de la víctima saturado antes de los 3 segundos',
      narration: 'El enjambre de respuestas satura el ancho de banda.',
      packetId: 'monlist-mode7',
    },
  ];
}

export const DdosScene: React.FC<DdosSceneProps> = ({ theme }) => {
  const [mruIpCount, setMruIpCount] = useState(600);
  const [reflectorCount, setReflectorCount] = useState(20);
  const [usCertCase, setUsCertCase] = useState(false);
  const [mitigation, setMitigation] = useState<NtpConfMitigation>({
    disableMonitor: false,
    restrictNoqueryIPv4: false,
    restrictNoqueryIPv6: false,
  });
  const [activePreset, setActivePreset] = useState('cloudflare600');
  const [controlsPopoverOpen, setControlsPopoverOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [inspectedPacketId, setInspectedPacketId] = useState<string | null>(null);

  const metrics = useMemo(
    () =>
      calculateDdosMetrics({
        mruIpCount,
        reflectorCount,
        usCertCase,
        mitigation,
      }),
    [mruIpCount, reflectorCount, usCertCase, mitigation]
  );

  const simRef = useRef<Sim>(
    new Sim(3.0, buildDdosEvents(metrics.isMitigated, metrics.baf, usCertCase))
  );
  const sim = simRef.current;
  const { t, duration, playing, speed, events, currentEventIndex, currentEvent } = useSim(sim);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDark = theme === 'dark';

  // Cierre de modal terminal y popover de controles con Escape (Mejora #4)
  useEffect(() => {
    if (!terminalOpen && !controlsPopoverOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (terminalOpen) setTerminalOpen(false);
        else if (controlsPopoverOpen) setControlsPopoverOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [terminalOpen, controlsPopoverOpen]);


  useEffect(() => {
    sim.setConfig(3.0, buildDdosEvents(metrics.isMitigated, metrics.baf, usCertCase));
    sim.play();
  }, [metrics.isMitigated, metrics.baf, usCertCase, sim]);

  // Atajos locales de teclado
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
      scene: 'ddos',
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

  // Renderizado Canvas a 60 FPS sin backdrop-blur superpuesto (Requisito S4.4)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Coordenadas de los 3 bloques en el Canvas
    const attackerPos = { x: 95, y: h / 2 };
    const victimPos = { x: w - 105, y: h / 2 };
    const refX = w / 2 - 20;

    // Dibujar hasta 100 reflectores distribuidos en una matriz central limpia
    const cols = reflectorCount > 25 ? 4 : reflectorCount > 10 ? 2 : 1;
    const rows = Math.ceil(reflectorCount / cols);
    const reflectorCoords: { x: number; y: number }[] = [];

    for (let i = 0; i < reflectorCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rx = refX + (col - (cols - 1) / 2) * 34;
      const ry = 36 + ((h - 72) * (row + 0.5)) / Math.max(1, rows);
      reflectorCoords.push({ x: rx, y: ry });
    }

    // 1. Líneas de guía sutiles
    ctx.lineWidth = 1;
    reflectorCoords.forEach((rc) => {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.beginPath();
      ctx.moveTo(attackerPos.x, attackerPos.y);
      ctx.lineTo(rc.x, rc.y);
      if (!metrics.isMitigated) {
        ctx.lineTo(victimPos.x, victimPos.y);
      }
      ctx.stroke();
    });

    // 2. Partículas chicas de petición (Atacante -> Reflectores, t entre 0.1 y 1.2)
    if (t >= 0.1) {
      const reqPhase = Math.min(1, (t - 0.1) / 0.9);
      if (reqPhase < 1) {
        ctx.fillStyle = '#38bdf8';
        reflectorCoords.forEach((rc) => {
          const px = attackerPos.x + (rc.x - attackerPos.x) * reqPhase;
          const py = attackerPos.y + (rc.y - attackerPos.y) * reqPhase;
          ctx.beginPath();
          ctx.arc(px, py, 3.5, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }

    // 3. Enjambre de respuestas amplificadas (Reflectores -> Víctima) o Escudo de Mitigación
    if (!metrics.isMitigated && t >= 0.95) {
      const respPhase = Math.min(1, (t - 0.95) / 1.4);
      // Radio visual proporcional a los bytes reales con tope (Requisito Sección 7)
      const baseRadius = Math.max(4, Math.min(11, 3 + (mruIpCount / 600) * 8));
      const waves = 3;

      for (let wIdx = 0; wIdx < waves; wIdx++) {
        const waveProgress = (respPhase * 1.3 - wIdx * 0.18) % 1;
        if (waveProgress > 0 && waveProgress < 1) {
          ctx.fillStyle = mruIpCount >= 300 ? 'rgba(244, 63, 94, 0.85)' : 'rgba(245, 158, 11, 0.85)';
          reflectorCoords.forEach((rc) => {
            const px = rc.x + (victimPos.x - rc.x) * waveProgress;
            const py = rc.y + (victimPos.y - rc.y) * waveProgress;
            ctx.beginPath();
            ctx.arc(px, py, baseRadius, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      }
    }

    // 4. Dibujar los Reflectores NTP y el Escudo cuando ntp.conf está activo (Requisito S4.3)
    reflectorCoords.forEach((rc) => {
      ctx.fillStyle = metrics.isMitigated ? '#10b981' : '#a855f7';
      ctx.beginPath();
      ctx.arc(rc.x, rc.y, reflectorCount > 40 ? 4.5 : 6.5, 0, Math.PI * 2);
      ctx.fill();
    });

    if (metrics.isMitigated) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(refX + 75, 25);
      ctx.lineTo(refX + 75, h - 25);
      ctx.stroke();

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 14px "IBM Plex Mono"';
      ctx.fillText('ESCUDO ntp.conf ACTIVO (0 B)', refX + 86, h / 2);
    }

    // 5. Nodo Atacante (Izquierda)
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(attackerPos.x, attackerPos.y, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fda4af';
    ctx.font = 'bold 14px "IBM Plex Mono"';
    ctx.textAlign = 'center';
    ctx.fillText('ATACANTE', attackerPos.x, attackerPos.y - 4);
    ctx.fillText(`${metrics.requestBytes} B`, attackerPos.x, attackerPos.y + 15);

    // 6. Nodo Víctima (Derecha)
    const isHit = !metrics.isMitigated && t >= 1.8 && metrics.isSaturated;
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = isHit ? '#f43f5e' : '#10b981';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(victimPos.x, victimPos.y, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isHit ? '#fda4af' : '#6ee7b7';
    ctx.fillText('VÍCTIMA', victimPos.x, victimPos.y - 5);
    ctx.fillText(isHit ? 'SATURADA' : 'ESTABLE', victimPos.x, victimPos.y + 15);
  }, [t, mruIpCount, reflectorCount, metrics]);

  const handleSelectPreset = (presetId: string) => {
    setActivePreset(presetId);
    if (presetId === 'cloudflare55') {
      setMruIpCount(55);
      setReflectorCount(10);
      setUsCertCase(false);
      setMitigation({ disableMonitor: false, restrictNoqueryIPv4: false, restrictNoqueryIPv6: false });
    } else if (presetId === 'cloudflare600') {
      setMruIpCount(600);
      setReflectorCount(20);
      setUsCertCase(false);
      setMitigation({ disableMonitor: false, restrictNoqueryIPv4: false, restrictNoqueryIPv6: false });
    } else if (presetId === 'uscert600') {
      setMruIpCount(600);
      setReflectorCount(30);
      setUsCertCase(true);
      setMitigation({ disableMonitor: false, restrictNoqueryIPv4: false, restrictNoqueryIPv6: false });
    } else if (presetId === 'mitigated') {
      setMitigation((prev) => ({ ...prev, disableMonitor: true, restrictNoqueryIPv4: true }));
    }
  };

  // La saturación crece con sim.t hasta cruzar el 100% antes de los 3 segundos a 1x (Criterio Sección 7)
  const animatedLoadPercent = metrics.isMitigated
    ? 0
    : t < 1.0
    ? 12
    : Math.min(200, Math.round(metrics.victimLoadPercent * Math.min(1, (t - 0.8) / 1.4)));

  return (
    <div className="flex-1 flex flex-col min-h-0 scene-transition">
      {/* Narrador Superior (Principio 1 y Requisito G6) */}
      <NarratorBar
        sceneTitle="Escena 4 · Amplificación DDoS"
        keyMessage="Una petición de 234 B puede generar 48.000 B hacia una víctima; dos líneas de configuración lo impiden."
        stepIndex={currentEventIndex}
        totalSteps={events.length}
        narration={currentEvent?.narration || 'Inicie la simulación para observar el factor de amplificación.'}
        detailTitle="Vulnerabilidad monlist (CVE-2013-5211), BAF y Remediación en ntp.conf"
        theme={theme}
        detailContent={
          <div className="space-y-4 text-base">
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
              <h4 className="font-bold text-lg text-rose-400">
                1. Anatomía del Comando Privado Modo 7 monlist (CVE-2013-5211)
              </h4>
              <p className="mt-1">
                En implementaciones antiguas de <code>ntpd</code>, el comando de diagnóstico <code>monlist</code>{' '}
                guardaba en memoria las últimas <strong>600 direcciones IP</strong> que habían consultado al servidor.
                Como opera sobre UDP sin handshake, un atacante falsifica la IP de origen colocando la de la víctima.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <h4 className="font-bold text-lg text-amber-400">
                2. Cifras Documentadas por Cloudflare y US-CERT (TA14-017A)
              </h4>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>
                  <strong>Medición de Cloudflare (Petición de 234 B):</strong> Con 55 IPs en la tabla MRU devuelve{' '}
                  <strong>4.460 B en 10 paquetes</strong>; con la tabla llena (600 IPs) devuelve unos{' '}
                  <strong>48.000 B en 100 paquetes</strong> (factor de amplificación <strong>~205:1 / 206:1</strong>).
                </li>
                <li>
                  <strong>Alerta US-CERT TA14-017A (Petición de 90 B):</strong> Con un datagrama mínimo de 90 bytes y
                  600 IPs en la tabla MRU, el factor alcanza <strong>556,9:1</strong>.
                </li>
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <h4 className="font-bold text-lg text-emerald-400">
                3. Estrategias de Remediación en ntp.conf (Sección 8.4)
              </h4>
              <p className="mt-1">
                Actualizar <code>ntpd</code> o inyectar <code>disable monitor</code> junto con la restricción{' '}
                <code>noquery</code> en IPv4 e IPv6 corta de raíz la extracción de la tabla MRU sin interrumpir el
                servicio legítimo de sincronización horaria en el puerto 123.
              </p>
            </div>
          </div>
        }
      />

      {/* Cuerpo Principal 70% Lienzo Canvas a 60 FPS / 30% Medidor BAF + ntp.conf + Eventos */}
      <div className="flex-1 grid grid-cols-12 gap-4 p-4 min-h-0 overflow-hidden">
        {/* LIENZO INTERACTIVO (70% -> 8 columnas) */}
        <div
          className={`col-span-12 lg:col-span-8 rounded-2xl border p-5 flex flex-col justify-between relative min-h-0 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300 shadow-sm'
          }`}
        >
          {/* Barra superior de acciones sobre el lienzo */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-700/50">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setControlsPopoverOpen((o) => !o)}
                className={`px-3.5 py-1.5 rounded-xl border text-sm font-semibold flex items-center gap-2 ${
                  isDark
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-300 hover:bg-sky-500/30'
                    : 'bg-sky-500/15 border-sky-600/60 text-sky-900 hover:bg-sky-500/25'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>
                  Tabla MRU: {mruIpCount} IPs · Reflectores: {reflectorCount} · Petición: {metrics.requestBytes} B
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActivePreset('custom');
                  setUsCertCase((v) => !v);
                }}
                className={`px-3.5 py-1.5 rounded-xl border text-sm font-mono font-bold flex items-center gap-2 ${
                  usCertCase
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : isDark
                    ? 'bg-slate-800 border-slate-700 text-slate-300'
                    : 'bg-slate-100 border-slate-300 text-slate-800'
                }`}
              >
                {usCertCase ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                <span>Caso US-CERT (90 B → 556,9:1)</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  sim.reset();
                  sim.play();
                }}
                className="px-4 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-sm flex items-center gap-1.5 shadow"
              >
                <Rocket className="w-4 h-4" />
                <span>Lanzar simulación</span>
              </button>

              <button
                type="button"
                onClick={() => setInspectedPacketId('monlist-mode7')}
                className={`px-3 py-1.5 rounded-xl border text-sm font-mono font-semibold flex items-center gap-1.5 ${
                  isDark
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                    : 'bg-amber-500/15 border-amber-600/60 text-amber-900 hover:bg-amber-500/25'
                }`}
              >
                <SearchCode className="w-4 h-4" />
                <span>PDU Modo 7</span>
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
                <span>Vista Terminal Modo 7</span>
              </button>
            </div>
          </div>

          {/* Popover de Sliders MRU (1 a 600) y Reflectores (1 a 100) */}
          {controlsPopoverOpen && (
            <div
              className={`absolute top-16 left-5 z-30 w-96 p-4 rounded-2xl border shadow-2xl space-y-3 ${
                isDark ? 'bg-slate-950 border-sky-500/60 text-slate-100' : 'bg-white border-sky-600 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                <span className={`font-bold text-base ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                  Parámetros de Reflexión
                </span>
                <button
                  type="button"
                  onClick={() => setControlsPopoverOpen(false)}
                  className={`p-1 rounded ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-800'}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <label className="block">
                  <div className="flex justify-between font-mono">
                    <span>Direcciones IP en tabla MRU (1–600):</span>
                    <span className={`font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>{mruIpCount} IPs</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={600}
                    step={1}
                    value={mruIpCount}
                    onChange={(e) => {
                      setActivePreset('custom');
                      setMruIpCount(Number(e.target.value));
                    }}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between font-mono text-sm opacity-75 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActivePreset('custom');
                        setMruIpCount(55);
                      }}
                      className={`underline font-semibold ${isDark ? 'text-sky-400' : 'text-sky-700'}`}
                    >
                      Fijar 55 IPs (4.460 B)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActivePreset('custom');
                        setMruIpCount(600);
                      }}
                      className={`underline font-semibold ${isDark ? 'text-sky-400' : 'text-sky-700'}`}
                    >
                      Fijar 600 IPs (48.000 B)
                    </button>
                  </div>
                </label>

                <label className="block">
                  <div className="flex justify-between font-mono">
                    <span>Servidores Reflectores NTP (1–100):</span>
                    <span className={`font-bold ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>
                      {reflectorCount} reflectores
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={reflectorCount}
                    onChange={(e) => {
                      setActivePreset('custom');
                      setReflectorCount(Number(e.target.value));
                    }}
                    className="w-full accent-purple-500"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Lienzo HTML5 Canvas a 60 FPS (Requisito S4.4: sin backdrop-blur encima) */}
          <div className="my-2 flex-1 flex items-center justify-center min-h-0">
            <canvas
              ref={canvasRef}
              width={860}
              height={310}
              className="w-full h-full max-h-72 rounded-xl bg-slate-950 border border-slate-800"
            />
          </div>

          {/* Barra Inferior de Ancho de Banda y Punto de Saturación de la Víctima (Requisito S4.5) */}
          <div
            className={`p-4 rounded-xl border space-y-2 ${
              isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-50 border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between text-sm font-mono">
              <span className="font-bold uppercase text-sky-400">
                Medidor de Ancho de Banda de la Víctima (Caudal Total: {(metrics.totalResponseBytes / 1000).toFixed(1)}{' '}
                KB en {metrics.totalResponsePackets} paquetes)
              </span>
              <span
                className={`font-extrabold text-base ${
                  animatedLoadPercent >= 100 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {animatedLoadPercent}% {animatedLoadPercent >= 100 ? '· ¡ENLACE SATURADO!' : '· Estable'}
              </span>
            </div>

            <div className="relative h-5 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
              <div
                style={{ width: `${Math.min(100, animatedLoadPercent / 1.5)}%` }}
                className={`h-full transition-all duration-300 ${
                  animatedLoadPercent >= 100
                    ? 'bg-gradient-to-r from-amber-500 to-rose-600'
                    : 'bg-emerald-500'
                }`}
              />
              {/* Línea vertical de punto de saturación (100% capacidad) */}
              <div
                style={{ left: '66.6%' }}
                className="absolute top-0 bottom-0 w-1 bg-white shadow"
                title="Umbral de Saturación de la Víctima"
              />
            </div>

            <div className="flex justify-between text-sm font-mono opacity-80">
              <span>0 KB/oleada</span>
              <span className="text-rose-400 font-bold">▲ Línea de Saturación del Enlace (450 KB)</span>
              <span>Capacidad desbordada</span>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA (30% -> 4 columnas): Factor BAF + Directivas ntp.conf + Lista de Eventos */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-3 min-h-0">
          {/* Medidor Grande del Factor de Amplificación BAF (Requisitos S4.1 y S4.2) */}
          <div
            className={`p-4 rounded-2xl border space-y-2 shrink-0 ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono uppercase text-sky-400">Factor de Amplificación (BAF)</span>
              <span className="font-mono text-sm px-2.5 py-0.5 rounded bg-slate-800 text-slate-200">
                Petición: {metrics.requestBytes} B
              </span>
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div
                className={`text-4xl font-extrabold font-mono tabular-nums ${
                  metrics.isMitigated ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {metrics.baf}:1
              </div>
              <div className="text-right font-mono text-sm">
                <div className="font-bold">{metrics.responseBytesPerReflector.toLocaleString('es-AR')} B / reflector</div>
                <div className="opacity-80">{metrics.responsePacketsPerReflector} paquetes UDP</div>
              </div>
            </div>
          </div>

          {/* Tres Líneas de Configuración ntp.conf Clicables que Cortan el Flujo (Requisito S4.3) */}
          <div
            className={`p-4 rounded-2xl border space-y-2.5 shrink-0 ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-700/50 pb-2">
              <div className="flex items-center gap-2">
                {metrics.isMitigated ? (
                  <Shield className="w-5 h-5 text-emerald-400" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                )}
                <h3 className="font-bold text-base">Mitigación en /etc/ntp.conf (S4.3)</h3>
              </div>
              <span className="text-sm font-mono opacity-80">Clic para activar</span>
            </div>

            <div className="space-y-2 font-mono text-sm">
              <button
                type="button"
                onClick={() => {
                  setActivePreset('custom');
                  setMitigation((m) => ({ ...m, disableMonitor: !m.disableMonitor }));
                }}
                className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                  mitigation.disableMonitor
                    ? isDark
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                      : 'bg-emerald-500/15 border-emerald-600 text-emerald-950 font-bold'
                    : isDark
                    ? 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                    : 'bg-slate-100 border-slate-300 text-slate-800 hover:border-slate-400'
                }`}
              >
                {mitigation.disableMonitor ? (
                  <CheckSquare className={`w-4 h-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} />
                ) : (
                  <Square className="w-4 h-4 shrink-0" />
                )}
                <span>disable monitor</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActivePreset('custom');
                  setMitigation((m) => ({ ...m, restrictNoqueryIPv4: !m.restrictNoqueryIPv4 }));
                }}
                className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                  mitigation.restrictNoqueryIPv4
                    ? isDark
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                      : 'bg-emerald-500/15 border-emerald-600 text-emerald-950 font-bold'
                    : isDark
                    ? 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                    : 'bg-slate-100 border-slate-300 text-slate-800 hover:border-slate-400'
                }`}
              >
                {mitigation.restrictNoqueryIPv4 ? (
                  <CheckSquare className={`w-4 h-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} />
                ) : (
                  <Square className="w-4 h-4 shrink-0" />
                )}
                <span className="truncate">restrict default kod nomodify notrap nopeer noquery</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActivePreset('custom');
                  setMitigation((m) => ({ ...m, restrictNoqueryIPv6: !m.restrictNoqueryIPv6 }));
                }}
                className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                  mitigation.restrictNoqueryIPv6
                    ? isDark
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                      : 'bg-emerald-500/15 border-emerald-600 text-emerald-950 font-bold'
                    : isDark
                    ? 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                    : 'bg-slate-100 border-slate-300 text-slate-800 hover:border-slate-400'
                }`}
              >
                {mitigation.restrictNoqueryIPv6 ? (
                  <CheckSquare className={`w-4 h-4 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} />
                ) : (
                  <Square className="w-4 h-4 shrink-0" />
                )}
                <span className="truncate">restrict -6 default kod nomodify notrap nopeer noquery</span>
              </button>
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

      {/* Barra de Transporte Común y Presets DDoS (Requisitos G3 y G8) */}
      <TransportBar
        t={t}
        duration={duration}
        playing={playing}
        speed={speed}
        onTogglePlay={() => sim.togglePlay()}
        onPrevStep={() => sim.prevStep()}
        onNextStep={() => sim.nextStep()}
        onReset={() => {
          setMitigation({ disableMonitor: false, restrictNoqueryIPv4: false, restrictNoqueryIPv6: false });
          setMruIpCount(600);
          setReflectorCount(20);
          setUsCertCase(false);
          setActivePreset('cloudflare600');
          sim.reset();
        }}
        onSeek={(newT) => sim.seek(newT)}
        onChangeSpeed={(s) => sim.setSpeed(s)}
        presets={[
          { id: 'cloudflare55', label: '55 IPs (4.460 B / 10 paq)' },
          { id: 'cloudflare600', label: '600 IPs (48.000 B / 205:1)' },
          { id: 'uscert600', label: 'US-CERT 90 B (556,9:1)' },
          { id: 'mitigated', label: 'Mitigar con noquery (0:1)' },
        ]}
        activePreset={activePreset}
        onSelectPreset={handleSelectPreset}
        theme={theme}
      />

      {/* Inspector Hexadecimal de Paquete Modo 7 monlist (Mejora #5) */}
      <PacketInspector
        packet={inspectedPacketId ? buildMonlistMode7Frame() : null}
        onClose={() => setInspectedPacketId(null)}
        theme={theme}
      />

      {/* Modal / Cajón de Vista Terminal Modo 7 sin comandos operativos de ataque (Requisitos S4.6 y S4.7) */}
      {terminalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6"
          onClick={() => setTerminalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-3xl rounded-2xl border p-6 shadow-2xl space-y-4 ${
              isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className={`w-6 h-6 ${isDark ? 'text-sky-400' : 'text-sky-600'}`} />
                <div>
                  <h3 className="text-xl font-bold">Inspección Conceptual de Paquete Modo 7 (monlist)</h3>
                  <p className="text-sm opacity-75">
                    Cabecera hexadecimal documentada en la Sección 8.2 de la Monografía (Requisito S4.6 y S4.7)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTerminalOpen(false)}
                className={`p-2 rounded-lg ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-800'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {metrics.isMitigated ? (
              <pre className="p-4 rounded-xl bg-slate-950 text-emerald-400 font-mono text-sm border border-emerald-500/40">
                {`[Reflector ntp.conf] Directiva 'disable monitor' / 'noquery' ACTIVA.
Paquete entrante Modo 7 (REQ_MON_GETLIST_1) descartado silenciosamente.
Bytes de respuesta emitidos: 0 B (Factor 0:1).`}
              </pre>
            ) : (
              <pre className="p-4 rounded-xl bg-slate-950 text-amber-300 font-mono text-sm overflow-x-auto leading-relaxed border border-slate-800">
                {`--- CABECERA RESPUESTA MODO 7 (Sección 8.2 Monografía) ---
Hex Header : ${MONLIST_MODE7_HEADER_HEX}
  0xd7     : Respuesta (R=1), Más fragmentos (M=1), Versión=2, Modo=7 (Privado)
  0x00     : Autenticación = 0 (Sin autenticar)
  0x03     : Implementación =XNTPD (3)
  0x2a     : Código de solicitud = 42 (REQ_MON_GETLIST_1)
  0x0006   : Elementos en este fragmento = 6 estructuras IP
  0x0048   : Tamaño de cada ítem = 72 bytes (0x48)

--- RESUMEN DE VOLUMEN EMITIDO POR REFLECTOR ---
Entradas MRU reportadas : ${mruIpCount} direcciones IP
Fragmentos UDP enviados : ${metrics.responsePacketsPerReflector} paquetes
Volumen total devuelto  : ${metrics.responseBytesPerReflector} bytes (BAF ${metrics.baf}:1)`}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

