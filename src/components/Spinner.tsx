/** Small loading spinner for async buttons — a spinning ring that
 * inherits the button's text colour. Used with a "Loading..." label
 * while the button is disabled. */
export default function Spinner({
  className = "h-4 w-4",
}: {
  className?: string;
}) {
  return (
    <span
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px] ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
