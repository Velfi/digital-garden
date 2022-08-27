import styles from "./BuyButton.module.css";

export default function BuyButton({ purchaseLink, purchaseText }) {
  return (
    <a className={styles.linkButton} href={purchaseLink}>
      {purchaseText}
    </a>
  );
}
