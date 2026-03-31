import type React from "react"
import type { Metadata } from "next"
import { Poppins, Inter } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
})

const inter = Inter({
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "ALTER.ai",
  description: "AI Virtual Try-On",
}

export default function RootLayout({
                                     children,
                                   }: {
  children: React.ReactNode
}) {
  return (
      <html lang="en">
      <body
          className={`${inter.className} antialiased bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 text-gray-800`}
      >
      <div className={poppins.className}>{children}</div>
      <Analytics />
      <Toaster />
      </body>
      </html>
  )
}