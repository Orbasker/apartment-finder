"use client";

import { toast } from "sonner";

export type ActionResult =
  | { ok: true; [k: string]: unknown }
  | { ok: false; error?: string; reason?: string; [k: string]: unknown };

export function toastSuccess(message: string, description?: string) {
  return toast.success(message, description ? { description } : undefined);
}

export function toastError(message: string, description?: string) {
  return toast.error(message, description ? { description } : undefined);
}

export function toastInfo(message: string, description?: string) {
  return toast(message, description ? { description } : undefined);
}

type ToastFromResultOptions = {
  successMessage: string;
  errorMessage: string;
  resolveErrorDescription?: (code: string) => string | undefined;
};

export function toastFromResult(result: ActionResult, opts: ToastFromResultOptions) {
  if (result.ok) {
    toastSuccess(opts.successMessage);
    return;
  }
  const code = result.error ?? result.reason;
  const description = code && opts.resolveErrorDescription ? opts.resolveErrorDescription(code) : undefined;
  toastError(opts.errorMessage, description);
}

export { toast };
