"use client";

import { useCallback, useTransition } from "react";
import { toastError, toastSuccess, type ActionResult } from "./toast";

type UseActionOptions<TArgs extends unknown[], TResult extends ActionResult> = {
  action: (...args: TArgs) => Promise<TResult>;
  successMessage?: string;
  errorMessage: string;
  resolveErrorDescription?: (code: string) => string | undefined;
  onSuccess?: (result: Extract<TResult, { ok: true }>) => void;
  onError?: (result: Extract<TResult, { ok: false }>) => void;
};

export function useAction<TArgs extends unknown[], TResult extends ActionResult>(
  options: UseActionOptions<TArgs, TResult>,
) {
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (...args: TArgs) => {
      startTransition(async () => {
        try {
          const result = await options.action(...args);
          if (result.ok) {
            if (options.successMessage) toastSuccess(options.successMessage);
            options.onSuccess?.(result as Extract<TResult, { ok: true }>);
          } else {
            const code = result.error ?? result.reason;
            const description =
              code && options.resolveErrorDescription
                ? options.resolveErrorDescription(code)
                : undefined;
            toastError(options.errorMessage, description);
            options.onError?.(result as Extract<TResult, { ok: false }>);
          }
        } catch {
          toastError(options.errorMessage);
        }
      });
    },
    [options],
  );

  return { run, pending };
}
