import Image from "next/image";

export default function Home() {
  return (
    <div className="flex items-center justify-center h-screen bg-black">
      <Image
        alt="Freestyle Logo"
        src="/flame-icon.svg"
        width={347}
        height={280}
        className="opacity-50 w-48"
      />
    </div>
  );
}
