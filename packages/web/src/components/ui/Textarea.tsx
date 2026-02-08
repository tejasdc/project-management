import * as React from "react";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>((props, ref) => {
  const { className, ...rest } = props;
  return (
    <textarea
      {...rest}
      ref={ref}
      className={[
        "w-full resize-none rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none",
        "placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-medium)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
});

Textarea.displayName = "Textarea";
