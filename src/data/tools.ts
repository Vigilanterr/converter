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
  | "resolution"
  | "trace";

export interface ToolFaq {
  question: string;
  answer: string;
}

export interface ToolConfig {
  slug: string;
  title: string;
  description: string;
  category: ToolCategory;
  inputFormats: string[];
  outputFormats: string[];
  options: ToolOption[];
  browserSupported: boolean;
  faq: ToolFaq[];
}

const inputFormatAliases: Record<string, string[]> = {
  jpg: ["jpg", "jpeg"],
  webp: ["webp"],
  png: ["png"],
  svg: ["svg"],
  gif: ["gif"],
  bmp: ["bmp"],
  tiff: ["tiff", "tif"],
  avif: ["avif"]
};

export function toolAcceptAttribute(tool: ToolConfig): string {
  const extensions = tool.inputFormats.flatMap((format) => {
    const key = format.trim().toLowerCase();

    return inputFormatAliases[key] ?? [key];
  });

  return [...new Set(extensions)]
    .map((extension) => `.${extension}`)
    .join(",");
}

export function toolOutputFormat(tool: ToolConfig): string {
  return tool.outputFormats[0];
}

export function toolProducesPdf(tool: ToolConfig): boolean {
  return tool.outputFormats.some((format) =>
    format.toUpperCase().includes("PDF")
  );
}

