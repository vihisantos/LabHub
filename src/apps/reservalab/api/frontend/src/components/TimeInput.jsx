import { useRef } from 'react'

function fmt(digits) {
  if (digits.length === 0) return ''
  if (digits.length === 1) return digits
  if (digits.length === 2) return digits + 'h'
  if (digits.length === 3) return digits[0] + digits[1] + 'h' + digits[2]
  return digits[0] + digits[1] + 'h' + digits[2] + digits[3]
}

function rawDigits(v) {
  return v ? v.replace(/\D/g, '').slice(0, 4) : ''
}

export default function TimeInput({ value, onChange, label, placeholder }) {
  const ref = useRef(null)

  const handleChange = (e) => {
    const digits = rawDigits(e.target.value)
    if (digits.length > 4) return
    const formatted = fmt(digits)
    if (formatted !== value) onChange(formatted)
  }

  const handleBlur = () => {
    const d = rawDigits(value)
    if (d.length === 1) onChange(fmt('0' + d + '00'))
    else if (d.length === 2) onChange(fmt(d + '00'))
    else if (d.length === 3) onChange(fmt(d + '0'))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Backspace' && value) {
      const d = rawDigits(value)
      if (d.length === 2) {
        onChange(fmt(d.slice(0, 1)))
        e.preventDefault()
      } else if (d.length === 3) {
        onChange(fmt(d.slice(0, 2)))
        e.preventDefault()
      }
    }
  }

  return (
    <div>
      {label && (
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#52525b', marginBottom: '4px' }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          placeholder={placeholder || '00h00'}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: '8px',
            border: '1px solid #e4e4e7', background: '#ffffff', fontSize: '14px',
            outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace',
            letterSpacing: '0.05em',
          }}
        />
        <span style={{
          position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
          fontSize: '11px', color: '#a1a1aa', pointerEvents: 'none',
        }}>
          min
        </span>
      </div>
    </div>
  )
}
