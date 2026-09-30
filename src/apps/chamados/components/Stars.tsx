import { useId, useState } from 'react'

interface StarsProps {
  value: number
  onChange?: (value: number) => void
  size?: number
  disabled?: boolean
}

const VALUES = [1, 2, 3, 4, 5] as const

/* Path da estrela da referência da issue #311. O `pathLength={360}` no <path>
   normaliza o comprimento do contorno: é o que deixa o tracejado do CSS
   (`stroke-dasharray`) igual em qualquer `size`. */
const STAR_PATH =
  'M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z'

export function Stars({ value, onChange, size = 22, disabled }: StarsProps) {
  const interactive = !disabled && Boolean(onChange)

  /* `useId` é único por instância: cada Stars tem o seu próprio grupo de radios,
     então dois Stars na mesma tela (não acontece hoje, mas o componente não
     pode depender disso) não se anulariam — marcar um desmarca o outro. Os
     caracteres fora de [a-zA-Z0-9_-] saem para o id continuar válido como
     seletor de CSS. */
  const groupName = `stars-rating-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  /* Qual estrela está sob o ponteiro (0 = nenhuma). O hover precisa destacar a
     faixa 1..N, e isso é CSS demais para o `:hover ~ label` da referência — com
     a ordem do DOM da referência ele acende o lado errado do rating. Aqui a
     faixa é calculada a partir de `value`, a mesma fonte de verdade do payload. */
  const [hover, setHover] = useState(0)

  const legend = interactive
    ? 'Avaliação de 1 a 5 estrelas'
    : value > 0
      ? `Avaliação: ${value} de 5 estrelas`
      : 'Sem avaliação registrada'

  return (
    <fieldset className="stars-rating" disabled={!interactive}>
      <legend className="sr-only">{legend}</legend>
      {VALUES.map((n) => {
        const inputId = `${groupName}-${n}`
        return (
          <span
            key={n}
            className="stars-rating__item"
            onMouseEnter={() => {
              if (interactive) setHover(n)
            }}
            onMouseLeave={() => setHover((current) => (current === n ? 0 : current))}
          >
            <input
              id={inputId}
              name={groupName}
              type="radio"
              value={n}
              checked={value === n}
              onChange={() => onChange?.(n)}
              className="stars-rating__input"
              aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
            />
            <label
              htmlFor={inputId}
              className="stars-rating__label"
              data-filled={n <= value}
              data-active={n === value}
              data-hover={interactive && n <= hover}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width={size}
                height={size}
                aria-hidden="true"
                focusable="false"
              >
                <path pathLength={360} d={STAR_PATH} />
              </svg>
            </label>
          </span>
        )
      })}
    </fieldset>
  )
}
