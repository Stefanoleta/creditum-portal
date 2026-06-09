export const metadata = {
  title: "SDR Cockpit | Creditum Portal",
}

export default function CockpitLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="w-screen h-screen overflow-hidden bg-zinc-950">
      {children}
    </div>
  )
}
