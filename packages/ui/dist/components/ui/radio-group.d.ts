import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
declare function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>): React.JSX.Element;
declare function RadioGroupItem({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Item>): React.JSX.Element;
export { RadioGroup, RadioGroupItem };
