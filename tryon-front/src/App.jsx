import Navbar from "./components/Navbar"
import Footer from "./components/Footer"

import Hero from "./sections/Hero"
import Demo from "./sections/Demo"
import Features from "./sections/Features"
import Process from "./sections/Process"
import SocialProof from "./sections/SocialProof"
import CTA from "./sections/CTA"

function App() {
    return (
        <>
            <Navbar />

            <main className="pt-24 overflow-x-hidden">
                <Hero />
                <Demo />
                <Features />
                <Process />
                <SocialProof />
                <CTA />
            </main>

            <Footer />
        </>
    )
}

export default App