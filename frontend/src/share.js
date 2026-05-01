import { Platform, Alert } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as MailComposer from "expo-mail-composer";
import * as SMS from "expo-sms";

// Convert plain text ticket lines to nice HTML for PDF
export const buildReportHtml = (lines, title = "Reporte POS") => {
  const body = lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("\n");
  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
body { font-family: -apple-system, Roboto, monospace; padding: 24px; color: #0F172A; }
h1 { font-size: 18px; margin: 0 0 12px 0; letter-spacing: 1px; text-align: center; }
.ticket { font-family: ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace; font-size: 12px; line-height: 1.5; border: 1px dashed #94A3B8; padding: 16px; border-radius: 8px; white-space: pre-wrap; }
.foot { text-align: center; color: #64748B; font-size: 10px; margin-top: 16px; }
</style></head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="ticket">${body}</div>
<div class="foot">Generado por POS Pro · ${new Date().toLocaleString()}</div>
</body></html>`;
};

const escapeHtml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

export const generatePdf = async (html) => {
  const { uri } = await Print.printToFileAsync({ html });
  return uri;
};

export const sharePdf = async (uri) => {
  if (Platform.OS === "web") {
    Alert.alert(
      "Web",
      "Compartir nativo está disponible al instalar la app en tu dispositivo. Para web, usa la opción de imprimir."
    );
    return;
  }
  if (!(await Sharing.isAvailableAsync())) {
    Alert.alert("No disponible", "Compartir no está disponible en este dispositivo.");
    return;
  }
  await Sharing.shareAsync(uri, {
    dialogTitle: "Compartir reporte",
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
  });
};

export const emailReport = async (uri, recipient, subject, body) => {
  const available = await MailComposer.isAvailableAsync();
  if (!available) {
    Alert.alert(
      "Correo no disponible",
      "Configura una cuenta de correo en tu dispositivo para enviar el reporte por email."
    );
    return false;
  }
  await MailComposer.composeAsync({
    recipients: recipient ? [recipient] : [],
    subject,
    body,
    attachments: uri ? [uri] : [],
    isHtml: false,
  });
  return true;
};

export const smsReport = async (recipient, body) => {
  const { isAvailable } = await SMS.isAvailableAsync();
  if (!isAvailable) {
    Alert.alert(
      "SMS no disponible",
      "Tu dispositivo no soporta enviar SMS desde la app (revisa que sea un teléfono con plan SMS)."
    );
    return false;
  }
  await SMS.sendSMSAsync(recipient ? [recipient] : [], body);
  return true;
};
