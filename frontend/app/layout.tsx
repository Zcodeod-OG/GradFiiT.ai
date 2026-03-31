import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "ALTER.ai - AI-Powered Virtual Try-On for Fashion",
  description:
    "Try before you buy with ALTER.ai. See how any clothing looks on you instantly with our AI-powered virtual try-on technology.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`font-sans antialiased dark`}>
        {children}
        <Analytics />
        <Toaster />
      </body>
    </html>
  )
}
