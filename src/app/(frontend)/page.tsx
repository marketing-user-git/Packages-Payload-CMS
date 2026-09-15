'use client'
import dynamic from 'next/dynamic'

// AppShellV2 handles Payload auth plus the RegFunnelOps / Analytics app picker.
const AppShell = dynamic(() => import('./AppShellV2'), { ssr: false })

export default function Page() {
  return <AppShell />
}
