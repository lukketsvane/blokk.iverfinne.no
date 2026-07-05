import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const DESCRIPTION =
  'A sliding block puzzle with realistic wooden building blocks. Slide the planks aside and steer the red cylinder out of the tray.'

export const metadata: Metadata = {
  metadataBase: new URL('https://blokk.iverfinne.no'),
  title: 'bl.okk',
  description: DESCRIPTION,
  applicationName: 'bl.okk',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'bl.okk' },
  openGraph: {
    type: 'website',
    siteName: 'bl.okk',
    title: 'bl.okk',
    description: DESCRIPTION,
    url: 'https://blokk.iverfinne.no',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'bl.okk',
    description: DESCRIPTION,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // draw edge-to-edge under the status bar / home indicator so the game fills
  // the whole screen instead of leaving a coloured safe-area strip at the top
  viewportFit: 'cover',
  colorScheme: 'light',
  themeColor: '#cdc6b8',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="nn" className={`${geistSans.variable} ${geistMono.variable} bg-[#cdc6b8]`}>
      <body className="overflow-hidden bg-[#cdc6b8] font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
