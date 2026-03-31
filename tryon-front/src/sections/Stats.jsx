export default function Stats() {
    return (
        <section className="grid md:grid-cols-3 text-center px-10 py-20 gap-8">
            <Stat num="1M+" text="Looks Generated" />
            <Stat num="500K+" text="Users" />
            <Stat num="99%" text="Accuracy" />
        </section>
    );
}

function Stat({ num, text }) {
    return (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <h3 className="text-3xl text-blue-400 font-bold">{num}</h3>
            <p className="text-gray-400 mt-2">{text}</p>
        </div>
    );
}