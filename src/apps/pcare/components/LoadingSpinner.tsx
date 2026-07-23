export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-violet-400" />
        <p className="text-xs text-fg-dim">Carregando...</p>
      </div>
    </div>
  )
}
