import { siteConfig } from "@/siteconfig";
import Link from "next/link";

export const Header: React.FC = () => (
  <header className="header">
    <nav className="nav">
      <Link href="/">{siteConfig.title}</Link>
    </nav>
  </header>
);
