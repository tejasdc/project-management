import * as React from "react";
import { createPortal } from "react-dom";

type DialogContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialog() {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error("Dialog components must be used inside <Dialog />");
  return ctx;
}

export function Dialog(props: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const controlled = typeof props.open === "boolean";
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(Boolean(props.defaultOpen));
  const open = controlled ? (props.open as boolean) : uncontrolledOpen;

  const titleId = React.useId();
  const descriptionId = React.useId();

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolledOpen(next);
      props.onOpenChange?.(next);
    },
    [controlled, props],
  );

  return (
    <DialogContext.Provider value={{ open, setOpen, titleId, descriptionId }}>
      {props.children}
    </DialogContext.Provider>
  );
}

export function DialogTrigger(props: { asChild?: boolean; children: React.ReactElement<any> }) {
  const { setOpen } = useDialog();

  if (props.asChild) {
    const child = props.children as any;
    return React.cloneElement(child, {
      onClick: (e: any) => {
        child.props?.onClick?.(e);
        setOpen(true);
      },
    });
  }

  return (
    <button onClick={() => setOpen(true)} type="button">
      {props.children}
    </button>
  );
}

export function DialogClose(props: { asChild?: boolean; children: React.ReactElement<any> }) {
  const { setOpen } = useDialog();

  if (props.asChild) {
    const child = props.children as any;
    return React.cloneElement(child, {
      onClick: (e: any) => {
        child.props?.onClick?.(e);
        setOpen(false);
      },
    });
  }

  return (
    <button onClick={() => setOpen(false)} type="button">
      {props.children}
    </button>
  );
}

export function DialogContent(props: React.HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen, titleId, descriptionId } = useDialog();
  const { className, children, ...rest } = props;
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true } as any);
  }, [open, setOpen]);

  React.useEffect(() => {
    if (!open) return;
    // Focus the dialog surface; avoids losing keyboard control.
    window.setTimeout(() => ref.current?.focus(), 0);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] grid place-items-center px-4">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/70 backdrop-blur-[10px]"
      />
      <div
        {...rest}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={[
          "relative w-full rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] shadow-[0_24px_80px_rgba(0,0,0,0.65)]",
          "animate-in",
          "p-4",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function DialogHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return (
    <div
      {...rest}
      className={[
        "flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

export function DialogTitle(props: React.HTMLAttributes<HTMLDivElement>) {
  const { titleId } = useDialog();
  const { className, ...rest } = props;
  return (
    <div
      {...rest}
      id={titleId}
      className={[
        "font-[var(--font-display)] text-base font-bold tracking-[-0.02em] text-[var(--text-primary)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

export function DialogDescription(props: React.HTMLAttributes<HTMLDivElement>) {
  const { descriptionId } = useDialog();
  const { className, ...rest } = props;
  return (
    <div
      {...rest}
      id={descriptionId}
      className={["text-sm text-[var(--text-secondary)]", className].filter(Boolean).join(" ")}
    />
  );
}

export function DialogFooter(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return <div {...rest} className={["pt-2", className].filter(Boolean).join(" ")} />;
}
