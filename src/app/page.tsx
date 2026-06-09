import Link from "next/link"
import { ArrowRight, Monitor, Phone, BarChart3 } from "lucide-react"

export default function Home() {
  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center gap-10 p-8">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-md">
            <span className="text-xl font-black text-white">CR</span>
          </div>
          <h1 className="text-4xl font-black text-gray-900">Creditum Portal</h1>
        </div>
        <p className="text-gray-500 text-lg">Portal de gestão interno da equipe SDR</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
        <Link
          href="/cockpit"
          className="group flex flex-col gap-3 p-6 rounded-xl border border-blue-200 bg-white shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
        >
          <Monitor className="w-6 h-6 text-blue-600" />
          <div>
            <div className="font-bold text-gray-900 mb-1">SDR Cockpit</div>
            <div className="text-xs text-gray-500">Dashboard em tempo real para TV</div>
          </div>
          <ArrowRight className="w-4 h-4 text-blue-500 group-hover:translate-x-1 transition-transform mt-auto" />
        </Link>

        <div className="flex flex-col gap-3 p-6 rounded-xl border border-gray-200 bg-white opacity-40 cursor-not-allowed">
          <Phone className="w-6 h-6 text-purple-500" />
          <div>
            <div className="font-bold text-gray-900 mb-1">Análise de Ligações</div>
            <div className="text-xs text-gray-500">IA — em breve</div>
          </div>
          <span className="text-xs text-gray-400 mt-auto">Módulo 2</span>
        </div>

        <div className="flex flex-col gap-3 p-6 rounded-xl border border-gray-200 bg-white opacity-40 cursor-not-allowed">
          <BarChart3 className="w-6 h-6 text-emerald-500" />
          <div>
            <div className="font-bold text-gray-900 mb-1">Relatórios</div>
            <div className="text-xs text-gray-500">Inteligência — em breve</div>
          </div>
          <span className="text-xs text-gray-400 mt-auto">Módulo 3</span>
        </div>
      </div>

      <p className="text-gray-400 text-xs">MVP v0.1 — Módulo 1 ativo</p>
    </div>
  )
}
