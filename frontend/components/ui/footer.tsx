"use client"

import { motion } from "framer-motion"
import { Twitter, Github, Linkedin, Instagram } from "lucide-react"
import { Logo } from "@/components/brand/Logo"

const socials = [
  { icon: Twitter, label: "Twitter", href: "#" },
  { icon: Github, label: "GitHub", href: "#" },
  { icon: Linkedin, label: "LinkedIn", href: "#" },
  { icon: Instagram, label: "Instagram", href: "#" },
]

export function Footer() {
  return (
    <footer className="mt-24 relative">
      <div className="gradient-divider" />

      <div className="surface-panel border-t-0 rounded-none">
        <div className="container-main py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-display font-bold tracking-tight mb-4 text-foreground">Product</h4>
              <ul className="space-y-2">
                <li><a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a></li>
                <li><a href="#demo" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Demo</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-display font-bold tracking-tight mb-4 text-foreground">Company</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">About</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Blog</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-display font-bold tracking-tight mb-4 text-foreground">Resources</h4>
              <ul className="space-y-2">
                <li><a href="/extension" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Browser extension</a></li>
                <li><a href="/support" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Support</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-display font-bold tracking-tight mb-4 text-foreground">Legal</h4>
              <ul className="space-y-2">
                <li><a href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy</a></li>
                <li><a href="/extension/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Extension privacy</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <Logo size={32} withWordmark />


            <div className="flex items-center gap-3">
              {socials.map((social) => (
                <motion.a
                  key={social.label}
                  href={social.href}
                  className="size-10 rounded-full bg-white/75 border border-border flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                  whileHover={{ scale: 1.15, y: -3 }}
                  whileTap={{ scale: 0.95 }}
                  aria-label={social.label}
                >
                  <social.icon className="size-4" />
                </motion.a>
              ))}
            </div>

            <p className="text-sm text-muted-foreground">
              &copy; 2026 GradFiT. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
