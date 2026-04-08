import { motion } from "framer-motion"

const Login = () => {
    return (
        <div className="min-h-screen flex items-center justify-center px-6 bg-surface">

            <motion.div
                initial={{ opacity: 0, y: 60 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md border-4 border-black p-10 neo-shadow-lg bg-white"
            >

                <h1 className="text-4xl font-black mb-8 text-center">
                    LOGIN
                </h1>

                <div className="flex flex-col gap-6">

                    <input
                        type="email"
                        placeholder="Email"
                        className="border-2 border-black px-4 py-3 outline-none"
                    />

                    <input
                        type="password"
                        placeholder="Password"
                        className="border-2 border-black px-4 py-3 outline-none"
                    />

                    <motion.button
                        whileHover={{ y: -3 }}
                        whileTap={{ y: 1 }}
                        className="bg-primary text-white py-3 border-2 border-black font-bold"
                    >
                        Login
                    </motion.button>

                </div>

                <p className="mt-6 text-sm text-center">
                    Don’t have an account? <span className="underline cursor-pointer">Sign up</span>
                </p>

            </motion.div>

        </div>
    )
}

export default Login