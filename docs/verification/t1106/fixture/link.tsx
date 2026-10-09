import * as React from "react";
export default function Link({href, ...props}: React.ComponentProps<"a">) {
  return <a href={href} {...props}/>;
}
