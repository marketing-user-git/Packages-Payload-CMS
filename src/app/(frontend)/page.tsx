'use client'
import dynamic from 'next/dynamic'

// AppShell handles Payload auth + the role-gated app picker,
// then hands off to the Packages dashboard (or Analytics, coming next).
const AppShell = dynamic(() => import('./AppShell'), { ssr: false })

export default function Page() {
  return <AppShell />
}
