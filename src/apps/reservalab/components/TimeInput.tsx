import { useState, type ChangeEvent, type FocusEvent } from 'react'

interface TimeInputProps {
  label: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
}

export function TimeInput({ label, placeholder = '00h00', value, onChange }: TimeInputProps) {
  const [focused, setFocused] = useState(false)

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d]/g, '')
    if (raw.length <= 4) {
      if (raw.length >= 3) {
        onChange(`${raw.slice(0, 2)}h${raw.slice(2)}`)
      } else {
        onChange(raw)
      }
    }
  }

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    setFocused(false)
    const raw = e.target.value.replace(/[^\d]/g, '')
    if (raw.length === 4) {
      onChange(`${raw.slice(0, 2)}h${raw.slice(2)}`)
    }
  }

  return (
    <div>
      <label style={{
        display: 'block',
        fontSize: '13px',
        fontWeight: 600,
        color: '#52525b',
        marginBottom: '4px',
      }}>
        {label}
      </label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: '8px',
          border: '1px solid #e4e4e7',
          background: '#ffffff',
          fontSize: '14px',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.2s, box-shadow 0.2s',
          ...(focused ? { borderColor: '#6366f1', boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.1)' } : {}),
        }}
      />
    </div>
  )
}
