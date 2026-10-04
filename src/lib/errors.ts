/**
 * Conversion failures are reported to the client with a message that is safe to
 * show a user, so they live in their own module to keep `image-convert` and
 * `vectorize` free of circular imports.
 */
export class ConversionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConversionError";
  }
}