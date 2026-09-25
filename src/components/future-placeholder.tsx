type Props = {
  title: string;
  description: string;
};

export function FuturePlaceholder({ title, description }: Props) {
  return (
    <div className="panel future-placeholder">
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      <p className="muted">Esta área será habilitada em uma próxima etapa da implementação.</p>
    </div>
  );
}
