interface ProductProps {
  subtitle?: string;
  src: string;
  height?: string;
  width?: string;
}

export default function Product({
  subtitle,
  src,
  height = "100vh",
  width = "100%",
}: ProductProps) {
  return (
    <div>
      {subtitle !== undefined && <p>{subtitle}</p>}
    </div>
  );
}
