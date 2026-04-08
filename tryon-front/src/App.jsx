import { Routes, Route } from "react-router-dom"

import Navbar from "./components/Navbar"
import Footer from "./components/Footer"

import Hero from "./sections/Hero"
import Demo from "./sections/Demo"
import Features from "./sections/Features"
import Process from "./sections/Process"
import SocialProof from "./sections/SocialProof"
import CTA from "./sections/CTA"

import Pricing from "./pages/Pricing"
import TryOn from "./pages/TryOn"
import FeaturesPage from "./pages/FeaturesPage"
import HowItWorks from "./pages/HowItWorks"
import Login from "./pages/Login.jsx"

function Home() {
    return (
        <>
            <Hero />
            <Demo />
            <Features />
            <Process />
            <SocialProof />
            <CTA />
        </>
    )
}

function App() {
    return (
        <>
            <Navbar />

            <main className="pt-24">
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/pricing" element={<Pricing />} />
                    <Route path="/try-on" element={<TryOn />} />
                    <Route path="/features" element={<FeaturesPage />} />
                    <Route path="/how-it-works" element={<HowItWorks />} />
                    <Route path="/login" element={<Login />} />   {/* ADD THIS */}
                </Routes>
            </main>

            <Footer />
        </>
    )
}

export default App