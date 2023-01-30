import { PropsWithChildren } from "react";
import styles from "./StoreFront.module.css";

export const StoreFront: React.FC<PropsWithChildren> = ({ children }) => {
  return <div className={styles.grid}>{children}</div>;
}
