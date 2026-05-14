"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, Props>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[112px] w-full rounded border border-border bg-white p-3 text-sm text-ink placeholder:text-subtle",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
