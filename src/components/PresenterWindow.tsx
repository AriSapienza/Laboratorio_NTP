import React, { useEffect, useState } from 'react';
import {
  Timer,
  Play,
  Pause,
  RotateCcw,
  Radio,
  MessageSquare,
  ArrowRightCircle,
  ShieldAlert,
  CheckCircle2,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { PresenterSyncMessage, SceneId, ThemeMode } from '../types/lab';
import { sendPresenterCommand } from '../sim/broadcast';


interface PresenterWindowProps {
  theme: ThemeMode;
}

interface ScriptSegment {
  scene: SceneId;
  keyShortcut: string;
  timeRange: string;
  startSec: number;
  endSec: number;
  title: string;
  operatorActions: string[];
  keySentence: string;
  bridgePhrase?: string;
}

const DEMO_SCRIPT: ScriptSegment[] = [
  {
    scene: 'cover',
    keyShortcut: '0',
    timeRange: '0:00 – 1:00',
    startSec: 0,
    endSec: 60,
    title: 'Apertura · Portada',
    operatorActions: [
      'Presentar al equipo y plantear la pregunta disparadora: ¿qué pasa si la hora está mal?',
      'Señalar los tres ejes (precisión, evidencia forense y seguridad) y pulsar la tecla 1.',
    ],
    keySentence: 'La hora es una dependencia crítica de la seguridad, la facturación y la prueba digital.',
    bridgePhrase: 'Veamos primero cómo calcula NTP la hora exacta sobre una red con demora variable.',
  },
  {
    scene: 'sync',
    keyShortcut: '1',
    timeRange: '1:00 – 4:00',
    startSec: 60,
    endSec: 240,
    title: 'Escena 1 · Sincronización (RFC 5905)',
    operatorActions: [
      'Ejecutar el preset "Enlace simétrico" y leer en voz alta θ (desfase) y δ (demora).',
      'Cambiar al preset "Enlace asimétrico" (ida 40 ms, vuelta 200 ms) y pulsar "Corregir reloj": mostrar el error residual de 80 ms.',
      'Hacer clic en el paquete (30 s) para mostrar la Trama 107/108 de 90 bytes en el Inspector.',
    ],
    keySentence: 'Cuatro marcas alcanzan para calcular el desfase, pero la asimetría deja un error irreducible.',
    bridgePhrase:
      'Si un reloj se equivoca por milisegundos es un detalle; si se equivoca por minutos, puede cambiar una causa judicial.',
  },
  {
    scene: 'forense',
    keyShortcut: '2',
    timeRange: '4:00 – 7:30',
    startSec: 240,
    endSec: 450,
    title: 'Escena 2 · Peritaje Forense y SIEM',
    operatorActions: [
      'Activar el preset "Caso 22:15": mostrar que las horas son incorrectas pero el orden se conserva.',
      'Cambiar al preset "Orden invertido": señalar que la apertura de la puerta aparece al final del SIEM.',
      'Pulsar "Sincronizar con NTP" para llevar las derivas a 0 s y abrir brevemente la vista terminal (chronyc / ntpq).',
    ],
    keySentence: 'Un registro desfasado puede contar otra historia; sincronizar restituye el orden.',
    bridgePhrase: '¿Y si alguien lo desajusta a propósito?',
  },
  {
    scene: 'spoof',
    keyShortcut: '3',
    timeRange: '7:30 – 11:00',
    startSec: 450,
    endSec: 660,
    title: 'Escena 3 · Time Spoofing y NTS (RFC 8915)',
    operatorActions: [
      'Probar vectores +45 s (falla TOTP), +10 min (caen Kerberos y ARCA) y -5 años sin NTS.',
      'Activar el interruptor NTS: mostrar el handshake NTS-KE (TCP 4460), el sello roto en el paquete alterado y los 5 servicios en verde.',
      'Abrir el Inspector para señalar los 4 campos de extensión NTS.',
    ],
    keySentence: 'Un paquete UDP sin autenticar alcanza para dañar los servicios; NTS lo hace inútil.',
    bridgePhrase: 'El mismo protocolo tiene otra debilidad: puede usarse como arma contra terceros.',
  },
  {
    scene: 'ddos',
    keyShortcut: '4',
    timeRange: '11:00 – 14:00',
    startSec: 660,
    endSec: 840,
    title: 'Escena 4 · Amplificación DDoS (monlist)',
    operatorActions: [
      'Lanzar con 600 IPs (y mostrar casilla Caso US-CERT 556,9:1): observar la saturación de la víctima antes de los 3 s.',
      'Activar cualquier directiva de ntp.conf (disable monitor / noquery): el escudo corta el flujo y el tráfico cae a 0 B.',
      'Pulsar la tecla 0 para regresar a la portada para el cierre.',
    ],
    keySentence: 'Una petición chica provoca una respuesta enorme; dos líneas de configuración lo evitan.',
    bridgePhrase: 'Volvamos a la portada para sintetizar las tres conclusiones del trabajo.',
  },
];

function formatStopwatch(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const PresenterWindow: React.FC<PresenterWindowProps> = ({ theme }) => {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [syncState, setSyncState] = useState<PresenterSyncMessage>({
    scene: 'cover',
    t: 0,
    duration: 2.5,
    playing: false,
    speed: 1,
    stepIndex: 0,
    totalSteps: 1,
    narration: 'Esperando sincronización con la ventana principal del proyector...',
    activePreset: 'default',
  });

  const isDark = theme === 'dark';

  // Cronómetro maestro de la exposición (objetivo 15:00 min = 900 s, colchón hasta 17:00 = 1020 s)
  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  // Recepción en tiempo real desde la ventana proyectada vía BroadcastChannel
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        ch = new BroadcastChannel('ntp-lab-channel');
        ch.onmessage = (ev: MessageEvent<PresenterSyncMessage>) => {
          if (ev.data && ev.data.scene && ev.data.type !== ('presenter-cmd' as unknown)) {
            setSyncState(ev.data);
          }
        };
      }
    } catch {
      ch = null;
    }
    return () => {
      try {
        ch?.close();
      } catch {}
    };
  }, []);

  // Atajos remotos desde la ventana del presentador hacia la ventana principal (Mejora #2)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case '0':
          sendPresenterCommand({ type: 'presenter-cmd', action: 'navigate', scene: 'cover' });
          break;
        case '1':
          sendPresenterCommand({ type: 'presenter-cmd', action: 'navigate', scene: 'sync' });
          break;
        case '2':
          sendPresenterCommand({ type: 'presenter-cmd', action: 'navigate', scene: 'forense' });
          break;
        case '3':
          sendPresenterCommand({ type: 'presenter-cmd', action: 'navigate', scene: 'spoof' });
          break;
        case '4':
          sendPresenterCommand({ type: 'presenter-cmd', action: 'navigate', scene: 'ddos' });
          break;
        case ' ':
          e.preventDefault();
          sendPresenterCommand({ type: 'presenter-cmd', action: 'togglePlay' });
          break;
        case 'ArrowRight':
          e.preventDefault();
          sendPresenterCommand({ type: 'presenter-cmd', action: 'nextStep' });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          sendPresenterCommand({ type: 'presenter-cmd', action: 'prevStep' });
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          sendPresenterCommand({ type: 'presenter-cmd', action: 'reset' });
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);


  const currentScript =
    DEMO_SCRIPT.find((s) => s.scene === syncState.scene) || DEMO_SCRIPT[0];

  const isOverTarget = elapsedSec >= 900; // > 15:00 min

  return (
    <div
      className={`min-h-screen p-6 flex flex-col justify-between gap-4 ${
        isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* Barra Superior: Cronómetro General de 15 Minutos + Estado de Sincronización */}
      <header className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-sky-500/20 border border-sky-500/40 text-sky-400">
            <Timer className="w-7 h-7" />
          </div>
          <div>
            <span className="text-sm font-mono uppercase text-sky-400">
              Ventana de Presentador (Requisito G14)
            </span>
            <h1 className="text-2xl font-bold">Guion en Vivo y Control de Tiempos (Meta: 15:00 min)</h1>
          </div>
        </div>

        {/* Cronómetro y Controles */}
        <div className="flex items-center gap-3">
          <div
            className={`px-4 py-2 rounded-xl border font-mono tabular-nums text-3xl font-extrabold ${
              isOverTarget
                ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                : 'bg-slate-950 border-slate-700 text-emerald-400'
            }`}
          >
            {formatStopwatch(elapsedSec)} <span className="text-base font-normal opacity-70">/ 15:00</span>
          </div>

          <button
            type="button"
            onClick={() => setTimerRunning((r) => !r)}
            className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm flex items-center gap-2"
          >
            {timerRunning ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            <span>{timerRunning ? 'Pausar reloj' : 'Iniciar reloj'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTimerRunning(false);
              setElapsedSec(0);
            }}
            className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700"
            title="Reiniciar cronómetro"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Cuerpo Central: Estado del Proyector + Guion de la Escena Activa */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1">
        {/* Columna Izquierda (7 cols): Guion del Paso Actual, Acciones y Frase Puente */}
        <div className="lg:col-span-7 p-6 rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-sm font-bold">
                  Bloque {currentScript.timeRange} · Tecla {currentScript.keyShortcut}
                </span>
                <h2 className="text-2xl font-extrabold mt-2">{currentScript.title}</h2>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="text-right font-mono text-sm text-sky-400">
                  <div>Paso {syncState.stepIndex + 1} de {syncState.totalSteps}</div>
                  <div>t = {syncState.t.toFixed(2)}s ({syncState.speed}x)</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => sendPresenterCommand({ type: 'presenter-cmd', action: 'prevStep' })}
                    className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700"
                    title="Paso anterior en proyector (←)"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => sendPresenterCommand({ type: 'presenter-cmd', action: 'togglePlay' })}
                    className="px-2.5 py-1 rounded-lg bg-sky-500 text-slate-950 font-bold text-xs flex items-center gap-1 hover:bg-sky-400"
                    title="Reproducir/Pausar en proyector (Espacio)"
                  >
                    {syncState.playing ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                    <span>{syncState.playing ? 'Pausa' : 'Play'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => sendPresenterCommand({ type: 'presenter-cmd', action: 'nextStep' })}
                    className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700"
                    title="Siguiente paso en proyector (→)"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => sendPresenterCommand({ type: 'presenter-cmd', action: 'reset' })}
                    className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-rose-300 hover:bg-slate-700"
                    title="Reiniciar escena en proyector (R)"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Narración en pantalla del proyector */}
            <div className="p-4 rounded-xl bg-sky-500/15 border border-sky-500/40">
              <div className="text-sm font-mono uppercase text-sky-400 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4" />
                <span>Texto visible ahora en el proyector (Narrador):</span>
              </div>
              <p className="text-xl font-bold mt-1 text-white">&ldquo;{syncState.narration}&rdquo;</p>
            </div>

            {/* Acciones del operador */}
            <div className="space-y-2">
              <h3 className="text-sm font-mono uppercase text-slate-400">
                Acciones del Operador en esta Escena:
              </h3>
              <ul className="space-y-2">
                {currentScript.operatorActions.map((act, i) => (
                  <li
                    key={i}
                    className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-2.5 text-base"
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{act}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Mensaje Clave y Frase Puente */}
          <div className="space-y-3 pt-3 border-t border-slate-800">
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/40">
              <div className="text-sm font-mono uppercase text-emerald-400 font-bold">
                Mensaje Clave (Lo que el público debe recordar):
              </div>
              <p className="text-lg font-bold mt-0.5">{currentScript.keySentence}</p>
            </div>

            {currentScript.bridgePhrase && (
              <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-start gap-3">
                <ArrowRightCircle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-mono uppercase text-amber-300 font-bold">
                    Frase Puente hacia la Siguiente Escena:
                  </div>
                  <p className="text-base font-semibold italic mt-0.5">
                    &ldquo;{currentScript.bridgePhrase}&rdquo;
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Columna Derecha (5 cols): Hoja de Ruta Completa (15 min) y Plan B */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-4">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Radio className="w-4 h-4 text-sky-400" />
                <span>Cronograma Completo de la Demo</span>
              </h3>
              <span className="font-mono text-sm text-slate-400">15 min + 2 min colchón</span>
            </div>

            <div className="space-y-2">
              {DEMO_SCRIPT.map((item) => {
                const isCurrent = item.scene === syncState.scene;
                return (
                  <button
                    type="button"
                    key={item.scene}
                    onClick={() =>
                      sendPresenterCommand({ type: 'presenter-cmd', action: 'navigate', scene: item.scene })
                    }
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isCurrent
                        ? 'bg-sky-500/20 border-sky-400 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono text-sm">
                      <span className="font-bold text-sky-400">
                        [{item.keyShortcut}] {item.title}
                      </span>
                      <span>{item.timeRange}</span>
                    </div>
                    <p className="text-sm mt-1 line-clamp-2">{item.keySentence}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Plan B de Rescate (Sección 8 del Documento de Requerimientos) */}
          <div className="p-5 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-base text-rose-300">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              <span>Plan B · Atajos de Rescate en Vivo</span>
            </div>
            <ul className="text-sm space-y-1.5 font-mono">
              <li>• Animación lenta: Pausar (Espacio) y avanzar con Flecha Derecha (Paso a Paso).</li>
              <li>• Escena en mal estado: Pulsar tecla R para reiniciarla sin recargar la página.</li>
              <li>• Regreso inmediato al inicio: Pulsar tecla 0 (Portada) o tecla F (Pantalla completa).</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

