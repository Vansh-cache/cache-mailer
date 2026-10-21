declare module "html-to-text" {
  export function convert(
    html: string,
    options?: {
      wordwrap?: number;
      selectors?: { selector: string; format: string }[];
    },
  ): string;
}
