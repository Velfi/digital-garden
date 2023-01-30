import { PropsWithChildren } from "react";
import { BuyButton } from "./BuyButton";
import styles from "./Product.module.css";

interface Props {
  name: string;
  purchaseLink: string;
  purchaseCta: string;
  purchasePrice: number;
}

export const Product: React.FC<PropsWithChildren<Props>> = ({
  name,
  purchaseLink,
  purchaseCta,
  purchasePrice,
  children,
}) => (
  <div>
    <p className={styles.name}>{name}</p>
    <BuyButton
      purchaseCta={purchaseCta}
      purchaseLink={purchaseLink}
      purchasePrice={purchasePrice}
    />
    {children}
  </div>
);