export const tools: ToolConfig[] = [
  {
    slug: "png-to-jpg",
    title: "PNG to JPG Converter",
    description:
      "Convert PNG images to JPG with adjustable quality and a background colour for transparent areas.",
    category: "image",
    inputFormats: ["PNG"],
    outputFormats: ["JPG"],
    options: ["quality", "resize", "background", "metadata", "rotation"],
    browserSupported: true,
    faq: [
      {
        question: "Can I convert PNG to JPG without uploading the file?",
        answer:
          "Yes. PNG to JPG runs locally in your browser using the Canvas API, so the file never leaves your device unless you switch to the server converter."
      },
      {
        question: "Will transparent areas stay transparent?",
        answer:
          "No. JPG has no alpha channel, so transparent pixels are filled with the background colour you choose. White is used by default."
      },
      {
        question: "How are my files stored?",
        answer:
          "Server conversions write temporary UUID-named files that are deleted automatically after the configured retention period, currently 30 minutes."
      }
    ]
  },
  {
    slug: "jpg-to-png",
    title: "JPG to PNG Converter",
    description:
      "Convert JPG and JPEG images to PNG with full lossless compression.",
    category: "image",
    inputFormats: ["JPG"],
    outputFormats: ["PNG"],
    options: ["resize", "metadata", "rotation"],
    browserSupported: true,
    faq: [
      {
        question: "Does converting JPG to PNG restore quality?",
        answer:
          "No. Details that were already lost during JPG compression cannot be recovered. PNG simply avoids adding further loss."
      },
      {
        question: "Which tool should I use for the smallest file size?",
        answer:
          "Use JPG to WebP or PNG to WebP when file size matters more than maximum compatibility."
      }
    ]
  },
  {
    slug: "png-to-webp",
    title: "PNG to WebP Converter",
    description:
      "Convert PNG images to WebP for noticeably smaller files at the same visual quality.",
    category: "image",
    inputFormats: ["PNG"],
    outputFormats: ["WEBP"],
    options: ["quality", "resize", "metadata", "rotation"],
    browserSupported: true,
    faq: [
      {
        question: "Why should I use WebP?",
        answer:
          "WebP usually produces files that are 25 to 34 percent smaller than PNG for the same perceived quality, and it supports transparency."
      },
      {
        question: "Is WebP supported everywhere?",
        answer:
          "WebP is supported by all current versions of Chrome, Edge, Firefox and Safari. Very old software may still require a fallback format."
      }
    ]
  },
  {
    slug: "jpg-to-webp",
    title: "JPG to WebP Converter",
    description:
      "Convert JPG and JPEG images to WebP and control the compression quality.",
    category: "image",
    inputFormats: ["JPG"],
    outputFormats: ["WEBP"],
    options: ["quality", "resize", "metadata", "rotation"],
    browserSupported: true,
    faq: [
      {
        question: "Can I convert several JPG files at once?",
        answer:
          "Yes. Add multiple files to the list and they are converted one after another. You can then download them individually or all at once."
      },
      {
        question: "What quality value should I use?",
        answer:
          "A value between 75 and 85 keeps the visual difference hard to notice while still reducing the file size significantly."
      }
    ]
  },
  {
    slug: "webp-to-png",
    title: "WebP to PNG Converter",
    description:
      "Convert WebP images to PNG while keeping transparency intact.",
    category: "image",
    inputFormats: ["WEBP"],
    outputFormats: ["PNG"],
    options: ["resize", "metadata", "rotation"],
    browserSupported: true,
    faq: [
      {
        question: "Is WebP transparency preserved?",
        answer:
          "Yes. PNG supports an alpha channel, so transparent areas stay transparent after the conversion."
      },
      {
        question: "Why would I convert WebP to PNG?",
        answer:
          "Some design tools, email clients and older systems still do not handle WebP correctly, so PNG is the safer interchange format."
      }
    ]
  },
  {
    slug: "webp-to-jpg",
    title: "WebP to JPG Converter",
    description:
      "Convert WebP images to JPG with a custom background for transparent pixels.",
    category: "image",
    inputFormats: ["WEBP"],
    outputFormats: ["JPG"],
    options: ["quality", "resize", "background", "metadata", "rotation"],
    browserSupported: true,
    faq: [
      {
        question: "What happens to transparent pixels?",
        answer:
          "They are composited onto the background colour you select, because JPG has no transparency support."
      },
      {
        question: "Will the result be larger than the original WebP?",
        answer:
          "That is possible. JPG and WebP use different compression strategies, so the output size depends on the source image rather than the format alone."
      }
    ]
  },
  {
    slug: "svg-to-png",
    title: "SVG to PNG Converter",
    description:
      "Render SVG vector graphics into PNG raster images at any size.",
    category: "image",
    inputFormats: ["SVG"],
    outputFormats: ["PNG"],
    options: ["resize", "background", "metadata"],
    browserSupported: false,
    faq: [
      {
        question: "How is the SVG rendered?",
        answer:
          "The vector file is rasterised by a dedicated SVG renderer on the server, so the result matches how a browser would draw it."
      },
      {
        question: "Does SVG to PNG stay sharp?",
        answer:
          "No. PNG is a raster format, so scaling up a small SVG produces soft edges. Export the SVG at the size you actually need."
      },
      {
        question: "Can I set the output size?",
        answer:
          "Yes. Enter a width, a height, or both. When only one value is given the aspect ratio is preserved."
      }
    ]
  },
  {
    slug: "svg-to-jpg",
    title: "SVG to JPG Converter",
    description:
      "Render SVG graphics into JPG images with a solid background colour.",
    category: "image",
    inputFormats: ["SVG"],
    outputFormats: ["JPG"],
    options: ["quality", "resize", "background", "metadata"],
    browserSupported: false,
    faq: [
      {
        question: "Does JPG support SVG transparency?",
        answer:
          "No. Transparent regions of the SVG are filled with the selected background colour before the image is encoded."
      },
      {
        question: "Which background colour should I choose?",
        answer:
          "Match the background of the page or design where the image will be used so the edges blend in."
      }
    ]
  },
  {
    slug: "svg-to-webp",
    title: "SVG to WebP Converter",
    description:
      "Render SVG graphics into compact WebP images for the web.",
    category: "image",
    inputFormats: ["SVG"],
    outputFormats: ["WEBP"],
    options: ["quality", "resize", "background", "metadata"],
    browserSupported: false,
    faq: [
      {
        question: "Can SVG be converted to WebP?",
        answer:
          "Yes. The SVG is rasterised first and then encoded as a WebP image."
      },
      {
        question: "Should I use SVG or WebP on my website?",
        answer:
          "Use SVG for icons and logos that must stay sharp at any size. Use WebP for detailed artwork where a smaller raster file matters."
      }
    ]
  },
  {
    slug: "svg-to-pdf",
    title: "SVG to PDF Converter",
    description:
      "Turn SVG vector graphics into a single page PDF document.",
    category: "image",
    inputFormats: ["SVG"],
    outputFormats: ["PDF"],
    options: ["resize", "background"],
    browserSupported: false,
    faq: [
      {
        question: "Does the PDF contain vector shapes or a picture?",
        answer:
          "The SVG is rasterised at the requested size and embedded as a high quality page, which keeps the file small and predictable."
      },
      {
        question: "Can I combine several SVGs in one PDF?",
        answer:
          "Yes. Add more than one SVG file and each one becomes its own page, in the order shown in the file list."
      }
    ]
  },
  {
    slug: "image-to-pdf",
    title: "Image to PDF Converter",
    description:
      "Combine JPG, PNG, WebP and SVG images into one multi page PDF file.",
    category: "image",
    inputFormats: ["PNG", "JPG", "WEBP", "SVG", "GIF", "BMP", "TIFF", "AVIF"],
    outputFormats: ["PDF"],
    options: ["quality", "resize", "background", "rotation"],
    browserSupported: false,
    faq: [
      {
        question: "How are the pages ordered?",
        answer:
          "Pages follow the order of the files in the list, one page per image, and each page matches the proportions of its image."
      },
      {
        question: "Is there a limit on the number of images?",
        answer:
          "You can add as many images as you like as long as each individual file stays within the upload size limit."
      },
      {
        question: "Can I rotate pages before exporting?",
        answer:
          "Yes. The rotation option is applied to every page before the PDF is assembled."
      }
    ]
  },
  {
    slug: "image-to-svg",
    title: "Image to SVG Converter",
    description:
      "Trace any raster image into real SVG vector paths you can scale, recolour and edit in Illustrator, Figma or Inkscape.",
    category: "image",
    inputFormats: ["PNG", "JPG", "WEBP", "GIF", "BMP", "TIFF", "AVIF"],
    outputFormats: ["SVG"],
    options: ["trace", "resize", "background", "rotation"],
    browserSupported: false,
    faq: [
      {
        question: "Is this a lossless conversion?",
        answer:
          "No. SVG stores geometry, not pixels, so there is no way to translate a bitmap losslessly. This tool vectorises the image instead: it finds colour regions and redraws their outlines as paths, which approximates the original."
      },
      {
        question: "Which images give the best result?",
        answer:
          "Logos, icons, lettering, flat illustrations and line art come out cleanest. Photographs produce thousands of paths, a large file and a soft, posterised result."
      },
      {
        question: "What do the trace options do?",
        answer:
          "Colour regions flattens the image into a set number of flat shapes and suits logos. Greyscale reduces it to two tones for scans and stamps. Line art traces edges into strokes on a transparent background, which suits sketches and maps."
      },
      {
        question: "Why was my image resized before tracing?",
        answer:
          "Tracing cost and file size grow sharply with pixel count, so very large images are reduced first. The trace detail slider lets you trade resolution against file size."
      },
      {
        question: "Can I open the result in a vector editor?",
        answer:
          "Yes. The output is a standard SVG document with a viewBox, so Illustrator, Figma, Inkscape and browsers all open it directly."
      }
    ]
  },
  {
    slug: "png-to-svg",
    title: "PNG to SVG Converter",
    description:
      "Trace a PNG logo or icon into editable SVG vector paths instead of re-encoding it as a bitmap.",
    category: "image",
    inputFormats: ["PNG"],
    outputFormats: ["SVG"],
    options: ["trace", "resize", "background", "rotation"],
    browserSupported: false,
    faq: [
      {
        question: "Why is my traced PNG larger than the original PNG?",
        answer:
          "A PNG stores compressed pixel data. An SVG stores the outline of every region as coordinates, so a detailed image can need far more bytes than the bitmap it came from."
      },
      {
        question: "What happens to transparency?",
        answer:
          "Transparent areas are painted with the background colour you pick before tracing, because the tracer needs solid colour regions to follow."
      },
      {
        question: "Will the result look identical to my PNG?",
        answer:
          "No. Edges are reconstructed from the pixel grid, so results are smooth rather than pixel exact. Fewer colours and higher smoothing give a closer, simpler match."
      }
    ]
  },
  {
    slug: "jpg-to-svg",
    title: "JPG to SVG Converter",
    description:
      "Vectorise a JPG photo, scan or sketch into scalable SVG paths you can edit by hand.",
    category: "image",
    inputFormats: ["JPG"],
    outputFormats: ["SVG"],
    options: ["trace", "resize", "background", "rotation"],
    browserSupported: false,
    faq: [
      {
        question: "Can a photo be turned into a vector?",
        answer:
          "It can be traced, but a photograph has continuous tone rather than flat regions. Expect a posterised result with many paths. For photographs a lossy raster format such as WebP or AVIF is almost always the better output."
      },
      {
        question: "Which trace mode should I pick for a scan?",
        answer:
          "Greyscale for black and white scans and documents. Colour regions for a scan that contains coloured stamps or handwriting."
      },
      {
        question: "How do I keep the file small?",
        answer:
          "Lower the colour count and raise smoothing. Both reduce the number of points per path, at the cost of fidelity."
      }
    ]
  },
  {
    slug: "webp-to-svg",
    title: "WebP to SVG Converter",
    description:
      "Trace a WebP image into clean SVG vector shapes for print, logo work or scale-free web graphics.",
    category: "image",
    inputFormats: ["WEBP"],
    outputFormats: ["SVG"],
    options: ["trace", "resize", "background", "rotation"],
    browserSupported: false,
    faq: [
      {
        question: "When should I prefer SVG over WebP?",
        answer:
          "Choose SVG for logos, icons and lettering that must stay sharp at any size and be recoloured. Stay on WebP for photographs, where a vector cannot help."
      },
      {
        question: "Does the tracer handle small details?",
        answer:
          "Detail controls how aggressively the tracer merges nearby regions. Keep it high for fine line art, lower it for bold shapes."
      },
      {
        question: "Can I trace an SVG that is already vector?",
        answer:
          "No. An SVG is already vector, so it needs no tracing. Use the SVG to PNG tool instead if you need a bitmap."
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
    description: "Convert, resize and re-encode raster and vector images."
  },
  {
    id: "document",
    title: "Documents",
    description: "Convert, merge and protect PDF and office documents."
  },
  {
    id: "data",
    title: "Data",
    description: "Move structured data between CSV, JSON, XML and YAML."
  },
  {
    id: "audio-video",
    title: "Audio & Video",
    description: "Convert and extract audio and video with FFmpeg."
  }
];

export function searchIndexForTool(tool: ToolConfig): string {
  return [
    tool.title,
    tool.description,
    tool.slug.replaceAll("-", " "),
    ...tool.inputFormats,
    ...tool.outputFormats
  ]
    .join(" ")
    .toLowerCase();
}
