export default function Grid({
  children,
  rows,
  columns = "repeat(2, 1fr)",
  gap = "1rem"
}) {
  const style = {
    display: "grid",
    gap: gap,
    gridTemplateRows: rows,
    gridTemplateColumns: columns,
  };

  return (<div style={style}>
    {children}
  </div>)
}