export function parseDestinationGroupUrl(value) {
  const input = String(value ?? "").trim();
  if (!input) return { valid: false, reason: "URL não informada." };

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return { valid: false, reason: "O texto informado não é uma URL válida." };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (parsed.protocol !== "https:" || !["instagram.com", "www.instagram.com", "m.instagram.com"].includes(hostname)) {
    return { valid: false, reason: "A URL precisa pertencer ao domínio oficial instagram.com e usar HTTPS." };
  }

  const match = parsed.pathname.match(/^\/direct\/t\/([a-z0-9_-]+)\/?$/i);
  if (!match) {
    return { valid: false, reason: "O link precisa apontar para uma conversa específica, no formato /direct/t/ID/." };
  }

  const threadId = match[1];
  return {
    valid: true,
    threadId,
    url: `https://www.instagram.com/direct/t/${threadId}/`
  };
}
