import { motion } from "framer-motion"

const Demo = () => {
    return (
        <section className="py-24 px-6 bg-gray-100">

            <div className="container-main">

                <div className="grid lg:grid-cols-2 border-4 border-black">

                    <motion.div
                        initial={{ x: -100, opacity: 0 }}
                        whileInView={{ x: 0, opacity: 1 }}
                        className="aspect-[4/5]"
                    >
                        <img src="..." className="w-full h-full object-cover" />
                    </motion.div>

                    <motion.div
                        initial={{ x: 100, opacity: 0 }}
                        whileInView={{ x: 0, opacity: 1 }}
                        className="aspect-[4/5]"
                    >
                        <img src="..." className="w-full h-full object-cover" />
                    </motion.div>

                </div>

            </div>

        </section>
    )
}

export default Demo