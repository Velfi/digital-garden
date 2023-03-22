import styles from "./styles.module.css";
import NextImage, { StaticImageData } from "next/image";
import cn from "classnames";

export interface Props {
  subtitle?: string;
  src: string | StaticImageData;
  alt?: string;
  height?: number;
  width?: number;
}

export const Image: React.FC<Props> = ({
  src,
  // An empty string is a valid alt attribute value for decorative images.
  alt = "",
  subtitle,
  ...props
}) => {
  let isSvg;

  if (typeof src === "string") {
    isSvg = src.endsWith(".svg") || src.startsWith("data:image/svg+xml");
  } else {
    isSvg =
      src.src.endsWith(".svg") || src.src.startsWith("data:image/svg+xml");
  }

  return (
    <div className={styles.container}>
      <NextImage
        src={src}
        title={alt}
        alt={alt}
        className={cn(styles.image, { svgFilter: isSvg })}
        {...props}
      />
      {subtitle !== undefined && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
  );
};
