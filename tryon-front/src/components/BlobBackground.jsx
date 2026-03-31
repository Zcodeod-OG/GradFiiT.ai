export default function BlobBackground() {
    return (
        <>
            <div className="absolute top-0 left-0 w-72 h-72 bg-pink-500/30 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-500/30 rounded-full blur-3xl animate-pulse" />
            <div className="absolute top-1/2 left-1/3 w-80 h-80 bg-green-500/20 rounded-full blur-3xl animate-pulse" />
        </>
    );
}