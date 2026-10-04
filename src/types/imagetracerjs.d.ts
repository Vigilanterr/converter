/**
 * Minimal ambient types for imagetracerjs, which ships no declarations.
 * Only the surface this project actually calls is described.
 */
declare module "imagetracerjs" {
  export interface ImageTracerPathOptions {
    enabled?: boolean;
    mode?: "pixel" | "line" | "none";
    opacity?: number;
    width?: number;
  }

  export interface ImageTracerOptions {
    linetracing?: boolean;
    strokewidth?: number;
    linefilter?: boolean;
    rightangleenhance?: boolean;
    viewbox?: boolean;
    colorsampling?: 1 | 2 | 3 | 4;
    numberofcolors?: number;
    mincolorratio?: number;
    colorquantcycles?: number;
    layers?: 0 | 1 | 2;
    strokepath?: ImageTracerPathOptions;
    fillpath?: ImageTracerPathOptions;
  }

  export interface ImageTracerImageData {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }

  export interface ImageTracerStatic {
    /** Traces raw RGBA pixel data and returns a complete SVG string. */
    imagedataToSVG(
      imageData: ImageTracerImageData,
      options?: ImageTracerOptions | string
    ): string;
  }

  const ImageTracer: ImageTracerStatic;

  export default ImageTracer;
}