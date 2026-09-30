import clsx from "clsx";

export function Avatar({
  src,
  name,
  size = 20,
  square = false,
  className,
}: {
  src: string | null | undefined;
  name: string;
  size?: number;
  square?: boolean;
  className?: string;
}) {
  const shape = square ? "rounded-[4px]" : "rounded-full";
  const style = { width: size, height: size };

  if (!src) {
    return (
      <span
        aria-hidden="true"
        style={{ ...style, fontSize: Math.max(9, Math.round(size * 0.45)) }}
        className={clsx(
          "inline-flex shrink-0 items-center justify-center bg-surface-4 font-medium uppercase text-dim",
          shape,
          className,
        )}
      >
        {name.slice(0, 1)}
      </span>
    );
  }

  return (
    // Avatars come from GitHub's CDN at arbitrary sizes; next/image adds nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      style={style}
      className={clsx("shrink-0 bg-surface-3 object-cover ring-1 ring-line", shape, className)}
    />
  );
}
