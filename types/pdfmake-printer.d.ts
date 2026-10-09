// Node-side printer of pdfmake (src/printer.js). @types/pdfmake only covers the browser build.
declare module 'pdfmake' {
  import type { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';

  class PdfPrinter {
    constructor(fontDescriptors: TFontDictionary);
    createPdfKitDocument(docDefinition: TDocumentDefinitions, options?: Record<string, unknown>): PDFKit.PDFDocument;
  }
  export = PdfPrinter;
}
