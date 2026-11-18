// pdf-parse's package entry runs a self-test on import, so the app imports its lib file directly.
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
  }

  interface PdfParseOptions {
    pagerender?: (pageData: {
      getTextContent: () => Promise<{ items: { str: string; transform: number[] }[] }>;
    }) => Promise<string>;
  }

  export default function pdfParse(data: Buffer, options?: PdfParseOptions): Promise<PdfParseResult>;
}
