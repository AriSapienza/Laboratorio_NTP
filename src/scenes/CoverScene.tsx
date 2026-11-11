import React, { useEffect } from 'react';
import { Clock, FileSearch, ShieldAlert, Activity, ArrowRight, CheckCircle2 } from 'lucide-react';
import { SceneId, ThemeMode } from '../types/lab';
import { broadcastPresenterState } from '../sim/broadcast';


interface CoverSceneProps {
  onSelectScene: (scene: SceneId) => void;
  theme: ThemeMode;
}

const SCENE_CARDS: {
  id: SceneId;
  keyNum: string;
  title: string;
  subtitle: string;
  takeaway: string;
  icon: React.ReactNode;
  accent: string;
}[] = [
  {
    id: 'sync',
    keyNum: '1',
    title: 'Escena 1 · Sincronización RFC 5905',
    subtitle: 'Intercambio T1..T4, cálculo de θ y δ, y sesgo por ruta asimétrica',
    takeaway: 'Cuatro marcas alcanzan para calcular el desfase, pero la asimetría deja un error irreducible.',
    icon: <Clock className="w-7 h-7 text-sky-400" />,
    accent: 'border-sky-500/40 hover:border-sky-400',
  },
  {
    id: 'forense',
    keyNum: '2',
    title: 'Escena 2 · Peritaje Forense y SIEM',
    subtitle: 'Impacto del clock drift en la correlación de evidencias judiciales',
    takeaway: 'Si los relojes no están sincronizados, un registro puede invertir el orden real de los hechos.',
    icon: <FileSearch className="w-7 h-7 text-emerald-400" />,
    accent: 'border-emerald-500/40 hover:border-emerald-400',
  },
  {
    id: 'spoof',
    keyNum: '3',
    title: 'Escena 3 · Time Spoofing y NTS',
    subtitle: 'Ataque MitM sobre UDP 123 vs protección criptográfica RFC 8915',
    takeaway: 'Un solo paquete UDP sin autenticar rompe 2FA, Kerberos, ARCA y TLS; NTS lo vuelve inútil.',
    icon: <ShieldAlert className="w-7 h-7 text-amber-400" />,
    accent: 'border-amber-500/40 hover:border-amber-400',
  },
  {
    id: 'ddos',
    keyNum: '4',
    title: 'Escena 4 · Amplificación DDoS (monlist)',
    subtitle: 'Reflexión Modo 7 (BAF 205:1 / 556,9:1) y mitigación en ntp.conf',
    takeaway: 'Una petición de 234 B genera 48.000 B hacia la víctima; dos líneas de configuración lo impiden.',
    icon: <Activity className="w-7 h-7 text-rose-400" />,
    accent: 'border-rose-500/40 hover:border-rose-400',
  },
];

export const CoverScene: React.FC<CoverSceneProps> = ({ onSelectScene, theme }) => {
  const isDark = theme === 'dark';

  // Sincroniza la ventana #presenter al montar la portada o volver a ella al cierre (Mejora #1)
  useEffect(() => {
    broadcastPresenterState({
      scene: 'cover',
      t: 0,
      duration: 1,
      playing: false,
      speed: 1,
      stepIndex: 0,
      totalSteps: 1,
      narration: 'La hora sostiene la precisión, la validez probatoria y la seguridad criptográfica.',
      activePreset: 'cover',
    });
  }, []);

  return (
    <main className="min-h-[calc(100vh-3.5rem)] py-6 px-8 flex flex-col justify-between max-w-7xl mx-auto scene-transition">
      {/* Encabezado Académico y Pregunta Disparadora */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span
            className={`px-3.5 py-1 rounded-full border font-mono text-sm font-semibold ${
              isDark
                ? 'bg-sky-500/15 border-sky-500/40 text-sky-400'
                : 'bg-sky-500/15 border-sky-600/50 text-sky-800'
            }`}
          >
            Universidad Nacional Arturo Jauretche (UNAJ) · Redes de Computadoras II (2026)
          </span>
          <span className="font-mono text-sm opacity-80">
            Docente: <strong>Iriarte Leandro</strong>
          </span>
        </div>

        <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-tight">
          ¿Qué pasa en una infraestructura de red si la hora está mal?
        </h1>

        <p className={`text-xl max-w-4xl ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
          La sincronización horaria no es un detalle administrativo: sostiene la validez de la prueba digital, la
          facturación electrónica y los protocolos criptográficos modernos.
        </p>
      </div>

      {/* Cuatro Tarjetas de Escenas (Requisito G1) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 my-4">
        {SCENE_CARDS.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelectScene(card.id)}
            className={`p-6 rounded-2xl border-2 text-left transition-all flex flex-col justify-between group ${
              card.accent
            } ${isDark ? 'bg-slate-900/90 hover:bg-slate-900' : 'bg-white hover:bg-slate-50 shadow-md'}`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">{card.icon}</div>
                <span className="px-3 py-1 rounded-lg font-mono text-sm font-bold bg-slate-800 text-slate-200">
                  Tecla {card.keyNum}
                </span>
              </div>
              <h2 className="text-2xl font-bold group-hover:text-sky-400 transition-colors">{card.title}</h2>
              <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{card.subtitle}</p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
              <p className="text-base font-medium">{card.takeaway}</p>
              <ArrowRight className="w-5 h-5 shrink-0 text-sky-400 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        ))}
      </div>

      {/* Pie de Portada: Síntesis en Tres Pilares y Equipo */}
      <div
        className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${
          isDark ? 'bg-slate-900/70 border-slate-800' : 'bg-slate-100 border-slate-300'
        }`}
      >
        <div className="flex flex-wrap items-center gap-6 text-sm font-medium">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-sky-400" />
            <strong>1. Precisión:</strong> RFC 5905, estratos y límite de asimetría
          </span>
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <strong>2. Evidencia:</strong> Correlación SIEM y trazabilidad legal
          </span>
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
            <strong>3. Seguridad:</strong> Estándar NTS (RFC 8915) y mitigación DDoS
          </span>
        </div>

        <div className="text-sm font-mono opacity-85">
          <strong>Equipo:</strong> Alvarez Alegre N. · Araujo J. · More A. G. · Sapienza N. A.
        </div>
      </div>
    </main>
  );
};

