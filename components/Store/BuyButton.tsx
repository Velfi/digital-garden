import styles from "./BuyButton.module.css";

interface Props {
  purchaseLink: string;
  purchaseCta: string;
  purchasePrice: number;
}

export const BuyButton: React.FC<Props> = ({ purchaseLink, purchaseCta, purchasePrice }) => (
  <a className={styles.linkButton} href={purchaseLink}>
    {purchaseCta} (${purchasePrice})
  </a>
);
