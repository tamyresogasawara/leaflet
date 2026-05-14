"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, Props>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded border border-border bg-white px-3 text-sm text-ink placeholder:text-subtle",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
