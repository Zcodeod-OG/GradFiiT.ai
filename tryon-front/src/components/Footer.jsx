const Footer = () => {
    return (
        <footer className="w-full border-t-4 border-black bg-gray-100 flex flex-col md:flex-row justify-between items-center p-12 gap-8">

            <div>
                <div className="text-xl font-bold">VIRTUAL.AI</div>
                <p className="text-sm opacity-80">
                    © 2024 VIRTUAL.AI. NO ROUNDED CORNERS.
                </p>
            </div>

            <div className="flex gap-8 text-sm">
                <a>Privacy Policy</a>
                <a>Terms of Service</a>
                <a>Twitter</a>
                <a>Contact</a>
            </div>

        </footer>
    )
}

export default Footer