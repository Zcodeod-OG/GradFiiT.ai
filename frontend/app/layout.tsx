import type React from "react"
import type { Metadata } from "next"
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { BackendWarmup } from "@/components/BackendWarmup"
import "./globals.css"

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
})

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display",
})

export const metadata: Metadata = {
  title: "GradFiT - Graduate your fit.",
  description: "Wear it before you buy it. Upload one photo, try any outfit from any store on the internet.",
}

export default function RootLayout({
                                     children,
                                   }: {
  children: React.ReactNode
}) {
  return (
      <html lang="en" suppressHydrationWarning>
      <body
          className={`${plusJakarta.variable} ${spaceGrotesk.variable} antialiased bg-background text-foreground`}
      >
      <ThemeProvider>
        <BackendWarmup />
        {children}
        <Analytics />
        <Toaster />
      </ThemeProvider>
      </body>
      </html>
  )
}