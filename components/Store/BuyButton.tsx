import styles from "./BuyButton.module.css";

interface Props {
  purchaseLink: string;
  purchaseText: string;
}

export const BuyButton: React.FC<Props> = ({ purchaseLink, purchaseText }) => (
  <a className={styles.linkButton} href={purchaseLink}>
    {purchaseText}
  </a>
);
