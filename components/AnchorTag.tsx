import Link from "next/link";

const AnchorTag = (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
  const { href, title, target, children } = props;
  if (target) {
    return <a {...props}>{children}</a>;
  }
  return <Link href={`${href}`}>{title || children}</Link>;
};

export default AnchorTag;
