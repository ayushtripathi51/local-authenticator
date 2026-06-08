import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  variant?: "plain" | "primary" | "danger";
};

export function IconButton({
  label,
  children,
  variant = "plain",
  className = "",
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      className={`icon-button icon-button--${variant} ${className}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
