import { open, save } from "@tauri-apps/plugin-dialog";

const PDF_FILTER = [{ name: "PDF documents", extensions: ["pdf"] }];

export async function pickPdf(): Promise<string | null> {
  const picked = await open({ multiple: false, filters: PDF_FILTER });
  return typeof picked === "string" ? picked : null;
}

export async function pickPdfs(): Promise<string[]> {
  const picked = await open({ multiple: true, filters: PDF_FILTER });
  if (picked === null) return [];
  return Array.isArray(picked) ? picked : [picked];
}

export async function pickSavePath(
  defaultName: string
): Promise<string | null> {
  return save({ defaultPath: defaultName, filters: PDF_FILTER });
}
