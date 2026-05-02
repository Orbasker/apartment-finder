"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";

export function FormSubmitButton({ children, disabled, ...rest }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...rest} loading={pending} disabled={disabled}>
      {children}
    </Button>
  );
}
