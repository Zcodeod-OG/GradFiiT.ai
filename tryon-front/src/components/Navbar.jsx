import { Link, useLocation } from "react-router-dom"
import { motion } from "framer-motion"

const navLinks = [
    { name: "Try-On", path: "/try-on" },
    { name: "Features", path: "/features" },
    { name: "Pricing", path: "/pricing" },
    { name: "How It Works", path: "/how-it-works" },
]

const Navbar = () => {
    const location = useLocation()

    return (
        <motion.nav
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="fixed top-0 w-full z-50 border-b-4 border-black bg-white/70 backdrop-blur-lg"
        >
            <div className="container-main flex justify-between items-center px-6 py-4">

                {/* LOGO */}
                <Link
                    to="/"
                    className="text-xl md:text-2xl font-black font-headline uppercase tracking-tight hover:opacity-80 transition"
                >
                    VIRTUAL.AI
                </Link>

                {/* NAV LINKS */}
                <div className="hidden md:flex gap-8 items-center">

                    {navLinks.map((link, i) => {
                        const isActive = location.pathname === link.path

                        return (
                            <motion.div
                                key={link.name}
                                whileHover={{ y: -3 }}
                                whileTap={{ y: 1 }}
                            >
                                <Link
                                    to={link.path}
                                    className={`relative font-headline uppercase text-sm tracking-tight transition
                    ${isActive ? "text-black" : "text-zinc-500 hover:text-black"}
                  `}
                                >
                                    {link.name}

                                    {/* ACTIVE UNDERLINE */}
                                    {isActive && (
                                        <motion.div
                                            layoutId="nav-underline"
                                            className="absolute left-0 -bottom-1 w-full h-[2px] bg-black"
                                        />
                                    )}
                                </Link>
                            </motion.div>
                        )
                    })}

                </div>

                ...

                {/* CTA BUTTON */}
                <motion.div
                    whileHover={{ y: -3, scale: 1.03 }}
                    whileTap={{ y: 1, scale: 0.97 }}
                >
                    <Link
                        to="/login"
                        className="bg-primary text-white px-5 py-2 text-sm md:text-base border-2 border-black font-bold neo-shadow inline-block"
                    >
                        Get Started
                    </Link>
                </motion.div>

            </div>
        </motion.nav>
    )
}

export default Navbar