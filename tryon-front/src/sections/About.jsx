import { motion } from "framer-motion";

export default function About() {
    return (
        <section className="px-12 py-24">

            {/* Heading */}
            <div className="text-center max-w-3xl mx-auto">
                <h2 className="text-4xl font-bold leading-tight">
                    How Our AI Transforms
                    <br />
                    <span className="bg-gradient-to-r from-purple-300 to-blue-300 bg-clip-text text-transparent">
            Your Style Instantly
          </span>
                </h2>

                <p className="mt-6 text-gray-400">
                    No more guessing. See exactly how outfits, hairstyles, and styles look on YOU — powered by advanced AI.
                </p>
            </div>

            {/* Steps */}
            <div className="mt-16 grid md:grid-cols-3 gap-8">

                <Step
                    number="01"
                    title="Upload Your Photo"
                    desc="Start by uploading a clear image of yourself."
                />

                <Step
                    number="02"
                    title="Choose Your Style"
                    desc="Pick outfits, hairstyles, or trends you want to try."
                />

                <Step
                    number="03"
                    title="Get Instant Results"
                    desc="Our AI generates realistic previews in seconds."
                />

            </div>

            {/* Highlight Card */}
            <motion.div
                whileHover={{ scale: 1.02 }}
                className="mt-20 bg-gradient-to-r from-purple-300/10 to-blue-300/10 border border-white/10 rounded-3xl p-10 backdrop-blur-xl text-center"
            >
                <h3 className="text-2xl font-semibold">
                    Why Choose TryOnAI?
                </h3>

                <p className="mt-4 text-gray-400 max-w-2xl mx-auto">
                    Avoid bad fashion decisions, save time, and confidently experiment with your look using cutting-edge AI technology.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-6 text-gray-300">
                    <Badge text="Realistic AI Previews" />
                    <Badge text="Instant Results" />
                    <Badge text="Endless Style Options" />
                </div>
            </motion.div>

        </section>
    );
}

function Step({ number, title, desc }) {
    return (
        <motion.div
            whileHover={{ y: -10 }}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-lg"
        >
            <div className="text-purple-300 font-bold text-lg">{number}</div>
            <h3 className="mt-2 text-xl font-semibold">{title}</h3>
            <p className="mt-2 text-gray-400">{desc}</p>
        </motion.div>
    );
}

function Badge({ text }) {
    return (
        <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm">
            {text}
        </div>
    );
}