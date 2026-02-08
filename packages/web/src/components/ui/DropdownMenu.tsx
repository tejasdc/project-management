import * as React from "react";
import { createPortal } from "react-dom";

type Ctx = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerEl: HTMLElement | null;
  setTriggerEl: (el: HTMLElement | null) => void;
};

const DropdownMenuContext = React.createContext<Ctx | null>(null);

function useDropdown() {
  const ctx = React.useContext(DropdownMenuContext);
  if (!ctx) throw new Error("DropdownMenu components must be used inside <DropdownMenu />");
  return ctx;
}

export function DropdownMenu(props: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const controlled = typeof props.open === "boolean";
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(Boolean(props.defaultOpen));
  const open = controlled ? (props.open as boolean) : uncontrolledOpen;
  const [triggerEl, setTriggerEl] = React.useState<HTMLElement | null>(null);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolledOpen(next);
      props.onOpenChange?.(next);
    },
    [controlled, props],
  );

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, triggerEl, setTriggerEl }}>
      {props.children}
    </DropdownMenuContext.Provider>
  );
}

export function DropdownMenuTrigger(props: { asChild?: boolean; children: React.ReactElement<any> }) {
  const { open, setOpen, setTriggerEl } = useDropdown();

  const attach = (el: any) => {
    if (el instanceof HTMLElement) setTriggerEl(el);
  };

  if (props.asChild) {
    const child = props.children as any;
    return React.cloneElement(child, {
      ref: (node: any) => {
        attach(node);
        const r = (child as any).ref;
        if (typeof r === "function") r(node);
        else if (r && typeof r === "object") (r.current = node);
      },
      onClick: (e: any) => {
        child.props?.onClick?.(e);
        setOpen(!open);
      },
    });
  }

  return (
    <button
      type="button"
      ref={attach as any}
      onClick={() => setOpen(!open)}
    >
      {props.children}
    </button>
  );
}

export function DropdownMenuContent(props: React.HTMLAttributes<HTMLDivElement> & { align?: "start" | "end" }) {
  const { open, setOpen, triggerEl } = useDropdown();
  const { className, children, align = "start", ...rest } = props;
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (ref.current?.contains(t as any)) return;
      if (triggerEl?.contains(t as any)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("mousedown", onPointerDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true } as any);
      window.removeEventListener("mousedown", onPointerDown, { capture: true } as any);
    };
  }, [open, setOpen, triggerEl]);

  if (!open || !triggerEl) return null;

  const r = triggerEl.getBoundingClientRect();
  const top = Math.round(r.bottom + 8);
  const left = align === "end" ? Math.round(r.right) : Math.round(r.left);

  return createPortal(
    <div className="fixed inset-0 z-[250]">
      <div
        {...rest}
        ref={ref}
        style={{ top, left, transform: align === "end" ? "translateX(-100%)" : undefined }}
        className={[
          "absolute min-w-[180px] rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] p-1 shadow-[0_18px_60px_rgba(0,0,0,0.55)]",
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

export function DropdownMenuItem(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { onSelect?: () => void; inset?: boolean },
) {
  const { setOpen } = useDropdown();
  const { className, onClick, onSelect, inset, ...rest } = props;
  return (
    <button
      {...rest}
      type="button"
      onClick={(e) => {
        onClick?.(e);
        onSelect?.();
        setOpen(false);
      }}
      className={[
        "flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]",
        inset ? "pl-8" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

export function DropdownMenuSeparator(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return <div {...rest} className={["my-1 h-px bg-[var(--border-subtle)]", className].filter(Boolean).join(" ")} />;
}
