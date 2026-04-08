import { motion } from "framer-motion"

const Hero = () => {
    return (
        <section className="relative min-h-screen flex items-center px-6 py-20">

            <div className="container-main">

                <motion.div
                    initial={{ opacity: 0, y: 60 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >

                    <div className="inline-block bg-tertiary-container border-2 border-black px-4 py-1 mb-6 font-bold text-sm">
                        THE FUTURE OF FASHION
                    </div>

                    <h1 className="text-5xl md:text-7xl lg:text-8xl font-black leading-[0.9] uppercase">
                        BE ANYONE <br />
                        WEAR <span className="text-primary italic">ANYTHING</span>
                    </h1>

                    <p className="text-lg md:text-xl max-w-xl mt-6 mb-10 font-semibold">
                        AI-powered hyper-realistic virtual try-ons.
                    </p>

                    <div className="flex gap-6 flex-wrap">
                        <motion.button
                            whileHover={{ y: -5 }}
                            whileTap={{ y: 2 }}
                            className="bg-primary text-white px-10 py-5 border-4 border-black neo-shadow-lg"
                        >
                            Try It Now
                        </motion.button>

                        <motion.button
                            whileHover={{ y: -5 }}
                            whileTap={{ y: 2 }}
                            className="bg-white px-10 py-5 border-4 border-black neo-shadow-lg"
                        >
                            View Lookbook
                        </motion.button>
                    </div>

                </motion.div>

            </div>
        </section>
    )
}

export default Hero