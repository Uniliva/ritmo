import JSZip from "jszip";

export type Chapter = {
  id: string;
  title: string;
  paragraphs: Array<{ text: string; kind: "heading" | "paragraph" | "quote" | "list" }>;
};

export type ParsedBook = {
  title: string;
  chapters: Chapter[];
};

function parseXml(xml: string, label: string): Document {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error(`Não foi possível ler a estrutura ${label} deste EPUB.`);
  }
  return document;
}

function normalizeArchivePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function resolveArchivePath(baseFile: string, href: string): string {
  const base = baseFile.split("/").slice(0, -1).join("/");
  let pathname = href.split(/[?#]/, 1)[0] ?? href;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // Keep the original path when a book contains malformed URL escaping.
  }
  return normalizeArchivePath(`${base}/${pathname}`);
}

function textFrom(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function chapterParagraphs(document: Document): Chapter["paragraphs"] {
  const body = document.body;
  if (!body) return [];

  const blocks = Array.from(
    body.querySelectorAll("h1, h2, h3, h4, h5, h6, p, blockquote, pre, li"),
  ).filter((element) => {
    let parent = element.parentElement;
    while (parent && parent !== body) {
      if (parent.matches("h1, h2, h3, h4, h5, h6, p, blockquote, pre, li")) {
        return false;
      }
      parent = parent.parentElement;
    }
    return true;
  });

  const paragraphs = blocks
    .map((element) => {
      const text = textFrom(element);
      if (!text) return null;
      const tag = element.tagName.toLowerCase();
      const kind = /^h[1-6]$/.test(tag)
        ? "heading"
        : tag === "blockquote"
          ? "quote"
          : tag === "li"
            ? "list"
            : "paragraph";
      return { text, kind } as const;
    })
    .filter((paragraph): paragraph is NonNullable<typeof paragraph> => paragraph !== null);

  if (paragraphs.length) return paragraphs;

  return (body.innerText || body.textContent || "")
    .split(/\n+/)
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((text) => ({ text, kind: "paragraph" as const }));
}

export async function readEpub(file: File): Promise<ParsedBook> {
  const archive = await JSZip.loadAsync(file);
  const container = archive.file("META-INF/container.xml");
  if (!container) throw new Error("Este arquivo não contém uma estrutura EPUB válida.");

  const containerDocument = parseXml(await container.async("text"), "container");
  const opfPath = containerDocument.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new Error("Não foi possível localizar o conteúdo do EPUB.");

  const packageFile = archive.file(opfPath);
  if (!packageFile) throw new Error("O arquivo principal deste EPUB não foi encontrado.");
  const packageDocument = parseXml(await packageFile.async("text"), "principal");

  const title =
    packageDocument.getElementsByTagNameNS("*", "title")[0]?.textContent?.trim() ||
    file.name.replace(/\.epub$/i, "");
  const manifest = new Map<string, string>();
  for (const item of Array.from(packageDocument.getElementsByTagName("item"))) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) manifest.set(id, href);
  }

  const itemRefs = Array.from(packageDocument.getElementsByTagName("itemref"));
  const chapters: Chapter[] = [];

  for (const [index, itemRef] of itemRefs.entries()) {
    const idref = itemRef.getAttribute("idref");
    const href = idref ? manifest.get(idref) : undefined;
    if (!href) continue;

    const chapterPath = resolveArchivePath(opfPath, href);
    const chapterFile = archive.file(chapterPath);
    if (!chapterFile) continue;

    const html = await chapterFile.async("text");
    const chapterDocument = new DOMParser().parseFromString(html, "text/html");
    const paragraphs = chapterParagraphs(chapterDocument);
    if (!paragraphs.length) continue;

    const heading = paragraphs.find((paragraph) => paragraph.kind === "heading")?.text;
    const documentTitle = chapterDocument.title.trim();
    const filename = href.split(/[/?#]/).filter(Boolean).at(-1)?.replace(/\.[^.]+$/, "");
    chapters.push({
      id: `${idref ?? "chapter"}-${index}`,
      title: heading || documentTitle || filename || `Capítulo ${chapters.length + 1}`,
      paragraphs,
    });
  }

  if (!chapters.length) {
    throw new Error("Não encontrei capítulos legíveis neste EPUB.");
  }

  return { title, chapters };
}
