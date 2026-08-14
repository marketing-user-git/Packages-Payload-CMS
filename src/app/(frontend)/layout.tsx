import React from 'react'
import './styles.css'

export const metadata = {
  description: 'Internal sales dashboard for tracking and managing Packages Journey clients across all regions.',
  title: 'Packages Journey · easyMarkets',
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
