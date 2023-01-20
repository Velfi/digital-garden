import BuyButton from "./BuyButton";
import styles from "./Product.module.css";

export default function Product({
  name,
  purchaseLink,
  purchaseText,
  children,
}) {
  return (
    <div>
      <p className={styles.name}>{name}</p>
      <BuyButton purchaseText={purchaseText} purchaseLink={purchaseLink} />
      {children}
    </div>
  );
}
