import React from 'react'
import './styles.css'
import './app-shell-polish.css'
import './regfunnel-nav-polish.css'

export const metadata = {
  description: 'easyMarkets internal marketing operations and analytics workspace.',
  title: 'RegFunnelOps · easyMarkets',
  icons: {
    icon: '/favicon.ico',
  },
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <main>{children}</main>
      </body>
    </html>
  )
}
