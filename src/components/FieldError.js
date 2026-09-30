export default function FieldError({ id, msg }) {
  return (
    <p className="cto-error" id={id} aria-live="polite">{msg || ''}</p>
  );
}
