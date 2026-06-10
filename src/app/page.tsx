import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Monitor, Phone, BarChart3 } from "lucide-react"

export default function Home() {
  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center gap-10 p-8">
      <div className="text-center">
        <div className="flex items-center justify-center mb-4">
          <Image
            src="/logo-creditum.png"
            alt="Creditum"
            height={40}
            width={112}
            priority
            className="object-contain"
          />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Portal de Gestão</h1>
        <p className="text-gray-500">Equipe SDR — uso interno</p>
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

        <Link
          href="/analise"
          className="group flex flex-col gap-3 p-6 rounded-xl border border-purple-200 bg-white shadow-sm hover:shadow-md hover:border-purple-300 transition-all"
        >
          <Phone className="w-6 h-6 text-purple-500" />
          <div>
            <div className="font-bold text-gray-900 mb-1">Análise de Ligações</div>
            <div className="text-xs text-gray-500">Transcrição e análise com IA</div>
          </div>
          <ArrowRight className="w-4 h-4 text-purple-500 group-hover:translate-x-1 transition-transform mt-auto" />
        </Link>

        <Link
          href="/relatorios"
          className="group flex flex-col gap-3 p-6 rounded-xl border border-teal-200 bg-white shadow-sm hover:shadow-md hover:border-teal-300 transition-all"
        >
          <BarChart3 className="w-6 h-6 text-teal-600" />
          <div>
            <div className="font-bold text-gray-900 mb-1">Relatórios</div>
            <div className="text-xs text-gray-500">Hoje, intraday, operadores e histórico</div>
          </div>
          <ArrowRight className="w-4 h-4 text-teal-500 group-hover:translate-x-1 transition-transform mt-auto" />
        </Link>
      </div>

      <p className="text-gray-400 text-xs">v0.3 — Módulos 1, 2 e 3 ativos</p>
    </div>
  )
}
