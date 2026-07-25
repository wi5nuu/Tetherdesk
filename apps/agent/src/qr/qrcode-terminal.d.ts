/** Type declaration for qrcode-terminal — no @types package exists for this module. */
declare module "qrcode-terminal" {
  interface GenerateOptions {
    small?: boolean;
  }
  function generate(text: string, options?: GenerateOptions): void;
  function generate(text: string, options: GenerateOptions, callback: (qrcode: string) => void): void;
  export = { generate };
}
