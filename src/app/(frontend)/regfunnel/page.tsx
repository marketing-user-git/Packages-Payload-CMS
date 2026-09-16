'use client'

import dynamic from 'next/dynamic'

const RegFunnelDashboard = dynamic(() => import('./RegFunnelDashboard'), { ssr: false })

export default function RegFunnelPage() {
  return (
    <RegFunnelDashboard
      onBack={undefined}
      user={undefined}
      onLogout={undefined}
      theme={undefined}
      onToggleTheme={undefined}
    />
  )
}
