"use client";

import { Popover as PopoverPrimitive } from "@base-ui-components/react/popover";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverPortal = PopoverPrimitive.Portal;

type PopoverContentProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Popup> & {
  sideOffset?: number;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
};

const PopoverContent = forwardRef<ElementRef<typeof PopoverPrimitive.Popup>, PopoverContentProps>(
  ({ className, sideOffset = 4, align = "start", side = "bottom", ...props }, ref) => (
    <PopoverPortal>
      <PopoverPrimitive.Positioner sideOffset={sideOffset} align={align} side={side}>
        <PopoverPrimitive.Popup
          ref={ref}
          className={cn(
            "z-50 w-72 max-w-[calc(100vw-1rem)] rounded-md border bg-card text-foreground shadow-md outline-none",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPortal>
  ),
);
PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverTrigger, PopoverContent };
