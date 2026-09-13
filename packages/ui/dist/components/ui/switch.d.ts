import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
declare function Switch({ className, size, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root> & {
    size?: "sm" | "default";
}): React.JSX.Element;
export { Switch };
