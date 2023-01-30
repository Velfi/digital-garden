import { PropsWithChildren } from "react";

interface Props {
  rows?: string;
  columns?: string;
  gap?: string;
}

export const Grid: React.FC<PropsWithChildren<Props>> = ({
  children,
  rows,
  columns = "repeat(2, 1fr)",
  gap = "1rem",
}) => {
  const style = {
    display: "grid",
    gap: gap,
    gridTemplateRows: rows,
    gridTemplateColumns: columns,
  };

  return <div style={style}>{children}</div>;
};
