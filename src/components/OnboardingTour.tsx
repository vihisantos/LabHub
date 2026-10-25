import React, { useEffect, useState } from 'react';
import './OnboardingTour.css';

type TourStep = {
  selector: string; // CSS selector for element to highlight
  title: string; // short title shown in tooltip
  description: string; // detailed description
};

// Adjust these steps to match elements in your UI
const STEPS: TourStep[] = [
  { selector: '#menuButton', title: 'Menu', description: 'Clique aqui para abrir o menu principal.' },
  { selector: '.searchInput', title: 'Busca', description: 'Digite aqui o que deseja procurar.' },
  { selector: '.profileLink', title: 'Perfil', description: 'Acesse seu perfil e configurações.' },
];

const OnboardingTour: React.FC = () => {
  const [current, setCurrent] = useState(0);
  const [show, setShow] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!localStorage.getItem('onboardingCompleted')) setShow(true);
  }, []);

  useEffect(() => {
    if (!show) return;
    const el = document.querySelector(STEPS[current].selector) as HTMLElement | null;
    if (el) setRect(el.getBoundingClientRect());
    else setTimeout(() => setCurrent(c => Math.min(c + 1, STEPS.length - 1)), 500);
  }, [current, show]);

  const next = () => setCurrent(c => (c < STEPS.length - 1 ? c + 1 : c));
  const prev = () => setCurrent(c => (c > 0 ? c - 1 : c));
  const finish = () => { localStorage.setItem('onboardingCompleted', 'true'); setShow(false); };

  if (!show) return null;
  const step = STEPS[current];
  const tipStyle: React.CSSProperties = rect ? { top: rect.bottom + 8, left: rect.left, maxWidth: '300px' } : {};

  return (
    <div className="onboarding-tour-backdrop">
      <div className="onboarding-tour-overlay" />
      {rect && (
        <div className="onboarding-tour-highlight" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
      )}
      <div className="onboarding-tour-tooltip" style={tipStyle}>
        <h3>{step.title}</h3>
        <p>{step.description}</p>
        <div className="controls">
          {current > 0 && <button onClick={prev}>Anterior</button>}
          <button onClick={next}>{current === STEPS.length - 1 ? 'Concluir' : 'Próximo'}</button>
          <button onClick={finish}>Pular</button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingTour;
