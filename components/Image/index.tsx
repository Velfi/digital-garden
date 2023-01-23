import styles from "./styles.module.css";
import NextImage, { ImageProps as NextImageProps } from "next/image";

export interface ImageProps extends NextImageProps {
  subtitle?: string;
  src: string;
}

export const Image = (props: ImageProps) => {
  let {
    src,
    // An empty string is a valid alt attribute value for decorative images.
    alt = "",
    width = 600,
    height = 460,
    subtitle,
  } = props;
  if (src.includes("?")) {
    const dimensions = src.split("?");
    const widthHeight = dimensions[1].split("x");
    width = parseInt(widthHeight[0], 10);
    height = parseInt(widthHeight[1], 10);
  }

  return (
    <div className={styles.container}>
      <NextImage
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={src.includes(".svg") ? "svgFilter" : styles.image}
      />
      {subtitle !== undefined && (
        <p className="nextImageSubtitle">{subtitle}</p>
      )}
    </div>
  );
};
