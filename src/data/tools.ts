export type ToolCategory =
  | "image"
  | "document"
  | "data"
  | "audio-video";

export type ToolOption =
  | "quality"
  | "resize"
  | "background"
  | "metadata"
  | "rotation"
  | "bitrate"
  | "resolution";

export interface ToolConfig {
  slug: string;
  title: string;
  description: string;
  category: ToolCategory;
  inputFormats: string[];
  outputFormats: string[];
  options: ToolOption[];
  browserSupported?: boolean;
  faq: {
    question: string;
    answer: string;
  }[];
}

export const tools: ToolConfig[] = [
  {
    slug: "png-to-jpg",
    title: "PNG to JPG Converter",
    description:
      "Convert PNG images to JPG quickly with adjustable quality and background options.",
    category: "image",
    inputFormats: ["PNG"],
    outputFormats: ["JPG"],
    options: ["quality", "background", "metadata"],
    browserSupported: true,
    faq: [
      {
        question: "Can I convert PNG to JPG without uploading the file?",
        answer:
          "Yes. PNG to JPG conversion can be performed directly in your browser."
      },
      {
        question: "Will transparent areas remain transparent?",
        answer:
          "JPG does not support transparency, so transparent areas are rendered using the selected background color."
      }
    ]
  },
  {
    slug: "jpg-to-png",
    title: "JPG to PNG Converter",
    description:
      "Convert JPG images to PNG directly in your browser.",
    category: "image",
    inputFormats: ["JPG", "JPEG"],
    outputFormats: ["PNG"],
    options: ["metadata"],
    browserSupported: true,
    faq: [
      {
        question: "Does JPG to PNG improve image quality?",
        answer:
          "Converting JPG to PNG does not restore quality that was already lost during JPG compression."
      }
    ]
  },
  {
    slug: "png-to-webp",
    title: "PNG to WebP Converter",
    description:
      "Convert PNG images to modern WebP format.",
    category: "image",
    inputFormats: ["PNG"],
    outputFormats: ["WEBP"],
    options: ["quality", "metadata"],
    browserSupported: true,
    faq: [
      {
        question: "Why use WebP?",
        answer:
          "WebP can provide smaller image files while maintaining good visual quality."
      }
    ]
  },
  {
    slug: "jpg-to-webp",
    title: "JPG to WebP Converter",
    description:
      "Convert JPG and JPEG images to WebP.",
    category: "image",
    inputFormats: ["JPG", "JPEG"],
    outputFormats: ["WEBP"],
    options: ["quality", "metadata"],
    browserSupported: true,
    faq: [
      {
        question: "Can multiple JPG files be converted?",
        answer:
          "Yes. You can select multiple files and convert them in one batch."
      }
    ]
  },
  {
    slug: "webp-to-png",
    title: "WebP to PNG Converter",
    description:
      "Convert WebP images to PNG.",
    category: "image",
    inputFormats: ["WEBP"],
    outputFormats: ["PNG"],
    options: ["metadata"],
    browserSupported: true,
    faq: [
      {
        question: "Can WebP transparency be preserved?",
        answer:
          "Yes. PNG supports transparency and can preserve transparent pixels from WebP images."
      }
    ]
  },
  {
    slug: "webp-to-jpg",
    title: "WebP to JPG Converter",
    description:
      "Convert WebP images to JPG with adjustable quality.",
    category: "image",
    inputFormats: ["WEBP"],
    outputFormats: ["JPG"],
    options: ["quality", "background", "metadata"],
    browserSupported: true,
    faq: [
      {
        question: "What happens to transparent pixels?",
        answer:
          "Transparent pixels are rendered against the selected background color."
      }
    ]
  },
  {
    slug: "svg-to-png",
    title: "SVG to PNG Converter",
    description:
      "Convert SVG vector graphics into PNG images.",
    category: "image",
    inputFormats: ["SVG"],
    outputFormats: ["PNG"],
    options: ["resize", "metadata"],
    browserSupported: false,
    faq: [
      {
        question: "Can SVG files be converted to PNG?",
        answer:
          "Yes. SVG files are rendered into raster PNG images."
      }
    ]
  },
  {
    slug: "svg-to-jpg",
    title: "SVG to JPG Converter",
    description:
      "Convert SVG graphics into JPG images.",
    category: "image",
    inputFormats: ["SVG"],
    outputFormats: ["JPG"],
    options: ["quality", "resize", "background", "metadata"],
    browserSupported: false,
    faq: [
      {
        question: "Does JPG support transparent SVG backgrounds?",
        answer:
          "No. Transparent SVG areas require a background when producing JPG."
      }
    ]
  },
  {
    slug: "svg-to-webp",
    title: "SVG to WebP Converter",
    description:
      "Convert SVG graphics into WebP images.",
    category: "image",
    inputFormats: ["SVG"],
    outputFormats: ["WEBP"],
    options: ["quality", "resize", "metadata"],
    browserSupported: false,
    faq: [
      {
        question: "Can SVG be converted to WebP?",
        answer:
          "Yes. The SVG is rendered and encoded as a WebP image."
      }
    ]
  },
  {
    slug: "jpg-to-png",
    title: "JPEG to PNG Converter",
    description:
      "Convert JPEG images into PNG format.",
    category: "image",
    inputFormats: ["JPG", "JPEG"],
    outputFormats: ["PNG"],
    options: ["metadata"],
    browserSupported: true,
    faq: [
      {
        question: "Is the original JPEG quality restored?",
        answer:
          "No. PNG conversion cannot recover JPEG compression artifacts."
      }
    ]
  }
];

export const toolMap = new Map(
  tools.map((tool) => [tool.slug, tool])
);

export const categories: {
  id: ToolCategory;
  title: string;
  description: string;
}[] = [
  {
    id: "image",
    title: "Image",
    description: "Convert and optimize image files."
  },
  {
    id: "document",
    title: "Documents",
    description: "Convert, merge and process documents."
  },
  {
    id: "data",
    title: "Data",
    description: "Convert structured data between formats."
  },
  {
    id: "audio-video",
    title: "Audio & Video",
    description: "Convert multimedia files with FFmpeg."
  }
];