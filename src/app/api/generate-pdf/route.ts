import { NextRequest, NextResponse } from "next/server";
import { generatePdf } from "@/lib/engine/pdf-generator";
import { getTemplates } from "@/lib/storage";
import { DocumentTemplate, DocumentData } from "@/types/template";
import { DEFAULT_TEMPLATES } from "@/lib/templates";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let template: DocumentTemplate | undefined = body.template;
    const templateId = body.templateId;
    let data: DocumentData = body.data;

    if (!template && templateId) {
      const templates = getTemplates();
      template = templates.find((t) => t.id === templateId);
      if (!template && DEFAULT_TEMPLATES[templateId]) {
        template = DEFAULT_TEMPLATES[templateId].template;
      }
    }

    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template not provided or found" },
        { status: 400 }
      );
    }

    if (!data || Object.keys(data).length === 0) {
      if (template.id && DEFAULT_TEMPLATES[template.id]) {
        data = DEFAULT_TEMPLATES[template.id].sampleData;
      } else {
        data = {};
      }
    }

    const pdfBytes = await generatePdf(template, data);

    const filename = `${(template.name || "document").toLowerCase().replace(/[^a-z0-9]/g, "-")}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(pdfBytes.byteLength),
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: any) {
    console.error("PDF generation failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
