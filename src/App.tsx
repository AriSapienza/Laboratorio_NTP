import React, { useEffect, useState, useCallback } from 'react';
import { SceneId, ThemeMode } from './types/lab';
import { HeaderStepper } from './components/HeaderStepper';
import { ForenseScene } from './scenes/ForenseScene';
import { SpoofScene } from './scenes/SpoofScene';
import { DdosScene } from './scenes/DdosScene';
import { PresenterWindow } from './components/PresenterWindow';
import { subscribePresenterCommands } from './sim/broadcast';

function parseHashScene(): SceneId {
  const hash = window.location.hash.replace('#', '').toLowerCase();
  if (hash === 'forense' || hash === 'spoof' || hash === 'ddos' || hash === 'presenter') {
    return hash;
  }
  return 'forense';
}

export const App: React.FC = () => {
  const [activeScene, setActiveScene] = useState<SceneId>(parseHashScene);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('ntp-lab-theme');
      return saved === 'light' || saved === 'dark' ? saved : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [presentationMode, setPresentationMode] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);

  // Sincronización con hash de URL (Requisito G2)
  const navigateToScene = useCallback((scene: SceneId) => {
    window.location.hash = `#${scene}`;
    setActiveScene(scene);
  }, []);

  useEffect(() => {
    const onHashChange = () => setActiveScene(parseHashScene());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Persistencia de Tema Claro/Oscuro (Requisito G11)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('ntp-lab-theme', theme);
    } catch {}
  }, [theme]);

  // Ocultar cursor tras 3 s sin movimiento en Modo Exposición (Requisito G7)
  useEffect(() => {
    if (!presentationMode) {
      setCursorHidden(false);
      return;
    }
    let timer: number = window.setTimeout(() => setCursorHidden(true), 3000);
    const handleMouseMove = () => {
      setCursorHidden(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setCursorHidden(true), 3000);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [presentationMode]);

  const togglePresentationMode = useCallback(() => {
    setPresentationMode((prev) => {
      const next = !prev;
      if (next && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (!next && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      return next;
    });
  }, []);

  // Sincroniza presentationMode si el usuario sale de pantalla completa con la tecla Esc nativa del navegador (Bug #5)
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setPresentationMode(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Escucha comandos bidireccionales enviados desde la Ventana de Presentador (#presenter) (Mejora #2)
  useEffect(() => {
    if (activeScene === 'presenter') return;
    return subscribePresenterCommands((cmd) => {
      if (cmd.action === 'navigate') {
        navigateToScene(cmd.scene);
      } else if (cmd.action === 'reset') {
        setResetSignal((s) => s + 1);
      }
    });
  }, [activeScene, navigateToScene]);


  // Atajos Globales de Teclado: 1..3, F, R (Requisitos G2, G7, G9)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (activeScene === 'presenter') return;

      switch (e.key) {
        case '1':
          navigateToScene('forense');
          break;
        case '2':
          navigateToScene('spoof');
          break;
        case '3':
          navigateToScene('ddos');
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          togglePresentationMode();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          setResetSignal((s) => s + 1);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeScene, navigateToScene, togglePresentationMode]);

  const openPresenterWindow = () => {
    try {
      const url = `${window.location.href.split('#')[0]}#presenter`;
      window.open(url, 'NtpPresenterView', 'width=960,height=720');
    } catch {
      window.location.hash = '#presenter';
    }
  };

  if (activeScene === 'presenter') {
    return <PresenterWindow theme={theme} />;
  }

  return (
    <div
      className={`min-h-screen flex flex-col ${presentationMode ? 'presentation-mode' : ''} ${
        cursorHidden ? 'presentation-cursor-hidden' : ''
      }`}
    >
      <HeaderStepper
        activeScene={activeScene}
        onSelectScene={navigateToScene}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        presentationMode={presentationMode}
        onTogglePresentation={togglePresentationMode}
        onOpenPresenterWindow={openPresenterWindow}
      />

      {activeScene === 'forense' && (
        <ForenseScene key={`forense-${resetSignal}`} theme={theme} presentationMode={presentationMode} />
      )}
      {activeScene === 'spoof' && (
        <SpoofScene key={`spoof-${resetSignal}`} theme={theme} presentationMode={presentationMode} />
      )}
      {activeScene === 'ddos' && (
        <DdosScene key={`ddos-${resetSignal}`} theme={theme} presentationMode={presentationMode} />
      )}
    </div>
  );
};

export default App;

