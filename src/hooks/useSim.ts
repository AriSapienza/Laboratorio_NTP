import { useEffect, useSyncExternalStore } from 'react';
import { Sim } from '../sim/engine';
import { subscribePresenterCommands } from '../sim/broadcast';

export function useSim(sim: Sim) {
  useSyncExternalStore(sim.subscribe, sim.getSnapshot, sim.getSnapshot);

  // Detiene el requestAnimationFrame al desmontar la escena y escucha comandos remotos desde #presenter
  useEffect(() => {
    const unsubscribeCmds = subscribePresenterCommands((cmd) => {
      if (cmd.action === 'togglePlay') {
        sim.togglePlay();
      } else if (cmd.action === 'nextStep') {
        sim.nextStep();
      } else if (cmd.action === 'prevStep') {
        sim.prevStep();
      }
    });

    return () => {
      unsubscribeCmds();
      sim.pause();
    };
  }, [sim]);

  return {
    t: sim.t,
    duration: sim.duration,
    playing: sim.playing,
    speed: sim.speed,
    events: sim.events,
    currentEventIndex: sim.getCurrentEventIndex(),
    currentEvent: sim.getCurrentEvent(),
  };
}


