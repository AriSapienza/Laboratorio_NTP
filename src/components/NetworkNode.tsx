import React from 'react';
import {
  Satellite,
  Server,
  Monitor,
  ShieldAlert,
  Camera,
  DoorOpen,
  Tv,
  Wifi,
  Radio,
} from 'lucide-react';

export type NodeKind =
  | 'gps'
  | 'server'
  | 'client'
  | 'attacker'
  | 'reflector'
  | 'camera'
  | 'door'
  | 'tv'
  | 'router';

interface NetworkNodeProps {
  kind: NodeKind;
  title: string;
  subtitle?: string;
  clockText?: string;
  badgeText?: string;
  statusColor?: 'sky' | 'emerald' | 'amber' | 'rose';
  onClick?: () => void;
}

const COLOR_MAP = {
  sky: 'border-sky-600/70 dark:border-sky-500/60 bg-sky-500/15 dark:bg-sky-500/10 text-sky-950 dark:text-sky-200',
  emerald:
    'border-emerald-600/70 dark:border-emerald-500/60 bg-emerald-500/15 dark:bg-emerald-500/10 text-emerald-950 dark:text-emerald-200',
  amber:
    'border-amber-600/70 dark:border-amber-500/60 bg-amber-500/15 dark:bg-amber-500/10 text-amber-950 dark:text-amber-200',
  rose: 'border-rose-600/70 dark:border-rose-500/60 bg-rose-500/15 dark:bg-rose-500/10 text-rose-950 dark:text-rose-200',
};

export const NetworkNode: React.FC<NetworkNodeProps> = ({
  kind,
  title,
  subtitle,
  clockText,
  badgeText,
  statusColor = 'sky',
  onClick,
}) => {
  const renderIcon = () => {
    const cls = 'w-7 h-7';
    switch (kind) {
      case 'gps':
        return <Satellite className={`${cls} text-amber-400`} />;
      case 'server':
        return <Server className={`${cls} text-sky-400`} />;
      case 'client':
        return <Monitor className={`${cls} text-emerald-400`} />;
      case 'attacker':
        return <ShieldAlert className={`${cls} text-rose-500`} />;
      case 'reflector':
        return <Radio className={`${cls} text-purple-400`} />;
      case 'camera':
        return <Camera className={`${cls} text-sky-400`} />;
      case 'door':
        return <DoorOpen className={`${cls} text-amber-400`} />;
      case 'tv':
        return <Tv className={`${cls} text-emerald-400`} />;
      case 'router':
        return <Wifi className={`${cls} text-indigo-400`} />;
    }
  };

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`p-3.5 rounded-2xl border-2 backdrop-blur-sm transition-transform flex flex-col items-center text-center shadow-lg ${
        COLOR_MAP[statusColor]
      } ${onClick ? 'cursor-pointer hover:scale-[1.03] active:scale-[0.99]' : ''}`}
    >
      {badgeText && (
        <span className="px-2.5 py-0.5 rounded-full text-sm font-mono font-semibold bg-slate-900 text-slate-100 border border-slate-700 mb-2">
          {badgeText}
        </span>
      )}

      <div className="p-2.5 rounded-xl bg-slate-950/85 border border-slate-800 mb-2">
        {renderIcon()}
      </div>

      <div className="font-bold text-base leading-tight">{title}</div>
      {subtitle && <div className="text-sm opacity-90 mt-0.5 font-medium">{subtitle}</div>}

      {clockText && (
        <div className="mt-2 px-3 py-1 rounded-lg bg-slate-950 border border-slate-700 font-mono tabular-nums text-lg font-bold text-white shadow-inner">
          {clockText}
        </div>
      )}
    </div>
  );
};

