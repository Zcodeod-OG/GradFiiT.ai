import { motion } from "framer-motion"

const container = {
    hidden: {},
    show: {
        transition: {
            staggerChildren: 0.2,
        },
    },
}

const item = {
    hidden: { opacity: 0, y: 60 },
    show: { opacity: 1, y: 0 },
}

const Features = () => {
    return (
        <section className="py-24 px-6">

            <div className="container-main">

                <motion.h2
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    className="text-4xl md:text-6xl font-black mb-16"
                >
                    ENGINEERED FOR <span className="italic text-secondary">PERFECTION</span>
                </motion.h2>

                <motion.div
                    variants={container}
                    initial="hidden"
                    whileInView="show"
                    className="grid md:grid-cols-3 gap-10"
                >

                    {[1,2,3].map((_, i) => (
                        <motion.div
                            key={i}
                            variants={item}
                            whileHover={{ y: -10 }}
                            className="bg-white p-8 border-4 border-black neo-shadow-lg"
                        >
                            <h3 className="text-2xl font-black">Feature {i+1}</h3>
                        </motion.div>
                    ))}

                </motion.div>

            </div>

        </section>
    )
}

export default Features