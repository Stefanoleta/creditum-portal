import { createHmac } from "crypto"

// CPF nunca é salvo, logado ou retornado em API.
// O hash permite matching por CPF sem expor o dado — LGPD compliance.
// Requer CPF_HASH_SECRET no ambiente de servidor (Vercel env vars + .env.local).
export function hashCpf(cpf: string): string | null {
  const digits = cpf.replace(/\D/g, "")
  if (digits.length !== 11) return null
  const secret = process.env.CPF_HASH_SECRET
  if (!secret) throw new Error("CPF_HASH_SECRET não configurado")
  return createHmac("sha256", secret).update(digits).digest("hex")
}
