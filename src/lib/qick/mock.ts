// Mock data for Samantha (Qick AI SDR) — used when QUICK_API_KEY is absent.
// TODO: remove fallback to mock after validating live API in production.
//
// Distribution (150 calls, TMA ~2m30s):
//   5445 engajado          27  (18%)
//   5447 já resolveu       22  (14.7%)
//   5446 não perturbe      12   (8%)
//   116  ligação muda      30  (20%)
//   199  ligação caiu      59  (39.3%)

export interface QickRawCall {
  id: string
  phone: string
  tabbing: { code: string; name: string }
  created_at: string   // ISO UTC
  duration: number     // seconds
}

const TABBINGS: Array<{ code: string; name: string; count: number; durationRange: [number, number] }> = [
  { code: "5445", name: "DEMONSTRA INTENÇÃO EM RESOLVER",   count: 27, durationRange: [150, 360] },
  { code: "5447", name: "CONFIRMOU QUE JÁ RESOLVEU",        count: 22, durationRange: [90,  240] },
  { code: "5446", name: "PEDIU PARA NÃO SER CONTATADO",     count: 12, durationRange: [60,  150] },
  { code: "116",  name: "LIGAÇÃO MUDA",                     count: 30, durationRange: [0,   10]  },
  { code: "199",  name: "LIGAÇÃO CAIU",                     count: 59, durationRange: [5,   25]  },
]

const PHONES = [
  "11987654321", "21976543210", "31965432109", "41954321098", "51943210987",
  "61932109876", "71921098765", "81910987654", "91909876543", "11898765432",
]

function lerp(min: number, max: number, t: number): number {
  return Math.round(min + (max - min) * t)
}

export function getMockCalls(): QickRawCall[] {
  const calls: QickRawCall[] = []
  const baseDate = new Date()
  baseDate.setHours(8, 0, 0, 0)
  const daySeconds = 8 * 60 * 60 // 8h window
  let seq = 0

  for (const tab of TABBINGS) {
    for (let i = 0; i < tab.count; i++) {
      const t = seq / 150
      const offsetSec = Math.round(t * daySeconds)
      const callDate = new Date(baseDate.getTime() + offsetSec * 1000)
      // Deterministic but varied duration using i and tab.code as seed
      const durationT = ((i * 7 + parseInt(tab.code, 10)) % 11) / 10
      const duration = lerp(tab.durationRange[0], tab.durationRange[1], durationT)

      calls.push({
        id: `mock-${tab.code}-${i}`,
        phone: PHONES[(seq + i) % PHONES.length],
        tabbing: { code: tab.code, name: tab.name },
        created_at: callDate.toISOString(),
        duration,
      })
      seq++
    }
  }

  return calls
}
