import type { Metadata } from 'next'
import './globals.css'
import { TopBar } from '@/components/TopBar'

export const metadata: Metadata = {
  title: 'autobuild ▸ control',
  description: 'Operations console for the autobuild Web3 product factory.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <TopBar />
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  )
}
