import { motion } from "framer-motion";

export default function FeatureCard({ icon, title, desc }) {
    return (
        <motion.div
            whileHover={{ y: -10 }}
            className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-6 text-center"
        >
            <div className="mb-4 flex justify-center text-pink-400">{icon}</div>
            <h3 className="text-xl font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-gray-400">{desc}</p>
        </motion.div>
    );
}