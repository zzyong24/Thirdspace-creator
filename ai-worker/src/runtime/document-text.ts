export type DocFamily = 'pdf' | 'docx' | 'plaintext' | 'unsupported';
const DEFAULT_TOKEN_BUDGET_CHARS = 200000;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export function classifyDocMime(mimeType: string, fileName: string): DocFamily {
    const mime = (mimeType || "").toLowerCase();
    const name = (fileName || "").toLowerCase();
    if (mime === "application/pdf" || name.endsWith(".pdf"))
        return "pdf";
    if (mime === DOCX_MIME || name.endsWith(".docx"))
        return "docx";
    if (mime.startsWith("text/") ||
        name.endsWith(".md") ||
        name.endsWith(".markdown") ||
        name.endsWith(".txt")) {
        return "plaintext";
    }
    return "unsupported";
}
export function truncateForSummary(text: string, budget: number = DEFAULT_TOKEN_BUDGET_CHARS): {
    text: string;
    wasTruncated: boolean;
} {
    if (text.length <= budget)
        return { text, wasTruncated: false };
    return { text: text.slice(0, budget), wasTruncated: true };
}
/** 只读文本层，不执行文档脚本或宏；资源释放在 finally。 */
export async function extractDocumentText(family: Exclude<DocFamily, 'unsupported'>, bytes: Uint8Array, signal: AbortSignal) {
    signal.throwIfAborted();
    let text: string;
    if (family === 'plaintext')
        text = new TextDecoder('utf-8').decode(bytes);
    else if (family === 'docx') {
        const mammoth = (await import('mammoth')).default;
        signal.throwIfAborted();
        text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    }
    else {
        const { PDFParse } = await import('pdf-parse');
        signal.throwIfAborted();
        const parser = new PDFParse({ data: bytes });
        try {
            text = (await parser.getText()).text;
        }
        finally {
            await parser.destroy();
        }
    }
    signal.throwIfAborted();
    return text;
}
