import styles from "./styles.module.css";

export interface Props {
  subtitle?: string;
  src: string;
  alt?: string;
}

export const Image: React.FC<Props> = ({
  src,
  // An empty string is a valid alt attribute value for decorative images.
  alt = "",
  subtitle,
}) => (
  <div className={styles.container}>
    <img
      src={src}
      alt={alt}
      className={src.includes(".svg") ? "svgFilter" : styles.image}
    />
    {subtitle !== undefined && <p className={styles.subtitle}>{subtitle}</p>}
  </div>
);
