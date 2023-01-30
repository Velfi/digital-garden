import { PropsWithChildren } from "react";
import { BuyButton } from ".";
import styles from "./Product.module.css";

interface Props {
  name: string;
  purchaseLink: string;
  purchaseText: string;
}

export const Product: React.FC<PropsWithChildren<Props>> = ({
  name,
  purchaseLink,
  purchaseText,
  children,
}) => (
  <div>
    <p className={styles.name}>{name}</p>
    <BuyButton purchaseText={purchaseText} purchaseLink={purchaseLink} />
    {children}
  </div>
);
