import { useId } from 'react'

interface StarsProps {
  value: number
  onChange?: (value: number) => void
  size?: number
  disabled?: boolean
}

const STAR_PATH =
  'M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z'

export function Stars({ value, onChange, size = 22, disabled }: StarsProps) {
  const interactive = Boolean(onChange) && !disabled
  const groupName = `labhub-feedback-rating-${useId().replace(/:/g, '')}`

  return (
    <fieldset
      className={`labhub-rating ${interactive ? 'labhub-rating--interactive' : ''}`}
      aria-label="Avaliação"
      disabled={disabled}
    >
      <legend className="sr-only">Avaliação de 1 a 5 estrelas</legend>
      {[1, 2, 3, 4, 5].map((n) => {
        const id = `${groupName}-star-${n}`
        return (
          <div key={n} className="labhub-rating__item">
            <input
              id={id}
              type="radio"
              name={groupName}
              value={n}
              checked={value === n}
              onChange={() => onChange?.(n)}
              className="labhub-rating__input"
              aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
            />
            <label htmlFor={id} className="labhub-rating__label" title={`${n} estrela${n > 1 ? 's' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
                <path pathLength={360} d={STAR_PATH} />
              </svg>
            </label>
          </div>
        )
      })}
      <style>{`
        .labhub-rating{display:inline-flex;flex-direction:row-reverse;align-items:center;justify-content:center;gap:.3rem;margin:0;padding:0;border:0;min-inline-size:0;--rating-stroke:var(--fg-dim);--rating-fill:var(--accent)}
        .labhub-rating__item{position:relative;display:inline-flex}
        .labhub-rating__input{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
        .labhub-rating__label{display:inline-flex;align-items:center;justify-content:center;border-radius:.35rem;cursor:default}
        .labhub-rating--interactive .labhub-rating__label{cursor:pointer}
        .labhub-rating__label svg{display:block;overflow:visible;fill:transparent;stroke:var(--rating-stroke);stroke-width:1.2px;stroke-linejoin:bevel;stroke-dasharray:12;animation:labhub-rating-idle 4s linear infinite;transition:stroke .2s,fill .5s,transform .2s}
        .labhub-rating--interactive .labhub-rating__label:hover svg,.labhub-rating--interactive .labhub-rating__label:hover~.labhub-rating__item .labhub-rating__label svg{stroke:var(--rating-fill)}
        .labhub-rating__input:checked~.labhub-rating__label svg{animation:labhub-rating-idle 4s linear infinite,labhub-rating-yippee .75s backwards;fill:var(--rating-fill);stroke:var(--rating-fill);stroke-opacity:0;stroke-dasharray:0;stroke-linejoin:miter;stroke-width:8px}
        .labhub-rating__input:focus-visible~.labhub-rating__label{outline:2px solid var(--accent);outline-offset:3px}
        @keyframes labhub-rating-idle{from{stroke-dashoffset:24}}
        @keyframes labhub-rating-yippee{0%{transform:scale(1);fill:var(--rating-fill);fill-opacity:0;stroke-opacity:1;stroke:var(--rating-stroke);stroke-dasharray:10;stroke-width:1px;stroke-linejoin:bevel}30%{transform:scale(0);fill:var(--rating-fill);fill-opacity:0;stroke-opacity:1;stroke:var(--rating-stroke);stroke-dasharray:10;stroke-width:1px;stroke-linejoin:bevel}30.1%{stroke:var(--rating-fill);stroke-dasharray:0;stroke-linejoin:miter;stroke-width:8px}60%{transform:scale(1.2);fill:var(--rating-fill)}}
        @media (prefers-reduced-motion:reduce){.labhub-rating__label svg,.labhub-rating__input:checked~.labhub-rating__label svg{animation:none;transition:none}}
      `}</style>
    </fieldset>
  )
}
