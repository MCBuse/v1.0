import Image from "next/image";
import logo from "@/assets/mcbuse-logo.webp";

export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className="flex items-center">
      <Image
        src={logo}
        alt="MCBuse"
        width={80}
        height={40}
        priority
        className={inverse ? "h-10 w-auto brightness-0 invert" : "h-10 w-auto"}
      />
    </div>
  );
}
