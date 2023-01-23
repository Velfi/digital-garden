import { useEffect } from "react";
import ReactPannellum, { getConfig } from "react-pannellum";

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
        <ReactPannellum
          id={subtitle}
          sceneId={subtitle}
          imageSource={src}
          config={{
            autoLoad: true,
          }}
        />
      {subtitle !== undefined && <p>{subtitle}</p>}
    </div>
  );
}
