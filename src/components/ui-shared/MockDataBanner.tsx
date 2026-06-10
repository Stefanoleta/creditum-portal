"use client"

interface MockDataBannerProps {
  isDemo: boolean
  reason?: string
}

export function MockDataBanner({ isDemo, reason }: MockDataBannerProps) {
  if (!isDemo) return null

  return (
    <div className="w-full bg-red-600 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-bold z-50 shadow-sm">
      <span className="text-base leading-none">⚠️</span>
      <span>
        DADOS DEMO — Argus indisponível. Estas informações NÃO são reais.
      </span>
      {reason && (
        <span className="font-normal text-red-200 text-xs hidden sm:inline">
          ({reason})
        </span>
      )}
    </div>
  )
}
