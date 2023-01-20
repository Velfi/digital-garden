import { siteConfig } from "@/siteconfig";
import Link from "next/link";

export default function Header() {
  return (
    <>
      <header className="header">
        <nav className="nav">
          <Link href="/">
            {siteConfig.title}
          </Link>
        </nav>
      </header>
    </>
  );
}
