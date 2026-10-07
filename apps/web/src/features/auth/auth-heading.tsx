/** Page heading for the auth screens. */
export function AuthHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-7">
      <h1 className="text-[24px] font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-1.5">{description}</p>
    </div>
  );
}
